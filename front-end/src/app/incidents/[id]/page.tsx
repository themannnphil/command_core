'use client'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, User, Clock, Truck, AlertTriangle, CheckCircle, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, Badge, Button, StatusDot, Spinner, Textarea } from '@/components/ui/index'
import { incidentApi, dispatchApi, Incident, Dispatch, IncidentStatus } from '@/lib/api'
import { STATUS_CONFIG, RESPONDER_CONFIG, formatDate, timeAgo } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useMqtt } from '@/lib/mqtt'

const IncidentMap = lazy(() => import('@/components/dashboard/IncidentMap').then(m => ({ default: m.IncidentMap })))

const STATUS_FLOW: IncidentStatus[] = ['created', 'dispatched', 'in_progress', 'resolved']
const ADMIN_ROLES = ['system_admin', 'hospital_admin', 'police_admin', 'fire_admin']

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [dispatch, setDispatch] = useState<Dispatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportText, setReportText] = useState('')
  const [reportSaving, setReportSaving] = useState(false)
  const [reportError, setReportError] = useState('')

  const isAdmin = user?.role && ADMIN_ROLES.includes(user.role)

  const load = useCallback(async () => {
    try {
      const [inc, dis] = await Promise.allSettled([
        incidentApi.getById(id),
        dispatchApi.dispatchByIncident(id),
      ])
      if (inc.status === 'fulfilled') {
        setIncident(inc.value)
        setReportText(inc.value.incident_report || '')
      }
      if (dis.status === 'fulfilled') setDispatch(dis.value)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useMqtt(useCallback((topic, payload: any) => {
    const match = topic.match(/^incidents\/([^/]+)\/status$/)
    if (match && match[1] === id) {
      setIncident(prev => prev ? { ...prev, status: payload.status } : prev)
    }
  }, [id]))

  const updateStatus = async (status: IncidentStatus) => {
    if (status === 'resolved' && !incident?.incident_report?.trim()) {
      alert('Please file an incident report before resolving.')
      setShowReportForm(true)
      return
    }
    setUpdating(true)
    try {
      await incidentApi.updateStatus(id, status)
      setIncident(prev => prev ? { ...prev, status } : prev)
    } catch (e: any) {
      alert(e.message || 'Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  const saveReport = async () => {
    if (!reportText.trim()) { setReportError('Report text is required'); return }
    setReportSaving(true)
    setReportError('')
    try {
      const updated = await incidentApi.fileReport(id, reportText.trim())
      setIncident(prev => prev ? { ...prev, incident_report: updated.incident_report } : prev)
      setShowReportForm(false)
    } catch (e: any) {
      setReportError(e.message || 'Failed to save report')
    } finally {
      setReportSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64"><Spinner size={24} /></div>
      </DashboardShell>
    )
  }

  if (!incident) {
    return (
      <DashboardShell>
        <div className="text-center py-16 text-text-muted text-sm">Incident not found.</div>
      </DashboardShell>
    )
  }

  const status = STATUS_CONFIG[incident.status]
  const responder = incident.responder_type ? RESPONDER_CONFIG[incident.responder_type] : null
  const currentIndex = STATUS_FLOW.indexOf(incident.status)
  const canUpdate = isAdmin && incident.status !== 'resolved'
  const hasReport = !!incident.incident_report?.trim()

  return (
    <DashboardShell>
      <div className="mb-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors mb-4">
          <ArrowLeft size={14} />
          Back to incidents
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display font-bold text-xl text-text-primary capitalize">{incident.incident_type}</h1>
              <Badge color={status.color} bg={status.bg}>
                <StatusDot color={status.color} pulse={status.pulse} />
                {status.label}
              </Badge>
            </div>
            <p className="text-xs text-text-muted font-mono">{incident.id}</p>
          </div>
          {canUpdate && (
            <div className="flex items-center gap-2">
              {!hasReport && (
                <Button size="sm" variant="secondary" icon={<FileText size={13} />}
                  onClick={() => setShowReportForm(v => !v)}>
                  {showReportForm ? 'Cancel Report' : 'File Report'}
                </Button>
              )}
              {STATUS_FLOW.slice(currentIndex + 1).map(s => (
                <Button key={s} size="sm"
                  variant={s === 'resolved' ? 'primary' : 'secondary'}
                  disabled={s === 'resolved' && !hasReport}
                  title={s === 'resolved' && !hasReport ? 'File a report first' : ''}
                  onClick={() => updateStatus(s)}
                  loading={updating}
                  icon={s === 'resolved' ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}>
                  Mark {STATUS_CONFIG[s].label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-0">
          {STATUS_FLOW.map((s, i) => {
            const done = STATUS_FLOW.indexOf(incident.status) >= i
            const sc = STATUS_CONFIG[s]
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                    style={{
                      borderColor: done ? sc.color : 'var(--border)',
                      background: done ? sc.bg : 'transparent',
                    }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: done ? sc.color : 'var(--border)' }} />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: done ? sc.color : 'var(--text-muted)' }}>
                    {sc.label}
                  </span>
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div className="flex-1 h-px mx-1 mb-4"
                    style={{ background: STATUS_FLOW.indexOf(incident.status) > i ? sc.color : 'var(--border)' }} />
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Report form */}
      {showReportForm && isAdmin && (
        <Card className="p-5 mb-4 border-accent/30">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileText size={13} /> Incident Report
          </h3>
          <Textarea
            rows={5}
            placeholder="Describe actions taken, outcome, and any relevant details..."
            value={reportText}
            onChange={e => setReportText(e.target.value)}
            className="mb-3"
          />
          {reportError && <p className="text-xs text-danger mb-2">{reportError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowReportForm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={reportSaving} icon={<FileText size={13} />}
              onClick={saveReport}>
              Save Report
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left col */}
        <div className="lg:col-span-2 space-y-4">
          {/* Incident details */}
          <Card className="p-5">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Incident Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={<User size={13} />} label="Reported By" value={incident.citizen_name} />
              <InfoRow icon={<AlertTriangle size={13} />} label="Type" value={incident.incident_type} capitalize />
              <InfoRow icon={<Clock size={13} />} label="Reported" value={formatDate(incident.created_at)} />
              <InfoRow icon={<Clock size={13} />} label="Last Updated" value={timeAgo(incident.updated_at)} />
              <div className="col-span-2">
                <InfoRow icon={<MapPin size={13} />} label="Coordinates"
                  value={`${parseFloat(incident.latitude).toFixed(5)}, ${parseFloat(incident.longitude).toFixed(5)}`}
                  mono />
              </div>
              {incident.notes && (
                <div className="col-span-2">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-text-secondary">{incident.notes}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Incident report (if filed) */}
          {hasReport && (
            <Card className="p-5">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText size={13} />
                Incident Report
                <span className="ml-auto text-[10px] font-medium text-success flex items-center gap-1">
                  <CheckCircle size={10} /> Filed
                </span>
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">{incident.incident_report}</p>
              {isAdmin && incident.status !== 'resolved' && (
                <button onClick={() => { setShowReportForm(true); setReportText(incident.incident_report || '') }}
                  className="mt-3 text-xs text-text-muted hover:text-accent transition-colors">
                  Edit report
                </button>
              )}
            </Card>
          )}

          {/* Dispatch info */}
          {(incident.responder_name || dispatch) && (
            <Card className="p-5">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Dispatch Details</h3>
              <div className="grid grid-cols-2 gap-4">
                {incident.responder_name && (
                  <>
                    <InfoRow icon={<Truck size={13} />} label="Assigned Unit" value={incident.responder_name} />
                    {responder && (
                      <div>
                        <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Service Type</p>
                        <span className="text-xs font-medium px-2 py-1 rounded"
                          style={{ color: responder.color, background: `${responder.color}18` }}>
                          {responder.label}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {dispatch && (
                  <>
                    <InfoRow icon={<Clock size={13} />} label="Dispatched At" value={formatDate(dispatch.dispatched_at)} />
                    {dispatch.resolved_at && (
                      <InfoRow icon={<CheckCircle size={13} />} label="Resolved At" value={formatDate(dispatch.resolved_at)} />
                    )}
                    {dispatch.vehicle_code && (
                      <InfoRow icon={<Truck size={13} />} label="Vehicle Code" value={dispatch.vehicle_code} mono />
                    )}
                    {dispatch.latitude && dispatch.longitude && (
                      <InfoRow icon={<MapPin size={13} />} label="Last Position"
                        value={`${parseFloat(dispatch.latitude).toFixed(5)}, ${parseFloat(dispatch.longitude).toFixed(5)}`} mono />
                    )}
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Map */}
        <Card className="overflow-hidden h-[360px]">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-text-primary">Location</span>
          </div>
          <div style={{ height: 'calc(100% - 41px)' }}>
            <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner /></div>}>
              <IncidentMap incidents={[incident]} height="100%" zoom={14}
                center={[parseFloat(incident.latitude), parseFloat(incident.longitude)]} />
            </Suspense>
          </div>
        </Card>
      </div>
    </DashboardShell>
  )
}

function InfoRow({ icon, label, value, capitalize, mono }: {
  icon: React.ReactNode; label: string; value: string; capitalize?: boolean; mono?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted uppercase tracking-wider mb-1">
        {icon}{label}
      </div>
      <p className={`text-sm text-text-primary ${capitalize ? 'capitalize' : ''} ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}
