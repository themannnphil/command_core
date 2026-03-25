const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "analytics_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "secret",
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS incident_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL,
        incident_type VARCHAR(100),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        assigned_unit_name VARCHAR(255),
        assigned_unit_type VARCHAR(50),
        distance_km DECIMAL(6,2),
        status VARCHAR(50),
        received_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS status_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL,
        status VARCHAR(50),
        received_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS response_times (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL,
        dispatched_at TIMESTAMP,
        resolved_at TIMESTAMP,
        duration_minutes DECIMAL(8,2)
      );
    `);
    console.log("[analytics-db] Schema ready");
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
