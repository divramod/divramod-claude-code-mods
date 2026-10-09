import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnStepInput, TurnUsage } from 'claude-code'

import type { SessionRow, SubagentRow, TableState, Tab } from '../types'
import { LIMIT, type File, idOf, metaOf, rowOf } from './backfill'
import { adopt, fill, mark, record } from './rows'
import { parse, serialize } from './store'
import { agentsGrid, asTable, lines as gridLines, ordered, parse as parseSession, plansGrid, planOf } from './sessions'
import { FILTERS, type Filter, type TableProps, type TableRow, isClose, isState, order, tabOf, shown, step } from './grid'
import { ALIGNS, type Limits, WIDTHS, cells, color, foot, head, heads, limits, line, running, sums, values } from './table'

const PANE = 'subagent-context'
const rows = atom({ plugin: 'divramod-subagent-context', key: 'rows' } as const, [] as SubagentRow[])
// The table's sort, widths and filter, so a redraw or a reopened pane shows them as they were (view-state rule).
const view = atom({ plugin: 'divramod-subagent-context', key: 'view' } as const, null as TableState | null)
// Bumped when a pane-level key changes the filter: the table is keyed by it, so it starts again from the kept view.
const epoch = atom({ plugin: 'divramod-subagent-context', key: 'epoch' } as const, 0)

// The pane's own keys `a` `r` `f` `h` `l` `j` `k`, like `q`: they work while the pane holds the keyboard, without a click
// into the table. The table's rows as it draws them, so a key moves over what is shown.
const tableRows = (list: readonly SubagentRow[], l: Limits): TableRow[] =>
  list.map(row => ({ id: row.id, cells: cells(row, l), values: values(row, l), color: color(row, l) ?? null, running: running(row) }))

async function press($: EngineInterface, l: Limits, key: string) {
  const kept = (await read($, view)) ?? { sort: null, widths: WIDTHS, filter: 'all' as Filter, cursor: null }
  const state = { ...kept, cursor: kept.cursor ?? undefined }
  const ids = order(shown(tableRows(await read($, rows), l), state.filter), state.sort ?? undefined).map(r => r.id)
  const next = step(state, key, ids)
  if (next === state) return
  await update($, view, () => ({ sort: next.sort, widths: next.widths, filter: next.filter, cursor: next.cursor ?? null }))
  await update($, epoch, n => n + 1)
}
// The pane's top-level tab and the sessions of this machine the Plans and Agents tabs list (reloaded every 10 seconds).
const tab = atom({ plugin: 'divramod-subagent-context', key: 'tab' } as const, 'subagents' as Tab)
const sessions = atom({ plugin: 'divramod-subagent-context', key: 'sessions' } as const, [] as SessionRow[])
// The plans and agents tables' own sort, widths and cursor (the subagents' is `view`).
const plansView = atom({ plugin: 'divramod-subagent-context', key: 'plansView' } as const, null as TableState | null)
const agentsView = atom({ plugin: 'divramod-subagent-context', key: 'agentsView' } as const, null as TableState | null)
const TABS = [['subagents', 's'], ['plans', 'p'], ['agents', 'a']] as const

