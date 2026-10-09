# divramod-claude-code-mods

[divramod](https://github.com/divramod)'s Claude Code mods: live panes and tweaks for Claude Code's interface, one
plugin per mod, in one marketplace.

## Mods

| Plugin | What it does |
|---|---|
| [`divramod-subagent-context`](plugins/divramod-subagent-context/README.md) | A live pane of every subagent of the session: model, effort, context fill, peak and compactions. |

## Install

Add the marketplace once, then install a mod from it:

```
claude plugin marketplace add divramod/divramod-claude-code-mods
claude plugin install divramod-subagent-context@divramod-claude-code-mods
```

Inside a running session the same two steps are `/plugin marketplace add divramod/divramod-claude-code-mods` and
`/plugin install divramod-subagent-context@divramod-claude-code-mods`. Update with `claude plugin marketplace update
divramod-claude-code-mods`.

## Requirements

- A recent [Claude Code](https://code.claude.com) with mod support (`claude plugin validate` and `claude plugin test`
  must exist: `claude --version` and `claude plugin --help` tell).
- Nothing else: a mod runs inside Claude Code, needs no login of its own and calls no network.
- To work on a mod: [bun](https://bun.sh) (the pictures) and, for the checks, the same Claude Code.

## Adding a mod

1. Copy a folder of `plugins/` to `plugins/divramod-<name>/` and rename the plugin in its
   `.claude-plugin/plugin.json` (`name`, `displayName`, `description`, `keywords`); the mod's command, its state keys
   and its pane ids carry the same name.
2. Add one entry to `.claude-plugin/marketplace.json`: `name`, `source` (`./plugins/divramod-<name>`), `description`,
   `category`. No `version` there; the plugin's `plugin.json` owns it.
3. Check it as CI does:

   ```
   claude plugin validate --strict .
   claude plugin validate --strict plugins/divramod-<name>
   claude plugin test plugins/divramod-<name>
   ```

4. Release: raise the `version` in `plugin.json`, commit, then `claude plugin tag --push plugins/divramod-<name>`
   (the tag is `divramod-<name>--v<version>`).

## Not affiliated

This is an independent project. It is not affiliated with, endorsed by or supported by Anthropic. Claude and Claude
Code are trademarks of Anthropic.

## License

[MIT](LICENSE), copyright (c) 2026 Arvid Petermann.
