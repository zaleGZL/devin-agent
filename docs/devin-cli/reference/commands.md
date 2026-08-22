> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Commands & Flags

> Complete reference for command arguments, subcommands, and interactive slash commands

## Usage

```bash theme={null}
devin [OPTIONS] [prompt]
```

Pass an optional prompt to start a session with an initial message, or launch interactively with no arguments.

You can also read these from your terminal with `man devin`.

***

## Global Flags

| Flag                                      | Short | Env var                 | Description                                                                                                                                                                                                    |
| ----------------------------------------- | ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model <MODEL>`                         |       | `DEVIN_MODEL`           | Set the AI model for this session                                                                                                                                                                              |
| `--permission-mode <MODE>`                |       | `DEVIN_PERMISSION_MODE` | Permission mode: `normal` (alias `auto`, the default), `accept-edits`, `smart`, `dangerous` (aliases `yolo`, `bypass`), or `autonomous` (requires `--sandbox`). See [Permissions](/cli/reference/permissions). |
| `--sandbox`                               |       | `DEVIN_SANDBOX`         | \[Research Preview] Sandbox exec-tool processes (macOS seatbelt / Linux bwrap+seccomp). See [Sandbox](/cli/sandbox).                                                                                           |
| `--continue`                              | `-c`  |                         | Resume the most recent session in the current directory                                                                                                                                                        |
| `--resume <SESSION_ID>`                   | `-r`  |                         | Resume a specific session by ID                                                                                                                                                                                |
| `--print [PROMPT]`                        | `-p`  |                         | Print response and exit (non-interactive mode). Optionally accepts an inline prompt.                                                                                                                           |
| `--prompt-file <FILE>`                    |       |                         | Load the initial prompt from a file                                                                                                                                                                            |
| `--config <PATH>`                         |       |                         | Configuration file path                                                                                                                                                                                        |
| `--export [PATH]`                         |       |                         | Export conversation to a file after each turn (ATIF format). Uses a default path if none is provided.                                                                                                          |
| `--respect-workspace-trust [true\|false]` |       |                         | Whether to respect workspace trust settings. Defaults to `true`.                                                                                                                                               |

<Note>
  Non-interactive `--print` mode cannot show the workspace trust prompt, so it fails in an untrusted directory. Pass `--respect-workspace-trust false` to skip the check in scripts and CI.
</Note>

**Examples:**

```bash theme={null}
devin -- add a login page
devin --model opus -- refactor the auth module
devin --permission-mode accept-edits -- fix the failing tests
devin --sandbox -- run the migration script
devin -c                              # Resume last session
devin -r abc12345                     # Resume specific session
devin -p "list all TODO comments"    # Print response and exit
devin -p -- list all TODO comments    # Same, using -- separator (still works)
devin --export -- fix the tests       # Export conversation to default path
devin --export out.json -- fix tests   # Export to a specific file
```

***

## Subcommands

### devin auth

Authentication related commands.

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `devin auth login`  | Log in to your account                |
| `devin auth logout` | Log out and remove stored credentials |
| `devin auth status` | Check authentication status           |

**Options for `devin auth login`:**

* `--force-manual-token-flow` — Skip browser-based auth and manually paste a token (useful for remote/SSH sessions)

### devin mcp

Connect and log in to Model Context Protocol servers.

| Command                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `devin mcp add <name>`     | Add a new MCP server                              |
| `devin mcp list`           | List all configured MCP servers                   |
| `devin mcp get <name>`     | Show details for a specific MCP server            |
| `devin mcp remove <name>`  | Remove a configured MCP server                    |
| `devin mcp login <name>`   | Authenticate with an MCP server via OAuth         |
| `devin mcp logout <name>`  | Remove stored OAuth credentials for an MCP server |
| `devin mcp enable <name>`  | Enable a disabled MCP server                      |
| `devin mcp disable <name>` | Disable an MCP server without removing it         |

**Options for `devin mcp add`:**

* `-t, --transport <stdio|http>` — Transport type (optional; inferred from URL → http, trailing args → stdio)
* `-s, --scope <local|project|user>` — Configuration scope (default: `local`)
* `--url <URL>` — URL for HTTP transport (can also be passed as a positional argument after the name)
* `--command <CMD>` — Command for stdio transport (optional when trailing args are provided)
* `-e, --env <KEY=VALUE>` — Environment variables (repeatable)
* `-H, --header <HEADER: VALUE>` — HTTP headers (repeatable)
* `--scopes <SCOPE,SCOPE>` — OAuth scopes to request (comma-separated)
* `--oauth-resource <RESOURCE>` — Override the RFC 8707 `resource` parameter sent in OAuth requests (default: the MCP server URL; pass an empty string to omit it for providers that reject it)
* `<URL>` — Positional URL argument for HTTP (alternative to `--url`)
* `-- <COMMAND> [ARGS...]` — Command and arguments for stdio (first arg is the command when `--command` is omitted)

<Note>
  HTTP servers try Streamable HTTP first and fall back to legacy SSE on 4xx errors (per the [MCP spec](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/#backwards-compatibility)). You can also set `"transport": "sse"` explicitly. See [MCP Configuration → Troubleshooting](/cli/extensibility/mcp/configuration#troubleshooting).
</Note>

**Examples:**

```bash theme={null}
# stdio server
devin mcp add my-server -- npx @company/mcp-server --port 3000

