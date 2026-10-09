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
  mtime: number
}

declare module 'claude-code' {
  interface PluginState {
    'divramod-subagent-context': { rows: SubagentRow[] }
  }
}
