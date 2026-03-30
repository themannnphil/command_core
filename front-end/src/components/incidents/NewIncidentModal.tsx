'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { X, MapPin, AlertTriangle, Loader2 } from 'lucide-react'
import { incidentApi, CreateIncidentPayload } from '@/lib/api'
import { INCIDENT_TYPES } from '@/lib/utils'
import { Button, Input, Select, Textarea } from '@/components/ui/index'

interface Props {
  onClose: () => void
  onCreated: (result: any) => void
}

export function NewIncidentModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateIncidentPayload>({
    citizen_name: '', incident_type: 'Medical Emergency',
    latitude: 5.5502, longitude: -0.2174, notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pickingLocation, setPickingLocation] = useState(false)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: any
    const initMap = async () => {
      if (!mapContainerRef.current) return
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      map = L.map(mapContainerRef.current, { zoomControl: true })
      map.setView([form.latitude, form.longitude], 13)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      // Initial marker
      markerRef.current = L.marker([form.latitude, form.longitude], { draggable: true }).addTo(map)
        .bindPopup('Incident location').openPopup()

      markerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng()
        setForm(f => ({ ...f, latitude: parseFloat(lat.toFixed(6)), longitude: parseFloat(lng.toFixed(6)) }))
      })

      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        markerRef.current?.setLatLng([lat, lng])
        setForm(f => ({ ...f, latitude: parseFloat(lat.toFixed(6)), longitude: parseFloat(lng.toFixed(6)) }))
      })
    }
    initMap()
    return () => { if (map) map.remove() }
  }, [])

  const submit = async () => {
    if (!form.citizen_name.trim()) return setError('Citizen name is required')
    setLoading(true)
    setError('')
    try {
      const result = await incidentApi.create(form)
      onCreated(result)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create incident')
    } finally {
      setLoading(false)
    }
  }

  const set = (key: keyof CreateIncidentPayload) => (e: any) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-danger-muted">
              <AlertTriangle size={16} className="text-danger" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Log Emergency Incident</h2>
              <p className="text-xs text-text-muted">Fill all details received from the caller</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Caller Name *" placeholder="Full name of citizen" value={form.citizen_name} onChange={set('citizen_name')} />
            <Select
              label="Incident Type *"
              value={form.incident_type}
              onChange={set('incident_type')}
              options={INCIDENT_TYPES.map(t => ({ value: t, label: t }))}
            />
          </div>

          <Textarea label="Additional Notes" placeholder="Describe the situation as relayed by the caller..." rows={3} value={form.notes ?? ''} onChange={set('notes')} />

          {/* Map picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <MapPin size={12} />
                Incident Location *
              </label>
              <span className="text-[10px] text-text-muted font-mono">
                {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </span>
            </div>
            <div className="text-[11px] text-text-muted mb-2">Click the map or drag the marker to set the precise location.</div>
            <div ref={mapContainerRef} style={{ height: 220, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger-muted rounded px-3 py-2">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={loading} icon={<AlertTriangle size={14} />}>
            Dispatch Emergency
          </Button>
        </div>
      </div>
    </div>
  )
}
