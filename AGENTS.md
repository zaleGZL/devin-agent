# AGENTS.md

Devin Coding Agent — a desktop-only local coding agent.
The sole agent runtime is the user's locally installed Devin CLI, connected via the ACP protocol.
This file is a navigation map for the repository, not an encyclopedia. Drill down on demand; do not read every link up front.

## Quick commands

```bash
pnpm install              # install dependencies
pnpm dev                  # start dev (Vite + Electron)
pnpm check                # typecheck + lint + test + build
pnpm check:independence   # ensure no DSCode checkout / @thinkany/dscode-* references
pnpm pack                 # local pack (unsigned)
pnpm pack:mac             # unsigned Apple Silicon DMG → Downloads, then open Finder
pnpm publish:desktop      # read version from apps/desktop/package.json → tag → push → CI publishes Release
```

Real ACP smoke test (requires an authenticated Devin CLI):

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

## Architecture map

```
apps/desktop/src/
  main/       Electron main process: owns Devin subprocess, filesystem, native capabilities
  preload/    IPC bridge (validated; renderer has no Node access)
  renderer/   React UI (App.tsx main view + lib/ modules + styles.css)
  shared/     types and capability definitions shared between main and renderer
```

Key module entry points:

- `main/devin-acp-host.ts` — ACP host logic; manages Devin subprocess lifecycle
- `main/acp-transport.ts` — ACP JSON-RPC transport layer
- `main/devin-discovery.ts` — discover and validate the local `devin` binary
- `main/devin-update.ts` — delegate to official `devin update`; never self-download
- `main/git-changes.ts` — workspace git status
- `renderer/App.tsx` — main UI (single file)
- `renderer/lib/acp-normalizer.ts` — ACP event normalization
- `renderer/lib/conversation.ts` — conversation state management
- `shared/acp-types.ts` — ACP protocol types
- `shared/capabilities.ts` — dynamic capability negotiation

## Mandatory rules

These rules always apply. Violating them causes CI failures or runtime errors.

1. **No DSCode references.** If your change touches dependencies, imports, or paths, run `pnpm check:independence`.
   No `@thinkany/dscode-*`, DSCode checkout paths, or `DSCODE_*` env vars.

2. **No fabricated ACP capabilities.** The UI must not use static constants in place of runtime negotiation.
   models, modes, slash commands, session operations, image/audio support must all come from ACP initialize/session responses.
   Capabilities not advertised are not called and not shown.

3. **No second executor.** Agent prompt, tools, terminal, permission, sandbox,
   MCP, Skills, Rules, Hooks, Plugins are all executed by Devin CLI.
   Desktop only sends requests and displays results.

4. **No reading or copying Devin credentials.** Auth is done only via ACP-advertised methods and the system browser.
   Browser auth is not self-implemented.

5. **No self-downloading Devin CLI binary.** Updates are delegated to the local `devin update`.
   Install packages do not bundle Devin CLI binary.

6. **Sandbox is fail-closed.** When sandbox is requested but the environment does not support it, never silently fall back to unisolated execution.

7. **Read protocol types before changing ACP interaction.** Before editing `shared/acp-types.ts` or `main/acp-transport.ts`,
   read the ACP-related doc index in `docs/devin-cli.md`.

## Deeper docs

Read on demand; you don't need to read all of these before starting work.

- [readme.md](readme.md) — project overview, prerequisites, feature boundaries, platform limits
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — DSCode MIT source record and Devin CLI distribution constraints
- [docs/devin-cli.md](docs/devin-cli.md) — index to the local mirror of Devin CLI official docs (ACP, config, extensibility, enterprise, reference)
- [.github/workflows/desktop.yml](.github/workflows/desktop.yml) — CI: verify → tri-platform packaging → tag-triggered Release

## Testing conventions

- Every module has a co-located `.test.ts` file, using Vitest.
- If you change a module, run `pnpm test` to confirm its tests pass.
- Prefer mock tests for ACP-related changes; use `smoke:devin` for real ACP smoke, do not run it by default in CI.

## Release

1. Bump `version` in `apps/desktop/package.json`.
2. Commit.
3. `pnpm publish:desktop` — automatically creates a `desktop-v<version>` tag and pushes it; CI runs and the installers appear on GitHub Releases.
4. Artifacts are unsigned. macOS users must right-click → Open to bypass Gatekeeper; Windows will show a SmartScreen warning.
