> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Essential Commands

> If you remember nothing else...

## Starting Devin CLI

By default, sessions happen in a REPL, a graphical terminal interface where you can chat back and forth and observe Devin's actions.

```bash theme={null}
devin                            # Start interactive REPL (no prompt)
devin -- your prompt here        # Start REPL with initial prompt
devin -p "prompt"                # Single-turn, no REPL: print response to stdout and exit
devin -p -- prompt words here    # Same, using -- separator (still works)
```

<Note>
  Use `--` before your prompt so it is interpreted as a prompt and not a subcommand.
</Note>

<Tip>
  Single-turn mode (`-p`) is great for scripts and automations.
</Tip>

<Note>
  Type `@` in the prompt input to open autocomplete for local files/directories. Selecting one adds it as context for your message.
</Note>

<Tip>
  You can paste images from your clipboard with **Ctrl+V**. Attached images appear in the input area and can be managed with **Left/Right** to navigate and **Backspace** to remove.
</Tip>

## Running shell commands

Devin may run shell commands while working. If a command is still running after the default wait period, Devin moves it to the background and shows how long it waited along with the background shell ID. Devin can then continue working and check the command's output later.

***

## Modes

Devin CLI has 5 built-in permission modes: **Normal**, **Accept Edits**, **Smart**, **Bypass**, and **Autonomous**, and 3 agent-modes: **Normal**, **Plan**, and **Ask**. For plan and ask, use `/plan` and `/ask`.

