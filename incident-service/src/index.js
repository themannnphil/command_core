const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { pool, initDB } = require("./db");
const mqttClient = require("./mqtt");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "devjwtsecret";

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

// ─── Role → department type mapping ───────────────────────
const ROLE_DEPT_TYPE = {
  hospital_admin: "ambulance",
  police_admin:   "police",
  fire_admin:     "fire",
};
const getDeptType = (role) => ROLE_DEPT_TYPE[role] || null;

const ADMIN_ROLES = ["system_admin", "hospital_admin", "police_admin", "fire_admin"];

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
  robbery: "police", crime: "police", assault: "police", theft: "police",
  fire: "fire", explosion: "fire", "gas leak": "fire",
  medical: "ambulance", accident: "ambulance", "heart attack": "ambulance", injury: "ambulance",
};

const getResponderType = (incidentType) => {
  const lower = incidentType.toLowerCase();
  for (const [key, type] of Object.entries(incidentTypeMap)) {
    if (lower.includes(key)) return type;
  }
  return "police";
};

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
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Admin role required to log incidents" });
  }
  const { citizen_name, incident_type, latitude, longitude, notes } = req.body;
  if (!citizen_name || !incident_type || !latitude || !longitude) {
    return res.status(400).json({ error: "citizen_name, incident_type, latitude, longitude required" });
  }

  try {
    const responderType = getResponderType(incident_type);
    const nearest = await findNearestResponder(parseFloat(latitude), parseFloat(longitude), responderType);

    const incidentResult = await pool.query(
      `INSERT INTO incidents
         (citizen_name, incident_type, latitude, longitude, notes, created_by,
          assigned_unit, responder_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        citizen_name, incident_type, latitude, longitude,
        notes || null, req.user.id,
        nearest?.id || null,
        responderType,
        nearest ? "dispatched" : "created",
      ]
    );
    const incident = incidentResult.rows[0];

    if (nearest) {
      await pool.query("UPDATE responders SET is_available = FALSE WHERE id = $1", [nearest.id]);
    }

    mqttClient.publish("incidents/new", {
      incidentId: incident.id,
      incidentType: incident_type,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      citizenName: citizen_name,
      assignedUnit: nearest
        ? { id: nearest.id, name: nearest.name, type: nearest.type, distanceKm: nearest.distanceKm }
        : null,
      status: incident.status,
      createdAt: incident.created_at,
      dispatchedBy: req.user.id,
    });

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
    const deptType = getDeptType(req.user.role);
    const params = [];
    let where = "WHERE i.status != 'resolved'";
    if (deptType) {
      params.push(deptType);
      where += ` AND i.responder_type = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT i.*, r.name as responder_name, r.latitude as responder_lat, r.longitude as responder_lon
       FROM incidents i
       LEFT JOIN responders r ON i.assigned_unit = r.id
       ${where}
       ORDER BY i.created_at DESC`,
      params
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
      `SELECT i.*, r.name as responder_name, r.latitude as responder_lat, r.longitude as responder_lon
       FROM incidents i
       LEFT JOIN responders r ON i.assigned_unit = r.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });
    const inc = result.rows[0];

    // Department access check
    const deptType = getDeptType(req.user.role);
    if (deptType && inc.responder_type && inc.responder_type !== deptType) {
      return res.status(403).json({ error: "Access denied — incident outside your department" });
    }

    res.json(inc);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /incidents/:id/report ─────────────────────────────
