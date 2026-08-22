> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Models

> Available models and how to configure them

Devin CLI supports multiple AI models. You can choose the best model for your task to optimize for maximum capability, speed, or cost efficiency.

<Card title="Adaptive" icon="shuffle" href="/cli/adaptive" horizontal={true}>
  For most users, we recommend **Adaptive** — our intelligent model router that automatically selects the best model for each task, delivering the right level of intelligence for every prompt.
</Card>

***

## Available Models

Models release frequently. We typically support the latest and greatest models from **Anthropic**, **OpenAI**, **Google**, and **Cognition** within minutes of their launch. We also support a number of **leading open source models** like **DeepSeek**, **Kimi**, and **GLM**.

To stay up-to-date on model releases, consider following the [**Cognition** X account](http://x.com/cognition).

<Note>
  Short names like `opus`, `sonnet`, `swe`, `codex`, and `gemini` always resolve to the latest version in that model family.
</Note>

### Reasoning / Thinking Levels

Some models support configurable reasoning levels, which control how much compute the model spends "thinking" before responding. You can cycle the thinking level with `Alt+T` (macOS: `Opt+T`) during a session.

***

## Setting the Model

<Tabs>
  <Tab title="Command flag">
    ```bash theme={null}
    devin --model opus -- refactor this module
    devin --model sonnet -- explain this code
    ```
  </Tab>

  <Tab title="Slash command">
    Switch models during a session:

    ```text theme={null}
    /model opus
    /model sonnet
    /model codex
    ```

    Run `/model` with no argument to open the model selector.
  </Tab>

  <Tab title="Config file">
    Set a default in `~/.config/devin/config.json` (on Windows, `%APPDATA%\devin\config.json`):

    ```json theme={null}
    {
      "agent": {
        "model": "swe-1-6-fast"
      }
    }
    ```
  </Tab>
</Tabs>

***

## Model Selection Tips

The correct choice of language model varies wildly from person-to-person and task-to-task. Many engineers working on the same project are convinced that their model is the best for the task, despite using different models. The fact of the matter is, AI can perform differently depending on your personal usage and writing style!

**As such, we strongly recommend trying multiple models to see which one you prefer.** At minimum we recommend trying `swe`, `gpt`, and `opus`. We find that the vast majority of use-cases can be covered by these three.

<CardGroup cols={2}>
  <Card title="Complex refactoring" icon="code-branch">
    Use `opus` or `gpt` for multi-file refactors, architecture changes, and tasks requiring deep reasoning.
  </Card>

  <Card title="Quick edits / cost-sensitive" icon="bolt">
    Use `swe` (fast) for straightforward edits, bug fixes, and questions. It's both fast and cheap at a reasonable level of intelligence.
  </Card>
</CardGroup>

<Tip>
  Enterprise teams can restrict which models are available through [Team Settings](/cli/enterprise/team-settings).
</Tip>