# HTTP server (positional URL)
devin mcp add notion https://mcp.notion.com/mcp
devin mcp add --transport http datadog-mcp https://mcp.datadoghq.com/api/unstable/mcp-server/mcp

# HTTP server (--url flag, also works)
devin mcp add notion --url https://mcp.notion.com/mcp

# With environment variables and scope
devin mcp add -e GITHUB_TOKEN=ghp_xxx github -- npx -y @modelcontextprotocol/server-github
devin mcp add -s project sentry https://mcp.sentry.dev/mcp
```

**Options for `devin mcp remove`:**

* `-s, --scope <local|project|user>` — Configuration scope (default: `local`)

**Options for `devin mcp login`:**

* `--scopes <SCOPE,SCOPE>` — OAuth scopes to request (comma-separated)
* `--oauth-resource <RESOURCE>` — Override the RFC 8707 `resource` parameter sent in OAuth requests (default: the MCP server URL; pass an empty string to omit it for providers that reject it)

**Options for `devin mcp enable`:**

* `-s, --scope <local|project|user>` — Configuration scope (default: `local`)

**Options for `devin mcp disable`:**

* `-s, --scope <local|project|user>` — Configuration scope (default: `local`)

See [MCP Configuration](/cli/extensibility/mcp/configuration) for details.

### devin models

List the models available to your account.

| Command                           | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `devin models list`               | List available models, organized by model family |
| `devin models list --format json` | Output the model list as JSON (for scripts)      |

See [Models](/cli/models) for details.

### devin rules

Manage agent rules (always-on context blobs).

| Command                   | Description                      |
| ------------------------- | -------------------------------- |
| `devin rules list`        | List all available rules         |
| `devin rules show <name>` | Show details for a specific rule |
| `devin rules paths`       | Show rule directory locations    |

**Options for `devin rules list`:**

* `--provider <cursor\|windsurf>` — Filter by rule provider

See [Rules](/cli/extensibility/rules) for details.

### devin skills

Manage agent skills (slash commands and agent-triggered context blobs).

| Command                    | Description                       |
| -------------------------- | --------------------------------- |
| `devin skills list`        | List all available skills         |
| `devin skills show <name>` | Show details for a specific skill |
| `devin skills paths`       | Show skill directory locations    |

**Options for `devin skills list`:**

* `--trigger <user\|model>` — Filter by trigger type

See [Skills](/cli/extensibility/skills/overview) for details.

### devin plugins

Manage plugins — bundles that ship skills, rules, hooks, MCP servers, and subagents together.

| Command                          | Description                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `devin plugins install <source>` | Install a plugin and its required plugins                                                                   |
| `devin plugins list`             | List installed plugins with their version and blocked status                                                |
| `devin plugins info <name>`      | Show a plugin's skills, hooks, rules, and its required/optional/forbidden lists                             |
| `devin plugins update [name]`    | Re-fetch and re-install a plugin at the latest HEAD. Omit the name to update every plugin.                  |
| `devin plugins remove <name>`    | Remove an installed plugin                                                                                  |
| `devin plugins prune`            | Drop requirements from repos that no longer exist on disk, then garbage-collect unreferenced plugin content |

A source is a GitHub `owner/repo`, a git URL, or a local path. Append `#path/to/plugin` when the plugin lives below a repository's root.

