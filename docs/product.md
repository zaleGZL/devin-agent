# Product contract

## Purpose

Devin Coding Agent is a native desktop client for a user's locally installed Devin CLI. It provides
workspace and session management, streaming conversation UI, runtime-negotiated controls, local file
context and previews, and an optional WeChat bridge while preserving Devin CLI as the only agent runtime.

## Ownership boundary

| Desktop owns | Devin CLI owns |
| --- | --- |
| Windows, navigation, presentation, local preferences, workspace shortcuts, and app-local session metadata | Agent reasoning, prompts, tools, terminal execution, permissions, sandboxing, and session transcripts |
| Typed IPC validation, file previews, local git status/diffs, mention indexing, and UI interaction collection | ACP capabilities, models, modes, commands, authentication methods, and execution outcomes |
| Discovery of a user-selected CLI binary and delegation of update requests | Authentication state and the implementation of `devin update` |
| WeChat connection state, durable bridge queues, and tray controls | Processing messages sent through the bridge in its configured Devin session |

The desktop may adapt Devin-owned data for presentation, but it must not invent, replace, or execute
Devin behavior.

## Product invariants

- The application works with a user-installed and authenticated Devin CLI; the installer does not
  bundle the CLI.
- ACP runtime responses are the authority for feature availability. Unsupported features remain absent
  or visibly unavailable rather than being simulated.
- Multiple UI sessions may share one runtime host, but Devin remains the transcript source of truth.
- The desktop does not impose a minimum window size; resizing remains subject only to the operating
  system and window manager.
- Local metadata such as pinning, order, archive state, and local title overrides is explicitly
  distinguished from server-confirmed session state.
- Security boundaries do not weaken for convenience: renderer isolation, path scoping, safe navigation,
  and fail-closed sandbox behavior are product requirements.
- Platform limitations must be stated in the public README and reflected in the UI when relevant.

## Non-goals

- Reimplementing Devin CLI, ACP execution, authentication, permission evaluation, sandboxing, Skills,
  Hooks, Rules, Plugins, MCP, or terminal tooling in Electron.
- Reading or migrating Devin credentials.
- Shipping or self-downloading a Devin CLI executable.
- Assuming an ACP feature exists because a model, prior release, or another client supports it.
- Silently falling back to an unsafe or semantically different path when a runtime capability is absent.

## Product change test

A feature belongs in the desktop only when it improves transport, presentation, local native integration,
or safe orchestration around an ACP-advertised Devin capability. If it performs agent work itself or creates
a second source of runtime truth, it is outside the product boundary.
