import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { API_URL } from './client'
import { matchesFilters, withDistance } from './filters'
import type { Earthquake, Filters } from './types'

export type LiveStatus = 'connecting' | 'live' | 'offline'
export type LiveKind = 'added' | 'updated'

/** Put a pushed quake into every cached list whose filter it matches, or update it in place. */
function mergeIntoCache(qc: QueryClient, q: Earthquake) {
  const now = Date.now()
  for (const [key, data] of qc.getQueriesData<Earthquake[]>({ queryKey: ['earthquakes'] })) {
    if (!data) continue
    const filters = key[1] as Filters
    const idx = data.findIndex((e) => e.id === q.id)
    const matches = matchesFilters(q, filters, now)
    const row = withDistance(q, filters)
    let next: Earthquake[] | undefined
    if (idx >= 0) {
      next = matches ? data.with(idx, row) : data.toSpliced(idx, 1) // a revision can move it out of the filter
    } else if (matches) {
      next = [row, ...data]
    }
    if (next) qc.setQueryData(key, next)
  }
  qc.setQueryData(['earthquake', q.id], q)
}

/**
 * Connects to /hubs/quakes, keeps the TanStack cache current and reports each event to `onEvent`.
 * Reconnects forever with capped exponential backoff.
 */
export function useLiveQuakes(onEvent: (kind: LiveKind, q: Earthquake) => void): LiveStatus {
  const qc = useQueryClient()
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent })

  useEffect(() => {
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let statsTimer: ReturnType<typeof setTimeout> | undefined
    let startAttempts = 0

    const conn = new HubConnectionBuilder()
      .withUrl(`${API_URL}/hubs/quakes`)
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1000 * 2 ** ctx.previousRetryCount) })
      .configureLogging(LogLevel.None)
      .build()

    const refreshStats = () => {
      clearTimeout(statsTimer)
      statsTimer = setTimeout(() => void qc.invalidateQueries({ queryKey: ['stats'] }), 1500)
    }

    const handle = (kind: LiveKind) => (q: Earthquake) => {
      mergeIntoCache(qc, { ...q, distanceKm: null })
      refreshStats()
      onEventRef.current(kind, q)
    }
    conn.on('QuakeAdded', handle('added'))
    conn.on('QuakeUpdated', handle('updated'))

    const resync = () => {
      void qc.invalidateQueries({ queryKey: ['earthquakes'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['health'] })
    }

    conn.onreconnecting(() => !disposed && setStatus('offline'))
    conn.onreconnected(() => {
      if (disposed) return
      setStatus('live')
      resync() // events may have been missed while offline
    })
    conn.onclose(() => {
      if (disposed) return
      setStatus('offline')
      scheduleStart()
    })

    const start = async () => {
      if (disposed || conn.state !== HubConnectionState.Disconnected) return
      try {
        await conn.start()
        if (disposed) return
        if (startAttempts > 0) resync()
        startAttempts = 0
        setStatus('live')
      } catch {
        if (disposed) return
        setStatus('offline')
        scheduleStart()
      }
    }
    const scheduleStart = () => {
      clearTimeout(retryTimer)
      retryTimer = setTimeout(start, Math.min(30_000, 1000 * 2 ** startAttempts++))
    }

    void start()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearTimeout(statsTimer)
      void conn.stop()
    }
  }, [qc])

  return status
}
