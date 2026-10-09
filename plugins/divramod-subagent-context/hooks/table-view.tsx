import type { ClientSurface } from 'claude-code'

import { type TableProps, type View, FILTERS, fit, header, key, order, point, row, shown, tabs } from './grid'

// Each instance's latest props: its listeners are set once and must see the tabs as last drawn.
const latest = new WeakMap<object, TableProps>()

// The subagents' table, drawn on the surface: a click on a tab or `a` `r` `f` filters, a click on a header label
// sorts, a drag on a border resizes (D14, D16).
export default function TableView(props: TableProps, surface: ClientSurface<View>) {
  const { Box, Text } = surface.elements
  latest.set(surface, props)
  if (!surface.state) {
    surface.setState({ widths: props.widths })
    surface.onPointer(e => {
      const view = surface.state
      if (!view) return
      const next = point(view, e, fit(view.widths, surface.columns), tabs((latest.get(surface) ?? props).rows))
      if (next !== view) surface.setState(next)
    })
    surface.onKey(e => {
      const view = surface.state
      const next = view && !e.ctrl && !e.meta ? key(view, e.key) : view
      if (next && next !== view) surface.setState(next)
    })
  }
  const view = surface.state ?? { widths: props.widths }
  const filter = view.filter ?? 'all'
  const laid = fit(view.widths, surface.columns)
  const rows = order(shown(props.rows, filter), view.sort)
  // As many rows as fit below the tabs and the header: the newest unsorted, the first ones sorted.
  const room = surface.rows > 2 ? surface.rows - 2 : rows.length
  const visible = view.sort ? rows.slice(0, room) : rows.slice(-room)
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
    </Box>
  )
}
