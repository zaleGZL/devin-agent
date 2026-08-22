> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Subagents

> Delegate tasks to independent subagents that work in the foreground or background

Subagents let the main agent spawn independent workers to handle subtasks. A subagent shares tools and codebase context with the parent, but operates in its own conversation chain -- it does not inherit the parent's conversation history. This is useful for tasks that benefit from focused, independent work -- like exploring a codebase, running tests, or implementing a feature in parallel.

You can ask the agent to use subagents explicitly (e.g. "research how auth works in a subagent"), or the agent may decide to delegate on its own when it determines a task would benefit from independent work.

In our measurements, **subagents** **both** **improve overall coding performance** **and** **reduce cost**.

***

## How Subagents Work

When the agent spawns a subagent, it selects one of the available **subagent profiles** and chooses whether the subagent should run in the foreground or background. Subagents can run in two modes:

<CardGroup cols={2}>
  <Card title="Foreground" icon="display">
    Runs inline in your session. The parent agent pauses and waits for the subagent to finish before continuing. You can approve or deny tool calls as they come up.
  </Card>

  <Card title="Background" icon="clock">
    Runs in parallel while the parent agent continues working. The parent is automatically notified when the subagent completes. Unapproved tools are automatically denied.
  </Card>
</CardGroup>

<Note>
  You do not see the subagent's raw output directly. When a subagent finishes, the parent agent reads the result and summarizes the key findings and actions for you.
</Note>

### Subagent Cost

Subagents run as their own agent sessions, each with its own context window and inference calls, so they consume cost independently of the parent. The parent's spend covers its own work; every subagent it spawns adds its own usage on top of that.

