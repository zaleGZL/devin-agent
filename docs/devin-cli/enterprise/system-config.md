> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# System Configuration

> Pin Devin CLI login and proxy settings across managed devices with an MDM-distributed system.json policy

## Overview

`system.json` is an optional, machine-wide policy file that administrators distribute to managed devices (typically via MDM). It lives in a system directory that only an administrator can write, so — unlike the user config at `~/.config/devin/config.json` — the settings it carries cannot be changed or removed by the user.

Use it to:

* **Pin authentication** to your enterprise Devin host and/or account, so `devin auth login` skips the login-method menu and rejects any account outside your organization.
* **Force an outbound HTTP proxy** for the CLI and its updater. The enterprise setting takes precedence over the user config, and a user who also has a `proxy` section in their own config is asked to remove it before the CLI will start — see [proxy](#proxy) before rolling one out.

The file is optional and additive: when it is absent, Devin CLI behaves exactly as it does on an unmanaged device.

## File location

| Platform | Path                                             |
| -------- | ------------------------------------------------ |
| macOS    | `/Library/Application Support/Devin/system.json` |
| Linux    | `/etc/devin/system.json`                         |
| Windows  | `C:\ProgramData\Devin\system.json`               |

<Note>
  These are the same machine-wide, administrator-writable directories Devin Desktop uses for system-level [rules](/desktop/cascade/memories) and [hooks](/desktop/cascade/hooks). Deploy the file with root/Administrator ownership and read-only permissions for regular users — the CLI reads it wherever it finds it, so a user-writable location defeats the purpose of the policy.
</Note>

## Example

```json theme={null}
// /Library/Application Support/Devin/system.json
{
  "enterprise_host": "acme.devinenterprise.com",
  "account_id": "acct-acme",
  "proxy": {
    "mode": "manual",
    "url": "http://proxy.corp.example.com:8080",
    "no_proxy": "localhost,127.0.0.1,.internal.corp"
  }
}
```

<Warning>
  `system.json` is parsed as strict JSON — comments and trailing commas are **not** supported here, unlike the user `config.json`, which is JSON-with-comments. The comment above is shown only to indicate the file path.
</Warning>

## Options reference

| Option            | Type   | Default | Description                                                                                                                      |
| ----------------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `enterprise_host` | string | unset   | Devin enterprise host that users must authenticate against, e.g. `"acme.devinenterprise.com"`. Accepts a bare host or a full URL |
| `account_id`      | string | unset   | Devin account identifier the authenticated account must belong to                                                                |
| `proxy`           | object | unset   | Outbound HTTP proxy settings for the CLI and the updater (`mode`, `url`, `no_proxy`)                                             |

Every field is independent — set only the ones you need. Unknown fields are ignored, so a policy written for a newer CLI still applies its known settings on an older one.

### enterprise\_host

When set, `devin auth login`:

1. Skips the login-method menu and the subdomain prompt, and drives authentication directly against the configured host.
2. Rejects any login whose resulting account belongs to a different host (or to no Devin enterprise at all) with a message pointing the user at the right host.
3. Refuses the legacy [Windsurf login](/cli/enterprise/windsurf-auth) path entirely.

The value is compared case-insensitively and ignores the scheme, so `acme.devinenterprise.com`, `ACME.DevinEnterprise.com`, and `https://acme.devinenterprise.com/` are equivalent. An explicit `http://` scheme is preserved when driving the login (useful only for testing); otherwise `https://` is assumed.

### account\_id

When set, the authenticated account must match this account identifier, even when the host already matches — use it to pin a specific tenant on a shared host. A login that resolves to another account, or to no account, is rejected after account verification.

Contact your Cognition account team if you are unsure which account identifier to use. Setting `account_id` also refuses the legacy Windsurf login path, since a Windsurf account cannot satisfy a Devin account policy.

### proxy

Configures how the CLI routes its own outbound HTTP/HTTPS traffic (API calls, updates, MCP servers). It uses the same shape as the `proxy` section of the [user config file](/cli/reference/configuration/config-file#proxy):

| Option     | Type        | Default    | Description                                                                                                                                   |
| ---------- | ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`     | string      | `"system"` | `"system"` (respect `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` and platform PAC), `"manual"` (route through `url`), or `"off"` (connect directly) |
| `url`      | string/null | `null`     | Proxy URL. Required when `mode` is `"manual"`. Supports `http://`, `https://`, and `socks5://`                                                |
| `no_proxy` | string/null | `null`     | Comma-separated bypass list, same syntax as the `NO_PROXY` environment variable. Applies in any mode                                          |

The `devin-updater` binary reads the same setting, so background updates go through the same proxy as the CLI itself.

<Warning>
  The enterprise proxy takes precedence over the user config, and it is an error for both files to configure one. If a user also has a `proxy` section in their `config.json`, the CLI exits at startup and asks them to remove it — rather than silently ignoring their setting. Tell your users to drop any local `proxy` section before you roll the policy out.
</Warning>

## Behavior and failure modes

A broken or partially understood policy file never disables the CLI — it degrades to no enforcement — while a valid policy is always enforced:

| Situation                                  | Result                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| File absent                                | No enforcement; the CLI behaves as on an unmanaged device                                |
| File unreadable or malformed JSON          | Treated as absent, with a warning in the logs                                            |
| Unknown fields present                     | Ignored; the recognized fields still apply                                               |
| Malformed `proxy` section                  | The proxy section is ignored; `enterprise_host` / `account_id` enforcement still applies |
| Malformed `enterprise_host` / `account_id` | Login enforcement is dropped; a valid `proxy` section still applies                      |
| Blank or whitespace-only value             | Treated as unset                                                                         |

Login enforcement runs during `devin auth login`. Credentials that are already stored on a device that signed in before the policy was deployed are not re-validated, so deploy `system.json` before rolling out the CLI — or have affected users run `devin auth logout` and sign in again.

The path to `system.json` cannot be redirected by an environment variable on stable, next, or enterprise builds, so users cannot point the CLI at a policy of their own.

## Verifying the policy

On a managed device:

```bash theme={null}
devin auth logout
devin auth login
```

With `enterprise_host` set, the login-method menu should not appear and the printed sign-in URL should be on your configured host. Then confirm the resulting session:

```bash theme={null}
devin auth status
```

A login with an account outside the policy fails with an explicit message naming the host or account your organization requires.

## Related settings

`system.json` covers device-level policy that must be in place before or during login. Most other organization-wide controls — models, MCP servers and registries, terminal permissions, sandbox enforcement, web search — are managed server-side in [Team Settings](/cli/enterprise/team-settings) and apply automatically once a user signs in.

## Further reading

* [Devin Auth](/cli/enterprise/devin-auth)
* [Team Settings](/cli/enterprise/team-settings)
* [Configuration File](/cli/reference/configuration/config-file)
* [Controls](/cli/enterprise/controls)
* [Devin Desktop Enterprise Policies](/desktop/enterprise-policies) — the equivalent MDM-distributed policy surface for the editor
