import { expect, mock, test } from 'claude-code/testing'

import { limits } from './table'
import { summary, wanted } from './register'
import { mounted } from './testkit'

test('the pane asks for a row per subagent, between 9 and 20', () => {
  expect([0, 5, 9, 30].map(wanted)).toEqual([9, 9, 13, 20])
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
  on('ui.panes', () => ({ value: up ? [{ id: 'subagent-context', title: 'Subagents: context', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.open', (_$, e) => {
    asked.push(e.rows)
    return { value: undefined as never }
  })
  await mounted($, on)
  await $.classic.SubagentStart({ agent_id: 'delta', agent_type: 'general-purpose' } as never)
  expect(asked).toEqual([9])
  up = false
  await $.classic.SubagentStart({ agent_id: 'eps', agent_type: 'general-purpose' } as never)
  expect(asked).toEqual([9])
})

test("the pane's top right shows the version of plugin.json", async ($, on) => {
  on('fs.read', (_$, e) => {
    if (!e.path.endsWith('/.claude-plugin/plugin.json')) throw new Error(`ENOENT ${e.path}`)
    return { value: JSON.stringify({ version: '9.8.7' }) }
  })
  const { ui } = await mounted($, on)
  expect(await ui.find({ type: 'Text', text: 'v9.8.7' })).toBeDefined()
})

test('the summary line counts running and finished and keeps the highest peak', () => {
  const l = limits({ window: '1m' }, 1_000_000)
  const row = (id: string, peak: number, status: string) => ({ id, description: id, model: '', effort: '', calls: 1, now: peak, peak, compactions: 0, minutes: 1, started: 0, mtime: 0, status })
  expect(summary([], l)).toBeUndefined()
  expect(summary([row('a', 100_000, 'running'), row('b', 250_000, 'completed')], l)).toBe('subagents: 1 running · 1 finished · peak 25%')
  expect(summary([row('a', 400_000, 'failed')], l)).toBe('subagents: 0 running · 1 finished · peak 40% ⚠')
})

test('a button above the prompt opens the pane, and closes it when it is open', async ($, on) => {
  const calls: string[] = []
  let up = false
  on('ui.panes', () => ({ value: up ? [{ id: 'subagent-context', title: 't', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.open', (_$, e) => {
    calls.push(`open ${e.rows} ${e.focus}`)
    return { value: undefined as never }
  })
  on('ui.close', (_$, e) => {
    calls.push(`close ${e.id}`)
    return { value: undefined }
  })
  await mounted($, on)
  const band = await $.ui.mount({ plugin: 'divramod-subagent-context', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 5, columns: 100 }, requestId: 'band', viewport: { columns: 100, rows: 12 } } as never)
  expect((await band.find({ type: 'Button', key: 'subagents' }))?.props.hotkey).toBe('s')
  await band.press({ key: 'subagents' })
  up = true
  await band.press({ key: 'subagents' })
  expect(calls).toEqual(['open 9 true', 'close subagent-context'])
})

test('the command opens the pane focused, the start of a session does not take the keyboard', async ($, on) => {
  const asked: (true | undefined)[] = []
  on('ui.open', (_$, e) => {
    asked.push(e.focus)
    return { value: undefined as never }
  })
  mock.env(on, { HOME: '/h' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000 } } as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('session.id', () => ({ value: 'S1' }))
  on('fs.list', () => ({ value: [] }))
  await mounted($, on)
  await $.session.start({ cwd: '/w' } as never)
  await $.command.run({ command: 'divramod-subagent-context' } as never)
  expect(asked).toEqual([undefined, true])
})