<Note>
  On prompt-based plans, each subagent consumes additional credits, just like a user message does. The number of credits depends on the model the subagent uses, so tasks that spawn multiple subagents (or [nest](/cli/subagents#nesting-depth) them) consume more credits.
</Note>

Because cost scales with the number of subagents, tasks that fan out into many subagents (or [nest](#nesting-depth) them) cost more. Use subagents deliberately when the parallelism or focused context is worth the additional spend.

***

## Which Model Does a Subagent Use?

Subagents do not all run on the model you picked in the model picker. Each profile decides where its model comes from:

| Profile            | Model used                                                                                                   | Effect on quota / credits                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `subagent_explore` | The **default subagent model** — a fast, cheap model (SWE-1.6 by default)                                    | Cheap: SWE-1.6 usage is billed at SWE rates, not at your primary model's rate                      |
| `subagent_general` | **The same model as the parent agent** — whatever you selected in the model picker (e.g. Claude Opus, GPT-5) | Same rate as the parent: a general subagent costs like a full extra session on your selected model |
| Custom subagents   | The `model` field in the definition file if set, otherwise the **default subagent model**                    | Depends on the model you pin                                                                       |

<Warning>
  `subagent_general` inherits the parent's model. If you are running a premium model, every general subagent runs on that premium model too, with its own context window and inference calls — so a task that fans out into several general subagents multiplies your spend. Ask for an explore subagent (or a [custom subagent](#custom-subagents) with a cheaper `model:` pinned) when the work is research rather than code changes.
</Warning>

The **default subagent model** is not a fixed model name — it resolves through a router at spawn time, and an admin can override it (see below). With the default **Subagent router** setting it resolves to SWE-1.6 (a faster or slower SWE-1.6 variant depending on your plan tier).

<Note>
  The CLI does not currently label which model a running subagent is using in the subagent panel.
</Note>

### Influencing the Model

There is no way to name a model for a subagent in a prompt — the `run_subagent` tool takes a *profile*, not a model. You have two levers:

1. **Ask for a profile in natural language.** Requesting an explore subagent ("research how auth works in an explore subagent") keeps the work on the cheap default subagent model. Asking for code changes gets you `subagent_general`, which runs on your selected model.
2. **Pin a model in a [custom subagent](#custom-subagents) profile.** `model:` in the definition file is the only way to run a *write-capable* subagent on a model other than the parent's. A [skill](/cli/extensibility/skills) that runs in a subagent can also set `model:` in its frontmatter to override the profile's model.

### Enterprise Controls

Administrators can govern which model subagents use — and whether subagents run at all — through the **Default subagent model** setting in the org/enterprise settings. This setting controls the model for `subagent_explore` and for custom subagents that don't pin a `model:` — it does not change `subagent_general`, which always follows the parent agent's model.

<Frame>
  <img src="https://mintcdn.com/cognitionai/d7_AE5155dfGCsnK/images/cli/default-subagent-model-setting.png?fit=max&auto=format&n=d7_AE5155dfGCsnK&q=85&s=e924249f64bf6ac6e0ffcf59b289aeb3" alt="Default subagent model setting" width="1024" height="114" data-path="images/cli/default-subagent-model-setting.png" />
</Frame>

It has three choices:

| Option                        | Behavior                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Subagent router (default)** | The default subagent model is chosen by a router at spawn time. Today it resolves to SWE-1.6 (the exact variant depends on your plan tier). |
| **A specific model**          | Pins the default subagent model to the selected model, for every subagent that doesn't run on the parent's model.                           |
| **None**                      | Disables subagents entirely — Devin will not spawn any subagents.                                                                           |

***

## Enabling and Disabling Subagents

Subagents are on by default. Set `subagents_enabled` to `false` in your [config file](/cli/reference/configuration/config-file#subagents_enabled) to remove the `run_subagent` and `read_subagent` tools so the agent does everything itself:

```json theme={null}
// ~/.config/devin/config.json
{
  "subagents_enabled": false
}
```

The change applies live — a running session picks it up without restarting. In Devin Desktop, the same capability is the **Subagents (Preview)** toggle in settings.

<Note>
  Organization policy wins: if an admin has set **Default subagent model** to **None**, subagents stay disabled no matter what this setting says.
</Note>

***

## Subagent Profiles

Each subagent runs with a specific profile that determines its capabilities. There are two built-in profiles:

| Profile            | Description                                  | Tool Access                                                                                                                  | Model                                       |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `subagent_explore` | Read-only codebase exploration and research  | Read-only codebase tools plus web search; cannot edit files or fetch arbitrary URLs (regardless of foreground or background) | Default subagent model (SWE-1.6 by default) |
| `subagent_general` | General-purpose tasks including code changes | Full tool access (foreground) or pre-approved tools only (background)                                                        | Same model as the parent agent              |

<Note>
  The agent automatically chooses the appropriate profile based on the task. Explore subagents are ideal for research and understanding, while general subagents can make changes. See [Which Model Does a Subagent Use?](#which-model-does-a-subagent-use) for how each profile picks its model — the two profiles do **not** run on the same model.
</Note>

You can also define your own custom subagent profiles — see [Custom Subagents](#custom-subagents) below.

***

## Tool Permissions

How tool permissions work depends on whether the subagent is running in the foreground or background:

* **Foreground subagents** behave like the main agent -- you are prompted to approve or deny tool calls as usual. The prompt names the subagent that requested the action, so you know who is asking.
* **Background subagents** inherit any tool permissions you have already granted during the current session. Any tool that has not been pre-approved is automatically denied. Background subagents cannot prompt you for new permissions.

<Tip>
  If a background subagent fails because a required tool was denied, you can resume it in the foreground to approve the necessary permissions. See [Resuming Subagents](#resuming-subagents) below.
</Tip>

***

## Monitoring Subagents

### Subagent Indicator

When background subagents are running, an indicator appears below the input area showing their status. You can navigate to the indicator by pressing <kbd>↓</kbd> from the input area, then press <kbd>Enter</kbd> to open the subagent panel.

When a foreground subagent is running, the spinner displays **"Subagent running · Ctrl+B to run in background"**.

### Subagent Panel

The subagent panel lets you view and manage all active and completed subagents. It shows each subagent's profile, title, status, elapsed time, and tool call count. Subagent activity survives a session reload, so the panel still reflects your subagents after resuming.

***

## Foreground / Background Switching

You can move subagents between foreground and background while they're running:

* **Background a foreground subagent:** Press <kbd>Ctrl</kbd>+<kbd>B</kbd> while a foreground subagent is running. The subagent continues working in the background, and the parent agent resumes.
* **Foreground a background subagent:** Open the subagent panel and press <kbd>f</kbd> on a running background subagent. The subagent's output will display inline.

<Note>
  When you move a subagent to the background, the parent agent's tool call has already returned, so the parent continues independently. The subagent's result won't feed back into the parent's current pipeline, but you'll be notified when it completes.
</Note>

***

## Interrupting a Turn

Interrupting the agent does not kill its subagents. Running subagents **park** with their state intact and resume on your next message, so an interruption to redirect the parent agent doesn't throw away work in flight.

***

## Cancelling Subagents

You can cancel a running subagent in two ways:

1. **From the subagent panel:** Open the panel and press <kbd>x</kbd> on a running subagent.
2. **Foreground subagent:** Press <kbd>Ctrl</kbd>+<kbd>C</kbd> or <kbd>Esc</kbd> to cancel the currently running foreground subagent.

***

## Resuming Subagents

Cancelled, failed, or completed subagents can be resumed with a new prompt. You can ask the agent to resume a subagent, and it will continue where it left off. Resumed subagents always run in the **foreground**, so you can approve any tool calls that were previously denied.

This is especially useful when:

* A background subagent failed because a required tool was denied -- resume it in the foreground to grant the necessary permissions.
* A subagent completed but you want it to do additional follow-up work based on its findings.
* A subagent was cancelled prematurely and you want it to continue.

***

## Nesting Depth

By default, subagents cannot spawn their own subagents — only the root agent can. Subagent tools (`run_subagent` and `read_subagent`) are disabled inside a subagent to prevent unbounded nesting.

However, **custom subagent profiles** can opt in to nested spawning by setting the `max-nesting` field in their frontmatter. This value overrides the default maximum depth, allowing subagents to spawn children as long as the tree stays within that limit.

For example, `max-nesting: 3` allows the following chain:

```
Root agent (depth 0)
└── Custom subagent (depth 1) — can spawn children
    └── Child subagent (depth 2) — can spawn children
        └── Grandchild subagent (depth 3) — cannot spawn (depth limit reached)
```

<Warning>
  Nested subagents can increase cost significantly. Each level of nesting spawns additional agents with their own context windows and inference calls. Use this feature deliberately.
</Warning>

***

## Custom Subagents

<Warning>
  Custom subagents are **experimental**. The format, behavior, and configuration options may change in future releases.
</Warning>

Beyond the built-in `subagent_explore` and `subagent_general` profiles, you can define your own custom subagent profiles. Custom subagents let you create specialized workers with their own system prompts, tool restrictions, and model overrides — tailored to specific tasks in your workflow. This is also the way to get a write-capable subagent that does **not** run on your (possibly expensive) primary model: give it a `model:` and the tools it needs.

### Creating a Custom Subagent

Custom subagents are defined as markdown files under `agents/`, using either layout:

* **Flat file** — `agents/<name>.md` (the same convention used by Claude Code, Cursor, and other tools). The file name (without `.md`) becomes the profile's identifier.
* **Directory** — `agents/<name>/AGENT.md`. The directory name becomes the profile's identifier. `AGENTS.md`, `agent.md`, and `agents.md` are also accepted as the file name (if multiple are present, `AGENT.md` takes precedence, then `AGENTS.md`, `agent.md`, `agents.md`).

In both layouts, a `name:` in the frontmatter overrides the identifier derived from the path.

<Tabs>
  <Tab title="Project-specific">
    ```text theme={null}
    .devin/agents/
    ├── reviewer.md
    └── researcher/
        └── AGENT.md
    ```

    Also supported:

    ```text theme={null}
    .agents/agents/
    ├── reviewer.md
    └── researcher/
        └── AGENT.md
    ```
  </Tab>

  <Tab title="Global">
    ```text theme={null}
    # Linux/macOS
    ~/.config/devin/agents/
    ├── reviewer.md
    └── researcher/
        └── AGENT.md

    # Windows
    %APPDATA%\devin\agents\
    ├── reviewer.md
    └── researcher\
        └── AGENT.md
    ```
  </Tab>
</Tabs>

### Definition File Format

A subagent definition file uses the same YAML frontmatter as skills, followed by the subagent's system prompt:

```markdown theme={null}
---
name: reviewer
description: Reviews code changes for correctness and style
model: sonnet
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

You are a code review subagent. Your job is to review code changes
thoroughly and report findings back to the parent agent.

Focus on:
1. Correctness — logic errors, edge cases, off-by-one mistakes
2. Security — potential vulnerabilities
3. Style — consistency with the rest of the codebase
4. Performance — obvious inefficiencies

Always cite specific file paths and line numbers in your findings.
```

### Frontmatter Fields

| Field           | Type    | Default                                                                  | Description                                                                                                           |
| --------------- | ------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `name`          | string  | file or directory name                                                   | Identifier for the profile (must not conflict with built-in profiles)                                                 |
| `description`   | string  | none                                                                     | Shown to the agent when selecting a profile                                                                           |
| `model`         | string  | default subagent model (SWE-1.6 by default) — **not** the parent's model | Override the model used by this subagent                                                                              |
| `allowed-tools` | list    | all tools                                                                | Restrict which tools the subagent can use. Cannot grant `ask_user_question`, which is always withheld from subagents. |
| `max-nesting`   | integer | none                                                                     | Override the maximum nesting depth, allowing this subagent to spawn its own subagents                                 |

### How Custom Subagents Are Used

Once defined, custom subagent profiles appear alongside the built-in ones. The agent sees a description of each available profile and chooses the most appropriate one when spawning a subagent. You can also ask the agent to use a specific profile by name (e.g., "review this code using the reviewer subagent").

Custom subagent profiles that conflict with a built-in profile name (e.g., `subagent_explore`, `subagent_general`) are skipped with a warning.

### Importing From Other Tools

Custom subagents are also imported from Claude Code's agent format:

| Source                | File Pattern                               |
| --------------------- | ------------------------------------------ |
| `.claude/agents/*.md` | Each `.md` file becomes a subagent profile |

<Note>
  Claude Code agent files use `tools` instead of `allowed-tools` in their frontmatter. Both formats are supported automatically.
</Note>

### Examples

#### Read-Only Research Agent

```markdown theme={null}
---
name: researcher
description: Deep codebase research and architecture analysis
model: sonnet
allowed-tools:
  - read
  - grep
  - glob
---

You are a research subagent specializing in codebase exploration.

Your job is to thoroughly investigate a topic and report back with:
- Relevant files and their purposes
- Architecture patterns and dependencies
- Code flow traces with specific line references

Be exhaustive — search broadly and follow references.
```

#### Test Runner Agent

```markdown theme={null}
---
name: test-runner
description: Runs tests and reports results
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

You are a test runner subagent. Run the relevant test suites and report:
- Which tests passed and failed
- Failure messages and stack traces
- Suggestions for fixing failures
```
