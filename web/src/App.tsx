import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { matchesFilters } from './api/filters'
import { quakeArrivals } from './api/liveEvents'
import type { Earthquake } from './api/types'
import { useEarthquake, useEarthquakes, useHealth } from './api/useEarthquakes'
import { useLiveQuakes, type LiveKind } from './api/useLiveQuakes'
import { useStats } from './api/useStats'
import { BottomSheet, type SheetState } from './components/BottomSheet'
import { FilterPanel } from './components/FilterPanel'
import { QuakeDetail } from './components/QuakeDetail'
import { QuakeList } from './components/QuakeList'
import { StatsStrip } from './components/StatsStrip'
import { summaryText } from './components/summary'
import { LiveAnnouncer, Toasts, type ToastItem } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useGeolocation } from './hooks/useGeolocation'
import { MapErrorBoundary } from './map/MapErrorBoundary'
import { useDarkScheme, useIsMobile, useReducedMotion } from './hooks/useMediaQuery'
import { useNow } from './hooks/useRelativeTime'
import { useUrlFilters } from './hooks/useUrlFilters'
import { AFAD_URL, APP_NAME, fmtMag, fmtRelative, t } from './i18n/tr'
import styles from './App.module.css'

const QuakeMap = lazy(() => import('./map/QuakeMap'))

const ALERT_MAG = 3

