> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Configuration File

> Complete reference for the Devin CLI config file format

Devin CLI uses JSON files (with comment support) for configuration. This page documents all available options.

***

## File Locations

| File                                                | Purpose                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `~/.config/devin/config.json`                       | User-wide settings                                           |
| `.devin/config.json`                                | Project settings (committed)                                 |
| `.devin/config.local.json`                          | Project local overrides (gitignored)                         |
| `~/.config/devin/mcp_config.json`                   | User-wide MCP servers                                        |
| `.devin/mcp_config.json`                            | Project MCP servers (committed)                              |
| `.devin/mcp_config.local.json`                      | Project local MCP servers (gitignored)                       |
| [System policy file](/cli/enterprise/system-config) | Machine-wide, administrator-managed settings (`system.json`) |

<Note>
  On Windows, the user config paths are `%APPDATA%\devin\config.json` and `%APPDATA%\devin\mcp_config.json` (e.g. `C:\Users\<you>\AppData\Roaming\devin\config.json`), not `~\.config\devin\`.
</Note>

<Note>
  MCP servers moved to the dedicated `mcp_config.json` files in v3000.3 (the Local 3.6 release). Older versions store them in the `mcpServers` key of the main config files instead; newer versions migrate any `mcpServers` entries found there automatically on startup. See [mcpServers](#mcpservers).
</Note>

***

## Full Config Reference

<Tabs>
  <Tab title="User config">
    ```json theme={null}
    // ~/.config/devin/config.json
    {
      // Agent behavior
      "agent": {
        "model": "swe-1-6-fast",           // Default model
        "show_history_on_continue": true  // Show messages when resuming
      },

      // Theme
      "theme_mode": null,            // "light", "dark", "terminal-dark", "terminal-light", "nocolor", or null (auto)

      // Permissions
      "permissions": {
        "allow": [],
        "deny": [],
        "ask": []
      },

      // Display
      "show_path": false,             // Show CWD in input border
      "unicode_mode": "auto",         // "auto", "unicode", or "ascii"
      "show_hints": true,             // Show tips between turns

      // File completion
      "include_gitignored_files": false, // Include gitignored files in @ completions

      // File access
      "respect_gitignore": false,        // Block tool access to gitignored paths

      // Commit & PR attribution
      "attribution": true,            // Add "Generated with Devin" / Co-Authored-By to commits & PRs

      // Subagents
      "subagents_enabled": true,      // Allow the agent to spawn subagents

      // Keybinding overrides, keyed by context then action
      "keymap": {
        "global": { "clear_screen": "ctrl-shift-k" }
      },

      // Updates
      "auto_update": true,            // Install new versions in the background

      // Keybinding overrides (context -> action -> key spec(s))
      "keymap": {},

      // Notifications
      "notify": "smart",              // "never" | "smart" | "always" — terminal notifications

      // Proxy settings for CLI HTTP traffic
      "proxy": {
        "mode": "system",           // "system" | "manual" | "off"
        "url": null,                // Proxy URL (required for manual mode)
        "no_proxy": null            // Comma-separated bypass list
      },

      // Sandbox network filtering
      "sandbox": {
        "allowed_domains": [],       // Domain allowlist (empty = no filtering)
        "denied_domains": [],        // Domain denylist (takes precedence)
        "network_mode": "full"       // "full" or "limited" (GET/HEAD/OPTIONS only)
      },

      // Import settings from other tools
      "read_config_from": {
        "cursor": true,
        "windsurf": true,
        "claude": true
      }
    }
    ```
  </Tab>

  <Tab title="Project config">
    ```json theme={null}
    // .devin/config.json
    {
      // Permissions
      "permissions": {
        "allow": [],
        "deny": [],
        "ask": []
      },

      // Import settings from other tools
      "read_config_from": {
        "cursor": true,
        "windsurf": true,
        "claude": true
      }
    }
    ```
  </Tab>
</Tabs>

***

## Options Reference

<Note>
  Options marked with **User only** can only be set in the user config (`~/.config/devin/config.json`; `%APPDATA%\devin\config.json` on Windows). Only `permissions`, `read_config_from`, and `hooks` are available in project configs. `mcpServers` can also be set at both levels, but lives in the dedicated `mcp_config.json` files (see [mcpServers](#mcpservers)).
</Note>

### agent <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

| Option                     | Type    | Default          | Description                                    |
| -------------------------- | ------- | ---------------- | ---------------------------------------------- |
| `model`                    | string  | `"swe-1-6-fast"` | Default AI model                               |
| `show_history_on_continue` | boolean | `true`           | Show previous messages when resuming a session |

### theme\_mode <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

| Value              | Behavior                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| `null`             | Auto-detect (asks on first run)                                          |
| `"light"`          | Light theme                                                              |
| `"dark"`           | Dark theme                                                               |
| `"terminal-dark"`  | Dark theme quantized to 16 ANSI colors (respects terminal color scheme)  |
| `"terminal-light"` | Light theme quantized to 16 ANSI colors (respects terminal color scheme) |
| `"nocolor"`        | No color output (monochrome, useful for VT100 terminals)                 |

### permissions

See [Permissions](/cli/reference/permissions) for full documentation.

```json theme={null}
{
  "permissions": {
    "allow": ["Read(**)", "Exec(git)"],
    "deny": ["Exec(sudo)"],
    "ask": ["Write(**/.env*)"]
  }
}
```

### mcpServers

Map of server name to server configuration. Supports both local command (stdio) and remote HTTP servers. See [MCP Configuration](/cli/extensibility/mcp/configuration).

Since v3000.3 (the Local 3.6 release), MCP servers live in dedicated files: `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), `.devin/mcp_config.json`, and `.devin/mcp_config.local.json`. In older versions, the `mcpServers` key lives directly in the main config files; newer versions migrate it to the dedicated files automatically on startup.

