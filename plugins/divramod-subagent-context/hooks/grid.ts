import type { ClientPointerEvent } from 'claude-code'

// What the hooks module hands the table: the header labels, the start widths and per row its cells, sort values
// and color (`null`: the surface's default).
export type TableRow = { id: string; cells: string[]; values: (string | number | null)[]; color: string | null }
export type TableProps = { heads: string[]; widths: number[]; rows: TableRow[] }

export type Sort = { col: number; dir: 'asc' | 'desc' }

// The table's own state: the sort, the widths, a border being dragged and the label a button went down on.
export type View = { sort?: Sort; widths: number[]; drag?: { col: number; from: number; width: number }; press?: number }

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

// The view after one pointer event: a press on a border drags it, a press and release on one label sorts by it.
export const point = (view: View, e: ClientPointerEvent, laid: readonly number[]): View => {
  const at = e.y === 0 ? hit(laid, e.x) : undefined
  if (e.type === 'down' && e.button === 'left') {
    if (at?.border) return { ...view, press: undefined, drag: { col: at.col, from: e.x, width: laid[at.col]! } }
    return { ...view, press: at?.col, drag: undefined }
  }
  if (e.type === 'move' && view.drag) {
    const { col, from, width } = view.drag
    return { ...view, widths: view.widths.map((w, i) => (i === col ? Math.max(MIN, width + e.x - from) : w)) }
  }
  if (e.type === 'up' && (view.drag || view.press !== undefined)) {
    const sort = view.press !== undefined && at && !at.border && at.col === view.press ? cycle(view.sort, at.col) : view.sort
    return { ...view, sort, drag: undefined, press: undefined }
  }
  return view
}

// The header's labels in their widths, `│` between them, the sorted one marked ▲ or ▼.
export const header = (heads: readonly string[], laid: readonly number[], sort: Sort | undefined) =>
  heads
    .map((label, i) => {
      const w = laid[i] ?? label.length
      return sort?.col === i ? pad(label, Math.max(0, w - 2)) + (sort.dir === 'asc' ? ' ▲' : ' ▼') : pad(label, w)
    })
    .join('│')

export const row = (cells: readonly string[], laid: readonly number[]) =>
  cells.map((cell, i) => pad(cell, laid[i] ?? cell.length)).join(' ')
