require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { pool, initDB } = require("./db");
const mqttClient = require("./mqtt");

const app = express();
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "devjwtsecret";

// ─── Middleware: authenticate ───────────────────────────────
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ─── Haversine distance (km) ────────────────────────────────
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Map incident type → responder type
const incidentTypeMap = {
  robbery: "police",
  crime: "police",
  assault: "police",
  theft: "police",
  fire: "fire",
  explosion: "fire",
  "gas leak": "fire",
  medical: "ambulance",
  accident: "ambulance",
  "heart attack": "ambulance",
  injury: "ambulance",
};

const getResponderType = (incidentType) => {
  const lower = incidentType.toLowerCase();
  for (const [key, type] of Object.entries(incidentTypeMap)) {
    if (lower.includes(key)) return type;
  }
  return "police"; // default
};

// Find nearest available responder
const findNearestResponder = async (incidentLat, incidentLon, responderType) => {
  const result = await pool.query(
    "SELECT * FROM responders WHERE type = $1 AND is_available = TRUE",
    [responderType]
  );
  if (result.rows.length === 0) return null;

  let nearest = null;
  let minDist = Infinity;

  for (const r of result.rows) {
    const dist = haversine(
      incidentLat, incidentLon,
      parseFloat(r.latitude), parseFloat(r.longitude)
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = { ...r, distanceKm: dist.toFixed(2) };
    }
  }
  return nearest;
};

// ─── POST /incidents ───────────────────────────────────────
app.post("/incidents", authenticate, async (req, res) => {
  const { citizen_name, incident_type, latitude, longitude, notes } = req.body;
  if (!citizen_name || !incident_type || !latitude || !longitude) {
    return res.status(400).json({ error: "citizen_name, incident_type, latitude, longitude required" });
  }

  try {
    const responderType = getResponderType(incident_type);
    const nearest = await findNearestResponder(
      parseFloat(latitude),
      parseFloat(longitude),
      responderType
    );

    // Create the incident
    const incidentResult = await pool.query(
      `INSERT INTO incidents (citizen_name, incident_type, latitude, longitude, notes, created_by, assigned_unit, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        citizen_name,
        incident_type,
        latitude,
        longitude,
        notes || null,
        req.user.id,
        nearest?.id || null,
        nearest ? "dispatched" : "created",
      ]
    );
    const incident = incidentResult.rows[0];

    // Mark responder as unavailable
    if (nearest) {
      await pool.query("UPDATE responders SET is_available = FALSE WHERE id = $1", [nearest.id]);
    }

    // ── MQTT PUBLISH: incidents/new ──────────────────────
    mqttClient.publish("incidents/new", {
      incidentId: incident.id,
      incidentType: incident_type,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      citizenName: citizen_name,
      assignedUnit: nearest
        ? {
            id: nearest.id,
            name: nearest.name,
            type: nearest.type,
            distanceKm: nearest.distanceKm,
          }
        : null,
      status: incident.status,
      createdAt: incident.created_at,
      dispatchedBy: req.user.id,
    });

    // ── MQTT PUBLISH: incidents/{id}/status ─────────────
    mqttClient.publish(`incidents/${incident.id}/status`, {
      incidentId: incident.id,
      status: incident.status,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      incident,
      assignedUnit: nearest || null,
      message: nearest
        ? `Dispatched ${nearest.name} (${nearest.distanceKm} km away)`
        : "No available responders. Incident logged.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /incidents/open ───────────────────────────────────
app.get("/incidents/open", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, r.name as responder_name, r.type as responder_type
       FROM incidents i
       LEFT JOIN responders r ON i.assigned_unit = r.id
       WHERE i.status != 'resolved'
       ORDER BY i.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /incidents/:id ────────────────────────────────────
app.get("/incidents/:id", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, r.name as responder_name, r.type as responder_type, r.latitude as responder_lat, r.longitude as responder_lon
       FROM incidents i
       LEFT JOIN responders r ON i.assigned_unit = r.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /incidents/:id/status ─────────────────────────────
app.put("/incidents/:id/status", authenticate, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["created", "dispatched", "in_progress", "resolved"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
  }
  try {
    const result = await pool.query(
      "UPDATE incidents SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });

    const incident = result.rows[0];

    // If resolved, free up the responder
    if (status === "resolved" && incident.assigned_unit) {
      await pool.query("UPDATE responders SET is_available = TRUE WHERE id = $1", [incident.assigned_unit]);
    }

    // ── MQTT PUBLISH: status update ──────────────────────
    mqttClient.publish(`incidents/${req.params.id}/status`, {
      incidentId: req.params.id,
      status,
      updatedBy: req.user.id,
      timestamp: new Date().toISOString(),
    });

    res.json({ incident, message: `Status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /incidents/:id/assign ─────────────────────────────
app.put("/incidents/:id/assign", authenticate, async (req, res) => {
  const { unit_id } = req.body;
  try {
    const result = await pool.query(
      "UPDATE incidents SET assigned_unit=$1, status='dispatched', updated_at=NOW() WHERE id=$2 RETURNING *",
      [unit_id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });
    await pool.query("UPDATE responders SET is_available=FALSE WHERE id=$1", [unit_id]);

    mqttClient.publish(`incidents/${req.params.id}/status`, {
      incidentId: req.params.id,
      status: "dispatched",
      assignedUnit: unit_id,
      timestamp: new Date().toISOString(),
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /responders ───────────────────────────────────────
app.get("/responders", authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM responders ORDER BY type, name");
  res.json(result.rows);
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "incident-service" }));

// ─── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
const start = async () => {
  for (let i = 0; i < 10; i++) {
    try {
      await initDB();
      break;
    } catch {
      console.log(`[incident] DB not ready, retrying (${i + 1}/10)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  mqttClient.connect();
  app.listen(PORT, () => console.log(`[incident-service] Running on :${PORT}`));
};
start();