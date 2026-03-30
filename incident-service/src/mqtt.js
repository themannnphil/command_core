const mqtt = require("mqtt");

let client = null;

const connect = () => {
  const host     = process.env.MQTT_HOST     || "localhost";
  const port     = process.env.MQTT_PORT     || 1883;
  const username = process.env.MQTT_USERNAME || "";
  const password = process.env.MQTT_PASSWORD || "";

  // HiveMQ Cloud uses mqtts:// (TLS) on port 8883
  // Locally use plain mqtt:// on 1883
  const isCloud = process.env.NODE_ENV === "production" || username !== "";
  const url = isCloud
    ? `mqtts://${host}:${port}`
    : `mqtt://${host}:${port}`;

  console.log(`[incident-service] Connecting to MQTT at ${url}`);

  client = mqtt.connect(url, {
    clientId: `incident-service-${Date.now()}`,
    username: username || undefined,
    password: password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on("connect", () => {
    console.log("[incident-service] MQTT connected");
  });

  client.on("error", (err) => {
    console.error("[incident-service] MQTT error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[incident-service] MQTT reconnecting...");
  });
};

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