```json theme={null}
// mcp_config.json
{
  "mcpServers": {
    "server-name": {
      "command": "executable",
      "args": ["arg1", "arg2"],
      "env": { "KEY": "value" }
    },
    "remote-server": {
      "url": "https://mcp.example.com/mcp",
      "transport": "http"
    }
  }
}
```

### show\_path <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Show the current working directory path in the input border. When enabled, the top border of the input box displays your prettified CWD (e.g. `~/projects/my-app`).

| Value   | Behavior                      |
| ------- | ----------------------------- |
| `false` | Hidden (default)              |
| `true`  | Show CWD path in input border |

### unicode\_mode <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Controls whether the terminal UI uses Unicode symbols or ASCII-safe fallbacks. Set to `"ascii"` if your terminal or font does not render Unicode glyphs correctly (e.g. the ⏺ symbol appearing as a box).

| Value       | Behavior                                          |
| ----------- | ------------------------------------------------- |
| `"auto"`    | Detect Unicode support from environment (default) |
| `"unicode"` | Always use Unicode symbols                        |
| `"ascii"`   | Always use ASCII-safe characters                  |

### show\_hints <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Show occasional tips between turns (e.g. "Did you know: Use /model to switch between available models"). Useful for discovering CLI features; set to `false` to suppress them once you're familiar.

| Value   | Behavior                         |
| ------- | -------------------------------- |
| `true`  | Show tips occasionally (default) |
| `false` | Never show tips                  |

### include\_gitignored\_files <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Include gitignored files in `@` tab completion results. When enabled, files matching `.gitignore` patterns will appear in `@` mention completions. This is useful if you store documentation or other files in gitignored directories that you want to reference.

| Value   | Behavior                                            |
| ------- | --------------------------------------------------- |
| `false` | Exclude gitignored files from completions (default) |
| `true`  | Include gitignored files in `@` completions         |

