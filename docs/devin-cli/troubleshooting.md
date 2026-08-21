> ## Documentation Index
> Fetch the complete documentation index at: https://docs.devin.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Troubleshooting

> Common issues and how to fix them

## Installation Issues

<AccordionGroup>
  <Accordion title="Install command fails (macOS / Linux / WSL)">
    If the install script fails to download:

    1. Check your internet connection
    2. Verify curl is installed: `which curl`
    3. Try with verbose output: `curl -fsSL -v https://cli.devin.ai/install.sh | bash`

    If you're behind a corporate proxy, you may need to configure proxy settings:

    ```bash theme={null}
    export https_proxy=http://your-proxy:port
    curl -fsSL https://cli.devin.ai/install.sh | bash
    ```
  </Accordion>

  <Accordion title="Install command fails (Windows)">
    If the PowerShell install script fails:

    1. Check your internet connection
    2. Ensure you are running PowerShell as a regular user (not as Administrator unless necessary)
    3. If you see an execution policy error, try:
       ```powershell theme={null}
       Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
       irm https://static.devin.ai/cli/setup.ps1 | iex
       ```
    4. If you're behind a corporate proxy, configure proxy settings in PowerShell before running the install command

    As an alternative to the PowerShell script, you can download and run the standalone installer directly:

    * [x86\_64](https://static.devin.ai/cli/devin-updater-x86_64-pc-windows.exe)
    * [ARM64](https://static.devin.ai/cli/devin-updater-aarch64-pc-windows.exe)
  </Accordion>

  <Accordion title="Permission denied during install">
    The installer needs write access to install the binary. If you see permission errors:

    1. Check the install location has write permissions
    2. Do not run the installer with `sudo` — this can cause ownership issues
    3. If installing to a system directory, ensure your user has appropriate permissions
  </Accordion>

  <Accordion title="Binary not found after install">
    If the install completes but `devin` isn't found:

    **macOS / Linux / WSL:**

    1. Restart your terminal or run `source ~/.bashrc` (or `~/.zshrc`)
    2. Check if the binary location is in your PATH: `echo $PATH`
    3. Verify the binary exists: `ls -la ~/.local/bin/devin` (or the install location shown during setup)

    **Windows:**

    1. Restart your PowerShell session
    2. Check if the binary location is in your PATH: `$env:PATH -split ';'`
    3. Verify the binary exists in the install location shown during setup
  </Accordion>

  <Accordion title="'irm' or 'iex' command not found (Windows)">
    `irm` and `iex` are PowerShell aliases. If you see this error, you're running the install command in Git Bash or CMD instead of PowerShell.

    **Fix:** Open **PowerShell** and run the install command there:

    ```powershell theme={null}
    irm https://static.devin.ai/cli/setup.ps1 | iex
    ```

    Alternatively, from Git Bash or CMD you can invoke PowerShell explicitly:

    ```bash theme={null}
    powershell -Command "irm https://cli.devin.ai/install.ps1 | iex"
    ```

    After installation, you can use Devin CLI from **PowerShell**, **Windows Terminal**, or **Git Bash**.
  </Accordion>
</AccordionGroup>

***

## Authentication Issues

<AccordionGroup>
  <Accordion title="Login fails or times out">
    If browser-based login doesn't work:

    1. Try the manual token flow for remote/SSH sessions:
       ```bash theme={null}
       devin auth login --force-manual-token-flow
       ```
    2. Check that your browser can reach the authentication URL
    3. Verify your enterprise account has Devin CLI access enabled
  </Accordion>

  <Accordion title="'Not authorized' or permission errors">
    If you see authorization errors after logging in:

    1. Verify your account has the correct permission needed to access Devin CLI. You may need to ask your admin. For enterprises, see [Devin Auth](/cli/enterprise/devin-auth#configuring-access) or [Legacy Windsurf Auth](/cli/enterprise/windsurf-auth#prerequisites) on how to configure access.
    2. Try logging out and back in: `devin auth logout && devin auth login`
    3. Check your authentication status: `devin auth status`
  </Accordion>

  <Accordion title="Token rejected or revoked">
    Devin CLI API tokens do not expire by default. If a stored token has been revoked or is no longer accepted, remove it before logging in again:

    ```bash theme={null}
    devin auth logout && devin auth login
    ```

    to replace your stored credentials.
  </Accordion>
</AccordionGroup>

***

## Network & Proxy Issues

<AccordionGroup>
  <Accordion title="Connections fail behind a corporate proxy">
    The CLI routes its own outbound HTTPS traffic (authentication, updates, model API calls, MCP servers) through a proxy when one is configured. There are two ways to set it:

    **Environment variables** — the default `system` proxy mode respects these:

    ```bash theme={null}
    export HTTPS_PROXY=http://proxy.corp.example.com:8080
    export HTTP_PROXY=http://proxy.corp.example.com:8080
    export ALL_PROXY=socks5://proxy.corp.example.com:1080   # optional, SOCKS5
    export NO_PROXY=localhost,127.0.0.1,.internal.corp      # hosts to bypass
    ```

    **`config.json`** — applies regardless of environment:

    ```json theme={null}
    {
      "proxy": {
        "mode": "manual",
        "url": "http://proxy.corp.example.com:8080",
        "no_proxy": "localhost,127.0.0.1,.internal.corp"
      }
    }
    ```

    See the [`proxy` configuration reference](/cli/reference/configuration/config-file#proxy) for all options. On macOS and Windows, `system` mode also honors platform-native PAC (Proxy Auto-Configuration) settings.

    If your proxy performs TLS inspection, the CLI uses your operating system's certificate store, so install the proxy's root CA at the OS level (Keychain on macOS, the Windows certificate store, or your distribution's CA bundle on Linux).
  </Accordion>

  <Accordion title="Capture full HTTP request logs for debugging">
    To get full visibility into the request lifecycle (DNS, connection pooling, TLS handshake, headers, redirects, and retries), raise the log level with `RUST_LOG` and mirror logs to your terminal with `CHISEL_LOG_STDOUT`:

    ```bash theme={null}
    RUST_LOG="chisel=trace,windsurf_api_client=trace,connect_rpc=trace,reqwest=trace,hyper=trace,hyper_util=trace,rustls=trace" \
      CHISEL_LOG_STDOUT=1 \
      devin auth login
    ```

    What each target adds:

    * `chisel`, `windsurf_api_client`, `connect_rpc` — the CLI's own request and authentication logging
    * `reqwest=trace` — high-level request/response and redirect handling
    * `hyper=trace` / `hyper_util=trace` — connection establishment, pooling, and HTTP/1.1 & HTTP/2 framing
    * `rustls=trace` — TLS handshake details (useful for proxy and certificate problems)

    Use `CHISEL_LOG_STDERR=1` instead of `CHISEL_LOG_STDOUT=1` if you don't want logs interleaved with command output. (Stdout logging is suppressed automatically in the interactive REPL and ACP mode to avoid corrupting their output.)

    Logs are also always written to a per-run log file under the CLI's data directory, regardless of these env vars:

    * **macOS / Linux:** `~/.local/share/devin/cli/logs/devin_<timestamp>_<pid>.log`
    * **Windows:** `%APPDATA%\devin\cli\logs\devin_<timestamp>_<pid>.log`

    Log files from finished processes that have been untouched for 48 hours are gzipped at startup to keep the directory small, so older logs are `.log.gz`. Search them with `zgrep` (or `rg -z`) and read them with `zless`:

    ```bash theme={null}
    zgrep "error" ~/.local/share/devin/cli/logs/*.log.gz
    rg -z "error" ~/.local/share/devin/cli/logs/
    ```

    <Warning>
      Trace-level logs can include sensitive data such as `Authorization` headers and tokens. Scrub log output before sharing it.
    </Warning>
  </Accordion>

  <Accordion title="Inspect full request and response bodies">
    `RUST_LOG` exposes the request lifecycle but not full payloads. To capture complete request and response bodies, route the CLI through an intercepting proxy such as [mitmproxy](https://mitmproxy.org/):

    ```bash theme={null}
    # Terminal 1 — start the intercepting proxy:
    mitmproxy --listen-port 8080

    # Terminal 2 — point the CLI at it:
    export HTTPS_PROXY=http://127.0.0.1:8080
    devin auth login
    ```

    Because the CLI trusts the OS certificate store, install mitmproxy's CA certificate (`~/.mitmproxy/mitmproxy-ca-cert.pem`) into your system trust store first — otherwise the TLS connection to the proxy will fail.
  </Accordion>
</AccordionGroup>

***

## Runtime Issues

<AccordionGroup>
  <Accordion title="Model not available">
    If you see errors about a model not being available:

    1. Check if your enterprise restricts available models in [Team Settings](/cli/enterprise/team-settings)
    2. Verify the model name is correct — use `/model` to see available options
    3. Try a different model: `devin --model sonnet -- your prompt`
  </Accordion>

  <Accordion title="Rate limiting or quota exceeded">
    If you hit usage limits:

    1. Wait a few minutes before retrying
    2. Check your organization's usage dashboard for quota status
    3. Contact your admin if you need higher limits
  </Accordion>

  <Accordion title="Agent can't find a tool that works in my shell">
    Commands the agent runs inherit your login shell's environment on macOS and Linux, so tools installed through `nvm`, `pyenv`, `rbenv`, `direnv`, or `mise` are normally available. If the agent reports "command not found" for something that works in your terminal:

    1. Confirm the tool is on the `PATH` exported by your shell profile, not only by an interactive-only alias or function
    2. Restart Devin — the environment is snapshotted once at session startup, so profile changes made mid-session are not picked up
    3. On Windows, the login-shell snapshot does not apply; make sure the tool is on the system `PATH`

    At session startup, Devin runs `$SHELL` as an interactive login shell once and reads exported variables from your shell configuration, such as `.bash_profile`, `.bashrc`, `.zshrc`, `.zprofile`, or your fish config.
  </Accordion>

  <Accordion title="Agent seems stuck or unresponsive">
    If the agent stops responding:

    1. Press `Ctrl+C` to interrupt the current operation
    2. Try `/clear` to start a fresh session
    3. Check your network connection
    4. Restart Devin CLI
  </Accordion>
</AccordionGroup>

***

## MCP Server Issues

<AccordionGroup>
  <Accordion title="Server won't start">
    If an MCP server fails to start:

    1. Verify the command works outside Devin CLI:
       ```bash theme={null}
       npx -y @modelcontextprotocol/server-github
       ```
    2. Check that all required environment variables are set
    3. Look for error messages in the server output
  </Accordion>

  <Accordion title="Tools not appearing">
    If MCP tools don't show up:

    1. The server may need a moment to initialize — wait a few seconds
    2. Check that the server is configured correctly in your config file
    3. Verify your enterprise allows MCP servers in [Team Settings](/cli/enterprise/team-settings)
  </Accordion>

  <Accordion title="Permission denied for MCP tools">
    MCP tools default to prompting for approval. To auto-approve specific tools, add them to your permissions config:

    ```json theme={null}
    {
      "permissions": {
        "allow": ["mcp__github__list_issues"]
      }
    }
    ```
  </Accordion>
</AccordionGroup>

***

## Getting Help

If you're still experiencing issues:

* **Email support:** [support@cognition.ai](mailto:support@cognition.ai)
* **Submit a bug report:** Use the `/bug` command inside Devin CLI to report issues directly to the Devin CLI developers
* **Check for updates:** Run `devin update` to ensure you're on the latest version
