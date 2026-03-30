# LifeLink — Ghana National Emergency Response & Dispatch Coordination Platform

**Group 18 | CPEN 421 | University of Ghana**
Annan Chioma Praise (11014727) · Prince Philips Adorboe (11218951)
**Lecturer:** Mrs. Gifty Osei

---

## What is LifeLink?

LifeLink is a real-time, microservices-based emergency response coordination platform built for Ghana. It solves a critical operational problem: Ghana's police, fire, and ambulance services have traditionally operated in silos with no shared situational awareness. A call centre operator receiving an emergency today must manually guess which unit is closest. LifeLink eliminates that guesswork.

When an administrator logs a medical emergency at a location in Accra, LifeLink:
1. Computes the Haversine great-circle distance to every available ambulance
2. Selects and dispatches the nearest one automatically
3. Publishes the dispatch event over MQTT to every connected subscriber
4. Streams live GPS updates from the driver back to the dashboard map in real time
5. Aggregates response-time metrics in the analytics service — automatically, without polling

The entire flow — from incident creation to vehicle moving on the live map — takes under one second end to end.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              LifeLink Dashboard  (Next.js 14)                │
│    Leaflet Map · MQTT WebSocket · REST · Recharts charts     │
└────┬───────────────┬───────────────┬──────────────┬──────────┘
     │ REST          │ REST          │ REST         │ REST
     ▼               ▼               ▼              ▼
┌─────────┐  ┌───────────┐  ┌────────────┐  ┌────────────┐
│  Auth   │  │ Incident  │  │  Dispatch  │  │ Analytics  │
│  :3001  │  │  :3002    │  │   :3003    │  │   :3004    │
└────┬────┘  └─────┬─────┘  └──────┬─────┘  └──────┬─────┘
     │             │                │               │
     ▼             ▼                ▼               ▼
  auth_db    incident_db       dispatch_db    analytics_db
 (PostgreSQL) (PostgreSQL)    (PostgreSQL)   (PostgreSQL)
                │                  │               │
                └──────────────────┴───────────────┘
                                   │ publish / subscribe
                                   ▼
                   ┌──────────────────────────────┐
                   │    HiveMQ Cloud MQTT Broker   │
                   │  mqtts:// :8883  (services)  │
                   │  wss://   :8884  (browser)   │
                   │                              │
                   │  Topics:                     │
                   │  • incidents/new             │
                   │  • incidents/{id}/status     │
                   │  • vehicles/{code}/location  │
                   └──────────────────────────────┘
```

### Why MQTT?

Our lecturer specifically emphasised MQTT broker, producer, and consumer patterns. MQTT is the correct protocol for this domain — it was designed for IoT telemetry (GPS, sensors) with minimal overhead. Every GPS ping from a driver is a message published to `vehicles/{code}/location`. The dashboard subscribes and moves the map marker. No polling, no long-polling, no repeated HTTP calls. One publish fans out to every subscriber instantly.

---

## Services

| Service | Port | Responsibility |
|---|---|---|
| Auth Service | 3001 | JWT issuance, user registration, role-based access |
| Incident Service | 3002 | Incident lifecycle, Haversine dispatch, MQTT publisher |
| Dispatch Service | 3003 | GPS tracking, vehicle records, MQTT subscriber |
| Analytics Service | 3004 | Response time aggregation, MQTT subscriber |
| Dashboard | 3000 | Next.js 14, Leaflet map, real-time MQTT over WSS |

---

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ running locally
- Docker (for local MQTT broker) **or** a HiveMQ Cloud account
- Git

---

## Local Development Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/themannnphil/command_core.git
cd command_core
```

### Step 2 — Create PostgreSQL databases

```bash
psql -U postgres
```

```sql
CREATE DATABASE auth_db;
CREATE DATABASE incident_db;
CREATE DATABASE dispatch_db;
CREATE DATABASE analytics_db;
\q
```

### Step 3 — Start local MQTT broker