**Options:**

* `-y, --yes` (`install`) — Skip the interactive trust prompt
* `--force` (`remove`) — Remove even when another plugin or a governance config still requires it

```bash theme={null}
devin plugins install acme/review-tools
devin plugins install acme/vendor-plugins#plugins/stripe
devin plugins info review-tools
```

See [Plugins](/cli/extensibility/plugins/overview) for details.

### devin migrate

Migrate configuration from other tools into Devin's own formats.

| Command                   | Description                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `devin migrate hooks`     | Migrate Windsurf hooks (`.windsurf/hooks.json`) to Devin hooks (`.devin/hooks.v1.json`) |
| `devin migrate workflows` | Migrate workflow files into skills and remove the originals                             |

**Options for `devin migrate workflows`:**

* `--scope <all\|workspace\|global>` — Which workflows to migrate (default: `all`)

Migration is a one-time copy. Configuration that Devin CLI reads in place — rules, skills, and MCP servers from Cursor, Windsurf, Claude Code, Copilot, and others — needs no migration; see [Configuration Import](/cli/reference/configuration/read-config-from).

### devin list

List sessions in the current directory. Alias: `devin ls`

| Command                    | Description                          |
| -------------------------- | ------------------------------------ |
| `devin list`               | Interactive session picker (default) |
| `devin list --format json` | Output sessions as JSON              |
| `devin list --format csv`  | Output sessions as CSV               |

### devin cloud

Manage Devin Cloud resources from the terminal. Commands use the credentials stored by `devin auth login` — there is no extra environment wiring.

#### devin cloud drs

Manage [Declarative Repo Setup](/onboard-devin/environment/blueprints): environment blueprints, sandbox sessions for testing repo setup, and snapshot builds.

| Command                                                                  | Description                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `devin cloud drs whoami`                                                 | Print the current configuration (org, API endpoint, auth status)                         |
| `devin cloud drs sandbox-create --repo <owner/repo>`                     | Create a sandbox Devin session attached to a repository for testing repo setup           |
| `devin cloud drs run --devin-id <id> --command <cmd>`                    | Run a shell command inside a sandbox session and block until it finishes                 |
| `devin cloud drs blueprint-list`                                         | List all environment blueprints for the organization                                     |
| `devin cloud drs blueprint-create`                                       | Create a blueprint, optionally scoped to a repository                                    |
| `devin cloud drs blueprint-write --blueprint-id <id> --from-file <FILE>` | Replace a blueprint's contents with a YAML file                                          |
| `devin cloud drs build`                                                  | Trigger an environment build and wait for it to finish                                   |
| `devin cloud drs build-start`                                            | Trigger a build and return immediately with the build job ID                             |
| `devin cloud drs build-wait --build-job-id <id>`                         | Wait for a previously started build to finish                                            |
| `devin cloud drs build-logs --build-job-id <id>`                         | Stream a build job's logs as NDJSON — useful for diagnosing `partial` or `failed` builds |
| `devin cloud drs secret-create --key <KEY> --value <VALUE>`              | Create an organization-level secret                                                      |

**Options for `devin cloud drs sandbox-create`:**

* `--repo <owner/repo>` — Repository to attach the sandbox to (required)
* `--prompt <PROMPT>` — Initial prompt for the sandbox session
* `--secret <KEY=VALUE>` — Per-session secret (repeatable)

**Options for `devin cloud drs run`:**

* `--devin-id <ID>` — Devin session ID (e.g. `devin-abc123…`) (required)
* `--command <CMD>` — Shell command to execute (required)
* `--timeout <SECONDS>` — Server-side timeout (default: `600`)

**Options for `devin cloud drs blueprint-create`:**

* `--repo <owner/repo>` — Repository to scope the blueprint to; omit for an org-wide blueprint
* `--from-file <FILE>` — YAML file with the initial blueprint contents

```bash theme={null}
devin cloud drs whoami
devin cloud drs blueprint-create --repo acme/api --from-file environment.yaml
devin cloud drs sandbox-create --repo acme/api --secret NPM_TOKEN=abc123
devin cloud drs run --devin-id devin-abc123 --command "npm test"
devin cloud drs build
```

