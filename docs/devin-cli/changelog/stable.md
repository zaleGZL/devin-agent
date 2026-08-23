> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Changelog (Stable)

> Release notes for the Devin CLI stable channel: new features, improvements, and fixes in each stable release of the command-line interface.

<Update label="v3000.5.20" description="August 21, 2026">
  ### Added

  * New `devin rm <session-id-or-name>` deletes a session, with confirmation by default and `--force` for non-interactive use; deletion is refused while another Devin instance has the session open.
  * New `devin desktop` shortcut opens Devin Desktop if installed, and a bare path such as `devin .` opens Devin Desktop on that path.
  * New `devin doctor` command checks custom subagent profiles for incorrect frontmatter.
  * New `/recap` command catches you up on the session with a short agent-generated summary of what was worked on, key decisions, and where things stand.
  * New `/rename <new title>` renames the current session.
  * New Alt+P shortcut toggles Plan mode without clearing the input.
  * `/handoff` now asks which OS the cloud session should continue in when your organization has more than one platform available, instead of silently reusing the last cloud session's environment.
  * Ask and Plan modes can now use the read-only `webfetch` and `notebook_read` tools for research.
  * Plugins are now compatible with the [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) format.
  * Plan mode writes plans to a file so they always have a heading and summary paragraph.
  * The subagent tray and detail view show which model a subagent is running on when it differs from the parent's model.
  * Accounts billed in credits now see a model's credit multiplier in the model selector (e.g. `1.25 credits / message`) instead of only a relative cost label.
  * The input footer shows a "ctrl+v to paste image in clipboard" hint while an image is on the system clipboard.

  ### Changed

  * Instant slash commands (`/status`, `/context`, `/fast`, `/session-stats`, `/help`, etc.) now run immediately while the agent is working instead of queueing until the turn finishes, render their replies in scrollback instantly rather than through the typewriter, and pair each reply with its own command.
  * Unknown slash commands now fail instantly with `Unknown command: /notacommand. Use /help to see available commands.`
  * `/model`, `/models`, the model keyboard shortcuts, and the footer model picker now apply while Devin is working, so the next request uses the selected model.
  * `/btw` now opens a side-chat panel that runs in parallel with the main agent: questions are answered from the conversation's context while the agent keeps working.
  * `/usage` shows a richer panel: daily/weekly quota progress bars with reset times, an extra usage balance line when present, and more info on the current session.
  * The session picker (`devin -r`, `/resume`, `devin ls`) shows all sessions by default with the current directory's sessions sorted to the top; Alt+G narrows to the current directory.
  * The background shells tray (Ctrl+B) lists all running background commands.
  * Command card titles show the meaningful command instead of the first shell token, skipping `cd`, environment prefixes, and wrappers like `sudo`/`env`
  * Queued messages render in a distinct "N queued" section above the input box with `↑ edit` / `↵ send now` hints.
  * Faster session startup, especially in large repositories with many rule and skill files.
  * On Unix, cancelling or timing out a shell command now sends SIGTERM to the process group first and SIGKILL only after a 5-second grace period.
  * Read-only git command detection is now shared across bash, PowerShell, and smart mode.
  * `/bug` opens the bug submitter when run without a description, rejects submissions from outdated CLI versions, and shows a checklist receipt of what was sent (with the local zip path for zero-data-retention accounts).
  * Presentation polish across the REPL: agent output is inset by one column with tighter tool cards, code blocks are indented two cells with balanced padding, inline code has padded backgrounds, `/help` aligns and dims descriptions, the interrupt hint turns a warning color, and the first-run welcome screen is a compact tips card.
  * Broader Claude plugin compatibility: hooks are also loaded from `hooks/hooks.json`, hook commands additionally receive `CLAUDE_PROJECT_DIR` and `CLAUDE_PLUGIN_ROOT`, and subagent profiles accept the `tools` frontmatter field as an alias for `allowed-tools`.
  * The model picker has been redesigned for improved price transparency and more intuitive navigation.

  <img src="https://mintcdn.com/cognitionai/28VZY2GeB9guWe6v/images/cli/changelog/model-picker-3000.5.20.png?fit=max&auto=format&n=28VZY2GeB9guWe6v&q=85&s=d1d2c10f0391b6a2732de4147dfa5a0c" alt="The reworked Devin CLI model picker: model list with reasoning effort and Fast Mode columns, pricing beneath, and a new/promotion/beta legend" width="1024" height="648" data-path="images/cli/changelog/model-picker-3000.5.20.png" />

  ### Fixed

  * Hitting a monthly usage limit now shows a "Usage limit reached" alert with a clickable "Request more usage" link instead of a raw permission-denied error, and the "Quota exhausted" alert links to usage settings.
  * Background shells keep streaming live output to their command card after the turn ends — including after an interruption — and show the full output on completion instead of a 1000-character preview.
  * Command cards carry the full retained terminal scrollback (up to \~3500 lines), show a scrollable \~100-line window while streaming, elide the middle of very large output with a marker instead of showing only a tail, and no longer lose chunks from commands that emit fast bursts.
  * Shell commands with endless output no longer grow memory without bound.
  * `--continue` now continues the most recent session in the current directory that is not already open in another process, instead of failing on a locked session.
  * A single invalid value in `config.json` no longer discards all user settings.
  * Permission rules now match correctly when a workspace, config, or granted directory name contains glob metacharacters such as `[`, `]`, `{`, `}`, `*`, or `?`.
  * `SessionEnd` lifecycle hooks now run when a session ends, with a `reason` matching Claude Code's vocabulary.
  * `Stop` hooks now receive `last_assistant_message` in their stdin payload, so they can read the agent's final response without parsing a transcript. Hooks contributed by a plugin also get `DEVIN_PLUGIN_ROOT`.
  * Hooks from a second workspace directory now run in that workspace, and `DEVIN_PROJECT_DIR` always points at the hook's project root.
  * Skills, rules, hooks, and subagent profiles that come from an installed plugin now appear in the Skills, Rules, Hooks, and Subagents lists, labeled with the plugin's name.
  * Invoking a skill passes the whole `SKILL.md` to the model instead of truncating it to the tool-result budget, and `$ARGUMENTS` / `$1`–`$9` placeholders are interpolated with the arguments passed to `/skill-name`.
  * Skills discovered mid-session are listed again after context compaction instead of disappearing for the rest of the session.
  * Ask and Plan modes can use web search for read-only research when the tool is available.
  * Pressing `x` on the tray's Subagents tab kills only the selected subagent instead of cancelling the whole turn.
  * An interrupted auto-update can no longer leave the installation broken with `current` pointing at a missing version directory; `devin update` also repairs an already-dangling installation.
  * Windows: multi-line pastes no longer split into separate prompts, `pty_for_noninteractive_exec` no longer makes every non-interactive command hang, cancelled commands kill the whole process tree, and Chrome discovery checks per-user installations.
  * Terminal rendering fixes: multiline paste works in terminals without bracketed paste, selection lists scroll instead of overflowing short terminals, searchable pickers move the highlight to the adjacent visible row, wrapped inline code no longer leaves a stray highlighted cell, the live area flickers less when it resizes, streaming tool-call arguments animate smoothly again, and sending queued messages no longer shows a spurious cancellation prompt.
</Update>

<Update label="v3000.4.25" description="August 13, 2026">
  ### Changed

  * `/share` now displays the share URL returned by the Devin server, so the link always matches where the server hosts the share; the CLI only builds the URL itself when talking to older servers.

  ### Fixed

  * MCP servers whose protected-resource metadata lists `resource` as an array, such as self-hosted GitLab servers at `/api/v4/mcp`, now complete OAuth discovery instead of failing with an authorization-server issuer mismatch.
</Update>

