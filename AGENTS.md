# AGENTS.md

Devin Coding Agent is a desktop-only client for the user's locally installed Devin CLI.
Devin CLI is the sole agent runtime and is connected through ACP; the desktop is a secure
transport and presentation shell.

This file is a map, not a manual. Read only the documents relevant to the current change,
then use code, tests, and generated configuration as the executable source of truth.

## Start here

| When working on | Read first |
| --- | --- |
| Product behavior or scope | [README.md](README.md), [docs/product.md](docs/product.md) |
| Process boundaries, IPC, state ownership | [docs/architecture.md](docs/architecture.md) |
| Implementation, tests, branches, releases | [docs/development.md](docs/development.md) |
| Credentials, filesystem, URLs, sandboxing | [docs/security.md](docs/security.md) |
| Acceptance criteria and known quality gaps | [docs/quality.md](docs/quality.md) |
| ACP or Devin CLI behavior | [docs/devin-cli.md](docs/devin-cli.md), then the routed mirror page |
| A non-trivial product or architecture change | the active Simplified Chinese artifact under `openspec/changes/` |
| Why a repository rule exists | [docs/research/](docs/research/) for evidence; research is not normative |

The full knowledge map and documentation maintenance contract are in
[docs/README.md](docs/README.md).

## Quick commands

```bash
pnpm install              # install dependencies
pnpm dev                  # start Vite + Electron
pnpm check                # typecheck + lint + test + build
pnpm check:independence   # reject DSCode dependencies, paths, env vars, and symlinks
pnpm docs:sync:devin-cli  # refresh the generated Devin CLI documentation mirror
pnpm pack                 # local unsigned package
pnpm pack:mac             # unsigned Apple Silicon DMG -> Downloads
pnpm publish:desktop      # tag the package version and trigger the release workflow
```

Authenticated integration smoke test; do not run it by default in CI:

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

## Non-negotiable invariants

1. **No second executor.** Prompts, tools, terminals, permissions, sandboxing, MCP, Skills,
   Rules, Hooks, and Plugins execute in Devin CLI. Desktop sends requests and renders results.
2. **No fabricated capabilities.** Models, modes, commands, session operations, image/audio
   support, and extensions come from ACP initialize/session responses. Unadvertised behavior is
   neither called nor shown.
3. **No Devin credential access.** Authentication uses only ACP-advertised methods and the
   system browser. The desktop does not read, copy, or persist Devin credentials.
4. **No Devin binary distribution.** Discovery validates a user-installed binary; updates
   delegate to `devin update`. Installers never bundle or self-download Devin CLI.
5. **Sandbox fails closed.** If isolation is requested but unavailable, execution must stop
   instead of silently running without isolation.
6. **Electron boundaries stay narrow.** Renderer has no Node access. Native capabilities live
   in main and are exposed only through the validated, typed preload IPC surface.
7. **No DSCode coupling.** Never add DSCode imports, checkout paths, runtime packages,
   `DSCODE_*` environment variables, or build-input symlinks.
8. **Protocol changes start from evidence.** Before changing `acp-types.ts`, `acp-transport.ts`,
   or ACP request handling, read `docs/devin-cli.md`, the relevant mirror pages, and SDK types.
9. **Tests follow modules.** Add or update co-located Vitest tests for changed behavior. Prefer
   mocks for ACP logic; use the live smoke test only when authenticated integration evidence is needed.
10. **Every code commit bumps the desktop patch version.** Increment `x.y.Z` in
    `apps/desktop/package.json` in the same commit. Documentation-only commits do not bump it.

## Change contract

- Work on `dev`; deliver through `dev` -> Merge Request -> `main`. Never commit directly to `main`.
- Define observable acceptance criteria before implementation. For non-trivial work, keep the
  OpenSpec proposal, design, tasks, and delta specs in Simplified Chinese and current with the code.
- When behavior, architecture, workflow, security posture, or a durable decision changes, update
  its canonical document in the same change. Do not leave the decision only in chat or review history.
- Run the smallest relevant checks while iterating and the full required checks before handoff.
  The validation matrix is in [docs/development.md](docs/development.md).
- Turn repeated review feedback into a repository rule, test, or check. Prefer enforcing boundaries
  and invariants mechanically while leaving implementation choices local.
