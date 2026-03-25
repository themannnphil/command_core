'use client'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { ReactNode, ButtonHTMLAttributes } from 'react'

// ─── Badge ────────────────────────────────────────────────
export function Badge({ children, color, bg }: { children: ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{ color, background: bg }} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase">
      {children}
    </span>
  )
}

// ─── Button ───────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-2 font-medium rounded transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface-2 text-text-primary border border-border hover:border-border-subtle hover:bg-surface',
    ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface-2',
    danger: 'bg-danger-muted text-danger border border-danger/20 hover:bg-danger/20',
  }
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-surface border border-border rounded-lg', className)}>
      {children}
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-text-muted" />
}

// ─── Status dot ───────────────────────────────────────────
export function StatusDot({ color, pulse }: { color: string; pulse?: string }) {
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', pulse)}
      style={{ background: color }} />
  )
}

// ─── Section header ───────────────────────────────────────
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary tracking-wide">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────
export function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-muted">
      <div className="opacity-30">{icon}</div>
      <p className="text-xs">{message}</p>
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string
}
export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <input
        className={cn(
          'bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent/60 transition-colors',
          error && 'border-danger/50',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; options: { value: string; label: string }[]
}
export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <select
        className={cn(
          'bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-primary',
          'focus:outline-none focus:border-accent/60 transition-colors appearance-none',
          className
        )}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}
export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <textarea
        className={cn(
          'bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none',
          'focus:outline-none focus:border-accent/60 transition-colors',
          className
        )}
        {...props}
      />
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────
export function StatCard({ label, value, icon, color, sub }: {
  label: string; value: string | number; icon: ReactNode; color?: string; sub?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
        <span style={{ color: color || 'var(--accent)', background: color ? `${color}18` : 'var(--accent-muted)' }}
          className="p-1.5 rounded">
          {icon}
        </span>
      </div>
      <p className="text-2xl font-display font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </Card>
  )
}
