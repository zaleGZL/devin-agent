> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Creating Skills

> Full reference for the SKILL.md format and frontmatter options

Skills are defined as `SKILL.md` files inside a named directory. This page covers everything you need to know to write effective skills.

***

## File Structure

Place skills in the appropriate directory depending on scope:

```
# Project-specific (committed to git)
.devin/skills/
└── my-skill/
    └── SKILL.md

# Global — available in all projects (not committed)
# Linux/macOS:
~/.config/devin/skills/
└── my-skill/
    └── SKILL.md

# Windows:
%APPDATA%\devin\skills\
└── my-skill\
    └── SKILL.md
```

The directory name is the skill's identifier (used for `/my-skill` invocation). The `SKILL.md` file contains optional YAML frontmatter and the skill's prompt content.

<Note>
  On Windows, `%APPDATA%` typically resolves to `C:\Users\<YourUser>\AppData\Roaming`.
</Note>

***

## Frontmatter Reference

```yaml theme={null}
---
name: my-skill
description: What this skill does (shown in completions)
argument-hint: "[file] [options]"
model: sonnet
subagent: true
allowed-tools:
  - read
  - grep
  - glob
  - exec
permissions:
  allow:
    - Read(src/**)
  deny:
    - exec
  ask:
    - Write(**)
triggers:
  - user
  - model
---

Your prompt content goes here...
```

### All Frontmatter Fields

