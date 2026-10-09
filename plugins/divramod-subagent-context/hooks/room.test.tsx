import { expect, test } from 'claude-code/testing'

import { wanted } from './register'
import { mounted } from './testkit'

test('the pane asks for a row per subagent, between 8 and 20', () => {
  expect([0, 5, 9, 30].map(wanted)).toEqual([8, 8, 12, 20])
})

test('rows that do not fit are counted, not dropped silently', async ($, on) => {
  const { ui, all } = await mounted($, on)
  await ui.resize({ columns: 100, rows: 4, in: 'table' })
  const texts = await all()
  // Two rows of room: one subagent and the count of the other two.
  expect(texts.filter(t => /^[●✓✗] /.test(t))).toHaveLength(1)
  expect(texts.some(t => t.startsWith('… 2 more above'))).toBe(true)
  await ui.resize({ columns: 100, rows: 10, in: 'table' })
  expect((await all()).some(t => t.startsWith('…'))).toBe(false)
})

test('a subagent that starts asks the open pane for room, a closed pane stays closed', async ($, on) => {
  const asked: (number | undefined)[] = []
  let up = true
  on('ui.panes', () => ({ value: up ? [{ id: 'subagent-context', title: 'Subagents: context', isShown: true, hasFocus: false, isPlaced: true }] : [] }))
  on('ui.open', (_$, e) => {
    asked.push(e.rows)
    return { value: undefined as never }
  })
  await mounted($, on)
  await $.classic.SubagentStart({ agent_id: 'delta', agent_type: 'general-purpose' } as never)
  expect(asked).toEqual([8])
  up = false
  await $.classic.SubagentStart({ agent_id: 'eps', agent_type: 'general-purpose' } as never)
  expect(asked).toEqual([8])
})
