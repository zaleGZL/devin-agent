## 为什么

当前 Desktop 只处理 `session/request_permission` 与 `session/update`，没有声明或处理 Devin CLI 已支持的结构化 elicitation、可编辑命令审批、`chains` side-chat 和原生会话重命名，导致 Plan 澄清、MCP 交互、命令修订、并行问答与会话标题同步在 ACP 宿主中不完整。Devin CLI 3000.5.20 已通过标准 ACP schema、运行时 capability 与动态命令广告这些能力，现在可以在不引入第二执行器的前提下补齐客户端交互层。

## 变更内容

- 实现 ACP `elicitation/create` 的 form 与 URL 模式，并将请求、取消和响应按 session、tool call 或原始 request 关联。
- 在完整 handler 可用后，按运行时真实支持情况声明 `clientCapabilities.elicitation.form/url`。
- 扩展 permission UI 以支持 Devin 广告的 `editableCommands` 与 `commandRevision`，允许用户编辑候选命令或描述修改要求，并在执行前重新确认最终命令。
- 实现 `cognition.ai/chains` 协商与 `/btw` side-chat，将并行链的消息、状态和错误隔离到独立 UI，同时保持主任务继续运行。
- 将仅写入本地 session index 的重命名升级为 capability-gated 的原生 ACP rename，并保留断线时的本地展示降级。
- 所有新增请求继续显式白名单和 fail-closed；Desktop 不声明 `fs`/`terminal`，不执行 Devin 的文件、工具或终端操作。

## 能力范围

### 新增能力

- `acp-structured-elicitation`：定义 form/URL elicitation 的协商、呈现、响应、取消和安全边界。
- `acp-editable-approval`：定义可编辑命令审批、自然语言 command revision、最终命令复核与权限关联。
- `acp-chain-sidechat`：定义 `cognition.ai/chains` 协商、`/btw` 可用性和 side-chat 事件隔离。
- `acp-native-session-rename`：定义运行时能力门控的原生会话重命名与本地降级一致性。

### 修改能力

无。仓库目前没有主 OpenSpec capability，本变更仅新增上述契约。

## 影响范围

- ACP wire types、初始化 capability、SDK client request/notification 注册与 Host 路由。
- Electron main/preload IPC、renderer 对话状态、permission/elicitation 对话框、命令面板和会话侧栏。
- ACP mock fixtures、Host/transport/runtime adapter、normalizer、renderer reducer 与 UI 单元测试。
- 不新增第二执行器，不读取 Devin credentials，不静态假设 vendor capability，也不将浏览器 E2E 作为默认验收条件。
