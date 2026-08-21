## Context

当前仓库只有 Devin CLI 官方文档镜像、研究报告和 OpenSpec 初始化文件，没有应用源码。目标是把 `/Users/guozeling/workspace/git/dscode` 中 provider 无关的 Desktop 源码、样式、资产、测试和构建配置复制到当前仓库，实现相同的桌面信息架构与交互，同时彻底移除 DSCode Core、多 provider 和 DeepSeek 假设。

Devin CLI 是唯一 Agent runtime。Desktop 通过 `devin acp` 的 stdio JSON-RPC 与其通信；模型、模式、权限、会话和扩展能力均以运行时协议结果为准。当前实机快照为 Devin CLI `3000.4.25`、ACP v1，但版本快照不构成静态产品契约。

关键约束包括：当前仓库必须独立构建；renderer 不得获得 Node 权限；Devin CLI 二进制由用户独立安装；企业策略和 Devin sandbox 优先于应用设置；没有 ACP 等价能力的 DSCode 行为必须隐藏或降级。

## Goals / Non-Goals

**Goals:**

- 在当前仓库建立独立的 Electron、React、TypeScript、Vite、Vitest、electron-builder 工程。
- 原样移植 DSCode provider 无关的 Desktop 布局、样式、组件和交互，并保留安全 main/preload/renderer 分层。
- 用官方 ACP TypeScript SDK 实现唯一的 `DevinAcpHost`，覆盖认证、会话、prompt、cancel、权限请求、模式和配置写回。
- 把标准 ACP update 和 Devin 扩展事件归一化为稳定的内部会话模型，同时保留未知 payload。
- 让 Devin session 成为 transcript 事实来源，本地状态仅存工作区与 UI 索引。
- 对模型、模式、图片、命令、会话操作和扩展入口实施运行时 capability gating。
- 建立零 DSCode 依赖、第三方许可、外部 Devin CLI、跨平台构建与最窄静态验证约束。

**Non-Goals:**

- 不实现 DSCode Terminal/TUI、VS Code extension、headless CLI 或第二个 provider。
- 不复制 DSCode Core、provider routing、DeepSeek payload、agent tools、MCP runner、hook runner、subagent scheduler、sandbox 或 permission engine。
- 不解析 Devin TUI/ANSI 输出，也不通过 PTY 推断消息和工具状态。
- 不伪造 ACP 未提供的 checkpoint/undo、运行中 steer、任意 system prompt personalization、完整 diff 或精确成本数据。
- 不默认实现浏览器 E2E、截图验收或真实浏览器自动化；验证优先使用 typecheck、unit test、build、pack 和完整性扫描。
- 未获得书面再分发授权前，不捆绑、下载或自动替换 Devin CLI 二进制。

## Decisions

### 1. 复制 DSCode Desktop 子集，而不是引用 DSCode

把所需文件复制到本仓库的 `apps/desktop` 及相关本地 package，随后修改 import、包名、品牌和 Agent 接口。仓库保存 DSCode 来源 commit 与 MIT notice，但 package manifest、lockfile、脚本、symlink、source map 和产物不得引用 DSCode checkout 或 `@thinkany/dscode-*` runtime package。

选择该方案是因为用户要求 UI 和交互一致且目标项目必须独立。替代方案包括 git submodule、workspace path dependency 或发布 DSCode package；它们都会形成外部源码或发布依赖，因此拒绝。

### 2. 保留 DSCode Desktop 分层，替换 Core 边界

保留 Electron main、context-isolated preload、React renderer 和 shared types 四层。main 继续拥有窗口、文件系统、原生 dialog、外链、子进程、持久化和协议连接；preload 只暴露经过 schema 校验的 typed IPC；renderer 只处理视图状态。

删除 `AgentHost → DSCode Core RPC`，改为 `DevinAcpHost → devin acp`。不把 Devin 实现塞进 DSCode provider 表，因为两者的会话、工具、权限和事件协议不同。

