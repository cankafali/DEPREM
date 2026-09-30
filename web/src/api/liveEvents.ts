import type { Earthquake } from './types'

type Listener = (q: Earthquake) => void

/**
 * Fire-and-forget channel for "a new quake just arrived" so imperative views (seismograph,
 * map ring) see every event, even when React batches several state updates into one render.
 */
const listeners = new Set<Listener>()

export const quakeArrivals = {
  emit(q: Earthquake) {
    listeners.forEach((l) => l(q))
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
}
