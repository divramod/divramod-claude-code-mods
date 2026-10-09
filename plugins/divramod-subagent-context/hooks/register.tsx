import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnStepInput, TurnUsage } from 'claude-code'

import type { SubagentRow, TableState } from '../types'
import { LIMIT, type File, idOf, metaOf, rowOf } from './backfill'
import { adopt, fill, mark, record } from './rows'
import { type TableProps, isState } from './grid'
import { type Limits, WIDTHS, cells, color, foot, head, heads, limits, line, running, share, tone, values } from './table'

const PANE = 'subagent-context'
const rows = atom({ plugin: 'divramod-subagent-context', key: 'rows' } as const, [] as SubagentRow[])
// The table's sort, widths and filter, so a redraw or a reopened pane shows them as they were (view-state rule).
const view = atom({ plugin: 'divramod-subagent-context', key: 'view' } as const, null as TableState | null)

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
  const step = { id: a.id, description: a.description, status: 'running', model: usage.model || e.model, effort: e.effort === undefined ? '' : String(e.effort), fill: fill(usage), at: await $.clock.now() }
  const was = (await read($, rows)).find(r => r.id === a.id)
  const list = await update($, rows, list => record(list, step))
  const row = list.find(r => r.id === a.id)!
  if (tone(row, l) && (!was || tone(was, l) !== tone(row, l))) $.ui.status(`subagent at ${Math.round(share(row, l) * 100)}% context`)
}

const list = ($: EngineInterface, dir: string) => $.fs.list(dir).catch(() => [])

// The transcripts of this session's subagents: `<config>/projects/*/<session>/subagents/agent-*.jsonl`, with their dirs.
async function transcripts($: EngineInterface, config: string, session: string) {
  const found: (File & { dir: string })[] = []
  for (const project of await list($, `${config}/projects`)) {
    const dir = `${config}/projects/${project.name}/${session}/subagents`
    if (project.kind === 'dir') for (const f of await list($, dir)) if (f.kind === 'file' && idOf(f.name)) found.push({ id: idOf(f.name)!, size: f.size, mtimeMs: f.mtimeMs, dir })
  }
  return found
}

// The subagents that ran before the mod loaded, from their transcripts; a row `turn.step` made already wins.
async function earlier($: EngineInterface) {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  const agents = new Map((await $.agent.list()).map(a => [a.id, a]))
  const found: SubagentRow[] = []
  for (const f of await transcripts($, config, await $.session.id())) {
    const path = `${f.dir}/agent-${f.id}`
    const meta = metaOf(await $.fs.read(`${path}.meta.json`).catch(() => undefined))
    const text = f.size > LIMIT ? undefined : await $.fs.read(`${path}.jsonl`).catch(() => null)
    if (text !== null) found.push(rowOf(f, meta, text, agents.get(f.id)))
  }
  await update($, rows, list => adopt(list, found))
}

export const register: Register = (on, options) => {
  let l: Limits = limits(options, 1_000_000)
  const known: Known = { agents: new Map(), unlisted: new Set() }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'divramod-subagent-context', description: 'Show the context use of this session\'s subagents' })
    l = limits(options, (await $.session.usage()).context.window)
    void $.ui.open({ id: PANE, title: 'Subagents: context' })
    void earlier($).catch(() => {})
    return started
  })

  // Every response of a subagent's loop updates its row as it ends: no poll, no transcript read.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId && result.usage) await seen($, known, l, e, result.usage)
    return result
  })

  // Every subagent of the session has a row from its start; its stop gives it its final status (D15's refresh).
  on('classic.SubagentStart', async ($, e, next) => {
    const result = await next(e)
    const a = await agent($, known, e.agent_id)
    const at = await $.clock.now()
    await update($, rows, list => mark(list, { id: e.agent_id, description: a?.description ?? e.agent_type, status: 'running', at }))
    return result
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    const listed = (await $.agent.list()).find(a => a.id === e.agent_id)?.status
    const status = listed === 'failed' || listed === 'killed' ? listed : 'completed'
    const at = await $.clock.now()
    await update($, rows, list => (list.some(r => r.id === e.agent_id) ? mark(list, { id: e.agent_id, description: e.agent_type, status, at }) : list))
    return result
  })

  on('command.run', { command: 'divramod-subagent-context' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Subagents: context' })
    return { text: 'Subagents pane opened.' }
  })

  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    if (e.requestId === PANE && e.element === 'table' && isState(e.data)) await update($, view, () => e.data as TableState)
    return result
  })

  // The table is a `Client` where the surface draws one (terminal, desktop); elsewhere its rows as plain lines.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Text } = el
    // VS Code's table names a Client it does not draw yet: the surface decides.
    const Client = 'Client' in el && (e.surface === 'terminal' || e.surface === 'desktop') ? el.Client : undefined
    const list = await read($, rows)
    const table: TableProps = {
      heads: heads(l),
      widths: WIDTHS,
      rows: list.map(row => ({ id: row.id, cells: cells(row, l), values: values(row, l), color: color(row, l) ?? null, running: running(row) })),
      view: await read($, view),
    }
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    return (
      <Box flexDirection="column">
        {Client ? (
          <Client key="table" module="./table-view.tsx" props={table} flexGrow={1} />
        ) : (
          <Box flexDirection="column">
            <Text bold>{head(l)}</Text>
            {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
            {list.slice(-room).map(row => <Text color={color(row, l)}>{line(row, l)}</Text>)}
          </Box>
        )}
        <Text dimColor>{`${foot(l)} · live`}</Text>
      </Box>
    )
  })
}
