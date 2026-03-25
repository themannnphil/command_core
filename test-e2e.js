#!/usr/bin/env node
/**
 * Emergency Platform — End-to-End Test Script
 * Run with: node test-e2e.js
 * Requires: all services running via docker compose up
 */

const BASE = {
  auth:      "http://localhost:3001",
  incident:  "http://localhost:3002",
  dispatch:  "http://localhost:3003",
  analytics: "http://localhost:3004",
};

let token = null;
let incidentId = null;
let pass = 0;
let fail = 0;

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = {
  section: (s) => console.log(`\n${c.bold(c.cyan("══ " + s + " ══"))}`),
  ok:      (s) => { console.log(c.green("  ✔ " + s)); pass++; },
  fail:    (s) => { console.log(c.red  ("  ✘ " + s)); fail++; },
  info:    (s) => console.log(c.yellow ("  ℹ " + s)),
};

async function req(method, url, body = null, auth = false) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function assert(condition, label) {
  condition ? log.ok(label) : log.fail(label);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────────────────────────────────────
async function testHealthChecks() {
  log.section("1. Health Checks");
  for (const [name, base] of Object.entries(BASE)) {
    const { status, data } = await req("GET", `${base}/health`);
    assert(status === 200 && data.status === "ok", `${name}-service health OK`);
  }
}

// ──────────────────────────────────────────────────────────
async function testAuth() {
  log.section("2. Auth Service");

  // Register a system admin
  const reg = await req("POST", `${BASE.auth}/auth/register`, {
    name: "Kofi Boateng",
    email: `admin_${Date.now()}@ghana-emergency.gov.gh`,
    password: "Admin1234!",
    role: "system_admin",
  });
  assert(reg.status === 201, "Register system admin");

  // Try duplicate email
  const dup = await req("POST", `${BASE.auth}/auth/register`, {
    name: "Kofi Boateng",
    email: reg.data.user?.email,
    password: "Admin1234!",
    role: "system_admin",
  });
  assert(dup.status === 409, "Reject duplicate email");

  // Login
  const login = await req("POST", `${BASE.auth}/auth/login`, {
    email: reg.data.user?.email,
    password: "Admin1234!",
  });
  assert(login.status === 200, "Login returns 200");
  assert(!!login.data.accessToken, "Access token returned");
  assert(!!login.data.refreshToken, "Refresh token returned");
  token = login.data.accessToken;
  log.info(`Token acquired for ${reg.data.user?.email}`);

  // Wrong password
  const bad = await req("POST", `${BASE.auth}/auth/login`, {
    email: reg.data.user?.email,
    password: "wrongpass",
  });
  assert(bad.status === 401, "Reject wrong password");

  // Profile
  const profile = await req("GET", `${BASE.auth}/auth/profile`, null, true);
  assert(profile.status === 200, "GET /auth/profile with token");
  assert(profile.data.role === "system_admin", "Profile role matches");

  // Refresh token
  const refresh = await req("POST", `${BASE.auth}/auth/refresh-token`, {
    refreshToken: login.data.refreshToken,
  });
  assert(refresh.status === 200, "Refresh token returns new access token");

  // No token → 401
  const noauth = await req("GET", `${BASE.auth}/auth/profile`);
  assert(noauth.status === 401, "Reject request without token");
}

// ──────────────────────────────────────────────────────────
async function testIncidents() {
  log.section("3. Incident Service — Create & Dispatch");

  // List responders
  const responders = await req("GET", `${BASE.incident}/responders`, null, true);
  assert(responders.status === 200, "GET /responders returns seeded data");
  assert(responders.data.length >= 6, `At least 6 seeded responders (got ${responders.data.length})`);

  // Create a medical incident near Accra (should auto-assign nearest ambulance)
  const medical = await req("POST", `${BASE.incident}/incidents`, {
    citizen_name: "Ama Owusu",
    incident_type: "medical",
    latitude: 5.5502,
    longitude: -0.2174,
    notes: "Patient unconscious after car accident at Ring Road",
  }, true);
  assert(medical.status === 201, "Create medical incident → 201");
  assert(medical.data.incident?.status === "dispatched", "Incident auto-dispatched");
  assert(medical.data.assignedUnit !== null, "Nearest ambulance assigned");
  log.info(`Assigned: ${medical.data.assignedUnit?.name} (${medical.data.assignedUnit?.distanceKm} km)`);
  incidentId = medical.data.incident?.id;

  // Create a crime incident (should assign police)
  const crime = await req("POST", `${BASE.incident}/incidents`, {
    citizen_name: "Kwame Mensah",
    incident_type: "robbery",
    latitude: 5.5700,
    longitude: -0.2380,
    notes: "Armed robbery at Kaneshie market",
  }, true);
  assert(crime.status === 201, "Create robbery incident → 201");
  assert(crime.data.assignedUnit?.type === "police" || crime.data.assignedUnit === null,
    "Robbery assigned to police unit");

  // Create fire incident
  const fire = await req("POST", `${BASE.incident}/incidents`, {
    citizen_name: "Abena Asante",
    incident_type: "fire",
    latitude: 5.5610,
    longitude: -0.2060,
    notes: "Warehouse fire spreading to adjacent buildings",
  }, true);
  assert(fire.status === 201, "Create fire incident → 201");

  // Get open incidents
  const open = await req("GET", `${BASE.incident}/incidents/open`, null, true);
  assert(open.status === 200, "GET /incidents/open returns list");
  assert(open.data.length >= 3, `At least 3 open incidents (got ${open.data.length})`);

  // Get specific incident
  const single = await req("GET", `${BASE.incident}/incidents/${incidentId}`, null, true);
  assert(single.status === 200, "GET /incidents/:id returns incident");
  assert(single.data.id === incidentId, "Correct incident returned");

  // Missing incident → 404
  const missing = await req("GET", `${BASE.incident}/incidents/00000000-0000-0000-0000-000000000000`, null, true);
  assert(missing.status === 404, "Unknown incident returns 404");

  // Missing fields → 400
  const bad = await req("POST", `${BASE.incident}/incidents`, {
    citizen_name: "Test",
  }, true);
  assert(bad.status === 400, "Missing fields returns 400");
}

// ──────────────────────────────────────────────────────────
async function testStatusUpdates() {
  log.section("4. Incident Status Flow");

  const statuses = ["in_progress", "resolved"];
  for (const status of statuses) {
    const res = await req("PUT", `${BASE.incident}/incidents/${incidentId}/status`,
      { status }, true);
    assert(res.status === 200, `Status update → ${status}`);
    await sleep(300); // Let MQTT propagate
  }

  // Invalid status
  const invalid = await req("PUT", `${BASE.incident}/incidents/${incidentId}/status`,
    { status: "flying" }, true);
  assert(invalid.status === 400, "Invalid status returns 400");
}

// ──────────────────────────────────────────────────────────
async function testDispatch() {
  log.section("5. Dispatch Service — Vehicles & GPS");

  await sleep(1500); // Allow MQTT messages to be processed

  // List vehicles (should be auto-created by dispatch service consuming MQTT)
  const vehicles = await req("GET", `${BASE.dispatch}/vehicles`, null, true);
  assert(vehicles.status === 200, "GET /vehicles returns list");
  log.info(`Vehicles tracked: ${vehicles.data.length}`);

  // Register a vehicle manually
  const reg = await req("POST", `${BASE.dispatch}/vehicles/register`, {
    vehicle_code: "POLICE-ACC-001",
    responder_id: "00000000-0000-0000-0000-000000000001",
    responder_name: "Accra Central Police",
    vehicle_type: "police",
  }, true);
  assert(reg.status === 201, "Register vehicle manually");

  // Simulate GPS update via HTTP (which publishes to MQTT internally)
  const gps1 = await req("POST", `${BASE.dispatch}/vehicles/POLICE-ACC-001/location`, {
    latitude: 5.5510,
    longitude: -0.2180,
    incidentId: incidentId,
  }, true);
  assert(gps1.status === 200, "Publish GPS location update #1");

  await sleep(500);

  const gps2 = await req("POST", `${BASE.dispatch}/vehicles/POLICE-ACC-001/location`, {
    latitude: 5.5520,
    longitude: -0.2190,
    incidentId: incidentId,
  }, true);
  assert(gps2.status === 200, "Publish GPS location update #2");

  await sleep(500);

  // Check location history
  const history = await req("GET", `${BASE.dispatch}/vehicles/POLICE-ACC-001/history`, null, true);
  assert(history.status === 200, "GET /vehicles/:code/history");
  assert(history.data.length >= 2, `At least 2 location records (got ${history.data.length})`);

  // Check dispatches
  const dispatches = await req("GET", `${BASE.dispatch}/dispatches`, null, true);
  assert(dispatches.status === 200, "GET /dispatches returns list");
}

// ──────────────────────────────────────────────────────────
async function testAnalytics() {
  log.section("6. Analytics Service");

  await sleep(2000); // Allow all MQTT events to be processed and stored

  // Summary
  const summary = await req("GET", `${BASE.analytics}/analytics/summary`, null, true);
  assert(summary.status === 200, "GET /analytics/summary");
  assert(summary.data.totalIncidents >= 3, `Total incidents ≥ 3 (got ${summary.data.totalIncidents})`);
  log.info(`Total incidents: ${summary.data.totalIncidents}, Today: ${summary.data.incidentsToday}`);

  // Response times
  const rt = await req("GET", `${BASE.analytics}/analytics/response-times`, null, true);
  assert(rt.status === 200, "GET /analytics/response-times");
  log.info(`Avg response time: ${rt.data.summary?.avg_minutes ?? "N/A"} min`);

  // Incidents by region
  const region = await req("GET", `${BASE.analytics}/analytics/incidents-by-region`, null, true);
  assert(region.status === 200, "GET /analytics/incidents-by-region");
  assert(region.data.byType?.length >= 1, "Incident type breakdown present");

  // Resource utilization
  const util = await req("GET", `${BASE.analytics}/analytics/resource-utilization`, null, true);
  assert(util.status === 200, "GET /analytics/resource-utilization");
}

// ──────────────────────────────────────────────────────────
async function run() {
  console.log(c.bold("\n🚨 GHANA EMERGENCY PLATFORM — END-TO-END TEST SUITE 🚨\n"));

  try {
    await testHealthChecks();
    await testAuth();
    await testIncidents();
    await testStatusUpdates();
    await testDispatch();
    await testAnalytics();
  } catch (err) {
    console.error(c.red("\nFatal test error:"), err.message);
    fail++;
  }

  const total = pass + fail;
  console.log(c.bold(`\n══════════════════════════════════════`));
  console.log(c.bold(`  Results: ${c.green(pass + " passed")}  ${fail > 0 ? c.red(fail + " failed") : c.green("0 failed")}  / ${total} total`));
  console.log(c.bold(`══════════════════════════════════════\n`));

  process.exit(fail > 0 ? 1 : 0);
}

run();
