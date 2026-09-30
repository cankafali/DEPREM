import type { SeriesPoint } from '../api/types'
import { fmtDay, fmtHour } from '../i18n/tr'
import styles from './StatsStrip.module.css'

interface Props {
  series: SeriesPoint[]
  unit: 'hour' | 'day'
}

/** Tiny hand-written SVG bar chart; one bar per hour (24h) or per day (7d/30d). */
export function HourlyBars({ series, unit }: Props) {
  if (series.length === 0) return null
  const max = Math.max(1, ...series.map((p) => p.count))
  const W = 300
  const H = 40
  const gap = series.length > 24 ? 1.5 : 2
  const bw = (W - gap * (series.length - 1)) / series.length
  const label = unit === 'hour' ? fmtHour : fmtDay
  const peak = series.reduce((a, b) => (b.count > a.count ? b : a))
  const summary = `${unit === 'hour' ? 'Saatlik' : 'Günlük'} deprem sayısı. En yoğun: ${label(peak.startUtc)}, ${peak.count} deprem.`

  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} className={styles.svg}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className={styles.baseline} />
        {series.map((p, i) => {
          const h = p.count === 0 ? 0 : Math.max(1.5, (p.count / max) * (H - 4))
          return (
            <rect
              key={p.startUtc}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={Math.min(1.5, bw / 3)}
              className={i === series.length - 1 ? styles.barCurrent : styles.bar}
            >
              <title>{`${label(p.startUtc)}: ${p.count} deprem`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className={`${styles.axis} num`} aria-hidden="true">
        <span>{label(series[0]!.startUtc)}</span>
        <span>{unit === 'hour' ? 'şimdi' : 'bugün'}</span>
      </figcaption>
    </figure>
  )
}
