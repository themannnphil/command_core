const mqtt = require("mqtt");

let client = null;

const connect = () => {
  const host = process.env.MQTT_HOST || "localhost";
  const port = process.env.MQTT_PORT || 1883;
  const isProduction = process.env.NODE_ENV === "production";
  const url = isProduction ? `wss://${host}` : `mqtt://${host}:${port}`;

  console.log(`[incident-service] Connecting to MQTT at ${url}`);

  client = mqtt.connect(url, {
    clientId: `incident-service-${Date.now()}`,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    rejectUnauthorized: false,
  });

  client.on("connect", () => {
    console.log("[incident-service] MQTT connected to broker");
  });

  client.on("error", (err) => {
    console.error("[incident-service] MQTT error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[incident-service] MQTT reconnecting...");
  });
};

// Publish a message to a topic
const publish = (topic, payload) => {
  if (!client || !client.connected) {
    console.warn("[MQTT] Not connected, cannot publish to", topic);
    return;
  }
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error("[MQTT] Publish error:", err);
    else console.log(`[MQTT] Published → ${topic}`);
  });
};

module.exports = { connect, publish };