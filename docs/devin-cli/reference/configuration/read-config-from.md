> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Configuration Import

> Control how Devin CLI imports settings from Cursor, Windsurf, Claude Code, GitHub Copilot, OpenCode, and Zed

Devin CLI can automatically import rules and configuration from other AI coding tools installed in your project. This happens when standard project rule files or configuration files from Cursor, Windsurf, Claude Code, GitHub Copilot, OpenCode, or Zed are detected in your workspace.

***

## How It Works

When you start a session, Devin CLI checks for standard project rule files and configuration files from supported tools, then imports what it finds.

### Standard project rules

| What's imported | Source files                                                 |
| --------------- | ------------------------------------------------------------ |
| Rules           | `AGENTS.md`, `AGENTS.local.md`, `AGENT.md`, `.windsurfrules` |

### Cursor

| What's imported | Source files                                |
| --------------- | ------------------------------------------- |
| Rules           | `.cursor/rules/*.md`, `.cursor/rules/*.mdc` |
| MCP servers     | `.cursor/mcp.json`                          |

### Windsurf

| What's imported | Source files                                                                               |
| --------------- | ------------------------------------------------------------------------------------------ |
| Rules           | `.windsurf/rules/*.md`, `.windsurf/global_rules.md` (at workspace root and subdirectories) |
| Skills          | `.windsurf/skills/` (project), `~/.codeium/<channel>/skills/` (global, channel-dependent)  |
| MCP servers     | `~/.codeium/<channel>/mcp_config.json` (channel-dependent)                                 |

<Note>
  Devin CLI reads from the Windsurf config directory matching its own channel: stable reads from `~/.codeium/windsurf/`, next reads from `~/.codeium/windsurf-next/`, insiders reads from `~/.codeium/windsurf-insiders/`. `.windsurf/rules/` directories can exist at multiple levels in your project. Rules at the workspace root are loaded at session start. Rules in subdirectories are discovered lazily when the agent accesses files in that directory.
</Note>

<Note>
  Windsurf workflows (`.windsurf/workflows/` and `~/.codeium/<channel>/global_workflows/`) are **not** imported as skills.
</Note>

### Claude Code

| What's imported      | Source files                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules                | `CLAUDE.md`, `~/.claude/CLAUDE.md`                                                                                                                                              |
| Skills               | `.claude/skills/**/SKILL.md`                                                                                                                                                    |
| Commands (as skills) | `.claude/commands/**/*.md`                                                                                                                                                      |
| MCP servers          | `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude.json`, `~/.claude/settings.json`, `~/.claude/settings.local.json`, `~/.claude/mcp_servers.json` |

### GitHub Copilot

| What's imported | Source files                                                                     |
| --------------- | -------------------------------------------------------------------------------- |
| Skills          | `.github/skills/**/SKILL.md` (project), `~/.copilot/skills/**/SKILL.md` (global) |

<Note>
  Copilot skills use the same `SKILL.md` format as Devin skills, so they are read in place rather than migrated. If `COPILOT_HOME` is set, global skills are read from `$COPILOT_HOME/skills/` instead of `~/.copilot/skills/`.
</Note>

<Note>
  Copilot custom instructions (`.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`) are **not** imported.
</Note>

### OpenCode

| What's imported | Source files                                                           |
| --------------- | ---------------------------------------------------------------------- |
| MCP servers     | `opencode.json` (project), `~/.config/opencode/opencode.json` (global) |

<Note>
  OpenCode uses a different MCP schema from the standard format. Commands can be arrays or strings, environment variables use the `"environment"` key, and servers use an `"enabled"` flag (inverted from the standard `"disabled"` flag). These are automatically converted during import.
</Note>

### Zed

| What's imported | Source files                                                           |
| --------------- | ---------------------------------------------------------------------- |
| MCP servers     | `.zed/settings.json` (project), `~/.config/zed/settings.json` (global) |

<Note>
  Zed uses a `"context_servers"` key in its settings file.
</Note>

***

## Disabling Configuration Import

To stop importing from a specific tool, set it to `false` in your config:

<Tabs>
  <Tab title="User config">
    ```json theme={null}
    // ~/.config/devin/config.json
    // (on Windows: %APPDATA%\devin\config.json)
    {
      "read_config_from": {
        "agents_standard": false,
        "cursor": false,
        "windsurf": false,
        "claude": false,
        "copilot": false,
        "opencode": false,
        "zed": false
      }
    }
    ```
  </Tab>

  <Tab title="Project config">
    ```json theme={null}
    // .devin/config.json
    {
      "read_config_from": {
        "windsurf": false
      }
    }
    ```
  </Tab>
</Tabs>

You can disable imports selectively — for example, import from Cursor but not Windsurf:

```json theme={null}
{
  "read_config_from": {
    "cursor": true,
    "windsurf": false
  }
}
```

***

## Options

| Option            | Type    | Default | Description                                                                                         |
| ----------------- | ------- | ------- | --------------------------------------------------------------------------------------------------- |
| `agents_standard` | boolean | `true`  | Import standard project rules from `AGENTS.md`, `AGENTS.local.md`, `AGENT.md`, and `.windsurfrules` |
| `cursor`          | boolean | `true`  | Import rules and MCP servers from Cursor config files                                               |
| `windsurf`        | boolean | `true`  | Import rules, skills, and MCP servers from Windsurf                                                 |
| `claude`          | boolean | `true`  | Import rules, skills, commands, and MCP servers from Claude Code                                    |
| `copilot`         | boolean | `true`  | Import skills from GitHub Copilot's project and global skill directories                            |
| `opencode`        | boolean | `true`  | Import MCP servers from OpenCode config files                                                       |
| `zed`             | boolean | `true`  | Import MCP servers from Zed settings files                                                          |

Setting a value to `true` (or leaving it unset) enables import. Setting it to `false` disables import for that tool.

***

## Default Behavior

If you don't explicitly configure `read_config_from`, all imports are enabled by default. Set any option to `false` to disable imports from that tool.
