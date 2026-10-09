import type { PluginOptions } from 'claude-code'

import type { SubagentRow } from '../types'

// The window a share is counted against and the two thresholds, from the mod's options.
export type Limits = { window: number; warn: number; alert: number }

const WINDOWS: Record<string, number> = { '200k': 200_000, '1m': 1_000_000 }

// `auto` takes the session's own window: no API gives a subagent's (research 0063, E9).
export const limits = (options: PluginOptions, sessionWindow: number): Limits => ({
  window: WINDOWS[String(options.window)] ?? sessionWindow,
  warn: Number(options.warn_percent ?? 30) / 100,
  alert: Number(options.alert_percent ?? 35) / 100,
})

const k = (n: number) => `${Math.round(n / 1000)}k`
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
const label = (window: number) => (window >= 1_000_000 ? `${window / 1_000_000}M` : k(window))

export const share = (row: SubagentRow, l: Limits) => row.peak / l.window

export const tone = (row: SubagentRow, l: Limits): 'red' | 'yellow' | undefined =>
  share(row, l) >= l.alert || row.compactions > 0 ? 'red' : share(row, l) >= l.warn ? 'yellow' : undefined

// The table's columns and their start widths; the last one takes the rest of the room.
export const WIDTHS = [36, 7, 7, 5, 6, 6, 5, 3, 4]

export const heads = (l: Limits) => ['Subagent', 'Model', 'Effort', 'Calls', 'Now', 'Peak', `%${label(l.window)}`, 'Cmp', 'Min']

// A row whose transcript was too large to read shows `-` where it has no counts.
export const cells = (row: SubagentRow, l: Limits) => {
  const [calls, now, peak, pct, cmp, min] = row.large
    ? ['-', '-', '-', '-', '-', '-']
    : [String(row.calls), k(row.now), k(row.peak), (share(row, l) * 100).toFixed(1), String(row.compactions), String(row.minutes)]
  return [row.description || row.id, row.model || '-', row.effort || '-', calls, now, peak, pct, cmp, min]
}

// What a column sorts by: text, or a number; `null` (a large row's counts) sorts last either way.
export const values = (row: SubagentRow, l: Limits): (string | number | null)[] => {
  const n = (v: number) => (row.large ? null : v)
  return [row.description || row.id, row.model, row.effort, n(row.calls), n(row.now), n(row.peak), n(share(row, l)), n(row.compactions), n(row.minutes)]
}

const join = (texts: string[]) => texts.map((t, i) => (i === texts.length - 1 ? t : pad(t, WIDTHS[i]!))).join(' ')

export const head = (l: Limits) => join(heads(l))

export const line = (row: SubagentRow, l: Limits) => join(cells(row, l))

export const foot = (l: Limits) => `warn ${Math.round(l.warn * 100)}% · stop ${Math.round(l.alert * 100)}% of ${label(l.window)}`
