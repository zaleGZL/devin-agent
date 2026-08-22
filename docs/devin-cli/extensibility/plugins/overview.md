> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Plugins

> Reference for installing, authoring, and governing plugins across Devin cloud sessions, the CLI, and Devin Desktop.

<Note>
  Plugins are in **closed beta**. To request access, contact [support@cognition.ai](mailto:support@cognition.ai). Behavior and configuration may change in future releases.
</Note>

A **plugin** is a bundle of [skills](/cli/extensibility/skills/overview) and
optional rules, hooks, MCP servers, or custom subagents that you can install
from a GitHub repo, a git URL, a subfolder of a repo, or a local folder.
Plugins work across Devin cloud sessions, the [Devin CLI](/cli/index), and
Devin Desktop, subject to the surface-specific limitations described below.
Installing a plugin makes its skills available as `/<plugin>:<skill>` slash
commands.

The **plugin is the unit of installation**. Installing a plugin installs all of
its skills and its `requiredPlugins`; you can't install individual skills from a
plugin. To offer skills separately, split them into separate plugins.

A plugin is just a source that contains:

```
my-plugin/
├── .devin-plugin/
│   └── plugin.json     # The plugin manifest
├── AGENTS.md           # Optional always-on rule
├── rules/              # Optional triggered rules
├── agents/
│   └── reviewer.md     # Optional custom subagent (reviewer/AGENT.md also works)
├── hooks.json          # Optional lifecycle hooks
├── .mcp.json           # Optional MCP servers
└── skills/
    └── review/
        └── SKILL.md    # An ordinary skill
```

The `skills/` directory holds ordinary skills — plugins introduce no new skill
format. See [Creating Skills](/cli/extensibility/skills/creating-skills) for the
`SKILL.md` format.

One repo (or one `git-subdir` subfolder) is one plugin. A single repo can host
many plugins as subfolders, each referenced with its own `git-subdir` source.

Beyond skills, a plugin can ship:

