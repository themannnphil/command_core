# Ghana Emergency Response Platform
CPEN 421 Final Project — University of Ghana

## Architecture
- **Auth Service** — :3001 — JWT auth, user registration, roles
- **Incident Service** — :3002 — Log incidents, auto-assign nearest responder, MQTT publisher
- **Dispatch Service** — :3003 — Vehicle GPS tracking, MQTT subscriber
- **Analytics Service** — :3004 — Aggregate stats, MQTT subscriber
- **Mosquitto MQTT Broker** — :1883 (TCP), :9001 (WebSocket)
- **4 × PostgreSQL** — :5433–5436 (one per service)

## MQTT Topics
| Topic | Producer | Consumer(s) |
|---|---|---|
| `incidents/new` | Incident Service | Dispatch Service, Analytics Service |
| `incidents/{id}/status` | Incident Service | Dispatch Service, Analytics Service |
| `vehicles/{code}/location` | Dispatch Service (via HTTP) | Dispatch Service (self, stores to DB) |

---

## Quick Start

### 1. Start everything
```bash
docker compose up --build
```
Wait ~30 seconds for all services and databases to initialize.

### 2. Verify all services are healthy
```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

### 3. Run the end-to-end test suite
```bash
node test-e2e.js
```

---

## Manual Testing (Postman / curl)

### Register a user
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Kofi Admin","email":"kofi@emergency.gh","password":"Admin1234!","role":"system_admin"}'
```

### Login and save token
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kofi@emergency.gh","password":"Admin1234!"}'
```
Copy the `accessToken` from the response and use it as `TOKEN` below.

### Create a medical incident (auto-dispatches nearest ambulance)
```bash
curl -X POST http://localhost:3002/incidents \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "citizen_name": "Ama Owusu",
    "incident_type": "medical",
    "latitude": 5.5502,
    "longitude": -0.2174,
    "notes": "Patient unconscious at Ring Road"
  }'
```

### Update incident status
```bash
curl -X PUT http://localhost:3002/incidents/{INCIDENT_ID}/status \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

### Simulate vehicle GPS (driver app)
```bash
curl -X POST http://localhost:3003/vehicles/POLICE-ACC-001/location \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude":5.5510,"longitude":-0.2180}'
```

### View analytics
```bash
curl http://localhost:3004/analytics/summary -H "Authorization: Bearer TOKEN"
curl http://localhost:3004/analytics/response-times -H "Authorization: Bearer TOKEN"
curl http://localhost:3004/analytics/incidents-by-region -H "Authorization: Bearer TOKEN"
curl http://localhost:3004/analytics/resource-utilization -H "Authorization: Bearer TOKEN"
```

---

## Monitor MQTT in real time
Install MQTT Explorer (https://mqtt-explorer.com) and connect to:
- Host: `localhost`
- Port: `1883`

Or use the CLI:
```bash
# Subscribe to all topics
docker run --rm --network emergency-platform_emergency-net \
  eclipse-mosquitto:2.0 mosquitto_sub -h mosquitto -t '#' -v
```

---

## User Roles
| Role | Description |
|---|---|
| `system_admin` | Emergency call center operator |
| `hospital_admin` | Hospital staff |
| `police_admin` | Police station admin |
| `fire_admin` | Fire service admin |
| `ambulance_driver` | Driver (publishes GPS) |

---

## Stop everything
```bash
docker compose down -v
```