See [Blueprint reference](/onboard-devin/environment/blueprint-reference) for the `environment.yaml` format these commands read and write.

### devin version

Print the current version and exit.

```bash theme={null}
devin version
```

This is equivalent to `devin --version`.

### devin acp

Run Devin as an [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) server over stdio. This subcommand is intended to be invoked by an ACP-aware editor or IDE (such as Windsurf or Zed) as a subprocess — it speaks JSON-RPC over stdin/stdout and is not meant to be run interactively.

```bash theme={null}
devin acp
```

The ACP server reads credentials from `WINDSURF_API_KEY` if set, otherwise from the credentials stored by `devin auth login`. It can also accept credentials at runtime via the ACP `authenticate` request.

**Options:**

| Flag                  | Env var       | Description                                                                                                                                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--agent-type <TYPE>` |               | The type of agent to run. Omit to run the default agent.                                                                                                                                    |
| `--model <MODEL>`     | `DEVIN_MODEL` | Default model for every new ACP session, overriding the enterprise-configured default. Accepts the same fuzzy names as `/model` (family slug, alias, or partial name), e.g. `--model opus`. |

```bash theme={null}
devin acp --model opus
```

#### Slash commands in ACP hosts

The ACP server advertises its full slash-command set over the protocol, so the commands show up in the host's own command palette with descriptions, argument hints, and categories:

| Category | Commands                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account  | `/login [api-key]`, `/logout`, `/status` (the ACP name for the CLI's `/login-status`)                                                               |
| Session  | `/ask [question]`, `/plan [prompt]`, `/compact`, `/context`, `/fast`, `/loop <prompt>`, `/btw <prompt>`, `/session-stats` (alias `/stats`), `/help` |
| System   | `/workspace` (alias `/workspaces`), `/add-dir <path>`, `/remove-dir <path>`, `/mcp`, `/bug <description>`                                           |

Some commands are gated by the host and your account:

* `/login` and `/logout` are hidden when the host manages authentication itself.
* The workspace-directory commands (`/workspace`, `/add-dir`, `/remove-dir`) only appear when the host asks the agent to own the workspace roots. Hosts that manage their own roots never see them.

### devin update

Check for updates and optionally install them.

```bash theme={null}
devin update
```

Use `--force` to re-install even if already on the latest version:

```bash theme={null}
devin update --force
```

### devin sandbox

\[Research Preview] Manage OS-level process sandboxing for the exec tool. Pass the global `--sandbox` flag to run a session with the sandbox enforced.

#### devin sandbox setup

Print the sandbox prerequisites for the current platform.

Requirements to run with `--sandbox`:

* **Linux**: requires bubblewrap (`bwrap`) and `socat`. A sandbox session fails to start with install instructions if either is missing — including in a fresh WSL distribution.
* **macOS**: works out of the box via Seatbelt; no extra packages needed.
* **Windows**: native Windows cannot run the sandbox. [Install WSL 2](https://learn.microsoft.com/windows/wsl/install) and run Devin inside your WSL distribution.

```bash theme={null}
devin sandbox setup
```

### devin setup

Interactive setup wizard for authentication and MCP configuration.

```bash theme={null}
devin setup
devin setup --force-manual-token-flow  # For remote/SSH sessions
```

### devin doctor

Diagnose air-gapped configuration and model endpoint connectivity.

```bash theme={null}
devin doctor
devin doctor --json   # Machine-readable output
```

<Note>
  `devin doctor` is only present in air-gapped builds of the CLI.
</Note>

### devin worker

Runs the CLI as an [Outposts](/cloud/outposts/overview) worker. It is hidden from `devin --help` and documented separately — see the [Outposts reference](/cloud/outposts/reference).

### devin uninstall

Uninstall Devin CLI and optionally remove all data.

| Option    | Description                                                       |
| --------- | ----------------------------------------------------------------- |
| `--clean` | Remove all data including configuration, history, and custom data |
| `--force` | Skip confirmation prompt                                          |

***

## Slash Commands

These commands are available inside an interactive session. Type them at the prompt.

### Mode & Model

| Command                                                         | Description                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/mode [normal\|accept-edits\|smart\|plan\|bypass]`             | Show or switch the current mode (`autonomous` is available in sandbox sessions)                                                            |
| `/normal`                                                       | Switch to Normal mode (default)                                                                                                            |
| `/accept-edits`                                                 | Switch to Accept Edits mode (auto-approve file edits in workspace)                                                                         |
| `/smart`                                                        | Switch to Smart mode (auto-approve actions a fast model judges safe). Rolling out gradually — it may not be available on your account yet. |
| `/plan`                                                         | Switch to Plan mode (read-only planning)                                                                                                   |
| `/ask <question>`                                               | Ask a question without making code changes (oneshot)                                                                                       |
| `/bypass`                                                       | Switch to Bypass mode (auto-approve all actions)                                                                                           |
| `/autonomous`                                                   | Switch to Autonomous mode (sandbox-enforced; requires `--sandbox`)                                                                         |
| `/model [name]`                                                 | Show or change the current model                                                                                                           |
| `/fast`                                                         | Switch to SWE-1.6 Fast                                                                                                                     |
| `/theme [dark\|light\|terminal-dark\|terminal-light\|no-color]` | Switch between themes (dark, light, terminal dark, terminal light, no color)                                                               |

