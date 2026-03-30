'use client'
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react'
import { incidentApi, Incident } from '@/lib/api'
import { useMqtt } from '@/lib/mqtt'
import { STATUS_CONFIG, RESPONDER_CONFIG, timeAgo, cn } from '@/lib/utils'
import { Card, SectionHeader, EmptyState, StatusDot, Badge, Spinner, Button } from '@/components/ui/index'
import Link from 'next/link'

export function LiveIncidentFeed({ limit = 8 }: { limit?: number }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const data = await incidentApi.getOpen()
      setIncidents(data.slice(0, limit))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { load() }, [load])

  // Real-time MQTT updates
  useMqtt(useCallback((topic, payload: any) => {
    if (topic === 'incidents/new') {
      setIncidents(prev => {
        const updated = [payload as unknown as Incident, ...prev].slice(0, limit)
        return updated
      })
      setNewIds(prev => new Set([...prev, payload.incidentId]))
      setTimeout(() => {
        setNewIds(prev => { const n = new Set(prev); n.delete(payload.incidentId); return n })
      }, 4000)
      return
    }
    const match = topic.match(/^incidents\/([^/]+)\/status$/)
    if (match) {
      const id = match[1]
      setIncidents(prev =>
        prev.map(inc => inc.id === id ? { ...inc, status: payload.status } : inc)
          .filter(inc => inc.status !== 'resolved')
      )
    }
  }, [limit]))

  return (
    <Card className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <SectionHeader
          title="Live Incidents"
          subtitle="Active and dispatched events"
          action={
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-success font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-success pulse-success" />
                Live
              </span>
              <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={load}>
                Refresh
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size={20} /></div>
        ) : incidents.length === 0 ? (
          <EmptyState icon={<AlertTriangle size={32} />} message="No active incidents" />
        ) : (
          incidents.map(inc => {
            const status = STATUS_CONFIG[inc.status]
            const responder = inc.responder_type ? RESPONDER_CONFIG[inc.responder_type] : null
            const isNew = newIds.has(inc.id)
            return (
              <Link key={inc.id} href={`/incidents/${inc.id}`}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group',
                  isNew && 'animate-slide-in bg-accent-muted'
                )}>
                <StatusDot color={status.color} pulse={status.pulse} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-text-primary capitalize truncate">
                      {inc.incident_type}
                    </span>
                    {responder && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ color: responder.color, background: `${responder.color}18` }}>
                        {responder.label}
                      </span>
                    )}
                    {isNew && (
                      <span className="text-[9px] font-bold text-accent uppercase tracking-wider">New</span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted truncate">{inc.citizen_name}</p>
                  {inc.responder_name && (
                    <p className="text-[10px] text-text-muted truncate mt-0.5">{inc.responder_name}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge color={status.color} bg={status.bg}>{status.label}</Badge>
                  <span className="text-[10px] text-text-muted">{timeAgo(inc.created_at)}</span>
                </div>
                <ChevronRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </Link>
            )
          })
        )}
      </div>

      {incidents.length > 0 && (
        <div className="p-3 border-t border-border">
          <Link href="/incidents" className="text-xs text-accent hover:text-accent-hover transition-colors">
            View all incidents →
          </Link>
        </div>
      )}
    </Card>
  )
}
