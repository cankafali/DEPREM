import { useSyncExternalStore } from 'react'
import { fmtRelative } from '../i18n/tr'

// One shared minute ticker for the whole page instead of a timer per row.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

function tick() {
  now = Date.now()
  listeners.forEach((l) => l())
  timer = setTimeout(tick, 60_000 - (now % 60_000) + 50)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (listeners.size === 1) {
    now = Date.now()
    timer = setTimeout(tick, 60_000 - (now % 60_000) + 50)
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) clearTimeout(timer)
  }
}

/** Current time, updated once a minute on the minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now)
}

export function useRelativeTime(iso: string, long = false): string {
  return fmtRelative(iso, useNow(), long)
}
