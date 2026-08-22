> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# JetBrains

> Run Devin inside JetBrains IDEs from AI Chat using the Agent Client Protocol (ACP), including JetBrains Remote Development.

JetBrains IDEs can run Devin as an agent inside **AI Chat** using the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com/). The quickest way to
add Devin is to install it from the **ACP Registry**; you can also configure it
manually as a custom agent. Either way, you can drive Devin from the AI Chat panel in
IntelliJ IDEA, PyCharm, GoLand, and other JetBrains IDEs — including over
[JetBrains Remote Development](https://www.jetbrains.com/remote-development/).

<Note>
  This integration uses JetBrains' built-in ACP support in AI Assistant. For the
  upstream reference, see the JetBrains docs on
  [adding a custom agent](https://www.jetbrains.com/help/ai-assistant/acp.html#add-custom-agent).
</Note>

## Prerequisites

* A JetBrains IDE with the **AI Assistant** plugin and AI Chat available.

## Setup

Install Devin directly from the **ACP Registry** — no CLI installation or manual
configuration required.

<Steps>
  <Step title="Open AI Chat">
    Click the **AI Chat** icon in the right-hand tool window bar.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/9EKnqBIslwD5kWvk/images/cli/acp/jetbrains-ai-chat-icon.png?fit=max&auto=format&n=9EKnqBIslwD5kWvk&q=85&s=1de025a909c3869041a8bd5d1aad10e2" alt="AI Chat icon in the JetBrains tool window bar" width="54" height="357" data-path="images/cli/acp/jetbrains-ai-chat-icon.png" />
    </Frame>
  </Step>

  <Step title="Open the agent selector">
    Click the agent selector in the AI Chat footer to see the list of available
    agents.
  </Step>

  <Step title="Install Devin from the ACP Registry">
    Choose **Install From ACP Registry...**, search for **Devin**, and click
    **Install**. Devin is added to the list of available agents.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/-ptQDbeV2RztJi0W/images/cli/acp/jetbrains-acp-registry-menu.png?fit=max&auto=format&n=-ptQDbeV2RztJi0W&q=85&s=c18348688a8775e6aabb0dc6a85b9186" alt="Agent selector menu showing the Install From ACP Registry option" width="606" height="556" data-path="images/cli/acp/jetbrains-acp-registry-menu.png" />
    </Frame>
  </Step>

  <Step title="Log in to Devin (optional)">
    The first time you connect, you may be prompted to authenticate. Follow the
    prompt to log in to your Devin account.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/-ptQDbeV2RztJi0W/images/cli/acp/jetbrains-acp-login.png?fit=max&auto=format&n=-ptQDbeV2RztJi0W&q=85&s=68a49822822688804a2371bf28dbc761" alt="Logging in to Devin from JetBrains AI Chat" width="502" height="103" data-path="images/cli/acp/jetbrains-acp-login.png" />
    </Frame>
  </Step>

  <Step title="Start chatting with Devin">
    Select **Devin** in the agent selector and send a message to start a session.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/-ptQDbeV2RztJi0W/images/cli/acp/jetbrains-devin-selected.png?fit=max&auto=format&n=-ptQDbeV2RztJi0W&q=85&s=d7e7ecd2fed9920f5f03e99c6a3422fe" alt="Devin selected as the agent in the AI Chat footer" width="910" height="254" data-path="images/cli/acp/jetbrains-devin-selected.png" />
    </Frame>
  </Step>
</Steps>

## Manual setup (custom ACP)

If you'd rather run Devin from your own installation of the Devin CLI, you can add it
as a custom ACP agent instead of installing from the registry.

### Prerequisites

* Devin CLI installed and authenticated. If you haven't installed it yet, follow
  the [Quickstart](/cli/index), then run `devin auth login`.
* The absolute path to the `devin` binary. You can find it with:

  ```bash theme={null}
  which devin
  ```

  This typically resolves to something like `~/.local/bin/devin`.

<Tip>
  For **JetBrains Remote Development**, Devin CLI must be installed on the **remote
  host** (where the backend runs), not on your local client. Run `which devin` in a
  terminal on the remote host and use that path in the configuration below.
</Tip>

<Steps>
  <Step title="Open AI Chat">
    Click the **AI Chat** icon in the right-hand tool window bar.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/9EKnqBIslwD5kWvk/images/cli/acp/jetbrains-ai-chat-icon.png?fit=max&auto=format&n=9EKnqBIslwD5kWvk&q=85&s=1de025a909c3869041a8bd5d1aad10e2" alt="AI Chat icon in the JetBrains tool window bar" width="54" height="357" data-path="images/cli/acp/jetbrains-ai-chat-icon.png" />
    </Frame>
  </Step>

  <Step title="Add a custom agent">
    Click the three-dots menu in the top-right of the AI Chat panel, then choose
    **Add Custom Agent**. This opens the `acp.json` configuration file.

    <Frame>
      <img src="https://mintcdn.com/cognitionai/9EKnqBIslwD5kWvk/images/cli/acp/jetbrains-add-custom-agent.png?fit=max&auto=format&n=9EKnqBIslwD5kWvk&q=85&s=12e5619e373efe6adb98941f181b7da2" alt="Add Custom Agent option in the AI Chat menu" width="425" height="536" data-path="images/cli/acp/jetbrains-add-custom-agent.png" />
    </Frame>
  </Step>

  <Step title="Configure the Devin agent">
    Add Devin to the `agent_servers` block in `acp.json`. Set `command` to the
    absolute path of your `devin` binary (from `which devin`) and pass `acp` as
    the only argument:

    ```json acp.json theme={null}
    {
      "default_mcp_settings": {},
      "agent_servers": {
        "devin": {
          "command": "/home/you/.local/bin/devin",
          "args": ["acp"]
        }
      }
    }
    ```

    Save the file. Devin now appears as a selectable agent in AI Chat.
  </Step>

  <Step title="Start chatting with Devin">
    Select **devin** as the agent in AI Chat and send a message to start a
    session. The first time you connect, you may be prompted to authenticate;
    Devin uses the credentials from `devin auth login` (or `WINDSURF_API_KEY` if
    set).
  </Step>
</Steps>

## Managing the integration

The three-dots menu in the AI Chat panel includes a few helpful actions for the
Devin agent:

* **Reset ACP Authentication** — clear stored ACP credentials and re-authenticate.
* **Get ACP Logs** — open the ACP logs, useful for debugging connection issues or
  inspecting what the agent is doing under the hood.

## Notes and limitations

* Devin's slash commands are advertised over ACP, so they appear in JetBrains AI
  Chat's own command palette — see
  [Slash commands in ACP hosts](/cli/reference/commands#slash-commands-in-acp-hosts).
* Devin CLI's terminal/shell output is surfaced through JetBrains AI Chat's ACP
  rendering, which differs from the native Devin CLI terminal UI. Some richer
  interactions are only available in the standalone CLI.
* The `devin acp` subcommand is intended to be launched by an ACP-aware client
  (like JetBrains AI Chat) as a subprocess — it speaks JSON-RPC over stdio and is
  not meant to be run interactively. See
  [`devin acp`](/cli/reference/commands#devin-acp) in the command reference.
