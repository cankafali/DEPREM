import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Earthquake, SortKey } from '../api/types'
import { useNow } from '../hooks/useRelativeTime'
import { t } from '../i18n/tr'
import { QuakeRow } from './QuakeRow'
import styles from './QuakeList.module.css'

const PAGE = 150

interface Props {
  quakes: Earthquake[]
  loading: boolean
  sort: SortKey
  onSort: (s: SortKey) => void
  selectedId: string | null
  highlightId: string | null
  freshIds: ReadonlySet<string>
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onReset: () => void
}

export function QuakeList(p: Props) {
  const now = useNow()
  const [shown, setShown] = useState(PAGE)
  const listRef = useRef<HTMLUListElement>(null)

  // Make sure a quake selected on the map (or from the URL) is rendered and visible.
  const selectedIndex = p.selectedId ? p.quakes.findIndex((q) => q.id === p.selectedId) : -1
  const visible = Math.max(shown, selectedIndex + 1)
  useEffect(() => {
    if (!p.selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(p.selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [p.selectedId])

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-id]') ?? [])
    if (buttons.length === 0) return
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? buttons.length - 1
      : e.key === 'ArrowDown' ? Math.min(buttons.length - 1, i + 1)
      : Math.max(0, i - 1)
    e.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <section className={styles.wrap} aria-label={t.listLabel}>
      <div className={styles.toolbar}>
        <span id="sort-label" className={styles.toolbarLabel}>{t.sortBy}:</span>
        <div role="radiogroup" aria-labelledby="sort-label" className={styles.sort}>
          {(['time', 'magnitude'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={p.sort === s}
              className={styles.sortBtn}
              onClick={() => p.onSort(s)}
            >
              {s === 'time' ? t.sortTime : t.sortMagnitude}
            </button>
          ))}
        </div>
      </div>

      {p.loading ? (
        <ul className={styles.list} aria-busy="true" aria-label={t.listLabel}>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={styles.skeleton} aria-hidden="true">
              <span className={styles.skDot} />
              <span className={styles.skLines}><span /><span /></span>
            </li>
          ))}
        </ul>
      ) : p.quakes.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t.emptyTitle}</p>
          <p>{t.emptyBody}</p>
          <button type="button" className={styles.resetBtn} onClick={p.onReset}>{t.resetFilters}</button>
        </div>
      ) : (
        <>
          <ul ref={listRef} role="list" className={styles.list} aria-label={t.listLabel} onKeyDown={onKeyDown}>
            {p.quakes.slice(0, visible).map((q) => (
              <QuakeRow
                key={q.id}
                quake={q}
                now={now}
                selected={q.id === p.selectedId}
                highlighted={q.id === p.highlightId}
                fresh={p.freshIds.has(q.id)}
                onSelect={p.onSelect}
                onHover={p.onHover}
              />
            ))}
          </ul>
          {p.quakes.length > visible && (
            <button type="button" className={styles.more} onClick={() => setShown(visible + PAGE)}>
              {t.showMore(Math.min(PAGE, p.quakes.length - visible))}
            </button>
          )}
        </>
      )}
    </section>
  )
}
