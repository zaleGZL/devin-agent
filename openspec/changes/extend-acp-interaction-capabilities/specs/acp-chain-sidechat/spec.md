## ADDED Requirements

### Requirement: 完整 chain handler 可用后才声明 chains

Desktop MUST 仅在 chain 事件归一化、隔离状态、side-chat UI、错误处理和生命周期测试均已启用时，才在 `clientCapabilities._meta` 中声明 `cognition.ai/chains: true`。

#### Scenario: chain UI 尚未启用

- **WHEN** Desktop 构建 initialize 请求而任一 chain handler 环节不可用
- **THEN** `clientCapabilities._meta` MUST NOT 包含有效的 `cognition.ai/chains` 声明

#### Scenario: chain 闭环完整

- **WHEN** chain handler、状态与 UI 均已启用并通过契约测试
- **THEN** Desktop SHALL 声明 `cognition.ai/chains: true`

### Requirement: `/btw` 可用性由协商能力与动态命令共同决定

Desktop SHALL 仅在当前 Agent 广告 `chains` 且当前 session 的动态命令列表包含 `/btw` 时显示 side-chat 入口，并使用动态命令元数据发起请求。

#### Scenario: 协商后 `/btw` 被广告

- **WHEN** Desktop 已声明 chains，Agent 广告 `chains` 且 session 命令列表包含 `/btw`
- **THEN** Desktop SHALL 显示 `/btw` 入口及 Agent 提供的 description/input hint

#### Scenario: 命令未被广告

- **WHEN** Agent capability 含 `chains` 但当前 session 命令列表不含 `/btw`
- **THEN** Desktop MUST 隐藏或禁用 side-chat 入口，且不得构造私有替代调用

### Requirement: side-chat 与主任务并行且互不取消

Desktop SHALL 通过 Agent 动态广告的 `/btw` 命令发起 side-chat，并同时发送已协商的 `cognition.ai/chain: "side"` 元数据，不取消、暂停或替换正在运行的主 prompt。

#### Scenario: 主任务运行时发送 side question

- **WHEN** 主 prompt 正在 streaming 且用户提交有效 `/btw` 问题
- **THEN** Desktop SHALL 保持主 prompt 运行，并同时显示独立 side-chat 的进行状态

#### Scenario: 用户关闭 side-chat 面板

- **WHEN** side-chat 尚在运行且用户关闭其面板
- **THEN** Desktop MUST NOT 因此取消主 prompt；是否取消 side chain SHALL 只遵循 Agent 已广告的链生命周期能力

### Requirement: chain 输出按 session 与 chain 身份隔离

Desktop MUST 按 `sessionId + chainId` 归一化和存储 chain 消息、tool call、状态、stop reason 与错误；带 chain 身份的事件不得追加到主对话。

#### Scenario: side-chat 与主回答交错 streaming

- **WHEN** 相同 session 的主消息 chunk 与已知 chain chunk 交错到达
- **THEN** Desktop SHALL 分别保持两条流的顺序，主对话只显示主 chunk，side-chat 只显示对应 chain chunk

#### Scenario: side-chat 失败

- **WHEN** 某个 chain 返回错误或失败 stop reason
- **THEN** Desktop SHALL 只将该 chain 标记为失败，主任务状态与已渲染内容保持不变

#### Scenario: chain 身份未知

- **WHEN** session update 声称属于 chain 但无法解析稳定 `chainId`
- **THEN** Desktop MUST NOT 把该事件合并到主对话，并 SHALL 记录脱敏诊断

### Requirement: chain 能力按连接和 session 刷新

Desktop SHALL 在 ACP 重连、session load 或命令列表更新时重新计算 `/btw` gate，不能沿用旧连接或其他 session 的 capability。

#### Scenario: 新 session 不支持 `/btw`

- **WHEN** 用户从支持 `/btw` 的 session 切换到未广告该命令的 session
- **THEN** Desktop SHALL 隐藏新入口，同时保留旧 session 已完成 side-chat 的只读展示

#### Scenario: ACP 连接重建

- **WHEN** 当前 ACP generation 结束
- **THEN** Desktop SHALL 终止该 generation 的 active chain 状态，并等待新 initialize/session 响应后重新门控
