const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "dispatch_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "secret",
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_code VARCHAR(100) UNIQUE NOT NULL,
        responder_id UUID NOT NULL,
        responder_name VARCHAR(255),
        vehicle_type VARCHAR(50) CHECK (vehicle_type IN ('ambulance','police','fire')),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        status VARCHAR(50) DEFAULT 'idle' CHECK (status IN ('idle','dispatched','on_scene','returning')),
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dispatches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL,
        vehicle_id UUID REFERENCES vehicles(id),
        responder_name VARCHAR(255),
        incident_type VARCHAR(100),
        incident_lat DECIMAL(10,7),
        incident_lon DECIMAL(10,7),
        dispatched_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'dispatched'
      );

      CREATE TABLE IF NOT EXISTS location_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id),
        incident_id UUID,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        recorded_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[dispatch-db] Schema ready");
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
