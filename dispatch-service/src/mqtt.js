const mqtt = require("mqtt");
const { pool } = require("./db");

let client = null;

const connect = () => {
  const host = process.env.MQTT_HOST || "localhost";
  const port = process.env.MQTT_PORT || 1883;
  const isProduction = process.env.NODE_ENV === "production";
  const url = isProduction ? `wss://${host}` : `mqtt://${host}:${port}`;

  console.log(`[dispatch-service] Connecting to MQTT at ${url}`);

  client = mqtt.connect(url, {
    clientId: `dispatch-service-${Date.now()}`,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    rejectUnauthorized: false,
  });

  client.on("connect", () => {
    console.log("[dispatch-service] MQTT connected to broker");

    // ── SUBSCRIBE to incident events ──────────────────────
    client.subscribe("incidents/new", { qos: 1 }, (err) => {
      if (err) console.error("[MQTT] Subscribe error:", err);
      else console.log("[MQTT] Subscribed → incidents/new");
    });

    // ── SUBSCRIBE to all vehicle location updates ─────────
    client.subscribe("vehicles/+/location", { qos: 1 }, (err) => {
      if (err) console.error("[MQTT] Subscribe error:", err);
      else console.log("[MQTT] Subscribed → vehicles/+/location");
    });

    // ── SUBSCRIBE to all incident status updates ──────────
    client.subscribe("incidents/+/status", { qos: 1 }, (err) => {
      if (err) console.error("[MQTT] Subscribe error:", err);
      else console.log("[MQTT] Subscribed → incidents/+/status");
    });
  });

  client.on("message", async (topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      console.error("[MQTT] Could not parse message on topic:", topic);
      return;
    }

    console.log(`[MQTT] Message received on ${topic}`);

    // ── Handler: new incident dispatched ──────────────────
    if (topic === "incidents/new") {
      await handleNewIncident(payload);
      return;
    }

    // ── Handler: vehicle/{id}/location ────────────────────
    const locationMatch = topic.match(/^vehicles\/([^/]+)\/location$/);
    if (locationMatch) {
      await handleVehicleLocation(locationMatch[1], payload);
      return;
    }

    // ── Handler: incidents/{id}/status ────────────────────
    const statusMatch = topic.match(/^incidents\/([^/]+)\/status$/);
    if (statusMatch) {
      await handleIncidentStatus(statusMatch[1], payload);
      return;
    }
  });

  client.on("error", (err) => console.error("[dispatch-service] MQTT error:", err.message));
  client.on("reconnect", () => console.log("[dispatch-service] MQTT reconnecting..."));
};

// ─── Handler: record new dispatch ─────────────────────────
const handleNewIncident = async (payload) => {
  try {
    if (!payload.assignedUnit) {
      console.log("[dispatch] No unit assigned for incident", payload.incidentId);
      return;
    }

    // Upsert the vehicle record based on responder id
    const vehicleResult = await pool.query(
      `INSERT INTO vehicles (vehicle_code, responder_id, responder_name, vehicle_type, status)
       VALUES ($1, $2, $3, $4, 'dispatched')
       ON CONFLICT (vehicle_code) DO UPDATE
         SET status = 'dispatched', last_updated = NOW()
       RETURNING *`,
      [
        `VEH-${payload.assignedUnit.id.slice(0, 8).toUpperCase()}`,
        payload.assignedUnit.id,
        payload.assignedUnit.name,
        payload.assignedUnit.type,
      ]
    );

    const vehicle = vehicleResult.rows[0];

    await pool.query(
      `INSERT INTO dispatches (incident_id, vehicle_id, responder_name, incident_type, incident_lat, incident_lon, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'dispatched')`,
      [
        payload.incidentId,
        vehicle.id,
        payload.assignedUnit.name,
        payload.incidentType,
        payload.latitude,
        payload.longitude,
      ]
    );

    console.log(`[dispatch] Recorded dispatch for incident ${payload.incidentId} → ${payload.assignedUnit.name}`);
  } catch (err) {
    console.error("[dispatch] handleNewIncident error:", err.message);
  }
};

// ─── Handler: store vehicle GPS update ────────────────────
const handleVehicleLocation = async (vehicleCode, payload) => {
  try {
    const { latitude, longitude, incidentId } = payload;
    if (!latitude || !longitude) return;

    // Update current position
    await pool.query(
      `UPDATE vehicles SET latitude=$1, longitude=$2, last_updated=NOW()
       WHERE vehicle_code=$3`,
      [latitude, longitude, vehicleCode]
    );

    // Record history
    const vRes = await pool.query("SELECT id FROM vehicles WHERE vehicle_code=$1", [vehicleCode]);
    if (vRes.rows.length > 0) {
      await pool.query(
        `INSERT INTO location_history (vehicle_id, incident_id, latitude, longitude)
         VALUES ($1, $2, $3, $4)`,
        [vRes.rows[0].id, incidentId || null, latitude, longitude]
      );
    }

    console.log(`[dispatch] Location updated for vehicle ${vehicleCode}: (${latitude}, ${longitude})`);
  } catch (err) {
    console.error("[dispatch] handleVehicleLocation error:", err.message);
  }
};

// ─── Handler: update dispatch status ──────────────────────
const handleIncidentStatus = async (incidentId, payload) => {
  try {
    const { status } = payload;
    await pool.query(
      `UPDATE dispatches SET status=$1 ${status === "resolved" ? ", resolved_at=NOW()" : ""}
       WHERE incident_id=$2`,
      [status, incidentId]
    );

    if (status === "resolved") {
      await pool.query(
        `UPDATE vehicles SET status='idle', last_updated=NOW()
         WHERE id = (SELECT vehicle_id FROM dispatches WHERE incident_id=$1 LIMIT 1)`,
        [incidentId]
      );
    }

    console.log(`[dispatch] Incident ${incidentId} status → ${status}`);
  } catch (err) {
    console.error("[dispatch] handleIncidentStatus error:", err.message);
  }
};

const publish = (topic, payload) => {
  if (!client || !client.connected) return;
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
};

module.exports = { connect, publish };