const configDir = async ($: EngineInterface) => (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`

// The live sessions of this machine: each `<config>/sessions/<pid>.json` whose process still runs (`ps`), with the plan its
// folder names. A file or a plan that cannot be read is left out, never an error.
async function loadSessions($: EngineInterface, config: string, session: string) {
  const dir = `${config}/sessions`
  const found: NonNullable<ReturnType<typeof parseSession>>[] = []
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !/^\d+\.json$/.test(f.name)) continue
    const s = parseSession(String(await $.fs.read(`${dir}/${f.name}`).catch(() => '')))
    if (s) found.push(s)
  }
  if (!found.length) return []
  const ps = await $.process.run(['ps', '-o', 'pid=', '-p', found.map(s => s.pid).join(',')]).catch(() => undefined)
  const alive = new Set(String(ps?.stdout ?? '').split('\n').map(l => l.trim()).filter(Boolean))
  const out: SessionRow[] = []
  for (const s of found.filter(s => alive.has(String(s.pid)))) {
    out.push({ ...s, plan: planOf(String(await $.fs.read(`${s.cwd}/plans/CURRENT_PLAN`).catch(() => ''))), here: s.id === session })
  }
  return out
}

// Reloads the sessions; the atom is written only when they changed, so a quiet round redraws nothing.
async function refresh($: EngineInterface) {
  try {
    const next = await loadSessions($, await configDir($), await $.session.id())
    if (JSON.stringify(next) !== JSON.stringify(await read($, sessions))) await update($, sessions, () => next)
  } catch {}
}

async function show($: EngineInterface, to: Tab) {
  await update($, tab, () => to)
  if (to !== 'subagents') await refresh($)
}

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
  await keep($, await update($, rows, list => record(list, step)))
}

// The body rows the pane asks for: the tabs, the header, one per subagent and the footer, between 9 and 20. A pane
// opened without `rows` is a third of the screen and showed one row of five (the user, 2026-10-09).
export const wanted = (subagents: number) => Math.min(20, Math.max(9, subagents + 4))

// Asks an open pane for the room its rows need; a pane the person closed stays closed.
async function room($: EngineInterface, n: number) {
  const up = (await $.ui.panes()).some(p => p.id === PANE)
  if (up) await $.ui.open({ id: PANE, title: 'divramod subagents context', rows: wanted(n) })
}

// The version in the plugin's own plugin.json, shown at the pane's top right; empty when it cannot be read.
async function versionOf($: EngineInterface) {
  const text = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).catch(() => '')
  return String((() => { try { return JSON.parse(String(text)).version ?? '' } catch { return '' } })())
}

// Where the rows are kept between sessions, and the last time they were written.
// One file per working folder: a `/clear` keeps the folder, and sessions of other folders never overwrite it.
const storeFile = async ($: EngineInterface) => {
  const slug = (await $.session.cwd().catch(() => '')).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'
  return `${await configDir($)}/divramod-subagent-context/rows-${slug}.json`
}
let saved = 0

// Writes the rows now, or at most every 5 seconds; a failed write loses nothing the next one will not carry.
async function keep($: EngineInterface, list: readonly SubagentRow[], force = false) {
  const now = await $.clock.now()
  if (!force && now - saved < 5000) return
  saved = now
  await $.fs.write(await storeFile($), serialize(list)).catch(() => {})
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
  // Rows an earlier session left, first: a live row or a transcript of this session wins over them.
  const left = parse(String(await $.fs.read(await storeFile($)).catch(() => '')), await $.clock.now())
  if (left.length) await update($, rows, list => adopt(list, left))
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  const agents = new Map((await $.agent.list()).map(a => [a.id, a]))
  const found: SubagentRow[] = []
  for (const f of await transcripts($, config, await $.session.id())) {
    const path = `${f.dir}/agent-${f.id}`
    const meta = metaOf(await $.fs.read(`${path}.meta.json`).catch(() => undefined))
    const text = f.size > LIMIT ? undefined : await $.fs.read(`${path}.jsonl`).catch(() => null)
    if (text !== null) found.push(rowOf(f, meta, text, agents.get(f.id)))
  }
  await keep($, await update($, rows, list => adopt(list, found)), true)
}

export const register: Register = (on, options) => {
  let l: Limits = limits(options, 1_000_000)
  const known: Known = { agents: new Map(), unlisted: new Set() }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'divramod-subagent-context', description: 'Show the context use of this session\'s subagents' })
    l = limits(options, (await $.session.usage()).context.window)
    // A module older than 0.1.7 pinned a summary line under the prompt; clearing it is harmless when none is set.
    void $.ui.status(undefined)
    void $.ui.open({ id: PANE, title: 'divramod subagents context', rows: wanted(0) })
    void earlier($).catch(() => {})
    void refresh($)
    void $.clock.every(10_000, () => refresh($))
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
    const list = await update($, rows, list => mark(list, { id: e.agent_id, description: a?.description ?? e.agent_type, status: 'running', at }))
    await keep($, list)
    await room($, list.length).catch(() => {})
    return result
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    const listed = (await $.agent.list()).find(a => a.id === e.agent_id)?.status
    const status = listed === 'failed' || listed === 'killed' ? listed : 'completed'
    const at = await $.clock.now()
    await keep($, await update($, rows, list => (list.some(r => r.id === e.agent_id) ? mark(list, { id: e.agent_id, description: e.agent_type, status, at }) : list)), true)
    return result
  })

  on('command.run', { command: 'divramod-subagent-context' }, async $ => {
    await $.ui.open({ id: PANE, title: 'divramod subagents context', rows: wanted((await read($, rows)).length), focus: true })
    return { text: 'Subagents pane opened.' }
  })

  // A button above the prompt opens the pane, or closes it when it is open; a click presses it, `s` once the band has the keys.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const toggle = async () => {
      const up = (await $.ui.panes()).some(p => p.id === PANE)
      if (up) await $.ui.close({ id: PANE })
      else await $.ui.open({ id: PANE, title: 'divramod subagents context', rows: wanted((await read($, rows)).length), focus: true })
    }
    return (
      <Box>
        <Button label="subagents" hotkey="s" plain onPress={toggle} />
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    if (e.requestId !== PANE) return result
    if (isClose(e.data)) await $.ui.close({ id: PANE })
    else if (tabOf(e.data)) await show($, tabOf(e.data)!)
    else if (isState(e.data)) {
      const state = e.data as TableState
      if (e.element === 'table') await update($, view, () => state)
      else if (e.element === 'plans-table') await update($, plansView, () => state)
      else if (e.element === 'agents-table') await update($, agentsView, () => state)
    }
    return result
  })

  // The table is a `Client` where the surface draws one (terminal, desktop); elsewhere its rows as plain lines.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    // VS Code's table names a Client it does not draw yet: the surface decides.
    const Client = 'Client' in el && (e.surface === 'terminal' || e.surface === 'desktop') ? el.Client : undefined
    const list = await read($, rows)
    const table: TableProps = {
      heads: heads(l),
      widths: WIDTHS,
      aligns: ALIGNS,
      rows: tableRows(list, l),
      sums: Object.fromEntries(FILTERS.map(f => [f, sums(list.filter(r => f === 'all' || running(r) === (f === 'running')), l)])) as TableProps['sums'],
      view: await read($, view),
      epoch: await read($, epoch),
    }
    const version = await versionOf($)
    const current = await read($, tab)
    const found = await read($, sessions)
    const now = current === 'subagents' ? 0 : await $.clock.now()
    const grid = current === 'plans' ? plansGrid(found, now) : agentsGrid(found, now)
    const empty = current === 'plans' ? 'No session has a current plan.' : 'No Claude sessions found.'
    const sessionTable = asTable(grid, `${grid.cells.length} sessions · reloaded every 10 s · ● this session`, (current === 'plans' ? await read($, plansView) : await read($, agentsView)), grid.ids, current === 'plans' ? 0 : 3)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)
    // The body is as tall as the pane the surface gave it, so the table grows and shrinks with the window.
    const body = e.props.scroll?.bodyRows
    return (
      <Box flexDirection="column" {...(body ? { height: body } : {})}>
        {/* The surface draws no pane title, so the title is the body's first line: centered, the version at the right (a blank of its width at the left keeps it centered). */}
        <Box>
          <Text>{' '.repeat(version ? version.length + 1 : 0)}</Text>
          <Box flexGrow={1} justifyContent="center">
            <Text bold>divramod subagents context</Text>
          </Box>
          <Text dimColor>{version ? `v${version}` : ''}</Text>
        </Box>
        <Box gap={2}>
          {TABS.map(([t, key]) => {
            const label = `${t} ${t === 'subagents' ? list.length : ordered(found, t === 'plans').length}`
            return t === current ? <Text key={t} bold inverse>{` ${key}: ${label} `}</Text> : <Button key={t} label={label} hotkey={key} plain onPress={() => show($, t)} />
          })}
        </Box>
        {current === 'subagents' ? (
          <>
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
            {/* The pane's own keys: they work while the pane holds the keyboard, without a click into the table. */}
            <Box gap={1}>
              {([['h', 'prev'], ['l', 'next'], ['j', 'down'], ['k', 'up']] as const).map(([k, label]) => <Button key={label} label={label} hotkey={k} plain onPress={() => press($, l, k)} />)}
              <Text dimColor>·</Text>
              <Button label="close" hotkey="q" plain onPress={() => $.ui.close({ id: PANE })} />
            </Box>
          </>
        ) : (
          <>
            {Client ? (
              <Client key={`${current}-table`} module="./table-view.tsx" props={sessionTable} flexGrow={1} />
            ) : (
              <Box flexDirection="column" flexGrow={1}>
                {gridLines(grid, empty, e.props.bodyColumns ?? e.viewport?.columns ?? 0, (body ?? 24) - 10).map((t, i) => <Text key={String(i)} dimColor={!/^│/.test(t)}>{t}</Text>)}
              </Box>
            )}
            <Text dimColor>{`${ordered(found, current === 'plans').length} sessions · reloaded every 10 s · ● this session`}</Text>
            <Button label="close" hotkey="q" plain onPress={() => $.ui.close({ id: PANE })} />
          </>
        )}
      </Box>
    )
  })
}
