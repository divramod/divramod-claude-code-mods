import type { ModelUsage } from 'claude-code'

import type { SubagentRow } from '../types'

// One model response of a subagent's loop, as the `turn.step` hook saw it.
export type Step = { id: string; description: string; status: string; model: string; effort: string; fill: number; at: number }

// A request's context is its input, cache read and cache write tokens; output is not in the window yet.
export const fill = (u: ModelUsage) =>
  u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

// `claude-opus-5-5` → `opus`: the family is what fits the column; an unknown id stays whole.
export const family = (model: string) => /opus|sonnet|haiku|fable/.exec(model)?.[0] ?? model

// The rows after one step: a new agent gets a row, a known one its counts; a fill that drops by more than half
// counts as a compaction until an event for them is known (D4).
export const record = (rows: readonly SubagentRow[], s: Step): SubagentRow[] => {
  const was = rows.find(r => r.id === s.id)
  const row: SubagentRow = {
    id: s.id,
    description: s.description,
    model: family(s.model),
    effort: s.effort,
    calls: (was?.calls ?? 0) + 1,
    now: s.fill,
    peak: Math.max(was?.peak ?? 0, s.fill),
    compactions: (was?.compactions ?? 0) + (was && s.fill < was.now / 2 ? 1 : 0),
    minutes: Math.round((s.at - (was?.started ?? s.at)) / 6_000) / 10,
    started: was?.started ?? s.at,
    mtime: s.at,
    status: s.status,
  }
  return was ? rows.map(r => (r === was ? row : r)) : [...rows, row]
}