<Update label="v3000.4.16" description="August 10, 2026">
  ### Added

  * `devin auth status` now shows the primary organization for enterprise accounts.
  * Nested `AGENTS.md` files, lowercase `agents.md` files, and rules in supported dot-directories are now discovered and remain scoped to the directory where they apply.
  * Completed `ask_user_question` prompts now appear as `/steps` entries that you can revert to or fork from. Reverting to a question asks it again.
  * Press Esc twice within three seconds to interrupt a running turn; Ctrl+C still interrupts on the first press.

  ### Removed

  * We have removed the shell integration feature. It was in preview and we have decided not to make it generally available. Use `devin shell remove` to clean up old integration blocks.

  ### Changed

  * Slash-command completion descriptions now appear for every result in a consistent aligned column.
  * `/add-dir` now checks workspace trust before attaching an untrusted directory, makes attached directories writable in the OS sandbox, and revokes that access when they are removed. Skills from attached directories also appear immediately in slash-command completion.
  * Plugin installation now uses personal plugins by default, syncing to Devin Cloud and other devices; use `--local` for a device-only install.
  * All `devin plugins` commands now require login, and plugin MCP servers discovered after a workspace root is attached or first touched now register correctly.
  * Permission denials now identify the layer responsible.
  * Plan mode now uses the normal permission system, and "always allow" choices appear only when they can take effect.
  * ACP session persistence and resume now restore titles, modes, and usage totals consistently. `/continue` resolves the most recent session, `/fork` defaults to the latest step, and ACP revert can cancel an active turn before rewinding.
  * `/fast` now selects SWE-1.7 Lightning when available, falling back to SWE-1.6 Fast or other fast models.
  * Quota-exhaustion messages now link to usage settings for on-demand usage and auto-reload.

  ### Fixed

  * Ensured `ask_user_question` requests now use standard ACP elicitation so third-party clients like Zed can answer them.
  * Large-file reads through ACP are bounded and paginated instead of repeatedly rereading overflow files. Late terminal flushes now preserve complete output and cannot reopen completed command cards.
  * Model refusals now show a warning instead of silently ending a turn, and image prompts continue to inference after captioning completes.
  * Resuming, continuing, or reverting a session no longer duplicates workspace context, and skill invocations can be repeated after a session restart.
  * Non-UTF-8 command output is reported with the real output and exit code.
  * Linux sandbox startup no longer hangs while expanding filesystem globs; unsupported glob rules are ignored and logged, while trailing `/**` continues to cover a directory tree.
  * Notebook edits now change only the target cell and preserve unrelated metadata, outputs, attachments, ids, and fields.
  * Uninstalling a plugin also removes and stops its MCP servers, and plugin registries are now flushed safely before replacement so crashes cannot erase them.
  * Shell commands blocked on a `sudo` password prompt now fail fast with an explanation instead of hanging.
  * Smart mode and other flag-gated features now refresh immediately when authentication or team context changes.
</Update>

<Update label="v3000.3.27" description="August 1, 2026">
  ### Fixed

  * The `edit`, `write`, `apply_patch`, and `notebook_edit` tools now refuse to write through a symlink, so an approved edit can no longer be redirected to an unexpected location.
</Update>

<Update label="v3000.3.22" description="July 29, 2026">
  ### Added

  * New `smart` permission mode: workspace edits auto-approve like Accept Edits, and a fast model decides whether other actions (shell commands, fetches, out-of-workspace writes) are safe to auto-run, falling back to the normal prompt otherwise. Auto-approval is limited to routine development work (building, testing, linting) — package installs, downloads that execute code, mutating `git`, `rm`, `sudo`, `kubectl delete`, cloud CLIs, and anything destructive always prompt, as do sensitive paths (dotenv, key material, Git config, agent configuration). Switch with `/smart`, `/mode smart`, Shift+Tab, or `--permission-mode smart`. Available in all builds, off unless the server-side rollout flag is enabled for your client.
  * Plugins can now contribute rules, hooks, MCP servers, and custom subagents, not just skills. Plugin `AGENTS.md`/`AGENT.md`/`.windsurfrules` load as always-on rules, `hooks.json` loads alongside project hooks, MCP servers declared via a root `.mcp.json` or an inline manifest `mcpServers` map run for the session, and `agents/<name>/AGENT.md` files surface as `<plugin>:<agent>` subagent profiles. `devin plugins info` and the install trust prompt list all of them before you confirm, and `devin rules list` / `devin mcp list` include them.
  * New plugin sources and manifest options: the `git-subdir` source kind installs a plugin living in a subdirectory of a shared repo (`devin plugins install acme/vendor-plugins#plugins/stripe`), a `skills` manifest field controls where skills load from (or disables them with `[]`), and a Claude-compatible `.claude-plugin/plugin.json` manifest is used when no `.devin-plugin/plugin.json` is present.
  * MCP prompts support: prompts offered by connected MCP servers are available as `/mcp__<server>__<prompt>` slash commands, with arguments mapped positionally onto the prompt's declared arguments.
  * Editable command approvals: the shell-command permission prompt now offers "Edit command" to tweak the proposed command inline before approving, and "Describe change to command" to have a fast model rewrite it in plain language (out-of-band — nothing enters the conversation) for review. ACP clients get the same affordances.
  * Command permission prompts now offer a global "Yes, always allow `<cmd>` commands in all projects" option saved to the user-level `config.json`, alongside the existing per-project option. Web-fetch prompts gained an equivalent "always allow all web fetches" option.
  * Configurable keybindings via a `keymap` section in `config.json`, keyed by context then action (e.g. `{ "keymap": { "global": { "clear_screen": "ctrl-shift-k" } } }`). `/shortcuts` now lists every binding across all contexts, shows each action's `context.action` identifier, and lets you rebind interactively. `Ctrl+C` cannot be unbound.
  * Copilot agent skills are discovered automatically from `.github/skills/` and `~/.copilot/skills/`, toggled with the `copilot` key under `read_config_from`.
  * New `subagents_enabled` setting in `config.json` (on by default) turns the `run_subagent` / `read_subagent` tools off; changes apply live to the running session.
  * In plan mode, a megaplan keyword (`megaplan`, `ultraplan`, `masterplan`) triggers extra planning guidance: the agent plans more extensively and always asks at least one clarifying question before writing the plan.
  * Old log files are gzip-compressed on startup — logs from finished processes untouched for 48 hours become `.log.gz` (still searchable with `zgrep`/`rg -z`).
  * Administrators can configure the CLI's outbound HTTP proxy through the MDM-distributed enterprise policy file (`system.json`); it takes precedence over the user config, and the updater honors it too.
  * `devin acp --model <name>` (or `DEVIN_MODEL`) sets the default model for every session the ACP server creates, matched the same way `/model` matches it. `devin acp --cloud` (insiders) relays the ACP connection to Devin cloud instead of running the local agent.
  * `/btw`, `/loop`, `/mcp`, `/context`, `/add-dir`, `/undo-add-dir`, and `/workspace` are now advertised as agent-side ACP slash commands, so any ACP client (Devin Desktop, JetBrains, or Zed) can invoke them and their progress streams back as session updates. `/remove-dir` and `/workspaces` were added as second names for `/undo-add-dir` and `/workspace`.

  ### Changed

  * MCP servers now live in dedicated config files — `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), `.devin/mcp_config.json`, and `.devin/mcp_config.local.json` — instead of the `mcpServers` key of `config.json`. Existing `mcpServers` entries in `config.json` are migrated automatically on startup. See [MCP Configuration](/cli/extensibility/mcp/configuration).
  * Shell commands run by the agent now inherit your login shell's environment (`.bashrc`/`.zshrc`/`.zprofile`/fish config), so nvm, pyenv, rbenv, direnv, and custom PATH entries just work. Snapshotted once per session; macOS/Linux only.
  * Plan mode now allows read-only MCP tools (those annotated `readOnlyHint: true`) plus listing MCP servers, tools, and resources, so the agent can gather context while planning.
  * Relative plugin references (`./path`) in manifests and repo plugin configs now resolve against the entity that declares them rather than the process working directory — including `forbiddenPlugins` deny entries, which previously matched nothing. Manifests with unresolvable relative references now fail to parse instead of carrying a silently dead entry.
  * Organization sandbox enforcement now applies to running sessions: team settings are refreshed at each prompt, and turning on required sandboxing mid-session refuses further prompts with a message asking you to restart.
  * `/session-stats` renders every usage dimension the server reports — credits, ACUs, agent messages, turn continuations, token usage — using the server's own labels and grouping, the `Model` row names the model that actually served the billed turns, and totals persist across resume.
  * Automatic context compaction is no longer surfaced in the scrollback or the ACP conversation view; an explicit `/compact` still confirms in the transcript.

  ### Fixed

  * Interrupting the agent now pauses running subagents instead of leaving them working in the background: they park with their state intact and resume on your next message. Subagent activity also survives a session reload, and a subagent's approval prompt now shows the command and names the requesting subagent.
  * Sending a queued message immediately (Enter on an empty input while Devin is working) actually interrupts the current turn instead of leaving the message queued until the turn finished.
  * Exiting plan mode now injects an explicit mode-change announcement, so the agent reliably starts acting in the new mode instead of continuing to follow plan-mode restrictions from earlier in the conversation.
  * Permission rules with recursive globs (e.g. `deny: ["Read(/etc/**)"]`) now also cover the base directory itself.
  * On Windows, `Deny` rules now block a forbidden command hidden behind a safe leading command in a `&&`, `||`, or `&` chain (e.g. `Get-ChildItem && git push`); the PowerShell parser previously collapsed these into a single scope.
  * When running sandboxed through an ACP client, commands reaching a network host outside the sandbox allow list now surface a permission prompt instead of being silently blocked.
  * `apply_patch` no longer rewrites a whole Windows (CRLF) file's line endings to LF, so a one-line edit no longer produces a whole-file diff.
  * `@` file mentions pick up files created, moved, or deleted while the CLI is running instead of showing a stale snapshot from startup.
  * Attached images tell the model where the file lives on disk.
  * Reverting removes the empty directories Devin created to hold a new file (only ones it created, and only while empty), and `/revert` no longer ends the session with an "already open in another process" lock error.
  * The context window usage indicator appears immediately after resuming an old session, and revert steps are available as soon as a session is reopened.
  * The ACP server stays responsive while opening, listing, saving, or updating sessions — persistence runs on a dedicated database thread with a reused connection instead of blocking the async runtime.
  * ACP resource links and inline `<ref_file>` links show the file's basename on Windows and build well-formed, percent-encoded `file://` URIs (`file:///C:/Users/you/file.txt`) instead of malformed backslash paths.
  * Skipping some questions in an `ask_user_question` will no longer block progress.
  * Claude-format hooks that block by exiting with code 2 now take their block reason from stderr, matching Claude Code's convention.
  * The `exec` tool rejects empty commands with an error instead of silently reporting success, preventing repeated empty-command loops.
  * The "Update vX available!" banner will never advertise a version older than the one you're running.

  ### Outposts

  * `devin worker start` no longer requires a pre-provisioned outposts token: with no `--token` / `DEVIN_OUTPOSTS_TOKEN` it creates an outpost with your CLI login and reuses the saved worker token on later runs.
  * `devin worker start` downloads the correct `devin-remote` binary on Windows x64 and passes the Windows system environment through, fixing the immediate `os error 10106` crash on every Windows outpost session. It also accepts an outpost name as well as an id, and fails fast on an OS mismatch instead of repeatedly claiming and releasing queued sessions.
