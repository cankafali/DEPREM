import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_FILTERS } from '../api/filters'
import type { Filters, Range, SortKey } from '../api/types'

export interface UrlState {
  filters: Filters
  sort: SortKey
  selectedId: string | null
}

export const RADII = [25, 50, 100, 250, 500] as const
const RANGES: Range[] = ['24h', '7d', '30d']

const num = (s: string | null) => (s === null || s.trim() === '' ? NaN : Number(s))

export function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search)
  const range = RANGES.includes(p.get('range') as Range) ? (p.get('range') as Range) : DEFAULT_FILTERS.range
  const mm = num(p.get('minMag'))
  const minMag = Number.isFinite(mm) ? Math.min(9, Math.max(0, mm)) : 0
  const province = p.get('province')?.trim() || null

  const lat = num(p.get('lat'))
  const lon = num(p.get('lon'))
  const r = num(p.get('r'))
  const near =
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { lat, lon, radiusKm: Number.isFinite(r) ? Math.min(500, Math.max(1, r)) : 50, fromMe: false }
      : null

  return {
    filters: { range, minMag, province, near },
    sort: p.get('sort') === 'magnitude' ? 'magnitude' : 'time',
    selectedId: p.get('q') || null,
  }
}

export function toSearch(s: UrlState): string {
  const p = new URLSearchParams()
  const f = s.filters
  if (f.range !== DEFAULT_FILTERS.range) p.set('range', f.range)
  if (f.minMag > 0) p.set('minMag', String(f.minMag))
  if (f.province) p.set('province', f.province)
  if (f.near) {
    p.set('lat', f.near.lat.toFixed(3))
    p.set('lon', f.near.lon.toFixed(3))
    p.set('r', String(f.near.radiusKm))
  }
  if (s.sort !== 'time') p.set('sort', s.sort)
  if (s.selectedId) p.set('q', s.selectedId)
  const str = p.toString()
  return str ? `?${str}` : ''
}

/**
 * All filter state lives in the URL (spec §8). Filter changes replace the history entry;
 * opening a quake pushes one, so the browser back button closes the detail.
 */
export function useUrlFilters() {
  const [state, setState] = useState<UrlState>(() => parseUrl(window.location.search))
  const ref = useRef(state)
  const pushedSelection = useRef(false)

  useEffect(() => {
    const onPop = () => {
      const next = parseUrl(window.location.search)
      // Keep "fromMe" if the same centre is still in the URL.
      if (next.filters.near && ref.current.filters.near?.fromMe
        && Math.abs(next.filters.near.lat - ref.current.filters.near.lat) < 0.001
        && Math.abs(next.filters.near.lon - ref.current.filters.near.lon) < 0.001) {
        next.filters.near.fromMe = true
      }
      pushedSelection.current = false
      ref.current = next
      setState(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const commit = useCallback((next: UrlState, mode: 'push' | 'replace') => {
    ref.current = next
    const url = `${window.location.pathname}${toSearch(next)}${window.location.hash}`
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
    setState(next)
  }, [])

  const setFilters = useCallback((patch: Partial<Filters>) => {
    commit({ ...ref.current, filters: { ...ref.current.filters, ...patch } }, 'replace')
  }, [commit])

  const resetFilters = useCallback(() => {
    commit({ ...ref.current, filters: DEFAULT_FILTERS }, 'replace')
  }, [commit])

  const setSort = useCallback((sort: SortKey) => commit({ ...ref.current, sort }, 'replace'), [commit])

  const select = useCallback((id: string | null) => {
    const cur = ref.current
    if (id === cur.selectedId) return
    if (id === null) {
      if (pushedSelection.current) {
        window.history.back() // popstate brings the state back in sync
        return
      }
      commit({ ...cur, selectedId: null }, 'replace')
      return
    }
    const mode = cur.selectedId === null ? 'push' : 'replace'
    if (mode === 'push') pushedSelection.current = true
    commit({ ...cur, selectedId: id }, mode)
  }, [commit])

  return { ...state, setFilters, resetFilters, setSort, select }
}
