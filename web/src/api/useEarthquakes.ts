import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Earthquake, Filters } from './types'

export const earthquakesKey = (f: Filters) =>
  ['earthquakes', { range: f.range, minMag: f.minMag, province: f.province, near: f.near && { lat: f.near.lat, lon: f.near.lon, radiusKm: f.near.radiusKm } }] as const

export function useEarthquakes(filters: Filters, live: boolean) {
  return useQuery({
    queryKey: earthquakesKey(filters),
    queryFn: ({ signal }) => api.earthquakes(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    // SignalR pushes changes while connected; poll only as a fallback.
    refetchInterval: live ? 5 * 60_000 : 60_000,
    retry: (count) => count < 2,
  })
}

export function useEarthquake(id: string | null, fromList: Earthquake | undefined) {
  return useQuery({
    queryKey: ['earthquake', id],
    queryFn: ({ signal }) => api.earthquake(id!, signal),
    enabled: id !== null && fromList === undefined,
    staleTime: 60_000,
    retry: false,
  })
}

export function useNearbyCount(q: Earthquake | undefined) {
  return useQuery({
    queryKey: ['nearby', q?.id],
    queryFn: ({ signal }) => api.nearbyCount(q!.latitude, q!.longitude, signal),
    enabled: q !== undefined,
    staleTime: 5 * 60_000,
  })
}

export function useProvinces() {
  return useQuery({
    queryKey: ['provinces'],
    queryFn: ({ signal }) => api.provinces(signal),
    staleTime: 30 * 60_000,
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: 30_000,
    retry: false,
  })
}
