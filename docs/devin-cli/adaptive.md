> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Adaptive

> Adaptive is Cognition's intelligent model router that automatically selects the best AI model for each task.

## Selecting Adaptive

To select Adaptive, run `/model adaptive` during a session, pass `--model adaptive` when launching, or set it as your default in `~/.config/devin/config.json` (on Windows, `%APPDATA%\devin\config.json`):

```json theme={null}
{
  "agent": {
    "model": "adaptive"
  }
}
```

You can switch away from Adaptive to a specific model at any time with `/model`.

Adaptive is an intelligent model router that automatically selects the best AI model for each task. Instead of manually choosing between dozens of models, Adaptive analyzes your prompt and routes it to the model that will deliver the best result.

## How it works

When you select **Adaptive**, Devin evaluates each request and dynamically chooses the right underlying model. Simple tasks get routed to fast, efficient models. Complex tasks get routed to more capable ones.

This means you get the right level of intelligence for every prompt without overspending on premium models for routine work. Adaptive helps your usage allowance last longer by avoiding unnecessary use of expensive models.

<Tip>Adaptive is the best default for most users.</Tip>

## Enterprise availability

For enterprise organizations, Adaptive is disabled by default. An admin must enable the **Adaptive model router** setting from the enterprise settings page before team members can select Adaptive in the model picker.

* **Devin Desktop**: Go to **Settings > Devin Desktop > Models** and toggle **Adaptive model router** on.
* **Windsurf**: Go to **Team Settings > Models** and toggle **Adaptive model router** on.

## Pricing

Adaptive pricing depends on your billing plan.

<Tabs>
  <Tab title="Self-serve">
    Adaptive draws down your quota at a **fixed per-token rate**, regardless of which underlying model is selected for a given request.

    Currently, the Adaptive model consumes quota and overage at an introductory promotional rate (through July 7, 2026).

    | Token type        | Cost per 1M tokens |
    | :---------------- | :----------------- |
    | Input tokens      | \$0.50             |
    | Output tokens     | \$2.00             |
    | Cache read tokens | \$0.10             |

    These rates also apply to extra usage beyond your included quota.

    Because Adaptive routes simpler tasks to lighter models, it typically consumes fewer tokens overall than manually selecting a frontier model for every request. This makes it the most cost-effective option for most users.
  </Tab>

  <Tab title="Enterprise (Cognition Platform - ACUs)">
    For customers on the Cognition platform, Adaptive usage is metered in **ACUs** (Agent Compute Units). ACU consumption scales with the tokens used and the model selected by the router for each request.
  </Tab>

  <Tab title="Enterprise (Legacy Credits)">
    For enterprise customers on credit-based billing, Adaptive uses **variable-token credit pricing**. Each request consumes credits based on the actual tokens used and the model that Adaptive selects for that request according to your credit rate.

    This means cheaper models cost fewer credits per request, and Adaptive's routing naturally favors cost-efficient choices — so your credit pool lasts longer compared to always selecting a premium model.
  </Tab>
</Tabs>

## Tips for getting the most out of Adaptive

* **Be specific with your prompts.** Clear, focused instructions help Adaptive route to the right model and reduce unnecessary token usage.
* **Leverage prompt caching.** Staying on the same model across turns in a conversation enables caching, which significantly reduces input token costs. Adaptive takes this into account when routing.
* **Use Adaptive as your default.** For most workflows, Adaptive is the best starting point. Switch to a specific model only when you have a particular reason to — for example, if you need a specific model's reasoning capabilities for a complex task.
