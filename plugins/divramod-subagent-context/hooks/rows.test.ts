import { expect, test } from 'claude-code/testing'

import { type Step, family, fill, record } from './rows'

const step = (fill: number, at: number, id = 'a1'): Step => ({ id, description: 'Plan 0214 step 30', status: 'running', model: 'claude-opus-5-5', effort: 'high', fill, at })

test('a request fills the window with its input, cache read and cache write, not its output', async () => {
  expect(fill({ input_tokens: 10, output_tokens: 500, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 300 })).toBe(2_310)
})

test('a model id shows as its family', async () => {
  expect(family('claude-opus-5-5')).toBe('opus')
  expect(family('claude-sonnet-5-5[1m]')).toBe('sonnet')
  expect(family('glm-4.6')).toBe('glm-4.6')
})

test('the first step adds a row, the next ones count calls, now, peak and minutes', async () => {
  const one = record([], step(40_000, 0))
  expect(one).toHaveLength(1)
  const two = record(record(one, step(90_000, 60_000)), step(80_000, 150_000))
  expect(two).toEqual([expect.objectContaining({ id: 'a1', model: 'opus', effort: 'high', calls: 3, now: 80_000, peak: 90_000, minutes: 2.5, compactions: 0 })])
})

test('a fill that drops by more than half counts as a compaction', async () => {
  const rows = [step(200_000, 0), step(120_000, 1), step(50_000, 2), step(40_000, 3)].reduce(record, [])
  expect(rows[0]!.compactions).toBe(1)
})

test('two agents keep their own rows in the order they started', async () => {
  const rows = [step(10_000, 0, 'a1'), step(20_000, 1, 'a2'), step(30_000, 2, 'a1')].reduce(record, [])
  expect(rows.map(r => [r.id, r.now])).toEqual([['a1', 30_000], ['a2', 20_000]])
})
