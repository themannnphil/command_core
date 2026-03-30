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

// ─── POST /vehicles/register ───────────────────────────────
app.post("/vehicles/register", authenticate, async (req, res) => {
  const { vehicle_code, responder_id, responder_name, vehicle_type } = req.body;
  if (!vehicle_code || !responder_id || !vehicle_type) {
    return res.status(400).json({ error: "vehicle_code, responder_id, vehicle_type required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO vehicles (vehicle_code, responder_id, responder_name, vehicle_type)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vehicle_code) DO UPDATE SET responder_name=$3, vehicle_type=$4
       RETURNING *`,
      [vehicle_code, responder_id, responder_name || null, vehicle_type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /vehicles ─────────────────────────────────────────
app.get("/vehicles", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM vehicles ORDER BY last_updated DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /vehicles/:id/location ────────────────────────────
app.get("/vehicles/:id/location", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, vehicle_code, responder_name, vehicle_type, latitude, longitude, status, last_updated FROM vehicles WHERE id=$1",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Vehicle not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /vehicles/:code/location (driver pushes GPS) ─────
// This endpoint receives GPS from the driver app and publishes to MQTT
app.post("/vehicles/:code/location", authenticate, async (req, res) => {
  const { latitude, longitude, incidentId } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: "latitude and longitude required" });
  }
  try {
    // Publish to MQTT — this is what the driver app would call
    mqttClient.publish(`vehicles/${req.params.code}/location`, {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      incidentId: incidentId || null,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "Location published", vehicleCode: req.params.code });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /vehicles/:code/history ───────────────────────────
app.get("/vehicles/:code/history", authenticate, async (req, res) => {
  try {
    const vRes = await pool.query("SELECT id FROM vehicles WHERE vehicle_code=$1", [req.params.code]);
    if (vRes.rows.length === 0) return res.status(404).json({ error: "Vehicle not found" });

    const history = await pool.query(
      "SELECT * FROM location_history WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 100",
      [vRes.rows[0].id]
    );
    res.json(history.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /dispatches ───────────────────────────────────────
app.get("/dispatches", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM dispatches ORDER BY dispatched_at DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /dispatches/:incidentId ───────────────────────────
app.get("/dispatches/:incidentId", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, v.latitude, v.longitude, v.last_updated, v.vehicle_code
       FROM dispatches d
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE d.incident_id=$1`,
      [req.params.incidentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Dispatch not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "dispatch-service" }));

// ─── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
const start = async () => {
  for (let i = 0; i < 10; i++) {
    try {
      await initDB();
      break;
    } catch {
      console.log(`[dispatch] DB not ready, retrying (${i + 1}/10)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  mqttClient.connect();
  app.listen(PORT, () => console.log(`[dispatch-service] Running on :${PORT}`));
};
start();
