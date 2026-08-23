## 背景

Desktop 当前通过官方 ACP SDK 建立连接，但只注册 `session/request_permission` 请求与 `session/update` 通知；Host 也会拒绝除此之外的 agent→client 请求。SDK 1.4.0 已定义标准 `elicitation/create` 与 `elicitation/complete`，本地 Devin CLI 3000.5.20 的运行时 `_meta` 则广告 `editableCommands`、`commandRevision`、`chains` 和 `sessionRename`。实测只有客户端声明 `cognition.ai/chains` 后，Devin 才会动态广告 `/btw`。

当前会话重命名只更新 Desktop 的 session index，未调用 Devin 的 `_cognition.ai/session/rename`。permission 对话框也只返回既有 option，无法承载命令编辑或 revision。上述缺口共同导致 `ask_user_question`、Plan 澄清、MCP elicitation、可编辑审批、side-chat 和跨客户端标题同步不完整。

这次变更跨越 transport、Host、IPC、renderer 状态和多个交互 UI。安全边界保持不变：Devin CLI 是唯一执行器；Desktop 只协商、展示、校验和回传用户决策。

## 目标与非目标

### 目标

- 完整处理 ACP form/URL elicitation，使 `ask_user_question`、Plan 澄清和 MCP 交互可以获得结构化用户输入。
- 在 Devin 运行时广告相关能力时，提供可编辑命令审批和自然语言 command revision，并在执行前复核最终命令。
- 在具备完整链事件路由与 UI 后声明 `cognition.ai/chains`，让动态广告的 `/btw` 作为独立 side-chat 与主任务并行。
- 在 `sessionRename` 可用时调用原生 rename，并使本地 session index、侧栏和其他窗口与原生结果一致。
- 对所有新协议面采用显式白名单、运行时门控、严格校验和 fail-closed。

### 非目标

- 不在 Desktop 实现 agent、MCP tool、终端或文件操作执行逻辑。
- 不声明 ACP `fs`、`terminal` 或 MCP transport 能力，也不改变 Devin CLI 的认证和更新机制。
- 不提供任意 vendor method 的通用 renderer→ACP 透传接口。
- 不把浏览器 E2E、真实 shell 执行或真实 MCP 服务作为默认测试条件。
- 不扩展用户列出的四个 capability 之外的 Devin ACP 能力。

## 决策

### 1. 将“客户端已实现”与“Agent 已广告”分成两类门控

初始化 capability 由一个集中式构造器生成。标准 `clientCapabilities.elicitation.form/url` 和客户端扩展 `cognition.ai/chains` 只有在对应 transport handler、IPC、renderer 状态及 UI 均存在时才可加入初始化请求。`editableCommands`、`commandRevision`、`sessionRename` 等 Agent 能力则只从 initialize/session 的运行时响应归一化，不能由 Desktop 推断或补齐。

功能可用条件取两者交集：客户端实现就绪，且 Agent 广告所需能力或动态命令。初始化之后不可临时宣称一个未协商的客户端能力；实现配置变化需要重建 ACP 连接。

备选方案是直接把所有已知字段写入静态 capability 常量。该方案会在 handler 缺失或回归时诱使 Devin 发出无法完成的请求，因此不采用。

### 2. 使用统一的待处理交互 broker 管理 agent→client 请求

Transport 使用 ACP SDK 的 typed handler 注册 `elicitation/create`，并继续注册 permission 与 session update；URL 流程同时注册 `elicitation/complete`。Host 把 permission、elicitation 及其 vendor 元数据转换成显式联合类型，通过既有受控 IPC 交给 renderer。

broker 为每项交互分配 Desktop 内部 `interactionId`，保存 ACP 请求、session/request scope、可选 `toolCallId`、连接 generation 和完成状态。renderer 只使用 `interactionId` 回答，不接触任意 ACP method 名。每项交互只允许完成一次；session cancel、ACP 重连或退出、窗口销毁、请求超时都会产生协议允许的取消结果并清除状态。旧 generation 或未知 session 的响应一律拒绝。

