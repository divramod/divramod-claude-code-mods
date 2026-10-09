import type { ClientSurface } from 'claude-code'

import { type TableProps, type View, fit, header, order, point, row } from './grid'

// The subagents' table, drawn on the surface: a click on a header label sorts, a drag on a border resizes (D14).
export default function TableView(props: TableProps, surface: ClientSurface<View>) {
  const { Box, Text } = surface.elements
  if (!surface.state) {
    surface.setState({ widths: props.widths })
    surface.onPointer(e => {
      const view = surface.state
      if (!view) return
      const next = point(view, e, fit(view.widths, surface.columns))
      if (next !== view) surface.setState(next)
    })
  }
  const view = surface.state ?? { widths: props.widths }
  const laid = fit(view.widths, surface.columns)
  const rows = order(props.rows, view.sort)
  // As many rows as fit below the header: the newest unsorted, the first ones sorted.
  const room = surface.rows > 1 ? surface.rows - 1 : rows.length
  const shown = view.sort ? rows.slice(0, room) : rows.slice(-room)
  return (
    <Box flexDirection="column">
      <Text bold>{header(props.heads, laid, view.sort)}</Text>
      {props.rows.length === 0 && <Text dimColor>No subagents yet.</Text>}
      {shown.map(r => (
        <Text key={r.id} color={r.color ?? undefined}>
          {row(r.cells, laid)}
        </Text>
      ))}
    </Box>
  )
}
