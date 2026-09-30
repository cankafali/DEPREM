import { useEffect } from 'react'
import type { Earthquake } from '../api/types'
import { fmtMag, t } from '../i18n/tr'
import { magVar } from './magnitude'
import styles from './Toast.module.css'

export interface ToastItem {
  key: number
  quake: Earthquake
}

interface Props {
  items: ToastItem[]
  onDismiss: (key: number) => void
  onOpen: (id: string) => void
}

const place = (q: Earthquake) =>
  q.district && q.province ? `${q.district} (${q.province})` : q.location

/** Calm, silent notice for new M≥3 quakes. Disappears after 6 s. */
export function Toasts({ items, onDismiss, onOpen }: Props) {
  return (
    <div className={styles.stack}>
      {items.map((it) => <Toast key={it.key} item={it} onDismiss={onDismiss} onOpen={onOpen} />)}
    </div>
  )
}

function Toast({ item, onDismiss, onOpen }: { item: ToastItem } & Omit<Props, 'items'>) {
  useEffect(() => {
    const h = setTimeout(() => onDismiss(item.key), 6000)
    return () => clearTimeout(h)
  }, [item.key, onDismiss])

  const q = item.quake
  return (
    <button
      type="button"
      className={styles.toast}
      onClick={() => {
        onOpen(q.id)
        onDismiss(item.key)
      }}
    >
      <span className={styles.dot} style={{ background: magVar(q.magnitude) }} aria-hidden="true" />
      <span>
        {t.newQuake}: <strong className="num">{fmtMag(q.magnitude)}</strong>, {place(q)}
      </span>
    </button>
  )
}

/** Screen-reader announcement for new M≥3 quakes (spec §9). */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
