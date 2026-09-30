import { RANGE_MS, type Earthquake, type Filters } from './types'

const R = 6371.0088
const rad = (d: number) => (d * Math.PI) / 180

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const trCollator = new Intl.Collator('tr', { sensitivity: 'base' })
export const sameProvince = (a: string | null, b: string) => a !== null && trCollator.compare(a, b) === 0

/**
 * Client-side mirror of the API filter. Used to decide whether a live quake belongs in a
 * cached list, and to age out items as time passes without refetching.
 */
export function matchesFilters(q: Earthquake, f: Filters, now: number): boolean {
  if (new Date(q.occurredAtUtc).getTime() < now - RANGE_MS[f.range]) return false
  if (q.magnitude < f.minMag - 1e-9) return false
  if (f.province && !sameProvince(q.province, f.province)) return false
  if (f.near && haversineKm(f.near.lat, f.near.lon, q.latitude, q.longitude) > f.near.radiusKm) return false
  return true
}

/** Adds distanceKm for radius searches (the API does this for fetched rows; live rows need it too). */
export function withDistance(q: Earthquake, f: Filters): Earthquake {
  if (!f.near) return q.distanceKm === null ? q : { ...q, distanceKm: null }
  return { ...q, distanceKm: Math.round(haversineKm(f.near.lat, f.near.lon, q.latitude, q.longitude) * 10) / 10 }
}

export const DEFAULT_FILTERS: Filters = { range: '24h', minMag: 0, province: null, near: null }

export function isDefault(f: Filters): boolean {
  return f.range === DEFAULT_FILTERS.range && f.minMag === 0 && !f.province && !f.near
}

/** Circle polygon for drawing the radius on the map. */
export function circlePolygon(lat: number, lon: number, km: number, steps = 72): [number, number][] {
  const d = km / R
  const φ1 = rad(lat)
  const λ1 = rad(lon)
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const b = (i / steps) * 2 * Math.PI
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b))
    const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI])
  }
  return ring
}
