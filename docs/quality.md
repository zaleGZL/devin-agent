# Quality contract

## Definition of done

A change is complete only when:

- Observable acceptance criteria are met and unsupported behavior fails explicitly.
- Process, capability, state-ownership, security, and release invariants remain true.
- Changed behavior has focused, co-located tests and all matrix-required checks pass.
- The diff contains no unrelated edits, generated-file hand changes, or hidden fallback paths.
- Product, architecture, development, security, and quality docs are updated when their facts changed.
- Non-trivial OpenSpec artifacts describe the implemented result and completed tasks in Simplified Chinese.
- A code commit includes exactly the required new desktop patch version; documentation-only commits do not.

## Mechanically enforced invariants

| Invariant | Current enforcement |
| --- | --- |
| Type correctness and unused declarations | TypeScript checks through `pnpm typecheck` and `pnpm lint` |
| Module behavior | Co-located Vitest suites through `pnpm test` |
| Electron renderer isolation, safe URLs, path containment, IPC primitives | `desktop-security.test.ts` and main-process validators |
| ACP framing, timeouts, lifecycle, capability/session behavior | Transport and host unit tests with fixtures/mocks |
| No DSCode build/runtime coupling | `pnpm check:independence` in CI |
| Buildability | Electron and renderer builds in `pnpm check` |
| Package startup | Platform package jobs plus packaged smoke tests |
| Generated Devin CLI mirror consistency | Sync-script tests in the root test command |
| Renderer composition root and feature-module size boundaries | `pnpm check:renderer-architecture` in `pnpm check` and CI |
| Tag/artifact release shape | Publish-script preconditions and tag-triggered workflow checks |

Custom failures should state the violated invariant and a concrete remediation. This turns a failed check into useful
context for the next agent run.

## Evidence by risk

- **Low risk:** documentation or pure presentation changes; review links/rendering and run focused tests if behavior moved.
- **Medium risk:** local state, parsers, renderer state transitions, or native integration; focused tests plus `pnpm check`.
- **High risk:** ACP protocol, permissions, auth, process launch, filesystem boundaries, sandbox, packaging, or release;
  focused negative-path tests, full checks, independence scan, and the relevant smoke/package evidence.
- Live authenticated testing supplements deterministic tests; it never replaces boundary and failure-path coverage.

## Known gaps

These are explicit engineering gaps, not claims that the current product is broken:

| Gap | Risk | Closure evidence |
| --- | --- | --- |
| Documentation topology, internal links, and freshness triggers are not checked mechanically | Agents can follow stale or broken routes | A deterministic docs check included in `pnpm check` and CI |
| Renderer end-to-end interaction coverage is limited; most renderer tests target pure modules | Integration regressions can escape unit tests | Stable Electron UI smoke coverage for critical user journeys |
| Authenticated ACP smoke testing is opt-in and absent from CI | Upstream runtime drift may be found late | A secure scheduled/manual environment with a pinned test account and actionable diagnostics |
| CI packages macOS and Linux but not Windows, while Windows remains a documented platform with sandbox limits | Release behavior can diverge by platform | A Windows package job with startup smoke evidence or an explicit removal of Windows support claims |
| App-level state coordination remains substantial after extracting business UI from `renderer/App.tsx` | Cross-domain changes can still touch a broad controller surface | Move stable session, composer and inspector lifecycles into domain controllers, then lower the 2,500-line guardrail |
| No recurring automated documentation/quality gardening task exists | Small drift can compound | A bounded recurring audit that opens targeted changes and never bypasses review or release authority |

Update this table when a gap is closed, materially changes, or gains executable enforcement. New recurring review
feedback belongs here only until it can be promoted into a test, check, or stable architectural rule.
