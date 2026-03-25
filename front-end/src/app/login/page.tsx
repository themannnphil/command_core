'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { login, isAuthenticated, loading: authLoading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, authLoading, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return setError('Email and password are required')
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] border-r border-border p-10"
        style={{ background: 'var(--surface)' }}>
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v14M1 8h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <span className="font-display font-bold text-text-primary text-lg leading-none block">LifeLink</span>
              <span className="text-[10px] text-text-muted tracking-widest uppercase">Command Core</span>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="font-display font-bold text-3xl text-text-primary leading-tight mb-3">
                Emergency Response<br />Coordination
              </h1>
              <p className="text-sm text-text-secondary leading-relaxed">
                Unified dispatch platform for Ghana's emergency services. Real-time incident logging, automated responder assignment, and live vehicle tracking.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Automated Dispatch', desc: 'Nearest responder assigned instantly using Haversine routing' },
                { label: 'Live Vehicle Tracking', desc: 'Real-time GPS over MQTT — zero latency' },
                { label: 'Multi-Service Coordination', desc: 'Police, fire, and ambulance in one platform' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--accent)' }} />
                  <div>
                    <p className="text-xs font-semibold text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-text-muted">
          &copy; {new Date().getFullYear()} Command Core &middot; University of Ghana &middot; CPEN 421
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-display font-bold text-text-primary text-base">LifeLink</span>
          </div>

          <div className="mb-8">
            <h2 className="font-display font-bold text-2xl text-text-primary mb-2">Sign in</h2>
            <p className="text-sm text-text-muted">Authorized personnel only</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@emergency.gov.gh"
                autoComplete="email"
                className="bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger bg-danger-muted border border-danger/20 rounded px-3 py-2.5">
                <AlertTriangle size={13} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background: 'var(--accent)' }}
              onMouseEnter={e => !loading && ((e.target as HTMLElement).style.background = 'var(--accent-hover)')}
              onMouseLeave={e => ((e.target as HTMLElement).style.background = 'var(--accent)')}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-text-muted text-center">
              Need an account? Contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
