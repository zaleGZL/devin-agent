> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Rules & AGENTS.md

> Provide always-on instructions and context that guide the agent in every session

Rules are persistent instructions that shape how Devin CLI behaves in your project. They're injected into the agent's context at the start of every session, ensuring consistent behavior across your team.

Common uses for rules include coding standards, architectural guidelines, preferred libraries, testing conventions, and project-specific constraints.

**To improve coding ability, speed of completion, and lower cost**, we highly recommend **using Skills instead whenever possible**. Skills are only injected into the context when relevant. **Rules and AGENTS should be kept as small as possible.**

**Our recommended pattern** is to use a rule to reference skills that the model should use in particular scenarios.

***

## AGENTS.md

The simplest way to add rules is with an `AGENTS.md` file at your project root:

```markdown theme={null}
# Project Rules

- Use TypeScript for all new files
- Follow the existing patterns in src/components/
- Always run `npm run lint` before committing
- Use pnpm, not npm or yarn
- Write tests for all new utility functions
```

Devin CLI reads this file automatically.

<Tip>
  `AGENTS.md` is the recommended approach for project rules. It's easy to read, version-controlled, and works across multiple AI tools.
</Tip>

***

## Global Rules

You can also create rules that apply to **every project** by placing an `AGENTS.md` file in your user config directory:

<Tabs>
  <Tab title="Linux / macOS">
    ```
    ~/.config/devin/AGENTS.md
    ```
  </Tab>

  <Tab title="Windows">
    ```
    %APPDATA%\devin\AGENTS.md
    ```
  </Tab>
</Tabs>

Global rules are loaded at the start of every session, regardless of which project you're working in. Use them for personal preferences that apply everywhere:

```markdown theme={null}
# My Global Rules

- Always write commit messages in conventional commit format
- Prefer functional patterns over imperative code
- Run tests before suggesting a task is complete
```

Global rules work alongside project rules — both are loaded and active at the same time. `AGENT.md` is also supported at this location.

<Tip>
  If you use Claude Code, Devin CLI also reads `~/.claude/CLAUDE.md` as a global rule.
</Tip>

***

## Personal Rules with AGENTS.local.md

If you have personal instructions that shouldn't be shared with collaborators — such as preferred working style, testing habits, or review preferences — create an `AGENTS.local.md` file next to your `AGENTS.md`:

```markdown theme={null}
# My Personal Rules

- Always start by writing failing tests before implementing a fix
- Prefer functional patterns over imperative code
- Run the full test suite before marking a task as complete
```

This file is loaded alongside `AGENTS.md` with the same always-on behavior. Add it to your `.gitignore` so it stays local:

```gitignore theme={null}
AGENTS.local.md
```

<Tip>
  This follows the same convention as `.devin/config.local.json` — the `.local.` suffix signals a personal override that shouldn't be committed.
</Tip>

***

## Supported File Names

Devin CLI reads rules from any of these files:

| File              | Notes                           |
| ----------------- | ------------------------------- |
| `AGENTS.md`       | Recommended                     |
| `AGENTS.local.md` | Personal rules (gitignored)     |
| `AGENT.md`        | Singular alternative            |
| `.windsurfrules`  | Legacy Windsurf workspace rules |
| `CLAUDE.md`       | Compatible with Claude Code     |

All of these are treated identically — their contents are loaded as always-on rules.

These files can exist at multiple levels in your project (not just the root). Files at the workspace root are loaded at session start. Files in subdirectories are discovered lazily when the agent accesses files in that directory, keeping the context focused on the relevant part of the codebase.

