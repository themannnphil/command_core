const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "incident_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "secret",
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS responders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('police', 'fire', 'ambulance')),
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        hospital_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        citizen_name VARCHAR(255) NOT NULL,
        incident_type VARCHAR(100) NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        notes TEXT,
        created_by UUID NOT NULL,
        assigned_unit UUID REFERENCES responders(id),
        status VARCHAR(50) DEFAULT 'created' CHECK (status IN ('created','dispatched','in_progress','resolved')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed some Accra-area responders if table is empty
    const count = await client.query("SELECT COUNT(*) FROM responders");
    if (parseInt(count.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO responders (name, type, latitude, longitude) VALUES
          ('Accra Central Police Station', 'police', 5.5502, -0.2174),
          ('Kaneshie Police Station',      'police', 5.5570, -0.2380),
          ('Accra Fire Service HQ',        'fire',   5.5600, -0.2050),
          ('Tema Fire Station',            'fire',   5.6698, -0.0166),
          ('Korle Bu Ambulance Unit',      'ambulance', 5.5363, -0.2280),
          ('37 Military Hospital Ambulance','ambulance', 5.5740, -0.1740);
      `);
      console.log("[incident-db] Seeded responders");
    }

    console.log("[incident-db] Schema ready");
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
