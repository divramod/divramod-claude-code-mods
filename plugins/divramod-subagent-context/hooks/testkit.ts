import type { AgentStatus, On } from 'claude-code'
import { type Engine, mock } from 'claude-code/testing'

// What the table tests share: the pane, three subagents with one step each, the Client mounted at 100 by 10.

export const PANE = { plugin: 'divramod-subagent-context', surface: 'terminal', component: 'Pane', props: { title: 'Subagents: context', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} }, requestId: 'subagent-context', viewport: { columns: 100, rows: 12 } } as const

const usage = (tokens: number) => ({ input_tokens: 0, output_tokens: 1, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' })

// The Client's rows: the tabs (y 0), the header (y 1), the table's rows. The widths start at 1 36 7 7 5 6 6 5 3 4
// with a cell between: Peak is column 6 at x 68-73, the border right of Subagent at x 38.
export const HEAD = 1
export const PEAK = 69
export const BORDER = 38

// Three subagents, one step each, in this order: alpha at 300k, beta at 100k, gamma at 200k (the stub answers a
// step with as many cached tokens as its `messageCount`); `status` is what `$.agent.list()` answers for each.
export const steps = async ($: Engine, on: On) => {
  const status: Record<string, AgentStatus> = { alpha: 'running', beta: 'running', gamma: 'running' }
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('agent.list', () => ({ value: Object.entries(status).map(([id, s]) => ({ id, description: id, type: 'general-purpose', status: s })) }))
  on('turn.step', async function* (_$, e) {
    const u = usage(e.messageCount)
    yield { kind: 'stop', stopReason: 'end_turn', usage: u }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: u }
  })
  for (const [agentId, tokens] of [['alpha', 300_000], ['beta', 100_000], ['gamma', 200_000]] as const) {
    const s = $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: 'high', messageCount: tokens, agentId })
    while (!(await s.next()).done);
  }
  return status
}

export const mounted = async ($: Engine, on: On, surface: 'terminal' | 'desktop' = 'terminal') => {
  const status = await steps($, on)
  const ui = await $.ui.mount({ ...PANE, surface })
  await ui.resize({ columns: 100, rows: 10, in: 'table' })
  const all = async () => (await ui.findAll({ type: 'Text', in: 'table' })).map(t => t.text)
  // The header, then each shown row's text.
  const texts = async () => (await all()).slice(3)
  const header = async () => (await texts())[0]!
  // Each shown row's name: the cell after the state glyph.
  const names = async () => (await texts()).slice(1).map(t => t.split(' ')[1])
  const click = async (x: number, y = HEAD) => {
    await ui.pointer({ type: 'down', x, y, button: 'left' })
    await ui.pointer({ type: 'up', x, y, button: 'left' })
  }
  const drag = async (from: number, to: number) => {
    await ui.pointer({ type: 'down', x: from, y: HEAD, button: 'left' })
    await ui.pointer({ type: 'move', x: to, y: HEAD, button: 'left' })
    await ui.pointer({ type: 'up', x: to, y: HEAD, button: 'left' })
  }
  return { ui, status, all, texts, header, names, click, drag }
}
