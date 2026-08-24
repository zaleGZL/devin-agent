# AGENTS.md

Devin Coding Agent — a desktop-only local coding agent.
The sole agent runtime is the user's locally installed Devin CLI, connected via the ACP protocol.
This file is a navigation map for the repository, not an encyclopedia. Drill down on demand; do not read every link up front.

## Quick commands

```bash
pnpm install              # install dependencies
pnpm dev                  # start dev (Vite + Electron)
pnpm check                # typecheck + lint + test + build
pnpm check:independence   # ensure no DSCode checkout references
pnpm docs:sync:devin-cli  # sync the Devin CLI docs mirror from docs.devin.ai/llms.txt
pnpm pack                 # local pack (unsigned)
pnpm pack:mac             # unsigned Apple Silicon DMG → Downloads, then open Finder
pnpm publish:desktop      # read version from apps/desktop/package.json → tag → push → CI publishes Release
```

Real ACP smoke test (requires an authenticated Devin CLI):

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

## Branching workflow

- The default development branch is `dev`. Do all day-to-day work on `dev`.
- When a piece of work is complete, open a Merge Request (MR) from `dev` to `main`.
- After the MR is merged into `main`, sync the latest `main` back into `dev`
  (e.g. `git checkout dev && git merge main` or `git pull origin main`) so `dev`
  stays up to date before starting the next change.
- Do not commit directly to `main`; route changes through `dev` → MR → `main`.

## Architecture map

```
apps/desktop/src/
  main/       Electron main process: owns Devin subprocess, filesystem, native capabilities
  preload/    IPC bridge (validated; renderer has no Node access)
  renderer/   React UI (App.tsx main view + lib/ modules + styles.css)
  shared/     types and capability definitions shared between main and renderer
```

Key module entry points (paths relative to repo root):

- `apps/desktop/src/main/devin-acp-host.ts` — ACP host logic; manages Devin subprocess lifecycle
- `apps/desktop/src/main/acp-transport.ts` — ACP JSON-RPC transport layer
- `apps/desktop/src/main/devin-discovery.ts` — discover and validate the local `devin` binary
- `apps/desktop/src/main/devin-update.ts` — delegate to official `devin update`; never self-download
- `apps/desktop/src/main/git-changes.ts` — workspace git status
- `apps/desktop/src/renderer/App.tsx` — main UI (single file)
- `apps/desktop/src/renderer/lib/acp-normalizer.ts` — ACP event normalization
- `apps/desktop/src/renderer/lib/conversation.ts` — conversation state management
- `apps/desktop/src/shared/acp-types.ts` — ACP protocol types
- `apps/desktop/src/shared/capabilities.ts` — dynamic capability negotiation

## Mandatory rules

These rules always apply. Violating them causes CI failures or runtime errors.

1. **No DSCode references.** If your change touches dependencies, imports, or paths, run `pnpm check:independence`.
   No DSCode checkout paths or `DSCODE_*` env vars.

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

7. **Read protocol types before changing ACP interaction.** Before editing `apps/desktop/src/shared/acp-types.ts` or `apps/desktop/src/main/acp-transport.ts`,
   read the ACP-related doc index in `docs/devin-cli.md`.

8. **Every code commit bumps the desktop patch version.** Before committing any code change, increment the final
   `x.y.Z` component in `apps/desktop/package.json` and include that version bump in the same commit.
   Never reuse or skip this patch-version update for a code commit.

## Deeper docs

Read on demand; you don't need to read all of these before starting work.

- [README.md](README.md) — project overview, prerequisites, feature boundaries, platform limits
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