<Note>
  `/bypass` has aliases `/yolo` and `/dangerous`. All three do the same thing.
</Note>

### Session Management

| Command                       | Description                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `/clear`                      | Clear conversation history and start a new session. Alias: `/new`                                 |
| `/continue [session-id]`      | Resume a previous session                                                                         |
| `/fork [step]`                | Fork the current session to a new session. Optionally fork from a specific step (see `/steps`).   |
| `/steps`                      | List conversation steps (use with `/fork` and `/revert`)                                          |
| `/revert <step>`              | Revert file changes from a specific step onwards and rewind the conversation to before that step  |
| `/resume [session-id]`        | Open the interactive session picker, or resume a specific session by ID                           |
| `/ls [--all]`                 | List recent sessions (current directory only by default). Alias: `/list-sessions`                 |
| `/title <new title>`          | Rename the current session                                                                        |
| `/rename-session <new title>` | Rename the current session                                                                        |
| `/rm-session <session-id>`    | Irreversibly delete a session and all its data                                                    |
| `/export`                     | Show export info. Use the `--export` CLI flag to enable conversation export.                      |
| `/exit`                       | Exit the application (alias: `/quit`). You can also type `exit` or `quit` without the `/` prefix. |

### Workspace

| Command                | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `/workspace`           | List workspace directories (alias: `/workspaces`)              |
| `/add-dir <path>`      | Add an additional workspace directory                          |
| `/undo-add-dir <path>` | Remove a workspace directory                                   |
| `/remove-dir <path>`   | Remove a workspace directory (second name for `/undo-add-dir`) |

### Automation

