import { expect, test } from 'claude-code/testing'

import type { SubagentRow } from '../types'
import { limits, line, tone } from './table'

const row = (peak: number, compactions = 0): SubagentRow => ({
  id: 'a1', description: 'Plan 0214 step 30', model: 'opus', effort: 'xhigh', calls: 40, now: peak, peak, compactions, minutes: 5, mtime: 1,
})

const DEFAULTS = limits({}, 1_000_000)
const PANE = { plugin: 'divramod-subagent-context', surface: 'terminal', component: 'Pane', props: {}, requestId: 'subagent-context', viewport: { columns: 120, rows: 24 } } as const

test('a row names the step, model, effort, peak and its share of the window', async () => {
  expect(line(row(310_000), DEFAULTS)).toMatch(/step 30\s+opus\s+xhigh\s+40\s+310k\s+310k\s+31\.0\s+0\s+5/)
})

test('a row is plain below 30%, yellow from 30%, red from 35% or after a compaction', async () => {
  expect(tone(row(68_000), DEFAULTS)).toBeUndefined()
  expect(tone(row(310_000), DEFAULTS)).toBe('yellow')
  expect(tone(row(360_000), DEFAULTS)).toBe('red')
  expect(tone(row(68_000, 1), DEFAULTS)).toBe('red')
})

test('window auto takes the session window, 200k and 1m fix it', async () => {
  expect(limits({ window: 'auto' }, 200_000).window).toBe(200_000)
  expect(limits({ window: '200k' }, 1_000_000).window).toBe(200_000)
  expect(limits({ window: '1m' }, 200_000).window).toBe(1_000_000)
})

test('the thresholds come from the options', async () => {
  const l = limits({ window: '200k', warn_percent: 10, alert_percent: 50 }, 1_000_000)
  expect(tone(row(19_000), l)).toBeUndefined()
  expect(tone(row(20_000), l)).toBe('yellow')
  expect(tone(row(100_000), l)).toBe('red')
})

test('the pane counts against the window and thresholds the options set', { options: { window: '200k', warn_percent: 10, alert_percent: 50 } }, async $ => {
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /warn 10% · stop 50% of 200k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /%200k/ })).toBeDefined()
  await ui.unmount()
})

test('without options the pane uses the defaults', async $ => {
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /warn 30% · stop 35% of 1M/ })).toBeDefined()
  await ui.unmount()
})
