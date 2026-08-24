# Development workflow

## Branch and delivery flow

- `dev` is the default development branch. Perform day-to-day work there.
- Deliver completed work through a Merge Request from `dev` to `main`; do not commit directly to `main`.
- After merge, synchronize `main` back into `dev` before starting the next change.
- Preserve unrelated work in a dirty tree and keep each change scoped to its acceptance criteria.

## Change loop

1. Read `AGENTS.md` and only the routed documents relevant to the task.
2. Establish the current behavior from code, tests, and configuration. State observable acceptance criteria.
3. Use a lightweight working plan for small changes. For non-trivial product or architecture changes,
   create or update the Simplified Chinese proposal, design, tasks, and delta specs under `openspec/changes/`.
4. Implement the smallest coherent change. Preserve process, capability, security, and state-ownership boundaries.
5. Add or update co-located tests. Reproduce bugs with a failing test when practical.
6. Run focused checks while iterating, then all checks required by the matrix below.
7. Review the diff for unintended files, stale docs, missing acceptance evidence, and version policy compliance.

When a failure repeats, identify the missing capability, documentation, abstraction, or check. Feed the durable
fix back into the repository instead of relying on a stronger prompt next time.

## Validation matrix

| Touched area | Required evidence before handoff |
| --- | --- |
| Documentation only | Review rendered Markdown, links, commands, and consistency with executable artifacts |
| TypeScript behavior | Co-located Vitest coverage and `pnpm check` |
| Dependencies, imports, build paths, workspace layout | `pnpm check` and `pnpm check:independence` |
| ACP types, transport, host, capabilities, or interactions | Relevant mock/fixture tests, `pnpm check`, and `pnpm check:independence` |
| Devin CLI upstream documentation mirror | `pnpm docs:sync:devin-cli`, generated diff review, and `pnpm test:docs-sync` |
| Packaging configuration or Electron startup | `pnpm check`, local target package build, and the relevant packaged smoke test |
| Authenticated end-to-end ACP behavior | Focused unit tests first; then `DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin` when credentials and environment are available |
| Release tooling | Dry read of tag/artifact preconditions, `pnpm check`, and `pnpm check:independence`; do not publish unless explicitly requested |

`pnpm check` runs typecheck, unused-code linting, tests, and both Electron/renderer builds. ACP unit tests should
mock the runtime by default so CI remains deterministic. The live smoke test is explicit because it requires an
authenticated, locally installed Devin CLI.

## Code and test conventions

- Modules use co-located `.test.ts` or `.test.tsx` files with Vitest.
- Validate untrusted inputs at process and protocol boundaries. Prefer shared parsers and explicit typed contracts.
- Derive user-visible availability from runtime capabilities, never static lists standing in for ACP negotiation.
- Keep renderer logic pure where possible; native side effects belong in main behind typed IPC.
- Avoid hidden fallback behavior. Unsupported, unsafe, or unverifiable paths fail explicitly.
- For a code commit, increment the patch component in `apps/desktop/package.json` and include it in the same commit.
  A documentation-only commit does not require a version bump.

## Documentation obligations

The repository, not chat or review history, owns durable decisions. Follow the update triggers in
[docs/README.md](README.md). OpenSpec holds change-local intent and history; the normative documents describe the
current system after the change. Generated Devin CLI mirror files must never be manually edited.

## Build and package

```bash
pnpm build      # Electron main/preload plus Vite renderer
pnpm pack       # local unsigned unpacked package
pnpm pack:mac   # unsigned Apple Silicon DMG copied to Downloads
```

CI runs `pnpm check` and `pnpm check:independence`, then packages unsigned macOS arm64/x64 and Linux x64
artifacts. Packaged smoke tests run before upload. Current workflow configuration is authoritative for the exact
matrix and artifact set.

## Release

1. Confirm the change is on `main`, the working tree is clean, and required checks passed.
2. Confirm the code commit already bumped `apps/desktop/package.json` to an unused semantic version.
3. Run `pnpm publish:desktop` only with explicit release authorization.
4. The script creates and pushes `desktop-v<version>`; the tag-triggered workflow verifies, packages, smoke-tests,
   and publishes the GitHub Release.

Artifacts are unsigned and not notarized. Public installation constraints belong in `README.md`; release mechanics
belong here and in `.github/workflows/desktop.yml` and `scripts/publish-desktop.mjs`.
