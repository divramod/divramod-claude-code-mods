import { expect, test } from 'claude-code/testing'

import { isState, restore } from './grid'
import { BORDER, PANE, PEAK, mounted } from './testkit'

const stop = (agent_id: string) => ({ agent_id, agent_type: 'general-purpose', agent_transcript_path: '', stop_hook_active: false })

test('a redraw and a remount show the last sort, widths and filter', async ($, on) => {
  const { ui, status, names, header, click, drag } = await mounted($, on)
  status.beta = 'completed'
  await $.classic.SubagentStop(stop('beta'))
  await click(PEAK)
  await drag(BORDER, BORDER + 6)
  await ui.key({ key: 'r', in: 'table' })
  const shows = async (n: () => Promise<(string | undefined)[]>, h: () => Promise<string>) => {
    expect(await n()).toEqual(['gamma', 'alpha'])
    expect(await h()).toMatch(/Peak ▲/)
    expect((await h()).indexOf('│', 2)).toBe(44)
  }
  await shows(names, header)
  await ui.redraw()
  await shows(names, header)
  await ui.unmount()

  const again = await $.ui.mount(PANE)
  await again.resize({ columns: 100, rows: 10, in: 'table' })
  const texts = async () => (await again.findAll({ type: 'Text', in: 'table' })).map(t => t.text).slice(3)
  await shows(async () => (await texts()).slice(1).map(t => t.split(' ')[1]), async () => (await texts())[0]!)
  expect((await again.find({ type: 'Text', text: ' Running 2 ', in: 'table' }))?.props.inverse).toBe(true)
  await again.unmount()
})

test('only a whole table state is kept, and widths only while the columns are the same', async () => {
  const kept = { sort: { col: 6, dir: 'desc' as const }, widths: [1, 40, 7], filter: 'finished' as const }
  expect(isState(kept)).toBe(true)
  expect(isState({ ...kept, filter: 'some' })).toBe(false)
  expect(isState({ ...kept, widths: [0] })).toBe(false)
  expect(isState({ ...kept, sort: { col: 1, dir: 'up' } })).toBe(false)
  expect(isState(null)).toBe(false)
  expect(restore({ heads: [], widths: [1, 36, 7], rows: [], view: kept })).toEqual({ widths: [1, 40, 7], filter: 'finished', sort: kept.sort })
  expect(restore({ heads: [], widths: [1, 36], rows: [], view: kept }).widths).toEqual([1, 36])
  expect(restore({ heads: [], widths: [1, 36], rows: [], view: null })).toEqual({ widths: [1, 36] })
})
