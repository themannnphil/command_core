import { type IncidentStatus, type ResponderType } from './api'

export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; bg: string; pulse?: string }> = {
  created:     { label: 'Created',     color: 'var(--text-secondary)', bg: 'var(--surface-2)' },
  dispatched:  { label: 'Dispatched',  color: 'var(--warning)',        bg: 'var(--warning-muted)',  pulse: 'pulse-warning' },
  in_progress: { label: 'In Progress', color: 'var(--accent)',         bg: 'var(--accent-muted)',   pulse: 'pulse-warning' },
  resolved:    { label: 'Resolved',    color: 'var(--success)',        bg: 'var(--success-muted)' },
}

export const RESPONDER_CONFIG: Record<ResponderType, { label: string; color: string }> = {
  police:    { label: 'Police',    color: '#6366f1' },
  fire:      { label: 'Fire',      color: '#f97316' },
  ambulance: { label: 'Ambulance', color: '#10b981' },
}

export const INCIDENT_TYPE_MAP: Record<string, ResponderType> = {
  robbery: 'police', crime: 'police', assault: 'police', theft: 'police',
  fire: 'fire', explosion: 'fire', 'gas leak': 'fire',
  medical: 'ambulance', accident: 'ambulance', injury: 'ambulance',
}

export const INCIDENT_TYPES = [
  'Medical Emergency', 'Robbery', 'Fire', 'Assault', 'Accident',
  'Gas Leak', 'Theft', 'Explosion', 'Crime', 'Injury',
]
