export type Range = '24h' | '7d' | '30d'
export type SortKey = 'time' | 'magnitude'

export interface Earthquake {
  id: string
  occurredAtUtc: string
  latitude: number
  longitude: number
  depthKm: number
  magnitude: number
  magnitudeType: string
  province: string | null
  district: string | null
  location: string
  updatedAtUtc: string
  revision: number
  distanceKm: number | null
}

export interface MagnitudeBucket {
  label: string
  min: number
  max: number | null
  count: number
}

export interface SeriesPoint {
  startUtc: string
  count: number
}

export interface Stats {
  range: Range
  total: number
  largest: Earthquake | null
  byMagnitude: MagnitudeBucket[]
  seriesUnit: 'hour' | 'day'
  series: SeriesPoint[]
  topProvinces: { province: string; count: number }[]
}

export interface Health {
  status: 'ok' | 'degraded'
  lastSyncUtc: string | null
  lastAttemptUtc: string | null
  lastError: string | null
  earthquakeCount: number
}

export interface NearFilter {
  lat: number
  lon: number
  radiusKm: number
  /** true when the centre came from the browser's geolocation (not a picked map point) */
  fromMe: boolean
}

export interface Filters {
  range: Range
  minMag: number
  province: string | null
  near: NearFilter | null
}

export const RANGE_MS: Record<Range, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}
