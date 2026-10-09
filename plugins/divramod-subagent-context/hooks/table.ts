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

export const head = (l: Limits) =>
  `${pad('Subagent', 36)} ${pad('Model', 7)} ${pad('Effort', 7)} ${pad('Calls', 5)} ${pad('Now', 6)} ${pad('Peak', 6)} ${pad(`%${label(l.window)}`, 5)} ${pad('Cmp', 3)} Min`

export const line = (row: SubagentRow, l: Limits) =>
  `${pad(row.description || row.id, 36)} ${pad(row.model, 7)} ${pad(row.effort || '-', 7)} ${pad(String(row.calls), 5)} ${pad(k(row.now), 6)} ${pad(k(row.peak), 6)} ${pad((share(row, l) * 100).toFixed(1), 5)} ${pad(String(row.compactions), 3)} ${row.minutes}`

export const foot = (l: Limits) => `warn ${Math.round(l.warn * 100)}% · stop ${Math.round(l.alert * 100)}% of ${label(l.window)}`
