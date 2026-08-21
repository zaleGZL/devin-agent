> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Sandbox

> OS-level isolation for Devin CLI sessions: how the sandbox works, network filtering, and enterprise enforcement.

The `--sandbox` flag runs the CLI with OS-level isolation, enforcing writable paths and `deny` rules at the operating-system level and optionally restricting network traffic.

## How the sandbox works

When the sandbox is active:

* **Writable paths** are derived from granted `Write(...)` permission scopes plus the workspace directory; everything else is read-only
* **Readable paths** are everything except paths covered by `Read(...)` rules in the `deny` list, which are hidden from sandboxed commands entirely
* `Write(...)` scopes granted mid-session dynamically expand the sandbox for subsequent commands. Mid-session `Read(...)` approvals affect only the agent's own tools — they cannot reveal a path hidden by a `Read(...)` deny rule, which stays hidden for the whole session

<Warning>
  If sandbox resolution fails (e.g., the sandboxing tools are unavailable on the user's platform), the CLI will **refuse to start** rather than running unsandboxed. This fail-closed behavior applies whether sandbox was enabled by a [team setting](/cli/enterprise/team-settings#sandbox-enforcement) or by the user passing `--sandbox` directly, ensuring the security intent is never silently bypassed.

  Common causes of sandbox resolution failure:

  * **Windows**: OS-level sandboxing is not currently supported on Windows. Sessions on Windows will hard-fail when `--sandbox` is passed or when sandbox enforcement is **Required**, including when the CLI runs as an ACP server inside an IDE (e.g., Devin Desktop).
  * **Linux**: Sandboxing requires `bubblewrap` (`bwrap`) and `socat` to be installed. Sessions hard-fail with installation instructions when these are missing.
  * **Permission scope errors**: Invalid paths in permission scopes that can't be resolved.
</Warning>

## Network filtering

<Warning>
  Sandbox network filtering is currently unstable. If you need this feature, please reach out to your account representative for stability timelines.
</Warning>

Configure domain-level network filtering for the sandbox in the [`sandbox` section of your config file](/cli/reference/configuration/config-file#sandbox) (user config only). When `--sandbox` is active and domain filtering is configured, a managed network proxy starts on loopback and the sandbox restricts all child traffic to route through it.

| Option            | Type      | Default  | Description                                                                                                   |
| ----------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `allowed_domains` | string\[] | `[]`     | Domain patterns allowed through the proxy. When non-empty, only matching domains are allowed (allowlist mode) |
| `denied_domains`  | string\[] | `[]`     | Domain patterns always blocked. Deny rules take precedence over allow rules                                   |
| `network_mode`    | string    | `"full"` | `"full"` allows all HTTP methods; `"limited"` allows only GET/HEAD/OPTIONS                                    |

**Domain pattern syntax:**

| Pattern          | Matches                       |
| ---------------- | ----------------------------- |
| `example.com`    | Exact match only              |
| `*.example.com`  | Any subdomain (not the apex)  |
| `**.example.com` | Apex domain and any subdomain |

**Example:**

```json theme={null}
{
  "sandbox": {
    "allowed_domains": [
      "github.com",
      "**.npmjs.org",
      "**.crates.io",
      "**.pypi.org"
    ],
    "denied_domains": ["evil.example.com"],
    "network_mode": "full"
  }
}
```

<Note>
  Domain filtering applies when the sandbox is active (`--sandbox`). Without `--sandbox`, the sandbox section is ignored.
</Note>

## Excluded commands

Sometimes a specific command needs to run *outside* the sandbox — for example `git` commands that must access credentials or hooks the sandbox blocks. The `sandbox.excluded` config section lets you exclude matching commands from sandbox isolation using the same `Exec(...)` rule syntax as [permissions](/cli/reference/permissions):

| Option           | Type      | Description                                                                |
| ---------------- | --------- | -------------------------------------------------------------------------- |
| `excluded.allow` | string\[] | Matching commands run outside the sandbox automatically                    |
| `excluded.ask`   | string\[] | Matching commands run outside the sandbox after the user approves a prompt |
| `excluded.deny`  | string\[] | Matching commands are never excluded — they always stay inside the sandbox |

**Example:**

```json theme={null}
{
  "sandbox": {
    "excluded": {
      "allow": ["Exec(git status *)"],
      "ask": ["Exec(git push *)"],
      "deny": ["Exec(git tag *)"]
    }
  }
}
```

**Rule resolution:** for each command, the most specific matching rule wins within a source (e.g., `Exec(git push *)` beats `Exec(git *)`), and when both user config and [team settings](#enterprise-excluded-commands) match, the more restrictive verdict wins (`deny` > `ask` > `allow`). Commands with no matching rule — including when `sandbox.excluded` is not configured at all — always run inside the sandbox.

<Note>
  * Only `Exec(...)` rules are supported in `sandbox.excluded`; any other rule type (e.g., `Read(...)`, `Write(...)`) is ignored with a warning.
  * Exclusion is fail-closed: if a command can't be safely resolved (e.g., it can't be parsed), it stays inside the sandbox.
  * Exclusions apply to the default per-command exec path. Commands run through a persistent PTY shell (interactive sessions, or when `pty_for_noninteractive_exec` is enabled) always stay inside the sandbox.
</Note>

## Enterprise enforcement

Enterprise admins can control sandbox behavior for their entire organization via [Team Settings](/cli/enterprise/team-settings#sandbox-enforcement).

### Sandbox enforcement mode

Set the enforcement level for the `--sandbox` flag across your organization:

* **Optional** (default) — Users choose whether to pass `--sandbox`. No enforcement.
* **Required** — The `--sandbox` flag is forced on for all users, even if they don't pass it on the command line. All CLI sessions run with OS-level file system sandboxing that enforces writable paths and `Read(...)` deny rules.

A future **Strict** mode may lock down sandbox configuration entirely, preventing users from modifying sandbox settings.

<Warning>
  Ensure all target machines are provisioned before setting sandbox enforcement mode to **Required** across your organization. If any users are on Windows, they will be unable to run the CLI until OS-level sandboxing is supported on Windows or the policy is relaxed to **Optional**.
</Warning>

### Enterprise domain filtering

Admins can also configure organization-wide domain allowlists and denylists:

* **Domain allowlist** — When set, **only** the domains in this list are reachable through the sandbox network proxy. This list is **authoritative**: it completely replaces any user-configured `allowed_domains`. Users cannot add additional domains to bypass admin restrictions.
* **Domain denylist** — Domains that are always blocked. Enterprise denied domains are **additive**: they are merged with the user's local `denied_domains`, making the combined list more restrictive.

**How enterprise and user domain lists interact:**

| Scenario             | Enterprise config                 | User config                       | Effective result                                             |
| -------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| Admin sets allowlist | `allowed_domains: ["github.com"]` | `allowed_domains: ["npmjs.org"]`  | Only `github.com` is allowed (enterprise replaces user list) |
| Admin sets denylist  | `denied_domains: ["evil.com"]`    | `denied_domains: ["risky.io"]`    | Both `evil.com` and `risky.io` are blocked (merged)          |
| No admin allowlist   | `allowed_domains: []`             | `allowed_domains: ["github.com"]` | User's allowlist is used                                     |

<Note>
  Because the user's local `denied_domains` are preserved and merged additively, a user could deny a domain that appears in the enterprise allowlist. This is intentional: the combined effect is always more restrictive, never less. If this causes access issues, the user should remove the conflicting entry from their local config.
</Note>

### Enterprise excluded commands

Admins can also set organization-wide [excluded command](#excluded-commands) rules in team settings:

* **Excluded allow / ask** — `Exec(...)` rules for commands that may run outside the sandbox across the organization, automatically or after a prompt.
* **Excluded deny** — `Exec(...)` rules for commands that must never run outside the sandbox. A team `deny` overrides any user-level `allow` or `ask` for matching commands, so users cannot exclude commands their admins have locked down.

Team and user rules are resolved together: the most specific matching rule wins within each source, and the more restrictive verdict wins across sources (`deny` > `ask` > `allow`).

**Example: lock down all exclusions except `gh`.** A wildcard `deny` with an `allow` carve-out keeps every command inside the sandbox except `gh`, regardless of what users configure locally. These values go into the team-settings excluded-commands configuration (not the user config file, so there is no enclosing `sandbox` key):

```json theme={null}
{
  "excluded": {
    "deny": ["Exec(**)"],
    "allow": ["Exec(gh *)"]
  }
}
```

Because the more specific `Exec(gh *)` rule beats the wildcard `Exec(**)`, `gh` commands run outside the sandbox while everything else stays inside — and the team-level wildcard `deny` overrides any user-level `allow` or `ask` rules for other commands.

## Further reading

* [Team Settings](/cli/enterprise/team-settings#sandbox-enforcement) — enterprise sandbox enforcement and domain filtering
* [Config file reference](/cli/reference/configuration/config-file#sandbox) — the user-level `sandbox` config section
* [Permissions](/cli/reference/permissions) — permission scopes that drive sandbox writable paths and deny rules
