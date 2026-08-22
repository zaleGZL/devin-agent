> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Hand off to cloud Devins

> Hand off a task from the Devin CLI to a cloud Devin session with /handoff.

When a task outgrows your local machine — or you want Devin to keep working while you step away — use the built-in `/handoff` command to transfer the current session to a cloud [Devin session](/get-started/first-run). The cloud session gets its own VM with a shell, browser, and full repo access, so it can keep going after you close your laptop.

```
/handoff fix the flaky integration tests in CI
```

The Devin CLI packages up the conversation context and your current git branch, then creates a cloud session that picks up where you left off. Track its progress from your terminal or in the [Devin web app](https://app.devin.ai).

<Tip>
  Run `/handoff` without a task description and the cloud session continues from where you left off automatically.
</Tip>

## When to hand off

Hand a task off when it needs more than your local terminal, or when you want it to run in the background:

* **VM or server** — running a dev server, hitting endpoints, Docker builds
* **Browser** — screenshots, OAuth flows, end-to-end tests, scraping
* **CI/CD** — pipeline debugging, deployments, infrastructure changes
* **Long-running work** — migrations, batch jobs, large refactors
* **Parallel execution** — offload work to the cloud while you keep coding locally

## What carries over

The cloud session starts in a fresh VM, so the CLI includes everything it needs to pick up the thread:

* **Repo and branch** — so the cloud session clones the right repo and checks out the branch you're on.
* **Conversation context** — what you and Devin have been working on in the current session.
* **Uncommitted changes** — your work-in-progress diff carries over. Commit or stash anything you don't want sent.

<Note>
  Not using the Devin CLI? You can hand off from Claude Code, Codex, Cursor, or any coding agent — and from plain shell scripts — with the open-source [Devin Handoff](https://github.com/club-cog/devin-handoff) plugin. See [Hand off to Devin](/work-with-devin/devin-handoff) for setup and usage across every agent.
</Note>

## Related resources

<CardGroup cols={2}>
  <Card title="Hand off to Devin" icon="share-from-square" href="/work-with-devin/devin-handoff">
    Hand off from any coding agent, not just the Devin CLI
  </Card>

  <Card title="Devin Handoff on GitHub" icon="github" href="https://github.com/club-cog/devin-handoff">
    Source, install guides, and the full script reference
  </Card>
</CardGroup>
