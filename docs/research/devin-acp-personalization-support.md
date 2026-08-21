# Devin ACP 个性化能力研究

## 结论

截至 2026-08-21，本仓库的“个性化”设置对 Devin ACP **不生效**：它只被 Desktop 保存到本地 `app-settings.json`，没有进入 `devin acp` 的初始化、创建会话、配置更新或 prompt 请求。因此，当前 UI 会让用户误以为可以改变 Devin 的回答风格，实际却不会改变 Devin 行为。

本次已删除 Desktop 的“个性化”设置及其本地设置读写链路。昵称、头像、语言、主题、推理过程等确实属于 Desktop 的设置继续保留；模型和权限模式继续使用 ACP 广告的 `configOptions`/`modes`。如果未来 Devin 广告了明确的扩展能力，再以能力门禁方式重新设计，不应预先伪造通用 system prompt setter。

## 研究范围与证据层级

- **规范与类型**：仓库安装的官方 `@agentclientprotocol/sdk` 1.4.0（`node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.4.3/node_modules/@agentclientprotocol/sdk/`）及其生成的 ACP v1 schema/type 定义。
- **Devin 一手文档**：`docs/devin-cli/` 下的本地官方文档镜像。
- **仓库调用链**：当前 Desktop 的 `AppSettings`、IPC、renderer 设置页、`DevinAcpHost` 和 capability gate。
- **运行时观察**：本机安装的 `devin 3000.4.25 (7e8e528a)`，通过 `devin acp` stdio 发送 `initialize` 与 `session/new` 请求；该观察只代表该版本，不能替代未来版本的能力协商。

## 1. ACP 通用能力：有配置选择器，但没有标准的 system prompt setter

### 1.1 初始化能力不包含个性化字段

官方 SDK 生成类型中的 `AgentCapabilities` 只定义 `loadSession`、`promptCapabilities`、`mcpCapabilities`、`sessionCapabilities`、`auth` 以及可扩展的 `_meta`（[官方 SDK `types.gen.d.ts`](../../node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.4.3/node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:1519)）。`PromptCapabilities` 只描述图片、音频和 embedded context 等 prompt 内容类型（同文件 :1599），没有 tone、style、custom instructions 或 system prompt 字段。

