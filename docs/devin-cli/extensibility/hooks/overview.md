> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Hooks

> Run custom logic when specific events occur during a session

Hooks let you run custom logic in response to events in the agent's lifecycle. You can use hooks to enforce policies, add context, log actions, modify permissions, or integrate with external systems.

Hooks are configured with a JSON format. Place them in your project's `.devin/` directory (or a user-level config) and Devin CLI runs them at the matching lifecycle events. Existing hooks in `.claude/` directories are also picked up automatically — see [Where Hooks Live](#where-hooks-live).

***

## What Can Hooks Do?

<CardGroup cols={2}>
  <Card title="Enforce policies" icon="shield">
    Block dangerous commands, require confirmation for specific actions, or restrict file access.
  </Card>

  <Card title="Add context" icon="message">
    Inject additional instructions or information when specific tools are called.
  </Card>

  <Card title="Run side effects" icon="bolt">
    Execute scripts, send notifications, or log events when things happen.
  </Card>

  <Card title="Modify permissions" icon="lock">
    Dynamically grant or restrict permissions based on the situation.
  </Card>
</CardGroup>

***

## Quick Example

Create `.devin/hooks.v1.json` in your project:

```json theme={null}
{
  "PreToolUse": [
    {
      "matcher": "exec",
      "hooks": [
        {
          "type": "command",
          "command": "./scripts/check-command.sh"
        }
      ]
    }
  ]
}
```

This runs `./scripts/check-command.sh` before every shell command execution. The script receives event data on stdin and can block the action by returning a non-zero exit code.

***

## Hook Events

Hooks can respond to these lifecycle events:

| Event               | When it fires                                   |
| ------------------- | ----------------------------------------------- |
| `PreToolUse`        | Before a tool executes                          |
| `PostToolUse`       | After a tool finishes                           |
| `PermissionRequest` | When a permission decision is needed            |
| `UserPromptSubmit`  | When the user submits a message                 |
| `Stop`              | When the agent wants to stop                    |
| `PostCompaction`    | After context compaction completes successfully |
| `SessionStart`      | When a session begins                           |
| `SessionEnd`        | When a session ends                             |

See [Lifecycle Hooks](/cli/extensibility/hooks/lifecycle-hooks) for details on each event and its available data.

***

## Hook Format

