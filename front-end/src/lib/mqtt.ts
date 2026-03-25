'use client'
import { useEffect, useRef, useCallback } from 'react'

const MQTT_WS_URL = 'ws://localhost:9001'

type MessageHandler = (topic: string, payload: unknown) => void

export function useMqtt(onMessage: MessageHandler) {
  const clientRef = useRef<ReturnType<typeof import('mqtt').connect> | null>(null)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    let mounted = true
    let mqttModule: typeof import('mqtt') | null = null

    const connect = async () => {
      try {
        mqttModule = await import('mqtt')
        if (!mounted) return

        const client = mqttModule.connect(MQTT_WS_URL, {
          clientId: `lifelink-dashboard-${Date.now()}`,
          reconnectPeriod: 3000,
          connectTimeout: 5000,
        })

        clientRef.current = client

        client.on('connect', () => {
          console.log('[MQTT] Dashboard connected')
          client.subscribe('incidents/new', { qos: 1 })
          client.subscribe('incidents/+/status', { qos: 1 })
          client.subscribe('vehicles/+/location', { qos: 1 })
        })

        client.on('message', (topic, message) => {
          try {
            const payload = JSON.parse(message.toString())
            handlerRef.current(topic, payload)
          } catch {
            // ignore malformed
          }
        })

        client.on('error', (err) => {
          console.warn('[MQTT] Connection error:', err.message)
        })
      } catch (err) {
        console.warn('[MQTT] Could not load mqtt library:', err)
      }
    }

    connect()

    return () => {
      mounted = false
      if (clientRef.current) {
        clientRef.current.end(true)
        clientRef.current = null
      }
    }
  }, [])
}

export function useMqttStatus() {
  const connectedRef = useRef(false)
  const [connected, setConnected] = useStateRef(false)

  useEffect(() => {
    let client: ReturnType<typeof import('mqtt').connect> | null = null

    import('mqtt').then((mqtt) => {
      client = mqtt.connect(MQTT_WS_URL, {
        clientId: `lifelink-status-${Date.now()}`,
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      })
      client.on('connect', () => setConnected(true))
      client.on('close', () => setConnected(false))
      client.on('error', () => setConnected(false))
    }).catch(() => setConnected(false))

    return () => { client?.end(true) }
  }, [])

  return connected
}

// Simple state ref helper
function useStateRef<T>(initial: T): [T, (v: T) => void] {
  const { useState } = require('react')
  return useState(initial)
}