They can also be placed in the [global config directory](#global-rules) to apply across all projects, except `CLAUDE.md` which is read globally from `~/.claude/CLAUDE.md`.

Installed [plugins](/cli/extensibility/plugins/overview) can ship rules too: an always-on `AGENTS.md` at the plugin root plus `rules/*.md` files with `trigger` frontmatter.

***

## Rules in the .devin Directory

Devin CLI also reads rules from the `.devin/` directory, one rule per file:

| Path                     | Notes                                             |
| ------------------------ | ------------------------------------------------- |
| `.devin/rules/*.md`      | One rule per file. Supports `trigger` frontmatter |
| `.devin/global_rules.md` | Single always-on file                             |

These files use the same frontmatter as `.windsurf/rules/*.md`, so the `trigger` values `always_on`, `manual`, `model_decision`, `agent`, and `glob` all apply.

`.devin/` is the preferred location and takes precedence over `.windsurf/`. If both `.devin/global_rules.md` and `.windsurf/global_rules.md` exist, Devin CLI loads only `.devin/global_rules.md`. Rule files in `.devin/rules/` and `.windsurf/rules/` are both loaded.

Like other project rules, these directories are read at the workspace root and in each directory between the workspace root and your current directory. You can also place them in your home directory (`~/.devin/rules/*.md`, `~/.devin/global_rules.md`) to apply them to every project.

***

## Rules From Other Tools

If you're coming from another AI coding tool, Devin CLI can read your existing rules:

<AccordionGroup>
  <Accordion title="Cursor">
    Devin CLI reads from `.cursor/rules/*.md` and `.cursor/rules/*.mdc`.

    Cursor rules support frontmatter to control activation:

    ```markdown theme={null}
    ---
    description: "React component guidelines"
    globs: "src/components/**/*.tsx"
    alwaysApply: false
    ---

    Use functional components with hooks. Never use class components.
    ```

    **Activation behavior:**

    * `alwaysApply: true` — Always active
    * `globs` specified — Active when working with matching files
    * `description` only — Agent decides when to apply
    * None of the above — User must invoke manually
  </Accordion>

  <Accordion title="Windsurf">
    Devin CLI reads from `.windsurf/rules/*.md` and `.windsurf/global_rules.md`. The Devin-native [`.devin/` equivalents](#rules-in-the-devin-directory) take precedence.

    **Subdirectory support:** `.windsurf/rules/` directories can exist at multiple levels in your project, not just the root. Rules at the workspace root are loaded at session start. Rules in subdirectories are discovered lazily — when the agent accesses files in that directory, any `.windsurf/rules/` found there (and in parent directories up to the workspace root) are automatically loaded. This avoids polluting the agent's context with rules from unrelated parts of the project.

    Windsurf rules support frontmatter:

    ```markdown theme={null}
    ---
    description: "API design rules"
    trigger: always_on
    ---

    All API endpoints must return JSON with a consistent envelope format.
    ```

    **Trigger values:** `always_on`, `manual`, `model_decision`, `agent`, `glob`
  </Accordion>

  <Accordion title="Claude Code">
    Devin CLI reads from the `.claude/` directory.
  </Accordion>
</AccordionGroup>

<Warning>
  Devin CLI does not support `.codeiumignore` files. If you use Codeium's autocomplete and have configured ignore patterns, those patterns will not apply to Devin CLI.
</Warning>

***

## Controlling Imports

You can enable or disable reading from specific tool formats in your config file (`~/.config/devin/config.json` — or `%APPDATA%\devin\config.json` on Windows — or `.devin/config.json`):

```json theme={null}
{
  "read_config_from": {
    "agents_standard": true,
    "cursor": true,
    "windsurf": true,
    "claude": true
  }
}
```

Standard project rules from `AGENTS.md`, `AGENTS.local.md`, `AGENT.md`, and `.windsurfrules` are read by default. Set `"agents_standard": false` to disable importing them.

***

## Rule Activation Types

Rules loaded from external formats may have different activation behaviors:

| Type               | Behavior                                                          |
| ------------------ | ----------------------------------------------------------------- |
| **Always-on**      | Active in every session, no user action needed                    |
| **Glob-activated** | Active when the agent works with files matching specific patterns |
| **Agent-decided**  | The agent chooses when to apply based on the rule's description   |
| **User-invocable** | Only active when explicitly triggered by the user                 |

Rules from `AGENTS.md` are always "always-on".

***

## Best Practices

<CardGroup cols={2}>
  <Card title="Keep rules concise" icon="compress">
    Long, verbose rules dilute the agent's attention. Focus on what matters most.
  </Card>

  <Card title="Be specific" icon="bullseye">
    "Use pnpm" is better than "use the right package manager". Concrete instructions are easier to follow.
  </Card>

  <Card title="Include examples" icon="code">
    Show the pattern you want, not just a description of it.
  </Card>

  <Card title="Version control them" icon="code-branch">
    Keep rules in your repo so the whole team benefits from the same guidelines.
  </Card>
</CardGroup>

<Note>
  For most common types of rules, consider using skills instead. Skills give you more control over when and how they're applied.
</Note>
