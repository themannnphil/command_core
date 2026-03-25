'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, AlertTriangle, Truck, BarChart3,
  LogOut, Radio, Users, CrossIcon
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',   label: 'Overview',    icon: LayoutDashboard },
  { href: '/incidents',   label: 'Incidents',   icon: AlertTriangle },
  { href: '/dispatch',    label: 'Dispatch',    icon: Truck },
  { href: '/analytics',  label: 'Analytics',   icon: BarChart3 },
  { href: '/users',      label: 'Users',       icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-surface border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <span className="font-display font-bold text-text-primary text-base leading-none">LifeLink</span>
            <span className="block text-[9px] text-text-muted tracking-widest uppercase mt-0.5">Command Core</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150',
                active
                  ? 'bg-accent-muted text-accent font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}>
              <Icon size={16} strokeWidth={active ? 2 : 1.5} />
              {label}
              {active && <span className="ml-auto w-1 h-1 rounded-full bg-accent" />}
            </Link>
          )
        })}
      </nav>

      {/* MQTT indicator */}
      <MqttIndicator />

      {/* User */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-semibold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{user?.name}</p>
            <p className="text-[10px] text-text-muted truncate capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button onClick={logout}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-danger transition-colors w-full">
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}

function MqttIndicator() {
  const [connected, setConnected] = require('react').useState(false)

  require('react').useEffect(() => {
    import('mqtt').then((mqtt) => {
      const client = mqtt.connect('ws://localhost:9001', {
        clientId: `ll-indicator-${Date.now()}`, connectTimeout: 4000,
      })
      client.on('connect', () => setConnected(true))
      client.on('close', () => setConnected(false))
      client.on('error', () => setConnected(false))
      return () => client.end(true)
    }).catch(() => setConnected(false))
  }, [])

  return (
    <div className="px-4 py-3 border-t border-border">
      <div className="flex items-center gap-2">
        <Radio size={12} className={connected ? 'text-success' : 'text-text-muted'} />
        <span className="text-[10px] text-text-muted">MQTT</span>
        <span className={cn(
          'ml-auto text-[10px] font-medium',
          connected ? 'text-success' : 'text-text-muted'
        )}>
          {connected ? 'Live' : 'Offline'}
        </span>
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-success pulse-success' : 'bg-text-muted'
        )} />
      </div>
    </div>
  )
}
