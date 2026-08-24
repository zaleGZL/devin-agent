# Repository knowledge base

The repository is the system of record for product and engineering knowledge. `AGENTS.md` is the
stable entry point; this directory holds the deeper, task-specific context. The structure follows
progressive disclosure: start from the map, open the relevant document, then inspect code and tests.

## Routing index

| Document | Authority | Use it for |
| --- | --- | --- |
| [product.md](product.md) | Normative | Product purpose, scope, ownership boundaries, and non-goals |
| [architecture.md](architecture.md) | Normative | Process topology, dependency direction, state ownership, and change routes |
| [development.md](development.md) | Normative | Branching, planning, implementation, validation, packaging, and release |
| [security.md](security.md) | Normative | Trust boundaries, credential handling, IPC/filesystem/URL rules, and sandboxing |
| [quality.md](quality.md) | Normative | Definition of done, required evidence, enforced invariants, and known gaps |
| [devin-cli.md](devin-cli.md) | Generated reference | Index to the local mirror of official Devin CLI documentation |
| [research/](research/) | Evidence snapshots | Primary-source findings that explain decisions but do not define current behavior |
| [`openspec/changes/`](../openspec/changes/) | Change-local authority | Active proposals, designs, delta specifications, and implementation tasks |

`README.md` remains the public user and contributor entry point. Source code, tests, package scripts,
and CI configuration are the executable truth for current behavior; normative docs explain the intent
and constraints those artifacts must preserve.

## Authority and conflict resolution

1. For observable runtime behavior, verify the code and tests.
2. For intended product, architecture, security, and quality constraints, use the normative document.
3. For an in-flight change, apply its OpenSpec delta only within that change's scope.
4. Research reports record evidence at a point in time. They cannot override normative docs or code.
5. `docs/devin-cli.md` and `docs/devin-cli/` are generated from official documentation; never edit
   them manually.

If artifacts disagree, do not silently choose one. Establish the intended behavior from the owning
constraint, then update code, tests, and canonical documentation together.

## Documentation maintenance contract

Update documentation in the same change when any of these triggers applies:

| Change | Required update |
| --- | --- |
| User-visible scope, supported platform, or feature contract | `README.md` and `product.md` |
| Process boundary, dependency direction, state owner, or major module entry point | `architecture.md` |
| Branch, command, test requirement, build, package, or release flow | `development.md` |
| Trust boundary, credentials, external navigation, filesystem access, IPC, update, or sandbox behavior | `security.md` |
| Acceptance evidence, invariant enforcement, or known engineering gap | `quality.md` |
| ACP/Devin CLI upstream behavior | Run `pnpm docs:sync:devin-cli`; do not hand-edit the mirror |
| Non-trivial feature or architecture decision | Active OpenSpec artifacts in Simplified Chinese |

Keep documents compact and verifiable:

- Record stable principles, boundaries, ownership, and decision criteria instead of file-by-file tours.
- Link to the executable check or source entry point rather than copying implementation details.
- Describe current reality. Put proposals in OpenSpec and historical evidence in `docs/research/`.
- Remove or repair stale guidance as part of the change that invalidates it.
- Convert recurring, objectively testable rules into tests or checks; documentation alone is not enforcement.
