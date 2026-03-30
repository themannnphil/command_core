const mqtt = require("mqtt");
const { pool } = require("./db");

const connect = () => {
  const host     = process.env.MQTT_HOST     || "localhost";
  const port     = process.env.MQTT_PORT     || 1883;
  const username = process.env.MQTT_USERNAME || "";
  const password = process.env.MQTT_PASSWORD || "";

  const isCloud = process.env.NODE_ENV === "production" || username !== "";
  const url = isCloud
    ? `mqtts://${host}:${port}`
    : `mqtt://${host}:${port}`;

  console.log(`[analytics-service] Connecting to MQTT at ${url}`);

  const client = mqtt.connect(url, {
    clientId: `analytics-service-${Date.now()}`,
    username: username || undefined,
    password: password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on("connect", () => {
    console.log("[analytics-service] MQTT connected to broker");

    // Subscribe to all incident and status topics
    client.subscribe("incidents/new", { qos: 1 });
    client.subscribe("incidents/+/status", { qos: 1 });
    console.log("[MQTT] Subscribed → incidents/new, incidents/+/status");
  });

  client.on("message", async (topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      return;
    }

    // ── New incident created ───────────────────────────────
    if (topic === "incidents/new") {
      try {
        await pool.query(
          `INSERT INTO incident_events
             (incident_id, incident_type, latitude, longitude,
              assigned_unit_name, assigned_unit_type, distance_km, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [
            payload.incidentId,
            payload.incidentType,
            payload.latitude,
            payload.longitude,
            payload.assignedUnit?.name || null,
            payload.assignedUnit?.type || null,
            payload.assignedUnit?.distanceKm || null,
            payload.status,
          ]
        );

        // Seed response_times row for later resolution
        await pool.query(
          `INSERT INTO response_times (incident_id, dispatched_at)
           VALUES ($1, NOW())
           ON CONFLICT DO NOTHING`,
          [payload.incidentId]
        );

        console.log(`[analytics] Recorded new incident ${payload.incidentId}`);
      } catch (err) {
        console.error("[analytics] insert incident_events error:", err.message);
      }
      return;
    }

    // ── Status update ─────────────────────────────────────
    const statusMatch = topic.match(/^incidents\/([^/]+)\/status$/);
    if (statusMatch) {
      const incidentId = statusMatch[1];
      try {
        await pool.query(
          "INSERT INTO status_events (incident_id, status) VALUES ($1,$2)",
          [incidentId, payload.status]
        );

        // Update incident_events latest status
        await pool.query(
          "UPDATE incident_events SET status=$1 WHERE incident_id=$2",
          [payload.status, incidentId]
        );

        // If resolved, compute response time
        if (payload.status === "resolved") {
          await pool.query(
            `UPDATE response_times
             SET resolved_at = NOW(),
                 duration_minutes = EXTRACT(EPOCH FROM (NOW() - dispatched_at)) / 60
             WHERE incident_id = $1`,
            [incidentId]
          );
          console.log(`[analytics] Computed response time for ${incidentId}`);
        }
      } catch (err) {
        console.error("[analytics] status_events error:", err.message);
      }
    }
  });

  client.on("error", (err) => console.error("[analytics] MQTT error:", err.message));
  client.on("reconnect", () => console.log("[analytics] MQTT reconnecting..."));
};

module.exports = { connect };

