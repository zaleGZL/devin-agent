<p align="center">
  <img src="assets/devin-agent-brand.png" width="180" alt="Devin Coding Agent">
</p>

<h1 align="center">Devin Coding Agent</h1>

<p align="center">A desktop coding agent powered by your locally installed Devin CLI.</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

---

Devin Coding Agent is a native desktop client that connects to the Devin CLI via the
[Agent Client Protocol (ACP)](https://docs.devin.ai/cli/). It does not bundle or redistribute
the Devin CLI binary — you install and authenticate the CLI yourself, and the app drives it
through ACP.

## Features

- Workspace management with multiple Devin sessions
- Streaming conversations with reasoning, plans, and tool activity
- Image input, dynamic models and modes, permission requests
- File preview, themes, language switching, and command palette
- Capabilities are negotiated at runtime from the ACP — nothing is hardcoded

## Prerequisites

- [Node.js](https://nodejs.org/) `>= 22.19.0`
- [pnpm](https://pnpm.io/) `10.x`
- [Devin CLI](https://docs.devin.ai/cli/) installed and authenticated (`devin auth login`)

## Quick start

```bash
git clone https://github.com/zaleGZL/devin-agent.git
cd devin-agent
pnpm install
pnpm dev
```

If the app cannot find `devin` on your `PATH`, open **Settings** and select the absolute path
to the Devin CLI binary. The app runs `devin --version` to verify, then connects via `devin acp`.

## Development

```bash
pnpm check              # typecheck + lint + test + build
pnpm check:independence # ensure no forbidden DSCode references
pnpm test               # unit tests only
```

Real ACP smoke test (requires an authenticated Devin CLI):

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

## Build & package

```bash
pnpm build              # build electron + renderer
pnpm pack               # local unsigned pack
```

## Release

1. Bump `version` in `apps/desktop/package.json`.
2. Commit.
3. Run `pnpm publish:desktop` — this tags `desktop-v<version>`, pushes it, and CI builds
   and publishes installers to GitHub Releases.

Installers are currently **unsigned**. macOS users must right-click → Open to bypass
Gatekeeper; Windows will show a SmartScreen warning.

## Platform notes

| Platform | Sandbox | Notes |
|----------|---------|-------|
| macOS | Seatbelt | Full sandbox support |
| Linux | `bubblewrap` + `socat` | Required dependencies for sandbox |
| Windows | Not available | Devin CLI does not support OS sandbox on Windows |

When sandbox is requested but the environment does not support it, the app fails closed
and never silently falls back to unisolated execution.

## License

[MIT](apps/desktop/LICENSE)
