# Devin CLI Knowledge Base Index

The `docs/devin-cli/` directory contains a local mirror of the Devin CLI official docs (source: https://docs.devin.ai/cli/).
When answering Devin CLI questions, consult the corresponding local mirror document first.

## Routing index

Grouped by topic. Paths are relative to `docs/devin-cli/`.

### Getting started & core usage

- [Quickstart](devin-cli/index.md): 2-minute Devin CLI setup (local command-line coding agent, deep Devin Cloud integration)
- [Essential Commands](devin-cli/essential-commands.md): most-used commands cheat sheet
- [Subagents](devin-cli/subagents.md): delegate tasks to foreground/background independent subagents
- [Hand off to cloud Devins](devin-cli/handoff.md): use `/handoff` to hand a task from CLI to a cloud Devin session
- [Models](devin-cli/models.md): available models and configuration
- [Adaptive](devin-cli/adaptive.md): Cognition's smart model router, automatically picks the best model per task
- [Sandbox](devin-cli/sandbox.md): OS-level isolation, network filtering, and enterprise enforcement for Devin CLI sessions
- [Troubleshooting](devin-cli/troubleshooting.md): common issues and fixes

### IDE integration (ACP)

- [JetBrains](devin-cli/acp/jetbrains.md): run Devin via ACP in JetBrains IDE AI Chat (incl. Remote Development)
- [Zed](devin-cli/acp/zed.md): run as a custom ACP agent in the Zed editor Agent Panel
- [Xcode](devin-cli/acp/xcode.md): run via ACP in Xcode coding assistant, or connect via Xcode MCP bridge

### Extensibility

- [Extensibility Overview](devin-cli/extensibility/index.md): customize Devin CLI with rules, skills, MCP servers
- [Configuration](devin-cli/extensibility/configuration.md): control Devin CLI behavior via config files
- [Rules & AGENTS.md](devin-cli/extensibility/rules.md): provide always-on instructions and context for every session
- [MCP Overview](devin-cli/extensibility/mcp/overview.md): connect external tool servers via Model Context Protocol
- [MCP Configuration](devin-cli/extensibility/mcp/configuration.md): add, configure, and manage MCP servers
- [Skills Overview](devin-cli/extensibility/skills/overview.md): create reusable prompts and workflows to extend agent capabilities
- [Creating Skills](devin-cli/extensibility/skills/creating-skills.md): complete reference for `SKILL.md` format and frontmatter options
- [Plugins](devin-cli/extensibility/plugins/overview.md): plugin installation, authoring, and governance across Devin cloud, CLI, and Desktop
- [Quickstart: team marketplace](devin-cli/extensibility/plugins/quickstart.md): set up a shared team plugin marketplace (skills/rules/hooks/MCP/governance)
- [Hooks](devin-cli/extensibility/hooks/overview.md): run custom logic on session events
- [Lifecycle Hooks](devin-cli/extensibility/hooks/lifecycle-hooks.md): trigger timing and available data for each lifecycle event

### Enterprise

- [Devin Auth](devin-cli/enterprise/devin-auth.md): authenticate Devin CLI with an existing Devin account
- [Legacy Windsurf Auth](devin-cli/enterprise/windsurf-auth.md): authenticate with a legacy Windsurf enterprise account
- [Team Settings](devin-cli/enterprise/team-settings.md): configure team-level settings controlling users' Devin CLI usage
- [System Configuration](devin-cli/enterprise/system-config.md): pin login and proxy settings via MDM-deployed `system.json`
- [Controls](devin-cli/enterprise/controls.md): feature/control differences between Devin CLI as a local agent and Cascade

### Reference

- [Commands & Flags](devin-cli/reference/commands.md): complete reference for command args, subcommands, and interactive slash commands
- [Keyboard Shortcuts](devin-cli/reference/keyboard-shortcuts.md): common Devin CLI keyboard shortcuts
- [Terminal Compatibility](devin-cli/reference/terminal-compatibility.md): supported terminals and recommendations
- [Configuration File](devin-cli/reference/configuration/config-file.md): complete reference for Devin CLI config file format
- [Configuration Import](devin-cli/reference/configuration/read-config-from.md): import settings from Cursor/Windsurf/Claude Code/Copilot/OpenCode/Zed
- [Configuration Precedence](devin-cli/reference/configuration/global-vs-local.md): precedence between global, project, and local settings
- [Permissions](devin-cli/reference/permissions.md): control what the agent can do with fine-grained permission rules