### respect\_gitignore <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Control whether the agent respects `.gitignore` when reading or writing files via tools. When enabled, tool calls that access gitignored paths are blocked. This is separate from `include_gitignored_files`, which only affects `@` tab completion.

| Value   | Behavior                                                        |
| ------- | --------------------------------------------------------------- |
| `false` | Agent can access all files regardless of `.gitignore` (default) |
| `true`  | Block tool access to gitignored paths                           |

### attribution <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Control whether the agent adds Devin attribution to the commits and pull requests it creates. When enabled, commit and PR bodies include a `Generated with [Devin]` line and a `Co-Authored-By: Devin` trailer. Set to `false` to omit both so no Devin attribution is added.

| Value   | Behavior                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------- |
| `true`  | Add the `Generated with [Devin]` line and `Co-Authored-By` trailer to commits and PRs (default) |
| `false` | Omit all Devin attribution from commits and PRs                                                 |

<div id="subagents_enabled" />

### subagents\_enabled <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Control whether the agent can delegate work to [subagents](/cli/subagents). When disabled, the `run_subagent` and `read_subagent` tools are removed, so the agent does all the work itself. Changing this setting applies live — a running session picks it up without restarting.

| Value   | Behavior                                |
| ------- | --------------------------------------- |
| `true`  | The agent can spawn subagents (default) |
| `false` | Subagents are disabled for this user    |

<Note>
  Organization policy takes precedence: if an admin has disabled subagents for your org (via the **Default subagent model** setting), subagents stay off regardless of this setting.
</Note>

<div id="keymap" />

### keymap <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Override the CLI's built-in [keyboard shortcuts](/cli/reference/keyboard-shortcuts). The section is a table of contexts (`global`, `editor`, `input`, `list`, …), each mapping action names to the key(s) that trigger them. Actions you don't list keep their built-in defaults.

```json theme={null}
{
  "keymap": {
    "global": {
      "clear_screen": "ctrl-shift-k",
      "history_search": ["ctrl-r", "f3"]
    },
    "editor": {
      "beginning_of_line": "home"
    }
  }
}
```

| Value              | Meaning                                             |
| ------------------ | --------------------------------------------------- |
| `"ctrl-shift-k"`   | A single key spec bound to the action               |
| `["ctrl-r", "f3"]` | Several key specs, any of which triggers the action |
| `[]`               | Unbind the action                                   |

A key spec is a `-`-separated list of modifiers (`ctrl`, `alt`, `shift`) followed by one key name (a character, or a named key like `enter`, `esc`, `tab`, `home`, `page-up`, `f5`). Modifier order does not matter and matching is case-insensitive, except that a single uppercase character binds the shifted key (`"K"` is the same as `"shift-k"`).

<Tip>
  Run `/shortcuts` to see every action with its `context.action` identifier — the same identifiers used here — and rebind interactively. Bindings you set there are saved back to this section.
</Tip>

<Note>
  `global.cancel` (`Ctrl+C`) cannot be unbound, so you can always interrupt a running agent. Invalid entries, unknown contexts or actions, and overrides that would collide with another shortcut in the same context are reported at startup and fall back to the built-in default.
</Note>

### auto\_update <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Control background auto-update on macOS and Linux. When enabled, new releases are downloaded and activated while Devin CLI runs, so the next invocation of `devin` picks up the latest version automatically. The currently running session is unaffected — a swap of the `current` symlink only takes effect on the next launch.

The update is designed to be safe against interruption: every filesystem step is staged to a temp path and promoted with an atomic rename, and concurrent updaters are serialized with a file lock. Quitting mid-update cannot leave the installation in a broken state — you'll just come back up on the old version.

Only applies to self-managed installations (`curl | bash` on macOS/Linux). Installations bundled with another product (e.g. Windsurf) ignore this setting and update through their parent application.

| Value   | Behavior                                                      |
| ------- | ------------------------------------------------------------- |
| `true`  | Download and install new versions in the background (default) |
| `false` | Only check for new versions; install manually via `/update`   |

