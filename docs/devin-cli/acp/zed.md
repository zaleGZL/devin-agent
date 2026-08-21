> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Zed

> Run Devin CLI inside the Zed editor as a custom ACP agent in the Agent Panel.

[Zed](https://zed.dev/) has native support for the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com/), so you can run
Devin CLI as a custom external agent directly inside Zed's **Agent Panel** —
with real-time editing, syntax highlighting, and agent following.

<Note>
  This integration uses Zed's built-in support for external ACP agents. For the
  upstream reference, see the Zed docs on
  [external agents](https://zed.dev/docs/ai/external-agents).
</Note>

## Setup

<Steps>
  <Step title="Install Devin">
    Open the ACP registry with `zed: acp registry` from the command palette (Cmd+Shift+P on macOS and Ctrl+Shift+P on Windows). Search for "Devin" and install it.

    <video autoPlay muted loop playsInline className="w-full aspect-video" src="https://mintcdn.com/cognitionai/uo-c3zobSYhZC--y/images/cli/acp/zed-install.mp4?fit=max&auto=format&n=uo-c3zobSYhZC--y&q=85&s=f51a0b4846ce1c06ffde433c1c391a0a" data-path="images/cli/acp/zed-install.mp4" />
  </Step>

  <Step title="Select Devin in the Threads Sidebar">
    On the top left corner of the Threads Sidebar, click on the agent dropdown menu and select "Devin".

    <video autoPlay muted loop playsInline className="w-full aspect-video" src="https://mintcdn.com/cognitionai/uo-c3zobSYhZC--y/images/cli/acp/zed-select.mp4?fit=max&auto=format&n=uo-c3zobSYhZC--y&q=85&s=d27435a35c4ef5049a246005944fa77d" data-path="images/cli/acp/zed-select.mp4" />
  </Step>

  <Step title="Authenticate">
    In the new Devin thread, open the agent menu in the top right corner and select "Authenticate" (or "Reauthenticate"). Then on the bottom of the thread panel, click on "API Key". A browser window will open, where you can log into your Devin Cloud account and authenticate. If you don't have an account you can sign up for free!

    <video autoPlay muted loop playsInline className="w-full aspect-video" src="https://mintcdn.com/cognitionai/uo-c3zobSYhZC--y/images/cli/acp/zed-auth.mp4?fit=max&auto=format&n=uo-c3zobSYhZC--y&q=85&s=3a2d8b74193ebb67d44bb935b917da4c" data-path="images/cli/acp/zed-auth.mp4" />
  </Step>

  <Step title="Build with Devin">
    You can now start a conversation with Devin! By default, Devin will use Adaptive model selection, automatically choosing the best model for your task. You can also pick a specific model from the menu at the bottom of the thread panel.

    <Frame title="Devin in Zed">
      <img src="https://mintcdn.com/cognitionai/uo-c3zobSYhZC--y/images/cli/acp/zed-models.png?fit=max&auto=format&n=uo-c3zobSYhZC--y&q=85&s=642c87e40bec22c2c736e917e1d38866" alt="Devin in Zed" width="728" height="798" data-path="images/cli/acp/zed-models.png" />
    </Frame>
  </Step>
</Steps>

## Notes and limitations

* Devin's slash commands are advertised over ACP, so they appear in Zed's own
  command palette — see
  [Slash commands in ACP hosts](/cli/reference/commands#slash-commands-in-acp-hosts).
* Devin CLI's terminal/shell output is surfaced through Zed's ACP rendering,
  which differs from the native Devin CLI terminal UI. Some richer interactions
  are only available in the standalone CLI.
* The `devin acp` subcommand is intended to be launched by an ACP-aware client
  (like Zed) as a subprocess — it speaks JSON-RPC over stdio and is not meant to
  be run interactively. See
  [`devin acp`](/cli/reference/commands#devin-acp) in the command reference.
