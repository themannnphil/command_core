const SERVICES = {
  auth:      process.env.NEXT_PUBLIC_AUTH_URL      || 'http://localhost:3001',
  incident:  process.env.NEXT_PUBLIC_INCIDENT_URL  || 'http://localhost:3002',
  dispatch:  process.env.NEXT_PUBLIC_DISPATCH_URL  || 'http://localhost:3003',
  analytics: process.env.NEXT_PUBLIC_ANALYTICS_URL || 'http://localhost:3004',
}

let _token: string | null = null

export const setToken = (t: string) => { _token = t }
export const getToken = () => _token
export const clearToken = () => { _token = null }

const headers = () => ({
  'Content-Type': 'application/json',
  ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
})

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...options, headers: headers() })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// ─── Auth ────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>(
      `${SERVICES.auth}/auth/login`,
      { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  register: (data: RegisterPayload) =>
    request(`${SERVICES.auth}/auth/register`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  profile: () => request<User>(`${SERVICES.auth}/auth/profile`),
  users: () => request<User[]>(`${SERVICES.auth}/auth/users`),
  refreshToken: (refreshToken: string) =>
    request<{ accessToken: string }>(`${SERVICES.auth}/auth/refresh-token`, {
      method: 'POST', body: JSON.stringify({ refreshToken }),
    }),
}

// ─── Incidents ───────────────────────────────────────────
export const incidentApi = {
  create: (data: CreateIncidentPayload) =>
    request<{ incident: Incident; assignedUnit: Responder | null; message: string }>(
      `${SERVICES.incident}/incidents`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  getOpen: () => request<Incident[]>(`${SERVICES.incident}/incidents/open`),
  getById: (id: string) => request<Incident>(`${SERVICES.incident}/incidents/${id}`),
  updateStatus: (id: string, status: IncidentStatus) =>
    request<{ incident: Incident }>(`${SERVICES.incident}/incidents/${id}/status`, {
      method: 'PUT', body: JSON.stringify({ status }),
    }),
  assign: (id: string, unit_id: string) =>
    request<Incident>(`${SERVICES.incident}/incidents/${id}/assign`, {
      method: 'PUT', body: JSON.stringify({ unit_id }),
    }),
  responders: () => request<Responder[]>(`${SERVICES.incident}/responders`),
}

// ─── Dispatch ────────────────────────────────────────────
export const dispatchApi = {
  vehicles: () => request<Vehicle[]>(`${SERVICES.dispatch}/vehicles`),
  vehicleLocation: (id: string) =>
    request<Vehicle>(`${SERVICES.dispatch}/vehicles/${id}/location`),
  vehicleHistory: (code: string) =>
    request<LocationPoint[]>(`${SERVICES.dispatch}/vehicles/${code}/history`),
  dispatches: () => request<Dispatch[]>(`${SERVICES.dispatch}/dispatches`),
  dispatchByIncident: (incidentId: string) =>
    request<Dispatch>(`${SERVICES.dispatch}/dispatches/${incidentId}`),
  registerVehicle: (data: RegisterVehiclePayload) =>
    request(`${SERVICES.dispatch}/vehicles/register`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  pushLocation: (code: string, lat: number, lon: number, incidentId?: string) =>
    request(`${SERVICES.dispatch}/vehicles/${code}/location`, {
      method: 'POST',
      body: JSON.stringify({ latitude: lat, longitude: lon, incidentId }),
    }),
}

// ─── Analytics ───────────────────────────────────────────
export const analyticsApi = {
  summary: () => request<AnalyticsSummary>(`${SERVICES.analytics}/analytics/summary`),
  responseTimes: () => request<ResponseTimeData>(`${SERVICES.analytics}/analytics/response-times`),
  byRegion: () => request<RegionData>(`${SERVICES.analytics}/analytics/incidents-by-region`),
  resourceUtilization: () =>
    request<UtilizationData>(`${SERVICES.analytics}/analytics/resource-utilization`),
}

// ─── Types ───────────────────────────────────────────────
export type IncidentStatus = 'created' | 'dispatched' | 'in_progress' | 'resolved'
export type UserRole = 'system_admin' | 'hospital_admin' | 'police_admin' | 'fire_admin' | 'ambulance_driver'
export type ResponderType = 'police' | 'fire' | 'ambulance'

export interface User {
  id: string; name: string; email: string; role: UserRole; created_at: string
}
export interface RegisterPayload {
  name: string; email: string; password: string; role: UserRole
}
export interface Incident {
  id: string; citizen_name: string; incident_type: string
  latitude: string; longitude: string; notes: string | null
  created_by: string; assigned_unit: string | null
  status: IncidentStatus; created_at: string; updated_at: string
  responder_name?: string; responder_type?: ResponderType
  responder_lat?: string; responder_lon?: string
}
export interface CreateIncidentPayload {
  citizen_name: string; incident_type: string
  latitude: number; longitude: number; notes?: string
}
export interface Responder {
  id: string; name: string; type: ResponderType
  latitude: string; longitude: string
  is_available: boolean; distanceKm?: string
}
export interface Vehicle {
  id: string; vehicle_code: string; responder_id: string
  responder_name: string | null; vehicle_type: ResponderType
  latitude: string | null; longitude: string | null
  status: 'idle' | 'dispatched' | 'on_scene' | 'returning'
  last_updated: string
}
export interface LocationPoint {
  id: string; vehicle_id: string; incident_id: string | null
  latitude: string; longitude: string; recorded_at: string
}
export interface Dispatch {
  id: string; incident_id: string; vehicle_id: string
  responder_name: string; incident_type: string
  incident_lat: string; incident_lon: string
  dispatched_at: string; resolved_at: string | null
  status: string; latitude?: string; longitude?: string
  vehicle_code?: string; last_updated?: string
}
export interface RegisterVehiclePayload {
  vehicle_code: string; responder_id: string
  responder_name?: string; vehicle_type: ResponderType
}
export interface AnalyticsSummary {
  totalIncidents: number; resolvedIncidents: number
  incidentsToday: number; avgResponseMinutes: string | null
}
export interface ResponseTimeData {
  summary: { resolved_count: string; avg_minutes: string; min_minutes: string; max_minutes: string }
  byResponderType: { responder_type: string; total: string; avg_minutes: string }[]
}
export interface RegionData {
  byRegion: { region_lat: string; region_lon: string; incident_type: string; count: string; resolved: string }[]
  byType: { incident_type: string; count: string }[]
}
export interface UtilizationData {
  responderUtilization: { unit_name: string; unit_type: string; total_dispatches: string; resolved: string; active: string }[]
  statusSummary: { status: string; count: string }[]
}
