import type { Earthquake, Filters, Health, Stats } from './types'

/** Empty in development (Vite proxies to the API); the API's public origin in production builds. */
export const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { title?: string; detail?: string }
      detail = body.detail ?? body.title ?? detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

/** Query parameters shared by /api/earthquakes and /api/stats. */
export function filterParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams({ range: f.range })
  if (f.minMag > 0) p.set('minMag', String(f.minMag))
  if (f.province) p.set('province', f.province)
  if (f.near) {
    p.set('lat', f.near.lat.toFixed(4))
    p.set('lon', f.near.lon.toFixed(4))
    p.set('radiusKm', String(f.near.radiusKm))
  }
  return p
}

export const api = {
  earthquakes(f: Filters, signal?: AbortSignal) {
    const p = filterParams(f)
    p.set('limit', '2000')
    return getJson<Earthquake[]>(`/api/earthquakes?${p}`, signal)
  },
  earthquake(id: string, signal?: AbortSignal) {
    return getJson<Earthquake>(`/api/earthquakes/${encodeURIComponent(id)}`, signal)
  },
  nearbyCount(lat: number, lon: number, signal?: AbortSignal) {
    const p = new URLSearchParams({ range: '7d', lat: lat.toFixed(4), lon: lon.toFixed(4), radiusKm: '50', limit: '2000' })
    return getJson<Earthquake[]>(`/api/earthquakes?${p}`, signal).then((l) => l.length)
  },
  stats(f: Filters, signal?: AbortSignal) {
    return getJson<Stats>(`/api/stats?${filterParams(f)}`, signal)
  },
  provinces(signal?: AbortSignal) {
    return getJson<string[]>('/api/provinces', signal)
  },
  health(signal?: AbortSignal) {
    return getJson<Health>('/health', signal)
  },
}
