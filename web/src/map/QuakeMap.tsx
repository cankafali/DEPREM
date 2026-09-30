import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'
import { quakeArrivals } from '../api/liveEvents'
import type { Earthquake, NearFilter } from '../api/types'
import { t } from '../i18n/tr'
import {
  addNearLayers, addQuakeLayers, L_CLUSTERS, L_POINTS, NEAR_SOURCE, nearGeoJson, QUAKE_SOURCE,
  readPalette, removeQuakeLayers, toGeoJson,
} from './layers'
import { applyTurkishLabels, STYLE_DARK, STYLE_LIGHT, tintBackground, TURKEY_BOUNDS } from './mapStyle'
import styles from './QuakeMap.module.css'

export interface QuakeMapProps {
  quakes: Earthquake[]
  cluster: boolean
  selected: Earthquake | undefined
  highlightId: string | null
  near: NearFilter | null
  dark: boolean
  reducedMotion: boolean
  compact: boolean
  /** Extra space hidden behind overlays (bottom sheet, detail panel) for flyTo centring. */
  padding: { top: number; right: number; bottom: number; left: number }
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onPickPoint: (lat: number, lon: number) => void
  shouldRing: (q: Earthquake) => boolean
}

const LONG_PRESS_MS = 550

// MapLibre 6 locates its module worker next to its own file, which breaks once Vite bundles it.
// Hand it a Vite-built worker (with its shared chunk inlined) instead.
maplibregl.setWorkerUrl(workerUrl)

