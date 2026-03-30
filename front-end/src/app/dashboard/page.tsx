'use client'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { AlertTriangle, Truck, Clock, Activity, Plus, RefreshCw } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { LiveIncidentFeed } from '@/components/dashboard/LiveIncidentFeed'
import { StatCard, Card, Button, Spinner } from '@/components/ui/index'
import { NewIncidentModal } from '@/components/incidents/NewIncidentModal'
import { analyticsApi, incidentApi, dispatchApi, AnalyticsSummary, Incident, Vehicle, Responder } from '@/lib/api'
import { useMqtt } from '@/lib/mqtt'
import { useAuth } from '@/lib/auth'

const IncidentMap = lazy(() => import('@/components/dashboard/IncidentMap').then(m => ({ default: m.IncidentMap })))

export default function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [responders, setResponders] = useState<Responder[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [sum, inc, veh, resp] = await Promise.allSettled([
        analyticsApi.summary(),
        incidentApi.getOpen(),
        dispatchApi.vehicles(),
        incidentApi.responders(),
      ])
      if (sum.status === 'fulfilled') setSummary(sum.value)
      if (inc.status === 'fulfilled') setIncidents(inc.value)
      if (veh.status === 'fulfilled') setVehicles(veh.value)
      if (resp.status === 'fulfilled') setResponders(resp.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Poll vehicles every 10s
  useEffect(() => {
    const t = setInterval(async () => {
      try { setVehicles(await dispatchApi.vehicles()) } catch {}
    }, 10000)
    return () => clearInterval(t)
  }, [])

  // MQTT live updates
  useMqtt(useCallback((topic, payload: any) => {
    if (topic === 'incidents/new') {
      setIncidents(prev => [payload as Incident, ...prev])
      showToast(`New ${payload.incidentType} incident — ${payload.assignedUnit?.name || 'unassigned'}`)
      analyticsApi.summary().then(setSummary).catch(() => {})
    }
    const statusMatch = topic.match(/^incidents\/([^/]+)\/status$/)
    if (statusMatch) {
      setIncidents(prev => prev
        .map(i => i.id === statusMatch[1] ? { ...i, status: payload.status } : i)
        .filter(i => i.status !== 'resolved')
      )
    }
    const locMatch = topic.match(/^vehicles\/([^/]+)\/location$/)
    if (locMatch) {
      setVehicles(prev => prev.map(v =>
        v.vehicle_code === locMatch[1]
          ? { ...v, latitude: String(payload.latitude), longitude: String(payload.longitude), last_updated: payload.timestamp }
          : v
      ))
    }
  }, []))

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  const canCreateIncident = user?.role === 'system_admin'

  return (
    <DashboardShell>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-surface border border-border rounded-lg px-4 py-3 shadow-xl animate-slide-in max-w-sm">
          <span className="w-2 h-2 rounded-full bg-danger pulse-danger flex-shrink-0" />
          <span className="text-xs text-text-primary">{toast}</span>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <NewIncidentModal
          onClose={() => setShowModal(false)}
          onCreated={(r) => {
            showToast(`Incident created — ${r.message}`)
            loadAll()
          }}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">
            Overview
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={loadAll}>
            Refresh
          </Button>
          {canCreateIncident && (
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowModal(true)}>
              Log Incident
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Incidents"
          value={loading ? '—' : summary?.totalIncidents ?? 0}
          icon={<AlertTriangle size={15} />}
          color="var(--danger)"
          sub="All time"
        />
        <StatCard
          label="Active Today"
          value={loading ? '—' : summary?.incidentsToday ?? 0}
          icon={<Activity size={15} />}
          color="var(--warning)"
          sub="In the last 24 hours"
        />
        <StatCard
          label="Vehicles Tracked"
          value={loading ? '—' : vehicles.length}
          icon={<Truck size={15} />}
          color="var(--accent)"
          sub={`${vehicles.filter(v => v.status === 'dispatched').length} dispatched`}
        />
        <StatCard
          label="Avg Response"
          value={loading ? '—' : summary?.avgResponseMinutes ? `${Number(summary.avgResponseMinutes).toFixed(1)}m` : 'N/A'}
          icon={<Clock size={15} />}
          color="var(--success)"
          sub="Dispatch to resolve"
        />
      </div>

      {/* Map + Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <Card className="xl:col-span-2 overflow-hidden" style={{ height: 460 }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">Live Dispatch Map</span>
            <div className="flex items-center gap-4 text-[10px] text-text-muted">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />Dispatched</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" />In Progress</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#6366f1' }} />Police</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Ambulance</span>
            </div>
          </div>
          <div style={{ height: 'calc(100% - 41px)' }}>
            <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner size={24} /></div>}>
              <IncidentMap incidents={incidents} vehicles={vehicles} responders={responders} height="100%" />
            </Suspense>
          </div>
        </Card>

        {/* Live feed */}
        <div style={{ height: 460 }}>
          <LiveIncidentFeed limit={8} />
        </div>
      </div>
    </DashboardShell>
  )
}
