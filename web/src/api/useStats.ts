import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Filters } from './types'

export function useStats(filters: Filters) {
  return useQuery({
    queryKey: ['stats', { range: filters.range, minMag: filters.minMag, province: filters.province, near: filters.near && { lat: filters.near.lat, lon: filters.near.lon, radiusKm: filters.near.radiusKm } }],
    queryFn: ({ signal }) => api.stats(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}
