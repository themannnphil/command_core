'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, X, AlertTriangle, Shield, User } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, Button, Spinner, EmptyState, Input, Select, Badge } from '@/components/ui/index'
import { authApi, User as UserType, UserRole, RegisterPayload } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  system_admin:    { label: 'System Admin',   color: '#3b82f6' },
  hospital_admin:  { label: 'Hospital Admin', color: '#10b981' },
  police_admin:    { label: 'Police Admin',   color: '#6366f1' },
  fire_admin:      { label: 'Fire Admin',     color: '#f97316' },
  ambulance_driver:{ label: 'Amb. Driver',    color: '#f59e0b' },
}

const ROLE_OPTIONS = Object.entries(ROLE_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))

const EMPTY_FORM: RegisterPayload = {
  name: '', email: '', password: '', role: 'system_admin',
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<RegisterPayload>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await authApi.users()
      setUsers(data)
    } catch {
      // non-admin will hit 403 — show empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const register = async () => {
    if (!form.name || !form.email || !form.password) return setError('All fields are required')
    setSubmitting(true)
    setError('')
    try {
      await authApi.register(form)
      setSuccess(`${form.name} registered successfully`)
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const set = (key: keyof RegisterPayload) => (e: any) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const isAdmin = me?.role === 'system_admin'

  return (
    <DashboardShell>
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-success-muted border border-success/20 rounded-lg px-4 py-3 shadow-xl animate-slide-in">
          <span className="text-xs text-success font-medium">{success}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Users</h1>
          <p className="text-xs text-text-muted mt-0.5">{users.length} registered personnel</p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowForm(p => !p)}>
            Register User
          </Button>
        )}
      </div>

      {/* Register form */}
      {showForm && isAdmin && (
        <Card className="p-5 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-accent" />
              <h3 className="text-sm font-semibold text-text-primary">Register New User</h3>
            </div>
            <button onClick={() => { setShowForm(false); setError('') }}
              className="text-text-muted hover:text-text-primary transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Input label="Full Name" placeholder="Kwame Asante" value={form.name} onChange={set('name')} />
            <Input label="Email Address" type="email" placeholder="user@emergency.gov.gh" value={form.email} onChange={set('email')} />
            <Input label="Password" type="password" placeholder="Minimum 8 characters" value={form.password} onChange={set('password')} />
            <Select label="Role" value={form.role} onChange={set('role')} options={ROLE_OPTIONS} />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger-muted rounded px-3 py-2 mb-3">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={submitting} icon={<Shield size={13} />} onClick={register}>
              Create Account
            </Button>
          </div>
        </Card>
      )}

      {/* Users table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : users.length === 0 ? (
          <EmptyState icon={<Users size={28} />} message={isAdmin ? 'No users registered yet' : 'Access restricted to system administrators'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['User', 'Email', 'Role', 'Registered', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const role = ROLE_CONFIG[u.role]
                  const isMe = u.id === me?.id
                  return (
                    <tr key={u.id} className={cn(
                      'border-b border-border-subtle hover:bg-surface-2 transition-colors',
                      isMe && 'bg-accent-muted/30'
                    )}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                            style={{ background: `${role.color}22`, color: role.color }}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-text-primary">{u.name}</p>
                            {isMe && <span className="text-[9px] text-accent font-semibold uppercase tracking-wider">You</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded"
                          style={{ color: role.color, background: `${role.color}18` }}>
                          {role.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          Active
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardShell>
  )
}
