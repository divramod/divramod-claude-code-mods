import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SubagentRow } from '../types'
import { type Limits, foot, head, limits, line, share, tone } from './table'

const PANE = 'subagent-context'
const rows = atom({ plugin: 'divramod-subagent-context', key: 'rows' } as const, [] as SubagentRow[])

export const register: Register = (on, options) => {
  let l: Limits = limits(options, 1_000_000)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'divramod-subagent-context', description: 'Show the context use of this session\'s subagents' })
    l = limits(options, (await $.session.usage()).context.window)
    const id = await $.session.id()
    const script = `${$.plugin.root}/hooks/measure.py`
    const refresh = async () => {
      const ran = await $.process.run(['python3', script, id], { timeoutMs: 20_000 })
      if (ran.exitCode !== 0) return
      const list = JSON.parse(ran.stdout) as SubagentRow[]
      await update($, rows, () => list)
      const worst = list.reduce((m, r) => Math.max(m, share(r, l)), 0)
      if (worst >= l.warn) $.ui.status(`subagent at ${Math.round(worst * 100)}% context`)
    }
    void refresh()
    $.clock.every(10_000, () => void refresh())
    void $.ui.open({ id: PANE, title: 'Subagents: context' })
    return started
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
        <Text dimColor>{`${foot(l)} · refreshed every 10 s`}</Text>
      </Box>
    )
  })
}
