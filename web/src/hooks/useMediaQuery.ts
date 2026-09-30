import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
export const useDarkScheme = () => useMediaQuery('(prefers-color-scheme: dark)')
