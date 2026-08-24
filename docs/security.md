# Security model

## Trust boundaries

| Boundary | Trusted component | Untrusted or constrained input |
| --- | --- | --- |
| Renderer -> preload -> main | Typed `DesktopApi` contract and validating main handler | Renderer payloads, paths, URLs, interaction responses |
| Main -> Devin CLI | Validated absolute user-installed executable and ACP SDK | Process output, protocol payloads, stderr, lifecycle failures |
| Desktop -> workspace | User-selected workspace root and explicit file selections | Traversal, symlinks, oversized or unsupported preview content |
| Desktop -> external navigation | Electron main process | Any non-HTTP(S) URL or renderer-initiated navigation |
| Desktop -> credentials | Devin CLI authentication flow | Secret material must not enter desktop persistence or diagnostics |
| Requested execution -> OS | Devin CLI sandbox capability | Missing or unsupported isolation must not become unisolated execution |

## Required invariants

### Renderer isolation and IPC

- Browser windows use `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Renderer accesses native behavior only through `window.devinAgent`, defined by `DesktopApi` and exposed in preload.
- Preload remains a narrow mapping layer and imports no Node built-ins.
- Main validates IPC primitives, records, identifiers, sizes, paths, and ownership before side effects.
- Adding native behavior requires a typed API method, preload mapping, validating main handler, and tests.

### Filesystem and navigation

- Workspace-scoped operations resolve paths and reject targets outside the selected root.
- Preview access uses registered identifiers and explicit allowlists; content limits are enforced before rendering.
- Only `http:` and `https:` URLs may open externally. Renderer navigation is intercepted and delegated to the
  system browser only after main-process validation.
- Never render or execute `file:`, `javascript:`, or other active external schemes from untrusted content.

### Credentials and sensitive data

- Devin CLI owns authentication. Desktop uses only ACP-advertised authentication methods and browser flows.
- Desktop does not read, copy, migrate, or persist Devin credentials or API keys.
- Protocol errors and diagnostics redact sensitive keys before storage, display, or logging.
- New logs must contain operational context without prompt secrets, tokens, credentials, or private file contents.

### Executable and update integrity

- Only an absolute Devin CLI path selected or discovered from the user's environment may be spawned.
- ACP process launch uses an absolute validated path, argument arrays, and `shell: false`. Platform update wrappers
  may create a pseudo-terminal, but their command is derived only from the validated Devin binary path.
- The installed binary is validated with its own version command before use.
- Desktop does not bundle or download Devin CLI. Update requests delegate to the installed `devin update` path.

### Capability and sandbox safety

- Treat ACP payloads as untrusted structured data and capabilities as runtime facts, not permission to bypass validation.
- Never call or present an operation the active runtime has not advertised.
- When sandboxing is requested and unavailable, fail closed. Windows' current sandbox limitation is a product-visible
  constraint, not permission to fall back silently.
- Unknown ACP server requests are rejected rather than executed through a generic desktop escape hatch.

## Security change checklist

For changes involving IPC, files, URLs, auth, update, process launch, permissions, elicitation, or sandboxing:

1. Identify the trust boundary and validate at the receiving side.
2. Test accepted input, malformed input, and unsafe-path failure.
3. Verify renderer isolation and the narrow preload surface remain intact.
4. Confirm diagnostics redact secrets and failure does not broaden authority.
5. Run `pnpm check`; run `pnpm check:independence` when imports, dependencies, or paths change.
6. Update this document in the same change when the threat model or invariant changes.

Primary enforcement entry points are `apps/desktop/src/main/desktop-security.ts` and its tests,
`apps/desktop/src/main/acp-transport.ts`, typed parsers under `apps/desktop/src/shared/`, and validated handlers in
`apps/desktop/src/main/index.ts`.
