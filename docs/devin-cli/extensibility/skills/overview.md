> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Skills Overview

> Create reusable prompts and workflows that extend the agent's capabilities

Skills are self-contained units of functionality that you can teach to Devin CLI. They bundle prompts, tool access, permissions, and workflows into a reusable package that can be invoked by either the agent or the human operator.

***

## What Are Skills?

Think of skills as expert knowledge you give the agent. A skill might teach it how to:

* Review code according to your team's standards
* Generate a specific type of component
* Run a deployment workflow
* Perform a security audit
* Set up a new service from a template

<CardGroup cols={2}>
  <Card title="Slash command invocation" icon="code">
    Users can invoke skills with `/skill-name` in the chat.
  </Card>

  <Card title="Agent autonomy" icon="robot">
    The agent can invoke skills on its own when relevant.
  </Card>

  <Card title="Scoped permissions" icon="shield">
    Skills can have their own permission grants and restrictions.
  </Card>

  <Card title="Custom tool access" icon="wrench">
    Restrict which tools a skill can use for safety.
  </Card>

  <Card title="Subagent execution" icon="users">
    Run skills as independent [subagents](/cli/subagents) with their own context window.
  </Card>

  <Card title="Model override" icon="brain">
    Use a different [model](/cli/models) for specific skills.
  </Card>
</CardGroup>

***

## Quick Example

Create a code review skill at `.devin/skills/review/SKILL.md` (or `.windsurf/skills/review/SKILL.md`):

```markdown theme={null}
---
name: review
description: Review code changes before committing
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Review the current git diff and provide feedback:

1. Run `git diff --staged` (or `git diff` if nothing is staged)
2. Check for:
   - Logic errors or bugs
   - Missing error handling
   - Security issues
   - Style inconsistencies
3. Summarize findings and suggest improvements
```

Now you can invoke it with `/review` in any session.

***

## How Skills Work

When a skill is invoked:

1. The skill's prompt is injected into the conversation
2. Tool access is restricted to the skill's `allowed-tools` (if specified)
3. Additional permissions from the skill's config are applied
4. The specified model is used (if different from the current one)

***

## Skill Triggers

Skills can be invoked in two ways:

| Trigger | Description                                 | Default |
| ------- | ------------------------------------------- | ------- |
| `user`  | User can invoke with `/skill-name`          | Enabled |
| `model` | Agent can invoke autonomously when relevant | Enabled |

```yaml theme={null}
---
name: security-check
triggers:
  - user
  - model
---
```

Set `triggers: [user]` to prevent the agent from invoking a skill on its own.

***

## Third-party Skills

We support the `.agents` skills standards, so third-party skill installation tools work with Devin CLI.

<Warning>
  Third-party skills can execute arbitrary code, so install them at your own risk.
</Warning>

***

## Where Skills Live

Skills can be scoped to a single project or shared across all projects:

| Location                                      | Scope                                    | Committed to git? |
| --------------------------------------------- | ---------------------------------------- | ----------------- |
| `.agents/skills/<name>/SKILL.md`              | Project-specific                         | Yes               |
| `.devin/skills/<name>/SKILL.md`               | Project-specific                         | Yes               |
| `.windsurf/skills/<name>/SKILL.md`            | Project-specific                         | Yes               |
| `~/.agents/skills/<name>/SKILL.md`            | Global (all projects)                    | No                |
| `~/.config/devin/skills/<name>/SKILL.md`      | Global (all projects)                    | No                |
| `~/.codeium/<channel>/skills/<name>/SKILL.md` | Global (all projects, channel-dependent) | No                |

**Project skills** live in the `.devin/skills/` or `.windsurf/skills/` directory at your project root and are committed to version control, making them shareable with your team. Both locations use the same `SKILL.md` format.

**Global skills** live in `~/.config/devin/skills/` (following [XDG conventions](https://specifications.freedesktop.org/basedir-spec/latest/)) or `~/.codeium/<channel>/skills/` (where `<channel>` is `windsurf`, `windsurf-next`, or `windsurf-insiders` depending on your CLI channel) and are available in every project on your machine.

<Note>
  **Windows:** The global skills path follows your system's application data directory. On Windows, use `%APPDATA%\devin\skills\<name>\SKILL.md` (typically `C:\Users\<YourUser>\AppData\Roaming\devin\skills\<name>\SKILL.md`) instead of `~/.config/devin/skills/`.
</Note>

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Creating Skills" icon="plus" href="/cli/extensibility/skills/creating-skills">
    Learn the full skill format including frontmatter options, dynamic content, and examples.
  </Card>

  <Card title="Plugins" icon="box" href="/cli/extensibility/plugins/overview">
    Bundle skills into a plugin you can install and share across projects.
  </Card>
</CardGroup>
