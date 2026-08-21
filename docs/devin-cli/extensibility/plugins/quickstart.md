> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart: team marketplace

> Set up a shared Devin plugin marketplace for your team with reusable skills, rules, hooks, MCP servers, and governance.

<Note>
  Plugins are in **closed beta**. To request access, contact [support@cognition.ai](mailto:support@cognition.ai). Behavior and configuration may change in future releases.
</Note>

This quickstart takes you from zero to a **team plugin marketplace**: one repo your org owns that bundles your skills, rules, hooks, and MCP servers, installed automatically for every Devin session and CLI user. For the full background, see [Set up your plugin ecosystem](/product-guides/plugin-ecosystem).

## 1. Fork the template

Fork [CognitionAI/team-marketplace-template](https://github.com/CognitionAI/team-marketplace-template). Its layout:

```
your-marketplace/
├── .devin-plugin/
│   └── plugin.json      # the meta-plugin: your baseline + policy
├── AGENTS.md            # always-on rule shipped with the baseline
├── plugins/
│   ├── engineering-baseline/   # each subfolder is its own plugin
│   ├── security-guardrails/
│   ├── frontend-standards/
│   └── docs-and-release/
└── scripts/validate-template.mjs   # CI validation
```

The repo root is itself a plugin — the **meta-plugin**. Installing the repo installs your whole baseline: its manifest's `requiredPlugins` pulls in the plugins every teammate should have, `optionalPlugins` endorses extras, and `forbiddenPlugins` blocks what you don't want.

## 2. Make it yours

* In the root `.devin-plugin/plugin.json`, change every `git-subdir` URL to point at **your fork**, and edit the required/optional/forbidden lists.
* Add a plugin per team or concern under `plugins/<name>/` — each needs its own `.devin-plugin/plugin.json` and typically a `skills/<name>/SKILL.md`. Starting a plugin from scratch? Use [CognitionAI/plugin-template](https://github.com/CognitionAI/plugin-template).
* Have an existing repo of skills? Drop each skill folder into a plugin's `skills/` directory — skills inside plugins are ordinary [skills](/cli/extensibility/skills/creating-skills), no format change.

## 3. Test locally with the CLI

```bash theme={null}
node scripts/validate-template.mjs      # structural validation (also runs in CI)

devin plugins install .                 # install the meta-plugin from your checkout
devin plugins list                      # see everything it pulled in
```

Local installs are linked, so edits apply on your next session — iterate on a skill, then start a session and invoke it as `/<plugin>:<skill>`.

## 4. Distribute it to everyone

An org or enterprise admin adds one required plugin to the managed manifest at [Settings → Resources → Plugins](https://app.devin.ai/settings/marketplace):

```json theme={null}
{
  "requiredPlugins": ["your-org/your-marketplace"]
}
```

Everyone in scope gets the baseline automatically — cloud sessions and, for the enterprise/account manifest, CLI and Devin Desktop users logged into the account too (org-level manifests reach cloud sessions only). A private repo works as-is: cloud fetches through your Git integration; CLI users fetch with their own git credentials.

## 5. Evolve and govern

* Merging to your marketplace repo's default branch **is** the release — new sessions pick it up automatically. See [how updates roll out](/product-guides/plugins#how-updates-roll-out).
* Teams add plugins by PR to the marketplace repo; CI validates the layout.
* To lock the account down to your approved set only, add `"forbiddenPlugins": ["*"]` to the managed manifest and list every approved plugin (including the meta-plugin's dependencies — transitive deps aren't exempt) in `requiredPlugins`/`optionalPlugins`. Full semantics: [dependencies and governance](/cli/extensibility/plugins/overview#dependencies).

## Next steps

* [Set up your plugin ecosystem](/product-guides/plugin-ecosystem) — the full org playbook
* [Plugins reference](/cli/extensibility/plugins/overview) — manifest format, install flows, governance levels
* [Plugin marketplace](/product-guides/plugins) — the web app side: manifests, scopes, uploads
