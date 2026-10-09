import type { On } from 'claude-code'
import { type Engine, expect, mock, test } from 'claude-code/testing'

import { cycle, fit, hit, order } from './grid'

const PANE = { plugin: 'divramod-subagent-context', surface: 'terminal', component: 'Pane', props: { title: 'Subagents: context', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} }, requestId: 'subagent-context', viewport: { columns: 100, rows: 12 } } as const

const AGENTS = ['alpha', 'beta', 'gamma'].map(id => ({ id, description: id, type: 'general-purpose', status: 'running' }) as const)
const usage = (tokens: number) => ({ input_tokens: 0, output_tokens: 1, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' })

// Three subagents, one step each, in this order: alpha at 300k, beta at 100k, gamma at 200k (the stub answers a
// step with as many cached tokens as its `messageCount`).
const steps = async ($: Engine, on: On) => {
  mock.clock(on)
  on('agent.list', () => ({ value: [...AGENTS] }))
  on('turn.step', async function* (_$, e) {
    const u = usage(e.messageCount)
    yield { kind: 'stop', stopReason: 'end_turn', usage: u }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: u }
  })
  for (const [agentId, tokens] of [['alpha', 300_000], ['beta', 100_000], ['gamma', 200_000]] as const) {
    const s = $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'high', messageCount: tokens, agentId })
    while (!(await s.next()).done);
  }
}

// The widths start at 36 7 7 5 6 6 5 3 4 with a cell between: Peak is column 5 at x 66-71, the border of Subagent x 36.
const PEAK = 67
const BORDER = 36

test('on VS Code, which draws no Client, the rows are plain lines in start order', async ($, on) => {
  await steps($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  const lines = (await ui.findAll({ type: 'Text', text: /^(alpha|beta|gamma) / })).map(t => t.text.split(' ')[0])
  expect(lines).toEqual(['alpha', 'beta', 'gamma'])
  await ui.unmount()
})

const mounted = async ($: Engine, on: On, surface: 'terminal' | 'desktop' = 'terminal') => {
  await steps($, on)
  const ui = await $.ui.mount({ ...PANE, surface })
  await ui.resize({ columns: 100, rows: 10, in: 'table' })
  const texts = async () => (await ui.findAll({ type: 'Text', in: 'table' })).map(t => t.text)
  const names = async () => (await texts()).slice(1).map(t => t.split(' ')[0])
  const click = async (x: number) => {
    await ui.pointer({ type: 'down', x, y: 0, button: 'left' })
    await ui.pointer({ type: 'up', x, y: 0, button: 'left' })
  }
  const drag = async (from: number, to: number) => {
    await ui.pointer({ type: 'down', x: from, y: 0, button: 'left' })
    await ui.pointer({ type: 'move', x: to, y: 0, button: 'left' })
    await ui.pointer({ type: 'up', x: to, y: 0, button: 'left' })
  }
  return { ui, texts, names, click, drag }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`on the ${surface} a click on a header sorts its column ascending, then descending, then not`, async ($, on) => {
    const { ui, texts, names, click } = await mounted($, on, surface)
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    await ui.pointer({ type: 'down', x: PEAK, y: 1, button: 'left' })
    await ui.pointer({ type: 'up', x: PEAK, y: 1, button: 'left' })
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    await click(PEAK)
    expect(await names()).toEqual(['beta', 'gamma', 'alpha'])
    expect((await texts())[0]).toMatch(/Peak ▲/)
    await click(PEAK)
    expect(await names()).toEqual(['alpha', 'gamma', 'beta'])
    expect((await texts())[0]).toMatch(/Peak ▼/)
    await click(PEAK)
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    expect((await texts())[0]).not.toMatch(/[▲▼]/)
    await ui.unmount()
  })
}

test('a drag on a header border widens and narrows its column, never below 3 cells', async ($, on) => {
  const { ui, texts, names, drag } = await mounted($, on)
  await drag(BORDER, BORDER + 6)
  expect((await texts())[0]!.indexOf('│')).toBe(42)
  expect((await texts())[1]!.indexOf('opus')).toBe(43)
  await drag(42, 20)
  expect((await texts())[0]!.indexOf('│')).toBe(20)
  await drag(20, 0)
  expect((await texts())[0]!.indexOf('│')).toBe(3)
  expect(await names()).toEqual(['al…', 'be…', 'ga…'])
  expect((await texts())[0]).not.toMatch(/[▲▼]/)
  await ui.unmount()
})

test('the last column takes the rest of the region', async ($, on) => {
  const { ui, texts } = await mounted($, on)
  expect((await texts())[0]).toHaveLength(100)
  await ui.resize({ columns: 120, rows: 10, in: 'table' })
  expect((await texts())[0]).toHaveLength(120)
  await ui.unmount()
})

test('rows without counts sort last both ways; a header cell is a label, a border or nothing', async () => {
  const rows = [
    { id: 'a', cells: [], values: [null], color: null },
    { id: 'b', cells: [], values: [2], color: null },
    { id: 'c', cells: [], values: [1], color: null },
  ]
  expect(order(rows, { col: 0, dir: 'asc' }).map(r => r.id)).toEqual(['c', 'b', 'a'])
  expect(order(rows, { col: 0, dir: 'desc' }).map(r => r.id)).toEqual(['b', 'c', 'a'])
  expect(cycle({ col: 1, dir: 'desc' }, 2)).toEqual({ col: 2, dir: 'asc' })
  expect(hit([5, 5], 5)).toEqual({ col: 0, border: true })
  expect(hit([5, 5], 8)).toEqual({ col: 1, border: false })
  expect(hit([5, 5], 11)).toBeUndefined()
  expect(fit([5, 5, 5], 0)).toEqual([5, 5, 5])
  expect(fit([5, 5, 5], 14)).toEqual([5, 5, 3])
})
