import type { LiveStatus } from '../api/useLiveQuakes'
import { APP_NAME, fmtTime, t } from '../i18n/tr'
import { Seismograph } from './Seismograph'
import styles from './TopBar.module.css'

interface Props {
  live: LiveStatus
  lastSyncUtc: string | null | undefined
  reducedMotion: boolean
  compact: boolean
}

export function TopBar({ live, lastSyncUtc, reducedMotion, compact }: Props) {
  const label = live === 'live' ? t.live : live === 'connecting' ? t.connecting : t.offline
  return (
    <header className={styles.bar}>
      <h1 className={styles.brand}>
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 17h7l2-3 3 9 3-15 3 11 2-2h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {APP_NAME}
      </h1>
      <div className={styles.trace}>
        <Seismograph reducedMotion={reducedMotion} />
      </div>
      <div className={styles.status}>
        <span className={styles.live} data-status={live} role="status">
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={compact ? 'visually-hidden' : undefined}>{label}</span>
        </span>
        {!compact && lastSyncUtc && (
          <span className={`${styles.sync} num`}>
            {t.lastSync} <time dateTime={lastSyncUtc}>{fmtTime(lastSyncUtc)}</time>
          </span>
        )}
      </div>
    </header>
  )
}
