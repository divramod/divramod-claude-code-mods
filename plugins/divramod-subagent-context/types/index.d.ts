export type SubagentRow = {
  id: string
  description: string
  model: string
  effort: string
  calls: number
  now: number
  peak: number
  compactions: number
  minutes: number
  // When its first and its latest step were seen (`$.clock.now()` ms); rows keep the order of `started`.
  started: number
  mtime: number
  // Its AgentStatus as `$.agent.list()` last gave it.
  status: string
}

declare module 'claude-code' {
  interface PluginState {
    'divramod-subagent-context': { rows: SubagentRow[] }
  }
}
