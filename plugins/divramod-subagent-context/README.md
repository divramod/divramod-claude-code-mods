# divramod-subagent-context

A live pane of every subagent of the session: how much of its context window each one fills, with its model and
effort, so a subagent running out of room shows before it compacts.

![The pane: one row per subagent, running rows cyan, a warning row yellow, a compacted one red](docs/screenshot.svg)

## Install

```
claude plugin marketplace add divramod/divramod-claude-code-mods
claude plugin install divramod-subagent-context@divramod-claude-code-mods
```

See the [repository README](../../README.md) for the requirements.

## The pane

The pane opens with the session. Reopen it any time with the command `/divramod-subagent-context`.

One row per subagent, filled while it works (no polling), and from the transcripts for subagents that ran before the
mod loaded:

| Column | Meaning |
|---|---|
| (state) | `●` running, `✓` completed, `✗` failed or killed |
| Subagent | its description |
| Model, Effort | what it runs on |
| Calls | model responses so far |
| Now, Peak | context in use now, and its highest so far |
| `%1M` / `%200k` | the peak as a share of the window |
| Cmp | compactions: its context fell below half of what it was |
| Min | minutes between its first and latest response |

Colors: a running row is cyan; a row turns yellow from the warn share of its peak and red from the alert share or
after a compaction. A transcript over 4 MiB is not read: its counts show `-`.

Sort, resize and filter (in the terminal and desktop apps; VS Code and mobile show plain lines):

- **Sort**: click a header: ascending, descending, off.
- **Resize**: drag a border between two headers.
- **Filter**: click the tabs All, Running, Finished, or press `a`, `r`, `f`.

- **Close**: press `q` while the table has the keyboard (Esc hands the keyboard back to the prompt; `ctrl+x x` also closes).

Sort, widths and filter stay while the pane redraws or is closed and reopened.

## Options

Set them when installing, or later in `/plugin` under the mod's configuration. Installing prints "3 userConfig options not yet set": the defaults below apply until you set them.

| Option | Default | Meaning |
|---|---|---|
| `window` | `auto` | The window a peak is counted against: `auto` takes the session's window, or `200k` / `1m`. Claude Code gives no window per subagent. |
| `warn_percent` | 30 | A row turns yellow from this share of the window. |
| `alert_percent` | 35 | A row turns red from this share of the window. |

## Develop

```
claude plugin validate --strict plugins/divramod-subagent-context
claude plugin test plugins/divramod-subagent-context
bun plugins/divramod-subagent-context/scripts/screenshot.ts   # regenerates docs/screenshot.svg
```

`scripts/screenshot.ts` draws the picture from fixture rows through the mod's own `hooks/table.ts`, so the picture
cannot drift from the pane.

## License

[MIT](../../LICENSE). Not affiliated with Anthropic.
