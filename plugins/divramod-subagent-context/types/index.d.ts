export type SubagentRow = {
  id: string
  description: string
  model: string
  effort: string
  calls: number
  now: number
  peak: number
  compactions: number
  seconds: number
  // When its first and its latest step were seen (`$.clock.now()` ms); rows keep the order of `started`.
  started: number
  mtime: number
  // Its AgentStatus as `$.agent.list()` last gave it.
  status: string
  // Its transcript was over 4 MiB and was not read; calls, now, peak and compactions are 0 then.
  large?: boolean
}

// The table's sort, column widths and filter, as its Client last posted them; kept for the session.
export type TableState = {
  sort: { col: number; dir: 'asc' | 'desc' } | null
  widths: number[]
  filter: 'all' | 'running' | 'finished'
  // The row `j` `k` stand on (its subagent id), null for none.
  cursor?: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'divramod-subagent-context': { rows: SubagentRow[]; view: TableState | null; epoch: number }
  }
}
