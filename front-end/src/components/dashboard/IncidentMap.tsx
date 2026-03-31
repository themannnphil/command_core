'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Incident, Vehicle, Responder } from '@/lib/api'
import { RESPONDER_CONFIG } from '@/lib/utils'

interface MapProps {
  incidents?: Incident[]
  vehicles?: Vehicle[]
  responders?: Responder[]
  center?: [number, number]
  zoom?: number
  height?: string
}

export function IncidentMap({
  incidents = [],
  vehicles = [],
  responders = [],
  center = [5.5502, -0.2174],
  zoom = 12,
  height = '100%',
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let L: any
    let map: any

    const init = async () => {
      L = (await import('leaflet')).default

      map = L.map(containerRef.current!, { zoomControl: true, attributionControl: true })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      map.setView(center, zoom)
      renderMarkers(L, map)
    }

    init()

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  const renderMarkers = useCallback((L: any, map: any) => {
    if (!L || !map) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const makeIcon = (color: string, symbol: string, pulse = false) => {
      const html = `
        <div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          background:${color};transform:rotate(-45deg);
          border:2px solid rgba(255,255,255,0.25);
          box-shadow:0 2px 12px ${color}60;
          display:flex;align-items:center;justify-content:center;
          ${pulse ? `animation:pulse-marker 2s infinite` : ''}
        ">
          <span style="transform:rotate(45deg);font-size:13px">${symbol}</span>
        </div>
      `
      return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] })
    }

    // Incident markers
    incidents.forEach(inc => {
      const lat = parseFloat(inc.latitude)
      const lon = parseFloat(inc.longitude)
      if (isNaN(lat) || isNaN(lon)) return

      const colorMap: Record<string, string> = {
        dispatched: '#f59e0b', in_progress: '#3b82f6', created: '#6b7280'
      }
      const color = colorMap[inc.status] || '#6b7280'
      const symbol = inc.incident_type.toLowerCase().includes('fire') ? '🔥'
        : inc.incident_type.toLowerCase().includes('medic') || inc.incident_type.toLowerCase().includes('accid') ? '🚑'
        : '🚨'

      const marker = L.marker([lat, lon], { icon: makeIcon(color, symbol, inc.status !== 'resolved') })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:var(--font-body,sans-serif);min-width:180px">
            <p style="font-weight:600;font-size:13px;margin-bottom:6px;color:var(--text-primary,#f0f2f5)">${inc.incident_type}</p>
            <p style="font-size:11px;color:#8b95a1;margin-bottom:4px">Reported by: ${inc.citizen_name}</p>
            ${inc.responder_name ? `<p style="font-size:11px;color:#8b95a1">Unit: ${inc.responder_name}</p>` : ''}
            <span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${color}22;color:${color};text-transform:uppercase">${inc.status.replace('_', ' ')}</span>
          </div>
        `)
      markersRef.current.push(marker)
    })

    // Vehicle markers
    vehicles.forEach(v => {
      if (!v.latitude || !v.longitude) return
      const lat = parseFloat(v.latitude)
      const lon = parseFloat(v.longitude)
      if (isNaN(lat) || isNaN(lon)) return

      const color = v.vehicle_type ? RESPONDER_CONFIG[v.vehicle_type]?.color : '#3b82f6'
      const symbol = v.vehicle_type === 'ambulance' ? '🚑' : v.vehicle_type === 'fire' ? '🚒' : '🚔'

      const marker = L.marker([lat, lon], { icon: makeIcon(color, symbol) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:var(--font-body,sans-serif)">
            <p style="font-weight:600;font-size:13px;margin-bottom:4px;color:#f0f2f5">${v.responder_name || v.vehicle_code}</p>
            <p style="font-size:11px;color:#8b95a1">Status: ${v.status}</p>
          </div>
        `)
      markersRef.current.push(marker)
    })

    // Responder base markers (available units)
    responders.filter(r => r.is_available).forEach(r => {
      const lat = parseFloat(r.latitude)
      const lon = parseFloat(r.longitude)
      if (isNaN(lat) || isNaN(lon)) return
      const color = RESPONDER_CONFIG[r.type]?.color || '#6b7280'
      const symbol = r.type === 'ambulance' ? '🏥' : r.type === 'fire' ? '🚒' : '🏛'

      const marker = L.circleMarker([lat, lon], {
        radius: 6, fillColor: color, color: color, weight: 2,
        opacity: 0.7, fillOpacity: 0.3,
      })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:var(--font-body,sans-serif)">
            <p style="font-weight:600;font-size:12px;color:#f0f2f5">${r.name}</p>
            <p style="font-size:11px;color:#10b981;margin-top:2px">Available</p>
          </div>
        `)
      markersRef.current.push(marker)
    })
  }, [incidents, vehicles, responders])

  // Re-render markers when data changes
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(({ default: L }) => renderMarkers(L, mapRef.current))
  }, [incidents, vehicles, responders, renderMarkers])

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <style>{`
        @keyframes pulse-marker {
          0%,100%{box-shadow:0 2px 12px currentColor}
          50%{box-shadow:0 2px 24px currentColor,0 0 0 8px transparent}
        }
      `}</style>
      <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-lg)' }} />
    </div>
  )
}