### 3. 使用官方 ACP SDK，禁止 TUI 解析

锁定 `@agentclientprotocol/sdk` 版本，由 SDK 处理稳定 ACP v1 transport 和标准类型。`DevinAcpHost` 以绝对路径、`shell: false`、`args: ["acp"]` 启动子进程，分离 stdout/stderr，并为所有 pending request 提供超时、取消和进程退出拒绝。

已知标准 update 转换为内部 `AgentEvent`；Devin `_meta` 和未知事件以 raw envelope 保留。替代方案是自写 JSON-RPC 或解析 TUI；前者增加协议偏差，后者没有稳定契约，均不采用。

### 4. 一个活动 UI 会话对应一个 ACP host

首版只允许一个正在执行的活动 UI 会话。切换线程前先 `session/cancel`；只有 runtime 广告 `session.close` 时才调用 close，否则终止当前 host，重新启动并 load 目标 session。这样权限请求、流式事件和取消结果始终具有唯一归属。

同一 host multiplex 多个执行中会话可降低进程开销，但当前 Devin 快照没有提供足够稳定的 close/resume 语义，因此暂不采用。

### 5. 能力和配置完全动态化

initialize、session/new 和 session/load 返回的 prompt capabilities、session capabilities、modes、configOptions、available commands 和 `_meta` 是 UI 唯一真相。模式通过 `session/set_mode` 写回，其他配置通过 `session/set_config_option` 写回；失败时 UI 回滚，不静默新建会话。

模型列表、`supportsImages`、企业 allowlist 和 Devin 模式不得硬编码。稳定的内部 capability model 只做归一化，不把一次实机探针固化为产品常量。

### 6. Devin session 是会话事实来源

本地 SQLite 只保存 `sessionId`、cwd、title、updatedAt、locked hint、最近工作区、搜索和可选 UI overlay，不保存第二份完整 transcript。打开线程时通过 ACP load 获取历史；失败时保留摘要并显示可恢复错误。

DSCode JSONL 与 Devin session 没有可证实的导入协议，因此不自动迁移旧 transcript。

### 7. ACP update 先归一化，再进入复制后的 conversation reducer

新增 `AcpUpdateNormalizer`，覆盖 user/agent message chunk、thought、tool call/update、plan、available commands、current mode、config option、session info 和 usage。归一化层生成内部稳定事件，复制后的 DSCode conversation reducer 继续负责合并消息、工具卡片和 reasoning 展示。

未知事件保留 raw、sessionId、updateId 和时间戳，并显示可诊断占位，而不是静默丢失。

### 8. 权限请求由用户作答，执行政策仍归 Devin

main 接收 `session/request_permission`，将 CLI 提供的 options 通过 IPC 发送给 renderer，并把用户选择或取消返回 CLI。Desktop 不运行被审批工具，也不复刻 DSCode ApprovalController。

Devin sandbox、permission rules 和企业策略具有最终决定权；UI 只显示实际状态和拒绝原因。

### 9. provider 无关 UI 原样移植，provider 相关控件能力化

工作区、侧栏、composer、Markdown、tool row、file inspector、settings、theme、i18n、command palette 和账户提示使用复制到当前仓库的 DSCode 实现。原 provider picker 收敛为 Devin；模型、模式、图片、命令和会话动作按能力显示。

DSCode personalization 依赖 Core system prompt 注入，而 ACP v1 没有等价 setter，因此首版不注入。运行中 steer 同样没有标准方法，执行期间 composer 只允许排队或显式取消后发送。

### 10. CLI 扩展和 sandbox 不在 Desktop 重复执行

MCP、Skills、Rules、Hooks、Plugins、Subagents 和 Handoff 继续由 Devin CLI 加载与执行。Desktop 仅显示 ACP 广告的命令、工具或状态；未广告时隐藏。`/handoff` 必须标记为云会话，不得让用户误认为仍在本地执行。