### keymap <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Override keyboard shortcuts. Overrides are keyed by context, then action — the `context.action` identifier shown for each shortcut in `/shortcuts` (e.g. `editor.insert_newline`):

```json theme={null}
{
  "keymap": {
    "global": {
      "clear_screen": "ctrl-shift-k",
      "history_search": ["ctrl-r", "f5"],
      "feedback_up": []
    },
    "editor": {
      "insert_newline": ["shift-enter", "alt-enter", "ctrl-j"]
    }
  }
}
```

| Value             | Behavior                                         |
| ----------------- | ------------------------------------------------ |
| `"<spec>"`        | Bind the action to a single key                  |
| `["<spec>", ...]` | Bind the action to several keys (all trigger it) |
| `[]`              | Unbind the action                                |

Overrides fully replace the built-in defaults for that action; unlisted actions keep their defaults. `Ctrl+C` (cancel) cannot be unbound. Invalid entries (unknown names, bad key specs, wrong-typed values, or overrides that conflict with another binding in the same context) are reported as warnings at startup and skipped — the rest of the config still applies.

A key spec is zero or more `-`-separated modifiers followed by one key name (e.g. `ctrl-shift-p`, `alt-enter`, `f5`, `K`). Modifiers: `ctrl`/`control`/`c`, `alt`/`meta`/`option`/`opt`/`m`, `shift`/`s`. Named keys: `enter`, `esc`, `tab`, `backspace`, `delete`, `insert`, `up`, `down`, `left`, `right`, `home`, `end`, `page-up`, `page-down`, `space`, `f1`–`f24`. Any other single character binds that character key (case-sensitive: `K` binds Shift+K); use `-` for the minus key (`ctrl--`).

