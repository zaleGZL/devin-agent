> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# MCP Configuration

> How to add, configure, and manage MCP servers

## Adding MCP Servers

### Via Command Line

The quickest way to add an MCP server:

```bash theme={null}
# stdio server — just pass the command after --
devin mcp add <name> -- <command> [args...]

# HTTP server — pass the URL as a positional argument
devin mcp add <name> <URL>

# HTTP server — or use the --url flag
devin mcp add <name> --url <URL>
```

The transport type is inferred automatically: a URL implies HTTP (Streamable HTTP), and trailing args (or `--command`) imply stdio.

<Note>Remote MCP servers use Streamable HTTP by default. If the server responds with an HTTP 4xx error, the CLI falls back to SSE on the same URL. Set `"transport": "sse"` explicitly if needed — see [Legacy SSE fallback](#legacy-sse-fallback) below.</Note>

By default, servers are saved to **local** scope (`.devin/mcp_config.local.json`, gitignored). Use `-s`/`--scope` to change:

```bash theme={null}
devin mcp add -s project <name> <URL>   # shared via .devin/mcp_config.json
devin mcp add -s user <name> <URL>      # global (~/.config/devin/mcp_config.json; %APPDATA%\devin\mcp_config.json on Windows)
```

You can also manage servers from the command line:

```bash theme={null}
devin mcp list              # List all configured servers
devin mcp get <name>        # Show details for a specific server
devin mcp remove <name>     # Remove a configured server
devin mcp login <name>      # Authenticate with a server via OAuth
devin mcp logout <name>     # Remove stored OAuth credentials
devin mcp enable <name>     # Enable a disabled server
devin mcp disable <name>    # Disable a server without removing it
```

### Via Config File

Add servers directly to your MCP config file's `mcpServers` section:

<Note>
  **The MCP config file location changed in v3000.3 (the Local 3.6 release).** Older versions (before v3000.3) store MCP servers in the `mcpServers` key of the main config files (`~/.config/devin/config.json`, `.devin/config.json`, `.devin/config.local.json`). Newer versions store them in dedicated files at the same locations: `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), `.devin/mcp_config.json`, and `.devin/mcp_config.local.json`. Any `mcpServers` entries found in the main config files are migrated to the dedicated files automatically on startup.
</Note>

<Tabs>
  <Tab title="Project config">
    ```json theme={null}
    // .devin/mcp_config.json
    {
      "mcpServers": {
        "server-name": {
          "command": "npx",
          "args": ["-y", "@company/mcp-server"],
          "env": {
            "API_KEY": "your-key"
          }
        }
      }
    }
    ```

    <Note>Project-level servers are shared with your team via version control.</Note>
  </Tab>

  <Tab title="User config">
    ```json theme={null}
    // ~/.config/devin/mcp_config.json
    {
      "mcpServers": {
        "my-server": {
          "command": "node",
          "args": ["/path/to/my-server.js"],
          "env": {}
        }
      }
    }
    ```

    <Note>User-level servers apply to all your projects.</Note>
  </Tab>

  <Tab title="Local override">
    ```json theme={null}
    // .devin/mcp_config.local.json
    {
      "mcpServers": {
        "server-name": {
          "command": "npx",
          "args": ["-y", "@company/mcp-server"],
          "env": {
            "API_KEY": "my-personal-key"
          }
        }
      }
    }
    ```

    <Note>Local configs are gitignored — use these for personal API keys.</Note>
  </Tab>
</Tabs>

***

## Server Configuration Options

MCP servers can be configured in two ways: as a **local command** (stdio transport) or as a **remote server** (HTTP transport).

### Local Command (stdio)

| Field      | Type      | Required | Description                                                                                               |
| ---------- | --------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `command`  | string    | Yes      | The executable to run                                                                                     |
| `args`     | string\[] | No       | Command-line arguments                                                                                    |
| `env`      | object    | No       | Environment variables to set                                                                              |
| `disabled` | boolean   | No       | Set to `true` to skip this server (see [Enabling and disabling servers](#enabling-and-disabling-servers)) |

### Remote Server (Streamable HTTP)

| Field               | Type    | Required | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`               | string  | Yes      | The URL of the MCP server endpoint                                                                                                                                                                                                                                                                                                                                                             |
| `transport`         | string  | No       | `"http"` (Streamable HTTP, default for URL-based servers) or `"sse"` (legacy SSE). When set to `"http"` or omitted, the CLI tries Streamable HTTP first and falls back to SSE on 4xx errors ([per spec](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/#backwards-compatibility)). Set `"sse"` explicitly if the server's SSE endpoint is at a different path. |
| `headers`           | object  | No       | Custom HTTP headers to include in requests                                                                                                                                                                                                                                                                                                                                                     |
| `oauthClientId`     | string  | No       | Pre-registered OAuth client ID, for servers that don't support dynamic client registration (DCR), e.g. GitHub. See the "Pre-registered OAuth clients" section below.                                                                                                                                                                                                                           |
| `oauthClientSecret` | string  | No       | OAuth client secret, for confidential clients. Pair with `oauthClientId`.                                                                                                                                                                                                                                                                                                                      |
| `oauthResource`     | string  | No       | Override the RFC 8707 `resource` parameter sent in OAuth requests (default: the MCP server URL). Set to an empty string (`""`) to omit the parameter entirely, for providers that reject it. See [OAuth resource override](#oauth-resource-override).                                                                                                                                          |
| `disabled`          | boolean | No       | Set to `true` to skip this server (see [Enabling and disabling servers](#enabling-and-disabling-servers))                                                                                                                                                                                                                                                                                      |

### Examples

<AccordionGroup>
  <Accordion title="GitHub (stdio)">
    ```json theme={null}
    {
      "mcpServers": {
        "github": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "ghp_..."
          }
        }
      }
    }
    ```
  </Accordion>

  <Accordion title="Notion (HTTP with OAuth)">
    ```json theme={null}
    {
      "mcpServers": {
        "notion": {
          "url": "https://mcp.notion.com/mcp",
          "transport": "http"
        }
      }
    }
    ```

    <Note>After adding an OAuth-based server, run `devin mcp login notion` to authenticate. See [Authentication](#authentication) below.</Note>
  </Accordion>

  <Accordion title="Linear (HTTP with OAuth)">
    ```json theme={null}
    {
      "mcpServers": {
        "linear": {
          "url": "https://mcp.linear.app/mcp",
          "transport": "http"
        }
      }
    }
    ```
  </Accordion>

  <Accordion title="Atlassian / Jira (HTTP with OAuth)">
    ```json theme={null}
    {
      "mcpServers": {
        "atlassian": {
          "url": "https://mcp.atlassian.com/v1/mcp",
          "transport": "http"
        }
      }
    }
    ```

    <Note>After adding, run `devin mcp login atlassian` to authenticate. Each MCP client (Windsurf, Claude Code, Devin CLI) maintains its own OAuth session, so you must log in separately even if you've already authenticated in another tool.</Note>
  </Accordion>

  <Accordion title="Custom server (stdio)">
    ```json theme={null}
    {
      "mcpServers": {
        "my-tools": {
          "command": "python",
          "args": ["./scripts/mcp-server.py"],
          "env": {
            "DB_URL": "postgres://localhost/mydb"
          }
        }
      }
    }
    ```
  </Accordion>
</AccordionGroup>

***

## Authentication

Some remote MCP servers require OAuth authentication. After adding an OAuth-based server to your config, authenticate using the `login` command:

```bash theme={null}
devin mcp login <server-name>
```

For example:

```bash theme={null}
devin mcp login notion    # Authenticate with Notion
devin mcp login linear    # Authenticate with Linear
```

This opens a browser window where you can authorize access. The OAuth tokens are stored locally and refreshed automatically.

You can optionally request specific OAuth scopes:

```bash theme={null}
devin mcp login notion --scopes read,write
```

To remove stored OAuth credentials for a server:

```bash theme={null}
devin mcp logout <server-name>
```

<Note>
  If the server supports OAuth, you will also be prompted to authenticate automatically when the server is first used.
</Note>

### Re-authenticating

Stored OAuth credentials don't last forever — they expire, and an administrator can revoke them on the provider side. When that happens the server reports an **auth-required** state instead of connecting, and its tools (and [prompts](/cli/extensibility/mcp/overview#prompts-as-slash-commands)) stop being available until you sign in again.

To re-authenticate, clear the stored credentials and run the browser flow again:

```bash theme={null}
devin mcp logout <server-name>
devin mcp login <server-name>
```

`logout` deletes the persisted tokens for that server; `login` re-runs the OAuth flow and stores fresh ones. Do the same after changing `oauthClientId`, `oauthClientSecret`, or `oauthResource` — credentials issued under the old settings are not reused.

<Note>
  Editor integrations that drive Devin CLI over ACP surface the same auth-required state, with a re-authenticate action that clears the stored credentials and reopens the browser flow — equivalent to the `logout` + `login` pair above.
</Note>

### Pre-registered OAuth clients

Most OAuth-based MCP servers support [dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591) (DCR), so Devin CLI registers itself automatically and you don't need to provide any client credentials.

Some providers (e.g. GitHub) don't support DCR and instead require a **pre-registered** OAuth client. For those, supply the client ID — and a client secret if it's a confidential client — via `oauthClientId` / `oauthClientSecret`:

```json theme={null}
{
  "mcpServers": {
    "my-server": {
      "url": "https://mcp.example.com/mcp",
      "transport": "http",
      "oauthClientId": "Iv1.abc123def456",
      "oauthClientSecret": "${env:MY_MCP_CLIENT_SECRET}"
    }
  }
}
```

When `oauthClientId` is set, Devin CLI skips dynamic client registration and uses your pre-registered client during the OAuth flow. Run `devin mcp login <name>` (or trigger first use) to authenticate as usual.

You can also set these from the command line when adding or logging into a server:

```bash theme={null}
devin mcp add my-server <URL> --oauth-client-id <ID> --oauth-client-secret <SECRET>
devin mcp login my-server --oauth-client-id <ID> --oauth-client-secret <SECRET>
```

<Note>
  `oauthClientId` / `oauthClientSecret` are OAuth client credentials used during the authorization flow. They are **not** generic per-request credentials — if a server expects a static token, use `headers` (HTTP) or `env` (stdio) instead.
</Note>

<Warning>
  Don't commit a client secret to a shared config. Reference it from an environment variable (`${env:VAR}`), read it from a file (`${file:/path}`), or put it in `.devin/mcp_config.local.json` (gitignored). See the "Managing Secrets" section below.
</Warning>

### OAuth resource override

During OAuth authorization and token exchange, Devin CLI sends an [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) `resource` parameter so the authorization server can issue audience-restricted tokens. By default the value is the MCP server's URL. Override it with `oauthResource`:

```json theme={null}
{
  "mcpServers": {
    "my-server": {
      "url": "https://my-server.example.com/mcp",
      "transport": "http",
      "oauthResource": ""
    }
  }
}
```

The field has three behaviors:

* **Unset** (default): sends `resource` set to the MCP server URL.
* **Non-empty value**: replaces the default with your value (e.g. a specific application ID URI).
* **Empty string (`""`)**: omits the `resource` parameter entirely from both the authorization URL and the token exchange.

You can also set it from the command line when adding or logging into a server:

```bash theme={null}
devin mcp add my-server <URL> --oauth-resource ""
devin mcp login my-server --oauth-resource ""
```

Like other OAuth fields, `oauthResource` supports `${env:VAR}` and `${file:/path}` expansion.

***

## Enabling and Disabling Servers

You can temporarily disable an MCP server without removing its configuration. A disabled server is skipped during tool discovery — its tools won't appear and the server process won't be started.

```bash theme={null}
devin mcp disable <name>    # Disable a server
devin mcp enable <name>     # Re-enable it
```

This sets the `"disabled": true` flag on the server entry in the config file. Use `-s`/`--scope` to target a specific scope:

```bash theme={null}
devin mcp disable -s project my-server
devin mcp enable -s user my-server
```

You can also set the flag directly in your config file:

```json theme={null}
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@company/mcp-server"],
      "disabled": true
    }
  }
}
```

<Note>Disabling is useful when you want to keep a server's configuration (including environment variables and OAuth credentials) but temporarily stop using it — for example, to reduce startup time or isolate an issue.</Note>

***

## Managing Secrets

<Warning>
  Never commit API keys or secrets to version control. Use `.devin/mcp_config.local.json` for sensitive values.
</Warning>

For team projects, the recommended pattern is:

1. Define the server in `.devin/mcp_config.json` with placeholder or no env vars
2. Each team member adds their personal keys in `.devin/mcp_config.local.json`

The local config file is automatically excluded from git.

***

## MCP Permissions

You can pre-approve, deny, or force-ask for specific MCP tools in your permissions config:

```json theme={null}
{
  "permissions": {
    "allow": [
      "mcp__github__list_issues",
      "mcp__github__create_issue"
    ],
    "deny": [
      "mcp__github__delete_repo"
    ],
    "ask": [
      "mcp__linear__*"
    ]
  }
}
```

**Permission matcher patterns:**

| Pattern             | Matches                              |
| ------------------- | ------------------------------------ |
| `mcp__server__tool` | A specific tool on a specific server |
| `mcp__server__*`    | All tools on a specific server       |
| `mcp__*`            | All MCP tools on all servers         |

***

## Prompts

Prompts need no configuration of their own: any connected server that declares the MCP `prompts` capability automatically contributes `/mcp__<server>__<prompt>` slash commands. Because the command name embeds the server name, renaming a server in `mcpServers` renames its prompt commands too. See [MCP Overview — Prompts as slash commands](/cli/extensibility/mcp/overview#prompts-as-slash-commands).

***

## Organization restrictions

If you're on an enterprise team, your admin may restrict which MCP servers you can connect to. A server you've configured can be blocked if MCP is disabled for your team, or if it isn't on your team's allowlist or in an enforced **MCP registry** — in which case it won't connect and its tools won't be available. See [Team Settings — MCP Registry](/cli/enterprise/team-settings#mcp-registry) for details.

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="Auth required / OAuth errors with remote servers">
    If you see errors like `Auth required` or `AuthRequired` when connecting to a remote MCP server, the server requires OAuth authentication.

    Run:

    ```bash theme={null}
    devin mcp login <server-name>
    ```

    Each MCP client authenticates independently. Even if you've already authenticated in Windsurf or Claude Code, you need to run `devin mcp login` separately for Devin CLI.

    To verify your auth status, try removing and re-adding credentials:

    ```bash theme={null}
    devin mcp logout <server-name>
    devin mcp login <server-name>
    ```
  </Accordion>

  <Accordion title="Server won't start">
    Verify the command works outside Devin CLI:

    ```bash theme={null}
    npx -y @modelcontextprotocol/server-github
    ```

    Check that all required environment variables are set.
  </Accordion>

  <Accordion title="Tools not appearing">
    Ask the agent to list MCP servers and tools. The server may need a moment to initialize.
  </Accordion>

  <Accordion title="Permission denied">
    Check your permissions config. MCP tools default to prompting for approval. Add them to `permissions.allow` to auto-approve.
  </Accordion>

  <Accordion title="OAuth errors due to the resource parameter">
    Some authorization servers reject OAuth requests that include the RFC 8707 `resource` parameter. Set `oauthResource` to an empty string to omit the parameter:

    ```json theme={null}
    {
      "mcpServers": {
        "my-server": {
          "url": "https://my-server.example.com/mcp",
          "oauthResource": ""
        }
      }
    }
    ```

    Then re-authenticate:

    ```bash theme={null}
    devin mcp logout my-server
    devin mcp login my-server
    ```

    See [OAuth resource override](#oauth-resource-override) for the full set of `oauthResource` behaviors.
  </Accordion>

  <Accordion title="Legacy SSE fallback">
    When connecting to an HTTP server, Devin CLI tries **Streamable HTTP** first. If the server responds with an HTTP 4xx error (e.g. 404 or 405), it automatically falls back to **legacy SSE** on the **same configured URL**. This follows the [MCP spec's backwards-compatibility guidance](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/#backwards-compatibility).

    The fallback only triggers on 4xx responses — connection errors, timeouts, and 5xx responses are reported directly without attempting SSE.

    If your server's SSE endpoint is at a different path (e.g. `/sse` instead of `/mcp`), set `"transport": "sse"` with the SSE URL to connect directly without the Streamable HTTP attempt.

    If both transports fail, the error message includes details from both attempts to help with troubleshooting.
  </Accordion>
</AccordionGroup>