app.put("/incidents/:id/report", authenticate, async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Admin role required" });
  }
  const { incident_report } = req.body;
  if (!incident_report?.trim()) {
    return res.status(400).json({ error: "incident_report is required" });
  }
  try {
    // Verify department access
    const check = await pool.query("SELECT responder_type, status FROM incidents WHERE id=$1", [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Incident not found" });
    const deptType = getDeptType(req.user.role);
    if (deptType && check.rows[0].responder_type && check.rows[0].responder_type !== deptType) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (check.rows[0].status === "resolved") {
      return res.status(400).json({ error: "Cannot update report on a resolved incident" });
    }

    const result = await pool.query(
      "UPDATE incidents SET incident_report=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [incident_report.trim(), req.params.id]
    );
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
    // Require incident report before resolving
    if (status === "resolved") {
      const check = await pool.query(
        "SELECT incident_report, responder_type FROM incidents WHERE id=$1",
        [req.params.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: "Incident not found" });

      const deptType = getDeptType(req.user.role);
      if (deptType && check.rows[0].responder_type && check.rows[0].responder_type !== deptType) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!check.rows[0].incident_report?.trim()) {
        return res.status(400).json({ error: "An incident report must be filed before resolving this incident" });
      }
    }

    const result = await pool.query(
      "UPDATE incidents SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });

    const incident = result.rows[0];

    if (status === "resolved" && incident.assigned_unit) {
      await pool.query("UPDATE responders SET is_available = TRUE WHERE id = $1", [incident.assigned_unit]);
    }

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
  try {
    const deptType = getDeptType(req.user.role);
    if (deptType) {
      const result = await pool.query(
        "SELECT * FROM responders WHERE type=$1 ORDER BY name",
        [deptType]
      );
      return res.json(result.rows);
    }
    const result = await pool.query("SELECT * FROM responders ORDER BY type, name");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /responders ──────────────────────────────────────
app.post("/responders", authenticate, async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Admin role required" });
  }
  const { name, type, latitude, longitude } = req.body;
  if (!name || !type || !latitude || !longitude) {
    return res.status(400).json({ error: "name, type, latitude, longitude required" });
  }
  const allowedType = getDeptType(req.user.role);
  if (allowedType && type !== allowedType) {
    return res.status(403).json({ error: `Your role can only manage ${allowedType} responders` });
  }
  try {
    const result = await pool.query(
      "INSERT INTO responders (name, type, latitude, longitude, admin_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, type, latitude, longitude, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /responders/:id/availability ──────────────────────
app.put("/responders/:id/availability", authenticate, async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Admin role required" });
  }
  const { is_available } = req.body;
  if (typeof is_available !== "boolean") {
    return res.status(400).json({ error: "is_available (boolean) required" });
  }
  try {
    const responder = await pool.query("SELECT * FROM responders WHERE id=$1", [req.params.id]);
    if (responder.rows.length === 0) return res.status(404).json({ error: "Responder not found" });

    const deptType = getDeptType(req.user.role);
    if (deptType && responder.rows[0].type !== deptType) {
      return res.status(403).json({ error: "Access denied — responder outside your department" });
    }

    const result = await pool.query(
      "UPDATE responders SET is_available=$1 WHERE id=$2 RETURNING *",
      [is_available, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /responders/:id ─────────────────────────────────
app.delete("/responders/:id", authenticate, async (req, res) => {
  if (!ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Admin role required" });
  }
  try {
    const responder = await pool.query("SELECT * FROM responders WHERE id=$1", [req.params.id]);
    if (responder.rows.length === 0) return res.status(404).json({ error: "Responder not found" });

    const deptType = getDeptType(req.user.role);
    if (deptType && responder.rows[0].type !== deptType) {
      return res.status(403).json({ error: "Access denied" });
    }

    await pool.query("DELETE FROM responders WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /hospitals/capacity ───────────────────────────────
app.get("/hospitals/capacity", authenticate, async (req, res) => {
  if (!["system_admin", "hospital_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }
  try {
    const result = await pool.query("SELECT * FROM hospital_capacity ORDER BY hospital_name");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /hospitals/capacity ──────────────────────────────
app.post("/hospitals/capacity", authenticate, async (req, res) => {
  if (!["system_admin", "hospital_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { hospital_name, total_beds, available_beds } = req.body;
  if (!hospital_name) return res.status(400).json({ error: "hospital_name required" });
  try {
    const result = await pool.query(
      "INSERT INTO hospital_capacity (hospital_name, total_beds, available_beds, admin_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [hospital_name, total_beds || 0, available_beds || 0, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /hospitals/capacity/:id ───────────────────────────
app.put("/hospitals/capacity/:id", authenticate, async (req, res) => {
  if (!["system_admin", "hospital_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const { total_beds, available_beds } = req.body;
  try {
    const result = await pool.query(
      "UPDATE hospital_capacity SET total_beds=$1, available_beds=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
      [total_beds, available_beds, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
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