export default function QuakeMap(props: QuakeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  const hoverRef = useRef<string | null>(null) // from map pointer
  const stateIds = useRef({ hover: null as string | null, selected: null as string | null })
  const syncRef = useRef<() => void>(() => {})
  const loadedRef = useRef(false) // the one-time 'load' event has fired
  const sync = () => syncRef.current()

  // ---- create map once ----
  useEffect(() => {
    const p = propsRef.current
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: p.dark ? STYLE_DARK : STYLE_LIGHT,
      bounds: TURKEY_BOUNDS,
      // On phones the bottom sheet starts half open; keep Türkiye in the visible upper half.
      fitBoundsOptions: { padding: p.compact ? { top: 64, bottom: Math.round(window.innerHeight * 0.5), left: 8, right: 8 } : 24 },
      minZoom: 2.5,
      maxZoom: 14,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    map.once('load', () => { loadedRef.current = true })
    if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map

    // (Re)install everything whenever a style finishes loading (initial load and theme switches).
    map.on('style.load', () => {
      const cur = propsRef.current
      const palette = readPalette(containerRef.current!)
      applyTurkishLabels(map)
      tintBackground(map, palette.paper)
      addQuakeLayers(map, palette, cur.cluster, toGeoJson(cur.quakes))
      addNearLayers(map, palette, cur.near)
      readyRef.current = true
      stateIds.current = { hover: null, selected: null }
      syncFeatureState()
    })

    const syncFeatureState = () => {
      if (!readyRef.current) return // style.load re-syncs once layers exist
      const cur = propsRef.current
      const want = { hover: hoverRef.current ?? cur.highlightId, selected: cur.selected?.id ?? null }
      for (const key of ['hover', 'selected'] as const) {
        const prev = stateIds.current[key]
        if (prev === want[key]) continue
        if (prev) map.setFeatureState({ source: QUAKE_SOURCE, id: prev }, { [key]: false })
        if (want[key]) map.setFeatureState({ source: QUAKE_SOURCE, id: want[key]! }, { [key]: true })
        stateIds.current[key] = want[key]
      }
    }
    syncRef.current = syncFeatureState

    // ---- pointer interactions ----
    map.on('mousemove', L_POINTS, (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined
      const id = (f?.properties?.id as string | undefined) ?? null
      map.getCanvas().style.cursor = id ? 'pointer' : ''
      if (id !== hoverRef.current) {
        hoverRef.current = id
        propsRef.current.onHover(id)
        syncFeatureState()
      }
    })
    map.on('mouseleave', L_POINTS, () => {
      map.getCanvas().style.cursor = ''
      hoverRef.current = null
      propsRef.current.onHover(null)
      syncFeatureState()
    })
    map.on('click', L_POINTS, (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      if (id) propsRef.current.onSelect(id)
    })
    map.on('click', L_CLUSTERS, async (e) => {
      const f = e.features?.[0]
      if (!f) return
      const src = map.getSource<GeoJSONSource>(QUAKE_SOURCE)
      const zoom = await src?.getClusterExpansionZoom(f.properties.cluster_id as number)
      if (zoom === undefined) return
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: propsRef.current.reducedMotion ? 0 : 500 })
    })
    map.on('mouseenter', L_CLUSTERS, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', L_CLUSTERS, () => { map.getCanvas().style.cursor = '' })

    // Right click (desktop) or long press (touch) picks a centre for the radius search.
    map.on('contextmenu', (e) => {
      e.preventDefault()
      propsRef.current.onPickPoint(e.lngLat.lat, e.lngLat.lng)
    })
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let pressStart: { x: number; y: number } | null = null
    const cancelPress = () => { clearTimeout(pressTimer); pressStart = null }
    map.on('touchstart', (e) => {
      if (e.originalEvent.touches.length !== 1) return cancelPress()
      pressStart = { x: e.point.x, y: e.point.y }
      const lngLat = e.lngLat
      clearTimeout(pressTimer)
      pressTimer = setTimeout(() => {
        if (pressStart) propsRef.current.onPickPoint(lngLat.lat, lngLat.lng)
        pressStart = null
      }, LONG_PRESS_MS)
    })
    map.on('touchmove', (e) => {
      if (!pressStart) return
      if (Math.hypot(e.point.x - pressStart.x, e.point.y - pressStart.y) > 10) cancelPress()
    })
    map.on('touchend', cancelPress)
    map.on('touchcancel', cancelPress)

    // ---- new quake ring: expands once, then fades (1.2 s) ----
    const unsub = quakeArrivals.subscribe((q) => {
      const cur = propsRef.current
      if (cur.reducedMotion || !cur.shouldRing(q)) return
      // The marker owns the wrapper's transform, so the animation runs on an inner element.
      const el = document.createElement('div')
      const ring = document.createElement('div')
      ring.className = styles.ring
      el.appendChild(ring)
      const marker = new maplibregl.Marker({ element: el }).setLngLat([q.longitude, q.latitude]).addTo(map)
      setTimeout(() => marker.remove(), 1300)
    })

    return () => {
      unsub()
      clearTimeout(pressTimer)
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---- data ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    void map.getSource<GeoJSONSource>(QUAKE_SOURCE)?.setData(toGeoJson(props.quakes))
  }, [props.quakes])

  // ---- cluster on/off needs a new source ----
  const clusterRef = useRef(props.cluster)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || clusterRef.current === props.cluster) return
    clusterRef.current = props.cluster
    removeQuakeLayers(map)
    addQuakeLayers(map, readPalette(containerRef.current!), props.cluster, toGeoJson(propsRef.current.quakes))
    stateIds.current = { hover: null, selected: null }
    sync()
  }, [props.cluster])

  // ---- radius overlay ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    void map.getSource<GeoJSONSource>(NEAR_SOURCE)?.setData(nearGeoJson(props.near))
    if (props.near) {
      const b = new maplibregl.LngLatBounds()
      nearGeoJson(props.near).features.forEach((f) =>
        (f.geometry as GeoJSON.Polygon).coordinates[0]!.forEach((c) => b.extend(c as [number, number])))
      map.fitBounds(b, { padding: 40, duration: propsRef.current.reducedMotion ? 0 : 600, maxZoom: 10 })
    }
  }, [props.near])

  // ---- theme ----
  const darkRef = useRef(props.dark)
  useEffect(() => {
    const map = mapRef.current
    if (!map || darkRef.current === props.dark) return
    darkRef.current = props.dark
    readyRef.current = false
    map.setStyle(props.dark ? STYLE_DARK : STYLE_LIGHT, { diff: false })
  }, [props.dark])

  // ---- hover / selection state ----
  useEffect(() => { sync() }, [props.highlightId, props.selected?.id])

  // ---- fly to the selected quake ----
  const flownTo = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    const q = props.selected
    // Only fly when the selection changes, not when a live revision replaces the object.
    if (!q) flownTo.current = null
    if (!map || !q || flownTo.current === q.id) return
    const go = () => {
      flownTo.current = q.id
      const opts = {
        center: [q.longitude, q.latitude] as [number, number],
        zoom: Math.max(map.getZoom(), 7),
        padding: propsRef.current.padding,
      }
      if (propsRef.current.reducedMotion) map.jumpTo(opts)
      else map.flyTo({ ...opts, duration: 600, essential: false })
    }
    // A deep link (?q=) selects before the map has loaded; the initial bounds fit would override the fly.
    if (loadedRef.current) go()
    else map.once('load', go)
  }, [props.selected])

  return <div ref={containerRef} className={styles.map} role="region" aria-label={t.map} />
}
