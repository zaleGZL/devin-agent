> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Terminal Compatibility

> Supported terminals and recommendations for the best Devin CLI experience

Devin CLI works across a wide range of terminal emulators, but some terminals offer a better experience than others. This page covers compatibility levels, recommendations, and configuration tips.

***

## Compatibility Overview

Terminals are grouped into three tiers based on their feature support:

### Fully Supported (all features work)

These terminals support the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/), which enables reliable detection of key combinations like `Shift+Enter` for multi-line input.

| Terminal                                    | Platform               | Notes                                                                 |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| [Kitty](https://sw.kovidgoyal.net/kitty/)   | macOS†, Linux          | Recommended for power users. Used by the developers of Devin CLI.     |
| [Ghostty](https://ghostty.org/)             | macOS†, Linux          | Recommended for power users. Used by the developers of Devin CLI.     |
| [WezTerm](https://wezfurlong.org/wezterm/)  | macOS†, Linux, Windows | Recommended for power users.                                          |
| [iTerm2](https://iterm2.com/)               | macOS†                 | Recommended for most users. Version 3.5+ required for best support.   |
| [Windows Terminal](https://aka.ms/terminal) | Windows                | Recommended for most users. 1.25 or higher required for best support. |

### Supported (some features limited)

These terminals work with Devin CLI but are not ideal because they do not support the Kitty keyboard protocol. For example, `Shift+Enter` will not insert a newline — use `Alt+Enter` or `Ctrl+J` instead.

| Terminal                                                             | Platform               | Notes                                                                                                                       |
| -------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Terminal.app](https://support.apple.com/guide/terminal/welcome/mac) | macOS†                 | Built-in macOS terminal. Requires [Option-as-Meta configuration](#configuring-option-as-meta-on-macos) for `Alt` shortcuts. |
| Git Bash                                                             | Windows                | Included with [Git for Windows](https://git-scm.com/download/win).                                                          |
| DEC VT100                                                            | Various                | Set terminal mode to `legacy` in `/config`.                                                                                 |
| Generic ANSI terminals                                               | Various                | Any terminal with basic ANSI escape code support.                                                                           |
| [Alacritty](https://alacritty.org/)                                  | macOS†, Linux, Windows | Strongly discouraged / not recommended for best performance.                                                                |

† On macOS, we recommend [configuring Option as Meta](#configuring-option-as-meta-on-macos) for the best experience with `Alt`-based shortcuts.

<Note>
  On macOS terminals that have not been configured for Option-as-Meta, `Alt` (Option) shortcuts like `Alt+Enter` for multi-line input won't work. See [Configuring Option-as-Meta on macOS](#configuring-option-as-meta-on-macos) below.
</Note>

### Unsupported

These terminals are not supported and may exhibit significant issues. We highly recommend switching to a supported terminal.

| Terminal          | Platform | Notes                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------- |
| cmd.exe (conhost) | Windows  | Legacy Windows command prompt. Use [Windows Terminal](https://aka.ms/terminal) instead. |

***

## Recommendations

| Platform                        | Recommendation                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Windows**                     | [Windows Terminal](https://aka.ms/terminal) 1.25 or higher                                                                |
| **macOS** (general)             | [iTerm2](https://iterm2.com/)                                                                                             |
| **macOS / Linux** (power users) | [Kitty](https://sw.kovidgoyal.net/kitty/), [Ghostty](https://ghostty.org/), or [WezTerm](https://wezfurlong.org/wezterm/) |

***

## Configuring Option-as-Meta on macOS

On macOS, the Option key is used as a compose key by default in most terminals, which means `Alt`-based shortcuts (like `Alt+Enter` for multi-line input or `Alt+T` for cycling thinking level) won't work until you configure the terminal to treat Option as Meta/Alt.

<AccordionGroup>
  <Accordion title="iTerm2">
    1. Open **iTerm2 > Settings** (or press `Cmd+,`)
    2. Go to **Profiles > Keys > General**
    3. Set **Left Option Key** to **Esc+**
    4. Optionally set **Right Option Key** to **Esc+** as well

    [iTerm2 documentation](https://iterm2.com/documentation-preferences-profiles-keys.html)
  </Accordion>

  <Accordion title="Terminal.app">
    1. Open **Terminal > Settings** (or press `Cmd+,`)
    2. Go to **Profiles** and select your active profile
    3. Click the **Keyboard** tab
    4. Check **Use Option as Meta Key**

    [Apple documentation](https://support.apple.com/guide/terminal/change-profiles-keyboard-settings-trmlkbrd/mac)
  </Accordion>

  <Accordion title="Alacritty">
    Add the following to your `alacritty.toml` configuration file:

    ```toml theme={null}
    [keyboard]
    option_as_alt = "Both"
    ```

    [Alacritty configuration reference](https://alacritty.org/config-alacritty.html)
  </Accordion>

  <Accordion title="Kitty">
    Add the following to your `kitty.conf` configuration file:

    ```text theme={null}
    macos_option_as_alt yes
    ```

    Restart Kitty after making this change.

    [Kitty documentation](https://sw.kovidgoyal.net/kitty/conf/#opt-kitty.macos_option_as_alt)
  </Accordion>

  <Accordion title="Ghostty">
    Add the following to your Ghostty configuration file:

    ```text theme={null}
    macos-option-as-alt = true
    ```

    Restart Ghostty after making this change.

    [Ghostty documentation](https://ghostty.org/docs/config/reference#macos-option-as-alt)
  </Accordion>

  <Accordion title="WezTerm">
    Add the following to your `~/.wezterm.lua` configuration file:

    ```lua theme={null}
    config.send_composed_key_when_left_alt_is_pressed = false
    config.send_composed_key_when_right_alt_is_pressed = false
    ```

    [WezTerm documentation](https://wezfurlong.org/wezterm/config/lua/config/send_composed_key_when_left_alt_is_pressed.html)
  </Accordion>
</AccordionGroup>
