> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Configuration Precedence

> How global, project, and local settings interact

Devin CLI loads configuration from multiple sources and merges them together. Understanding the precedence order helps you set up the right configuration for your team and personal preferences.

***

## Configuration Layers

From highest to lowest priority:

| Priority    | Source                                                                         | Notes                |
| ----------- | ------------------------------------------------------------------------------ | -------------------- |
| 1 (highest) | Organization / Team Settings                                                   | Cannot be overridden |
| 2           | Session (interactive approvals)                                                | In-memory only       |
| 3           | Project Local (`.devin/config.local.json`)                                     | Personal, gitignored |
| 4           | Project (`.devin/config.json`)                                                 | Shared with team     |
| 5 (lowest)  | User (`~/.config/devin/config.json`; `%APPDATA%\devin\config.json` on Windows) | Your defaults        |

When the same setting is defined at multiple levels, the higher-priority source wins.

<Note>
  MCP servers follow the same precedence but live in dedicated files at each level: `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), `.devin/mcp_config.json`, and `.devin/mcp_config.local.json`. In CLI versions before v3000.3 (the Local 3.6 release), MCP servers are stored in the `mcpServers` key of the `config.json` files instead; newer versions migrate them to the dedicated files automatically on startup.
</Note>

***

## When to Use Each Level

<AccordionGroup>
  <Accordion title="User config" icon="user" defaultOpen>
    **Path:** `~/.config/devin/config.json` (`%APPDATA%\devin\config.json` on Windows)

    Use for personal preferences that apply everywhere:

    * Default model preference
    * Theme preference
    * Personal MCP servers (e.g., your own API keys)
    * Global permission grants

    ```json theme={null}
    {
      "agent": { "model": "opus" },
      "permissions": {
        "allow": ["Read(**)", "Exec(git)"]
      }
    }
    ```
  </Accordion>

  <Accordion title="Project config" icon="folder">
    **Path:** `.devin/config.json`

    Use for team standards committed to the repository. Only `permissions`, `read_config_from`, and `hooks` are available in `.devin/config.json`; MCP servers go in `.devin/mcp_config.json` alongside it:

    * Shared MCP servers (with non-secret config, in `.devin/mcp_config.json`)
    * Team permission policies
    * Import settings
    * Lifecycle hooks

    ```json theme={null}
    // .devin/config.json
    {
      "permissions": {
        "allow": ["Exec(npm run)", "Read(src/**)"],
        "deny": ["Exec(sudo)"]
      }
    }
    ```

    ```json theme={null}
    // .devin/mcp_config.json
    {
      "mcpServers": {
        "github": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"]
        }
      }
    }
    ```
  </Accordion>

  <Accordion title="Project local config" icon="lock">
    **Path:** `.devin/config.local.json`

    Use for personal overrides that shouldn't be committed:

    * API keys and secrets (MCP servers go in `.devin/mcp_config.local.json`)
    * Personal tool preferences for this project
    * Permission overrides

    ```json theme={null}
    // .devin/mcp_config.local.json
    {
      "mcpServers": {
        "github": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "ghp_my_personal_token"
          }
        }
      }
    }
    ```

    <Tip>
      Local config files are automatically excluded from git via `.git/info/exclude`.
    </Tip>
  </Accordion>

  <Accordion title="Organization settings" icon="building">
    Managed by your enterprise admin through the team settings dashboard. These settings cannot be overridden by individual users and enforce organization-wide policies like model restrictions and MCP server allowlists.
  </Accordion>
</AccordionGroup>

***

## What's Available at Each Level

Project configs (`.devin/config.json` and `.devin/config.local.json`) only support a subset of settings. The table below shows which settings are available at each level (`mcpServers` lives in the dedicated `mcp_config.json` files at each level, not in `config.json`):

| Setting                             | User config | Project config |
| ----------------------------------- | :---------: | :------------: |
| `permissions`                       |      ✓      |        ✓       |
| `mcpServers` (in `mcp_config.json`) |      ✓      |        ✓       |
| `read_config_from`                  |      ✓      |        ✓       |
| `hooks`                             |      ✓      |        ✓       |
| `agent` (model)                     |      ✓      |        ✗       |
| `theme_mode`                        |      ✓      |        ✗       |
| `unicode_mode`                      |      ✓      |        ✗       |
| `show_path`                         |      ✓      |        ✗       |
| `show_hints`                        |      ✓      |        ✗       |
| `include_gitignored_files`          |      ✓      |        ✗       |
| `sandbox`                           |      ✓      |        ✗       |

Settings marked as user-config only can only be set in the user config (`~/.config/devin/config.json`; `%APPDATA%\devin\config.json` on Windows) and do not participate in the precedence hierarchy above.

***

## How Merging Works

The precedence table above only applies to settings that support multiple levels (`permissions`, `mcpServers`, `read_config_from`, `hooks`).

### Permissions

Permission lists are **merged** (combined) across levels. A denial at a higher level cannot be overridden by an allow at a lower level.

For example, if your organization denies `Exec(sudo)`, adding `Exec(sudo)` to your user allow list has no effect — the organization denial always wins. However, other permissions like `Read(**)` at the project level are applied normally.

### MCP Servers

MCP server configs are **merged by name**. A server defined at a higher level overrides the same-named server at a lower level.

For example, if both your user config and project config define a "github" server, the project config version wins because it has higher priority than user config.

### Hooks

Hooks are **collected** from all sources and all run. A hook defined in the user config runs alongside hooks defined in the project config — they do not override each other.

***

## Project Root Detection

Devin CLI finds your project root by looking for a `.git` or `.jj` directory, walking up from your current working directory. Project config (`.devin/`) is loaded from the project root.

<Note>
  If you have nested `.devin/` directories (e.g., in a monorepo), subdirectory configs take precedence over ancestor configs.
</Note>

***

## File Discovery Summary

| File                                | Found by            | Shared?         |
| ----------------------------------- | ------------------- | --------------- |
| `~/.config/devin/config.json`       | XDG path            | No              |
| `.devin/config.json`                | Walking up from cwd | Yes (committed) |
| `.devin/config.local.json`          | Walking up from cwd | No (gitignored) |
| `~/.config/devin/mcp_config.json`   | XDG path            | No              |
| `.devin/mcp_config.json`            | Walking up from cwd | Yes (committed) |
| `.devin/mcp_config.local.json`      | Walking up from cwd | No (gitignored) |
| `.devin/skills/*/SKILL.md`          | Project root        | Yes (committed) |
| `~/.config/devin/skills/*/SKILL.md` | XDG path            | No              |
| `AGENTS.md`                         | Project root        | Yes (committed) |
| `~/.config/devin/AGENTS.md`         | XDG path            | No              |

<Note>
  **Windows:** Paths shown as `~/.config/devin/` use the XDG convention for Linux/macOS. On Windows, these resolve to `%APPDATA%\devin\` (typically `C:\Users\<YourUser>\AppData\Roaming\devin\`).
</Note>
