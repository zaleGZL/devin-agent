> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# MCP Overview

> Extend Devin CLI with external tool servers using the Model Context Protocol

MCP (Model Context Protocol) lets you connect external tool servers to Devin CLI, giving the agent access to APIs, databases, issue trackers, and any other service you can wrap in an MCP server.

When you configure an MCP server, its tools become available to the agent just like built-in tools. The agent can discover what tools are available and call them as needed.

***

## How It Works

<Steps>
  <Step title="Configure a server">
    You define an MCP server in your config file with a command, arguments, and optional environment variables.
  </Step>

  <Step title="Server launches">
    Devin CLI starts the server process when needed. The server connects to the external API (GitHub, Linear, etc.).
  </Step>

  <Step title="Tool discovery">
    The agent discovers what tools the server provides (e.g., `create_issue`, `list_repos`).
  </Step>

  <Step title="Tool execution">
    When the agent calls an MCP tool, the request flows through the server to the external service and the result is returned.
  </Step>
</Steps>

***

## Quick Example

Add a GitHub MCP server to your project:

```json theme={null}
// .devin/mcp_config.local.json  (gitignored — keep tokens out of committed config)
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Now the agent can create issues, read PRs, search repos, and more — all through natural language.

***

## Permission Control

Once configured, MCP tools appear with a namespaced format: `mcp__<server>__<tool>`. For example, a "github" server with a "create\_issue" tool becomes `mcp__github__create_issue`.

MCP tools are subject to the same permission system as built-in tools. You can control access at multiple levels:

```json theme={null}
{
  "permissions": {
    "allow": [
      "mcp__github__*"
    ],
    "deny": [
      "mcp__github__delete_repo"
    ]
  }
}
```

See [Permissions](/cli/reference/permissions) for the full permission syntax.

***

## Prompts as Slash Commands

Beyond tools, an MCP server can publish **prompts** — reusable, parameterized instructions declared through the MCP `prompts` capability. Devin CLI exposes each one as a slash command:

```
/mcp__<server>__<prompt> [arguments]
```

For example, a `linear` server that publishes a `bug_report` prompt becomes `/mcp__linear__bug_report`. Prompt commands are listed in the command palette under their own **MCP** category, described with the title or description the server publishes, and annotated with an argument hint built from the prompt's declared parameters — `<name>` for required arguments and `[name]` for optional ones.

When you send the command, Devin CLI fetches the prompt from the server and substitutes the messages it returns as your message for that turn.

### How arguments map

Whatever you type after the command name is mapped **positionally** onto the prompt's declared arguments — first word to the first argument, second word to the second, and so on. The last declared argument receives all of the remaining text, so free-form trailing input survives intact:

```
/mcp__linear__bug_report ENG-1234 login page hangs after the SSO redirect
```

Here `ENG-1234` fills the first declared argument and the rest of the line fills the last one. If the prompt declares no arguments at all, anything you type is appended to the expanded prompt rather than dropped.

<Note>
  Only servers that have already connected contribute advertised commands (connections are warmed in the background at startup), but invocation resolves lazily — typing `/mcp__<server>__<prompt>` works even when the command was never advertised, connecting to the server on demand.
</Note>

<Tip>
  Prompt expansion happens in the agent rather than in the terminal UI, so the same commands are advertised over ACP — editor integrations such as [Zed](/cli/acp/zed) and [JetBrains](/cli/acp/jetbrains) list them alongside built-in commands.
</Tip>

***

## Authentication

Some remote MCP servers (such as Atlassian, Notion, and Linear) require OAuth authentication. Each MCP client authenticates independently — tokens from Windsurf or Claude Code are **not** shared with Devin CLI.

After adding a remote server, authenticate with:

```bash theme={null}
devin mcp login <server-name>
```

This opens a browser window for the OAuth flow. If stored credentials later expire or are revoked, the server reports an auth-required state and you re-authenticate with `devin mcp logout` followed by `devin mcp login` — see [MCP Configuration — Authentication](/cli/extensibility/mcp/configuration#authentication) and [Re-authenticating](/cli/extensibility/mcp/configuration#re-authenticating) for details.

***

## Disabling Servers

You can temporarily disable an MCP server without removing its configuration or credentials:

```bash theme={null}
devin mcp disable <server-name>
devin mcp enable <server-name>
```

See [MCP Configuration — Enabling and disabling servers](/cli/extensibility/mcp/configuration#enabling-and-disabling-servers) for details.

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Configuration" icon="gear" href="/cli/extensibility/mcp/configuration">
    Learn how to configure MCP servers in detail
  </Card>

  <Card title="Permissions" icon="shield" href="/cli/reference/permissions">
    Control which MCP tools the agent can use
  </Card>
</CardGroup>