</Update>

<Update label="v3000.2.17" description="July 19, 2026">
  ### Added

  * MCP servers can now override the RFC 8707 OAuth `resource` parameter via a new `oauthResource` field in the MCP server config (or `--oauth-resource` on `devin mcp add` / `devin mcp login`) — needed for identity providers like Microsoft Entra that reject requests containing `resource`.
  * Command hooks now receive the agent's session id (`session_id` for Claude-format hooks, `trajectory_id` for Windsurf-format hooks) and a per-turn id (`prompt_id` / `execution_id`) in their stdin payload.

  ### Changed

  * Command permission prompts now scope known program runners to the wrapped program: `uv run ruff check` offers to always allow `uv run ruff` rather than the much broader `uv run`. Also applies to `poetry run`, `pdm run`, `pipenv run`, `rye run`, `hatch run`, `pnpm exec`, `pnpm dlx`, `npm exec`, `yarn dlx`, and `bun run`.
  * Sessions now start faster, especially when several reconnect at once.
  * The `devin migrate` command (`devin migrate hooks`, `devin migrate workflows`) is now available for migrating from legacy Cascade.
  * When the same skill name is loaded from more than one location, each copy now surfaces with a location prefix (`/agents:foo`, `/claude:foo`) instead of appearing as indistinguishable duplicates.

  ### Fixed

  * Hooks are now discovered in ancestor directories up to the repository root, matching how skills and rules are loaded.
  * Improved support for deleting and renaming files with GPT-5.6 models.
  * Image-heavy sessions no longer invalidate the provider prompt cache on every request once the trailing-image cap is reached; older images are evicted in batches, reducing token costs and latency in long sessions.
  * The CLI no longer leaks a terminal/PTY per tool call: one-shot foreground commands free their shell session as soon as the command finishes, and deliberately retained shells (explicit `shell_id`, `tty`, or backgrounded commands) are capped at 16 with least-recently-used eviction.
  * Reusing a shell id for a non-interactive command now works instead of failing with "This shell may not be functional"; a busy shell serializes the next command.
  * Hooks are now deduplicated by source file, so a hook no longer runs multiple times when the same directory is re-added, workspace directories overlap, or a hook file is reached through a symlink.
  * Telemetry: rejected, blocked, or permission-denied tool calls are now recorded with their actual failure reason instead of being mislabelled "turn complete".
</Update>

<Update label="v3000.1.27" description="July 6, 2026">
  ### Fixed

  * Fixes issues with diff viewing in autonomous mode.
</Update>

<Update label="v3000.1.23" description="July 4, 2026">
  ### Added

  * Added an `/mcp` slash command with a live MCP server status panel.
  * ACU usage is now shown in the `/usage` command.
  * Enterprise login policies are now enforced in the CLI.
  * Added a `sandbox.excluded` allow/ask/deny config (user and team settings) to run specific commands outside the sandbox; excluded commands also skip the sandbox proxy environment.

  ### Changed

  * Edits produced in autonomous mode now produce reviewable diffs.
  * Skill `permissions:` frontmatter now applies to auto-approvals.

  ### Fixed

  * Fixed command approval parsing for PowerShell `$variable` assignment prefixes.
</Update>

<Update label="v2026.8.18" description="June 23, 2026">
  ### Added

  * Subagents can now be configured with a default model.
  * Added an `attribution` option to the Devin Local [config file](/cli/reference/configuration/config-file); set it to `false` to suppress Devin mentions in commit messages.

  ### Changed

  * The MCP registry cache is now warmed during startup, so MCP servers are ready sooner.

  ### Fixed

  * On Windows, `bash` now resolves to Git Bash instead of the WSL launcher stub.
  * Injected context is no longer included in auto-generated session titles.
  * Fixed full-width wrapping of CLI question replies.
</Update>

<Update label="v2026.7.23" description="June 18, 2026">
  ### Fixed

  * Made MCP registry parsing more tolerant of old and inconsistent schemas.
</Update>

<Update label="v2026.7.19" description="June 17, 2026">
  ### Fixed

  * Fixed a bug with loading skill files that use alternative fields.
</Update>

<Update label="v2026.7.16" description="June 16, 2026">
  ### Plugins

  Install bundles of skills from a GitHub repo, a git URL, or a local folder, and share them across projects. A plugin is any source containing a `.devin-plugin/plugin.json` manifest and a `skills/` directory; its skills become available as `/<plugin>:<skill>`. A plugin can require other plugins (installed automatically), endorse optional ones, and forbid others — so a plugin can act as a curated, governed collection. Plugins are in beta and opt-in for enterprises, so behavior and configuration may change in future releases. See the [plugins overview](/cli/extensibility/plugins/overview) for details.

  ### Enterprise controls

  Expanded controls for admins to govern what Devin Local can do and which tools it can reach.

  * Teams can define terminal command allow/deny lists, enforced through CLI permission scopes with exact-command matching and `*` wildcards.
  * Org-level control to disable Devin CLI plugins: when set, the CLI refuses to install or update plugins and skips the skills from any installed plugins.
  * The "Disable CLI access" team setting is now enforced for Devin Local (the CLI hosted in Windsurf), including the bundled agent registry and the allowed-MCP-server allowlist.

  ### Added

  * `devin plugins install <source>` installs a plugin (and its required plugins) from a GitHub `owner/repo`, a git URL, or a local path.
  * `devin plugins list` shows installed plugins with their version and whether they are currently blocked by policy.
  * `devin plugins info <plugin>` shows the skills a plugin provides and its required, optional, and forbidden lists.
  * `devin plugins update [plugin]` re-fetches a plugin (or all plugins) at the latest version; local plugins are linked to their source folder so edits are live without re-installing.
  * `devin plugins remove <plugin>` uninstalls a plugin, leaving any auto-installed required plugins in place.
  * `forbiddenPlugins` entries accept glob patterns (e.g. `acme/*`, `*/secrets`, `https://gitlab.com/acme/*`) in addition to exact identities and the lone `*` lockdown.

  ### Changed

  * Improved authentication in third-party ACP clients, including JetBrains and Zed: both browser and manual sign-in now use the Devin auth flow, so the manual `/login` fallback works where it previously failed.
</Update>

<Update label="v2026.5.26-8" description="June 9, 2026">
  ### Fixed

  * Signing in to Devin now honors the `proxy` settings in `config.json` (`mode`, `url`, `no_proxy`). Previously the login token exchange always connected directly (apart from `HTTP_PROXY`/`HTTPS_PROXY` env vars), ignoring a configured `manual` proxy URL, `off` mode, and config-level `no_proxy`.
</Update>