```bash
docker run -d -p 1883:1883 -p 9001:9001 --name lifelink-mqtt eclipse-mosquitto \
  sh -c "printf 'listener 1883\nlistener 9001\nprotocol websockets\nallow_anonymous true\n' > /tmp/m.conf && mosquitto -c /tmp/m.conf"
```

### Step 4 — Configure each service

Create a `.env` file in each service folder. Use `.env.example` as a template:

```bash
cp auth-service/.env.example      auth-service/.env
cp incident-service/.env.example  incident-service/.env
cp dispatch-service/.env.example  dispatch-service/.env
cp analytics-service/.env.example analytics-service/.env
```

Fill in your PostgreSQL password. For local dev, leave MQTT settings pointing to localhost.

### Step 5 — Start all services

Open four terminals:

```bash
# Terminal 1
cd auth-service && npm install && node src/index.js

# Terminal 2
cd incident-service && npm install && node src/index.js

# Terminal 3
cd dispatch-service && npm install && node src/index.js

# Terminal 4
cd analytics-service && npm install && node src/index.js
```

### Step 6 — Start the dashboard

```bash
cd front-end && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Step 7 — Run the test suite

```bash
node test-e2e.js
```

Expected output: **44 passed, 0 failed**

---

## Register your first user

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"System Admin","email":"admin@lifelink.gh","password":"Admin1234!","role":"system_admin"}'
```

### All demo accounts

| Role | Email | Password |
|---|---|---|
| System Admin | admin@lifelink.gh | Admin1234! |
| Hospital Admin | hospital@lifelink.gh | Admin1234! |
| Police Admin | police@lifelink.gh | Admin1234! |
| Fire Admin | fire@lifelink.gh | Admin1234! |
| Ambulance Driver | driver@lifelink.gh | Admin1234! |

---

## API Reference

### Auth Service (port 3001)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/register | None | Register a new user |
| POST | /auth/login | None | Returns accessToken + refreshToken |
| POST | /auth/refresh-token | None | Exchange refresh token for new access token |
| GET | /auth/profile | Bearer | Get current user profile |
| GET | /auth/users | system_admin | List all users |

### Incident Service (port 3002)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /incidents | Bearer | Create incident — auto-dispatches nearest responder |
| GET | /incidents/open | Bearer | List all active incidents |
| GET | /incidents/:id | Bearer | Get single incident with responder info |
| PUT | /incidents/:id/status | Bearer | Update status (created/dispatched/in_progress/resolved) |
| PUT | /incidents/:id/assign | Bearer | Manually assign a responder |
| GET | /responders | Bearer | List all responders with availability |

### Dispatch Service (port 3003)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /vehicles/register | Bearer | Register a vehicle |
| GET | /vehicles | Bearer | List all vehicles with GPS positions |
| GET | /vehicles/:id/location | Bearer | Current position of a vehicle |
| POST | /vehicles/:code/location | Bearer | Push GPS update — publishes to MQTT |
| GET | /vehicles/:code/history | Bearer | Last 100 location records |
| GET | /dispatches | Bearer | All dispatch records |

### Analytics Service (port 3004)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /analytics/summary | Bearer | Total incidents, resolved count, avg response time |
| GET | /analytics/response-times | Bearer | Avg/min/max response time by responder type |
| GET | /analytics/incidents-by-region | Bearer | Incidents grouped by type and coordinates |
| GET | /analytics/resource-utilization | Bearer | Dispatches per responder unit |

---

## MQTT Topics

| Topic | Publisher | Subscribers | Payload |
|---|---|---|---|
| `incidents/new` | Incident Service | Dispatch, Analytics, Dashboard | incidentId, type, location, assignedUnit |
| `incidents/{id}/status` | Incident Service | Dispatch, Analytics, Dashboard | incidentId, status, timestamp |
| `vehicles/{code}/location` | Dispatch Service | Dispatch (self), Dashboard | latitude, longitude, timestamp |

---

## Environment Variables

### Backend services (.env in each folder)

