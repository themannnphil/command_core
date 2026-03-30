'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Package, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  BedDouble, Ambulance, ShieldCheck, Flame, CheckCircle, XCircle
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, Button, SectionHeader, Input, Select, Spinner, EmptyState } from '@/components/ui/index'
import { resourceApi, Responder, HospitalCapacity, ResponderType, UserRole } from '@/lib/api'
import { RESPONDER_CONFIG, cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const DEPT_CONFIG: Record<string, {
  label: string
  responderType: ResponderType
  unitLabel: string
  icon: React.ElementType
  color: string
}> = {
  hospital_admin: { label: 'Hospital', responderType: 'ambulance', unitLabel: 'Ambulance Units', icon: Ambulance, color: '#10b981' },
  police_admin:   { label: 'Police',   responderType: 'police',    unitLabel: 'Police Units',     icon: ShieldCheck, color: '#6366f1' },
  fire_admin:     { label: 'Fire',     responderType: 'fire',      unitLabel: 'Fire Units',       icon: Flame,       color: '#f97316' },
}

export default function ResourcesPage() {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined

  if (!role || !['system_admin', 'hospital_admin', 'police_admin', 'fire_admin'].includes(role)) {
    return (
      <DashboardShell>
        <div className="text-center py-16 text-text-muted text-sm">Access denied.</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="font-display font-bold text-xl text-text-primary flex items-center gap-2">
          <Package size={20} /> Resources
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          {role === 'system_admin' ? 'System-wide resource overview' : `${DEPT_CONFIG[role]?.label} department resources`}
        </p>
      </div>

      {role === 'system_admin' ? (
        <SystemAdminResources />
      ) : role === 'hospital_admin' ? (
        <>
          <HospitalCapacitySection />
          <div className="mt-6">
            <ResponderSection responderType="ambulance" unitLabel="Ambulance Units" color="#10b981" />
          </div>
        </>
      ) : role === 'police_admin' ? (
        <ResponderSection responderType="police" unitLabel="Police Units" color="#6366f1" />
      ) : role === 'fire_admin' ? (
        <ResponderSection responderType="fire" unitLabel="Fire Units" color="#f97316" />
      ) : null}
    </DashboardShell>
  )
}

// ─── System Admin: all departments overview ───────────────
function SystemAdminResources() {
  return (
    <div className="space-y-8">
      <HospitalCapacitySection />
      <ResponderSection responderType="ambulance" unitLabel="Ambulance Units" color="#10b981" />
      <ResponderSection responderType="police" unitLabel="Police Units" color="#6366f1" />
      <ResponderSection responderType="fire" unitLabel="Fire Units" color="#f97316" />
    </div>
  )
}

// ─── Hospital Capacity Section ────────────────────────────
function HospitalCapacitySection() {
  const [hospitals, setHospitals] = useState<HospitalCapacity[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<HospitalCapacity | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit form state
  const [editTotal, setEditTotal] = useState(0)
  const [editAvailable, setEditAvailable] = useState(0)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newTotal, setNewTotal] = useState(0)
  const [newAvailable, setNewAvailable] = useState(0)

  const load = useCallback(async () => {
    try {
      const data = await resourceApi.hospitalCapacity()
      setHospitals(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (h: HospitalCapacity) => {
    setEditing(h)
    setEditTotal(h.total_beds)
    setEditAvailable(h.available_beds)
    setError('')
  }

  const saveEdit = async () => {
    if (!editing) return
    if (editAvailable > editTotal) { setError('Available beds cannot exceed total beds'); return }
    setSaving(true); setError('')
    try {
      const updated = await resourceApi.updateHospitalCapacity(editing.id, {
        total_beds: editTotal,
        available_beds: editAvailable,
      })
      setHospitals(prev => prev.map(h => h.id === updated.id ? updated : h))
      setEditing(null)
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addHospital = async () => {
    if (!newName.trim()) { setError('Hospital name required'); return }
    if (newAvailable > newTotal) { setError('Available beds cannot exceed total beds'); return }
    setSaving(true); setError('')
    try {
      const created = await resourceApi.createHospitalCapacity({
        hospital_name: newName.trim(),
        total_beds: newTotal,
        available_beds: newAvailable,
      })
      setHospitals(prev => [...prev, created])
      setNewName(''); setNewTotal(0); setNewAvailable(0); setShowAdd(false)
    } catch (e: any) {
      setError(e.message || 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <SectionHeader
        title="Hospital Bed Capacity"
        subtitle="Track and update bed availability across facilities"
        action={
          <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => { setShowAdd(v => !v); setError('') }}>
            Add Hospital
          </Button>
        }
      />

      {/* Add hospital form */}
      {showAdd && (
        <div className="mb-4 p-4 bg-surface-2 rounded-lg border border-border space-y-3">
          <p className="text-xs font-semibold text-text-primary">New Hospital</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <Input label="Hospital Name" placeholder="e.g. Ridge Hospital"
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <Input label="Total Beds" type="number" min={0}
              value={newTotal} onChange={e => setNewTotal(parseInt(e.target.value) || 0)} />
            <Input label="Available Beds" type="number" min={0}
              value={newAvailable} onChange={e => setNewAvailable(parseInt(e.target.value) || 0)} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={saving} onClick={addHospital} icon={<Plus size={13} />}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Spinner /></div>
      ) : hospitals.length === 0 ? (
        <EmptyState icon={<BedDouble size={28} />} message="No hospital capacity records" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Hospital', 'Total Beds', 'Available', 'Utilization', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hospitals.map(h => {
                const used = h.total_beds - h.available_beds
                const pct = h.total_beds > 0 ? Math.round((used / h.total_beds) * 100) : 0
                const isEditing = editing?.id === h.id
                return (
                  <tr key={h.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-text-primary">{h.hospital_name}</td>
                    <td className="px-3 py-3">
                      {isEditing
                        ? <input type="number" min={0} value={editTotal}
                            onChange={e => setEditTotal(parseInt(e.target.value) || 0)}
                            className="w-20 bg-surface border border-accent/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none" />
                        : <span className="text-sm text-text-primary">{h.total_beds}</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {isEditing
                        ? <input type="number" min={0} value={editAvailable}
                            onChange={e => setEditAvailable(parseInt(e.target.value) || 0)}
                            className="w-20 bg-surface border border-accent/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none" />
                        : <span className={cn('text-sm font-semibold', h.available_beds > 0 ? 'text-success' : 'text-danger')}>
                            {h.available_beds}
                          </span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden max-w-[80px]">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)',
                            }} />
                        </div>
                        <span className="text-xs text-text-muted">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          {error && <span className="text-xs text-danger">{error}</span>}
                          <Button size="sm" variant="primary" loading={saving} onClick={saveEdit}
                            icon={<CheckCircle size={12} />}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => startEdit(h)}>
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Responder (Unit) Section ─────────────────────────────
function ResponderSection({ responderType, unitLabel, color }: {
  responderType: ResponderType; unitLabel: string; color: string
}) {
  const [responders, setResponders] = useState<Responder[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newLat, setNewLat] = useState('')
  const [newLon, setNewLon] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await resourceApi.responders()
      setResponders(data.filter(r => r.type === responderType))
    } finally {
      setLoading(false)
    }
  }, [responderType])

  useEffect(() => { load() }, [load])

  const toggleAvailability = async (r: Responder) => {
    setToggling(r.id)
    try {
      const updated = await resourceApi.updateAvailability(r.id, !r.is_available)
      setResponders(prev => prev.map(x => x.id === updated.id ? updated : x))
    } finally {
      setToggling(null)
    }
  }

  const deleteResponder = async (id: string) => {
    if (!confirm('Remove this unit?')) return
    setDeleting(id)
    try {
      await resourceApi.deleteResponder(id)
      setResponders(prev => prev.filter(r => r.id !== id))
    } catch (e: any) {
      alert(e.message || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const addUnit = async () => {
    if (!newName.trim() || !newLat || !newLon) { setError('All fields required'); return }
    const lat = parseFloat(newLat); const lon = parseFloat(newLon)
    if (isNaN(lat) || isNaN(lon)) { setError('Latitude and longitude must be valid numbers'); return }
    setSaving(true); setError('')
    try {
      const created = await resourceApi.createResponder({ name: newName.trim(), type: responderType, latitude: lat, longitude: lon })
      setResponders(prev => [...prev, created])
      setNewName(''); setNewLat(''); setNewLon(''); setShowAdd(false)
    } catch (e: any) {
      setError(e.message || 'Failed to add unit')
    } finally {
      setSaving(false)
    }
  }

  const available = responders.filter(r => r.is_available).length
  const total = responders.length

  return (
    <Card className="p-5">
      <SectionHeader
        title={unitLabel}
        subtitle={`${available} of ${total} units available`}
        action={
          <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => { setShowAdd(v => !v); setError('') }}>
            Add Unit
          </Button>
        }
      />

      {/* Summary pills */}
      <div className="flex items-center gap-3 mb-4">
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: `${color}18`, color }}>
          <CheckCircle size={11} /> {available} Available
        </span>
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-2 text-text-muted">
          <XCircle size={11} /> {total - available} Deployed/Unavailable
        </span>
      </div>

      {/* Add unit form */}
      {showAdd && (
        <div className="mb-4 p-4 bg-surface-2 rounded-lg border border-border space-y-3">
          <p className="text-xs font-semibold text-text-primary">New Unit</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="Unit Name" placeholder={`e.g. Tema ${unitLabel.split(' ')[0]} Unit`}
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <Input label="Latitude" placeholder="5.5502" value={newLat} onChange={e => setNewLat(e.target.value)} />
            <Input label="Longitude" placeholder="-0.2174" value={newLon} onChange={e => setNewLon(e.target.value)} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={saving} onClick={addUnit} icon={<Plus size={13} />}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Spinner /></div>
      ) : responders.length === 0 ? (
        <EmptyState icon={<Package size={28} />} message={`No ${unitLabel.toLowerCase()} registered`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Unit Name', 'Location (Lat, Lon)', 'Status', 'Availability', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responders.map(r => (
                <tr key={r.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-3 text-sm font-medium text-text-primary">{r.name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-text-muted">
                    {parseFloat(r.latitude).toFixed(4)}, {parseFloat(r.longitude).toFixed(4)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      'text-[11px] font-medium px-2 py-0.5 rounded',
                      r.is_available ? 'text-success bg-success/10' : 'text-warning bg-warning/10'
                    )}>
                      {r.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      disabled={toggling === r.id}
                      onClick={() => toggleAvailability(r)}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                      title={r.is_available ? 'Mark unavailable' : 'Mark available'}>
                      {toggling === r.id
                        ? <Spinner size={14} />
                        : r.is_available
                          ? <ToggleRight size={18} style={{ color }} />
                          : <ToggleLeft size={18} className="text-text-muted" />
                      }
                      {r.is_available ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      disabled={deleting === r.id}
                      onClick={() => deleteResponder(r.id)}
                      className="text-text-muted hover:text-danger transition-colors">
                      {deleting === r.id ? <Spinner size={13} /> : <Trash2 size={13} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
