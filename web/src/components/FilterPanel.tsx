import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { sameProvince } from '../api/filters'
import type { Filters, Range } from '../api/types'
import { useProvinces } from '../api/useEarthquakes'
import type { GeoStatus } from '../hooks/useGeolocation'
import { RADII } from '../hooks/useUrlFilters'
import { fmtNum, t } from '../i18n/tr'
import styles from './FilterPanel.module.css'

interface Props {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  geoStatus: GeoStatus
  onNearMe: () => void
  variant: 'panel' | 'chips'
}

const RANGES: Range[] = ['24h', '7d', '30d']

function RangeControl({ value, onChange, short }: { value: Range; onChange: (r: Range) => void; short?: boolean }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <span id={id} className="visually-hidden">{t.timeRange}</span>
      <div role="radiogroup" aria-labelledby={id} className={styles.segmented}>
        {RANGES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={value === r} onClick={() => onChange(r)}>
            {short ? t.rangesShort[r] : t.ranges[r]}
          </button>
        ))}
      </div>
    </div>
  )
}

function MagControl({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const id = useId()
  const [local, setLocal] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    // The URL changed underneath us (reset, back button): adopt the new value.
    setSeen(value)
    setLocal(value)
  }
  // Commit after the thumb settles so dragging does not fire a request per step.
  useEffect(() => {
    if (local === value) return
    const h = setTimeout(() => onChange(local), 250)
    return () => clearTimeout(h)
  }, [local, value, onChange])

  return (
    <div className={styles.field}>
      <div className={styles.magRow}>
        <label htmlFor={id}>{t.minMag}</label>
        <output htmlFor={id} className={`${styles.magOut} num`}>{local === 0 ? 'Tümü' : fmtNum(local, 1)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={6}
        step={0.5}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        className={styles.slider}
        style={{ '--pct': `${(local / 6) * 100}%` } as CSSProperties}
      />
    </div>
  )
}

function ProvinceControl({ value, onChange, autoFocus }: { value: string | null; onChange: (p: string | null) => void; autoFocus?: boolean }) {
  const id = useId()
  const listId = useId()
  const { data: provinces = [] } = useProvinces()
  const [text, setText] = useState(value ?? '')
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(value ?? '')
  }

  const commit = (raw: string) => {
    const s = raw.trim()
    if (!s) return onChange(null)
    const match = provinces.find((p) => sameProvince(p, s))
    onChange(match ?? s)
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className="visually-hidden">{t.province}</label>
      <div className={styles.searchWrap}>
        <input
          id={id}
          type="search"
          list={listId}
          placeholder={t.provinceSearch}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          className={styles.input}
          onChange={(e) => {
            setText(e.target.value)
            // Picking from the datalist should apply immediately.
            if (provinces.some((p) => p === e.target.value)) onChange(e.target.value)
            else if (e.target.value === '') onChange(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && commit(text)}
          onBlur={() => text !== (value ?? '') && commit(text)}
        />
        <datalist id={listId}>
          {provinces.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>
    </div>
  )
}

function NearControl({ filters, onChange, geoStatus, onNearMe }: Omit<Props, 'variant'>) {
  const near = filters.near
  const id = useId()
  return (
    <div className={styles.field}>
      {near ? (
        <div className={styles.nearActive}>
          <span className={styles.nearText}>{t.nearActive(near.radiusKm, near.fromMe)}</span>
          <label htmlFor={id} className="visually-hidden">{t.radius}</label>
          <select
            id={id}
            className={styles.select}
            value={near.radiusKm}
            onChange={(e) => onChange({ near: { ...near, radiusKm: Number(e.target.value) } })}
          >
            {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
          <button type="button" className={styles.linkBtn} onClick={() => onChange({ near: null })}>{t.clear}</button>
        </div>
      ) : (
        <button type="button" className={styles.button} onClick={onNearMe} disabled={geoStatus === 'pending'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="currentColor" />
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {geoStatus === 'pending' ? t.locating : t.nearMe}
        </button>
      )}
      {(geoStatus === 'denied' || geoStatus === 'unavailable') && !near && (
        <p className={styles.note} role="status">{geoStatus === 'denied' ? t.geoDenied : t.geoUnavailable}</p>
      )}
    </div>
  )
}

type ChipKey = 'range' | 'mag' | 'province' | 'near'

export function FilterPanel(props: Props) {
  const { filters, onChange, variant } = props
  const [open, setOpen] = useState<ChipKey | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!popRef.current?.parentElement?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (variant === 'panel') {
    return (
      <div className={styles.panel}>
        <RangeControl value={filters.range} onChange={(range) => onChange({ range })} />
        <MagControl value={filters.minMag} onChange={(minMag) => onChange({ minMag })} />
        <ProvinceControl value={filters.province} onChange={(province) => onChange({ province })} />
        <NearControl {...props} />
      </div>
    )
  }

  const chips: { key: ChipKey; label: string; active: boolean }[] = [
    { key: 'range', label: t.rangesShort[filters.range], active: filters.range !== '24h' },
    { key: 'mag', label: filters.minMag > 0 ? `M${fmtNum(filters.minMag, filters.minMag % 1 ? 1 : 0)}+` : 'M: Tümü', active: filters.minMag > 0 },
    { key: 'province', label: filters.province ?? t.province, active: !!filters.province },
    { key: 'near', label: filters.near ? `${filters.near.radiusKm} km` : t.nearMeShort, active: !!filters.near },
  ]

  return (
    <div className={styles.chipsWrap}>
      <div className={styles.chips}>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.chip}
            data-active={c.active || undefined}
            aria-expanded={open === c.key}
            onClick={() => setOpen(open === c.key ? null : c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {open && (
        <div ref={popRef} className={styles.popover} role="group" aria-label={chips.find((c) => c.key === open)?.label}>
          {open === 'range' && <RangeControl short value={filters.range} onChange={(range) => { onChange({ range }); setOpen(null) }} />}
          {open === 'mag' && <MagControl value={filters.minMag} onChange={(minMag) => onChange({ minMag })} />}
          {open === 'province' && <ProvinceControl autoFocus value={filters.province} onChange={(province) => { onChange({ province }); if (province) setOpen(null) }} />}
          {open === 'near' && (
            <>
              <NearControl {...props} />
              {!filters.near && <p className={styles.note}>{t.pickHint}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
