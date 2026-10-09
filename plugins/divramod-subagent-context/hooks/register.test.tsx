import { expect, test } from 'claude-code/testing'

import type { SubagentRow } from '../types'
import { line, tone } from './table'

const row = (peak: number, compactions = 0): SubagentRow => ({
  id: 'a1', description: 'Plan 0214 step 30', model: 'opus', effort: 'xhigh', calls: 40, now: peak, peak, compactions, minutes: 5, mtime: 1,
})

test('a row names the step, model, effort, peak and its share of 1M', async () => {
  expect(line(row(310_000))).toMatch(/step 30\s+opus\s+xhigh\s+40\s+310k\s+310k\s+31\.0\s+0\s+5/)
})

test('a row is plain below 30%, yellow from 30%, red from 35% or after a compaction', async () => {
  expect(tone(row(68_000))).toBeUndefined()
  expect(tone(row(310_000))).toBe('yellow')
  expect(tone(row(360_000))).toBe('red')
  expect(tone(row(68_000, 1))).toBe('red')
})