这比为每个新对话框维护独立 Promise 更容易保证关联、取消和 exactly-once，也避免 permission 与 elicitation 互相覆盖。

### 3. form elicitation 严格按 ACP primitive schema 渲染和校验

form UI 支持 SDK schema 明确定义的 `string`、`number`、`integer`、`boolean` 和字符串数组，以及 required、默认值、枚举、单选/多选和数值边界。提交前使用共享纯函数按原始 schema 再校验一次，并仅构造 ACP 允许的 content 值。

用户提交返回 `action: "accept"` 与校验后的 `content`；明确拒绝返回 `decline`；因生命周期终止或客户端无法继续返回 `cancel`。未知 mode、未知属性类型、矛盾约束或畸形 schema 不得近似渲染为普通输入，而是 fail-closed 并留下脱敏诊断。

### 4. URL elicitation 由系统浏览器打开，并等待匹配的完成通知

URL UI 展示请求说明和目标 origin，只有可解析的 `https:` URL 才允许打开；不内嵌页面、不读取浏览器 cookie、不自行实现 OAuth。用户选择继续后由 Electron 的受控外链能力打开系统浏览器，请求保持待处理，直到收到相同 `elicitationId` 的 `elicitation/complete` 后返回 `accept`。用户拒绝返回 `decline`；窗口关闭、session 取消、超时或连接 generation 改变返回 `cancel`。

不接受 `http:`、`file:`、自定义 scheme、userinfo 或无法解析的 URL。未来如确需 loopback HTTP，必须另立变更并定义窄化规则。

### 5. 可编辑审批是现有 permission 流程的扩展，不是本地命令执行器

Host 保留 permission request 的原始 options、tool call 内容和 Devin vendor `_meta`，归一化为三种 renderer 行为：原有 option 选择、直接编辑候选命令、用自然语言描述 command revision。只有 Agent 运行时广告 `editableCommands` 或 `commandRevision` 时才显示对应入口。

编辑或 revision 只生成对当前 permission 的候选变更并回传给 Devin；Desktop 不运行、解析执行或代替 Devin 修改命令。Devin 返回修订后的最终命令后，UI 必须再次显示完整命令并要求显式批准，不能沿用第一次意图自动放行。broker 用原始 request/toolCall 身份和 revision 序号拒绝迟到或过期结果。

由于 vendor payload 不是标准 ACP schema，实施时先用已安装 Devin CLI 捕获并固化请求、revision 和最终复核的脱敏 fixture；类型守卫只接受 fixture 证实的字段。在该往返闭环测试通过前，初始化不能声明对应客户端扩展，UI 也不能显示入口。

### 6. `/btw` 通过动态命令调用，chain 状态与主对话隔离

完成 chain-aware normalizer、状态容器和 UI 后，客户端在 `clientCapabilities._meta` 声明 `cognition.ai/chains: true`。实测放在 initialize 顶层 `_meta` 不会启用 `/btw`。renderer 只有同时看到 Agent `chains` capability 和当前 session 动态命令列表中的 `/btw` 时才显示入口，并使用该命令的运行时名称、描述与 input hint 发起调用。

当前 Devin CLI 3000.5.20 使用 `session/prompt` 顶层 `_meta: {"cognition.ai/chain":"side"}` 发起并行请求，响应通知在 envelope `_meta` 回传相同标记；发送字面 `/btw` 不会创建 side-chain。因此 Host 只封装这一经 fixture 验证的参数，不在 renderer 暴露通用 vendor RPC。

conversation 状态按 `sessionId + chainId` 分区。带已知 chain 元数据的消息、tool call、状态和错误进入对应 side-chat；无 chain 元数据的事件继续进入主对话。side-chat 有独立的 streaming、stop reason、错误和关闭状态，关闭面板不取消主 prompt，side-chat 失败也不改变主任务状态。未知 chain 的事件保留脱敏诊断，不合并进主消息。

