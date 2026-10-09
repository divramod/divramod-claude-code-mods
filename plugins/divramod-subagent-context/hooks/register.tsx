import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnStepInput, TurnUsage } from 'claude-code'

import type { SubagentRow } from '../types'
import { fill, record } from './rows'
import { type Limits, foot, head, limits, line, share, tone } from './table'

const PANE = 'subagent-context'
const rows = atom({ plugin: 'divramod-subagent-context', key: 'rows' } as const, [] as SubagentRow[])

// The agents `$.agent.list()` named, and the loop ids it does not (the engine's compaction and memory forks).
type Known = { agents: Map<string, AgentInfo>; unlisted: Set<string> }

async function agent($: EngineInterface, known: Known, id: string) {
  if (!known.agents.has(id) && !known.unlisted.has(id)) {
    for (const a of await $.agent.list()) known.agents.set(a.id, a)
    if (!known.agents.has(id)) known.unlisted.add(id)
  }
  return known.agents.get(id)
}

async function seen($: EngineInterface, known: Known, l: Limits, e: TurnStepInput, usage: TurnUsage) {
  const a = await agent($, known, e.agentId!)
  if (!a) return
  const step = { id: a.id, description: a.description, status: a.status, model: usage.model || e.model, effort: e.effort === undefined ? '' : String(e.effort), fill: fill(usage), at: await $.clock.now() }
  const was = (await read($, rows)).find(r => r.id === a.id)
  const list = await update($, rows, list => record(list, step))
  const row = list.find(r => r.id === a.id)!
  if (tone(row, l) && (!was || tone(was, l) !== tone(row, l))) $.ui.status(`subagent at ${Math.round(share(row, l) * 100)}% context`)
}

export const register: Register = (on, options) => {
  let l: Limits = limits(options, 1_000_000)
  const known: Known = { agents: new Map(), unlisted: new Set() }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'divramod-subagent-context', description: 'Show the context use of this session\'s subagents' })
    l = limits(options, (await $.session.usage()).context.window)
    void $.ui.open({ id: PANE, title: 'Subagents: context' })
    return started
  })

  // Every response of a subagent's loop updates its row as it ends: no poll, no transcript read.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId && result.usage) await seen($, known, l, e, result.usage)
    return result
  })

  on('command.run', { command: 'divramod-subagent-context' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Subagents: context' })
    return { text: 'Subagents pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    return (
      <Box flexDirection="column">
        <Text bold>{head(l)}</Text>
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {list.slice(-room).map(row => (
          <Text color={tone(row, l)}>
            {line(row, l)}
          </Text>
        ))}
        <Text dimColor>{`${foot(l)} · live`}</Text>
      </Box>
    )
  })
}
