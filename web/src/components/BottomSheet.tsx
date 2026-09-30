import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n/tr'
import styles from './BottomSheet.module.css'

export type SheetState = 'closed' | 'half' | 'full'

interface Props {
  state: SheetState
  onStateChange: (s: SheetState) => void
  /** Always visible, even when closed (summary line + disclaimer). */
  peek: ReactNode
  children: ReactNode
}

const ORDER: SheetState[] = ['closed', 'half', 'full']

/** Draggable bottom sheet with three resting heights. Height (not transform) changes so content can scroll. */
export function BottomSheet({ state, onStateChange, peek, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState({ closed: 96, half: 360, full: 640 })
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const parent = sheetRef.current?.parentElement
    if (!parent) return
    const measure = () => {
      const total = parent.clientHeight
      const peekH = (peekRef.current?.offsetHeight ?? 72) + 20
      setHeights({ closed: peekH, half: Math.round(total * 0.5), full: total - 8 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    if (peekRef.current) ro.observe(peekRef.current)
    return () => ro.disconnect()
  }, [])

  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startH: heights[state], lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false }
  }

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    if (Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.v = (e.clientY - d.lastY) / dt // px/ms, positive = downwards
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    setDragH(Math.min(heights.full, Math.max(heights.closed, d.startH - dy)))
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) {
      // Tap on the handle cycles closed → half → full → closed.
      onStateChange(ORDER[(ORDER.indexOf(state) + 1) % ORDER.length]!)
      return
    }
    const h = dragH ?? heights[state]
    setDragH(null)
    let target: SheetState
    if (Math.abs(d.v) > 0.5) {
      // A flick moves one step in its direction.
      const i = ORDER.indexOf(state) + (d.v < 0 ? 1 : -1)
      target = ORDER[Math.max(0, Math.min(2, i))]!
    } else {
      target = ORDER.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), state)
    }
    onStateChange(target)
  }

  const height = dragH ?? heights[state]

  return (
    <div
      ref={sheetRef}
      className={styles.sheet}
      style={{ height }}
      data-dragging={dragH !== null || undefined}
      data-state={state}
    >
      <div
        className={styles.grab}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className={styles.handle}
          aria-label={state === 'full' ? t.sheetCollapse : t.sheetExpand}
          aria-expanded={state !== 'closed'}
          onClick={(e) => {
            // Pointer taps are handled in onPointerUp; this path is for keyboard activation.
            if (e.detail === 0) onStateChange(ORDER[(ORDER.indexOf(state) + 1) % ORDER.length]!)
          }}
        >
          <span />
        </button>
        <div ref={peekRef}>{peek}</div>
      </div>
      <div className={styles.content} hidden={state === 'closed' && dragH === null}>{children}</div>
    </div>
  )
}
