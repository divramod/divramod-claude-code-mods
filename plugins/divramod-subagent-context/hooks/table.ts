import type { SubagentRow } from '../types'

export const WINDOW = 1_000_000 // the subagents run with the 1M window (peaks over 200k without a compaction)
export const WARN = 0.3 // told to commit and report
export const ALERT = 0.35 // stopped, the rest to a fresh subagent

const k = (n: number) => `${Math.round(n / 1000)}k`
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))

export const share = (row: SubagentRow) => row.peak / WINDOW

export const tone = (row: SubagentRow): 'red' | 'yellow' | undefined =>
  share(row) >= ALERT || row.compactions > 0 ? 'red' : share(row) >= WARN ? 'yellow' : undefined

export const HEAD = `${pad('Subagent', 36)} ${pad('Model', 7)} ${pad('Effort', 7)} ${pad('Calls', 5)} ${pad('Now', 6)} ${pad('Peak', 6)} ${pad('%1M', 5)} ${pad('Cmp', 3)} Min`

export const line = (row: SubagentRow) =>
  `${pad(row.description || row.id, 36)} ${pad(row.model, 7)} ${pad(row.effort || '-', 7)} ${pad(String(row.calls), 5)} ${pad(k(row.now), 6)} ${pad(k(row.peak), 6)} ${pad((share(row) * 100).toFixed(1), 5)} ${pad(String(row.compactions), 3)} ${row.minutes}`