* **Rules** — an `AGENTS.md` at the plugin root is injected as an always-on
  rule in every session, alongside your project's own rules. Markdown files in
  a `rules/` folder are loaded too, with the same `trigger` frontmatter and
  [activation types](/cli/extensibility/rules#rule-activation-types)
  as [Windsurf rules](/cli/extensibility/rules#rules-from-other-tools).
* **Custom subagents** — `agents/<name>.md` or `agents/<name>/AGENT.md`
  profiles (the same
  [custom subagent format](/cli/subagents#custom-subagents) as project
  subagents), available
  as `<plugin>:<name>`. Plugin subagents currently load in local Devin agents
  only — the CLI and Devin Desktop — not in cloud Devin sessions.
* **Hooks** — a `hooks.json` at the plugin root registers
  [lifecycle hooks](/cli/extensibility/hooks/lifecycle-hooks) that run in every
  session where the plugin is installed. In cloud sessions, `command` hooks run
  on the session's machine and only fire while that machine is up. They support
  every event except `SessionStart` and `SessionEnd` — including `PreToolUse`,
  `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, and
  `PostCompaction`; `prompt`-type hooks are CLI/local-only.
* **MCP servers** — plugins can provide optional
  [MCP servers](/cli/extensibility/mcp/overview) that start with the session.
  Their tools are available to Devin, although plugin MCP servers don't yet
  appear in the MCP settings UI. A plugin MCP config may set an OAuth client ID
  and scopes, but never a client secret — a server config carrying one is
  rejected at activation.

### Compatible formats

The layout above is Devin's own plugin format. Devin also loads plugins
packaged in two other layouts, with manifest precedence
`.devin-plugin/plugin.json` > `.claude-plugin/plugin.json` > root
`plugin.json`:

* **Claude plugins** — if there's no `.devin-plugin/plugin.json`, Devin falls
  back to `.claude-plugin/plugin.json`. Claude plugins' root `.mcp.json` and
  manifest `mcpServers` field are honored, and `${CLAUDE_PLUGIN_ROOT}` in
  server configs expands to the plugin root.
* **Agent Plugins** — plugins packaged per the open
  [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec)
  spec (a `plugin.json` manifest at the plugin root, MCP servers in a root
  `mcp.json`, skills under `skills/`) load too. For these plugins the root
  `mcp.json` is read as a conventional MCP source (after `.mcp.json`, which
  wins on a server-name collision) — legacy Devin/Claude-layout plugins never
  read it unless their manifest declares it explicitly. MCP entries may
  declare their transport with the spec's `type` field (`stdio`,
  `streamable-http`, or `sse`) instead of `transport`, and `${PLUGIN_ROOT}`
  in server configs expands to the plugin root like `${CLAUDE_PLUGIN_ROOT}`.
  An unrecognized `$schema` version is warned about and the plugin still
  loads best-effort.

  Agent Plugins MCP servers also get the spec's runtime conventions (these
  apply only to plugins whose manifest is the root `plugin.json`; Devin and
  Claude layouts behave exactly as before):

  * `${PLUGIN_DATA}` in `args`, `env` values, and `cwd` expands to a
    persistent, writable per-plugin data directory. The directory is keyed by
    plugin identity — not version — so its contents survive plugin updates,
    and it's deleted when the plugin is uninstalled.
  * `stdio` server processes receive `PLUGIN_ROOT` and `PLUGIN_DATA`
    environment variables alongside any `env` the config sets.
  * A server may set `cwd` (relative to the plugin root); it defaults to the
    plugin root. A `./`-prefixed `command` resolves against the plugin root,
    so plugins can ship their own executables. Both are validated to stay
    inside the plugin root or data directory.

***

## Installing a plugin

A plugin source can be a GitHub `owner/repo`, a git URL, or a local path:

```bash theme={null}
# From GitHub
devin plugins install acme/review-tools

# From any git host
devin plugins install https://gitlab.com/acme/review-tools.git

# From a local folder (great for authoring)
devin plugins install ./my-plugin
```

Before installing, Devin shows what the plugin adds — the skills it provides,
any required plugins that will be auto-installed, and any policy it introduces
(for example, if it forbids other plugins). Pass `-y` / `--yes` to skip the
prompt.

Plugins are installed at the **user** level and are available across all your
projects.

***

## Managing plugins

```bash theme={null}
# List installed plugins, their versions, and whether any are blocked by policy
devin plugins list

# Show a plugin's skills and its required/optional/forbidden lists
devin plugins info review-tools

# Re-fetch a plugin (or all plugins) at the latest version
devin plugins update review-tools
devin plugins update

# Remove a plugin (auto-installed required plugins are left in place)
devin plugins remove review-tools
```

Local plugins are linked directly to their source folder, so edits are live:
`devin plugins install ./my-plugin` → edit `skills/<name>/SKILL.md` → changes
apply on the next session, no `update` needed.

***

## Manifest

`.devin-plugin/plugin.json` describes the plugin. Only `name` is required, and
it must be unique among installed plugins (it is the `/<name>:…` namespace).
Names are lowercase alphanumeric characters with single `-` or `.` separators
(e.g. `review-tools`, `acme.tools`).

```jsonc theme={null}
{
  "name": "review-tools",
  "version": "1.0.0",
  "description": "Code-review skills for our team",
  "requiredPlugins": [
    "acme/secure-base",
    { "source": "github", "repo": "acme/audit-logging" }
  ],
  "optionalPlugins": [
    "acme/deploy-tools",
    { "source": "url", "url": "https://gitlab.com/acme/extra.git" }
  ],
  "forbiddenPlugins": ["sketchy-org/bad-plugin", "acme/*", "*"]
}
```

### Metadata

`name`, `version`, `description`, `author` (`{ name, email }`), `homepage`,
`repository`, `license`, and `keywords`. Only `name` is used for the plugin's
identity and namespace; the rest are descriptive and shown by
`devin plugins info`.

### Skills & Rules

The `skills` field controls where skills load from, replacing the default
`skills/` directory. It accepts a single plugin-root-relative path or an array
of them:

```jsonc theme={null}
{ "skills": "custom-skills" }
{ "skills": ["skills", "extra/skills"] }
```

An empty array (`"skills": []`) disables skill loading entirely. Paths must
stay inside the plugin — absolute paths, `~`, and `..` traversal are rejected,
and an invalid entry fails the whole manifest.

Rules load independently of `skills`: an `AGENTS.md` at the plugin root is
always-on, and Markdown files in the `rules/` directory are loaded as triggered
rules. See [Rules](/cli/extensibility/rules) for activation details.

### MCP Servers

The `mcpServers` field adds [MCP server](/cli/extensibility/mcp/overview)
declarations. Plugins can also use the conventional root `.mcp.json` (and
`mcp.json` for plugins using the Agent Plugins root-manifest layout). Four
shapes are accepted:

```jsonc theme={null}
// One declaration file
{ "mcpServers": "config/mcp.json" }

// Several, read in the order listed
{ "mcpServers": ["config/mcp.json", "config/extra.json"] }

// Only these files — suppresses the root .mcp.json / mcp.json convention
{ "mcpServers": { "paths": ["config/mcp.json"], "exclusive": true } }

// Inline server map (suppresses the root convention when non-empty)
{ "mcpServers": { "linear": { "command": "npx", "args": ["-y", "linear-mcp"] } } }
```

Declared paths follow the same containment rules as `skills`, but unsafe
entries are dropped rather than failing the plugin. An invalid `mcpServers`
field only disables MCP loading, leaving skills, rules, and hooks usable. An
empty array adds no declaration files but does not suppress the root convention.
An empty inline map likewise leaves the root convention enabled. When the same
server name appears in more than one source, the first source wins.

### Dependencies

A dependency entry is a **source** — either a string shorthand or an object:

| Form                                                               | Meaning                                         |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| `"owner/repo"`                                                     | GitHub repository                               |
| `"https://…"`, `"git@…"`, `"ssh://…"`                              | any git URL                                     |
| `{ "source": "github", "repo": "owner/repo" }`                     | GitHub, object form                             |
| `{ "source": "url", "url": "https://gitlab.com/team/plugin.git" }` | git URL, object form                            |
| `{ "source": "git-subdir", "url": "…", "path": "sub/dir" }`        | a plugin living in a subfolder of a shared repo |

All GitHub forms for the same repo (`owner/repo`, the HTTPS URL, the `.git` URL, the SSH form) refer to the same plugin identity.

A plugin can declare three lists, which let a single plugin act as a curated,
governed collection of other plugins.

#### `requiredPlugins`

Auto-installed (recursively) when the plugin is installed. If a required plugin
is blocked by policy, the whole install fails — there is no partial install.

#### `optionalPlugins`

An **allow-list** of plugins this plugin endorses. They are **not**
auto-installed; the list only matters as a carve-out against a forbidden entry
(see below).

#### `forbiddenPlugins`

A **deny-list** of plugin identities and glob patterns.

`forbiddenPlugins` entries are matched against plugin identities:

* An **exact identity**, written as `owner/repo` or a git URL. All GitHub forms of the same repo (`owner/repo`, the HTTPS URL, the `.git` URL, the SSH form) refer to the same identity.
* A **glob pattern** — any entry containing `*`. The `*` matches any sequence of characters, including `/`: `acme/*` matches all of `acme`'s GitHub repos, `*/secrets` matches a repo named `secrets` under any owner, and `https://gitlab.com/acme/*` matches any repo under that path.
* The lone `"*"`, which matches everything else (a full lockdown).

The lists combine deny-wins:

* **Deny wins.** A plugin is blocked if any active manifest or installed plugin forbids it. If nothing forbids anything, nothing is blocked.
* **Self-override.** A manifest's (or plugin's) own `requiredPlugins` and `optionalPlugins` — and, for a plugin, the plugin itself — are exempt from its **own** forbidden list, so `"forbiddenPlugins": ["*"]` plus `"optionalPlugins": ["acme/approved"]` means "allow only what this manifest lists; forbid everything else." The carve-out covers only those direct entries, not a required plugin's transitive dependencies — list those explicitly under a lockdown.
* **No cross-scope re-permitting.** One manifest's or plugin's allow-list cannot re-permit what **another** forbids. A `"forbiddenPlugins": ["*"]` lockdown can't be defeated from a lower scope.

Enforcement happens at two points:

* **Install time** — installing a blocked plugin (or one whose required plugins can't be satisfied, or whose name collides with an installed plugin) is refused.
* **Load time** — a plugin blocked after it's already installed stays on disk, but its skills are skipped at session start with a warning naming the forbidder.

A forbidden identity can also be a **local path** (for plugins installed from a
local folder), in addition to the `owner/repo` and git-URL forms above.

***

## Inheritance and levels

Plugins aren't declared in one place. Beyond your own installs, plugins can be
required, endorsed, or forbidden by your repo and by your organization's admin.
Each source is a **level**, and the levels are ranked by **authority**, highest
first:

1. **Enterprise** — the account-wide managed manifest, configured by an admin.
2. **Org** — an org-level managed manifest, layered below its account (an org
   can add to what its account declares, but can't overrule it). This applies
   only to **cloud Devin sessions**: the CLI authenticates at the account level
   and has no org context, so org-level requires and forbids don't reach CLI
   users. Put anything you need enforced in the CLI in the enterprise/account
   manifest.
3. **Repo** — the `requiredPlugins` / `optionalPlugins` / `forbiddenPlugins` in a
   checkout's `.devin/config.json`, discovered by walking up from your working
   directory.
4. **User** — plugins you install yourself with `devin plugins install`.

Every level declares the same three lists, and within a level they combine with
the same [deny-wins, self-override rules](#dependencies) as a
single manifest. What the levels add on top is one rule: **higher authority
wins**.

### Higher authority wins

* A lower level can never **re-permit** what a higher level forbids.
* A lower level can never **forbid** what a higher level requires — the forbid is
  ignored and the plugin still loads.

So an admin can mandate a plugin no repo or user can opt out of, and forbid a
plugin no lower level can bring back.

### A denylist is only overridden at its own level

Because allow-lists don't cross levels, the **only** way to carve an exception
out of a denylist is at the same level that declared it. A level's `forbiddenPlugins`
is overridden only by that same manifest's own `optionalPlugins` (or
`requiredPlugins`) — never by a list at a lower level.

For example, an enterprise-level managed manifest can lock the account down to a
single approved plugin:

```jsonc theme={null}
// Enterprise-level managed manifest
{
  "forbiddenPlugins": ["*"],
  "optionalPlugins": ["acme/approved"]
}
```

This means "across the whole account, allow only `acme/approved` and forbid
every other plugin." No org, repo, or user can widen that allow-list — not by
installing a plugin, and not by adding it to a lower level's `optionalPlugins`.
The carve-out also covers only the entries this manifest lists directly; a
required plugin's own transitive dependencies aren't exempt, so list those
explicitly under a lockdown.

### Conflicts and dependencies

* A require and a forbid for the same plugin at the **same level** but from
  **different manifests** (for example two separately installed user-level
  plugins) resolve to the forbid — an allow-list only exempts entries in its
  *own* manifest, so it can't rescue a plugin another manifest forbids. (Within
  a single manifest, its own required/optional stay exempt from its own forbids,
  as [above](#a-denylist-is-only-overridden-at-its-own-level).)
* A plugin blocked by governance **soft-fails**: at session start its skills are
  skipped with a warning naming the forbidder, rather than aborting the session.
* Being depended upon grants no exemption. A plugin pulled in only as a
  transitive dependency is still subject to every forbid that applies to it, and
  it inherits the highest authority level of any plugin that requires it.
