import type { Earthquake, Stats } from '../api/types'
import { t } from '../i18n/tr'

/** Counts come from /api/stats (the list is capped at 2000 rows); the list is a fallback while stats load. */
export function summaryText(stats: Stats | undefined, quakes: Earthquake[] | undefined): string | null {
  if (stats) return t.summary(stats.total, stats.largest?.magnitude)
  if (quakes) return t.summary(quakes.length, quakes.length ? Math.max(...quakes.map((q) => q.magnitude)) : undefined)
  return null
}
