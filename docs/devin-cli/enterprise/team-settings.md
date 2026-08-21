> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Team Settings

> Configure team-wide settings to control your users' Devin CLI usage

## Overview

Team-wide settings allow enterprise admins to control Devin CLI usage across their organization.

* **Devin Enterprise admins** can manage these settings in the customer-facing Devin dashboard under **Settings → Enterprise → Windsurf** (`app.devin.ai/org/{orgName}/settings/windsurf`). This is self-service for admins with access to enterprise settings.
* **Windsurf Enterprise admins** can manage these settings in the Windsurf dashboard at [https://windsurf.com/team/cli-settings](https://windsurf.com/team/cli-settings).

<Warning>
  Only the Devin CLI-specific settings on these pages apply to Devin CLI. General [Windsurf Team Settings](https://windsurf.com/team/settings) apply to Windsurf and do not necessarily apply to Devin CLI unless also listed on the Devin CLI settings page.
</Warning>

## Available Settings

### Models

Control which models your users can access through Devin CLI. You can:

* **Allowlist specific models** — Restrict users to a curated list of approved models
* **Allow all models** — Give users access to all available models

Click **Configure** to manage model access for each category.

#### Default model

You can also pin a **team-wide default model** that Devin CLI will use for new sessions. This is the same setting Windsurf uses for its default model, so configuring it once applies to both surfaces.

* If no team default is set, Devin CLI uses its built-in default model.
* If the pinned default is not present in the **allowed models** list above, Devin CLI falls back to the built-in default — the allowlist always takes precedence.
* Individual users can still switch models during a session; this setting only controls the starting model for new sessions.

Enterprise admins can configure the default model from the [Windsurf Team Settings](https://windsurf.com/team/settings) page, the [Devin CLI Settings](https://windsurf.com/team/cli-settings) page, or the customer-facing Devin Enterprise settings page at `app.devin.ai/org/{orgName}/settings/windsurf`.

### Enable Web Search

Allow the Devin CLI agent to perform web searches on the open Internet. This does not affect the agent's ability to read specific URLs, which is performed locally on the user's machine. This tool is **disabled by default** for enterprise teams.

### MCP Servers

Control whether your users can use MCP (Model Context Protocol) tools.

* **Toggle on/off** — Enable or disable MCP server usage entirely
* **Allowlisted MCP Servers** — Specify which MCP servers users are allowed to connect to. If no servers are added, all servers are allowlisted by default. Click **Add Server** to restrict access to specific servers.

The recommended way to manage approved servers is through an [MCP registry](#mcp-registry) rather than the explicit allowlist.

### MCP Registry

You can use the [official MCP registry](https://modelcontextprotocol.io/registry/about), a downstream registry built on it, or your own registry.

Configure registries in team settings:

* **MCP registry URLs** — Add one or more registry URLs. With multiple registries, a server is allowed if it appears in any of them (the union of all registries).
* **MCP registry enforcement** (toggle) — Choose whether to strictly enforce your registries. When on, users can only connect to servers from your registries; when off, they can also connect to other servers, including custom ones.

### Terminal Permissions

Configure team-enforced permission rules for Devin CLI usage. These rules have the **highest precedence** and cannot be overridden by individual users' local or project configurations.

Click **Configure** to open the permissions editor. The configuration requires a JSON object with three fields:

```json theme={null}
{
  "deny": [
    "exec"
  ],
  "ask": [],
  "allow": [
    "Read(~/my-repository/**)"
  ]
}
```

* **`deny`** — Actions that are blocked entirely (takes highest priority)
* **`ask`** — Actions that always prompt the user for approval
* **`allow`** — Actions that are automatically approved without prompting

Permissions can be **scope-based** or **tool-based**:

| Type              | Format         | Example                         |
| ----------------- | -------------- | ------------------------------- |
| File read         | `Read(/path)`  | `Read(~/sensitive/**)`          |
| File write        | `Write(/path)` | `Write(.env*)`                  |
| Command execution | `Exec(cmd)`    | `Exec(rm)`, `Exec(sudo)`        |
| HTTP fetch        | `Fetch(url)`   | `Fetch(https://internal.api/*)` |
| Tool-based        | Tool name      | `read`, `edit`, `exec`          |

<Tip>
  Use team-enforced deny rules to prevent actions across your entire organization, such as blocking access to sensitive directories or dangerous commands like `rm -rf` or `sudo`.
</Tip>

For detailed information on permission syntax, glob patterns, and configuration examples, see the [Permissions documentation](/cli/reference/permissions).

### Sandbox Enforcement

Control sandbox behavior for your organization: **Enforcement mode** (whether `--sandbox` is **Optional** or **Required** for all CLI sessions), **Domain allowlist** and **Domain denylist** (organization-wide network filtering), and **Excluded allow** / **Excluded ask** / **Excluded deny** (rules for commands that may — or must never — run outside the sandbox). See the [Sandbox documentation](/cli/sandbox) for how the sandbox works, how these settings interact with user-level configuration, and examples.

Enforcement mode is re-read at the start of every prompt, not just at startup. If you switch it to **Required** while a user is in a session that was started without the sandbox, that session refuses further prompts and tells the user to restart — the sandbox is then enabled automatically at startup. Sessions already running with the sandbox are unaffected.

### Attribution Filtering

When attribution filtering is enabled for your team, code generated by Devin CLI is checked against a corpus of publicly available code: file edits that match public code are automatically reverted, and matching code blocks in chat responses are flagged while the agent is instructed to rewrite them. The setting applies to all Devin CLI users on the team.

This setting is available on **Enterprise plans** and has no self-serve toggle; to enable it, reach out to [support@cognition.ai](mailto:support@cognition.ai) or your Cognition account team. Attribution filtering is also available for Devin cloud sessions — see [Attribution Filtering](/enterprise/features/attribution-filtering).

### Show "Install Devin CLI" in the Devin Desktop Command Palette

Devin CLI is bundled with Devin Desktop but requires explicit activation by an admin. Toggle this setting **on** to allow your users to install Devin CLI directly from the Devin Desktop Command Palette.

Once enabled, users can open the Command Palette (<code>Cmd+Shift+P</code> on macOS or <code>Ctrl+Shift+P</code> on Windows/Linux) and run **Install Devin CLI** to add the `devin` binary to their PATH.

<Note>
  This setting is available on **Legacy Windsurf Enterprise** and **Devin Enterprise** plans and is **off by default**.
</Note>

## Further Reading

To understand how to configure Devin CLI further, see the [Configuration documentation](/cli/reference/configuration/config-file).

Settings on this page are applied server-side once a user signs in. To enforce device-level policy that applies before or during login — pinning the enterprise host or account, or forcing an outbound proxy — see the [system configuration file](/cli/enterprise/system-config).
