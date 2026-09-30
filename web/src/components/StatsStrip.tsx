import type { Earthquake, Stats } from '../api/types'
import { summaryText } from './summary'
import { HourlyBars } from './HourlyBars'
import { dotSize } from './magnitude'
import styles from './StatsStrip.module.css'

interface Props {
  stats: Stats | undefined
  quakes: Earthquake[] | undefined
  compact?: boolean
  /** The mobile sheet already shows the summary line in its always-visible peek. */
  hideSummary?: boolean
}

const LEGEND = [
  { label: '<2', m: 1.5, cls: 'lt2' },
  { label: '2', m: 2.5, cls: '2' },
  { label: '3', m: 3.5, cls: '3' },
  { label: '4', m: 4.5, cls: '4' },
  { label: '5+', m: 5.5, cls: '5' },
]

export function StatsStrip({ stats, quakes, compact, hideSummary }: Props) {
  const text = summaryText(stats, quakes)
  return (
    <section className={styles.strip} aria-label="Özet">
      {!hideSummary && (
        <p className={`${styles.summary} num`}>
          {text ?? <span className={styles.skText} aria-hidden="true" />}
        </p>
      )}
      {!compact && stats && (
        <>
          <HourlyBars series={stats.series} unit={stats.seriesUnit} />
          <ul className={styles.legend} aria-label="Büyüklük dağılımı">
            {LEGEND.map((l, i) => (
              <li key={l.cls}>
                <span
                  className={styles.legendDot}
                  style={{ background: `var(--m-${l.cls})`, width: dotSize(l.m) * 0.7, height: dotSize(l.m) * 0.7 }}
                  aria-hidden="true"
                />
                <span>M{l.label}</span>
                <span className={`${styles.legendCount} num`}>{stats.byMagnitude[i]?.count ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
