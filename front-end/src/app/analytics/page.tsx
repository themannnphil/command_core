'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Clock, Truck, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line, Legend
} from 'recharts'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Card, SectionHeader, StatCard, Spinner } from '@/components/ui/index'
import { analyticsApi, AnalyticsSummary, ResponseTimeData, RegionData, UtilizationData } from '@/lib/api'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f97316', '#6366f1', '#f59e0b', '#ef4444']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-text-primary mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(p.value % 1 === 0 ? 0 : 2) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [rt, setRt] = useState<ResponseTimeData | null>(null)
  const [region, setRegion] = useState<RegionData | null>(null)
  const [util, setUtil] = useState<UtilizationData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, reg, u] = await Promise.allSettled([
        analyticsApi.summary(),
        analyticsApi.responseTimes(),
        analyticsApi.byRegion(),
        analyticsApi.resourceUtilization(),
      ])
      if (s.status === 'fulfilled') setSummary(s.value)
      if (r.status === 'fulfilled') setRt(r.value)
      if (reg.status === 'fulfilled') setRegion(reg.value)
      if (u.status === 'fulfilled') setUtil(u.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const resolvedPct = summary
    ? Math.round((summary.resolvedIncidents / (summary.totalIncidents || 1)) * 100)
    : 0

  const typeData = region?.byType?.map(t => ({
    name: t.incident_type,
    count: parseInt(t.count),
  })) || []

  const responderData = rt?.byResponderType?.map(r => ({
    name: r.responder_type,
    avg: parseFloat(r.avg_minutes || '0'),
    total: parseInt(r.total),
  })) || []

  const utilizationData = util?.responderUtilization?.map(u => ({
    name: u.unit_name?.split(' ').slice(0, 2).join(' ') || u.unit_type,
    total: parseInt(u.total_dispatches),
    resolved: parseInt(u.resolved),
    active: parseInt(u.active),
  })) || []

  const statusData = util?.statusSummary?.map((s, i) => ({
    name: s.status.replace('_', ' '),
    value: parseInt(s.count),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })) || []

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Analytics</h1>
          <p className="text-xs text-text-muted mt-0.5">Operational insights and performance metrics</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Spinner size={24} /></div>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Incidents" value={summary?.totalIncidents ?? 0} icon={<AlertTriangle size={15} />} color="var(--danger)" />
            <StatCard label="Resolved" value={`${summary?.resolvedIncidents ?? 0} (${resolvedPct}%)`} icon={<BarChart3 size={15} />} color="var(--success)" sub="Resolution rate" />
            <StatCard label="Avg Response Time" value={summary?.avgResponseMinutes ? `${Number(summary.avgResponseMinutes).toFixed(1)}m` : 'N/A'} icon={<Clock size={15} />} color="var(--accent)" />
            <StatCard label="Today" value={summary?.incidentsToday ?? 0} icon={<AlertTriangle size={15} />} color="var(--warning)" sub="Incidents logged today" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Incidents by type */}
            <Card className="p-5">
              <SectionHeader title="Incidents by Type" subtitle="Total count per incident category" />
              {typeData.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-8">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={typeData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                      axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                      axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
                      {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Incident status breakdown */}
            <Card className="p-5">
              <SectionHeader title="Status Distribution" subtitle="Current breakdown by status" />
              {statusData.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-8">No data yet</p>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                        dataKey="value" paddingAngle={3}>
                        {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {statusData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                          <span className="text-xs text-text-secondary capitalize">{d.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-text-primary">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Response times by service */}
          <Card className="p-5 mb-4">
            <SectionHeader title="Average Response Time by Service" subtitle="Minutes from dispatch to resolution" />
            {responderData.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-8">No resolved incidents yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={responderData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                    axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="avg" name="Avg minutes" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" name="Total dispatches" fill="var(--success)" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Responder utilization */}
          {utilizationData.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Responder Utilization" subtitle="Total dispatches per unit" />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {['Unit', 'Type', 'Total Dispatches', 'Resolved', 'Active'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {utilizationData.map((u, i) => (
                      <tr key={i} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                        <td className="px-3 py-3 text-xs text-text-primary">{u.name}</td>
                        <td className="px-3 py-3">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded capitalize"
                            style={{ color: CHART_COLORS[i % CHART_COLORS.length], background: `${CHART_COLORS[i % CHART_COLORS.length]}18` }}>
                            {util?.responderUtilization[i]?.unit_type}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-text-primary">{u.total}</td>
                        <td className="px-3 py-3 text-xs text-success">{u.resolved}</td>
                        <td className="px-3 py-3 text-xs text-warning">{u.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </DashboardShell>
  )
}