export default function App() {
  const url = useUrlFilters()
  const { filters, sort, selectedId, setFilters, select } = url
  const isMobile = useIsMobile()
  const reducedMotion = useReducedMotion()
  const dark = useDarkScheme()
  const geo = useGeolocation()
  const now = useNow()

  const [hoverId, setHoverId] = useState<string | null>(null)
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set())
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [sheet, setSheet] = useState<SheetState>('half')
  const toastKey = useRef(0)
  const unseen = useRef(0)
  const filtersRef = useRef(filters)
  useEffect(() => { filtersRef.current = filters })

  // ---- live events ----
  const onLive = useCallback((kind: LiveKind, q: Earthquake) => {
    if (kind !== 'added') return
    quakeArrivals.emit(q)
    setFreshIds((s) => new Set(s).add(q.id))
    setTimeout(() => setFreshIds((s) => {
      const n = new Set(s)
      n.delete(q.id)
      return n
    }), 1000)
    if (q.magnitude >= ALERT_MAG) {
      setToasts((ts) => [...ts.slice(-2), { key: ++toastKey.current, quake: q }])
      setAnnouncement(`${t.newQuake}: ${fmtMag(q.magnitude)}, ${q.district ?? ''} ${q.province ? `(${q.province})` : q.location}`)
    }
    if (document.hidden) {
      unseen.current++
      document.title = `(${unseen.current}) ${APP_NAME}`
    }
  }, [])
  const live = useLiveQuakes(onLive)

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        unseen.current = 0
        document.title = APP_NAME
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ---- data ----
  const list = useEarthquakes(filters, live === 'live')
  const stats = useStats(filters)
  const health = useHealth()

  const quakes = useMemo(() => {
    // Age items out of the time window between refetches.
    const rows = (list.data ?? []).filter((q) => matchesFilters(q, filters, now))
    return sort === 'magnitude'
      ? rows.toSorted((a, b) => b.magnitude - a.magnitude || b.occurredAtUtc.localeCompare(a.occurredAtUtc))
      : rows.toSorted((a, b) => b.occurredAtUtc.localeCompare(a.occurredAtUtc))
  }, [list.data, filters, now, sort])

  const fromList = selectedId ? quakes.find((q) => q.id === selectedId) : undefined
  const single = useEarthquake(selectedId, fromList)
  const selected = fromList ?? single.data

  // ---- actions ----
  const onNearMe = useCallback(async () => {
    const c = await geo.request()
    if (c) setFilters({ near: { lat: c.lat, lon: c.lon, radiusKm: filtersRef.current.near?.radiusKm ?? 50, fromMe: true } })
  }, [geo, setFilters])

  const onPickPoint = useCallback((lat: number, lon: number) => {
    setFilters({ near: { lat, lon, radiusKm: filtersRef.current.near?.radiusKm ?? 50, fromMe: false } })
  }, [setFilters])

  const onSelect = useCallback((id: string) => {
    select(id)
    setSheet((s) => (s === 'closed' ? 'half' : s))
  }, [select])
  const onClose = useCallback(() => select(null), [select])
  const dismissToast = useCallback((key: number) => setToasts((ts) => ts.filter((x) => x.key !== key)), [])
  const shouldRing = useCallback((q: Earthquake) => matchesFilters(q, filtersRef.current, Date.now()), [])

  // ---- status banner ----
  const apiDown = health.isError || (list.isError && list.data !== undefined)
  const afadDown = !apiDown && health.data?.status === 'degraded' && health.data.lastSyncUtc
  const banner = apiDown
    ? t.apiDown(list.dataUpdatedAt ? fmtRelative(new Date(list.dataUpdatedAt).toISOString(), now, true) : null)
    : afadDown
      ? t.afadDown(fmtRelative(health.data!.lastSyncUtc!, now, true))
      : list.isError ? t.loadError : null

  const loading = list.data === undefined
  const listKey = JSON.stringify(filters)
  const userCoords = geo.coords

  const listEl = (
    <QuakeList
      key={listKey}
      quakes={quakes}
      loading={loading}
      sort={sort}
      onSort={url.setSort}
      selectedId={selectedId}
      highlightId={hoverId}
      freshIds={freshIds}
      onSelect={onSelect}
      onHover={setHoverId}
      onReset={url.resetFilters}
    />
  )
  const detailEl = selectedId && (
    <QuakeDetail quake={selected} loading={single.isPending && !fromList} userCoords={userCoords} onClose={onClose} />
  )

  const mapEl = (padding: { top: number; right: number; bottom: number; left: number }) => (
    <MapErrorBoundary fallback={<div className={styles.mapSkeleton} aria-hidden="true" />}>
    <Suspense fallback={<div className={styles.mapSkeleton} aria-hidden="true" />}>
      <QuakeMap
        quakes={quakes}
        cluster={filters.range === '30d'}
        selected={selected}
        highlightId={hoverId}
        near={filters.near}
        dark={dark}
        reducedMotion={reducedMotion}
        compact={isMobile}
        padding={padding}
        onSelect={onSelect}
        onHover={setHoverId}
        onPickPoint={onPickPoint}
        shouldRing={shouldRing}
      />
    </Suspense>
    </MapErrorBoundary>
  )

  const disclaimer = (
    <p className={styles.disclaimer}>
      {t.disclaimer} <a href={AFAD_URL} target="_blank" rel="noopener noreferrer">AFAD</a>.
    </p>
  )

  return (
    <div className={styles.app}>
      <TopBar live={live} lastSyncUtc={health.data?.lastSyncUtc} reducedMotion={reducedMotion} compact={isMobile} />
      {banner && <div className={styles.banner} role="status">{banner}</div>}

      {isMobile ? (
        <main className={styles.mobileMain}>
          {mapEl({ top: 60, right: 20, bottom: sheet === 'closed' ? 100 : window.innerHeight * 0.45, left: 20 })}
          <div className={styles.chips}>
            <FilterPanel variant="chips" filters={filters} onChange={setFilters} geoStatus={geo.status} onNearMe={onNearMe} />
          </div>
          <BottomSheet
            state={sheet}
            onStateChange={setSheet}
            peek={
              <div className={styles.peek}>
                <p className={`${styles.peekSummary} num`}>{summaryText(stats.data, list.data) ?? '…'}</p>
                {disclaimer}
              </div>
            }
          >
            {detailEl || (
              <>
                <StatsStrip stats={stats.data} quakes={list.data} hideSummary />
                {listEl}
              </>
            )}
          </BottomSheet>
        </main>
      ) : (
        <>
          <main className={styles.main}>
            <aside className={styles.sidebar}>
              <FilterPanel variant="panel" filters={filters} onChange={setFilters} geoStatus={geo.status} onNearMe={onNearMe} />
              <StatsStrip stats={stats.data} quakes={list.data} />
              <div className={styles.listScroll}>{listEl}</div>
            </aside>
            <div className={styles.mapArea}>
              {mapEl({ top: 40, right: selectedId ? 420 : 40, bottom: 40, left: 40 })}
              {detailEl && <div className={styles.detail}>{detailEl}</div>}
            </div>
          </main>
          <footer className={styles.footer}>
            {t.disclaimerShort} <a href={AFAD_URL} target="_blank" rel="noopener noreferrer">AFAD</a>.
          </footer>
        </>
      )}

      <Toasts items={toasts} onDismiss={dismissToast} onOpen={onSelect} />
      <LiveAnnouncer message={announcement} />
    </div>
  )
}
