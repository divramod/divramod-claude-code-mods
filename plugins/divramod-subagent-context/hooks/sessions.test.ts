import { expect, test } from 'claude-code/testing'

import type { SessionRow } from '../types'
import { agentsGrid, ago, folder, lines, ordered, parse, planOf, plansGrid } from './sessions'

const row = (over: Partial<SessionRow>): SessionRow => ({ id: 'x', pid: 1, name: 'n', cwd: '/a/b', kind: 'interactive', status: 'idle', startedAt: 0, plan: '', here: false, ...over })

test('a session file gives its name, folder, status and start; anything else is no session', () => {
  const s = parse(JSON.stringify({ pid: 7, sessionId: 'S', cwd: '/h/worktree/hal2/03', name: '03-c6', kind: 'interactive', status: 'busy', startedAt: 5 }))
  expect(s).toEqual({ id: 'S', pid: 7, name: '03-c6', cwd: '/h/worktree/hal2/03', kind: 'interactive', status: 'busy', startedAt: 5 })
  expect(parse(JSON.stringify({ pid: 7, cwd: '/x/y' }))?.name).toBe('y')
  expect(parse('{"pid":"7"}')).toBeUndefined()
  expect(parse('nope')).toBeUndefined()
})

test('a plan is the first line of CURRENT_PLAN, a folder reads repo and slot, an age reads m, h or d', () => {
  expect(planOf('0222-publish\nmore\n')).toBe('0222-publish')
  expect(planOf(undefined)).toBe('')
  expect(folder('/Users/m/.hal/git/worktree/hal2/03')).toBe('hal2 03')
  expect(folder('/Users/m/a/hal2')).toBe('a/hal2')
  expect([ago(0, 5 * 60_000), ago(0, 192 * 60_000), ago(0, 52 * 3600_000)]).toEqual(['5m', '3h 12m', '2d 4h'])
})

test('the plans tab lists only sessions with a plan, this session first; the agents tab all of them', () => {
  const rows = [row({ id: 'b', name: 'b', plan: '0149' }), row({ id: 'a', name: 'zz', plan: '0222', here: true }), row({ id: 'c', name: 'c' })]
  expect(ordered(rows, true).map(r => r.name)).toEqual(['zz', 'b'])
  expect(ordered(rows, false).map(r => r.name)).toEqual(['zz', 'b', 'c'])
  expect(plansGrid(rows, 0).cells.map(c => c[0])).toEqual(['0222', '0149'])
  expect(agentsGrid(rows, 0).cells.map(c => c[0])).toEqual(['● zz', 'b', 'c'])
})

test('the grid is drawn with rules, or says it is empty', () => {
  const out = lines(plansGrid([row({ plan: '0149', name: 'a' })], 0), 'none')
  expect(out[0]).toMatch(/^┌─+┬/)
  expect(out[1]).toContain('Plan')
  expect(out.at(-1)).toMatch(/^└/)
  expect(lines(plansGrid([], 0), 'none').some(l => l.includes('none'))).toBe(true)
})