<AccordionGroup>
  <Accordion title="Normal" defaultOpen icon="robot">
    Auto-approves read-only tools within the current directory, and asks for permission for write/execute operations.

    ```bash theme={null}
    /normal
    # or
    /mode normal
    ```

    This is the default mode.
  </Accordion>

  <Accordion title="Accept Edits" icon="check">
    Auto-approves file edits within the workspace while still prompting for shell commands and other actions. We expect people to spend most of their time here.

    ```bash theme={null}
    /accept-edits
    # or
    /mode accept-edits
    ```
  </Accordion>

  <Accordion title="Smart" icon="wand-magic-sparkles">
    Auto-approves file edits within the workspace like Accept Edits, and for every other action — shell commands, web fetches, MCP tools — a fast model decides whether it is safe to run without asking. Anything it does not judge clearly safe still prompts, and high-risk categories (package installs, mutating `git`, `rm`, `sudo`, destructive cloud CLI operations, sensitive files) always prompt.

    ```bash theme={null}
    /smart
    # or
    /mode smart
    ```

    You can also start in smart mode:

    ```bash theme={null}
    devin --permission-mode smart
    ```

    <Note>
      Smart mode is rolling out gradually, so it may not be available on your account yet. See [Smart Mode](/cli/reference/permissions#smart-mode) for the full behavior.
    </Note>
  </Accordion>

  <Accordion title="Bypass" icon="bolt">
    <Warning>
      Auto-approves **all** tool calls, including writes and shell commands.
    </Warning>

    ```bash theme={null}
    /bypass
    # or
    /mode bypass
    ```

    You can also start in bypass mode:

    ```bash theme={null}
    devin --permission-mode bypass
    ```

    Aliases: `/yolo`, `/dangerous`

    <Note>
      Bypass mode **never** overrides organization-level permissions configured by your admin via [Team Settings](/cli/enterprise/team-settings). Admin-enforced deny and ask rules **always** take priority.
    </Note>
  </Accordion>

  <Accordion title="Autonomous" icon="robot">
    Roughly equivalent to Accept Edits in the current workspace, with the additional ability to run any shell command within an [OS-level sandbox](/cli/reference/configuration/config-file#sandbox) (to contain what those commands can actually touch).

    ```bash theme={null}
    devin --sandbox --permission-mode autonomous
    ```

    Autonomous is the **only** permission mode available when running with `--sandbox`, and it is selected automatically — Normal, Accept Edits, Smart, and Bypass are hidden in sandbox sessions.

    In Autonomous mode...

    * You are prompted for **capabilities rather than commands**.
      * Commands respect `Write` scopes and `Read(...)` deny rules via a filesystem sandbox.
      * Commands prompt you when they try to connect to network resources.
    * Read-only operations within the current directory auto-approve.

    <Note>
      Autonomous relies on the sandbox for safety. Without `--sandbox`, the mode is unavailable — use Bypass if you want unattended execution without OS-level isolation. See [Bypass vs Autonomous](#bypass-vs-autonomous) below for a direct comparison.
    </Note>
  </Accordion>
</AccordionGroup>

### Bypass vs Autonomous

Bypass and Autonomous both reduce approval prompts, but they rely on different safety mechanisms:

|                                                               | Bypass                      | Autonomous                                                                                            |
| ------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Requires `--sandbox`                                          | No                          | Yes (only available in sandbox sessions)                                                              |
| Shell commands                                                | Auto-approved, unrestricted | Auto-approved, contained by the sandbox                                                               |
| File writes via `edit`/`write` tools                          | Auto-approved anywhere      | Still prompt (granting a scope expands the sandbox)                                                   |
| Network access                                                | Unrestricted                | Filtered by the sandbox's [domain allow/deny lists](/cli/reference/configuration/config-file#sandbox) |
| Respects admin [Team Settings](/cli/enterprise/team-settings) | Yes                         | Yes                                                                                                   |

Pick Bypass when you trust the agent with your whole machine. Pick `--sandbox` (which selects Autonomous) when you want unattended execution with OS-enforced limits on what files and domains the agent can touch. If you like the feel of bypass but want the agent to have its own computer, try cloud Devin!

## Session History

Your conversation history is saved so you can resume a session later.

```bash theme={null}
devin -c              # Continue the most recent session in the current directory
devin --continue

devin -r              # Pick from recent sessions
devin --resume
devin -r brisk-otter  # Resume a specific session by ID
```

***

## Slash Commands

You can use these commands while in an active session.

### Navigation & Control

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `/help`            | See all available commands               |
| `/exit` or `/quit` | Exit the application                     |
| `/clear` or `/new` | Clear conversation history (start fresh) |

<Tip>
  You can also type `exit` or `quit` as plain text (without the `/` prefix) to exit.
</Tip>

### Mode Switching

| Command           | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `/mode`           | Show current mode                                                                                   |
| `/mode <name>`    | Switch mode (`normal`, `accept-edits`, `smart`, `plan`, `bypass`; `autonomous` in sandbox sessions) |
| `/normal`         | Switch to Normal mode (default)                                                                     |
| `/accept-edits`   | Switch to Accept Edits mode                                                                         |
| `/smart`          | Switch to Smart mode                                                                                |
| `/plan`           | Switch to Plan mode                                                                                 |
| `/ask <question>` | Ask a question without making code changes (oneshot)                                                |
| `/bypass`         | Switch to Bypass mode (aliases: `/yolo`, `/dangerous`)                                              |

### Model Switching

| Command  | Description         |
| -------- | ------------------- |
| `/model` | Show model selector |

### Session Management

| Command            | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `/resume`          | Open the interactive session picker                                 |
| `/resume <id>`     | Resume session by ID                                                |
| `/ls`              | List recent sessions in current directory (alias: `/list-sessions`) |
| `/ls --all`        | List all sessions across all directories                            |
| `/continue`        | Resume most recent session                                          |
| `/continue <id>`   | Resume session by ID                                                |
| `/rm-session <id>` | Irreversibly delete a session by ID                                 |

### Workspace

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `/workspace`           | List workspace directories (alias: `/workspaces`) |
| `/add-dir <path>`      | Add additional workspace directory                |
| `/undo-add-dir <path>` | Remove a workspace directory                      |

### Automation

| Command          | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| `/loop <prompt>` | Run a prompt then auto-review the diff in a loop (requires clean git state to start) |

### Extensibility

| Command  | Description                                                         |
| -------- | ------------------------------------------------------------------- |
| `/hooks` | List all loaded hooks with their IDs, event types, and source paths |

### Account & System

| Command    | Description                              |
| ---------- | ---------------------------------------- |
| `/login`   | Authenticate with Devin                  |
| `/logout`  | Clear stored credentials and exit        |
| `/update`  | Check for and install updates            |
| `/upgrade` | Upgrade your subscription plan           |
| `/bug`     | Report a bug to the Devin CLI developers |
| `/compact` | Force conversation compaction            |

<Note>
  If you installed Devin for Terminal via Homebrew, `/update` will direct you to use `brew upgrade devin` instead of performing a self-update.
</Note>

***

## Keyboard Shortcuts

Here are the most important keyboard shortcuts. See [Keyboard Shortcuts](/cli/reference/keyboard-shortcuts) for more shortcuts.

| Shortcut                   | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `Shift+Tab`                | Cycle between modes (Normal, Accept Edits, Smart, Bypass, Autonomous) |
| `Ctrl+C`                   | Clear input text, or cancel the running agent                         |
| `Esc`                      | Cancel the running agent                                              |
| `Shift+Enter`              | Insert a newline (multi-line input)                                   |
| `Ctrl+V` or `Shift+Insert` | Paste from clipboard                                                  |
| `Ctrl+G`                   | Open external editor                                                  |
| `Ctrl+O`                   | Open full-screen thinking trace viewer                                |
| `@`                        | Mention files to add as context                                       |
