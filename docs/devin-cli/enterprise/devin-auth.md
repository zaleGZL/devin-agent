> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Devin Auth

> Authenticate to Devin CLI using your existing Devin account

## Overview

You can authenticate to Devin CLI using your existing Devin account. This provides a seamless experience for organizations already using Devin, with billing handled through the standard **Devin billing model**.

User management, team organization, SSO, RBAC, billing, and consumption are all inherited natively through the Devin dashboard. For most of your organizational needs, you should rely on the [Devin dashboard](https://app.devin.ai).

<Note>
  Devin authentication for Devin CLI is available to **Devin Enterprise** customers. Contact your account executive if you have questions about authentication, billing, or access.
</Note>

## Getting Started

### Prerequisites

Before using Devin authentication, ensure that:

1. Your organization has a Devin enterprise account
2. Your administrator has configured Devin CLI access permissions (see [Configuring Access](#configuring-access) below)
3. You have been assigned a role with the **Use Devin CLI** permission

### Authenticating

To authenticate with your Devin enterprise account:

```bash theme={null}
devin auth login
```

Follow the prompts and be sure to select the **Log in with Devin for Enterprise** button to authenticate through your organization's identity provider.

### Credentials file location

After `devin auth login`, Devin CLI stores your API token in `credentials.toml`. By default, this token is persistent and does not expire. You can copy the credentials file between your own machines to reuse the same authentication, but treat it as sensitive: anyone with this file can authenticate as you. Do not share it or commit it to source control.

| Platform      | Location                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| macOS / Linux | `$XDG_DATA_HOME/devin/credentials.toml` when `XDG_DATA_HOME` is set; otherwise `~/.local/share/devin/credentials.toml` |
| Windows       | `%APPDATA%\devin\credentials.toml` (typically `C:\Users\<you>\AppData\Roaming\devin\credentials.toml`)                 |

Run `devin auth logout` to remove stored credentials.

<Tip>
  On MDM-managed devices, administrators can pin login to a specific enterprise host or account — skipping the login prompts entirely and rejecting out-of-policy accounts — with the [system configuration file](/cli/enterprise/system-config).
</Tip>

## Configuring Access

Devin CLI access is controlled through Devin's [custom roles and RBAC system](/enterprise/security-access/custom-roles). Administrators must create a custom role with the **Use Devin CLI** role permission and assign it to users who need access.

### Creating an Access Role

1. Navigate to **Enterprise Settings > Roles**
2. Click **Create a custom role**
3. Provide a descriptive name (e.g., "Devin CLI User")
4. Select the **Use Devin CLI** permission
5. Save the role

### Assigning the Role

* **Enterprise admins** or users with the **Manage Account Membership** permission can assign account-level roles via the "Enterprise members" page
* **Organization admins** or users with the **Manage Organization Membership** permission can assign organization-level roles via the "Organization members" page

<Tip>
  You can automatically assign roles based on SSO IdP groups. See the [custom roles documentation](/enterprise/security-access/custom-roles) for details.
</Tip>

## Billing

Usage through Devin CLI is billed using the standard **Devin ACU (Agent Compute Unit) model**. All Devin CLI usage counts toward your organization's existing Devin enterprise allocation.

Enterprise admins can view their users' Devin CLI usage by accessing the **Cost** dashboard under the **Enterprise Analytics** tab in the Devin web app. This dashboard contains helpful visualizations of ACU consumption across all of the Cognition products, including Devin CLI.

For details about ACU billing and usage tracking, refer to your enterprise agreement or contact your account executive.

## Further Reading

For more information about Devin enterprise features, see the [Devin Enterprise documentation](/enterprise/getting-started/get-started):

* [Enterprise Setup](/enterprise/getting-started/get-started) — Initial configuration and onboarding
* [SSO Configuration](/enterprise/security-access/sso/guide) — Single sign-on setup
* [Custom Roles & RBAC](/enterprise/security-access/custom-roles) — Fine-grained access control
* [Enterprise Security](/enterprise/security-access/security/enterprise-security) — Security policies and controls
