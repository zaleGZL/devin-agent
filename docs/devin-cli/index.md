> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart

> Get up and running in 2 minutes with Devin CLI, a local command-line coding agent with deep Devin Cloud integration.

<Steps>
  <Step title="Install Devin CLI">
    <Tabs>
      <Tab title="macOS / Linux / WSL">
        ```bash theme={null}
        curl -fsSL https://cli.devin.ai/install.sh | bash
        ```
      </Tab>

      <Tab title="Homebrew">
        On macOS, install Devin CLI with [Homebrew](https://brew.sh):

        ```bash theme={null}
        brew install --cask devin-cli
        ```

        To upgrade to the latest version later, run:

        ```bash theme={null}
        brew upgrade --cask devin-cli
        ```
      </Tab>

      <Tab title="Windows">
        Download and run the installer:

        * [x86\_64 (most Windows PCs)](https://static.devin.ai/cli/devin-updater-x86_64-pc-windows.exe)
        * [ARM64 (Windows on ARM)](https://static.devin.ai/cli/devin-updater-aarch64-pc-windows.exe)

        Alternatively, open **PowerShell** and run:

        ```powershell theme={null}
        irm https://static.devin.ai/cli/setup.ps1 | iex
        ```

        <Warning>
          `irm` and `iex` are PowerShell commands. Do not run this in Git Bash or CMD — it will fail with "command not found". Use PowerShell for installation only.
        </Warning>

        After installing, you can use Devin CLI from **PowerShell**, **Windows Terminal**, or **Git Bash**.
      </Tab>

      <Tab title="Devin Desktop">
        Devin CLI is bundled with **Devin Desktop**. This installation method is available for **Legacy Windsurf Enterprise** and **Devin Enterprise** plans.

        **Admin setup:** For the Devin Desktop-bundled install, an admin must first enable the install option in Devin CLI team settings by toggling on **Show "Install Devin CLI" in the Devin Desktop Command Palette**.

        **User installation:**

        1. Open Devin Desktop
        2. Open the Command Palette with <code>Cmd+Shift+P</code>
           (macOS) or <code>Ctrl+Shift+P</code>
           (Windows/Linux)
        3. Search for and run **Install Devin CLI**

        This adds the `devin` binary to your PATH so you can use it from any terminal.
      </Tab>
    </Tabs>
  </Step>

  <Step title="Start coding">
    That's it! After you restart your terminal, enter a project directory and type `devin` to activate Devin CLI. Also try preloading the session with a prompt for automation:

    ```bash theme={null}
    devin -- check out this code and suggest a feasible, helpful feature
    ```

    <Check>
      You're ready to go. For must-know tips, see [Essential Commands](/cli/essential-commands).
    </Check>
  </Step>
</Steps>

## What's next?

Devin CLI can implement new features, fix bugs, review code, answer questions, automate tasks, and more.

<CardGroup cols={2}>
  <Card title="Essential Commands" icon="terminal" href="/cli/essential-commands">
    Must-know commands and slash commands
  </Card>

  <Card title="Models" icon="brain" href="/cli/models">
    Choose the right model for your task
  </Card>

  <Card title="Extensibility" icon="puzzle-piece" href="/cli/extensibility/index">
    Connect MCP servers and skills
  </Card>

  <Card title="Command Reference" icon="book" href="/cli/reference/commands">
    Explore all commands and flags
  </Card>
</CardGroup>

***

## Devin CLI vs. Devin

Devin CLI and [Devin](/get-started/devin-intro) are separate tools designed for different workflows.

**Devin CLI** is a local coding agent that runs directly in your terminal. It works with your local files and environment, giving you fast, interactive assistance right where you code.

**Devin** is our cloud-based AI software engineer that runs in a virtual machine. It includes features like Playbooks, Secrets, Knowledge, and other capabilities that are not available in Devin CLI.

<Info>
  Devin CLI does not yet support Knowledge, Playbooks, or Secrets from your Devin account. We're actively working on adding support for each of these and plan to roll them out soon.
</Info>

<img src="https://mintcdn.com/cognitionai/aB0LGhNhil-hGeEB/images/cli/d4toverview.png?fit=max&auto=format&n=aB0LGhNhil-hGeEB&q=85&s=d7b5993614bc9d8f296d1f529b8f0393" alt="Devin CLI overview" width="3248" height="2120" data-path="images/cli/d4toverview.png" />