### 7. 原生 rename 成功后再确认为跨客户端标题

主进程提供专用、参数校验后的 rename 操作。若当前 Agent 运行时广告 `cognition.ai/sessionRename`，Host 调用显式白名单 `_cognition.ai/session/rename`，参数仅包含当前 session ID 与已校验标题。原生成功后再更新本地 session index 并向所有窗口广播；原生失败则回滚 optimistic UI、保留旧标题并显示错误，不能静默伪装成已同步。

能力未广告或 ACP 暂不可用时，保留现有本地 title overlay 作为降级，明确标记为 local source，使后续 session/list 或 load 不把它误判为服务端标题。下一次具备原生能力时不自动上传历史本地标题，避免未经用户确认覆盖 Devin 中的较新标题。

### 8. 测试以协议 fixture 和纯状态变换为主

Transport/Host 使用 mock ACP peer 验证 method 注册、响应形状、generation、取消和 capability 门控；renderer 使用纯 reducer/normalizer 测试 form 校验、approval revision、chain 隔离与 rename 回滚。使用脱敏 live fixture 补足 Devin vendor extension 的真实 wire shape，但测试运行不依赖已登录 Devin、真实 MCP、系统浏览器或 shell 执行。

## 风险与权衡

- **Vendor schema 变化**：`editableCommands`、`commandRevision`、`chains` 和 rename 使用 Devin 扩展，版本升级可能改变 payload。通过严格类型守卫、脱敏 fixture 和按字段 fail-closed 控制风险，代价是新版本可能暂时降级而不是猜测兼容。
- **多个阻塞交互竞争**：permission、form 和 URL 可能同时出现。统一 broker 保留全部请求，但 renderer 按到达顺序一次聚焦一个交互；未聚焦请求继续保持待处理并受超时控制。
- **URL 完成通知丢失**：系统浏览器完成后，ACP 连接可能断开。请求在 generation 改变时取消，不跨连接恢复，避免把旧完成事件配给新请求。
- **Side-chat 事件误分类**：链元数据缺失或未知时可能丢失可见输出。选择显示诊断而非污染主对话；fixture 测试覆盖当前 Devin 事件形状。
- **本地与原生标题分叉**：离线降级允许短暂分叉。来源标记和“原生成功后更新”的顺序保证不会把本地成功误报成跨客户端成功。

## 迁移计划

1. 先增加不广告任何新能力的 wire types、type guards、broker 和 mock fixture。
2. 完成 form/URL handler、IPC、UI 与单元测试后，才在客户端 capability 构造器中启用 `elicitation.form/url`。
3. 完成 editable approval 的真实 fixture、往返 handler 和最终复核后，再开放 Agent capability-gated 入口。
4. 完成 chain normalizer、状态与 side-chat UI 后，才声明 `cognition.ai/chains`；验证 `/btw` 确由动态命令列表出现。
5. 最后接入原生 rename；保留本地 overlay 数据，不做破坏性迁移。
6. 若发布后发生协议不兼容，可分别关闭 elicitation、chains 或 vendor approval 的客户端声明；未协商能力继续 fail-closed。

## 实施阶段确认的协议事实

- Devin CLI 3000.5.20 的 permission `toolCall._meta["cognition.ai/editableCommand"]` 是完整命令字符串；编辑后的 permission response 使用 `_meta["cognition.ai/updatedInput"]` 回传候选命令。
- 自然语言修订调用 `_cognition.ai/command/revise`，参数为 `{sessionId, command, note}`，成功响应为 `{command}`；Desktop 的 revision 序号仅用于拒绝本地迟到响应，不进入 vendor RPC。
- chain 声明位于 `clientCapabilities._meta`，side prompt 与通知使用 `cognition.ai/chain: "side"`。未知值只进入脱敏诊断。
- `_cognition.ai/session/rename` 参数为 `{sessionId,title}`；若成功响应未返回规范化 title，则以用户提交值作为成功后的本地镜像，但仍以 RPC 成功作为提交点。