| Field           | Type    | Default         | Description                                                                                             |
| --------------- | ------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | string  | directory name  | Display name of the skill                                                                               |
| `description`   | string  | none            | Shown in slash command completions                                                                      |
| `argument-hint` | string  | none            | Hint shown after the command name (e.g., `[filename]`)                                                  |
| `model`         | string  | current model   | Override the model used when running this skill                                                         |
| `subagent`      | boolean | `false`         | Run the skill as a [subagent](/cli/subagents) instead of inline                                         |
| `agent`         | string  | none            | Run the skill as a subagent using a specific [custom subagent](/cli/subagents#custom-subagents) profile |
| `allowed-tools` | list    | all tools       | Restrict which tools the skill can use                                                                  |
| `permissions`   | object  | inherit         | Permission overrides for this skill                                                                     |
| `triggers`      | list    | `[user, model]` | How the skill can be invoked                                                                            |

***

## Model Override

Use the `model` field to run a skill with a different model than the one active in the current session. This is useful for using a faster model for simple tasks or a more capable model for complex ones:

```yaml theme={null}
---
name: quick-fix
description: Fast lint fix using a lightweight model
model: swe
---

Fix the lint errors in the current file.
```

The model name uses the same values as the `--model` CLI flag (e.g., `opus`, `sonnet`, `swe`, `codex`). See [Models](/cli/models) for the full list.

***

## Running Skills as Subagents

<Warning>
  Running skills as subagents is **experimental**. The `subagent` and `agent` frontmatter fields may change in future releases.
</Warning>

By default, a skill's prompt is injected into the current conversation — the agent processes it inline. You can instead run a skill as a **subagent**, which spawns an independent worker with its own context window. This is useful for skills that perform focused, self-contained tasks where you don't want the output to clutter the main conversation.

There are two ways to run a skill as a subagent:

### `subagent: true`

Set `subagent: true` to run the skill as a subagent using the default `subagent_general` profile:

```yaml theme={null}
---
name: deep-research
description: Thorough codebase research on a topic
subagent: true
model: sonnet
allowed-tools:
  - read
  - grep
  - glob
---

Research the topic the user asked about thoroughly.

Search broadly, follow references, and trace call chains.
Report all findings with specific file paths and line numbers.
```

When invoked, this skill spawns a foreground subagent that runs the skill's prompt as its task. The parent agent waits for the subagent to complete, then reads and summarizes the results.

### `agent: <profile>`

Use the `agent` field to run the skill as a subagent with a specific [custom subagent profile](/cli/subagents#custom-subagents):

```yaml theme={null}
---
name: review-pr
description: Review the current PR using the reviewer subagent
agent: reviewer
---

Review the staged changes for correctness, security, and style issues.
```

The `agent` value must match the name of a registered subagent profile (either built-in like `subagent_explore` / `subagent_general`, or a custom profile you've defined). The subagent inherits the profile's system prompt, tool restrictions, and model — while the skill's content becomes the task.

<Note>
  If both `agent` and `subagent` are set, `agent` takes precedence. The `model` field on the skill overrides the subagent profile's model when both are specified.
</Note>

<Note>
  Skills running as subagents do not spawn nested subagents — if the skill is already executing inside a subagent, it runs inline instead to prevent infinite recursion.
</Note>

### Orchestrating Subagents Using Skills

Because skills can run as subagents, you can use them to orchestrate multi-step work. Define a set of subagent skills that each handle a focused task, then write a regular skill that invokes them. The outer skill becomes the orchestrator — it calls each subagent, collects the results, and decides what to do next.

For example, here are two subagent skills and an orchestrator that coordinates them:

```markdown theme={null}
---
name: research-changes
description: Research recent code changes and their impact
subagent: true
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Analyze the recent changes in this repository:

1. Run `git log --oneline -20` to see recent commits
2. For each significant commit, examine what changed and why
3. Identify any patterns, risks, or areas that need attention

Report your findings with specific file paths and commit references.
```

```markdown theme={null}
---
name: validate-tests
description: Run tests and validate coverage for recent changes
subagent: true
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Validate the test suite for the project:

1. Identify the test framework and run command
2. Run the full test suite
3. Check for any failing tests
4. Review test coverage for recently changed files

Report which tests pass, which fail, and any coverage gaps.
```

```markdown theme={null}
---
name: health-check
description: Full project health check — research changes then validate tests
---

Perform a full health check on this project:

1. First, use the /research-changes skill to understand recent changes
2. Then, use the /validate-tests skill to verify the test suite
3. Finally, synthesize the findings from both into a summary:
   - What changed recently and why
   - Whether tests are passing
   - Any risks or recommended actions
```

Invoking `/health-check` runs the orchestrator in the main agent. It calls `/research-changes`, which spawns a subagent to explore the repo. Once that finishes, it calls `/validate-tests`, which spawns another subagent to run the tests. The orchestrator then synthesizes both results into a final summary.

A subagent skill will **never** use a subagent when calling other skills, even if those skills have `subagent: true` — they run inline instead. This means you don't need to worry about unbounded nesting. The orchestration pattern is always one level deep: the orchestrator spawns subagents, and those subagents execute everything else inline.

***

## Prompt Content

The body of the SKILL.md file (after the frontmatter) is the prompt that gets injected when the skill is invoked.

***

## Permissions

Skills can define their own permission scope using the same syntax as the main permissions config:

```yaml theme={null}
permissions:
  allow:
    - Read(src/**)
    - Exec(npm run test)
  deny:
    - Write(/etc/**)
    - exec
  ask:
    - Write(src/**)
```

**How skill permissions work:**

* `allow` — These scopes are auto-approved during skill execution
* `deny` — These scopes are blocked during skill execution
* `ask` — These scopes always prompt the user

<Note>
  Skill permissions are additive to (not replacing) the session's base permissions. A skill cannot grant permissions that are denied at a higher level (project or organization config).
</Note>

***

## Allowed Tools

Restrict which tools the skill can use:

```yaml theme={null}
allowed-tools:
  - read
  - grep
  - glob
```

Available tool names: `read`, `edit`, `grep`, `glob`, `exec`

You can also allow MCP tools:

```yaml theme={null}
allowed-tools:
  - read
  - mcp__github__list_issues
  - mcp__github__create_issue
```

<Warning>
  If `allowed-tools` is not specified, the skill has access to all tools. For safety-critical skills, always restrict to the minimum needed.
</Warning>

***

## Examples

### Code Review Skill

```markdown theme={null}
---
name: review
description: Review staged changes for issues
allowed-tools:
  - read
  - grep
  - glob
  - exec
permissions:
  allow:
    - Exec(git diff)
    - Exec(git log)
---

Run `git diff --staged` and review the changes for quality issues.

Evaluate:
1. **Correctness** — Any logic errors or edge cases?
2. **Security** — Any vulnerabilities introduced?
3. **Performance** — Any obvious inefficiencies?
4. **Style** — Consistent with the codebase?

Provide a summary with specific line references.
```

### Component Generator

```markdown theme={null}
---
name: component
description: Generate a React component from a description
argument-hint: "<ComponentName>"
allowed-tools:
  - read
  - edit
  - grep
  - glob
model: sonnet
permissions:
  allow:
    - Write(src/components/**)
---

Create a new React component using the name the user provides:

1. Check existing components in src/components/ for style conventions
2. Create the component file at src/components/<ComponentName>/<ComponentName>.tsx
3. Create a barrel export at src/components/<ComponentName>/index.ts
4. Add basic tests at src/components/<ComponentName>/<ComponentName>.test.tsx
5. Follow the patterns you find in existing components
```

### Deployment Checklist

```markdown theme={null}
---
name: deploy
description: Run through the deployment checklist
triggers:
  - user
allowed-tools:
  - read
  - exec
  - grep
permissions:
  allow:
    - Exec(npm run)
    - Exec(git)
---

Run through the deployment checklist:

1. Run the test suite: `npm run test`
2. Run the linter: `npm run lint`
3. Check for uncommitted changes: `git status`
4. Verify the build: `npm run build`
5. Show the current branch and last commit

Report the status of each step. If anything fails, stop and explain the issue.
```

### Search Expert

```markdown theme={null}
---
name: find
description: Find relevant code across the project
argument-hint: "<what to find>"
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Search the codebase thoroughly for what the user asked about.

Use grep for content search and glob for file discovery.
Provide relevant file paths and code snippets.
Explain how the pieces connect.
```

***

## Tips

<CardGroup cols={2}>
  <Card title="Keep prompts focused" icon="bullseye">
    A skill should do one thing well. Create multiple skills rather than one mega-skill.
  </Card>

  <Card title="Include examples" icon="lightbulb">
    Show the agent what good output looks like in your prompt.
  </Card>

  <Card title="Use allowed-tools" icon="shield">
    Restricting tools makes skills safer and more predictable.
  </Card>

  <Card title="Test with /skill-name" icon="play">
    Invoke your skill and iterate on the prompt until the output is what you want.
  </Card>
</CardGroup>
