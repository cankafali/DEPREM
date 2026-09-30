import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  Map as MlMap,
} from 'maplibre-gl'
import { circlePolygon } from '../api/filters'
import type { Earthquake, NearFilter } from '../api/types'

export const QUAKE_SOURCE = 'quakes'
export const NEAR_SOURCE = 'near'
export const L_POINTS = 'quake-points'
export const L_CLUSTERS = 'quake-clusters'
export const L_CLUSTER_COUNT = 'quake-cluster-count'
export const L_NEAR_FILL = 'near-fill'
export const L_NEAR_LINE = 'near-line'

export interface Palette {
  paper: string
  ink: string
  inkSoft: string
  focus: string
  m: [string, string, string, string, string]
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    paper: v('--paper', '#F5F6F4'),
    ink: v('--ink', '#1E2A2F'),
    inkSoft: v('--ink-soft', '#56656B'),
    focus: v('--focus', '#2F6FEB'),
    m: [v('--m-lt2', '#A9B8C0'), v('--m-2', '#7E9AA8'), v('--m-3', '#E3A13B'), v('--m-4', '#D9642A'), v('--m-5', '#A8232B')],
  }
}

export function toGeoJson(quakes: Earthquake[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: quakes.map((q) => ({
      type: 'Feature',
      id: q.id,
      geometry: { type: 'Point', coordinates: [q.longitude, q.latitude] },
      properties: { id: q.id, mag: q.magnitude },
    })),
  }
}

export function nearGeoJson(near: NearFilter | null): GeoJSON.FeatureCollection {
  if (!near) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circlePolygon(near.lat, near.lon, near.radiusKm)] },
      properties: {},
    }],
  }
}

/** Radius grows with magnitude (and a little with zoom) so size, not only colour, carries meaning. */
const radiusByMag: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'mag'],
  0, 2.5, 2, 4, 3, 6.5, 4, 10, 5, 14, 6, 19, 7, 25,
]

export function addQuakeLayers(map: MlMap, p: Palette, cluster: boolean, data: GeoJSON.FeatureCollection) {
  const source: GeoJSONSourceSpecification = {
    type: 'geojson',
    data,
    promoteId: 'id',
    ...(cluster && {
      cluster: true,
      clusterMaxZoom: 7,
      clusterRadius: 36,
      clusterProperties: { maxMag: ['max', ['get', 'mag']] },
    }),
  }
  map.addSource(QUAKE_SOURCE, source)

  const color: ExpressionSpecification = ['step', ['get', 'mag'], p.m[0], 2, p.m[1], 3, p.m[2], 4, p.m[3], 5, p.m[4]]
  const active: ExpressionSpecification = [
    'any', ['boolean', ['feature-state', 'hover'], false], ['boolean', ['feature-state', 'selected'], false],
  ]

  const points: CircleLayerSpecification = {
    id: L_POINTS,
    type: 'circle',
    source: QUAKE_SOURCE,
    ...(cluster && { filter: ['!', ['has', 'point_count']] }),
    layout: { 'circle-sort-key': ['get', 'mag'] },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, radiusByMag, 10, ['*', 1.7, radiusByMag]],
      'circle-color': color,
      'circle-opacity': 0.88,
      'circle-stroke-color': ['case', active, p.focus, p.paper],
      'circle-stroke-width': ['case', active, 2.5, 1],
      'circle-stroke-opacity': 1,
    },
  }
  map.addLayer(points)

  if (cluster) {
    const clusterColor: ExpressionSpecification = [
      'step', ['get', 'maxMag'], p.m[0], 2, p.m[1], 3, p.m[2], 4, p.m[3], 5, p.m[4],
    ]
    map.addLayer({
      id: L_CLUSTERS,
      type: 'circle',
      source: QUAKE_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': p.paper,
        'circle-opacity': 0.92,
        'circle-radius': ['step', ['get', 'point_count'], 12, 10, 15, 50, 19, 150, 24],
        'circle-stroke-color': clusterColor,
        'circle-stroke-width': 3,
      },
    }, L_POINTS)
    map.addLayer({
      id: L_CLUSTER_COUNT,
      type: 'symbol',
      source: QUAKE_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': p.ink },
    })
  }
}

export function addNearLayers(map: MlMap, p: Palette, near: NearFilter | null) {
  map.addSource(NEAR_SOURCE, { type: 'geojson', data: nearGeoJson(near) })
  const before = map.getLayer(L_CLUSTERS) ? L_CLUSTERS : L_POINTS
  map.addLayer({ id: L_NEAR_FILL, type: 'fill', source: NEAR_SOURCE, paint: { 'fill-color': p.focus, 'fill-opacity': 0.05 } }, before)
  map.addLayer({
    id: L_NEAR_LINE,
    type: 'line',
    source: NEAR_SOURCE,
    paint: { 'line-color': p.focus, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
  }, before)
}

export function removeQuakeLayers(map: MlMap) {
  for (const id of [L_CLUSTER_COUNT, L_CLUSTERS, L_POINTS]) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(QUAKE_SOURCE)) map.removeSource(QUAKE_SOURCE)
}
