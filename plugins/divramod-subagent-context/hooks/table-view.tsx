import type { ClientSurface } from 'claude-code'

import { type TableProps, type View, FILTERS, fit, header, key, order, point, restore, row, saved, shown, tabs } from './grid'

// Each instance's latest props: its listeners are set once and must see the tabs as last drawn.
const latest = new WeakMap<object, TableProps>()

// What each instance last posted (or started from), as JSON.
const posted = new WeakMap<object, string>()

// The next view; its kept part goes to the hooks module when it differs from the last posted, a drag's once it ends.
const commit = (surface: ClientSurface<View>, next: View) => {
  surface.setState(next)
  const kept = saved(next)
  if (next.drag || JSON.stringify(kept) === posted.get(surface)) return
  posted.set(surface, JSON.stringify(kept))
  surface.post(kept)
}

// The subagents' table, drawn on the surface: a click on a tab or `a` `r` `f` filters, `q` closes, a click on a header label
// sorts, a drag on a border resizes (D14, D16).
export default function TableView(props: TableProps, surface: ClientSurface<View>) {
  const { Box, Text } = surface.elements
  latest.set(surface, props)
  if (!surface.state) {
    surface.setState(restore(props))
    posted.set(surface, JSON.stringify(saved(restore(props))))
    surface.onPointer(e => {
      const view = surface.state
      if (!view) return
      const next = point(view, e, fit(view.widths, surface.columns), tabs((latest.get(surface) ?? props).rows))
      if (next !== view) commit(surface, next)
    })
    surface.onKey(e => {
      // `q` closes the pane: the hooks module does it, a Client cannot (D18).
      if (e.key === 'q' && !e.ctrl && !e.meta) return surface.post({ close: true })
      const view = surface.state
      const next = view && !e.ctrl && !e.meta ? key(view, e.key) : view
      if (next && next !== view) commit(surface, next)
    })
  }
  const view = surface.state ?? restore(props)
  const filter = view.filter ?? 'all'
  const laid = fit(view.widths, surface.columns)
  const rows = order(shown(props.rows, filter), view.sort)
  // As many rows as fit below the tabs and the header: the newest unsorted, the first ones sorted.
  const room = surface.rows > 2 ? surface.rows - 2 : rows.length
  // Rows that do not fit are counted in the last line, so none is hidden silently.
  const hidden = rows.length > room && room > 1 ? rows.length - room + 1 : 0
  const fits = room - (hidden ? 1 : 0)
  const visible = view.sort ? rows.slice(0, fits) : rows.slice(-fits)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {tabs(props.rows).map((label, i) => (
          <Text key={FILTERS[i]} inverse={FILTERS[i] === filter} dimColor={FILTERS[i] !== filter}>
            {label}
          </Text>
        ))}
      </Box>
      <Text bold>{header(props.heads, laid, view.sort)}</Text>
      {rows.length === 0 && <Text dimColor>{props.rows.length ? 'No subagents in this view.' : 'No subagents yet.'}</Text>}
      {visible.map(r => (
        <Text key={r.id} color={r.color ?? undefined}>
          {row(r.cells, laid)}
        </Text>
      ))}
      {hidden > 0 && <Text dimColor>{`… ${hidden} more ${view.sort ? 'below' : 'above'}: make the pane taller`}</Text>}
    </Box>
  )
}