<Update label="v2026.5.26-7" description="June 8, 2026">
  ### Fixed

  * Custom HTTP headers are now forwarded through the MCP OAuth discovery and authorization flows, so MCP servers behind a gateway that requires extra headers (e.g. an authorization header) can complete OAuth sign-in.
  * Built-in MCP OAuth strategies (such as Figma's) are now matched by issuer rather than gateway hostname, so they resolve correctly when the server is reached through a gateway or proxy.
</Update>

<Update label="v2026.5.26-6" description="June 5, 2026">
  ### Fixed

  * IDE editor context (active file, cursor position, open tabs) now includes explicit relevance guidance, so the agent no longer treats passive code browsing as a request to act on the focused file.
  * IDE editor context (active file, cursor position, open tabs) is now injected once alongside each user message instead of being repeated before every model response, so the agent no longer narrates whether the open IDE files are related to the request.
</Update>

<Update label="v2026.5.26-5" description="June 3, 2026">
  ### Fixed

  * Starting Devin CLI and exiting without sending a message no longer leaves an empty "Untitled" session in `devin list`; sessions are saved once you send your first message.
</Update>

<Update label="v2026.5.26-0" description="May 26, 2026">
  ### Added

  * Gemini 3.5 Flash model support.
  * New `/cloud-attach <session-id>` command to attach to an existing cloud Devin session with full TUI rendering (tool calls, messages, plans, file edits). The existing `/handoff` behavior is unchanged.
  * New `/cloud-sessions [--all]` command to list recent cloud Devin sessions and their attachable session IDs.
  * Custom subagent profiles can opt in to nested subagent spawning via the `max-nesting` frontmatter field, overriding the default depth limit.
  * Supported editor integrations, including Windsurf, now show the agent which file you have open, your cursor position, and other open editor tabs as part of its context.
  * `--export` flag for exporting conversation history in ATIF format.
  * New `/fast` slash command to quickly switch to SWE-1.6 Fast, with pricing comparison against the current model.
  * Figma MCP servers can now authenticate with `devin mcp add figma --url https://mcp.figma.com/v1` without additional configuration.
  * When prompted for an MCP tool permission, two additional server-level options are now offered: approve all tools on the server for the current session, or permanently. This lets you grant broader access without re-approving each tool individually.
  * Prompt navigation and collapsible command sections in terminals with shell integration. VS Code, Windsurf, Ghostty, iTerm2, kitty, WezTerm, and Windows Terminal users can now jump between prompts with keyboard shortcuts (e.g. Ctrl+Shift+Up/Down in VS Code), see prompt markers in the scrollbar, and collapse agent output sections (iTerm2). Prompt marks also survive session restore.
  * Revert preview now shows line diff stats (`+N -M`) and a "View diff" button for all action types (restore, delete, recreate).
  * `show_hints` config option to suppress "Did you know" tips between turns (default: on)

  ### Changed

  * Long conversations are compacted earlier in the background so the agent spends less time pausing when context is nearly full.
  * ATIF exports now include richer per-step transcript details, including telemetry and timing metrics.
  * Shell commands that continue running in the background after a timeout now report how long Devin waited before returning.
  * The built-in Explore subagent can now use web search to research topics outside the codebase, in addition to its read-only codebase tools. It still cannot fetch arbitrary URLs or edit files.
  * Homebrew installations are now externally-managed. The `/update` command will direct users to upgrade via `brew upgrade devin` instead of attempting self-update.
  * HTTP MCP servers now try Streamable HTTP first and automatically fall back to legacy SSE when the server responds with an HTTP 4xx error, per the [MCP spec](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/#backwards-compatibility).
  * MCP OAuth callback pages now show Devin-branded success and failure screens instead of plain text.
  * Renamed the product from "Devin for Terminal" to "Devin CLI" in user-facing UI, the REPL welcome and startup banner, slash command descriptions (`/bug`), bug report output, cloud handoff messages, version self-manage messages, tips, and public documentation. The binary name, config paths, and install URLs are unchanged.
  * Revert preview now shows descriptive warnings for irreversible actions instead of empty placeholders.
  * Read-only shell commands (e.g. `ls`, `cat`, `pwd`) no longer trigger irreversible action warnings during revert.
  * Shell integration startup is faster, reducing noticeable delay when opening a shell.
  * Trimmed the first-run welcome message for Devin CLI.
  * Windows: default non-interactive shell is now PowerShell instead of Git Bash. Git for Windows is no longer required to run Devin CLI on Windows.

  ### Fixed

  * Image attachments in Windsurf now show the correct warning when the selected Devin CLI model does not support images.
  * Responses silently truncated when the model hits its max output token limit now show a warning and exit non-zero in pipe mode instead of returning partial output as if complete.
  * Persist the reduced trailing-image cap across turns after HTTP 413; prevents the cap from resetting to 20 each turn and triggering repeated 413 cycles
  * Re-encode bmp/tiff/ico images to PNG at the message-forest chokepoint instead of forwarding them to Anthropic with an unsupported `mime_type`, which surfaced as `messages.N.content.0.image.source.base64.media_type: Input should be 'image/jpeg', 'image/png', 'image/gif' or 'image/webp'` 400 errors.
  * Drop oversize (>5 MB) images whose bytes can't be fully decoded instead of passing them through verbatim, which surfaced as `image exceeds 5 MB maximum` 400 errors.
  * Typing into a multiple-choice question's "Other (type your own)" field no longer drops `e`/space or treats `j`/`k`/digits as shortcuts; all characters now insert into the answer.
  * Plan mode is now available when your organization requires sandbox mode. Previously `/plan` and `/mode plan` were rejected with "Plan mode is not available", even though plan mode is read-only.
  * Pre-user-prompt hooks that exit with code 2 now correctly block the prompt instead of being silently ignored.
  * Reverting a step no longer reports a spurious "file was modified externally" conflict for files where the agent's edit was rejected in the IDE.
  * Reverting or editing a cancelled prompt (stopped before any output streamed) no longer fails with "could not resolve step."
  * Sandbox mode no longer leaves empty ghost dotfiles (`.bashrc`, `.gitconfig`, `.mcp.json`, etc.) in the project directory after commands finish.
  * The in-session `skill` tool now finds skills behind symlinked directories under `.windsurf/skills/`, `.agents/skills/`, and `.claude/skills/`, matching `devin skills list`.
  * `/handoff` now collects untracked files from the entire repository, not just the current subdirectory
  * `/handoff` now includes untracked files in the git diff sent to cloud Devin, not just tracked changes
  * "Always Allow" permission grants in Windsurf now persist across sessions. Previously, selecting "Always Allow" in the ACP permission dialog only granted the scope for the current session.
</Update>

<Update label="v2026.5.6-1" description="May 8, 2026">
  ### Web search

  Search the web directly from your Devin CLI sessions. The agent can
  look up documentation, find solutions, and pull in relevant information
  from the internet without leaving the terminal.

  ### Added

  * Built-in OAuth device flow for GitHub MCP server. `devin mcp add github --url https://api.githubcopilot.com/mcp/` now authenticates via device flow (enter a code at github.com/login/device) without needing `--oauth-client-id`.
  * `/copy` command to copy the last agent response to the system clipboard. Works over SSH connections and on Linux desktops.
  * Numbered options in select prompts can now be picked directly with the `1`-`9` keys instead of arrowing + Enter. The shortcut is shown as a digit prefix on each option in non-search prompts.
  * `web_search` tool for searching the web during agent sessions.

  ### Fixed

  * Cancelling a session now also stops running subagents instead of letting them continue in the background
  * Shell commands that redirect output to `/dev/null` (e.g. `2>/dev/null`, `>/dev/null`, `&>/dev/null`) no longer prompt for write permission to `/dev/null`.
  * Edit tool previews now show correct file line numbers instead of always starting from 1.
  * Output token limit raised from 16k to match each model's actual capacity (128k for Opus, 64k for Sonnet), preventing premature response truncation.
  * Option+Backspace now correctly deletes words in select menus (user question "Other" field and search) on BS-mode terminals, instead of inserting 'h'.
  * Slash command output now has consistent visual separation from the prompt, matching how agent responses are displayed.
</Update>

<Update label="v2026.5.5-0" description="May 5, 2026">
  ### Added

  * `skill search` can find model-invocable skills recursively under a project path and filter them by keywords.

  ### Changed

  * Default model is now SWE 1.6 Fast instead of Adaptive.

  ### Fixed

  * `apply_patch` diffs now appear incrementally as the patch is being written, not just after it completes. Both new-file and modify-existing-file patches show diffs progressively.
  * Command hints now show the binary name used to launch Devin CLI when run through a renamed binary, symlink, or alias.
  * Fixed process hang when MCP OAuth dynamic client registration fails. The local callback server was not properly shut down on error, causing the process to block indefinitely waiting for a browser redirect that would never arrive.
  * `/steps`, `/revert`, and `/fork` now show and work with steps from before compaction. Previously, compacting a session made all earlier steps invisible and unrevertible.
  * Text now correctly appears before tool calls in scrollback when both are produced in the same streaming turn.
</Update>

<Update label="v2026.4.30-4" description="May 1, 2026">
  ### Fixed

  * `/usage` command now shows quota % remaining and overage balance for quota-billing users instead of "no credits consumed."
</Update>

<Update label="v2026.4.30-0" description="April 30, 2026">
  ***

  bumps:
  chisel: minor
  config-importers: minor
  -----------------------

  Added MCP config import support for OpenCode, VS Code, and Zed editors.
  Added Cursor global MCP config loading (`~/.cursor/mcp.json`).
  New providers can be toggled via `read_config_from` in user config.

  ### Added

  * File edits from `apply_patch` now display as inline diffs in Windsurf, matching the diff preview already shown for the `edit` tool.

  * `/login-status` command to show login debugging info (email, plan, team).

  * New `post_compaction` hook event that fires after context compaction, with the compaction summary available on stdin.

  ### Changed

  * Permission prompts now use clearer wording for always-allow command choices and can offer switching to Bypass when allowed by org policy.

  * Background shell commands now render as a single exec card with a spinner instead of showing separate "Command Read" / "Killing shell" cards for each `get_output` and `kill_shell` poll.

  * Ctrl+L now clears the screen properly, like bash and other shells. Visible content is scrolled into the terminal's scrollback buffer so you can still scroll up to see it. Full redraw (re-render all content from scratch) moved to Ctrl+Shift+L.

  * Startup banner no longer shows the user's email address.

  * Resuming a session from a different directory now prompts you to choose between the session's original directory, switching permanently to your current directory, or using your current directory just this time.

  * Improved streaming view for model output.

  * Updated the startup braille logo to match the design on devin.ai/terminal.

  ### Fixed

  * Resuming a Windsurf session with `devin -r` now shows the conversation history instead of a blank screen.
  * MCP OAuth discovery now works with POST-only servers and servers whose `.well-known` paths are behind SSO.
  * Resuming a session now correctly restores the selected mode (Plan, Ask, Code) instead of silently reverting to Code.
  * Skill discovery no longer picks up duplicate skills from nested configuration directories inside skill folders, reducing token usage at session start.
  * Shell integration setup (`devin shell setup`) is now available for enterprise accounts.
</Update>

<Update label="v2026.4.24-9" description="April 27, 2026">
  ### Fixed

  * Opt+backspace no longer inserts 'h' on terminals that send BS for backspace.
</Update>

<Update label="v2026.4.24-1" description="April 24, 2026">
  ### Interactive step picker for `/revert`

  `/revert` with no arguments now opens an interactive searchable picker showing all conversation steps. Select a step to revert to it. Double-tap Esc while the agent is idle to open the same picker.

  ### Added

  * MCP servers configured with `"transport": "sse"` (legacy SSE protocol) are now fully supported. Previously, these servers were rejected with an error; they now connect via the legacy SSE protocol (GET for event stream, POST for messages). Stored OAuth tokens are injected automatically, and 401 responses trigger the interactive OAuth flow.

  * Terminal notification (bell + desktop notification) on successful authentication, making it easier to return to the terminal after logging in via the browser.

  * `/btw <prompt>` asks the agent a quick side question using the current conversation context. The answer streams into a box below the agent's output without adding the question to the main conversation, so you can check in without disrupting what the agent is working on.

  * `devin cloud drs` subcommands for managing environment blueprints, sandbox sessions, and builds directly from the CLI.

  * First-startup welcome box with tips for getting started in Devin for Terminal.

  * Git provider connection prompt during `devin setup`: detects locally logged-in `gh` CLI accounts and offers to connect them to Devin, or open the browser to set up a GitHub App or other provider.

  * Typing `&` on an empty prompt enters handoff mode, a shortcut for `/handoff` that mirrors the `!` bash-mode pattern.

  * Context-aware placeholder text in the input field guides users based on agent state: prompts to ask Devin for help when idle, suggests guiding Devin while it works, and indicates how to send queued messages.

  * Support disabling individual MCP tools per server via `disabledTools` in the MCP config. Disabled tools are hidden from the agent and rejected at call time.

  * `devin mcp enable` and `devin mcp disable` subcommands to toggle MCP servers on/off without removing them. Supports `--scope` (user, local, project). Disabled servers show with a `(disabled)` label in `devin mcp list` and a status line in `devin mcp get`.

  * Support for MCP servers that require a pre-registered OAuth client (e.g. GitHub). Pass `--oauth-client-id` (and optionally `--oauth-client-secret`) to `devin mcp add` and `devin mcp login`, or set `oauthClientId` / `oauthClientSecret` in your MCP config.

  * Organization selection is now part of the setup wizard. Users with multiple Devin organizations are prompted to choose one during onboarding; single-org users are auto-selected.

  * `/org` command for selecting a Devin organization from the terminal.

  * Option to hand off a plan to a cloud Devin session when exiting plan mode, available for users signed in with a Devin account.

  * `Ctrl+R` fuzzy search for inserting previous prompts into the input box.

  * Proxy configuration section in `config.json` for controlling how the CLI routes outbound HTTP traffic. Set `proxy.mode` to `"system"` (default), `"manual"`, or `"off"`, provide a `proxy.url` for manual mode, and use `proxy.no_proxy` to bypass specific hosts.

  * Add `terminal-light` and `terminal-dark` theme names for 16-color terminal themes. `16color` and `terminal-colors` remain supported for backwards compatibility with `terminal-dark`.

  * `/theme` accepts an optional theme name, such as `/theme dark` or `/theme light`.

  * When opening the CLI inside a repo that has a Devin wiki, the wiki is now downloaded in the background and made available to the agent on subsequent sessions, so it can answer project questions using an explore subagent.

  ### Changed

  * Browser authentication pages redesigned to show a connection status between your computer and Devin, matching the devin.ai website style.

  * Login and API-key authentication labels now use Devin or generic API-key wording instead of legacy Windsurf-only wording.

  * Code mode now auto-approves file edits in workspace directories. The separate "Accept Edits" mode has been folded into Code; both display as "Code" in the mode picker, with the auto-approval variant used when the org policy allows it.

  * The default model is now Adaptive, which automatically routes each turn to the best model for the task. You can still pick a specific model with `/model` or by setting `agent.model` in your config.

  * Declarative Repo Setup (DRS) is now a builtin agent skill instead of a `/drs` slash command. The agent automatically invokes it when you ask about environment setup. The `devin cloud drs` subcommands continue to work as before.

  * Shell command previews use clearer titles and show commands with a prompt prefix in the preview body.

  * Cloud handoffs now send gathered terminal context in an expandable section.

  * `/handoff` now stops when the selected organization has no connected git provider and asks the user to run `devin setup` before retrying.

  * New Devin CLI sessions use memorable word-pair IDs.

  * Model picker now shows labeled pricing (e.g. "$5 / MTok In · $25 / MTok Out") on the highlighted model instead of unlabeled dollar amounts.

  * Slash commands now show confirmation messages when switching models, themes, or modes via the interactive picker.

  * Cleaned up slash command output: removed unnecessary colors, improved spacing, and simplified progress messages.

  * Improved how freeform "Other" answers are handled in agent questions. Typed responses that don't match a predefined option are now recognized as custom answers automatically.

  * `/resume` now opens the interactive session picker when run without a session ID.

  * Rule files use tighter injection limits and switch to path-only guidance when triggered rules exceed the available context budget.

  * Selection prompts now use a neutral highlighted row with clearer contrast and show item descriptions consistently.

  * Normalized tool preview verb tenses: streaming previews now use present progressive ("Editing file.rs") and completed previews use past tense ("Edited file.rs").

  * Status messages (warnings, errors, tips) now render through the Alert component with proper icons and theme-aware colors.

  * Added meaningful titles to error messages: "Something went wrong", "Quota exhausted", "Turn limit reached", "Couldn't open browser".

  * Standardized "cancelled" spelling to "canceled" (one L) in all user-facing strings.

  * "Connection lost, retrying..." replaces "Inference failed mid-stream, retrying...".

  * Muted text is now easier to read in both dark and light themes.

  * Multiple-choice questions now use the same selection UI as other CLI prompts, including typed custom answers.

  ### Fixed

  * File writes from `apply_patch` now appear in the agent timeline / worklog alongside writes from the `write` and `edit` tools.

  * Long sessions exit more quickly when shutting down.

  * Code blocks no longer lose their last character when text fills the terminal width.

  * Input responsiveness while the agent is actively streaming events.

  * Numbered lists in rendered markdown now show numeric markers (`1.`, `2.`, `3.`) instead of bullet points.

  * OpenAI reasoning models no longer fail when a request configures temperature.

  * Prompt history opens while Devin is running, including when completions are visible.

  * Todo list no longer disappears after the agent finishes updating it.

  * `/upgrade` opens Devin plans instead of Windsurf pricing.

  * Opening a session database that was written by a newer CLI now shows a clear "please run `devin update`" message instead of a raw "migration is missing from the filesystem" error.

  * `/handoff` now sets the repo via the session config option and tags the session as "Terminal".

  * Model picker search no longer replaces family grouping with individual variants.

  * The "Update vX available!" banner is no longer shown when background auto-update is going to install the new version on its own. It now only appears when the user has to take action (e.g. externally managed installs, or when auto-update has been disabled).

  * File and code snippet references now render as readable paths instead of raw XML tags.
</Update>

<Update label="v2026.4.17-0" description="April 17, 2026">
  ### Background auto-updates

  On macOS and Linux, new releases are now downloaded and activated while Devin for Terminal runs, so the next invocation picks up the latest version automatically. Quitting mid-update is safe and cannot leave the installation in a broken state. Opt out by setting `"auto_update": false` in `config.json`.

  ### Interactive config editor

  `/config` opens an interactive in-terminal config editor with tree navigation, search, and type-aware value editing.

  ### `/handoff` to cloud Devin

  The `/handoff` slash command is now generally available. Hand off a task to a remote Devin session with live status updates showing what the agent is currently working on.

  ### Searchable model picker

  The model picker now has a searchable interface: type to filter models, navigate with arrow keys, and see pricing info at a glance.

  ### Added

  * Support for adaptive and model-router selections, which now resolve to concrete models automatically during inference.

  * Detailed login info in `devin auth status`: login method, user name and email, user ID, team ID, plan and tier, and cached team settings.

  * Added a tray panel listing running background shells. Press the down arrow from the input to open it, navigate with up/down, and press `x` to kill the selected shell.

  * Support for an enterprise-configured default model. Admins can set a team-wide default model for new sessions via the Windsurf or Devin enterprise admin dashboards.

  * Added keyboard selection in the cloud agents tray: use the arrow keys to pick a cloud agent and press Enter to open its session in the default browser. The session URL is still shown below each entry as a fallback when a browser can't be launched.

  * Enforcement of the organization's "Auto run terminal commands" setting. Enterprise admins can now restrict which permission modes are available to CLI users — for example, preventing selection of Bypass mode when the org policy is set to "Auto" or below.

  * Added a way to flush queued messages to the agent immediately by pressing Enter on an empty input box while the agent is busy, so they're picked up as soon as the current tool call finishes (without interrupting it).

  * `/handoff` now attaches the local git diff to the Devin session, giving it visibility into uncommitted changes.

  * Interactive organization picker for `/handoff` when no org is configured, replacing the previous error that required manual config editing.

  * `legacy_terminal` config option for VT100 terminal compatibility, disabling keyboard enhancement probing, OSC sequences, and theme auto-detection.

  * `disable_osc` config option to independently control OSC sequence emission (terminal titles and hyperlinks).

  * `skip_workspace_trust` config option to bypass workspace trust prompts.

  * Per-model token pricing in the model selector, showing input and output cost per million tokens.

  * NEW, PROMO, and BETA badges in the model picker for models flagged by the server.

  * Relative cost tier (Free / \$ / \$\$ / \$\$\$) as a fallback description when per-token pricing is unavailable.

  * Added `/rename-session` slash command to rename the current session.

  * Added `/revert <step>` command to undo file changes back to a specific conversation step

  * Added `/steps` command to list conversation steps for use with `/fork` and `/revert`

  * Added optional `[step]` argument to `/fork` to branch from an earlier conversation point

  * Shift+Insert now pastes from the clipboard, matching the standard X11/Linux paste shortcut.

  ### Changed

  * `/bug` now clarifies that the report is sent to the Devin for Terminal developers.

  * Improved model selector with compact single-height items, a visible search input border, and streamlined pricing display for the selected model.

  * Unknown slash commands now show "did you mean?" suggestions based on similar command names.

  * Styled `/handoff` status lines with the standard animated spinner and muted text, replacing the static half-circle symbol and blue accent color.

  * `/handoff` can now be used without arguments. It summarizes the current conversation and hands off to a remote Devin session to continue the task.

  * Error message when switching to an unavailable permission mode now explains that sandbox mode restricts available modes and whether the restriction is enforced by the organization.

  * Model name below the input box now uses the default text color instead of blue.

  * Login experience streamlined: the spinner now offers "Press Enter to paste a token manually instead" and the manual-token path prints a single concise line instead of a multi-step wall of text.

  * "Logging in with Windsurf. If the browser didn't open..." preamble removed from the login spinner.

  * Plan mode approval prompt now shows plan-specific options: "Yes, implement plan and accept edits", "Yes, implement plan and bypass permissions", and "No, plan needs changes".

  * "16-color" theme renamed to "Terminal colors" to clarify that it inherits your terminal emulator's color scheme.

  * Session resume picker (`devin -r`, `devin list`) now has a searchable type-to-filter interface, matching the model selector experience.

  * Updated the tray panel to always show both Cloud agents and Subagents tabs, with an empty-state hint describing the other feature when a list has no entries.

  * Subagents and cloud agents tray panels now sort in reverse chronological order so the most recently launched agent appears at the top.

  * Always-on rule files (such as `AGENTS.md`) injected into context are now capped at 32 KiB each. Oversized rules are truncated with a hint pointing at the source path so the agent can read the full file on demand.

  ### Fixed

  * Errors from upstream servers (quota exhaustion, 5xx responses, connection drops, etc.) now show up as legible warnings in the REPL with a retry hint instead of raw `Error: …` text, and reach ACP clients with a typed cause so they can render them with the right severity.

  * Honored user `deny` / `allow` / `ask` permission rules (including `Read(...)` and `Write(...)`) in Devin for Terminal running inside Windsurf, matching standalone CLI behavior.

  * Unnecessary compaction is no longer triggered on every turn when using the adaptive model.

  * Logo now appears above conversation history when resuming a session, matching the layout of a fresh session.

  * `/add-dir` on Windows no longer mangles paths containing backslashes. Both `D:\Source\Project` and `..\Project` forms now work correctly.

  * Startup banner text alignment is now correct on continuation lines at narrow terminal widths.

  * Day-of-week is now correct when asking for the current date.

  * Compound shell commands are now blocked when they include a command you've denied in your CLI permissions.

  * Fixed selected/highlighted UI elements (like active question tabs, selected image attachments, and selected subagents) rendering with the same text color as un-highlighted text, making them hard to distinguish.

  * MCP servers configured with `"transport": "sse"` now fail with a clear error explaining that legacy SSE is unsupported, instead of silently connecting over the wrong transport.

  * Unnecessary permission prompts for shell commands no longer appear in autonomous mode with sandboxing enabled.

  * Clarified in the docs and `devin skills paths` output that on Windows, global skills live in `%APPDATA%\devin\skills\` instead of `~/.config/devin/skills/`.

  * Cursor positioning now uses VT100-compatible sequences (CR + CUF) instead of CHA, which is not supported by all terminals.

  * Tips and spinner symbols now respect the ASCII mode setting.

  * Fixed the browser login page to only say "Authentication Successful" once sign-in actually completes, and show a failure page when it doesn't.

  * Unrecognized slash commands now show an error instead of being sent to the model.

  * Clear install-instructions error when `socat` is missing on Linux, instead of failing silently.

  * File edits in the same turn no longer occasionally overwrite each other.
</Update>

<Update label="v2026.4.9-0" description="April 9, 2026">
  ### Read-only tools allowed by default

  Read-only tool calls (file reads, grep, glob, thinking) are now always allowed and no longer surface a permission prompt. User-, project-, and organization-configured deny rules still take precedence, so you can still restrict reads to sensitive paths.

  ### `.devin/hooks.v1.json` support

  Define pre- and post-command hooks in a standalone `.devin/hooks.v1.json` file using the same format as Claude Code hooks.

  ### `devin mcp add` overhaul

  `devin mcp add` now matches Claude Code's syntax: positional URL argument (e.g. `devin mcp add notion https://mcp.notion.com/mcp`), inferred transport from `--url` (HTTP) or trailing args (stdio), default scope changed from `user` to `local` (writes to `.devin/config.local.json`, gitignored), and new short flags (`-t`, `-s`, `-e`, `-H`).

  ### Agent mode and permission mode separation

  Agent profiles (normal, plan, ask) and permission modes (normal, accept edits, bypass, autonomous) are now two independent controls. Profiles are switched via `/plan`, `/ask`, `/normal` slash commands. `/plan <prompt>` switches to plan mode and immediately sends the prompt in one step. Permission modes are cycled with Shift+Tab or `/mode`.

  ### Live streaming tool previews

  Tool calls now appear immediately as arguments stream in, showing structured titles and content (diffs for edits, code blocks for writes, commands for exec) instead of waiting for the full request.

  ### Terminal notifications

  The CLI now sends terminal notifications when the agent finishes, needs input, or requests tool approval. Triggers dock badge and notification banners in supported terminal emulators. Controlled by the `notify` config option: `"never"`, `"smart"` (default, only when unfocused), or `"always"`.

  ### Added

  * Added structured form-based input support when connected to ACP clients that advertise elicitation capability.

  * Added inference tool name metadata to ACP tool call events so ACP clients can make per-tool presentation decisions (for example, hiding the arguments panel for internal tools).

  * Enabled the `devin acp` subcommand on stable and next, so any released build of Devin for Terminal can be launched as an Agent Client Protocol server by ACP-aware editors.

  * Added `/ask`, `/compact`, `/context`, and `/undo-add-dir` slash commands for ACP clients (e.g. JetBrains).

  * Expanded `/help` output in ACP sessions to list all built-in commands and discovered skills.

  * Show subagent activity and lifecycle events in the Windsurf UI.

  * Made the "Mode:" and "Model:" labels in the footer clickable to open their selector menus

  * Added mouse support to selector menus: click to select, scroll wheel to navigate, hover to highlight

  * Autocomplete for `/continue` and `/rm-session` commands showing recent sessions with ID prefix, time ago, and title.

  * `--force` flag on `devin update` and `/update` to force re-install even when already on the latest version.

  * Added interactive OAuth support for MCP servers — when an MCP server requires authentication, the browser opens automatically and a status message appears in the REPL.

  * `/new` as an alias for `/clear` to start a fresh conversation.

  * Active permission level in the top border of the input box.

  * Thumbs up/down feedback for agent responses via `Alt+↑`/`Alt+↓` and `/feedback`.

  * `respect_gitignore` config option to control whether the agent respects `.gitignore` when accessing files via tools (default: off). Separate from `include_gitignored_files`, which only affects `@` tab completion.

  * `/resume` as an alias for `/ls` (list recent sessions).

  * Subagent prompt in the expanded view (Ctrl+O) when a subagent completes.

  * Live streaming of subagent actions while waiting on a foreground subagent or a `read_subagent` call.

  * `/session-stats` command to display cumulative session statistics (tool calls, files changed, commands run, tokens, model, request ID).

  ### Changed

  * Changed workspace directory updates via ACP to use replacement semantics, enabling directory removal through the config option.

  * Made `/ask <question>` a one-shot command matching REPL behavior: temporarily switches to Ask mode, submits the question, then restores the previous mode.

  * Made session troubleshooting easier in Windsurf by showing diagnostic logs directly in the output panel.

  * Presented related agent questions in a single paginated form instead of one at a time.

  * Improved the plan mode exit approval with a dedicated review UI showing the plan summary and contextual button labels.

  * Improved Windsurf hook scripts to receive richer tool information on stdin, including edit details, MCP tool results, and assistant responses

  * `devin mcp add` no longer requires `--transport` or `--command` for the common stdio case — transport is inferred from `--url` (HTTP) or trailing args (stdio), and the first trailing arg is used as the command when `--command` is omitted

  * `/mode` now opens an interactive dropdown selector (like `/model`) instead of printing a static list. Use arrow keys to navigate, Enter to confirm, Esc to cancel.

  * `-p`/`--print` now accepts an optional inline prompt, so `devin -p "fix the bug"` works without needing the `--` separator. The old `devin -p -- fix the bug` syntax continues to work.

  * Shortened the "always allow" label for command permission prompts to "Always allow `<cmd>` commands in `<workspace>`", where `<workspace>` is just the last path element of the workspace directory, so it no longer overflows narrow terminals or ACP client UIs when the workspace path is long.

  * `/mode` now opens an interactive dropdown selector (like `/model`) instead of printing a static list. Use arrow keys to navigate, Enter to confirm, Esc to cancel.

  * Plan mode exit approval now has a dedicated review UI showing the plan summary and contextual button labels.

  * Removed the brand colors from the startup logo so it uses the terminal's default foreground color.

  * Truncation notices now include a "(ctrl+o to expand)" hint.

  * Consolidated the mode and permission pickers into a single unified mode selector in Windsurf. The available modes are now Code, Ask, Plan, Accept Edits, and Bypass Permissions.

  * Each Devin CLI channel now reads Windsurf config (MCP servers, skills) from its matching channel-specific directory under `~/.codeium/`

  ### Fixed

  * Fixed ACP sessions to require host-provided credentials instead of silently falling back to local CLI credentials, ensuring usage is properly attributed to the correct account.

  * Preserved streamed shell command output in ACP chat UIs so it stays visible after the command completes, with the exit code shown alongside instead of replacing the output.

  * Session mode selector now updates immediately after choosing "switch to accept edits" from a permission prompt.

  * Skipping a tool call in Windsurf no longer stops the agent — the LLM now sees the rejection and can try an alternative approach

  * Tool failure messages now show the error reason in Windsurf instead of just "Failed" with no explanation.

  * Fixed `/add-dir` and `/undo-add-dir` failing to handle directory paths containing spaces. Slash command arguments are now parsed with shell-style quoting (e.g. `/add-dir "my dir"` or `/add-dir my\ dir`), and tab completions automatically escape spaces in directory names.

  * Fixed excessive line spacing in the ASCII mode startup banner.

  * Long-running shell commands like dev servers now start reliably without blocking subsequent work.

  * Fixed bypass mode not auto-approving MCP `read_resource`, computer use, recording, and browser tools due to incorrect permission scopes.

  * Fixed autonomous mode silently auto-approving privacy-sensitive tools (computer use, recording, browser) that operate outside the OS sandbox.

  * Fixed browser screenshot path authorization mismatch when the screenshots directory was relative.

  * Fixed wide character (CJK/emoji) display corruption when deleting characters adjacent to them.

  * Fixed "always allow" for command permissions silently failing to persist when running outside a git repository.

  * Improved text visibility when the terminal background doesn't match the selected color theme.

  * Fixed alphabetic sorting in directory completion menus so that shorter directory names sort before longer ones that share the same prefix (e.g., `devin/` now correctly appears before `devin-docs/`).

  * Shell command output is no longer lost after long terminal sessions with extensive scrollback.

  * Fixed injected lint diagnostics appearing as fake user messages when reopening a saved session.

  * Fixed an issue where the agent would not automatically review and fix lint errors detected after code edits.

  * Improved lint error presentation with more detailed information including severity level, source, and precise location.

  * Added a safety cap on lint-fix injection count to prevent infinite loops when a lint cannot be resolved.

  * Separated new and persistent lint errors with distinct instruction text so the agent understands which lints it has seen before.

  * ANSI color escape codes are no longer written to log files or piped stdout/stderr. Colored output is only emitted to real terminals and respects the `NO_COLOR` environment variable.

  * Mode is now properly restored on session resume.

  * Session resume no longer drops early conversation messages after multiple compaction rounds.

  * Permission mode no longer resets unexpectedly mid-session.

  * Sandbox sessions no longer revert from autonomous to normal mode when exiting plan mode.

  * Code diffs and other rich tool call content no longer disappear from edit/write tool calls after reloading a session in the replay UI.

  * `shell run` no longer leaves the terminal in a bad state after exit.

  * Fixed silent crashes when a corporate proxy or firewall resets a network connection mid-session.

  * Ctrl+C now exits quickly even when the network connection is slow or stalled.

  * Session and always-allow choices in permission prompts now work correctly for terminal commands that also write files.

  * Thinking output now always renders before content when a model skips the `ThinkingComplete` event

  * Malformed tool-call error messages now point to the specific field and expected value type.

  * Windows no longer shows double authentication prompts during initial setup.

  * Windows installer now places files in the correct directory so PATH resolves properly.

  * Windows config file location is now clearly documented as `%APPDATA%\devin\config.json` instead of `~/.config/devin/config.json`.

  * Grep now searches hidden files like `.env` and `.github/`, matching the behavior of `rg --hidden`. The `.git/` directory remains excluded.

  * Large images (over 5 MB) no longer fail to send.

  * Local shell commands no longer continue running in the background after a session is interrupted or cancelled.

  * Preserved rich mention rendering (e.g. `@README.md` chips) when resuming a session, instead of showing raw markdown text.

  ### Removed

  * Removed the in-REPL overage status indicator banner
  * "Thought for Xs" duration display no longer appears in the REPL scrollback.
</Update>

<Update label="v2026.4.1-4" description="April 8, 2026">
  ### Removed

  * In-REPL overage status indicator banner is no longer shown.
</Update>

<Update label="v2026.4.1-3" description="April 8, 2026">
  ### Added

  * Warning when your account is in overage so you know requests are being billed to your team's prepaid balance.
  * `/usage` command to show Windsurf credits and ACUs consumed during the current session.
</Update>

<Update label="v2026.4.1-2" description="April 6, 2026">
  ### Fixed

  * The installer now accepts existing `~/.local/bin/devin` symlinks pointing to the legacy `~/.local/share/cognition/cli/...` path and refreshes them correctly after the cognition-to-devin migration.
</Update>

<Update label="v2026.4.1-1" description="April 2, 2026">
  ### Fixed

  * Wide character (CJK/emoji) display corruption no longer occurs when deleting characters adjacent to them.
</Update>

<Update label="v2026.4.1-0" description="April 1, 2026">
  ### Added

  * Show subagent activity and lifecycle events in the Windsurf UI.

  * "Mode:" and "Model:" labels in the footer are now clickable to open their selector menus.

  * Mouse support in selector menus: click to select, scroll wheel to navigate, hover to highlight.

  * Autocomplete for `/continue` and `/rm-session` commands showing recent sessions with ID prefix, time ago, and title.

  * Added `--force` flag to `devin update` and `/update` to force re-install even when already on the latest version.

  * Added support for reading hooks from `.devin/hooks.v1.json`, a standalone hooks file using the same format as Claude Code hooks

  * Show subagent prompt in the expanded view (Ctrl+O) when a subagent completes.

  * Stream subagent actions in the live display while waiting on a foreground subagent or a `read_subagent` call.

  * New `notify` config option that controls terminal notifications when the agent finishes, needs input, or requests tool approval. Set to `"never"`, `"smart"` (default), or `"always"`. In `smart` mode, notifications are only sent when the terminal window is unfocused. Triggers dock badge and notification banners in supported terminal emulators.

  ### Changed

  * `devin mcp add` no longer requires `--transport` or `--command` for the common stdio case — transport is inferred from `--url` (HTTP) or trailing args (stdio), and the first trailing arg is used as the command when `--command` is omitted

  * `/mode` now opens an interactive dropdown selector (like `/model`) instead of printing a static list. Use arrow keys to navigate, Enter to confirm, Esc to cancel.

  * `-p`/`--print` now accepts an optional inline prompt, so `devin -p "fix the bug"` works without needing the `--` separator. The old `devin -p -- fix the bug` syntax continues to work.

  * Added "(ctrl+o to expand)" hint to truncation notices so users know how to view full output.

  ### Fixed

  * Skipping a tool call in Windsurf no longer stops the agent — the LLM now sees the rejection and can try an alternative approach

  * Tool failure messages now show the error reason in Windsurf instead of just "Failed" with no explanation.

  * `/add-dir` and `/undo-add-dir` now handle directory paths containing spaces. Slash command arguments are parsed with shell-style quoting (e.g. `/add-dir "my dir"` or `/add-dir my\ dir`), and tab completions automatically escape spaces in directory names.

  * "Always allow" for command permissions now persists correctly even when running outside a git repository.

  * Text visibility improved when the terminal background doesn't match the selected color theme.

  * Alphabetic sorting in directory completion menus now correctly places shorter names before longer ones with the same prefix (e.g. `devin/` before `devin-docs/`).

  * Mode is now properly restored on session resume.

  * Silent crashes no longer occur when a corporate proxy or firewall resets a network connection mid-session.

  * Thinking output now always renders before content when a model skips the `ThinkingComplete` event.

  * Fixed double authentication prompts on Windows during initial setup.

  * Fixed Windows installer placing files in the wrong directory, causing PATH to point to the wrong location

  * Fixed large images (over 5 MB) failing to send.
</Update>

<Update label="v2026.3.20-2" description="March 23, 2026">
  ### Added

  * Add `16color` and `nocolor` theme modes. `16color` quantizes output to the 16 ANSI color palette (respects terminal color scheme). `nocolor` disables all color output for VT100 and other monochrome terminals.

  * Support multi-root workspaces with additional directories beyond the session working directory.

  * Add `/workspace` and `/add-dir` slash commands for listing and adding workspace directories at runtime.

  * Add `workspace-dirs` config option for setting workspace directories programmatically.

  * Add Ask mode (`/ask`) for read-only question answering without code changes

  * Add `/bug` slash command for submitting bug reports from the stdio server

  * Display a persistent warning banner when running in Windows Conhost, recommending Windows Terminal or Git Bash for a better experience.

  * `Ctrl+Left` and `Ctrl+Right` now jump between words, matching standard Linux and Windows terminal behavior. `Ctrl+Backspace` and `Ctrl+Delete` delete words backward and forward respectively.

  * Add custom subagent profiles: define specialized subagents with their own system prompts, tools, and models via `AGENT.md` files in your project's `agents/` directory (experimental)

  * Add `subagent` and `agent` frontmatter fields for skills, allowing skills to run as independent subagents instead of inline (experimental)

  * Add `include_gitignored_files` config option to include gitignored files in @ tab completion results (default: off)

  * `/undo-add-dir` command to remove directories from the workspace.

  * `/rm-session` command to delete sessions.

  * Added `request_scope` tool for requesting read/write access to directories when running in sandbox mode

  * Added sandbox mode system prompt that informs the agent about sandbox restrictions and how to request additional access

  * The `--sandbox` flag and `devin sandbox setup` command are now available on all build channels (previously insiders-only)

  * Add `unicode_mode` config option (`auto`/`unicode`/`ascii`) for terminals that don't support Unicode glyphs

  * Add `devin version` subcommand as an alias for `devin --version`

  ### Changed

  * Include the active interface mode in bug report details
  * Migrate all config, data, and cache directories from `~/.config/cognition/`, `~/.local/share/cognition/`, and `~/.cache/cognition/` to `devin/`. A backward-compatibility symlink is created at each old path so older sessions continue working.
  * Rename the project-level config directory from `.cognition/` to `.devin/`. Existing `.cognition/` directories are still read (with a deprecation warning) for backward compatibility.

  ### Fixed

  * Hooks defined in `.claude/settings.json` are now loaded by the CLI (both project-level and global `~/.claude/settings.json`)

  * Cmd+V now triggers clipboard paste in terminals that report it as a key event (e.g. when pasting non-text data like images)

  * Fixed panic when piping CLI output to commands that close early (e.g. `devin -p "..." | head`).

  * Fix partial agent output (thinking and content) being silently dropped when the agent stops with an error during streaming

  * Fixed image uploads failing when the file extension doesn't match the actual image format (e.g. a JPEG saved as `.png`). The MIME type is now detected from the image content rather than trusting the caller-supplied value.

  * Fix `devin mcp login` failing against servers (e.g. Glean) that only allow `/auth/callback` as the OAuth redirect path

  * Fix CLI freeze when pasting very long single-line text (e.g. JSON blobs, base64 strings) by collapsing pastes that exceed 5,000 characters

  * Skills now display their true source path (e.g. `.agents/skills/`) instead of always showing `.devin/skills/`

  * Fixed pasting text (Ctrl+V / bracketed paste) into slash command prompts like `/bug`

  * Respect the `disabled: true` flag in MCP server configurations, so servers marked as disabled in Windsurf, Claude, or Devin config files are no longer loaded
</Update>

<Update label="v2026.3.17-3" description="March 19, 2026">
  ### Fixed

  * Load skills and agents from `~/.config/devin/` and `.devin/` directories as documented, in addition to the legacy `~/.config/cognition/` and `.cognition/` paths.
</Update>

<Update label="v2026.3.16-0" description="March 16, 2026">
  ### Added

  * Add automatic generation of descriptive session titles.
  * Add `CHISEL_LOG_STDERR` env var to direct log output to stderr
  * Add PAC (Proxy Auto-Configuration) support on Windows and macOS. The CLI now respects system-level PAC settings and WPAD auto-detection, routing traffic through the correct proxy without requiring manual environment variable configuration.
  * Add `!<command>` syntax to run shell commands directly from the REPL. Output streams in real-time and is automatically added to the conversation context for your next message. Typing `!` enters bash mode with a dedicated prompt and title indicator. Use Ctrl+C to cancel a running command.
  * Display Devin logo alongside product info on CLI startup.

  ### Changed

  * The `/bug` command now automatically includes terminal environment info (`TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `TERM`) in bug reports.
  * Change permission prompt default selection from "Yes, always allow" back to "Yes" (approve once)

  ### Fixed

  * Fix "Always Allow" permission not persisting across tool calls when running inside Windsurf

  * Fix enterprise team-enforced permission rules not being applied when running inside Windsurf

  * Fixed `Co-Authored-By` commit trailer to use the correct GitHub App bot email instead of `noreply@cognition.ai`

  * Fix permission suggestions including file paths as part of the command prefix
    (e.g. `allow cat foo/bar/baz.txt` now correctly shows `allow cat`).

  * Fix repeated "Context compacted" notifications when inference fails mid-stream and retries

  * Fixed off-by-one error in edit tool's reported start/end line numbers when the edit is not at the beginning of the file

  * Fix "always allow fetches to" permission not being recognized after restart

  * `mcp_list_tools` now includes the `input_schema` for each tool, so the agent can discover parameter requirements without needing to trigger a tool call error first.

  * Fix `devin mcp login` failing on servers that use RFC 8414 OAuth discovery instead of RFC 9728 (e.g. Atlassian)

  * Fix pasting text that starts with `#` (e.g. markdown headings) being silently dropped.

  * Fix spinner disappearing after a sub-agent completes while the main session is still running

  * Fixed layout shift in the startup banner where text jumped when account info loaded

  * Fixed stray `<` character appearing at the start of terminal output on headless environments where `TERM=dumb`

  * Fixed missing whitespace in thoughts.

  * Allow long question headers in `ask_user_question` instead of rejecting them; headers over 16 characters are now truncated with an ellipsis (…) for display

  * Fix missing DLL errors on Windows ARM by statically linking the C runtime

  ### Removed

  * Removed the "Loading configuration from..." startup notice. Configuration import from Cursor, Windsurf, and Claude Code still works — the notice is simply no longer displayed.
</Update>

<Update label="v2026.3.9-0" description="March 9, 2026">
  ### Added

  * Add `show_path` config option to display the current working directory in the input border
</Update>
