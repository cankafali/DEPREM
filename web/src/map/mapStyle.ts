import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'

// OpenFreeMap: free vector tiles, no API key.
export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron'
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'

/** Türkiye plus a margin for offshore Aegean / Mediterranean events. */
export const TURKEY_BOUNDS: [[number, number], [number, number]] = [[25.4, 35.4], [45.0, 42.4]]

/** Prefer Turkish names (`name:tr`) wherever the base style shows a name. */
export function applyTurkishLabels(map: MlMap) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue
    const field = map.getLayoutProperty(layer.id, 'text-field') as unknown
    if (field === undefined || !JSON.stringify(field).includes('name')) continue
    const original = (typeof field === 'string' ? ['to-string', field] : field) as ExpressionSpecification
    map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:tr'], original])
  }
}

/** Blend the map's background into the page paper colour so the map feels like part of the sheet. */
export function tintBackground(map: MlMap, paper: string) {
  const bg = map.getStyle().layers.find((l) => l.type === 'background')
  if (bg) map.setPaintProperty(bg.id, 'background-color', paper)
}
