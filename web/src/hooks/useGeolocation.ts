import { useCallback, useState } from 'react'

export type GeoStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unavailable'

export interface GeoState {
  status: GeoStatus
  coords: { lat: number; lon: number } | null
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle', coords: null })

  const request = useCallback(
    () =>
      new Promise<{ lat: number; lon: number } | null>((resolve) => {
        if (!('geolocation' in navigator)) {
          setState({ status: 'unavailable', coords: null })
          resolve(null)
          return
        }
        setState((s) => ({ ...s, status: 'pending' }))
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }
            setState({ status: 'granted', coords })
            resolve(coords)
          },
          (err) => {
            setState({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable', coords: null })
            resolve(null)
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
        )
      }),
    [],
  )

  return { ...state, request }
}