ACP v1 初始化文档要求 Agent 返回它支持的能力；未出现的能力必须视为不支持（[ACP Initialization — Capabilities](https://agentclientprotocol.com/protocol/v1/initialization#capabilities)）。这意味着 Client 不能因为自己的 UI 有一个“风格”控件，就推断 Agent 会接受该设置。

### 1.2 `session/new` 和 `session/prompt` 没有 system prompt 参数

官方 SDK 的 `NewSessionRequest` 只有绝对 `cwd`、可选 `additionalDirectories`、`mcpServers` 和 `_meta`（[官方 SDK `types.gen.d.ts`](../../node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.4.3/node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:4692)）。`PromptRequest` 只有 `sessionId`、`prompt: ContentBlock[]` 和 `_meta`（同文件 :5140）；prompt 内容是用户消息及其文件/图片/资源上下文，并不是 system prompt 注入接口。官方 prompt-turn 文档给出的请求也只有 `sessionId` 与 `prompt`（[ACP Prompt Turn — User Message](https://agentclientprotocol.com/protocol/v1/prompt-turn#1-user-message)）。

### 1.3 `configOptions` 是 Agent 定义的会话选择器，不是通用个性化协议

ACP v1 的 `SessionConfigOption` 允许 Agent 为会话返回任意配置选项，规范示例和保留分类主要覆盖 `mode`、`model`、`model_config`、`thought_level`（[ACP Session Config Options — Initial State](https://agentclientprotocol.com/protocol/v1/session-config-options#initial-state)）。Client 只能按 Agent 返回的 `id` 和选项值调用 `session/set_config_option`；配置项的语义由 Agent 负责，Client 不能自行添加一个名为 `tone` 或 `customInstructions` 的字段。

因此，ACP 通用层可以承载某个 Agent 自己广告的“风格”选择器，但这不等于 ACP 规范提供了跨 Agent 的 system prompt personalization 能力。

### 1.4 扩展理论上可行，但必须由 Agent 广告

ACP 允许通过 `_meta` 附加自定义能力，并通过以下划线开头的自定义 JSON-RPC 方法扩展协议；扩展调用方应先检查 Agent 广告的能力（[ACP Extensibility](https://agentclientprotocol.com/protocol/v1/extensibility)）。这只说明未来 Devin 可以定义专有 setter，并不证明当前 Devin 已定义或支持它。

## 2. Devin CLI 当前实际能力

### 2.1 官方 CLI 文档没有 ACP 个性化入口

本地官方 `devin acp` 参考只列出 `--agent-type` 和 `--model` 两个选项，说明 ACP 以 stdio JSON-RPC 运行；没有 tone、style、custom-instructions 或 system-prompt 参数（[`docs/devin-cli/reference/commands.md`](../devin-cli/reference/commands.md#devin-acp)，约第 297–316 行）。

Devin 的配置文档列出的用户/项目配置重点是模型、权限、MCP 和外部工具导入（[`docs/devin-cli/extensibility/configuration.md`](../devin-cli/extensibility/configuration.md#what-you-can-configure)，约第 85–103 行）；完整配置参考的 `agent` 选项也只有默认模型和历史显示等字段（[`docs/devin-cli/reference/configuration/config-file.md`](../devin-cli/reference/configuration/config-file.md#agent)，约第 137–149 行），没有回复风格或自定义 system prompt 选项。

### 2.2 Devin 支持的持久化行为定制通过规则/Skills，不是 ACP Client 设置

Devin CLI 官方文档说明 `AGENTS.md`、`AGENTS.local.md`、`.devin/rules/*.md` 等规则会在会话上下文中加载，用于编码规范、工作方式和项目约束（[`docs/devin-cli/extensibility/rules.md`](../devin-cli/extensibility/rules.md#rules--agentsmd)，约第 5–15、19–37、77–117 行）。这些文件由 Devin CLI 自己发现和注入；它们不是 ACP v1 的标准字段，也不应由 Desktop 在用户点击“确认”后静默写入。

### 2.3 本机 `devin acp` v3000.4.25 的运行时结果

对本机 `/Users/guozeling/.local/bin/devin`（`devin 3000.4.25 (7e8e528a)`）执行了最小 ACP 流程：

1. `initialize` 返回 `promptCapabilities`、`sessionCapabilities`、`auth` 和若干 Cognition `_meta` 扩展，没有 personalization、tone、style 或 system-prompt capability。
2. `session/new` 返回的 `configOptions` 只有 `mode` 和 `model`。实际返回的模式包括 `accept-edits`、`smart`、`ask`、`plan`、`bypass`；模型列表由 Devin 运行时动态返回。
3. 没有观察到可用于写入任意 system prompt 或回复风格的 `configId`、标准请求方法或已广告的自定义扩展。

这是对当前 CLI 版本的实机证据；由于 ACP 能力是运行时协商的，未来版本若新增并广告扩展，必须重新验证。

## 3. 删除前调用链与当前状态

研究基线 commit `222f04d` 中的证据可以沿着以下调用链完整闭合：

| 层 | 删除前实现 | 事实 |
| --- | --- | --- |
| 本地设置 | `AppSettings` 的 `personalization` 字段与 `getPersonalization`/`setPersonalization` | 只读写本地 JSON；没有 ACP 请求。 |
| IPC | `settings:get/set-personalization` | 只调用 `AppSettings`，没有传给 `agentHost`。 |
| renderer 设置页 | “个性化”页及其 `onPersonalization` 回调 | 只更新 React 状态和本地设置；确认按钮不会启动或更新 ACP session。 |
| 创建 session | [`DevinAcpHost.newSession`](../../apps/desktop/src/main/devin-acp-host.ts) | `session/new` 只发送 `cwd`、`mcpServers`、能力允许时的 `additionalDirectories`。 |
| 发送 prompt | [`DevinAcpHost.prompt`](../../apps/desktop/src/main/devin-acp-host.ts) | `session/prompt` 只发送 `sessionId` 和用户提供的 `prompt` 内容；没有前置风格文本或 `_meta` 注入。 |

本次修复已删除设置页、IPC、preload、共享类型、`AppSettings` 读写、能力门禁、文案、样式和对应测试。已有 `app-settings.json` 中的旧 `personalization` 键只作为未知惰性数据保留；当前代码不读取、不展示，也不向 Devin 传输该值。

## 4. ACP 通用能力与 Devin 实现的边界

| 问题 | ACP v1 通用答案 | 当前 Devin CLI 答案 |
| --- | --- | --- |
| Client 能否改变 Agent 的回复风格？ | 没有标准 system prompt setter；只能使用 Agent 广告的 config option 或扩展。 | 未广告风格/个性化 config option 或扩展。 |
| Client 能否把自定义指令放进 `session/prompt`？ | 可以作为普通用户文本发送，但协议会把它视为用户消息，不是 system prompt；这会污染会话语义且不能保证优先级/持久性。 | 当前 Desktop 没有这样做；不建议伪装成系统指令。 |
| Client 能否修改 Devin 的 `AGENTS.md`/Rules？ | ACP 不提供该语义；文件修改属于 Agent 工具行为，且需要用户明确授权。 | Devin CLI 支持这些文件作为规则来源，但 Desktop 不应代写。 |
| 未来能否支持？ | 可以在 Devin 明确广告 `_meta` 能力和专有方法/配置项后实现，并按能力动态显示。 | 当前版本不支持，不能提前显示“可生效”的控件。 |

## 5. 删除结果

本次实现已删除：

1. 设置窗口中的“个性化”导航项、风格/语调下拉框、自定义指令文本框和保存逻辑。
2. `PersonalizationSettings`、`TonePreset`、`TONE_PRESETS` 及 `AppSettings` 的 personalization 读写、IPC、preload、preview API 和对应测试。
3. 个性化专用 i18n 文案与 CSS，以及永远 disabled 的 `personalization-system-prompt` feature gate。
4. 文档仍说明：若用户希望持久化约束 Devin 行为，应在项目或用户配置目录维护 `AGENTS.md`/`.devin/rules`，具体由 Devin CLI 官方规则机制执行；Desktop 不代写这些文件。

已有 `app-settings.json` 中的 `personalization` 键不会影响 Devin。删除代码后可以自然忽略该未知键；除非另有数据清理需求，不必改写用户设置文件。

## 参考来源

### 本地一手来源

- [`docs/devin-cli/reference/commands.md#devin-acp`](../devin-cli/reference/commands.md#devin-acp)
- [`docs/devin-cli/extensibility/configuration.md`](../devin-cli/extensibility/configuration.md)
- [`docs/devin-cli/extensibility/rules.md`](../devin-cli/extensibility/rules.md)
- [`docs/devin-cli/reference/configuration/config-file.md`](../devin-cli/reference/configuration/config-file.md)
- [`apps/desktop/src/main/devin-acp-host.ts`](../../apps/desktop/src/main/devin-acp-host.ts)
- 官方 SDK 1.4.0 生成 schema：[`types.gen.d.ts`](../../node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.4.3/node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts) 与 [`schema.json`](../../node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.4.3/node_modules/@agentclientprotocol/sdk/schema/schema.json)

### 官方在线规范

- [ACP v1 Overview](https://agentclientprotocol.com/protocol/v1/overview)
- [ACP v1 Initialization](https://agentclientprotocol.com/protocol/v1/initialization)
- [ACP v1 Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP v1 Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [ACP v1 Session Config Options](https://agentclientprotocol.com/protocol/v1/session-config-options)
- [ACP v1 Extensibility](https://agentclientprotocol.com/protocol/v1/extensibility)