| Command          | Description                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/loop <prompt>` | Run a prompt then auto-review the diff in a loop                                                                                                                         |
| `/btw <prompt>`  | Ask a quick side question. Runs a sidechain using the current conversation context and prints the answer in a box, without adding the question to the main conversation. |

### Extensibility

| Command  | Description                                                         |
| -------- | ------------------------------------------------------------------- |
| `/hooks` | List all loaded hooks with their IDs, event types, and source paths |
| `/mcp`   | List configured MCP servers and their status                        |

### Utilities

| Command                | Description                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/help`                | Show available slash commands                                                                                                                                                                                                         |
| `/shortcuts`           | Browse keyboard shortcuts in an interactive, searchable list grouped by category. Press `Enter` on a row to [rebind it](/cli/reference/keyboard-shortcuts#customizing-keybindings), and see each action's `context.action` identifier |
| `/config`              | Open the interactive config editor                                                                                                                                                                                                    |
| `/bug [description]`   | Report a bug to the Devin CLI developers                                                                                                                                                                                              |
| `/update [--force]`    | Check for and install updates. Pass `--force` to re-install even when already on the latest version.                                                                                                                                  |
| `/upgrade`             | Upgrade your subscription plan                                                                                                                                                                                                        |
| `/login`               | Authenticate with your account                                                                                                                                                                                                        |
| `/logout`              | Clear stored credentials and exit                                                                                                                                                                                                     |
| `/login-status`        | Show login and authentication status (advertised to ACP hosts as `/status`)                                                                                                                                                           |
| `/org`                 | Select your Devin organization                                                                                                                                                                                                        |
| `/copy`                | Copy the last response to the clipboard                                                                                                                                                                                               |
| `/feedback <up\|down>` | Rate the last response                                                                                                                                                                                                                |
| `/mouse`               | Toggle mouse event capture (click/hover/scroll in menus)                                                                                                                                                                              |
| `/context`             | Show context window usage                                                                                                                                                                                                             |
| `/usage`               | Show estimated credit/ACU usage for the session, including usage from previous openings of a resumed session                                                                                                                          |
| `/session-stats`       | Show session statistics (alias: `/stats`)                                                                                                                                                                                             |
| `/compact`             | Force conversation compaction                                                                                                                                                                                                         |

#### Session statistics

`/session-stats` (alias `/stats`) is the full view of what a session has consumed, where `/usage` is the thin credit/ACU summary. It renders every usage dimension the server reports — credits, ACUs, agent messages, turn continuations, and token usage — using the server's own labels and grouping, so new dimensions show up without a CLI update. The `Model` row names the model that actually served the billed turns, which can differ from the model you selected. Totals persist across resume, so a resumed session reports its cumulative usage rather than starting over.

### Cloud Sessions (insiders only)

| Command                   | Description                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/cloud-sessions [--all]` | Open an interactive picker of your recent cloud Devin sessions. Use arrow keys to navigate, type to filter, Enter to select, Esc to cancel. Pass `--all` for org-wide sessions. |

***

## Modes

Modes control the agent's autonomy level by combining a permission mode with an agent profile.

<Tabs>
  <Tab title="Normal (default)">
    Full autonomy for complex coding tasks. The agent can read, write, and execute commands with normal permission checks.

    * **Permission mode:** Normal
    * **Profile:** Normal
    * **Use for:** Multi-file refactoring, feature implementation, bug fixes
  </Tab>

  <Tab title="Plan">
    Planning only — the agent proposes changes without making them. Read-only tool access ensures no code is modified.

    * **Permission mode:** Normal
    * **Profile:** Plan (read-only tools)
    * **Use for:** Architecture design, understanding codebases, planning before implementation
  </Tab>

  <Tab title="Smart">
    Workspace edits are auto-approved like Accept Edits, and a fast model decides whether other actions are safe to auto-run, falling back to the normal prompt otherwise.

    * **Permission mode:** Smart
    * **Profile:** Normal
    * **Use for:** Routine development work (building, testing, linting) with fewer interruptions

    <Note>
      Smart mode is rolling out gradually and may not be available on your account yet. See [Permissions](/cli/reference/permissions).
    </Note>
  </Tab>

  <Tab title="Bypass">
    All permission prompts are auto-approved. The agent executes freely without asking for confirmation.

    * **Permission mode:** Dangerous
    * **Profile:** Normal
    * **Use for:** Trusted tasks where interruptions slow you down

    <Warning>
      Use Bypass mode only for tasks you fully trust. All tool calls (including destructive commands) are auto-approved.
    </Warning>
  </Tab>

  <Tab title="Autonomous">
    Everything except file writes is auto-approved and the OS sandbox enforces the boundary instead of prompts.

    * **Permission mode:** Autonomous (requires `--sandbox`)
    * **Profile:** Normal
    * **Use for:** Long unattended runs inside a [sandboxed](/cli/sandbox) session
  </Tab>
</Tabs>

Cycle between modes with `/mode`, or switch directly with `/normal`, `/accept-edits`, `/smart`, `/plan`, `/bypass`, or `/autonomous`. Use `/ask <question>` as a oneshot command to ask questions without switching modes.

***

## Profiles

Profiles determine the agent's available tools and behavior. Profiles are automatically set when you switch modes.

| Profile  | Description                                                                               | Tool Access                                                                     |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `normal` | Full coding assistant (used by Normal, Accept Edits, Smart, Bypass, and Autonomous modes) | All tools                                                                       |
| `plan`   | Structured planning workflow (used by Plan mode)                                          | Read-only tools (grep, glob, read, todo, ask\_user\_question, exit\_plan\_mode) |
| `ask`    | Question answering (used by the `/ask` command)                                           | Read-only tools (grep, glob, read, todo, ask\_user\_question)                   |
