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
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS responders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('police', 'fire', 'ambulance')),
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        hospital_id UUID,
        admin_id UUID,
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
        responder_type VARCHAR(50),
        incident_report TEXT,
        status VARCHAR(50) DEFAULT 'created' CHECK (status IN ('created','dispatched','in_progress','resolved')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS hospital_capacity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hospital_name VARCHAR(255) NOT NULL,
        total_beds INTEGER DEFAULT 0,
        available_beds INTEGER DEFAULT 0,
        admin_id UUID,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Migrations: add new columns to existing tables
    await client.query(`
      ALTER TABLE responders ADD COLUMN IF NOT EXISTS admin_id UUID;
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS responder_type VARCHAR(50);
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_report TEXT;
    `);

    // Backfill responder_type for existing incidents that have an assigned unit
    await client.query(`
      UPDATE incidents i
      SET responder_type = r.type
      FROM responders r
      WHERE i.assigned_unit = r.id
        AND i.responder_type IS NULL;
    `);

    // Seed Accra-area responders if empty
    const count = await client.query("SELECT COUNT(*) FROM responders");
    if (parseInt(count.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO responders (name, type, latitude, longitude) VALUES
          ('Accra Central Police Station',  'police',    5.5502, -0.2174),
          ('Kaneshie Police Station',       'police',    5.5570, -0.2380),
          ('Accra Fire Service HQ',         'fire',      5.5600, -0.2050),
          ('Tema Fire Station',             'fire',      5.6698, -0.0166),
          ('Korle Bu Ambulance Unit',       'ambulance', 5.5363, -0.2280),
          ('37 Military Hospital Ambulance','ambulance', 5.5740, -0.1740);
      `);
      console.log("[incident-db] Seeded responders");
    }

    // Seed hospital capacity if empty
    const capCount = await client.query("SELECT COUNT(*) FROM hospital_capacity");
    if (parseInt(capCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO hospital_capacity (hospital_name, total_beds, available_beds) VALUES
          ('Korle Bu Teaching Hospital',       1200, 340),
          ('37 Military Hospital',              400,  85),
          ('Greater Accra Regional Hospital',   600, 120);
      `);
      console.log("[incident-db] Seeded hospital capacity");
    }

    console.log("[incident-db] Schema ready");
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
