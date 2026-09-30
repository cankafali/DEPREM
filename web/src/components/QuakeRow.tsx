import { memo } from 'react'
import type { Earthquake } from '../api/types'
import { fmtDateTime, fmtDistance, fmtMag, fmtPlace, fmtRelative, t } from '../i18n/tr'
import { dotSize, magVar } from './magnitude'
import styles from './QuakeList.module.css'

interface Props {
  quake: Earthquake
  now: number
  selected: boolean
  highlighted: boolean
  fresh: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

export const QuakeRow = memo(function QuakeRow({ quake: q, now, selected, highlighted, fresh, onSelect, onHover }: Props) {
  const size = dotSize(q.magnitude)
  const place = fmtPlace(q)
  const rel = fmtRelative(q.occurredAtUtc, now)
  const full = fmtDateTime(q.occurredAtUtc)

  return (
    <li className={fresh ? styles.fresh : undefined}>
      <button
        type="button"
        className={styles.row}
        data-id={q.id}
        data-highlighted={highlighted || undefined}
        aria-current={selected || undefined}
        aria-label={`Büyüklük ${fmtMag(q.magnitude)} ${q.magnitudeType}, ${place}, ${rel}, ${full}, ${t.depthShort(q.depthKm)}${q.distanceKm !== null ? `, ${fmtDistance(q.distanceKm)} uzakta` : ''}`}
        onClick={() => onSelect(q.id)}
        onMouseEnter={() => onHover(q.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(q.id)}
        onBlur={() => onHover(null)}
      >
        <span className={styles.mag} aria-hidden="true">
          <span className={styles.dotWrap}>
            <span className={styles.dot} style={{ width: size, height: size, background: magVar(q.magnitude) }} />
          </span>
          <span className={`${styles.magValue} num`}>{fmtMag(q.magnitude)}</span>
        </span>
        <span className={styles.body} aria-hidden="true">
          <span className={styles.place}>{place}</span>
          <span className={`${styles.meta} num`}>
            <time dateTime={q.occurredAtUtc} title={full}>{rel}</time>
            {', '}
            {t.depthShort(q.depthKm)}
            {q.distanceKm !== null && <> · {fmtDistance(q.distanceKm)} uzakta</>}
          </span>
        </span>
      </button>
    </li>
  )
})
