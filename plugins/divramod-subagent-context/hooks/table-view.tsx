import type { ClientSurface } from 'claude-code'

import { type TableProps, type View, FILTERS, fit, fits, header, first, line, order, point, restore, rule, saved, shown, step, tabs } from './grid'

// Each instance's latest props: its listeners are set once and must see the tabs as last drawn.
const latest = new WeakMap<object, TableProps>()

// The epoch each instance last saw: a new one means the pane chose the view (a pane-level `a` `r` `f`), which it takes over.
const epochs = new WeakMap<object, number>()

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

// The subagents' table, drawn on the surface: a click on a tab, `a` `r` `f`, `h` `l` or the arrow keys filter, `j` `k` move the row, `q` closes, a click on a header label
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
      const ids = order(shown((latest.get(surface) ?? props).rows, view?.filter ?? 'all'), view?.sort).map(r => r.id)
      const next = view && !e.ctrl && !e.meta ? step(view, e.key, ids) : view
      if (next && next !== view) commit(surface, next)
    })
  }
  if (epochs.has(surface) && epochs.get(surface) !== (props.epoch ?? 0)) {
    surface.setState(restore(props))
    posted.set(surface, JSON.stringify(saved(restore(props))))
  }
  epochs.set(surface, props.epoch ?? 0)
  const view = surface.state ?? restore(props)
  const filter = view.filter ?? 'all'
  const laid = fit(view.widths, surface.columns)
  const rows = order(shown(props.rows, filter), view.sort)
  // As many rows as fit between the lines the table itself needs: the newest unsorted, the first ones sorted.
  const room = fits(rows.length, surface.rows)
  const hidden = rows.length - room
  const from = first(rows, room, !!view.sort, view.cursor)
  const visible = rows.slice(from, from + room)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {tabs(props.rows).map((label, i) => (
          <Text key={FILTERS[i]} inverse={FILTERS[i] === filter} dimColor={FILTERS[i] !== filter}>
            {label}
          </Text>
        ))}
      </Box>
      <Text dimColor>{rule(laid, 'top')}</Text>
      <Text bold>{header(props.heads, laid, props.aligns, view.sort)}</Text>
      <Text dimColor>{rule(laid, 'mid')}</Text>
      {rows.length === 0 && <Text dimColor>{line([props.rows.length ? 'No subagents in this view.' : 'No subagents yet.'], [laid.reduce((sum, w) => sum + w + 1, -1)], ['l'])}</Text>}
      {visible.map((r, i) => (
        <Box key={r.id} flexDirection="column">
          {i > 0 && <Text dimColor>{rule(laid, 'mid')}</Text>}
          <Text color={r.color ?? undefined} inverse={r.id === view.cursor}>{line(r.cells, laid, props.aligns)}</Text>
        </Box>
      ))}
      {hidden > 0 && <Text dimColor>{`… ${hidden} more: make the pane taller`}</Text>}
      <Text dimColor>{rule(laid, 'mid')}</Text>
      <Text bold>{line(props.sums[filter], laid, props.aligns)}</Text>
      <Text dimColor>{rule(laid, 'bottom')}</Text>
    </Box>
  )
}