You can also rebind interactively: in `/shortcuts`, press `Enter` on a shortcut row, then press the new key — the change is saved to this `keymap` section. See [Customizing Keybindings](/cli/reference/keyboard-shortcuts#customizing-keybindings).

### notify

Control terminal notifications when the agent finishes or needs user input. The CLI writes a BEL character (triggers terminal bell / visual bell), an OSC 9 escape sequence (triggers a system notification in iTerm2 and compatible terminals), and an OSC 777 sequence (desktop notification in rxvt-unicode and other terminals). Terminals that do not recognize these sequences safely ignore them.

| Value      | Behavior                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| `"never"`  | No notifications                                                                       |
| `"smart"`  | Notify only when the terminal window is unfocused (uses OSC focus reporting) (default) |
| `"always"` | Notify on every qualifying event regardless of focus                                   |

### read\_config\_from

Control importing from other AI tool configurations:

| Option     | Type         | Default | Description                    |
| ---------- | ------------ | ------- | ------------------------------ |
| `cursor`   | boolean/null | `true`  | Import from `.cursor/rules/`   |
| `windsurf` | boolean/null | `true`  | Import from `.windsurf/rules/` |
| `claude`   | boolean/null | `true`  | Import from `.claude/`         |

Set to `false` to disable a specific import. `null` is treated as `true`.

### proxy <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

Configure how the CLI routes its own outbound HTTP/HTTPS traffic (API calls, updates, MCP servers, etc.). This does not affect sandbox child-process networking (see `sandbox` below).

The `mode` field selects the proxy strategy:

| Mode                 | Behavior                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"system"` (default) | Respect environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) and platform-native PAC (Proxy Auto-Configuration) on macOS and Windows |
| `"manual"`           | Route all CLI traffic through the explicit `url`                                                                                                 |
| `"off"`              | Connect directly — no proxy                                                                                                                      |

| Option     | Type        | Default    | Description                                                                                                                                                                                    |
| ---------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`     | string      | `"system"` | Proxy strategy: `"system"`, `"manual"`, or `"off"`                                                                                                                                             |
| `url`      | string/null | `null`     | Proxy URL. Required when `mode` is `"manual"`. Supports `http://`, `https://`, and `socks5://` schemes                                                                                         |
| `no_proxy` | string/null | `null`     | Comma-separated list of hosts/domains that bypass the proxy. Uses the same syntax as the `NO_PROXY` environment variable (e.g. `"localhost,127.0.0.1,.corp.example.com"`). Applies in any mode |

**Example — corporate proxy:**

```json theme={null}
{
  "proxy": {
    "mode": "manual",
    "url": "http://proxy.corp.example.com:8080",
    "no_proxy": "localhost,127.0.0.1,.internal.corp"
  }
}
```

**Example — disable proxy:**

```json theme={null}
{
  "proxy": {
    "mode": "off"
  }
}
```

<Note>
  Administrators can set the same `proxy` block in the machine-wide [system configuration file](/cli/enterprise/system-config). The enterprise setting takes precedence, and configuring a proxy in both files is an error — remove the `proxy` section from your user config if your organization manages it.
</Note>

<div id="sandbox" />

### sandbox <span style={{fontSize: '0.7em', color: 'gray'}}>(user only)</span>

<Warning>
  Sandbox network filtering is currently unstable. If you need this feature, please reach out to your account representative for stability timelines.
</Warning>

Configure domain-level network filtering for the sandbox. When `--sandbox` is active and domain filtering is configured, a managed network proxy starts on loopback and the sandbox restricts all child traffic to route through it.

<Note>
  For a complete overview of how the sandbox works — including enterprise enforcement and how enterprise and user settings interact — see the [Sandbox documentation](/cli/sandbox).
</Note>

The `--sandbox` flag enforces writable paths and `deny` rules at the OS level. Writable roots are derived from granted `Write(...)` scopes plus workspace directories; everything else is readable except paths hidden by `Read(...)` deny rules. `Write(...)` scopes granted mid-session dynamically expand the sandbox for subsequent commands.

<Note>
  If `--sandbox` is passed but sandbox resolution fails (e.g., sandboxing tools are unavailable on the current platform), the CLI will refuse to start rather than running unsandboxed. This fail-closed behavior ensures the security intent of `--sandbox` is never silently bypassed.
</Note>

| Option            | Type      | Default  | Description                                                                                                   |
| ----------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `allowed_domains` | string\[] | `[]`     | Domain patterns allowed through the proxy. When non-empty, only matching domains are allowed (allowlist mode) |
| `denied_domains`  | string\[] | `[]`     | Domain patterns always blocked. Deny rules take precedence over allow rules                                   |
| `network_mode`    | string    | `"full"` | `"full"` allows all HTTP methods; `"limited"` allows only GET/HEAD/OPTIONS                                    |

**Domain pattern syntax:**

| Pattern          | Matches                       |
| ---------------- | ----------------------------- |
| `example.com`    | Exact match only              |
| `*.example.com`  | Any subdomain (not the apex)  |
| `**.example.com` | Apex domain and any subdomain |

**Example:**

```json theme={null}
{
  "sandbox": {
    "allowed_domains": [
      "github.com",
      "**.npmjs.org",
      "**.crates.io",
      "**.pypi.org"
    ],
    "denied_domains": ["evil.example.com"],
    "network_mode": "full"
  }
}
```

<Note>
  Domain filtering applies when the sandbox is active (`--sandbox`). Without `--sandbox`, the sandbox section is ignored.
</Note>

<Note>
  For enterprise teams, admins can override domain lists via [Team Settings](/cli/enterprise/team-settings#sandbox-enforcement). Enterprise allowlists are authoritative (they replace your local `allowed_domains`), while enterprise denylists are additive (merged with your local `denied_domains`).
</Note>

***

## JSON with Comments

Config files support JavaScript-style comments:

```json theme={null}
{
  // Line comments
  "agent": {
    "model": "sonnet"  // Inline comments
  },
  /* Block
     comments */
  "permissions": {}
}
```
