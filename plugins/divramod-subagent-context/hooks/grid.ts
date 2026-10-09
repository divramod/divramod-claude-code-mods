import type { ClientPointerEvent } from 'claude-code'

import type { TableState } from '../types'

// What the hooks module hands the table: the header labels, the start widths and per row its cells, sort values,
// color (`null`: the surface's default) and whether it still runs.
export type TableRow = { id: string; cells: string[]; values: (string | number | null)[]; color: string | null; running: boolean }
export type TableProps = { heads: string[]; widths: number[]; rows: TableRow[]; view: TableState | null }

export type Sort = { col: number; dir: 'asc' | 'desc' }

export const FILTERS = ['all', 'running', 'finished'] as const
export type Filter = (typeof FILTERS)[number]

// The table's own state: the sort, the widths, the filter, a border being dragged and what a button went down on.
export type View = { sort?: Sort; widths: number[]; filter?: Filter; drag?: { col: number; from: number; width: number }; press?: string }

// What a new instance starts from: the kept state, its widths only while the columns are the same.
export const restore = (props: TableProps): View => {
  const kept = props.view
  if (!kept) return { widths: props.widths }
  const widths = kept.widths.length === props.widths.length ? kept.widths : props.widths
  return { widths, filter: kept.filter, ...(kept.sort ? { sort: kept.sort } : {}) }
}

// What is kept of a view: not a drag or a press under way.
export const saved = (view: View): TableState => ({ sort: view.sort ?? null, widths: view.widths, filter: view.filter ?? 'all' })

// A post's data is the Client's own, but crosses as `unknown`: only a whole TableState is kept.
// What the Client posts when `q` is pressed.
export const isClose = (data: unknown) => typeof data === 'object' && data !== null && (data as { close?: unknown }).close === true

export const isState = (data: unknown): data is TableState => {
  const d = data as TableState | null
  return (
    typeof d === 'object' && d !== null &&
    Array.isArray(d.widths) && d.widths.every(w => Number.isInteger(w) && w > 0) &&
    (FILTERS as readonly string[]).includes(d.filter) &&
    (d.sort === null || (typeof d.sort === 'object' && Number.isInteger(d.sort.col) && (d.sort.dir === 'asc' || d.sort.dir === 'desc')))
  )
}

// The Client's rows: the filter's tabs, the header, then the table's rows.
export const TABS_Y = 0
export const HEAD_Y = 1

export const MIN = 3

export const pad = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s.padEnd(n))

// One click on a column's label: asc, then desc, then off; another column starts at asc.
export const cycle = (sort: Sort | undefined, col: number): Sort | undefined =>
  sort?.col !== col ? { col, dir: 'asc' } : sort.dir === 'asc' ? { col, dir: 'desc' } : undefined

const compare = (a: string | number | null, b: string | number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1

// The rows in the sort's order; off keeps their own order (when each started). `null` sorts last either way.
export const order = (rows: readonly TableRow[], sort: Sort | undefined) => {
  if (!sort) return [...rows]
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const [x, y] = [a.row.values[sort.col] ?? null, b.row.values[sort.col] ?? null]
      return (x === null || y === null ? compare(x, y) : sign * compare(x, y)) || a.i - b.i
    })
    .map(r => r.row)
}

export const shown = (rows: readonly TableRow[], filter: Filter = 'all') =>
  filter === 'all' ? [...rows] : rows.filter(r => r.running === (filter === 'running'))

// The tabs' labels with their counts, as drawn one cell apart from x 0.
export const tabs = (rows: readonly TableRow[]) =>
  FILTERS.map(f => ` ${f[0]!.toUpperCase()}${f.slice(1)} ${shown(rows, f).length} `)

const tabAt = (labels: readonly string[], x: number) => {
  let start = 0
  for (const [i, label] of labels.entries()) {
    if (x >= start && x < start + label.length) return FILTERS[i]
    start += label.length + 1
  }
  return undefined
}

// The widths laid out in `columns` cells: the last column takes the rest, at least MIN; unmeasured (0) keeps them.
export const fit = (widths: readonly number[], columns: number) => {
  if (!columns) return [...widths]
  const used = widths.slice(0, -1).reduce((sum, w) => sum + w + 1, 0)
  return [...widths.slice(0, -1), Math.max(MIN, columns - used)]
}

// What cell `x` of the header is: a column's label, or the border right of it (the last column has none).
export const hit = (widths: readonly number[], x: number) => {
  let start = 0
  for (const [col, w] of widths.entries()) {
    if (x >= start && x < start + w) return { col, border: false }
    if (x === start + w && col < widths.length - 1) return { col, border: true }
    start += w + 1
  }
  return undefined
}

// What a cell of the top rows is: a tab (`f:<filter>`), a column's label (`h:<col>`) or the border right of it (`b:<col>`).
const target = (e: ClientPointerEvent, laid: readonly number[], labels: readonly string[]) => {
  if (e.y === TABS_Y) return tabAt(labels, e.x) && `f:${tabAt(labels, e.x)}`
  const at = e.y === HEAD_Y ? hit(laid, e.x) : undefined
  return at && `${at.border ? 'b' : 'h'}:${at.col}`
}

// The view after one pointer event: a press on a border drags it, a press and release on one label sorts by it,
// on one tab filters by it.
export const point = (view: View, e: ClientPointerEvent, laid: readonly number[], labels: readonly string[]): View => {
  const at = target(e, laid, labels)
  if (e.type === 'down' && e.button === 'left') {
    const col = Number(at?.slice(2))
    if (at?.startsWith('b:')) return { ...view, press: undefined, drag: { col, from: e.x, width: laid[col]! } }
    return { ...view, press: at, drag: undefined }
  }
  if (e.type === 'move' && view.drag) {
    const { col, from, width } = view.drag
    return { ...view, widths: view.widths.map((w, i) => (i === col ? Math.max(MIN, width + e.x - from) : w)) }
  }
  if (e.type === 'up' && (view.drag || view.press)) {
    const done = { ...view, drag: undefined, press: undefined }
    if (!view.press || at !== view.press) return done
    if (at.startsWith('f:')) return { ...done, filter: at.slice(2) as Filter }
    return { ...done, sort: cycle(view.sort, Number(at.slice(2))) }
  }
  return view
}

// The keys `a` `r` `f` choose the filter.
export const key = (view: View, k: string): View => {
  const filter = FILTERS.find(f => f[0] === k)
  return filter && filter !== (view.filter ?? 'all') ? { ...view, filter } : view
}

// The header's labels in their widths, `│` between them, the sorted one marked ▲ or ▼.
export const header = (heads: readonly string[], laid: readonly number[], sort: Sort | undefined) =>
  heads
    .map((label, i) => {
      const w = laid[i] ?? label.length
      const mark = sort?.dir === 'asc' ? '▲' : '▼'
      return sort?.col !== i ? pad(label, w) : w < 3 ? pad(mark, w) : pad(label, w - 2) + ' ' + mark
    })
    .join('│')

export const row = (cells: readonly string[], laid: readonly number[]) =>
  cells.map((cell, i) => pad(cell, laid[i] ?? cell.length)).join(' ')
