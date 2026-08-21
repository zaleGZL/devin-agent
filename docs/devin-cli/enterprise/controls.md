> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Controls

> Devin CLI is a local agent like Cascade, but does not yet implement all of the same features and controls.

Devin CLI is a local agent that runs on your machine with access to your local files, tools, and environment — similar to Cascade in Devin Desktop. It shares the same agent harness as the [Devin Local agent](/desktop/devin-local).

Because it is a newer agent, Devin CLI does not yet implement all of the same features and controls as Cascade. Many of Cascade's controls are replaced by more flexible mechanisms — for example, [permissions](/cli/reference/permissions), [hooks](/cli/extensibility/hooks/overview), and [team settings](/cli/enterprise/team-settings).

## Limitations

The gap runs both ways: [plugins](/cli/extensibility/plugins/overview) and [subagents](/cli/subagents) have no Cascade equivalent at all, and recent releases brought [plan mode](/desktop/devin-local#plan-mode) and [merging worktree sessions](/desktop/devin-local#worktree-sessions) to parity with Cascade. The list below covers the Cascade features this agent does not have yet.

The following features are not currently supported with the Devin Local agent:

* **Memories** — The Devin Local agent does not persist memories between sessions. Migrate your critical memories to [skills](/desktop/cascade/skills) with the **Devin: Open Cascade Migration Wizard** command.
* **Workflows** — Workflows are not available with the Devin Local agent. Migrate your workflows to [skills](/desktop/cascade/skills) with the **Devin: Open Cascade Migration Wizard** command.
* **Code Lenses** - Currently [code lenses](/desktop/command/windsurf-related-features) do not yet trigger the Devin Local agent.
* **App Deploys** - The Devin Local agent does not support app deploys.
* **Conversation Sharing** - Conversation sharing is not yet available with the Devin Local agent.
* **Arena Mode** - [Arena mode](/desktop/cascade/arena) is not available with the Devin Local agent.

The Devin Local agent does support [rules and AGENTS.md files](https://cli.devin.ai/docs/extensibility/rules) as well as [skills](https://cli.devin.ai/docs/extensibility/skills/overview) for providing persistent context and reusable workflows.

### Analytics

Devin Local activity is reported in the [`cascade_runs`](/desktop/accounts/api-reference/cascade-analytics) data source (model usage, messages sent, and credit consumption), the [`cascade_tool_usage`](/desktop/accounts/api-reference/cascade-analytics) data source (per-tool call counts such as Code Edit, Run Command, Search Web, and MCP Tool), the [`cascade_lines`](/desktop/accounts/api-reference/cascade-analytics) data source (daily lines of code written by the agent), and the [Cascade Data source](/desktop/accounts/analytics-api#cascade-data) of the Custom Analytics API.

Unlike Cascade, Devin Local does not track specific suggested lines or "modes" when operating: an edit only runs after you approve it, so accepted lines equal suggested lines, and the `mode` field in `cascade_runs` is not populated.

The Devin CLI does not report analytics for [hybrid deployments](https://devin.ai/blog/self-hosted-deployment-maintenance-mode).

### Enterprise controls

Enterprise admins can configure the Devin Local agent through [team settings](https://windsurf.com/team/settings), including [new controls only available with the Devin Local agent](https://cli.devin.ai/docs/enterprise/team-settings):

* **Sandbox enforcement** - Require sandbox mode for all users and configure organization-wide domain filtering rules
* **Granular permissions** - Control which actions the agent can take with more fine-grained permissions
* **Network enforcement** - Control network access with allowed and denied domains

Additionally, the "Enable Cascade" control can be used to disable the legacy Cascade agent entirely to ensure your team follows the new controls available with Devin CLI.

#### Unsupported enterprise controls

The following legacy enterprise controls are not available with the Devin Local agent:

* **Restrict Tool Calls to Workspace** - by default, the Devin Local agent can only read/edit files within the workspace.
  Custom [permissions](https://cli.devin.ai/docs/reference/permissions) are a more flexible replacement that can be used to replicate the same rules.
* **App Deploys** - App deploys are not yet supported with the Devin Local agent.
* **Conversation Sharing** - Conversation sharing is not yet supported with the Devin Local agent.
* **Global tool calling disabled** - If you previously disabled tool calling entirely, write an equivalent [permission policy](https://cli.devin.ai/docs/reference/permissions) for Devin CLI instead.

The following legacy controls will still be enforced as a fallback if you haven't yet implemented an enterprise CLI permission config:

* **Auto Run Terminal Commands** - The Devin Local agent uses its own [permissions model](https://cli.devin.ai/docs/reference/permissions) instead of auto-execution levels; we recommend using this instead, but the old control will still be enforced as a fallback.
* **Terminal allow lists** - Implement an equivalent [permission policy](https://cli.devin.ai/docs/reference/permissions) for Devin CLI to allow specific terminal commands.
* **Terminal deny lists** - Implement an equivalent [permission policy](https://cli.devin.ai/docs/reference/permissions) for Devin CLI to deny specific terminal commands.

## Further reading

* [Team settings](/cli/enterprise/team-settings)
* [System configuration](/cli/enterprise/system-config)
* [Permissions](/cli/reference/permissions)
* [Hooks](/cli/extensibility/hooks/overview)
* [Devin Local agent](/desktop/devin-local)
