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

// ─── GET /analytics/response-times ────────────────────────
app.get("/analytics/response-times", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_count,
        ROUND(AVG(duration_minutes) FILTER (WHERE resolved_at IS NOT NULL), 2) AS avg_minutes,
        ROUND(MIN(duration_minutes) FILTER (WHERE resolved_at IS NOT NULL), 2) AS min_minutes,
        ROUND(MAX(duration_minutes) FILTER (WHERE resolved_at IS NOT NULL), 2) AS max_minutes
      FROM response_times
    `);

    const breakdown = await pool.query(`
      SELECT
        ie.assigned_unit_type AS responder_type,
        COUNT(*) AS total,
        ROUND(AVG(rt.duration_minutes), 2) AS avg_minutes
      FROM response_times rt
      JOIN incident_events ie ON rt.incident_id = ie.incident_id
      WHERE rt.resolved_at IS NOT NULL
      GROUP BY ie.assigned_unit_type
      ORDER BY avg_minutes ASC
    `);

    res.json({
      summary: result.rows[0],
      byResponderType: breakdown.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /analytics/incidents-by-region ───────────────────
app.get("/analytics/incidents-by-region", authenticate, async (req, res) => {
  try {
    // Round coords to 2 decimal places as a proxy for region (~1km grid)
    const result = await pool.query(`
      SELECT
        ROUND(latitude::numeric, 2) AS region_lat,
        ROUND(longitude::numeric, 2) AS region_lon,
        incident_type,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved
      FROM incident_events
      GROUP BY region_lat, region_lon, incident_type
      ORDER BY count DESC
    `);

    const byType = await pool.query(`
      SELECT incident_type, COUNT(*) AS count
      FROM incident_events
      GROUP BY incident_type
      ORDER BY count DESC
    `);

    res.json({
      byRegion: result.rows,
      byType: byType.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /analytics/resource-utilization ──────────────────
app.get("/analytics/resource-utilization", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        assigned_unit_name AS unit_name,
        assigned_unit_type AS unit_type,
        COUNT(*) AS total_dispatches,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status != 'resolved') AS active
      FROM incident_events
      WHERE assigned_unit_name IS NOT NULL
      GROUP BY assigned_unit_name, assigned_unit_type
      ORDER BY total_dispatches DESC
    `);

    const statusSummary = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM incident_events
      GROUP BY status
    `);

    res.json({
      responderUtilization: result.rows,
      statusSummary: statusSummary.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /analytics/summary ────────────────────────────────
app.get("/analytics/summary", authenticate, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM incident_events");
    const resolved = await pool.query("SELECT COUNT(*) FROM incident_events WHERE status='resolved'");
    const today = await pool.query(
      "SELECT COUNT(*) FROM incident_events WHERE received_at >= CURRENT_DATE"
    );
    const avgResponse = await pool.query(
      "SELECT ROUND(AVG(duration_minutes),2) as avg FROM response_times WHERE resolved_at IS NOT NULL"
    );

    res.json({
      totalIncidents: parseInt(total.rows[0].count),
      resolvedIncidents: parseInt(resolved.rows[0].count),
      incidentsToday: parseInt(today.rows[0].count),
      avgResponseMinutes: avgResponse.rows[0].avg || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "analytics-service" }));

// ─── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3004;
const start = async () => {
  for (let i = 0; i < 10; i++) {
    try {
      await initDB();
      break;
    } catch {
      console.log(`[analytics] DB not ready, retrying (${i + 1}/10)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  mqttClient.connect();
  app.listen(PORT, () => console.log(`[analytics-service] Running on :${PORT}`));
};
start();
