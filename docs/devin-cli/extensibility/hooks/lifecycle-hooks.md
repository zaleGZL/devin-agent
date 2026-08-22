> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Lifecycle Hooks

> Understanding hook events and the data available at each stage

Each hook event fires at a specific point in the agent's lifecycle. Use the **matcher** field (a regex matched against the hook event's `tool_name`) to filter which tool invocations trigger your hook.

In addition to the event-specific fields below, every stdin payload includes a stable per-session `session_id` and a per-turn `prompt_id` (rotated on every user prompt; absent for events that fire before the first user prompt, e.g. `SessionStart`) — see [Command Hooks](/cli/extensibility/hooks/overview#command-hooks).

***

## PreToolUse

Fires **before** a tool executes. Use this to block, modify, or add context to tool calls.

**Stdin data:**

| Field        | Description                   | Example                                         |
| ------------ | ----------------------------- | ----------------------------------------------- |
| `tool_name`  | Name of the tool being called | `exec`, `edit`, `mcp__github__create_issue`     |
| `tool_input` | Arguments passed to the tool  | `{ "command": "rm -rf /", "shell_id": "main" }` |

**Example — Block destructive commands:**

```json theme={null}
{
  "PreToolUse": [
    {
      "matcher": "exec",
      "hooks": [
        {
          "type": "command",
          "command": "python3 -c \"import sys, json; data = json.load(sys.stdin); cmd = data.get('tool_input', {}).get('command', ''); sys.exit(2 if 'rm -rf' in cmd else 0)\""
        }
      ]
    }
  ]
}
```

**Example — Require confirmation for writes outside src/:**

Use a script that inspects the tool input and returns a decision:

```json theme={null}
{
  "PreToolUse": [
    {
      "matcher": "edit",
      "hooks": [
        {
          "type": "command",
          "command": "./scripts/check-edit-path.sh",
          "timeout": 5
        }
      ]
    }
  ]
}
```

**Example — Rewrite commands before execution:**

A hook can transparently rewrite the tool's input by printing `hookSpecificOutput.updatedInput` to stdout (see [Output format](/cli/extensibility/hooks/overview#output-format)). For example, a hook script that routes shell commands through a wrapper:

```json theme={null}
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "rtk git status"
    }
  }
}
```

The rewritten arguments are merged into the tool call before it runs — the agent executes the updated command instead of the original.

***

## PostToolUse

Fires **after** a tool finishes executing. Use this for logging, validation, or triggering follow-up actions.

**Stdin data:**

| Field           | Description                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `tool_name`     | Name of the tool that ran                                                        |
| `tool_input`    | Arguments that were passed                                                       |
| `tool_response` | Object with `success` (boolean), `output` (string), and `error` (string or null) |

**Example — Log all shell commands:**

```json theme={null}
{
  "PostToolUse": [
    {
      "matcher": "exec",
      "hooks": [
        {
          "type": "command",
          "command": "sh -c 'cat >> ~/.devin-command-log'"
        }
      ]
    }
  ]
}
```

***

## PermissionRequest

Fires when the agent needs a permission decision. Use this to implement custom approval logic.

**Stdin data:**

| Field        | Description                 |
| ------------ | --------------------------- |
| `tool_name`  | Tool requesting permission  |
| `tool_input` | Arguments for the tool call |

**Example — Auto-approve git commands:**

```json theme={null}
{
  "PermissionRequest": [
    {
      "matcher": "exec",
      "hooks": [
        {
          "type": "command",
          "command": "python3 -c \"import sys, json; data = json.load(sys.stdin); cmd = data.get('tool_input', {}).get('command', ''); print(json.dumps({'decision': 'approve'})) if cmd.startswith('git ') else sys.exit(0)\""
        }
      ]
    }
  ]
}
```

***

## UserPromptSubmit

Fires when the user submits a message. Use this to add context or trigger workflows.

**Stdin data:**

| Field    | Description             |
| -------- | ----------------------- |
| `prompt` | The user's message text |

**Example — Inject context on every prompt:**

```json theme={null}
{
  "UserPromptSubmit": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "echo '{\"hookSpecificOutput\": {\"hookEventName\": \"UserPromptSubmit\", \"additionalContext\": \"Deploys require an approved change ticket.\"}}'"
        }
      ]
    }
  ]
}
```

The command prints `additionalContext` inside a `hookSpecificOutput` object on stdout, tagged with the event name. That text is injected into the agent's context:

```json theme={null}
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Deploys require an approved change ticket."
  }
}
```

***

## Stop

Fires when the agent decides to stop (finish its turn). Use this to add follow-up instructions or prevent premature stopping.

**Stdin data:**

| Field              | Description                           |
| ------------------ | ------------------------------------- |
| `stop_hook_active` | Whether a stop hook is already active |

**Example — Remind agent to run tests:**

```json theme={null}
{
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "echo '{\"decision\": \"block\", \"reason\": \"Please run the test suite before stopping.\"}'"
        }
      ]
    }
  ]
}
```

<Warning>
  Be careful with stop hooks that block — they can cause the agent to loop if the condition isn't eventually satisfied.
</Warning>

***

## PostCompaction

Fires **after** context compaction completes successfully. Use this for logging, triggering follow-up actions, or re-injecting context that may have been lost during compaction.

**Stdin data:**

| Field     | Description                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| `summary` | Summary text produced by the compactor (may be null if no summary was generated) |

**Example — Log compaction events:**

```json theme={null}
{
  "PostCompaction": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "sh -c 'cat >> ~/.devin-compaction-log'"
        }
      ]
    }
  ]
}
```

***

## SessionStart

Fires when a new session begins. Use this for initialization, logging, or environment setup.

**Stdin data:**

| Field    | Description                 |
| -------- | --------------------------- |
| `source` | How the session was started |

**Example — Run setup script:**

```json theme={null}
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "./scripts/dev-setup.sh",
          "timeout": 10
        }
      ]
    }
  ]
}
```

A SessionStart command can also inject context by printing `additionalContext` inside a `hookSpecificOutput` object on stdout:

```json theme={null}
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Session started. Project uses ESM imports only."
  }
}
```

***

## SessionEnd

Fires when a session ends. Use this for cleanup or final logging.

**Stdin data:**

| Field    | Description           |
| -------- | --------------------- |
| `reason` | Why the session ended |

***

## Matching Multiple Events

A single hooks file can define hooks for multiple events:

```json theme={null}
{
  "PreToolUse": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "./scripts/audit.sh" }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "./scripts/audit.sh" }
      ]
    }
  ]
}
```

## Using the Matcher

The `matcher` field is a **regex** matched against the hook event's `tool_name`. It is available for tool-related events: `PreToolUse`, `PostToolUse`, and `PermissionRequest`.

For non-tool events (`UserPromptSubmit`, `Stop`, `PostCompaction`, `SessionStart`, and `SessionEnd`), there is no `tool_name`; use `""` or omit the matcher to run the hook for every event of that type.

<Note>
  The matcher is not a permission glob. Patterns like `mcp__github__*` are useful in permissions, but hook matchers are regexes. Use `mcp__github__.*` in a hook matcher.
</Note>

| Matcher                         | Matches                                              |
| ------------------------------- | ---------------------------------------------------- |
| `""` (empty) or omitted         | All tool names for tool events                       |
| `"exec"`                        | Tool names containing `exec`                         |
| `"^exec$"`                      | Only the `exec` tool                                 |
| `"^(exec\|edit)$"`              | Only `exec` or `edit`                                |
| `"^mcp__.*"`                    | All MCP tools                                        |
| `"^mcp__github__.*"`            | All tools from the `github` MCP server               |
| `"^mcp__github__create_issue$"` | The `create_issue` tool from the `github` MCP server |

### Tool names you can match

Hook matchers run against the same externally-visible tool names that hook scripts receive in stdin as `tool_name`. The exact tool names available can vary by CLI mode, model, and enabled integrations.

The core tool names, by category:

| Category           | Tool names                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| File operations    | `read`, `write`, `edit`, `apply_patch`, `notebook_read`, `notebook_edit`   |
| Search             | `grep`, `glob`                                                             |
| Shell              | `exec`, `get_output`, `write_to_process`, `kill_shell`                     |
| Web                | `webfetch`                                                                 |
| Planning and tasks | `todo_write`, `exit_plan_mode`                                             |
| Skills             | `skill`                                                                    |
| Subagents          | `run_subagent`, `read_subagent`                                            |
| Permissions        | `request_scope`                                                            |
| MCP management     | `mcp_list_servers`, `mcp_list_tools`, `mcp_call_tool`, `mcp_read_resource` |

MCP server tools appear as `mcp__<server>__<tool>`. For example, a `github` MCP server tool named `create_issue` appears as `mcp__github__create_issue`.

For other tools, match the exact `tool_name` shown in hook stdin. To confirm the complete set available in your current session, add a temporary `PostToolUse` hook with `matcher: ""` and log the stdin payload.
