import { useEffect, useRef } from 'react'
import { quakeArrivals } from '../api/liveEvents'
import type { Earthquake } from '../api/types'
import { fmtMag } from '../i18n/tr'
import styles from './Seismograph.module.css'

const SPEED = 28 // px per second
const GRID = 24 // px between vertical grid lines

interface Label {
  sample: number // absolute sample index of the peak
  text: string
}

function readColors(el: Element) {
  const cs = getComputedStyle(el)
  return {
    ink: cs.getPropertyValue('--ink').trim() || '#1E2A2F',
    soft: cs.getPropertyValue('--ink-soft').trim() || '#56656B',
    grid: cs.getPropertyValue('--grid').trim() || '#DDE2DC',
    paper: cs.getPropertyValue('--paper').trim() || '#F5F6F4',
  }
}

/** A single damped oscillation whose amplitude follows magnitude. */
function burst(mag: number, half: number): number[] {
  const amp = Math.max(3, Math.min(half - 3, (mag / 6) * (half - 3)))
  const len = Math.round(18 + mag * 6)
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    const t = i / len
    const env = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 5.5)
    out.push(amp * env * Math.sin(i * 0.95))
  }
  return out
}

const labelFor = (q: Earthquake) => `${fmtMag(q.magnitude)}  ${q.district ?? q.province ?? ''}`.trim()

/**
 * The live seismograph trace in the header. Flat most of the time; draws one deflection per
 * new quake with its label above. Static when the user prefers reduced motion.
 */
export function Seismograph({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let width = 0
    let height = 0
    let samples: number[] = []
    let total = 0 // absolute count of samples produced so far
    let pending: number[] = []
    let labels: Label[] = []
    let noise = 0
    let carry = 0
    let colors = readColors(canvas)
    let raf = 0
    let last = performance.now()
    let colorCheck = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (samples.length < width) samples = new Array<number>(width - samples.length).fill(0).concat(samples)
      else samples = samples.slice(samples.length - width)
      draw()
    }

    const nextSample = () => {
      noise = noise * 0.86 + (Math.random() - 0.5) * 0.5
      const v = pending.length ? pending.shift()! : 0
      samples.push(v + noise)
      total++
      if (samples.length > width) samples.shift()
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      const mid = height / 2

      // Paper grid: vertical lines scroll with the trace.
      ctx.strokeStyle = colors.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = width - (total % GRID) + 0.5; x > 0; x -= GRID) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      ctx.moveTo(0, mid + 0.5)
      ctx.lineTo(width, mid + 0.5)
      ctx.stroke()

      // Trace
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.25
      ctx.lineJoin = 'round'
      ctx.beginPath()
      const offset = width - samples.length
      samples.forEach((v, i) => (i === 0 ? ctx.moveTo(offset + i, mid - v) : ctx.lineTo(offset + i, mid - v)))
      ctx.stroke()

      // Labels ride along with their deflection and fade near the left edge.
      ctx.font = '600 11px "Geologica Variable", system-ui, sans-serif'
      ctx.textBaseline = 'top'
      labels = labels.filter((l) => width - (total - l.sample) > -200)
      // Newest first; an older label that would collide with a newer one is hidden.
      let leftEdge = Infinity
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i]!
        const x = width - (total - l.sample)
        const tw = ctx.measureText(l.text).width
        const tx = Math.min(width - tw - 4, Math.max(2, x - tw / 2))
        if (tx + tw + 8 > leftEdge) continue
        leftEdge = tx
        ctx.globalAlpha = Math.max(0, Math.min(1, x / 80))
        ctx.fillStyle = colors.paper
        ctx.fillRect(tx - 3, 1, tw + 6, 13)
        ctx.fillStyle = colors.ink
        ctx.fillText(l.text, tx, 2)
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) // clamp after a background tab resumes
      last = now
      carry += dt * SPEED
      while (carry >= 1) {
        nextSample()
        carry -= 1
      }
      if (++colorCheck % 60 === 0) colors = readColors(canvas)
      draw()
      raf = requestAnimationFrame(frame)
    }

    const onQuake = (q: Earthquake) => {
      const b = burst(q.magnitude, height / 2)
      if (reducedMotion) {
        // Static mode: stamp the deflection at the right edge in one go, then redraw once.
        const start = total
        for (const v of b) {
          samples.push(v)
          total++
        }
        samples = samples.slice(-width)
        labels.push({ sample: start + Math.round(b.length * 0.2), text: labelFor(q) })
        draw()
        return
      }
      const peakAt = total + pending.length + Math.round(b.length * 0.2)
      pending = pending.concat(b)
      labels.push({ sample: peakAt, text: labelFor(q) })
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    const unsub = quakeArrivals.subscribe(onQuake)
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => {
      colors = readColors(canvas)
      draw()
    }
    mql.addEventListener('change', onScheme)

    if (!reducedMotion) raf = requestAnimationFrame(frame)
    else {
      for (let i = 0; i < width; i++) samples[i] = 0
      draw()
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      unsub()
      mql.removeEventListener('change', onScheme)
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
