> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Xcode

> Run Devin inside Xcode's coding assistant via the Agent Client Protocol (ACP), or give the Devin CLI access to your Xcode project through Xcode's MCP bridge.

Xcode 26.6's [coding intelligence](https://developer.apple.com/documentation/xcode/setting-up-coding-intelligence)
can run Devin as an agent inside the **coding assistant** using the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com/). Devin isn't one
of the agents listed in Xcode's Intelligence settings, so you add it manually as
a custom ACP agent that runs from your local Devin CLI installation.

<Note>
  This integration uses Xcode's built-in ACP support in the coding assistant. For
  the upstream reference, see Apple's docs on
  [setting up coding intelligence](https://developer.apple.com/documentation/xcode/setting-up-coding-intelligence).
</Note>

## Prerequisites

* **Xcode 26.6 or later** with the coding assistant available.
* Devin CLI installed and authenticated. If you haven't installed it yet, follow
  the [Quickstart](/cli/index), then run `devin auth login`.
* The **absolute** path to the `devin` binary. You can find it with:

  ```bash theme={null}
  which devin
  ```

  This typically resolves to something like `/Users/you/.local/bin/devin`.

<Warning>
  Xcode requires an **absolute** path for the agent command — it does not expand
  `~` or use your shell's `PATH`. If `which devin` prints a `~`-prefixed path,
  expand it first (for example, run `echo "$(cd ~ && pwd)/.local/bin/devin"`) and
  use the full `/Users/...` result.
</Warning>

## Setup

Add Devin as a custom agent from the Intelligence settings.

<Steps>
  <Step title="Open Intelligence settings">
    Choose **Xcode > Settings**, then select **Intelligence** in the sidebar.
  </Step>

  <Step title="Add an agent">
    Under **Agents**, click **Add an Agent**. Xcode's built-in ACP support lets
    you register any agent that speaks the Agent Client Protocol.
  </Step>

  <Step title="Configure the Devin agent">
    In the sheet that appears, enter the agent's details:

    * **Name** — `Devin` (or any label you prefer).
    * **Command** — the **absolute** path to your `devin` binary (from
      `which devin`), for example `/Users/you/.local/bin/devin`. A relative path
      or a `~`-prefixed path won't work.
    * **Arguments** — `acp`. Add `--model <name>` (for example `acp --model opus`)
      to pick the model Devin uses; see
      [`devin acp`](/cli/reference/commands#devin-acp).

    Click **Add**. Devin now appears as a selectable agent under **Agents**.
  </Step>

  <Step title="Start chatting with Devin">
    Select **Devin** in the coding assistant and send a message to start a
    session. The first time you connect, you may be prompted to authenticate;
    Devin uses the credentials from `devin auth login` (or `WINDSURF_API_KEY` if
    set).
  </Step>
</Steps>

## Give Devin CLI access to your Xcode project (MCP)

Separately from running Devin *inside* Xcode, you can point the standalone Devin
CLI at your Xcode project so it can build, run tests, read and edit files, render
SwiftUI previews, and search Apple's documentation. Xcode ships an
[MCP](/cli/extensibility/mcp/overview) server, `xcrun mcpbridge`, that exposes
these Xcode tools to any external agent (the same mechanism
[Cursor uses](https://cursor.com/docs/integrations/xcode)). Add it to Devin like
any other MCP server.

<Note>
  The Xcode MCP bridge requires **Xcode 26.3 or later**. Confirm the binary is
  available with `xcrun --find mcpbridge` (see [Troubleshooting](#troubleshooting)
  if it isn't). See Apple's docs on
  [giving external agents access to Xcode](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode).
</Note>

<Steps>
  <Step title="Allow external agents in Xcode">
    Choose **Xcode > Settings**, select **Intelligence**, and under **Model
    Context Protocol** turn on **Allow external agents to use Xcode tools**.
  </Step>

  <Step title="Add the Xcode MCP server to Devin">
    Register `xcrun mcpbridge` as a stdio MCP server:

    ```bash theme={null}
    devin mcp add xcode -- xcrun mcpbridge
    ```

    Verify it was added with `devin mcp list`. See
    [`devin mcp`](/cli/reference/commands#devin-mcp) for scope and configuration
    options.
  </Step>

  <Step title="Open your project and prompt Devin">
    Open your project or workspace in Xcode (the bridge needs a running Xcode
    session with a project open), then prompt Devin from the CLI. Xcode alerts
    you when the external agent connects and while it's active.
  </Step>
</Steps>

## Troubleshooting

* **`xcrun: error: unable to find utility "mcpbridge"`** — your system is pointed
  at the Command Line Tools instead of the full Xcode install. Fix it with:

  ```bash theme={null}
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -runFirstLaunch
  ```

  Then confirm with `xcrun --find mcpbridge`, which should print a path.
* **Devin can't reach the Xcode tools** — make sure Xcode is running with a
  project (not an empty window) open, and that **Allow external agents to use
  Xcode tools** is enabled in Intelligence settings.

## Notes and limitations

* The model can't be switched from Xcode's UI. To use something other than your
  team's default model, pass `--model <name>` in the agent's **Arguments** field
  (see [`devin acp`](/cli/reference/commands#devin-acp)), which sets the model for
  every session Xcode starts.
* When you select an agent in Xcode's coding assistant, it automatically gets
  access to Xcode capabilities such as building and testing your app. You can
  review and restrict which commands and tools agents may use under
  **Agents > Permissions** in Intelligence settings — see Apple's docs on
  [extending and customizing agents](https://developer.apple.com/documentation/xcode/extending-and-customizing-agents).
* Xcode's coding assistant does not surface Devin's slash commands.
* Devin CLI's terminal/shell output is surfaced through Xcode's ACP rendering,
  which differs from the native Devin CLI terminal UI. Some richer interactions
  are only available in the standalone CLI.
* The `devin acp` subcommand is intended to be launched by an ACP-aware client
  (like Xcode's coding assistant) as a subprocess — it speaks JSON-RPC over stdio
  and is not meant to be run interactively. See
  [`devin acp`](/cli/reference/commands#devin-acp) in the command reference.
