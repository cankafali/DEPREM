export type MagClass = 'lt2' | '2' | '3' | '4' | '5'

export function magClass(m: number): MagClass {
  if (m >= 5) return '5'
  if (m >= 4) return '4'
  if (m >= 3) return '3'
  if (m >= 2) return '2'
  return 'lt2'
}

export const magVar = (m: number) => `var(--m-${magClass(m)})`

/** Dot diameter in px: grows with magnitude so colour is never the only cue. */
export const dotSize = (m: number) => Math.round(6 + Math.max(0, Math.min(7, m)) * 2.2)
