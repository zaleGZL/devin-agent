> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Permissions

> Control what the agent can do with fine-grained permission rules

The permission system controls which actions the agent can perform without asking for your approval. You can pre-approve safe actions, block dangerous ones, and always prompt for sensitive operations.

***

## Default Permission Behavior

Devin CLI uses a tiered permission system to balance power and safety. The default behavior depends on the current [mode](/cli/essential-commands#modes):

Each cell shows whether that tool runs automatically (**Auto**, no prompt) or waits for your approval (**Prompt**) in that mode:

| Tool type                     | Example                | Normal | Accept Edits        | Smart                 | Bypass | Autonomous (sandbox) |
| ----------------------------- | ---------------------- | ------ | ------------------- | --------------------- | ------ | -------------------- |
| Read-only                     | File reads, grep, glob | Auto   | Auto                | Auto                  | Auto   | Auto                 |
| Fetch                         | HTTP requests          | Prompt | Prompt              | Auto when judged safe | Auto   | Auto                 |
| Bash commands                 | Shell execution        | Prompt | Prompt              | Auto when judged safe | Auto   | Auto                 |
| File edits via `edit`/`write` | Edit/write files       | Prompt | Auto (in workspace) | Auto (in workspace)   | Auto   | Prompt               |

In **Normal mode** (the default), read-only operations are auto-approved while writes and shell commands require your explicit approval. Each time you approve an action, you can choose to allow it once, for the session, or permanently for the project.

In **Accept Edits mode**, file edits within the workspace are auto-approved, but shell commands and writes outside the workspace still prompt.

In **Smart mode**, workspace edits auto-approve as they do in Accept Edits, and every other action is judged by a fast model that auto-runs it only when it is clearly safe. Anything else prompts as usual. See [Smart Mode](#smart-mode) below.

In **Bypass mode**, all tool calls are auto-approved without prompting.

In **Autonomous mode**, shell commands and network fetches auto-approve because the OS-level sandbox enforces what they can touch. Direct file edits via the `edit`/`write` tools still prompt, because those tools operate outside the sandbox. Autonomous is only available when the [OS-level sandbox](#autonomous-mode) is active.

<Warning>
  Smart, Bypass, and Autonomous modes do **not** override organization-level permissions. Admin-enforced deny and ask rules configured via [Team Settings](/cli/enterprise/team-settings) remain active regardless of the user's permission mode. See [Precedence](#precedence) for details.
</Warning>

### Smart Mode

Smart sits between Accept Edits and Bypass. Workspace file edits auto-approve exactly as they do in Accept Edits. For every other action — shell commands, web fetches, MCP tools, writes outside the workspace — a fast model judges whether the action is safe to run unattended. If it is clearly safe, the action runs without a prompt; if it is not, or the model is uncertain or unavailable, you get the normal approval prompt.

```bash theme={null}
/smart
# or
/mode smart
```

You can also cycle to Smart with `Shift+Tab`, pick it in the mode selector, or start in it:

```bash theme={null}
devin --permission-mode smart
# or
DEVIN_PERMISSION_MODE=smart devin
```

The model's judgment is scoped to routine development work — building, testing, linting, formatting, and inspecting the project. Some categories are **never** auto-approved in Smart mode, no matter what the model thinks:

* Package installs (`npm install`, `pip install`, `cargo install`, `brew install`, …)
* Mutating `git` operations (read-only subcommands such as `git status` are still eligible)
* `rm`, `sudo`, and other destructive or privilege-escalating commands
* `kubectl delete` and destructive cloud-CLI operations (`aws`, `gcloud`, `az`, `terraform`, …)
* Anything that reads or writes dotenv files, key material, Git config, or the agent's own configuration

Smart differs from the neighboring modes in what it delegates:

|                                                             | Accept Edits  | Smart                                     | Bypass      |
| ----------------------------------------------------------- | ------------- | ----------------------------------------- | ----------- |
| Workspace file edits                                        | Auto          | Auto                                      | Auto        |
| Shell commands and fetches                                  | Always prompt | Auto only when the model judges them safe | Always auto |
| High-risk commands (installs, `rm`, `sudo`, mutating `git`) | Always prompt | Always prompt                             | Always auto |

<Note>
  Your own rules still come first. Smart's judgment only applies where no rule already decides the call, so a `deny` rule blocks the action and an `ask` rule always prompts, exactly as described in [How Permissions Work](#how-permissions-work). Organization-level deny and ask rules are likewise unaffected.
</Note>

<Note>
  Smart mode is rolling out gradually, so it may not appear in your mode selector or `Shift+Tab` cycle yet.
</Note>

### Autonomous Mode

Autonomous is the permission mode that pairs with the `--sandbox` flag. Conceptually it is roughly "Accept Edits in the current workspace" plus the ability to run any shell command, with both behaviors contained by the OS-level sandbox. When sandbox is active:

* **It is the only permission mode available.** Normal, Accept Edits, Smart, and Bypass are hidden in sandbox sessions. Plan mode remains available.
* **Shell commands and fetches auto-approve** instead of prompting, because the sandbox enforces what they can read, write, and reach over the network.
* **Direct file edits via the `edit` and `write` tools still prompt.** These tools run inside the CLI process rather than inside the sandbox, so they cannot be bounded by it. Granting a `Write(...)` scope at the prompt dynamically expands the sandbox so subsequent shell commands can write there.
* **`Write(...)` scopes granted mid-session dynamically expand the sandbox** for subsequent commands. Mid-session `Read(...)` approvals affect only the agent's own tools; paths hidden by `Read(...)` deny rules stay hidden for the whole session.

```bash theme={null}
devin --sandbox --permission-mode autonomous
```

Use Bypass when you want unrestricted execution without OS-level isolation; use `--sandbox` (which selects Autonomous) when you want unattended execution with OS-enforced limits on filesystem and network access. See the [sandbox configuration reference](/cli/reference/configuration/config-file#sandbox) for details on writable roots, deny rules, and domain filtering, and [Team Settings → Sandbox Enforcement](/cli/enterprise/team-settings#sandbox-enforcement) for enterprise controls.

***

## How Permissions Work

When the agent calls a tool, the permission system checks your rules in priority order:

1. **Deny rules** — Checked first. If matched, the action is blocked immediately.
2. **Ask rules** — Checked second. If matched, you're always prompted (overrides any allow rules).
3. **Allow rules** — Checked last. If matched, the action proceeds without prompting.
4. **Default** — If no rule matches, you're prompted for approval.

<Note>
  Because deny is checked before ask, and ask is checked before allow, a deny rule always wins. If the same scope matches both a deny and an ask rule, the deny takes effect.
</Note>

***

## Configuration

Add permissions to your config file's `permissions` section:

<Note>
  On Windows, the user config path is `%APPDATA%\devin\config.json` (typically `C:\Users\<you>\AppData\Roaming\devin\config.json`) rather than `~/.config/devin/config.json`. See [Configuration File](/cli/reference/configuration/config-file#file-locations) for details.
</Note>

<Tabs>
  <Tab title="Project config">
    ```json theme={null}
    // .devin/config.json
    {
      "permissions": {
        "allow": [
          "Read(src/**)",
          "Exec(npm run)"
        ],
        "deny": [
          "Exec(rm)"
        ]
      }
    }
    ```
  </Tab>

  <Tab title="User config">
    ```json theme={null}
    // ~/.config/devin/config.json
    {
      "permissions": {
        "allow": [
          "Read(**)",
          "Exec(git)"
        ]
      }
    }
    ```
  </Tab>

  <Tab title="Local override">
    ```json theme={null}
    // .devin/config.local.json
    {
      "permissions": {
        "allow": [
          "Exec(docker compose)"
        ]
      }
    }
    ```
  </Tab>
</Tabs>

***

## Permission Syntax

There are two types of permission matchers: **scope-based** (controlling what paths/commands/URLs are accessible) and **tool-based** (controlling which tools can be used).

### Scope-Based Permissions

<AccordionGroup>
  <Accordion title="Read(glob)" icon="eye" defaultOpen>
    Controls file read access. The glob pattern matches file paths.

    ```json theme={null}
    "allow": [
      "Read(src/**)",           // All files under src/
      "Read(~/.config/**)",     // Home config files
      "Read(/tmp/**)"           // Temp directory
    ]
    ```

    Directory paths automatically match all files within them.
  </Accordion>

  <Accordion title="Write(glob)" icon="pen">
    Controls file write/edit access.

    ```json theme={null}
    "allow": [
      "Write(src/**)",          // Can write anywhere in src/
      "Write(tests/**)"         // Can write test files
    ],
    "deny": [
      "Write(*.lock)",          // Can't modify lock files
      "Write(.env*)"            // Can't modify env files
    ]
    ```
  </Accordion>

  <Accordion title="Exec(prefix)" icon="terminal">
    Controls shell command execution. Matches commands that start with the given prefix.

    ```json theme={null}
    "allow": [
      "Exec(git)",              // git, git status, git commit...
      "Exec(npm run)",          // npm run test, npm run build...
      "Exec(python)"            // python, python script.py...
    ],
    "deny": [
      "Exec(rm)",               // Blocks rm, rm -rf, etc.
      "Exec(sudo)"              // Blocks sudo commands
    ]
    ```

    <Note>
      `Exec(git)` matches "git", "git status", "git commit -m 'msg'" but NOT "gitk" or "github-cli". The prefix must match as a complete word.
    </Note>
  </Accordion>

  <Accordion title="Fetch(pattern)" icon="globe">
    Controls HTTP fetch access using URL patterns.

    ```json theme={null}
    "allow": [
      "Fetch(https://api.github.com/*)",    // GitHub API
      "Fetch(https://*.example.com/*)",     // All example.com subdomains
      "Fetch(domain:npmjs.org)"             // Any URL on npmjs.org
    ]
    ```

    URL patterns follow the [WHATWG URL Pattern](https://urlpattern.spec.whatwg.org/) standard. The `domain:` shorthand matches any path on the exact domain.
  </Accordion>
</AccordionGroup>

### Tool-Based Permissions

Match by tool name to control entire tools:

```json theme={null}
{
  "permissions": {
    "deny": [
      "edit",       // Block all file edits
      "exec"        // Block all command execution
    ],
    "allow": [
      "read",       // Allow all file reads
      "grep",       // Allow all searches
      "glob"        // Allow all file finding
    ]
  }
}
```

**Available tool names:** `read`, `edit`, `grep`, `glob`, `exec`

### MCP Tool Permissions

Control access to MCP server tools:

```json theme={null}
{
  "permissions": {
    "allow": [
      "mcp__github__list_issues",     // Specific tool on specific server
      "mcp__github__*",               // All tools on github server
      "mcp__*"                        // All MCP tools
    ],
    "deny": [
      "mcp__github__delete_repo"      // Block specific dangerous tool
    ]
  }
}
```

| Pattern             | Matches                  |
| ------------------- | ------------------------ |
| `mcp__server__tool` | One specific tool        |
| `mcp__server__*`    | All tools on a server    |
| `mcp__*`            | All MCP tools everywhere |

***

## Path Patterns

Glob patterns in `Read()` and `Write()` support:

| Pattern | Meaning                                         |
| ------- | ----------------------------------------------- |
| `*`     | Any characters in a single path segment         |
| `**`    | Any characters across path segments (recursive) |
| `~`     | Home directory expansion                        |

**Examples:**

```json theme={null}
"allow": [
  "Read(**)",                    // All files everywhere
  "Read(src/**/*.ts)",           // All TypeScript in src/
  "Write(~/projects/myapp/**)"   // Write to specific project
]
```

<Note>
  Use an absolute path prefix (e.g., `Read(/**)`) when you want to match all files on the system. A bare `Read(**)` without a leading `/` is resolved relative to your current working directory, so it only matches files under that directory — not files accessed via absolute paths elsewhere.
</Note>

***

## Persistence Options

When the agent asks for permission during a session, you can choose how to save your decision:

| Option                    | Where it's saved                                                         | Shared with team? |
| ------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Allow once                | Not saved                                                                | No                |
| Allow for session         | In memory only                                                           | No                |
| Allow for project         | `.devin/config.json`                                                     | Yes               |
| Allow for project (local) | `.devin/config.local.json`                                               | No                |
| Allow globally            | `~/.config/devin/config.json` (`%APPDATA%\devin\config.json` on Windows) | No                |

Command prompts offer both scopes explicitly: "Yes, always allow `<cmd>` commands in `<project>`" saves the grant for the current project, and "Yes, always allow `<cmd>` commands in all projects" saves it to your user config so it applies everywhere. Web-fetch prompts for a specific URL or domain add an equivalent "Yes, always allow all web fetches" option that whitelists fetching in one step.

### Editing a Command Before Approving

Command approval prompts are not just yes/no. Alongside the approval options, a command prompt offers:

| Option                     | Effect                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Edit command               | Opens the proposed command for inline editing so you can tweak it before it runs                                   |
| Describe change to command | Rewrites the command from a plain-language description of what you want it to do, for you to review before running |

### MCP Server-Level Grants

When prompted for a specific MCP tool (e.g., `list_issues` on the Figma server), the permission prompt also offers broader server-level options:

| Option                                        | Effect                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| Allow this tool (this session)                | Grants access to the specific tool for the current session |
| Always allow this tool                        | Persists the specific tool grant to config                 |
| Allow all tools on this server (this session) | Grants access to every tool on the server for the session  |
| Always allow tools on this server             | Persists server-wide access to config                      |

This lets you quickly grant blanket access to a trusted MCP server without approving each tool individually.

***

## Precedence

When multiple permission sources define rules, they're merged with this precedence (highest first):

1. Organization/team settings (if enterprise)
2. Session-level grants (interactive approvals)
3. Project local config (`.devin/config.local.json`)
4. Project config (`.devin/config.json`)
5. User config (`~/.config/devin/config.json`; `%APPDATA%\devin\config.json` on Windows)

<Warning>
  Organization-level denials cannot be overridden by project or user config. This ensures enterprise policies are enforced.
</Warning>

***

## Examples

### Minimal Development Setup

Allow common read-only operations, prompt for everything else:

```json theme={null}
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Exec(git status)",
      "Exec(git diff)",
      "Exec(git log)"
    ]
  }
}
```

### Full Trust for a Project

Auto-approve most operations within the project:

```json theme={null}
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Write(src/**)",
      "Write(tests/**)",
      "Exec(npm)",
      "Exec(git)",
      "Exec(node)"
    ],
    "deny": [
      "Exec(rm -rf)",
      "Exec(sudo)",
      "Write(.env*)"
    ]
  }
}
```

### Locked-Down Enterprise

Restrict to specific safe operations, always prompt for writes:

```json theme={null}
{
  "permissions": {
    "allow": [
      "Read(src/**)",
      "Exec(git status)",
      "Exec(git diff)",
      "Exec(npm run lint)"
    ],
    "deny": [
      "Exec(rm)",
      "Exec(sudo)",
      "Write(.env*)"
    ],
    "ask": [
      "Write(**)",
      "exec"
    ]
  }
}
```

<Tip>
  In this example, writes to `.env*` are denied outright, all other writes always prompt the user, and only a few read-only commands are auto-approved. Since deny is checked before ask, the `.env*` denial takes priority over the `Write(**)` ask rule.
</Tip>