### 11. Devin CLI 作为外部受管依赖

发现顺序为用户保存的绝对路径、官方常见安装路径、受控 PATH 查询；候选路径通过 `devin --version` 和 ACP initialize 验证。找不到或版本不兼容时显示诊断和官方安装指引。

应用不读取 credential 文件，不自动安装或更新 CLI。该选择规避未经证实的二进制再分发权、签名、更新和供应链责任。

### 12. 验证优先采用最窄静态和进程级检查

使用 TypeScript typecheck、lint、Vitest、mock ACP server 契约测试、build、electron pack 和依赖完整性扫描。协议 fixture 覆盖 capability 缺失、未知事件、timeout、child exit 和配置回滚。只有后续规范明确要求真实 UI 自动化时才增加最小范围浏览器/Electron E2E。

## Risks / Trade-offs

- [Devin ACP 扩展随版本变化] → 锁定 SDK、记录 CLI fixture、动态发现 capability、保留 unknown payload，并对支持版本设下限。
- [复制 DSCode 后产生长期分叉] → 记录来源 commit 和迁移清单；复制后由本仓库测试保护，不建立自动同步依赖。
- [ACP update 细节少于 DSCode Core] → 明确降级文案，只展示协议真实提供的信息，不伪造 tool diff 或成本。
- [session load/close 在不同 CLI 版本不一致] → capability gating；无 close 时终止 host，无 load 时保留摘要并提供新建会话。
- [企业策略导致 UI 选择失效] → CLI 响应为最终真相，写回失败时回滚并展示组织策略提示。
- [GUI PATH 找不到已安装 CLI] → 支持绝对路径选择和常见安装位置探测，不通过 shell profile 猜测。
- [Windows 无 Devin OS sandbox] → 启动前显示平台限制；请求 sandbox 时 fail-closed，不回退未隔离执行。
- [本地 UI 索引与 Devin session 元数据漂移] → 每次 list/load 以 Devin 返回值刷新，local store 只保存 UI overlay。
- [MIT 归属遗漏] → 在复制清单和 `THIRD_PARTY_NOTICES` 中记录来源、commit 和许可证，并加入完整性检查。

## Migration Plan

1. 初始化 pnpm workspace 和 Desktop 构建骨架，复制 DSCode Desktop 文件、依赖声明、测试、样式和资产。
2. 增加来源清单与 MIT notice，删除所有 DSCode 路径、workspace、package、symlink 和 Core import。
3. 先以 mock ACP server 建立 `DevinAcpHost`、typed IPC 和单会话 happy path，再接入真实 CLI fixture。
4. 迁移 conversation reducer、工作区、file preview、设置、主题和侧栏，逐一用能力门禁替换 provider 假设。
5. 接入 session list/load/delete、permission request、modes/configOptions、commands 和扩展状态。
6. 完成 typecheck、unit/contract test、build、pack、依赖扫描和在无 DSCode checkout 环境的独立性验证。
7. 分平台验证 CLI discovery、sandbox 诊断、签名/公证和安装包；未满足的平台不发布。

回滚以阶段提交为单位：ACP runtime 与 UI 复制分开落地；若真实 CLI 集成阻塞，保留可构建 Desktop 壳和 mock provider 测试，不恢复 DSCode Core 依赖。

## Open Questions

- 首个正式版本支持的 Devin CLI 最低版本和 SDK 精确版本需要在实现阶段用 fixture 固定。
- Devin CLI 二进制再分发权、品牌使用规则和发布签名责任需要产品/法务确认；确认前保持外部安装模式。
- pin/archive 是否作为本地 UI overlay 对外开放，还是保持 DSCode 当前 renderer 仅有搜索的实际行为，需要产品确认。
- Windows 在无 OS sandbox 的情况下允许哪些非 sandbox 模式，需要结合发布安全策略确认。