Each hook has a **type** (`command` or `prompt`), an optional **matcher** (regex on the hook event's `tool_name`), and configuration:

```json theme={null}
{
  "PreToolUse": [
    {
      "matcher": "exec",
      "hooks": [
        {
          "type": "command",
          "command": "./scripts/validate.sh",
          "timeout": 10
        }
      ]
    }
  ]
}
```

| Field     | Description                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `matcher` | Regex matched against the hook event's `tool_name`. Empty string or an omitted matcher matches all tool names. |
| `type`    | `"command"` to run a shell command, or `"prompt"` to evaluate an LLM prompt.                                   |
| `command` | Shell command to run (for `command` type).                                                                     |
| `prompt`  | LLM prompt to evaluate (for `prompt` type).                                                                    |
| `timeout` | Timeout in seconds (optional).                                                                                 |

### Command Hooks

Command hooks run a shell command. Event data is passed as JSON on **stdin**, and the command can return JSON on **stdout** to control the outcome (see [Output format](#output-format) below).

**Input** (stdin):

```json theme={null}
{
  "hook_event_name": "PreToolUse",
  "tool_name": "exec",
  "tool_input": {
    "command": "rm -rf /"
  },
  "session_id": "3f8d1c2a-...",
  "prompt_id": "b71e9d40-..."
}
```

Every event payload also carries two correlation ids alongside the event fields:

| Field        | Description                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_id` | Stable id for the agent session. Use it to correlate hook invocations across a whole session.                                                                                          |
| `prompt_id`  | Per-turn id, rotated on every user prompt. All hooks fired during the same turn share one `prompt_id`. Absent for events that fire before the first user prompt (e.g. `SessionStart`). |

The `DEVIN_PROJECT_DIR` environment variable is automatically set to the project root directory.

See [Using the Matcher](/cli/extensibility/hooks/lifecycle-hooks#using-the-matcher) for the built-in tool names and MCP tool name format you can match.

### Output format

A command hook can print a JSON object to **stdout** to control the outcome.

To approve or block an action, return a top-level `decision` (with an optional `reason`):

```json theme={null}
{
  "decision": "block",
  "reason": "Destructive command blocked by policy"
}
```

To inject text into the agent's context, return `additionalContext` inside a `hookSpecificOutput` object tagged with the event name:

```json theme={null}
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Remember: deploys require an approved change ticket."
  }
}
```

To transparently rewrite a tool's input before it executes, return `updatedInput` inside a `PreToolUse` `hookSpecificOutput`. Fields in `updatedInput` are merged into the tool's arguments, so you can update a subset (e.g. just `command`):

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

| Output field                           | Description                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `decision`                             | `"approve"` to allow the action, or `"block"` to deny it                                           |
| `reason`                               | Explanation shown to the agent                                                                     |
| `hookSpecificOutput.hookEventName`     | Event the output applies to (e.g. `UserPromptSubmit`, `SessionStart`, `PreToolUse`, `PostToolUse`) |
| `hookSpecificOutput.additionalContext` | Text injected into the agent's context (for `UserPromptSubmit`, `SessionStart`, `PostToolUse`)     |
| `hookSpecificOutput.updatedInput`      | Object merged into the tool's arguments before execution (for `PreToolUse`)                        |

### Exit Codes

| Code  | Meaning                           |
| ----- | --------------------------------- |
| 0     | Success — hook continues normally |
| 2     | Block — action is denied          |
| Other | Error — logged but doesn't block  |

***

## Where Hooks Live

Devin CLI reads hooks from the following locations. All use the same JSON format. Project-level hook files are discovered in the working directory and its ancestor directories up to the repository root, matching how skills and rules are loaded.

### Project-Level

| Location                      | Description                                |
| ----------------------------- | ------------------------------------------ |
| `.devin/hooks.v1.json`        | Standalone hooks file (recommended)        |
| `.devin/config.json`          | `"hooks"` key in the config file           |
| `.devin/config.local.json`    | `"hooks"` key (local override, gitignored) |
| `.claude/settings.json`       | `"hooks"` key (Claude Code format)         |
| `.claude/settings.local.json` | `"hooks"` key (Claude Code format)         |

### User-Level (Global)

| Location                                                                 | Description                        |
| ------------------------------------------------------------------------ | ---------------------------------- |
| `~/.config/devin/config.json` (`%APPDATA%\devin\config.json` on Windows) | `"hooks"` key in user config       |
| `~/.claude.json`                                                         | `"hooks"` key (Claude Code format) |
| `~/.claude/settings.json`                                                | `"hooks"` key (Claude Code format) |
| `~/.claude/settings.local.json`                                          | `"hooks"` key (Claude Code format) |

<Note>
  In `.devin/hooks.v1.json`, the hooks object is the **entire file** (no wrapper key needed). In all other locations, hooks are nested under the `"hooks"` key in a settings file.
</Note>

<Note>
  Hooks from `.claude/` paths are loaded when `read_config_from.claude` is enabled (the default). You can disable this in your [user config](/cli/reference/configuration/read-config-from) if needed.
</Note>

***

## Verifying Hooks

Use the `/hooks` slash command to see all currently loaded hooks and their source files:

```
/hooks
```

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Lifecycle Hooks" icon="rotate" href="/cli/extensibility/hooks/lifecycle-hooks">
    Deep dive into each event type and what data is available.
  </Card>

  <Card title="Configuration" icon="gear" href="/cli/reference/configuration/read-config-from">
    Control which config locations Devin CLI reads hooks from.
  </Card>
</CardGroup>
