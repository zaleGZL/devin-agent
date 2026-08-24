# Architecture

## System boundary

The application is an Electron shell around host-owned processes started from one locally installed Devin CLI.
The primary UI host shares one `devin acp` process across its loaded sessions; the optional WeChat bridge owns
a separate host for its fixed session. The desktop owns native OS integration and presentation; Devin CLI owns
agent execution and session truth.

```text
React renderer
    |
    | window.devinAgent (typed API only)
    v
sandboxed preload
    |
    | validated Electron IPC
    v
Electron main process
    |-- local OS/filesystem/git/settings integration
    |-- DevinAcpHost (runtime lifecycle and session adapter)
    v
AcpTransport + official ACP SDK
    |
    | stdio JSON-RPC
    v
user-installed `devin acp`
```

## Dependency direction

| Layer | May own | Must not own |
| --- | --- | --- |
| `renderer/` | React state, view models, capability presentation, user interaction | Node APIs, filesystem/process access, raw IPC, or agent execution |
| `preload/` | The narrow `DesktopApi` bridge and event subscriptions | Business state, Node built-in imports, or untyped general IPC |
| `main/` | Electron lifecycle, native capabilities, validation, durable app-local state, runtime adapter | Renderer presentation logic or a second agent/tool runtime |
| `shared/` | Serializable types, parsers, normalizers, and side-effect-free protocol utilities | Electron windows, subprocess ownership, filesystem state, or React UI |
| Devin CLI | ACP sessions, prompts, tools, permissions, authentication, sandbox, transcript | Desktop presentation and app-local metadata |

Dependencies flow from platform-specific edges toward explicit shared contracts. Cross-boundary data is
validated at entry; new native behavior requires a typed `DesktopApi` method, a preload mapping, a main
handler, and tests at the validation boundary.

### Renderer feature topology

`renderer/App.tsx` is the application composition root. It may coordinate shared runtime/session state and wire
feature callbacks, but business presentation belongs to the feature that owns it:

```text
renderer/
  App.tsx
  features/
    app/            shell-level composition contracts and layout
    conversation/   messages, work log, follow-up queue, context usage
    composer/       attachments, model and permission controls
    sessions/       project/session sidebar, search, session dialogs
    inspector/      workspace changes and file preview
    settings/       profile, runtime, model, appearance and archive settings
    interactions/   permission, elicitation, extension and side-chat UI
    plans/          structured plan editing and auth dialogs
  components/       cross-feature stateless presentation primitives only
  lib/              cross-feature pure state, parsing, normalization and formatting
```

Feature modules may depend on `shared/`, renderer `lib/`, and deliberately reusable `components/`. They must not
depend on `App.tsx`, create raw IPC channels, or move native/runtime ownership out of main. Cross-feature imports
should be limited to an explicit public component or shared presentation contract; when two features become
mutually dependent, move only the stable pure contract downward rather than introducing a cycle.

## State ownership

| State | Source of truth | Desktop behavior |
| --- | --- | --- |
| Transcript, prompt status, runtime session properties | Devin CLI session/ACP events | Normalize and render; reject stale or unknown-session events |
| Models, modes, commands, extensions, media support | ACP initialize and session responses | Gate UI and requests dynamically |
| Pinning, order, archive state, local title override | App-local session index | Persist locally and label server-confirmed vs local-only fields |
| Color, language, profile, selected CLI path | App settings under Electron user data | Validate and persist locally |
| Workspace files and git changes | User-selected workspace | Read only through scoped main-process handlers |
| WeChat bridge queues and connection state | Main-process WeChat service | Persist locally; forward agent work to the configured Devin session |

## Runtime flow

1. Each runtime host discovers or validates an absolute Devin CLI path.
2. `AcpTransport` spawns that path with `acp`, with `shell: false`, bounded messages, request timeouts,
   redacted diagnostics, and the official ACP SDK handling JSON-RPC framing.
3. `DevinAcpHost` initializes ACP, stores advertised capabilities, and owns loaded session lifecycle.
4. Main adapts host state/events into the serializable `DesktopApi` contract.
5. Renderer derives controls from the capability snapshot and sends only supported operations.
6. Permission and elicitation server requests cross a validated interaction broker and are returned to
   the same runtime request; unsupported server requests are rejected.

## Key entry points

- `apps/desktop/src/main/index.ts` — Electron lifecycle, windows, IPC handlers, and native integration.
- `apps/desktop/src/main/devin-acp-host.ts` — Devin process/session lifecycle and ACP capability enforcement.
- `apps/desktop/src/main/acp-transport.ts` — official SDK transport, subprocess, timeouts, and diagnostics.
- `apps/desktop/src/main/desktop-security.ts` — renderer, path, URL, and IPC primitives.
- `apps/desktop/src/preload/index.ts` — the complete renderer-to-main API surface.
- `apps/desktop/src/shared/types.ts` — `DesktopApi` and cross-process application data contracts.
- `apps/desktop/src/shared/acp-types.ts` — ACP structural types, capability helpers, and redaction.
- `apps/desktop/src/shared/capabilities.ts` — stable capability normalization and feature gates.
- `apps/desktop/src/renderer/App.tsx` — current main UI composition root.
- `apps/desktop/src/renderer/features/` — business-owned renderer components and shell presentation boundaries.
- `apps/desktop/src/renderer/lib/acp-normalizer.ts` — ACP event normalization for presentation.
- `apps/desktop/src/renderer/lib/conversation.ts` — renderer conversation state transitions.

## Architectural change rules

- Read [devin-cli.md](devin-cli.md), relevant mirrored pages, and installed ACP SDK types before changing
  protocol interaction. Do not infer a capability from documentation for a different client.
- Preserve one executor: desktop adapters may validate, normalize, index, queue, and present, but never
  execute agent tools or synthesize runtime results.
- Enforce boundaries, data shapes, and failure modes centrally. Keep feature-specific implementation
  choices local inside those constraints.
- Add structural or unit tests for any new invariant. Error messages should tell a future agent how to
  remediate the violation.
- Record non-trivial changes in Simplified Chinese OpenSpec artifacts; update this document when the
  resulting topology, ownership, or dependency direction changes.