```env
PORT=3001                          # 3001/3002/3003/3004 per service
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_db                    # incident_db / dispatch_db / analytics_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_64_char_secret
JWT_REFRESH_SECRET=another_64_char_secret  # auth-service only

# MQTT (not needed for auth-service)
MQTT_HOST=abc123.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=lifelink
MQTT_PASSWORD=your_mqtt_password
NODE_ENV=production
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_INCIDENT_URL=http://localhost:3002
NEXT_PUBLIC_DISPATCH_URL=http://localhost:3003
NEXT_PUBLIC_ANALYTICS_URL=http://localhost:3004
NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001
NEXT_PUBLIC_MQTT_USERNAME=
NEXT_PUBLIC_MQTT_PASSWORD=
```

---

## Deployment on Render

### Order of deployment

1. Create 4 PostgreSQL databases on Render
2. Deploy `auth-service` → set env vars → copy service URL
3. Deploy `incident-service` → set env vars including HiveMQ
4. Deploy `dispatch-service` → set env vars including HiveMQ
5. Deploy `analytics-service` → set env vars including HiveMQ
6. Deploy `front-end` subfolder → set all `NEXT_PUBLIC_*` vars

### Render settings for each backend service

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `node src/index.js` |
| Root Directory | `auth-service` (or `incident-service` etc.) |

### Render settings for the frontend

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Root Directory | `front-end` |
| Node Version | 18 |

### HiveMQ Cloud MQTT env vars for all backend services

| Variable | Value |
|---|---|
| MQTT_HOST | `your-cluster.s1.eu.hivemq.cloud` |
| MQTT_PORT | `8883` |
| MQTT_USERNAME | `lifelink` |
| MQTT_PASSWORD | your password |
| NODE_ENV | `production` |

---

## Production Testing

See `TESTING.md` for the full production test and MQTT monitoring guide.

---

## Project Structure

```
command_core/
├── auth-service/
│   ├── src/
│   │   ├── index.js       # Express app, all auth routes
│   │   ├── db.js          # PostgreSQL schema + init
│   │   └── jwt.js         # Token generation + verification
│   ├── package.json
│   └── Dockerfile
├── incident-service/
│   ├── src/
│   │   ├── index.js       # Incident CRUD, Haversine dispatch
│   │   ├── db.js          # Schema: incidents, responders
│   │   └── mqtt.js        # MQTT publisher (HiveMQ)
│   ├── package.json
│   └── Dockerfile
├── dispatch-service/
│   ├── src/
│   │   ├── index.js       # Vehicle tracking, GPS endpoints
│   │   ├── db.js          # Schema: vehicles, dispatches, location_history
│   │   └── mqtt.js        # MQTT subscriber + publisher
│   ├── package.json
│   └── Dockerfile
├── analytics-service/
│   ├── src/
│   │   ├── index.js       # Analytics endpoints
│   │   ├── db.js          # Schema: incident_events, response_times
│   │   └── mqtt.js        # MQTT subscriber
│   ├── package.json
│   └── Dockerfile
├── front-end/             # Next.js 14 dashboard
│   ├── src/
│   │   ├── app/           # Pages (dashboard, incidents, dispatch, analytics, users)
│   │   ├── components/    # Layout, UI primitives, map, feed
│   │   └── lib/           # API client, auth context, MQTT hook, utils
│   └── package.json
├── docker-compose.yml
├── test-e2e.js
├── README.md
├── TESTING.md
└── DEPLOYMENT.md
```

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js 18 + Express | Async I/O ideal for real-time event handling |
| Database | PostgreSQL 15 | ACID compliance, strong typing, per-service isolation |
| Message broker | HiveMQ Cloud MQTT | Purpose-built for IoT telemetry, native WSS, always-on |
| Frontend | Next.js 14 | SSR, App Router, TypeScript, production-grade builds |
| Mapping | Leaflet + OpenStreetMap | No API key required, full Ghana map coverage |
| Charts | Recharts | React-native, responsive, composable |
| Auth | JWT (15 min access / 7 day refresh) | Stateless, no round-trips to auth service per request |
| Passwords | bcrypt (10 rounds) | Industry standard adaptive hashing |
| Distance | Haversine formula | Accurate great-circle distance for GPS coordinates |

---

## License

University of Ghana — CPEN 421 Course Project — Group 18 — 2026
