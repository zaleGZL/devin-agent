# 研究报告：参照 DSCode 的 Devin Coding Agent 实现方案

## 1. 执行摘要

结论：目标产品应把 DSCode Desktop 所需的 Electron/React 源码、样式和资产**复制到当前仓库并独立维护**，做到相同 UI 与交互，但不能在构建、运行或发布时依赖 DSCode 仓库或 `@thinkany/dscode-*` 包。复制后的代码把 `@thinkany/dscode-core` 本地运行时替换为 **Devin CLI ACP 适配层**；`devin acp` 的 stdio JSON-RPC 是唯一 Agent 边界，UI 由 ACP 动态能力、会话能力和 `configOptions` 驱动。

- DSCode 已把桌面职责分成 Electron `main`、安全 `preload`、React `renderer` 和共享类型；main 启动 Core RPC 子进程，renderer 只通过 context-isolated IPC 访问能力。[`dscode/apps/desktop/README.md:L91-L99`](../../../dscode/apps/desktop/README.md#L91-L99) [`dscode/apps/desktop/src/main/index.ts:L94-L140`](../../../dscode/apps/desktop/src/main/index.ts#L94-L140)
- Devin CLI 官方文档把 `devin acp` 定义为给 IDE 调用的 stdio JSON-RPC server，而非交互 TUI；ACP 还会广告 slash commands、模型和工作区相关能力。[`docs/devin-cli/reference/commands.md:L297-L331`](../devin-cli/reference/commands.md#L297-L331)
- 本机 **Devin CLI 3000.4.25（2026-08-21）协议探针**显示：`initialize(protocolVersion:1)` 返回 `loadSession=true`、图片输入可用（audio 不可用）、embedded context 可用、`session/list`/`session/delete`/`additionalDirectories` 可用，并返回 browser 认证方法；`session/new` 返回 `accept-edits`、`smart`、`ask`、`plan`、`bypass` 模式及动态模型 `configOptions`（每个模型含 `supportsImages`）。这是版本快照，不是稳定契约；运行时必须动态发现并保留未知字段。
- 可原样复制到当前仓库的范围：Desktop 视觉和布局、工作区/项目导航、线程侧栏、消息流、工具活动卡片、文件预览、设置/主题/账户对话框、Electron 安全边界、打包脚本及大部分会话索引 UI。
- 必须适配的范围：进程宿主、ACP 握手/认证/会话、事件规范化、模型/模式选择、图片能力、权限与 sandbox 状态、会话恢复、CLI 扩展能力显示。
- 必须跳过或降级的范围：DSCode 自有 provider/API 适配器、DeepSeek 专用 payload、Core RPC、TUI/终端模式、依赖 Core 内部工具的原子 patch checkpoint/`/undo`、无法由 ACP 暴露的本地工具级拦截，以及 Devin CLI 官方明确缺失的 Knowledge、Playbooks、Secrets、Memories、Workflows、Code Lenses、App Deploys、Conversation Sharing、Arena。[`docs/devin-cli/index.md:L106-L116`](../devin-cli/index.md#L106-L116) [`docs/devin-cli/enterprise/controls.md:L13-L26`](../devin-cli/enterprise/controls.md#L13-L26)

## 2. 范围、约束与证据规则

### 2.1 产品范围

1. 仅构建 Desktop 应用；不交付 DSCode Terminal、VS Code extension 或通用 headless CLI。
2. 仅一个 provider：`devin`，其实现是本机已安装并已认证的 `devin` CLI。
3. `/Users/guozeling/workspace/git/dscode` 只作为研究和一次性源码输入；所需代码、样式、字体/图标等资产复制进入当前仓库后独立演进，不通过相对路径、软链接、submodule、workspace dependency、动态加载或发布脚本引用 DSCode checkout。
4. Devin CLI 无法从 ACP 或官方本地文档证实的功能不实现；报告将其标为“跳过”或“待验证”，不以 TUI 输出推测隐藏协议。
5. “UI/交互完全一致”指 provider 无关页面按 DSCode 源码原样移植；provider 相关行为必须改接 Devin ACP。ACP 无等价能力时按约定隐藏或降级，不能为了外观一致伪造功能。

### 2.2 证据优先级

- 第一优先：本地 DSCode 源码、README、package/build/test 配置。
- 第二优先：仓库 `docs/devin-cli/` 的 Devin CLI 官方文档镜像，以及 ACP 官方 schema/TypeScript SDK；本报告不引用二手博客或搜索摘要。
- 第三优先：本机协议探针（明确标记为版本快照）。探针只能补充能力发现，不能替代运行时动态协商。
- 行号均以当前工作区文件为准；源码更新后应重新核对。

研究快照：DSCode `1ce0328cfa856700f6c955f5429ca00b08d99ea5`（2026-08-14）；ACP schema `a26d13426cae7ede0c84d0ab7506ce9e5d01573b`；ACP TypeScript SDK `e6463f444093ed7c5f1cc937c3f32afb5853e906`；本机 Devin CLI `3000.4.25 (7e8e528a)`；核对日期为 2026-08-21。

### 2.3 许可与分发约束

- DSCode 使用 MIT License；复制其源码或视觉实现时，派生发行物必须保留原版权和许可声明。[`dscode/LICENSE`](../../../dscode/LICENSE)
- 当前仓库应保存 DSCode MIT 许可证副本或第三方声明，并能追踪复制文件的来源 commit；这不会形成运行时依赖。
- 已审阅的 Devin CLI 安装文档说明了官方安装渠道，但没有提供把 CLI 二进制随第三方 Desktop 安装包再分发的授权。[`docs/devin-cli/index.md:L9-L65`](../devin-cli/index.md#L9-L65)
- 因此 MVP 应要求用户独立安装并更新 Devin CLI，应用只负责发现路径、校验版本和给出官方安装指引；取得书面再分发授权前，不把 `devin` binary 打入 Electron 包。这是基于现有证据的合规边界，不是对最终许可状态的法律结论。

## 3. DSCode 技术栈与项目架构

### 3.1 构建与依赖

- 根包是 ESM、pnpm 管理的 Node 包；工作区包含 `apps/*` 和 `packages/*`，同时为 x64/arm64 安装原生依赖。[`dscode/package.json:L1-L40`](../../../dscode/package.json#L1-L40) [`dscode/pnpm-workspace.yaml:L1-L23`](../../../dscode/pnpm-workspace.yaml#L1-L23)
- Core 要求 Node `>=22.19.0`，依赖 `pi-agent-core`、`pi-ai`、`pi-coding-agent`、MCP SDK、keyring、TypeBox、Zod；这些依赖共同实现模型、工具、会话、RPC 和安全运行时。[`dscode/packages/core/package.json:L1-L60`](../../../dscode/packages/core/package.json#L1-L60)
- Desktop 使用 Electron 43、React 19、Vite、tsup、TypeScript、Vitest、electron-builder；脚本包含 typecheck、test、build、pack、各平台 dist。[`dscode/apps/desktop/package.json:L17-L65`](../../../dscode/apps/desktop/package.json#L17-L65)

### 3.2 分层架构

```text
Electron main
  ├─ BrowserWindow / 菜单 / 原生对话框 / 外部 URL
  ├─ workspace、session index、auth、文件预览 IPC
  └─ AgentHost → Core RPC worker（当前 DSCode）
        ↓ JSONL RPC + agent events
preload（contextBridge，白名单 API）
        ↓ typed IPC
renderer React
  ├─ 项目/线程侧栏
  ├─ 消息、reasoning、tool activity、approval
  ├─ composer、模型/权限选择器、文件 inspector
  └─ settings、auth、theme、command/search dialog
```

- Core README 明确 Core 是 graphical/IDE/headless 共用运行时，拥有 provider routing、tools、permissions、sessions、Skills、MCP、hooks、checkpoints 和 RPC；JSONL 是 transcript 真相，SQLite 仅索引线程元数据。[`dscode/packages/core/README.md:L1-L8`](../../../dscode/packages/core/README.md#L1-L8) [`dscode/packages/core/README.md:L29-L41`](../../../dscode/packages/core/README.md#L29-L41)
- Desktop main 创建 context isolation、关闭 Node integration、启用 renderer sandbox 的窗口，并拒绝页面内导航；只有 http(s) 外链交给系统浏览器。[`dscode/apps/desktop/src/main/index.ts:L87-L140`](../../../dscode/apps/desktop/src/main/index.ts#L87-L140)
- preload 只暴露 themes/settings/workspace/files/sessions/auth/agent API 与事件订阅，不把 Node 或文件系统直接给 renderer。[`dscode/apps/desktop/src/preload/index.ts:L1-L67`](../../../dscode/apps/desktop/src/preload/index.ts#L1-L67)

### 3.3 DSCode AgentHost 与状态持久化

- 当前 AgentHost 启动 Core RPC entry，传入 provider、permission、sandbox、model、effort、session，随后请求 state/messages/models/thinking/stats；RPC 是自定义换行 JSON 协议。[`dscode/apps/desktop/src/main/agent-host.ts:L24-L84`](../../../dscode/apps/desktop/src/main/agent-host.ts#L24-L84)
- 每个请求带 id、45 秒超时；stdout 按行解析 `response` 或 agent event，UI 请求通过 `extension_ui_response` 回写。[`dscode/apps/desktop/src/main/agent-host.ts:L109-L173`](../../../dscode/apps/desktop/src/main/agent-host.ts#L109-L173)
- Core 将 `~/.dscode/sessions/YYYY/MM/DD/*.jsonl` 作为 transcript 真相，保留 flat hard-link 兼容 resume；`state.sqlite` 保存 cwd/title/provider/model、更新时间、pin/archive 和文件指纹。[`dscode/packages/core/src/home.ts:L22-L112`](../../../dscode/packages/core/src/home.ts#L22-L112) [`dscode/packages/core/src/state.ts:L56-L145`](../../../dscode/packages/core/src/state.ts#L56-L145)
- Desktop main/共享类型具备 list/pin/archive/unarchive 后端与 IPC 形状，但当前 renderer 实际接线的是 list/open/search；pin/archive/unarchive 不能算现有 Desktop UI parity。[`dscode/apps/desktop/src/main/index.ts:L253-L256`](../../../dscode/apps/desktop/src/main/index.ts#L253-L256) [`dscode/apps/desktop/src/shared/types.ts:L50-L64`](../../../dscode/apps/desktop/src/shared/types.ts#L50-L64) [`dscode/apps/desktop/src/renderer/App.tsx:L138-L181`](../../../dscode/apps/desktop/src/renderer/App.tsx#L138-L181)

## 4. DSCode Desktop 完整功能清单

下表是实现范围基线；兼容性结论详见第 8 节。

| 功能域 | DSCode 行为/源码位置 | 目标产品处理原则 |
|---|---|---|
| 工作区 | 选择目录、最近项目、忘记项目；main 负责原生 dialog 与路径记录。[`dscode/apps/desktop/src/main/index.ts:L194-L206`](../../../dscode/apps/desktop/src/main/index.ts#L194-L206) | 把 UI/IPC 代码原样复制进当前仓库；cwd 传给 ACP `session/new`。 |
| 线程 | 侧栏按项目分组，当前 renderer 支持新建、打开、搜索；main/IPC 另有 pin/archive/unarchive，但 UI 未接线。[`dscode/apps/desktop/src/renderer/App.tsx:L138-L181`](../../../dscode/apps/desktop/src/renderer/App.tsx#L138-L181) | 复制已接线流程；id/path 映射 Devin sessionId，锁定状态要显示。pin/archive 如要暴露属于可选增强。 |
| 消息流 | user/assistant、streaming、reasoning、tool work、错误、耗时、Markdown/GFM。[`dscode/apps/desktop/src/renderer/lib/conversation.ts:L132-L191`](../../../dscode/apps/desktop/src/renderer/lib/conversation.ts#L132-L191) | 复制 reducer 结构，新增 ACP update → DSCode ChatMessage 映射。 |
| 工具活动 | tool start/update/end 聚合为可折叠 ToolRow；从参数推导命令/文件标题。[`dscode/apps/desktop/src/renderer/lib/conversation.ts:L309-L399`](../../../dscode/apps/desktop/src/renderer/lib/conversation.ts#L309-L399) | 适配 ACP tool/terminal lifecycle；未知 update 保留原始 payload。 |
| Composer | 文本、图片附件、取消/发送、快捷键、上下文卡片。[`dscode/apps/desktop/src/renderer/App.tsx:L2319-L2377`](../../../dscode/apps/desktop/src/renderer/App.tsx#L2319-L2377) | 复制进当前仓库；图片按钮由 ACP `promptCapabilities.image` 动态决定。 |
| 文件预览 | main 校验 workspace containment，支持 HTML/Markdown/image/PDF/video/audio/code/text，renderer inspector 展示。[`dscode/apps/desktop/src/main/index.ts:L207-L252`](../../../dscode/apps/desktop/src/main/index.ts#L207-L252) | 原样复制；预览来自本地工作区，不等同 agent 读权限。 |
| 审批与模式 | `plan/ask/auto/full` picker，扩展 UI request 显示 select/confirm/input/editor。[`dscode/apps/desktop/src/renderer/App.tsx:L2175-L2236`](../../../dscode/apps/desktop/src/renderer/App.tsx#L2175-L2236) [`dscode/apps/desktop/src/renderer/App.tsx:L2380-L2445`](../../../dscode/apps/desktop/src/renderer/App.tsx#L2380-L2445) | 适配 ACP `mode` config option；不可把 DSCode 四模式硬编码成 Devin 模式。 |
| 模型 | provider 分组 picker，Core snapshot 返回 model 列表。[`dscode/apps/desktop/src/renderer/App.tsx:L2447-L2500`](../../../dscode/apps/desktop/src/renderer/App.tsx#L2447-L2500) | 只显示 `devin` provider；模型和 `supportsImages` 来自 ACP configOptions。 |
| 认证 | API key/OAuth/device prompt、浏览器外链、状态/注销。[`dscode/apps/desktop/src/main/index.ts:L258-L315`](../../../dscode/apps/desktop/src/main/index.ts#L258-L315) | 改为 ACP `authenticate`；优先使用 Devin CLI 已存 credentials，UI 按运行时广告的认证方法承载交互。 |
| 设置 | 语言、profile/avatar、reasoning 显示、personalization、主题、provider credential、permission/sandbox、About。[`dscode/apps/desktop/src/renderer/App.tsx:L1698-L2027`](../../../dscode/apps/desktop/src/renderer/App.tsx#L1698-L2027) | 保留外观/profile；Devin 模型/权限/扩展设置交给 CLI config/ACP；不保留 DeepSeek base URL/API key 表单。 |
| 计划 | update_plan 状态、structured plan、执行/细化/留在 plan 的流程。[`dscode/packages/core/src/plan.ts:L23-L147`](../../../dscode/packages/core/src/plan.ts#L23-L147) | 若 ACP update 或 slash command 暴露计划结构则映射；否则仅显示 Devin 文本/命令，不伪造状态。 |
| 命令/后台作业 | Core managed process 支持 yield、stdin、poll、terminate、超时和 sandbox。[`dscode/packages/core/src/managed-process.ts:L30-L161`](../../../dscode/packages/core/src/managed-process.ts#L30-L161) | 不在 renderer 重做 agent 工具执行；仅渲染 ACP terminal lifecycle。应用自身的 git/诊断命令另行受 main 约束。 |
| patch/checkpoint | `apply_patch` 前后快照、冲突检测、`/diff`、`/undo`。[`dscode/packages/core/src/checkpoint.ts:L20-L116`](../../../dscode/packages/core/src/checkpoint.ts#L20-L116) | ACP 未证明提供原子 patch/checkpoint API，默认跳过原能力；可提供只读 git diff，不能宣称可安全 undo。 |
| 安全 | macOS Seatbelt、Docker fallback、网络默认关闭、credential env stripping、fail-closed。[`dscode/packages/core/src/sandbox.ts:L25-L109`](../../../dscode/packages/core/src/sandbox.ts#L25-L109) [`dscode/packages/core/src/process.ts:L20-L100`](../../../dscode/packages/core/src/process.ts#L20-L100) | 使用 Devin `--sandbox`/企业策略；应用仅显示实际状态，不复制一套与 agent 冲突的 sandbox。 |
| 扩展 | AGENTS/CLAUDE、Skills、MCP、hooks、project trust、subagents。[`dscode/packages/core/src/dscode-extension.ts:L125-L275`](../../../dscode/packages/core/src/dscode-extension.ts#L125-L275) | 由 Devin CLI 自己加载；应用提供状态/配置入口，避免二次执行。 |
| 打包 | mac arm64/x64 DMG/zip，Windows x64 NSIS，Linux x64 DEB/RPM；Core 随 Electron Node runtime 打包。[`dscode/apps/desktop/electron-builder.yml:L18-L61`](../../../dscode/apps/desktop/electron-builder.yml#L18-L61) [`dscode/apps/desktop/README.md:L83-L89`](../../../dscode/apps/desktop/README.md#L83-L89) | 复制打包配置到当前仓库；安装器必须检测或引导安装 `devin` binary。 |
| Tetris 独立页面 | Vite 构建包含 `tetris.html` 和独立 renderer，但主 App/main 没有入口；它是未接线的附带页面，不是 Coding Agent 工作流。[`dscode/apps/desktop/vite.config.ts:L9-L17`](../../../dscode/apps/desktop/vite.config.ts#L9-L17) | 不纳入功能 parity；如需保留资产可单独复制，但不应占用 Agent 实现优先级。 |

## 5. Desktop 核心流程（目标实现）

### 5.1 启动与能力发现

1. Electron main 初始化应用数据目录、日志、IPC、窗口和安全协议；沿用 DSCode 的 `contextIsolation=true`、`nodeIntegration=false`、renderer sandbox 和导航拦截。[`dscode/apps/desktop/src/main/index.ts:L75-L140`](../../../dscode/apps/desktop/src/main/index.ts#L75-L140)
2. `DevinAcpHost` 解析 `devin` 的绝对路径，spawn `devin acp`（shell=false，stdin/stdout/stderr pipes），不把模型/API secret 注入 renderer。
3. 使用 ACP SDK 协商稳定协议版本（当前探针为 v1）；保存协议版本、prompt/session/auth/config 能力和未知扩展字段。
4. 若要求认证，发送 ACP `authenticate`；只呈现运行时广告的方法。本机快照只广告 browser 方法；Devin CLI 文档说明 credentials 来自 `WINDSURF_API_KEY` 或 `devin auth login` 存储值。[`docs/devin-cli/reference/commands.md:L297-L305`](../devin-cli/reference/commands.md#L297-L305)
5. 依据 `session/list` 恢复最近线程；没有可恢复线程时调用 `session/new`，传 cwd 和 host 能力声明。探针显示会话对象至少含 `sessionId/cwd/title/updatedAt/additionalDirectories/_meta.isLocked`。

### 5.2 工作区与线程

- 选择工作区时保留 DSCode `RecentWorkspaces`、路径规范化和活动 cwd；不要在 renderer 直接访问文件系统。
- 线程侧栏将 Devin `sessionId` 作为稳定主键；`updatedAt/title/cwd` 显示在 `SessionSummary`。`isLocked` 线程应禁用发送/删除并提示由其他 host 占用。
- `session/list` 支持跨工作区时，UI 仍按 DSCode 的项目分组；如果 ACP 不提供跨目录列表，则只显示当前 cwd 的本地索引。
- `sessionCapabilities.list/delete/additionalDirectories` 是动态能力；没有 `delete` 时隐藏不可逆删除，不能调用不存在的方法。

### 5.3 Prompt、流式事件与 UI reducer

```text
renderer composer
    ↓ preload IPC
main DevinAcpHost.prompt(sessionId, content[])
    ↓ ACP JSON-RPC stdio
Devin CLI agent updates / tool lifecycle / terminal lifecycle
    ↓ SDK typed notifications + raw extension passthrough
main normalizer → AgentEvent（source=acp，raw preserved）
    ↓ IPC event
renderer applyAgentEvent → ChatMessage[] → AssistantTurn/WorkLog/ToolRow
```

- 把 `conversation.ts` 的消息合并、tool start/update/end、reasoning 和图片解析复制到当前仓库；在其前面增加 ACP normalizer，不直接把 ACP payload 当成 DSCode AgentEvent。[`dscode/apps/desktop/src/renderer/lib/conversation.ts:L132-L191`](../../../dscode/apps/desktop/src/renderer/lib/conversation.ts#L132-L191)
- 标准 v1 update 至少覆盖 `user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update` 和 `usage_update`；扩展事件另行包裹。定义以 [ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/a26d13426cae7ede0c84d0ab7506ce9e5d01573b/schema/v1/schema.json) 为准。
- 对未知事件保留 `raw`、`sessionId`、`updateId`、时间戳；解析失败显示“未识别的 agent update”，不能静默丢失。
- prompt 发送前检查 `promptCapabilities.image`；本机探针为 image=true、audio=false、embeddedContext=true，因此仅启用图片附件，音频按钮不显示。
- DSCode 的运行中 `steer` 没有 ACP v1 标准等价方法；执行期间应禁用或排队 composer，或者由用户明确取消后再发下一轮，不能把第二次 `session/prompt` 当成精确 steering。

### 5.4 模式、审批与终端活动

- `session/new` 返回的 `configOptions.mode` 才是模式菜单真相；探针发现 `accept-edits`、`smart`、`ask`、`plan`、`bypass`，不得复用 DSCode 的 `full` 名称。
- Devin 文档定义 sandbox session 只能使用 Autonomous，且 sandbox 失败时拒绝启动；Windows 当前不支持 OS sandbox，Linux 需要 `bubblewrap` 与 `socat`。[`docs/devin-cli/essential-commands.md:L42-L147`](../devin-cli/essential-commands.md#L42-L147) [`docs/devin-cli/sandbox.md:L5-L27`](../devin-cli/sandbox.md#L5-L27)
- UI 应显示 ACP/CLI 返回的当前模式、权限请求和 `isLocked`。当 CLI 向 client 发起 `session/request_permission` 时，main 将候选项转发给 renderer，并把用户选择或取消结果返回 CLI；应用不自行执行或绕过 Devin 工具政策。协议形状以 [ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/a26d13426cae7ede0c84d0ab7506ce9e5d01573b/schema/v1/schema.json) 为准。
- ACP terminal lifecycle 扩展若可用，映射为 WorkLog/terminal card；否则只显示 tool call 已开始/结束和文本输出。官方 ACP 集成文档明确 shell 输出与原生 Devin TUI 不同，丰富交互可能缺失。[`docs/devin-cli/acp/zed.md:L50-L61`](../devin-cli/acp/zed.md#L50-L61)

### 5.5 文件预览、设置与退出

- 直接移植 DSCode 的 `dscode-preview` protocol、路径 containment、扩展名 allowlist 和 3 MB inline 限制；预览由 main 读取，renderer 仅接收 `FilePreview`。[`dscode/apps/desktop/src/main/index.ts:L441-L524`](../../../dscode/apps/desktop/src/main/index.ts#L441-L524)
- 语言、主题、profile/avatar 和 reasoning 显示可直接保留；DSCode 个性化文本原本通过 Core system prompt 注入，而公开 ACP v1 没有任意 system prompt setter，因此不能等价复用。首版应隐藏 agent 个性化注入；若未来写入 AGENTS/rule，必须明确范围并取得用户确认。模型/模式通过 ACP 标准方法写回会话，不写入 DSCode provider settings。
- 关闭窗口时先取消 prompt、终止 ACP 子进程并拒绝 pending request；沿用 DSCode `SIGTERM` 后短延迟 `SIGKILL` 的可恢复流程。[`dscode/apps/desktop/src/main/agent-host.ts:L86-L107`](../../../dscode/apps/desktop/src/main/agent-host.ts#L86-L107)

## 6. Provider 抽象与功能实现位置

### 6.1 DSCode 当前 provider 入口

- provider ID、默认模型、默认 effort、环境变量和 credential stripping 位于 `packages/core/src/providers.ts`；目前固定列出十个 provider。[`dscode/packages/core/src/providers.ts:L5-L145`](../../../dscode/packages/core/src/providers.ts#L5-L145)
- runtime options 将 `--provider/--model/--effort/--permission/--sandbox` 解析成 Core runtime，并按 harness 选择 active tools。[`dscode/packages/core/src/runtime-options.ts:L27-L205`](../../../dscode/packages/core/src/runtime-options.ts#L27-L205)
- `createDSCodeRpcClient` 把 provider 传入 Core `RpcClient`；Desktop `AgentHost` 再把这些选项作为命令行传给 Core worker。[`dscode/packages/core/src/rpc-client.ts:L8-L27`](../../../dscode/packages/core/src/rpc-client.ts#L8-L27) [`dscode/apps/desktop/src/main/agent-host.ts:L24-L40`](../../../dscode/apps/desktop/src/main/agent-host.ts#L24-L40)

### 6.2 目标 provider 接口

建议在 `apps/desktop/src/main/providers/devin-acp.ts` 定义唯一实现，接口仅保留 Desktop 需要的能力：

```ts
interface CodingAgentProvider {
  initialize(): Promise<ProviderCapabilities>;
  authenticate?(method?: string): Promise<void>;
  listSessions?(options?: ListSessionsOptions): Promise<RemoteSessionSummary[]>;
  newSession(options: NewSessionOptions): Promise<SessionHandle>;
  loadSession(options: LoadSessionOptions): Promise<SessionHandle>;
  deleteSession?(sessionId: string): Promise<void>;
  prompt(sessionId: string, content: PromptContent[]): Promise<PromptResponse>;
  cancel(sessionId: string): Promise<void>;
  setMode(sessionId: string, modeId: string): Promise<void>;
  setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<void>;
  closeSession?(sessionId: string): Promise<void>;
  onPermissionRequest(handler: PermissionRequestHandler): () => void;
  onUpdate(listener: (event: ProviderUpdate) => void): () => void;
  close(): Promise<void>;
}
```

此接口不是新的 provider 生态；它是把 ACP transport 隔离在 main 的最小边界。`devin` 是唯一实现，`provider` 字段只用于兼容 DSCode 的显示/持久化，不再向用户展示多 provider 登录列表。

### 6.3 ACP 与 DSCode RPC 的边界

| 边界 | 事实 | 设计决定 |
|---|---|---|
| DSCode RPC | Core `RpcClient` 调用 `rpc-entry.js`，使用 DSCode 自定义 command/response JSONL。[`dscode/packages/core/src/rpc-client.ts:L17-L27`](../../../dscode/packages/core/src/rpc-client.ts#L17-L27) | 不把 Devin ACP 当作该协议的“另一个 provider”；新建独立 ACP host。 |
| Devin ACP | 官方定义为 `devin acp` stdio JSON-RPC，供 ACP-aware editor/IDE 调用。[`docs/devin-cli/reference/commands.md:L297-L305`](../devin-cli/reference/commands.md#L297-L305) | 用官方 ACP SDK/类型，禁止解析 TUI ANSI 输出。 |
| 模型/模式 | Devin 文档支持 `--model`/`/model`，模型会频繁发布；本机 ACP `configOptions` 返回动态模型与 `supportsImages`。[`docs/devin-cli/models.md:L17-L29`](../devin-cli/models.md#L17-L29) | picker 只读运行时数据；无默认模型或模式时显示 CLI 返回值。 |
| 认证 | CLI 支持 `devin auth login/logout/status`，ACP 也可 runtime `authenticate`。[`docs/devin-cli/reference/commands.md:L59-L71`](../devin-cli/reference/commands.md#L59-L71) [`docs/devin-cli/reference/commands.md:L297-L305`](../devin-cli/reference/commands.md#L297-L305) | 不复制 DSCode API-key credential store；仅显示认证状态并托管给 Devin CLI。 |

## 7. Devin CLI 能力与接口研究

### 7.1 启动、交互与会话

- 普通 CLI 是 REPL；`devin -- prompt` 启动交互，`devin -p` 为单轮打印，`@` 可引用本地文件，Ctrl+V 可粘贴图片。[`docs/devin-cli/essential-commands.md:L9-L34`](../devin-cli/essential-commands.md#L9-L34)
- 全局参数包括 `--model`、`--permission-mode`、`--sandbox`、`--continue`、`--resume`、`--print`、`--prompt-file`、`--config`、`--export` 和 workspace trust 选项。[`docs/devin-cli/reference/commands.md:L21-L38`](../devin-cli/reference/commands.md#L21-L38)
- 会话历史支持 `-c/--continue`、`-r/--resume`，交互命令还包括 `/new`、`/resume`、`/ls`、`/continue`、`/rm-session`、`/compact`。[`docs/devin-cli/essential-commands.md:L149-L240`](../devin-cli/essential-commands.md#L149-L240)
- ACP host 会收到 slash command 广告；登录/退出和 workspace commands 可能由 host gating 隐藏。[`docs/devin-cli/reference/commands.md:L318-L331`](../devin-cli/reference/commands.md#L318-L331)

### 7.2 ACP 协议与认证

- `devin acp` 只能作为 stdio JSON-RPC 子进程运行；命令文档明确“不适合交互式运行”。[`docs/devin-cli/reference/commands.md:L297-L305`](../devin-cli/reference/commands.md#L297-L305)
- JetBrains、Zed、Xcode 的官方配置均为绝对 `devin` 路径 + `acp` 参数；集成文档说明 auth 可来自 `devin auth login` 或 `WINDSURF_API_KEY`。[`docs/devin-cli/acp/jetbrains.md:L72-L138`](../devin-cli/acp/jetbrains.md#L72-L138) [`docs/devin-cli/acp/xcode.md:L55-L74`](../devin-cli/acp/xcode.md#L55-L74)
- Devin Enterprise 登录由 `devin auth login` 完成，凭据写入平台凭据文件且必须视为 secret；企业还可通过 RBAC 控制 Use Devin CLI 权限。[`docs/devin-cli/enterprise/devin-auth.md:L19-L57`](../devin-cli/enterprise/devin-auth.md#L19-L57)
- 目标 Desktop 不应读取/复制 `credentials.toml`；让 `devin acp` 完成认证，必要时只通过 ACP authenticate 交互。
- ACP 稳定 v1 定义了 `session/new`、`session/load`、`session/list`、`session/delete`、`session/resume`、`session/close`、`session/prompt`、`session/cancel`、`session/set_mode`、`session/set_config_option` 和 client-side `session/request_permission`；其中 list/delete/resume/close 必须以 `initialize` 广告的能力为门禁，不能只凭 schema 存在就调用。[ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/a26d13426cae7ede0c84d0ab7506ce9e5d01573b/schema/v1/schema.json)
- TypeScript 实现应锁定官方 [`@agentclientprotocol/sdk`](https://github.com/agentclientprotocol/typescript-sdk/tree/e6463f444093ed7c5f1cc937c3f32afb5853e906)，由 SDK 处理连接和标准类型；Devin 私有 `_meta` 扩展仍需原样保留。本机 3000.4.25 快照未广告 `session.close`/`resume`，所以切换线程时必须允许“取消后终止 ACP host，再启动并 load 目标 session”的降级路径。

### 7.3 模型、Adaptive 与思考级别

- Devin 支持 Anthropic/OpenAI/Google/Cognition 及部分开源模型，别名会随模型族更新；部分模型支持可调 reasoning level。[`docs/devin-cli/models.md:L17-L29`](../devin-cli/models.md#L17-L29)
- `/model`、`--model` 和 user config 可选择模型；企业 allowlist 可能限制可见集合。[`docs/devin-cli/models.md:L33-L64`](../devin-cli/models.md#L33-L64) [`docs/devin-cli/enterprise/team-settings.md:L20-L39`](../devin-cli/enterprise/team-settings.md#L20-L39)
- Adaptive 是按任务动态路由模型的特殊模型选择；企业默认可能关闭。[`docs/devin-cli/adaptive.md:L9-L38`](../devin-cli/adaptive.md#L9-L38)
- 因此 DSCode 的 provider default model、`effort` schema 和静态 cost/contextWindow 不能照搬；UI 应显示 ACP/CLI 返回的模型名称、图像支持和可用配置。

### 7.4 权限、sandbox 与隔离

- CLI 模式为 Normal、Accept Edits、Smart、Bypass、Autonomous；Autonomous 仅在 `--sandbox` 下可用，shell/fetch 由 sandbox 自动批准但文件编辑仍可能要求 Write scope。[`docs/devin-cli/essential-commands.md:L42-L147`](../devin-cli/essential-commands.md#L42-L147)
- 细粒度规则按 deny > ask > allow > default 解析，支持 `Read(...)`、`Write(...)`、`Exec(...)`、`Fetch(...)` 和工具/MCP 名称；优先级为 organization > session > project local > project > user。[`docs/devin-cli/reference/permissions.md:L99-L110`](../devin-cli/reference/permissions.md#L99-L110) [`docs/devin-cli/reference/permissions.md:L170-L239`](../devin-cli/reference/permissions.md#L170-L239) [`docs/devin-cli/reference/permissions.md:L354-L365`](../devin-cli/reference/permissions.md#L354-L365)
- `--sandbox` 以 OS 级别限制可写/可读路径和网络；失败时 fail-closed。macOS 用 Seatbelt，Linux 需要 bwrap+socat，Windows 当前硬失败。[`docs/devin-cli/sandbox.md:L5-L27`](../devin-cli/sandbox.md#L5-L27)
- 网络过滤可按 allowed/denied domains 和 network mode 配置；excluded Exec 规则不能用于绕过 persistent PTY 的 sandbox。[`docs/devin-cli/sandbox.md:L29-L102`](../devin-cli/sandbox.md#L29-L102)
- 企业可强制 sandbox、域名过滤、excluded command、模型 allowlist、MCP allowlist 和终端权限；这些策略优先于本地设置。[`docs/devin-cli/enterprise/team-settings.md:L41-L105`](../devin-cli/enterprise/team-settings.md#L41-L105)

### 7.5 配置、信任与迁移

- 配置是 JSON-with-comments，包含 agent model/history、permissions、theme、subagents、sandbox、notify/proxy 等；CLI 支持从 Cursor/Windsurf/Claude/Copilot/OpenCode/Zed 读取规则。[`docs/devin-cli/reference/configuration/config-file.md:L5-L110`](../devin-cli/reference/configuration/config-file.md#L5-L110) [`docs/devin-cli/reference/configuration/read-config-from.md:L5-L87`](../devin-cli/reference/configuration/read-config-from.md#L5-L87)
- 层级为 organization > session > `.devin/config.local.json` > `.devin/config.json` > user；MCP 使用各层专用 `mcp_config.json`。[`docs/devin-cli/reference/configuration/global-vs-local.md:L5-L29`](../devin-cli/reference/configuration/global-vs-local.md#L5-L29)
- 非交互 `--print` 在不可信目录无法弹 workspace trust prompt；目标 app 需要在新 session 前显示信任状态或让 ACP 承担该流程。[`docs/devin-cli/reference/commands.md:L34-L38`](../devin-cli/reference/commands.md#L34-L38)

### 7.6 MCP、Skills、Rules、Hooks、Plugins

- MCP 通过 stdio/HTTP transport 发现并执行 namespaced tools，也支持 prompts 作为 slash commands；官方 CLI 有 add/list/get/remove/login/logout/enable/disable。[`docs/devin-cli/extensibility/mcp/overview.md:L5-L33`](../devin-cli/extensibility/mcp/overview.md#L5-L33) [`docs/devin-cli/reference/commands.md:L73-L140`](../devin-cli/reference/commands.md#L73-L140)
- MCP 配置可位于 user/project/local，支持 env/header、OAuth、禁用和工具权限。[`docs/devin-cli/extensibility/mcp/configuration.md:L9-L47`](../devin-cli/extensibility/mcp/configuration.md#L9-L47) [`docs/devin-cli/extensibility/mcp/configuration.md:L375-L429`](../devin-cli/extensibility/mcp/configuration.md#L375-L429)
- Skills 是可复用 prompt/tools/permissions/workflow，位置包括 `.devin/skills`、`.agents/skills` 和 user 目录；frontmatter 支持 model、subagent、allowed-tools、permissions、triggers。[`docs/devin-cli/extensibility/skills/overview.md:L5-L47`](../devin-cli/extensibility/skills/overview.md#L5-L47) [`docs/devin-cli/extensibility/skills/creating-skills.md:L43-L85`](../devin-cli/extensibility/skills/creating-skills.md#L43-L85)
- Hooks 可在 session/tool/prompt/permission/stop/compaction 等生命周期运行命令，并用 stdin/stdout/exit code 影响行为。[`docs/devin-cli/extensibility/hooks/overview.md:L5-L11`](../devin-cli/extensibility/hooks/overview.md#L5-L11) [`docs/devin-cli/extensibility/hooks/lifecycle-hooks.md:L5-L18`](../devin-cli/extensibility/hooks/lifecycle-hooks.md#L5-L18)
- Plugins 是可治理的 skills/rules/hooks/MCP/subagent bundle；插件内容和权限由 CLI/Desktop/cloud 的支持范围与 enterprise 规则决定。[`docs/devin-cli/extensibility/plugins/overview.md:L5-L25`](../devin-cli/extensibility/plugins/overview.md#L5-L25)

### 7.7 Subagents 与 Handoff

- Devin CLI subagents 是独立 worker，会话共享代码库和工具但有独立 conversation；支持 foreground/background、profiles、取消/恢复，后台不能请求新权限。[`docs/devin-cli/subagents.md:L5-L32`](../devin-cli/subagents.md#L5-L32) [`docs/devin-cli/subagents.md:L128-L187`](../devin-cli/subagents.md#L128-L187)
- `/handoff` 将上下文、当前分支和未提交 diff 打包到云 Devin VM；云会话具备 VM/browser/server/CI 能力。[`docs/devin-cli/handoff.md:L5-L37`](../devin-cli/handoff.md#L5-L37)
- 这两者可通过 ACP slash command/extension 暴露时显示；不能在 Desktop 自己复制出第二套 subagent/handoff 执行器，也不能把云 VM 当作本地 provider。

### 7.8 明确缺失能力

Devin Local agent 文档列出不支持 Memories、Workflows、Code Lenses、App Deploys、Conversation Sharing、Arena；CLI 与 Devin Cloud 也不共享 Knowledge、Playbooks、Secrets。[`docs/devin-cli/enterprise/controls.md:L17-L26`](../devin-cli/enterprise/controls.md#L17-L26) [`docs/devin-cli/index.md:L106-L116`](../devin-cli/index.md#L106-L116)

## 8. 逐功能兼容矩阵

状态含义：**原样复制**=把 DSCode 文件复制进当前仓库后独立编译维护，不引用原仓库；**需适配**=复制 UI/数据形状，但把 Core 接口改接 ACP；**跳过**=当前 Devin CLI/ACP 没有可证实接口或与 Desktop-only 约束冲突。

| DSCode 功能 | 状态 | 目标处理与理由 |
|---|---|---|
| Electron 窗口、菜单、preload、外链/导航安全 | 原样复制 | 复制进当前仓库；与 provider 无关，保持 main/preload 安全设置。 |
| React 布局、sidebar、composer、Markdown、theme、i18n | 原样复制 | 复制进当前仓库；只替换连接 Core 的数据 hook。 |
| workspace/recent projects | 原样复制 + 需适配 | 本地 dialog/路径代码复制；session cwd/additionalDirectories 以 ACP 能力为准。 |
| session list/new/load/delete | 需适配 | ACP 探针支持 list/delete/new/loadSession；运行时判断 capability，删除缺失则隐藏。 |
| pin/archive/unarchive/search | 搜索原样复制；其余为可选增强 | 当前 DSCode renderer 只接线搜索；pin/archive 后端虽存在，但若目标产品新增 UI，应明确为本地 SQLite overlay，不假设 Devin 同步。 |
| fork/clone/tree/branch summaries | 需适配/部分跳过 | ACP session/new 能力可实现新线程；未证实 fork/tree 语义时仅保留新 session，不伪造分支树。 |
| streaming assistant/user/reasoning/tool rows | 需适配 | ACP update 结构不同；建立 normalizer，保留未知字段。 |
| 运行中 steer/follow-up | 跳过原语义，需降级 | ACP v1 无标准 steer；执行中禁用/排队 composer，或用户取消后再 prompt。不要用并发 prompt 冒充 steering。 |
| tool output/terminal lifecycle | 需适配 | 使用 ACP tool/terminal lifecycle 扩展；官方提示 ACP shell rendering 比 TUI 简化。 |
| 图片附件 | 需适配 | 探针 image=true；发送前检查 `supportsImages`；audio=false 时跳过音频。 |
| 结构化 plan/update_plan | 需适配/降级 | Devin 有 `/plan`，但是否返回 DSCode 结构要通过 ACP update 验证；无结构时显示文本。 |
| `plan/ask/auto/full` picker | 跳过原枚举，需适配 | Devin 模式是 normal/accept-edits/smart/plan/bypass/autonomous；由 `configOptions.mode` 驱动。 |
| `model`/`effort` 静态选择 | 跳过原枚举，需适配 | 模型频繁发布、Adaptive、企业 allowlist；使用动态 configOptions，隐藏不支持的 effort。 |
| DSCode provider/API key/base URL/login | 跳过 | 只有 Devin provider；认证和 endpoint 由 `devin auth`/ACP 管理，不复制 DeepSeek 表单。 |
| Core `pi-agent-core`/`pi-ai`/DeepSeek payload | 跳过 | ACP 已包含 Devin agent harness；DSCode Core RPC 不能处理 Devin 协议。 |
| local `exec_command`/`write_stdin`/managed process | 跳过 agent 工具实现，需适配展示 | Devin 负责命令执行；Desktop 仅显示 ACP terminal events。应用自有检查命令可独立实现。 |
| apply_patch 原子写入/checkpoint/diff/undo | 跳过原生 checkpoint | ACP 未证实提供 patch snapshot/restore；只提供只读 git diff，禁止声称可安全 undo。 |
| OS sandbox/network/credential stripping | 需适配 | 启动/配置 Devin `--sandbox` 与企业策略；DSCode 本地 sandbox 不应与 Devin 冲突。Windows sandbox 需提示不可用。 |
| project trust/AGENTS/CLAUDE | 需适配 | 由 Devin CLI project root/config/trust 读取；host 在启动前展示当前信任状态。 |
| MCP server/tools | 需适配/部分 UI | Devin CLI 自带 MCP 配置、OAuth、权限；Desktop 可展示 ACP 广告/状态，不再由 DSCode MCPManager 二次连接。 |
| Skills/rules | 需适配/部分 UI | 由 CLI 读取 `.devin`/`.agents`；可提供路径/重载入口，不在应用内解析执行。 |
| Hooks | 需适配/部分 UI | 由 CLI 生命周期执行；只能展示事件/错误，不能复制 DSCode hook runner。 |
| subagents | 需适配/默认隐藏 | 仅在 ACP 工具事件或命令广告可观测时显示；没有独立管理 API 时不实现 subagent 树、恢复或调度 UI。后台权限限制由 CLI 负责。 |
| `/handoff` 云接力 | 需适配/默认隐藏 | ACP 若广告该 slash command 可透传；未广告时隐藏。云 VM、browser、Secrets 不属于本地 Desktop provider。 |
| `/status` token/cost/cache | 需适配/降级 | 只显示 ACP session stats 或 CLI 输出；ACU/模型成本若未返回显示“不可用”。 |
| compact/auto compaction | 需适配 | 调用 ACP `/compact` 或命令广告；不在 app 重写上下文摘要。 |
| file preview inspector | 原样复制 | 完全本地、与 agent provider 无关；复制后仍执行 workspace containment。 |
| settings/profile/theme/language/reasoning | 原样复制 + 需适配 | 外观、个人资料和显示偏好原样保留；Devin agent 设置写入 CLI 配置需显式确认。 |
| personalization/system prompt | 跳过等价注入 | DSCode Core 的 system prompt 注入没有公开 ACP v1 等价接口；未来若转成 AGENTS/rule 写入，必须明确作用域并征得用户同意。 |
| terminal/TUI/JSONL CLI/VS Code entry | 跳过 | 产品明确 Desktop-only；ACP 是 Desktop 与 Devin 的唯一接口。 |
| Desktop packaging/update | 原样复制 + 需适配 | 复制 electron-builder 配置到当前仓库；MVP 检测用户独立安装的 `devin`。未取得再分发授权前不随包附带 CLI，也不自动替换 binary。 |
| 未接线的 Tetris 独立页面 | 跳过 | 它存在于构建入口但未连接主 Desktop UX，不属于 Coding Agent 功能。 |
| Knowledge/Playbooks/Secrets/Memories/Workflows/Code Lenses/App Deploys/Conversation Sharing/Arena | 跳过 | Devin Local 官方明确不支持或属于云/旧 Cascade 能力。 |

## 9. 建议目标架构与数据流

### 9.1 模块布局

```text
apps/desktop/src/main/
  index.ts                 # Electron 生命周期、窗口、IPC
  devin-acp-host.ts        # ACP 子进程、SDK connection、请求/通知
  devin-capabilities.ts    # initialize/configOptions/sessionCapabilities 归一化
  devin-auth.ts            # authenticate、browser/device UI relay
  devin-session-index.ts   # session summary + 本地 pin/archive/search 索引
  file-preview.ts          # 原 DSCode containment/preview protocol
apps/desktop/src/preload/
  index.ts                 # 仅暴露 typed DesktopApi
apps/desktop/src/shared/
  acp-types.ts             # SDK 类型别名 + unknown extension envelope
  types.ts                 # renderer IPC/UI contracts
apps/desktop/src/renderer/
  App.tsx                  # 尽量保留 DSCode 页面与布局
  lib/acp-conversation.ts  # ACP update → ChatMessage/ToolActivity
  lib/capability-ui.ts     # 动态模式/模型/图片/命令菜单
```

### 9.2 主进程生命周期

首版保持与 DSCode 相近的“一个活动 UI 会话对应一个 agent host”模型，不在同一进程中并发 multiplex 多个执行中会话；这能让取消、权限请求和事件归属保持单义。未来只有在 Devin ACP 明确支持并经契约测试后才增加多活动会话。

```text
app ready
  → locate devin binary / show install guidance
  → spawn `devin acp` (stdio)
  → initialize(v1)
  → authenticate if requested
  → discover configOptions + sessionCapabilities
  → list/load or new session
  → relay prompt/update/permission/terminal events
  → cancel；仅 capability 广告后 close，否则 terminate host
```

### 9.3 状态模型（建议）

```ts
type AgentConnectionState =
  | { kind: "stopped" }
  | { kind: "starting" }
  | { kind: "auth_required"; methods: string[] }
  | { kind: "ready"; capabilities: DevinCapabilities }
  | { kind: "error"; message: string; recoverable: boolean };

interface DevinCapabilities {
  protocolVersion: number;
  prompt: { image: boolean; audio: boolean; embeddedContext: boolean };
  session: {
    load: boolean;
    list: boolean;
    delete: boolean;
    resume: boolean;
    close: boolean;
    additionalDirectories: boolean;
  };
  modes: Array<{ id: string; name: string }>;
  configOptions: Array<{ id: string; type: string; currentValue: unknown; options?: unknown[] }>;
  extensions: Record<string, unknown>; // 保留 multiRootWorkspace 等未知扩展
}

interface ThreadState {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
  additionalDirectories?: string[];
  isLocked?: boolean;
  messages: ChatMessage[];
  pendingUi?: ExtensionUiRequest;
}
```

状态不变量：

1. 当前仓库是唯一源码与构建输入；删除或移动 `/Users/guozeling/workspace/git/dscode` 后，install、typecheck、test、build、pack 和运行结果不变。
2. renderer 永远不持有 Node/child process；所有 ACP、文件和外链操作在 main。
3. provider/model/mode/image 能力不由静态常量决定；UI 只能从 `DevinCapabilities` 渲染。
4. 每条 update 保留 `raw` 与 session/update id；未知扩展不丢弃。
5. 切换 session 前取消当前 prompt；只在广告 `session.close` 时调用它，否则终止当前 host 并为目标 session 重建连接。pending RPC 必须可拒绝且不会污染新 session。
6. 本地 SQLite 只索引 UI 线程字段；若 ACP 能够恢复完整历史，source of truth 仍是 Devin session，不生成互相冲突的第二份 transcript。

## 10. 关键实现机制

### 10.1 进程与 JSON-RPC

- 使用绝对路径 `devin`，默认从 PATH 发现，失败时提示安装；不要拼接 shell 命令。官方 ACP 配置要求 absolute command path。[`docs/devin-cli/acp/jetbrains.md:L77-L87`](../devin-cli/acp/jetbrains.md#L77-L87)
- spawn `{ command: devin, args: ["acp"], shell: false, stdio: ["pipe","pipe","pipe"] }`；stdout/stderr 分离，限制缓冲上限，记录退出码和 stderr。
- 使用锁定版本的官方稳定 v1 TypeScript ACP SDK；若 SDK 不覆盖 Devin 扩展，保留 JSON-RPC envelope 和 unknown map，不写自定义 TUI parser。[`@agentclientprotocol/sdk`](https://github.com/agentclientprotocol/typescript-sdk/tree/e6463f444093ed7c5f1cc937c3f32afb5853e906)
- 每个 request 有 request id、AbortSignal、超时；进程结束拒绝所有 pending，UI 显示可重连状态。可把 DSCode AgentHost 的 stop/timeout 结构复制进当前仓库，但必须删除其 command type/response schema 并改接 ACP。[`dscode/apps/desktop/src/main/agent-host.ts:L109-L173`](../../../dscode/apps/desktop/src/main/agent-host.ts#L109-L173)

### 10.2 PTY、终端与事件解析

- ACP server 本身是 stdio JSON-RPC，不要求把 `devin` TUI 放进 PTY；PTY 只在协议暴露终端生命周期且需要交互 shell 时考虑。
- 不以 ANSI 输出推导“消息/工具”；ACP SDK notification 是唯一权威。官方文档已说明 ACP host 的 shell rendering 与原生 TUI 不同。[`docs/devin-cli/acp/xcode.md:L134-L152`](../devin-cli/acp/xcode.md#L134-L152)
- 建议分层：`AcpTransport`（JSON-RPC）→ `AcpUpdateNormalizer`（typed known + raw unknown）→ `ConversationReducer`（当前仓库内复制并改造的 DSCode view model）。

### 10.3 会话与本地索引

- 首选 Devin session id；本地 SQLite 表保留 `id/session_id/cwd/title/updated_at/pinned/archived/locked`，不把 provider 写成可选多值。
- ACP `loadSession=true` 表明 host 可在重启后要求 CLI 加载会话；若 load 失败，保留侧栏条目但提示重新打开/新建。
- `additionalDirectories` 能力开启时，将 UI 的多根目录选择映射到 session/new；能力缺失时禁用多目录按钮。

### 10.4 文件、终端、Git

- 文件预览和 workspace containment 继续使用 DSCode main protocol；任何来自 agent 文本的路径必须先通过 `validPreviewPaths`，防止 `..` 或外部绝对路径。[`dscode/apps/desktop/src/main/index.ts:L219-L252`](../../../dscode/apps/desktop/src/main/index.ts#L219-L252)
- agent terminal 只读显示 ACP 生命周期；不要在 main 直接执行 agent 提议的命令。若产品要提供“复制命令/在系统终端打开”，必须另起明确用户动作。
- git branch/status/diff 可作为 Desktop 本地诊断命令，但不宣称等于 Devin 工具结果；命令应使用 argv、超时和取消，输出有上限。

### 10.5 模型、模式、权限与图片

- 模式用标准 `session/set_mode {sessionId, modeId}`，其他会话配置用 `session/set_config_option {sessionId, configId, value}`；菜单仍从 `session/new/load` 返回的 modes/configOptions 动态生成。切换前检查 session 是否 locked；若 Devin 实测拒绝某项写回，保持原值并显示协议错误，不静默新建会话。[ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/a26d13426cae7ede0c84d0ab7506ce9e5d01573b/schema/v1/schema.json)
- 每个模型的 `supportsImages` 决定 composer 图片按钮；不要沿用 DSCode “DeepSeek text-only”常量。
- 权限 UI 显示 Devin 模式与企业限制；对 `session/request_permission` 呈现 CLI 给出的 options 并返回用户选择/取消，DSCode `SessionAccessController`、`ApprovalController` 不应接管 Devin 工具。[`dscode/packages/core/src/access.ts:L12-L58`](../../../dscode/packages/core/src/access.ts#L12-L58) [`dscode/packages/core/src/approval.ts:L24-L84`](../../../dscode/packages/core/src/approval.ts#L24-L84)
- sandbox 启动参数必须与 capability/企业策略一致；若 `--sandbox` 失败，保持 fail-closed 并给出平台安装指引，不自动回退 host。

### 10.6 认证、设置与更新

- 认证 UI 把 DSCode prompt/notice 组件复制到当前仓库，但 provider 固定 Devin；`auth.status` 通过 ACP 或一次 `devin auth status` 结果，不读 token 文件。[`dscode/apps/desktop/src/renderer/App.tsx:L2269-L2317`](../../../dscode/apps/desktop/src/renderer/App.tsx#L2269-L2317)
- user/project config 由 Devin CLI 读取，层级和路径遵循官方文档；应用设置只存界面偏好，任何写 `.devin/config*.json` 的动作都要显示范围和重载提示。[`docs/devin-cli/reference/configuration/global-vs-local.md:L5-L29`](../devin-cli/reference/configuration/global-vs-local.md#L5-L29)
- “检查更新”可以打开 `devin update` 的确认流程；不在应用内下载并替换未知二进制。Devin CLI 自带 `devin update`。[`docs/devin-cli/reference/commands.md:L333-L345`](../devin-cli/reference/commands.md#L333-L345)
- Electron GUI 的 PATH 可能不同于交互 shell；binary discovery 顺序应为用户保存的绝对路径、官方常见安装路径、受控 PATH 查询，并用 `devin --version` + ACP initialize 验证。不得自动执行安装或更新。

## 11. 分阶段实施计划

### 阶段 0：协议与边界冻结

- 固定 ACP SDK 版本；记录 `initialize`、`session/list`、`session/new`、`session/load`、`session/delete`、`session/set_mode`、`session/set_config_option`、`session/prompt`、`session/cancel`、`session/request_permission`、updates 和 `authenticate` 的真实 request/response fixture。
- 在 macOS、Windows、Linux 记录 `devin --version`、登录状态、`--sandbox` 可用性、企业策略响应；所有探针标注版本与日期。
- 输出 capability matrix fixture，确认 extensions 是否稳定、哪些事件含文件 edit/terminal/tool details。

### 阶段 1：Desktop 壳与单会话

- 把 DSCode Electron main/preload/renderer、样式、资产、build/test/electron-builder 配置复制到当前仓库；立即删除所有指向 DSCode 路径、workspace package 和 `@thinkany/dscode-*` 的依赖，再改接本仓库模块。
- 实现 `DevinAcpHost`：binary discovery、spawn、initialize、authenticate、session/new、prompt、cancel；`session.close` 仅在 capability 广告时调用，否则以 host 生命周期隔离会话。
- 用 mock ACP server 做启动/失败/重连测试。

### 阶段 2：线程与消息流

- 接入 session/list/load/delete、title/cwd/locked/additionalDirectories；迁移 sidebar/search。pin/archive 若实现，作为明确的本地 UI overlay，不纳入基础 parity。
- 完成 ACP update normalizer 与 `conversation.ts` 适配；实现 streaming text/reasoning/tool/terminal/error。
- 引入本地 SQLite UI index，明确 Devin session 是会话真相。

### 阶段 3：动态模型、模式、图片和审批

- 由 modes/configOptions 渲染 model/mode；按 `supportsImages` 控制附件；分别通过 `session/set_mode` 和 `session/set_config_option` 写回并验证 CLI 响应。
- 显示 ACP auth/permission/command requests；加入 sandbox/enterprise policy 状态和平台限制。
- 不实现 DSCode 原子 patch checkpoint，先提供只读 diff。

### 阶段 4：扩展能力与 parity

- 读取并展示 CLI MCP/Skills/hooks/subagents/slash commands；只调用 CLI/ACP，不复制执行器。
- 适配 `/plan`、`/compact`、`/handoff` 等 ACP 广告命令；未广告的命令不显示。
- 恢复 DSCode settings/profile/theme、reasoning 显示、file inspector、command palette、empty suggestions；personalization 不作 system prompt 等价注入。

### 阶段 5：发布与迁移

- 把 electron-builder 多平台配置复制到当前仓库；完成 mac 签名/公证、Windows/Linux 安装包和用户已安装 `devin` 的检测。取得书面授权前不捆绑 CLI binary。
- 从旧 DSCode 设置迁移仅限外观/最近工作区/线程索引；不迁移 DeepSeek credential、provider/model static defaults 或 Core transcripts 到 Devin session。
- 建立崩溃诊断、日志脱敏、更新回滚、卸载保留/删除数据策略。

## 12. 测试策略

1. **协议单测**：用 fixture 覆盖 initialize、auth、session list/new/load/delete、set_mode、set_config_option、prompt、cancel、request_permission、标准 updates、unknown extension、malformed JSON、request timeout、child exit；断言 raw payload 不丢失。
2. **能力矩阵测试**：没有 `delete`/`resume`/`close`/`additionalDirectories`/`image`/`audio` 时，UI 必须隐藏对应动作或降级，不能发送未声明方法；模式/配置写回还要验证错误回滚。
3. **状态与 reducer 测试**：ACP streaming update 顺序、重复 update、tool start→update→end、session switch、locked session、进程重连、历史恢复。
4. **安全测试**：renderer 无 Node/fs；IPC 参数 schema；外链仅 http(s)；预览阻断 workspace 外路径；日志不含 token；agent binary 路径不经 shell；sandbox 失败不回退 host。
5. **UI/视觉测试**：参考 DSCode Desktop 关键视图截图，覆盖空状态、长输出、Markdown、图片、审批、错误、中文/英文、浅/深色、窄窗口 inspector。
6. **真实 CLI 集成**：在隔离临时仓库中执行登录状态、session 恢复、模型/模式切换、图片提示、计划、MCP/Skills/hook；按 CLI 版本记录，不能把单一版本结果当永久契约。
7. **跨平台/打包**：macOS arm64/x64、Windows x64、Linux x64；验证 Electron 内置 Node、绝对 binary discovery、sandbox 平台提示、签名/公证和卸载保留策略。
8. **独立性测试**：在未安装、未挂载 DSCode checkout 的干净 CI 环境运行 install/typecheck/test/build/pack；扫描 package manifest、lockfile、import、脚本、symlink 和产物 source map，禁止出现 DSCode 绝对路径、相对路径依赖、submodule 或 `@thinkany/dscode-*` runtime package。
9. **回归检查**：把 DSCode 关键页面作为截图/交互基线，增加 mock ACP server、契约 fixture、视觉回归和 E2E smoke；当前仅完成研究，未宣称这些检查已运行。

## 13. 代码复制与迁移策略

### 复制进当前仓库后保留或少量改名

- `apps/desktop/src/main/index.ts` 的窗口、安全协议、原生 dialog、recent workspaces、file preview、menu、生命周期结构。
- `src/preload/index.ts` 的 contextBridge 模式和 `src/shared/types.ts` 的 workspace/session/theme/file preview/settings 结构。
- renderer 的 sidebar、conversation layout、Markdown、tool row、settings、auth prompt、theme/i18n、file inspector CSS/组件；保留测试和可访问性修复。
- `conversation.ts` 的 ChatMessage/ToolActivity 数据结构、合并算法、图片/工具展示；增加 ACP→内部事件转换层。
- `state.ts` 的 SQLite index 思路和 search 查询；字段改为 Devin `sessionId` 并存 `locked/capabilities`。pin/archive 字段仅在产品决定新增本地 overlay 时保留。

复制完成后必须满足：源文件、CSS、assets、测试和构建配置都位于当前仓库；package manager 只解析当前仓库及公开依赖；代码中不得 import DSCode checkout，也不得用 symlink 保持联动。DSCode commit 仅记录在 `THIRD_PARTY_NOTICES`/迁移清单中，用于版权归属和后续人工对照。

### 不应复制

- `packages/core/src/providers.ts` 的 provider 表、DeepSeek defaults、API key env；目标只有 Devin。
- `packages/core/src/dscode-extension.ts`、`pi-agent-core`、`pi-ai`、DeepSeek response optimization、Core RPC entry；它们拥有另一套 agent/tool/provider 协议。[`dscode/packages/core/src/dscode-extension.ts:L125-L228`](../../../dscode/packages/core/src/dscode-extension.ts#L125-L228)
- `ManagedProcessRegistry`、`SessionAccessController`、`ApprovalController`、`MCPManager`、hook runner、subagent runner 的执行职责；Devin CLI 应继续拥有 agent tool/sandbox/policy。
- DSCode `apply_patch` checkpoint/undo 的“已安全恢复”承诺；ACP 无对应能力证据时只能显示 git diff。

### 数据迁移

- 迁移 `app-settings.json` 中语言、主题、profile、recent workspaces；personalization 只可作为未启用的本地文本迁移，不能自动注入 Devin。保留旧 `~/.dscode` 只读备份。
- 旧 DSCode thread 不能自动变成 Devin session，除非 ACP 明确提供导入上下文接口；默认在 UI 中隐藏旧 transcript 或标为“旧 DSCode 数据”，避免误认为 Devin 可恢复。
- 不迁移任何 API key、`auth.json`、DeepSeek base URL、静态 model/effort、Core RPC session 文件。

## 14. 风险与待验证项

| 风险/未知 | 影响 | 处理 |
|---|---|---|
| ACP 扩展字段/命名随 CLI 版本变化 | terminal lifecycle、sessionRename、documentLifecycle、megaplan 等可能不稳定 | 运行时 capability discovery；unknown passthrough；协议 fixture 按版本更新。 |
| session/load 与 `loadSession=true` 的精确语义 | 重启后历史可能无法恢复 | 阶段 0 用真实 CLI 验证；失败保留本地摘要并提供新会话。 |
| 标准 set_mode/set_config_option 与具体 Devin 选项的兼容性 | 某个版本或企业策略可能拒绝写回 | 使用标准方法并做真实 CLI fixture；失败回滚 UI、展示错误，不静默另开会话。 |
| ACP tool update 不一定包含文件 diff/命令输出完整内容 | WorkLog/preview 无法达到 DSCode 细节 | 先渲染结构化 metadata；缺失字段显式显示“详情由 Devin CLI 托管”。 |
| Devin CLI 自身已有 approvals/sandbox，应用再做一层会冲突 | 安全策略绕过或重复提示 | 只展示/透传 ACP 请求，不在 app 执行 agent 工具。 |
| `--sandbox` 在 Windows 不支持，Linux 依赖 bwrap/socat | 跨平台功能不对称 | 启动前检测、fail-closed、安装说明；不能静默降级。 |
| enterprise model/MCP/permission policies 高于本地配置 | UI 选项与执行结果不一致 | 把 CLI 返回的 allowed/denied 视为真相，显示“组织策略限制”。 |
| `devin` binary 未安装、PATH 与 GUI 环境不同 | Desktop 无法启动 provider | 提供绝对路径选择/安装引导；不要直接下载未验证二进制。 |
| Devin CLI 二进制再分发权未由已审阅文档授予 | 打包 CLI 可能形成许可/更新/供应链风险 | MVP 依赖用户独立安装；取得书面授权并完成签名、更新和 SBOM 方案后再评估捆绑。 |
| Auth credentials 是敏感文件 | 泄露账号/ACU 账单 | 不读取/复制 credentials.toml；日志脱敏；系统浏览器/ACP auth。 |
| ACP 不保证 DSCode checkpoints、fork/tree、steer、cost/cache、audio | UI parity 不完整 | 标为需适配/跳过；只有证实接口后才显示按钮。 |
| ACP v1 无任意 system prompt setter | DSCode personalization 不能语义等价迁移 | 首版不注入；未来若写 AGENTS/rule，必须由用户选择作用域并确认。 |
| 云 handoff/VM/browser/Secrets 与 Desktop-only 边界 | 用户误以为本地执行 | 仅在 ACP 广告 `/handoff` 时显示，并清楚标为云会话；不做云 provider。 |

## 15. 明确不做事项

- 不实现 DSCode Terminal/TUI、VS Code extension、独立 JSONL/CI/RPC CLI 或第二个 provider。
- 不实现 DeepSeek/OpenAI/Anthropic 等 provider、静态 provider credential store、DeepSeek API base URL、DeepSeek payload/cache/cost 优化。
- 不解析 Devin CLI TUI ANSI 输出，不从屏幕文本猜测消息、工具或权限；只使用 ACP JSON-RPC/官方 SDK。
- 不在 Desktop 内重写 Devin 的 agent tools、MCP client、Skills loader、hooks runner、subagent scheduler、sandbox 或企业 permission engine。
- 不提供无法由 ACP 证实的原子 patch checkpoint、无冲突 undo、运行中 steer、完整 tool diff、准确 token/cost/cache 报告。
- 不把 DSCode personalization 静默转成 Devin system prompt；公开 ACP 无等价 setter。
- 未取得 Devin CLI 二进制再分发授权前，不把 CLI 打入 Desktop 安装包，也不自动下载或替换它。
- 不实现 Devin Local 官方缺少的 Knowledge、Playbooks、Secrets、Memories、Workflows、Code Lenses、App Deploys、Conversation Sharing、Arena。
- 不承诺跨版本 ACP 扩展兼容；每个发行版必须记录支持的 CLI/ACP 版本和 capability fixture。

## 16. 交付判定

达到以下条件才可称为“完整 Devin Coding Agent（Desktop 版）”：

1. 在完全不存在 DSCode checkout 的干净环境中，可以独立 install、typecheck、test、build、pack 和启动；依赖、脚本、symlink、source map 与产物均不引用 DSCode 仓库或 `@thinkany/dscode-*` runtime package。
2. 已安装/已认证的 Devin CLI 可完成 ACP initialize、new/load session、prompt、cancel、权限请求、消息/工具流和关闭恢复；未广告 close 时能以 host 重启安全降级。
3. provider 无关页面通过 DSCode 基线截图与交互回归；除名称、品牌和已声明的 Devin 能力差异外，布局、样式、快捷键和状态反馈一致。
4. UI 的模型、模式、图片和 session 操作均由运行时 capability/modes/configOptions 控制；禁用能力不会产生错误 RPC，配置写回失败会回滚显示。
5. renderer 无 Node/fs，外链、预览路径、IPC 参数和日志 secret 通过安全测试。
6. macOS/Windows/Linux 的 binary、sandbox、安装包限制有明确诊断；Windows sandbox 不支持时不会回退未隔离执行。
7. 第 8 节所有“跳过”功能在产品文档和 UI 中有一致说明，用户不会把 Devin CLI 不具备的 DSCode 能力误认为已实现。
