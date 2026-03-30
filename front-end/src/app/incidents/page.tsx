'use client'
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Plus, Search, Filter, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { NewIncidentModal } from '@/components/incidents/NewIncidentModal'
import { Card, Button, Badge, StatusDot, Spinner, EmptyState } from '@/components/ui/index'
import { incidentApi, Incident, IncidentStatus } from '@/lib/api'
import { STATUS_CONFIG, RESPONDER_CONFIG, timeAgo, cn } from '@/lib/utils'
import { useMqtt } from '@/lib/mqtt'
import { useAuth } from '@/lib/auth'

const STATUS_FILTERS: { label: string; value: IncidentStatus | 'all' }[] = [
  { label: 'All Active', value: 'all' },
  { label: 'Created', value: 'created' },
  { label: 'Dispatched', value: 'dispatched' },
  { label: 'In Progress', value: 'in_progress' },
]

export default function IncidentsPage() {
  const { user } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<IncidentStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await incidentApi.getOpen()
      setIncidents(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useMqtt(useCallback((topic, payload: any) => {
    if (topic === 'incidents/new') {
      setIncidents(prev => [payload as Incident, ...prev])
    }
    const match = topic.match(/^incidents\/([^/]+)\/status$/)
    if (match) {
      setIncidents(prev =>
        prev.map(i => i.id === match[1] ? { ...i, status: payload.status } : i)
          .filter(i => i.status !== 'resolved')
      )
    }
  }, []))

  const filtered = incidents.filter(i => {
    const matchesFilter = filter === 'all' || i.status === filter
    const matchesSearch = !search ||
      i.citizen_name.toLowerCase().includes(search.toLowerCase()) ||
      i.incident_type.toLowerCase().includes(search.toLowerCase()) ||
      i.responder_name?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <DashboardShell>
      {showModal && (
        <NewIncidentModal
          onClose={() => setShowModal(false)}
          onCreated={() => { load() }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Incidents</h1>
          <p className="text-xs text-text-muted mt-0.5">{incidents.length} active incidents</p>
        </div>
        {user?.role === 'system_admin' && (
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowModal(true)}>
            Log Incident
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search incidents..."
            className="w-full bg-surface border border-border rounded pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border rounded p-1">
          {STATUS_FILTERS.map(f => (
            <button key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-all',
                filter === f.value
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Status', 'Type', 'Caller', 'Assigned Unit', 'Responder', 'Reported', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Spinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={<AlertTriangle size={28} />} message="No incidents match your filter" />
                  </td>
                </tr>
              ) : (
                filtered.map(inc => {
                  const status = STATUS_CONFIG[inc.status]
                  const responder = inc.responder_type ? RESPONDER_CONFIG[inc.responder_type] : null
                  return (
                    <tr key={inc.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusDot color={status.color} pulse={status.pulse} />
                          <Badge color={status.color} bg={status.bg}>{status.label}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-text-primary capitalize">{inc.incident_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-secondary">{inc.citizen_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {inc.responder_name ? (
                          <span className="text-xs text-text-secondary truncate max-w-[140px] block">{inc.responder_name}</span>
                        ) : (
                          <span className="text-xs text-text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {responder ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded"
                            style={{ color: responder.color, background: `${responder.color}18` }}>
                            {responder.label}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-muted">{timeAgo(inc.created_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/incidents/${inc.id}`}
                          className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
                          View <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardShell>
  )
}
