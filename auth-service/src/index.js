const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { pool, initDB } = require("./db");
const { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } = require("./jwt");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors()); // handle preflight on every route
app.use(express.json());

// ─── Middleware: authenticate ───────────────────────────────
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    req.user = verifyAccessToken(header.split(" ")[1]);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ─── POST /auth/register ───────────────────────────────────
app.post("/auth/register", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role are required" });
  }
  const validRoles = ["system_admin", "hospital_admin", "police_admin", "fire_admin", "ambulance_driver"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
  }
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, created_at",
      [name, email, password_hash, role]
    );
    res.status(201).json({ message: "User registered", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/login ──────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1 AND is_active = TRUE", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)",
      [user.id, refreshToken, expiresAt]
    );

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /auth/refresh-token ──────────────────────────────
app.post("/auth/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await pool.query(
      "SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()",
      [refreshToken]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: "Refresh token invalid or expired" });
    }
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [payload.id]);
    const user = userResult.rows[0];
    const newAccessToken = generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ─── GET /auth/profile ─────────────────────────────────────
app.get("/auth/profile", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /auth/users (admin only) ─────────────────────────
app.get("/auth/users", authenticate, async (req, res) => {
  if (req.user.role !== "system_admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const result = await pool.query(
    "SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

// ─── Health check ──────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "auth-service" }));

// ─── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const start = async () => {
  // Retry DB connection (container startup race)
  for (let i = 0; i < 10; i++) {
    try {
      await initDB();
      break;
    } catch (err) {
      console.log(`[auth] DB not ready, retrying (${i + 1}/10)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`[auth-service] Running on :${PORT}`));
};
start();
