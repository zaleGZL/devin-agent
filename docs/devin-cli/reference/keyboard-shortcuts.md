> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Keyboard Shortcuts

> Common keyboard shortcuts in Devin CLI

Every shortcut on this page is a **default** — shortcuts are rebindable. Run `/shortcuts` to browse and rebind them interactively, or edit the [`keymap`](/cli/reference/configuration/config-file#keymap) section of your config file directly.

## Input Shortcuts

These shortcuts work while typing at the prompt.

| Shortcut                       | Description                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Enter`                        | Submit your message                                                                                                                   |
| `Shift+Enter`\* or `Alt+Enter` | Insert a newline (for multi-line input)                                                                                               |
| `Shift+Tab`                    | Cycle between modes (Normal, Accept Edits, Smart, Bypass, Autonomous)                                                                 |
| `Ctrl+C`                       | Cancel current input (clears text), or cancel running agent                                                                           |
| `Ctrl+D`                       | Exit (when input is empty)                                                                                                            |
| `Esc`                          | Cancel running agent                                                                                                                  |
| `Ctrl+G`                       | Open external editor for composing your message                                                                                       |
| `Ctrl+R`                       | Open fuzzy search over previous prompts and insert the selected prompt                                                                |
| `Ctrl+O`                       | Open full-screen viewer for the thinking trace                                                                                        |
| `Ctrl+L`                       | Redraw / refresh the screen                                                                                                           |
| `Ctrl+V` or `Shift+Insert`     | Paste from clipboard (images appear in input area; use Left/Right to navigate, Backspace to remove)                                   |
| `!`                            | Enter bash mode to run a shell command directly (when input is empty). Press `Backspace` or `Esc` on an empty input to exit bash mode |
| `@`                            | Open file/directory autocomplete to add context                                                                                       |

<Note>
  On macOS, `Alt` is the `Option` key. Some shortcuts below use `Alt` (Option) as a modifier. We recommend [configuring Option as Meta](/cli/reference/terminal-compatibility#configuring-option-as-meta-on-macos) for the best experience.
</Note>

\* Requires a [compatible terminal](/cli/reference/terminal-compatibility). Terminals that do not support the Kitty keyboard protocol cannot distinguish `Shift+Enter` from `Enter`. Use `Alt+Enter` or `Ctrl+J` instead.

***

## Mode & Model Shortcuts

| Shortcut                 | Description                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `Shift+Tab`              | Cycle to the next mode (Normal → Accept Edits → Smart → Bypass → Autonomous → Normal) |
| `Alt+T` (macOS: `Opt+T`) | Cycle thinking level for the current model                                            |

<Note>
  [Smart mode](/cli/reference/permissions#smart-mode) is rolling out gradually; the cycle skips it when it is not enabled for your account. Autonomous only appears in [sandbox sessions](/cli/sandbox), where it is the only available permission mode.
</Note>

You can also switch modes with slash commands: `/normal`, `/accept-edits`, `/smart`, `/plan`, `/bypass`, or `/mode <name>`. Use `/ask <question>` as a oneshot command to ask questions without switching modes.

***

## Rebinding Shortcuts

Run `/shortcuts` to open an interactive list of every shortcut, grouped by category. Type to search across all categories, press `Enter` on an action to rebind it, then press the key combination you want. Each row shows the action's `context.action` identifier (for example `editor.accept_line`) — that is the key to use when editing the config file by hand. Rebinding from `/shortcuts` saves the new binding to your user config.

To set bindings directly, add a [`keymap`](/cli/reference/configuration/config-file#keymap) section to your config file:

```json theme={null}
// ~/.config/devin/config.json
{
  "keymap": {
    "global": {
      "clear_screen": "ctrl-shift-k"
    }
  }
}
```

<Note>
  `Ctrl+C` cannot be unbound — it always cancels the running agent.
</Note>

***

## Text Editing

The input uses readline-style or Emacs-style keybindings for text editing.

***

## Customizing Keybindings

Every keybinding can be viewed — and most can be changed — from inside the CLI or via the config file.

### Browsing shortcuts with `/shortcuts`

Run `/shortcuts` to open an interactive picker listing every keybinding, grouped by category (Input, Mode & model, Text editing, Lists & pickers, Completion, Prompts & panels, Config editor, and more). Each row shows the active keys, a description, and the shortcut's `context.action` identifier (e.g. `editor.insert_newline`) — the identifier you use for config-file overrides. Type to search across all categories.

### Rebinding interactively

In `/shortcuts`, press `Enter` on a shortcut row, then press the new key combination:

```
Press the new key for Open external editor (readbox_input.open_external_editor)
Currently: ctrl+g
any key rebind · esc cancel
```

The change takes effect immediately and is saved to the `keymap` section of your user config file, so it persists across sessions. Press `Esc` to cancel without changing anything.

A few global "chrome" keys (clear screen, the thinking-trace viewer, force full redraw) can't be rebound interactively — the picker shows `can't be rebound` — because the rebind prompt must capture every key. You can still override them via the [config file](#rebinding-via-the-config-file).

### Rebinding via the config file

Add a `keymap` section to your user config (`~/.config/devin/config.json`; `%APPDATA%\devin\config.json` on Windows). Overrides are keyed by context, then action:

```json theme={null}
{
  "keymap": {
    "global": {
      "clear_screen": "ctrl-shift-k",
      "history_search": ["ctrl-r", "f5"],
      "feedback_up": []
    },
    "editor": {
      "insert_newline": ["shift-enter", "alt-enter", "ctrl-j"]
    }
  }
}
```

* A value may be a single key spec, a list of specs (all of them trigger the action), or an empty list `[]` to unbind the action.
* Overrides fully replace the built-in defaults for that action; actions you don't list keep their defaults.
* Find the `context.action` names in `/shortcuts` — each row displays its identifier.

See the [config file reference](/cli/reference/configuration/config-file#keymap) for the full key spec syntax.

### Key spec syntax

A key spec is zero or more `-`-separated modifiers followed by one key name, e.g. `ctrl-shift-p`, `alt-enter`, `f5`, `K`:

| Element    | Values                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modifiers  | `ctrl`/`control`/`c`, `alt`/`meta`/`option`/`opt`/`m`, `shift`/`s` — case-insensitive, any order, no duplicates                                                                                                                      |
| Named keys | `enter`/`return`, `esc`/`escape`, `tab`, `backspace`, `delete`/`del`, `insert`/`ins`, `up`, `down`, `left`, `right`, `home`, `end`, `page-up`/`pageup`/`pgup`, `page-down`/`pagedown`/`pgdn`, `space`, `f1`–`f24` — case-insensitive |
| Characters | Any other single character binds that character key, keeping its case: `K` (equivalently `shift-k`) binds the shifted letter. Use `-` for the minus key (`ctrl--` is Ctrl+minus)                                                     |

### Validation and conflicts

Invalid entries are reported as warnings at startup and skipped — the rest of your overrides and config still apply:

```
Warning: keymap: unknown context `bogus_context`
Warning: keymap.editor: unknown action `bogus_action`
Warning: keymap: override creates a conflict (editor: `ctrl+a` bound to both
`beginning_of_line` and `kill_line`); restoring built-in default for `editor.kill_line`
```

This covers unknown context/action names, malformed key specs, wrong-typed values, and overrides that collide with another binding in the same context (the conflicting override reverts to its default). `Ctrl+C` (cancel) cannot be unbound.
