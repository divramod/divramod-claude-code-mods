import { expect, test } from 'claude-code/testing'

import { cycle, fit, hit, order } from './grid'
import { BORDER, PANE, PEAK, mounted, steps } from './testkit'

test('on VS Code, which draws no Client, the rows are plain lines in start order', async ($, on) => {
  await steps($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  const lines = (await ui.findAll({ type: 'Text', text: /^● (alpha|beta|gamma) / })).map(t => t.text.split(' ')[1])
  expect(lines).toEqual(['alpha', 'beta', 'gamma'])
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`on the ${surface} a click on a header sorts its column ascending, then descending, then not`, async ($, on) => {
    const { ui, header, names, click } = await mounted($, on, surface)
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    await click(PEAK, 2)
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    await click(PEAK)
    expect(await names()).toEqual(['beta', 'gamma', 'alpha'])
    expect(await header()).toMatch(/Peak ▲/)
    await click(PEAK)
    expect(await names()).toEqual(['alpha', 'gamma', 'beta'])
    expect(await header()).toMatch(/Peak ▼/)
    await click(PEAK)
    expect(await names()).toEqual(['alpha', 'beta', 'gamma'])
    expect(await header()).not.toMatch(/[▲▼]/)
    await ui.unmount()
  })
}

// The border right of Subagent is the header's second `│`.
test('a drag on a header border widens and narrows its column, never below 3 cells', async ($, on) => {
  const { ui, texts, header, names, drag } = await mounted($, on)
  const border = async () => (await header()).indexOf('│', 2)
  await drag(BORDER, BORDER + 6)
  expect(await border()).toBe(44)
  expect((await texts())[1]!.indexOf('opus')).toBe(45)
  await drag(44, 20)
  expect(await border()).toBe(20)
  await drag(20, 0)
  expect(await border()).toBe(5)
  expect(await names()).toEqual(['al…', 'be…', 'ga…'])
  expect(await header()).not.toMatch(/[▲▼]/)
  await ui.unmount()
})

test('the last column takes the rest of the region', async ($, on) => {
  const { ui, header } = await mounted($, on)
  expect(await header()).toHaveLength(100)
  await ui.resize({ columns: 120, rows: 10, in: 'table' })
  expect(await header()).toHaveLength(120)
  await ui.unmount()
})

test('rows without counts sort last both ways; a header cell is a label, a border or nothing', async () => {
  const rows = [
    { id: 'a', cells: [], values: [null], color: null, running: false },
    { id: 'b', cells: [], values: [2], color: null, running: false },
    { id: 'c', cells: [], values: [1], color: null, running: false },
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
