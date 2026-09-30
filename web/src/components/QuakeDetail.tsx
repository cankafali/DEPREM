import { useEffect, useRef, useState } from 'react'
import { haversineKm } from '../api/filters'
import type { Earthquake } from '../api/types'
import { useNearbyCount } from '../api/useEarthquakes'
import { useRelativeTime } from '../hooks/useRelativeTime'
import { afadEventUrl, fmtDateTime, fmtDistance, fmtMag, fmtNum, fmtPlace, t } from '../i18n/tr'
import { magVar } from './magnitude'
import styles from './QuakeDetail.module.css'

interface Props {
  quake: Earthquake | undefined
  loading: boolean
  userCoords: { lat: number; lon: number } | null
  onClose: () => void
}

export function QuakeDetail({ quake, loading, userCoords, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [quake?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <article className={styles.panel} aria-labelledby="detail-heading">
      <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {quake ? (
        <Body quake={quake} userCoords={userCoords} headingRef={headingRef} />
      ) : (
        <div className={styles.body}>
          <h2 id="detail-heading" ref={headingRef} tabIndex={-1} className={styles.placeholder}>
            {loading ? <span className={styles.sk} /> : t.notFound}
          </h2>
        </div>
      )}
    </article>
  )
}

function Body({ quake: q, userCoords, headingRef }: {
  quake: Earthquake
  userCoords: Props['userCoords']
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const rel = useRelativeTime(q.occurredAtUtc, true)
  const nearby = useNearbyCount(q)
  const [copied, setCopied] = useState(false)
  const distance = userCoords ? haversineKm(userCoords.lat, userCoords.lon, q.latitude, q.longitude) : null

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(q.id)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt(t.copyLink, url)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.body}>
      <h2 id="detail-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        <span className={styles.magLine}>
          <span className={styles.dot} style={{ background: magVar(q.magnitude) }} aria-hidden="true" />
          <span className={`${styles.mag} num`}>{fmtMag(q.magnitude)}</span>
          <span className={styles.magType}>{q.magnitudeType}</span>
        </span>
        <span className={styles.place}>{fmtPlace(q)}</span>
      </h2>
      <p className={`${styles.when} num`}>
        <time dateTime={q.occurredAtUtc}>{fmtDateTime(q.occurredAtUtc)}</time>
        <span className={styles.rel}>{rel}</span>
      </p>

      <dl className={`${styles.facts} num`}>
        <dt>{t.depth}</dt>
        <dd>{fmtNum(q.depthKm, 1)} km</dd>
        <dt>{t.coordinates}</dt>
        <dd>{q.latitude.toFixed(2)}, {q.longitude.toFixed(2)}</dd>
        {distance !== null && (
          <>
            <dt>{t.distanceFromYou}</dt>
            <dd>{fmtDistance(distance)}</dd>
          </>
        )}
        {q.revision > 0 && (
          <>
            <dt>{t.revised}</dt>
            <dd>{t.revisedTimes(q.revision)}</dd>
          </>
        )}
        <dt>{t.nearbyWeek}</dt>
        <dd title={t.nearbyWeekHint}>
          {nearby.data !== undefined ? `${nearby.data} deprem` : '—'}
          <span className={styles.hint}> ({t.nearbyWeekHint})</span>
        </dd>
      </dl>

      <div className={styles.actions}>
        <a href={afadEventUrl(q.id)} target="_blank" rel="noopener noreferrer">{t.viewOnAfad}</a>
        <button type="button" className={styles.linkBtn} onClick={copy}>
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
      <p className="visually-hidden" role="status">{copied ? t.copied : ''}</p>
    </div>
  )
}
