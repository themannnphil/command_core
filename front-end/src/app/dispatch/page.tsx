'use client'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Truck, MapPin, RefreshCw, Radio } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, SectionHeader, Badge, Spinner, EmptyState, StatCard } from '@/components/ui/index'
import { dispatchApi, incidentApi, Vehicle, Dispatch, Responder } from '@/lib/api'
import { RESPONDER_CONFIG, timeAgo, cn } from '@/lib/utils'
import { useMqtt } from '@/lib/mqtt'

const IncidentMap = lazy(() => import('@/components/dashboard/IncidentMap').then(m => ({ default: m.IncidentMap })))

const VEHICLE_STATUS: Record<string, { label: string; color: string }> = {
  idle:        { label: 'Idle',       color: 'var(--text-muted)' },
  dispatched:  { label: 'Dispatched', color: 'var(--warning)' },
  on_scene:    { label: 'On Scene',   color: 'var(--accent)' },
  returning:   { label: 'Returning',  color: 'var(--success)' },
}

export default function DispatchPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [responders, setResponders] = useState<Responder[]>([])
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [veh, dis, resp] = await Promise.allSettled([
        dispatchApi.vehicles(),
        dispatchApi.dispatches(),
        incidentApi.responders(),
      ])
      if (veh.status === 'fulfilled') setVehicles(veh.value)
      if (dis.status === 'fulfilled') setDispatches(dis.value)
      if (resp.status === 'fulfilled') setResponders(resp.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll vehicles every 8s
  useEffect(() => {
    const t = setInterval(async () => {
      try { setVehicles(await dispatchApi.vehicles()) } catch {}
    }, 8000)
    return () => clearInterval(t)
  }, [])

  // MQTT live GPS
  useMqtt(useCallback((topic, payload: any) => {
    const match = topic.match(/^vehicles\/([^/]+)\/location$/)
    if (match) {
      setVehicles(prev => prev.map(v =>
        v.vehicle_code === match[1]
          ? { ...v, latitude: String(payload.latitude), longitude: String(payload.longitude), last_updated: payload.timestamp }
          : v
      ))
    }
  }, []))

  const active = vehicles.filter(v => v.status === 'dispatched' || v.status === 'on_scene')
  const idle = vehicles.filter(v => v.status === 'idle' || v.status === 'returning')

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Dispatch</h1>
          <p className="text-xs text-text-muted mt-0.5">Live vehicle tracking and dispatch records</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-success font-medium">
            <Radio size={12} />
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-success" />
            Live tracking
          </span>
          <button onClick={load} className="text-text-muted hover:text-text-primary transition-colors p-1.5">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Vehicles" value={vehicles.length} icon={<Truck size={15} />} />
        <StatCard label="Dispatched" value={active.length} icon={<MapPin size={15} />} color="var(--warning)" sub="Active responses" />
        <StatCard label="Available" value={idle.length} icon={<Truck size={15} />} color="var(--success)" sub="Ready to deploy" />
        <StatCard label="Dispatches Today" value={dispatches.length} icon={<Radio size={15} />} color="var(--accent)" sub="Total records" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Vehicle list */}
        <div className="xl:col-span-1 space-y-4">
          <Card>
            <div className="px-4 py-3 border-b border-border">
              <SectionHeader title="Active Units" subtitle={`${active.length} in deployment`} />
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : active.length === 0 ? (
                <EmptyState icon={<Truck size={24} />} message="No active vehicles" />
              ) : (
                active.map(v => (
                  <VehicleRow key={v.id} vehicle={v}
                    selected={selected?.id === v.id}
                    onClick={() => setSelected(v.id === selected?.id ? null : v)} />
                ))
              )}
            </div>
          </Card>

          {idle.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-border">
                <SectionHeader title="Available Units" subtitle={`${idle.length} standing by`} />
              </div>
              <div className="divide-y divide-border">
                {idle.map(v => (
                  <VehicleRow key={v.id} vehicle={v}
                    selected={selected?.id === v.id}
                    onClick={() => setSelected(v.id === selected?.id ? null : v)} />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Map */}
        <Card className="xl:col-span-2 overflow-hidden" style={{ height: 520 }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">
              {selected ? `Tracking: ${selected.responder_name || selected.vehicle_code}` : 'All Vehicle Positions'}
            </span>
            {selected && (
              <button onClick={() => setSelected(null)} className="text-[11px] text-text-muted hover:text-text-primary transition-colors">
                Clear selection
              </button>
            )}
          </div>
          <div style={{ height: 'calc(100% - 41px)' }}>
            <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner size={24} /></div>}>
              <IncidentMap
                vehicles={selected ? [selected] : vehicles}
                responders={responders}
                height="100%"
                center={selected?.latitude ? [parseFloat(selected.latitude), parseFloat(selected.longitude)] : undefined}
                zoom={selected ? 14 : 12}
              />
            </Suspense>
          </div>
        </Card>
      </div>

      {/* Dispatch records table */}
      <Card className="mt-4">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader title="Recent Dispatches" subtitle="Last 50 dispatch records" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Unit', 'Incident Type', 'Status', 'Dispatched', 'Resolved', 'Location'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispatches.slice(0, 20).map(d => (
                <tr key={d.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-xs text-text-primary">{d.responder_name}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary capitalize">{d.incident_type}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium capitalize px-2 py-0.5 rounded"
                      style={{
                        color: d.status === 'resolved' ? 'var(--success)' : d.status === 'dispatched' ? 'var(--warning)' : 'var(--accent)',
                        background: d.status === 'resolved' ? 'var(--success-muted)' : d.status === 'dispatched' ? 'var(--warning-muted)' : 'var(--accent-muted)',
                      }}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{timeAgo(d.dispatched_at)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{d.resolved_at ? timeAgo(d.resolved_at) : '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-text-muted">
                    {parseFloat(d.incident_lat).toFixed(4)}, {parseFloat(d.incident_lon).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardShell>
  )
}

function VehicleRow({ vehicle: v, selected, onClick }: { vehicle: Vehicle; selected: boolean; onClick: () => void }) {
  const vc = RESPONDER_CONFIG[v.vehicle_type] || { color: '#6b7280', label: v.vehicle_type }
  const sc = VEHICLE_STATUS[v.status] || { label: v.status, color: 'var(--text-muted)' }
  return (
    <button onClick={onClick} className={cn(
      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors',
      selected && 'bg-accent-muted'
    )}>
      <div className="p-1.5 rounded mt-0.5" style={{ background: `${vc.color}18` }}>
        <Truck size={13} style={{ color: vc.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">
          {v.responder_name || v.vehicle_code}
        </p>
        <p className="text-[10px] text-text-muted font-mono mt-0.5">{v.vehicle_code}</p>
        {v.latitude && v.longitude && (
          <p className="text-[10px] text-text-muted font-mono mt-0.5">
            {parseFloat(v.latitude).toFixed(4)}, {parseFloat(v.longitude).toFixed(4)}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] font-medium" style={{ color: sc.color }}>{sc.label}</span>
        <span className="text-[10px] text-text-muted">{timeAgo(v.last_updated)}</span>
      </div>
    </button>
  )
}
