## ADDED Requirements

### Requirement: Prompt composer
系统 SHALL 提供文本 composer、发送、取消、快捷键和上下文卡片，并 SHALL 只在 prompt 与当前模型均广告图片能力时允许图片附件。

#### Scenario: 发送文本和图片 prompt
- **WHEN** 当前 session 和模型支持图片且用户提交文本与有效图片
- **THEN** 系统把对应 ACP content blocks 发送到当前 session
- **THEN** composer 进入运行中状态并提供取消操作

#### Scenario: 模型不支持图片
- **WHEN** 当前模型没有 `supportsImages`
- **THEN** 系统隐藏或禁用图片附件入口并说明原因

### Requirement: 标准 ACP update 渲染
系统 SHALL 归一化并渲染 `user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update` 和 `usage_update`。

#### Scenario: 流式 Agent 回复
- **WHEN** ACP 连续发送 assistant message chunks 和 tool updates
- **THEN** 系统按 update 顺序合并 assistant 内容
- **THEN** 工具活动以可折叠状态卡片显示开始、更新和结果

### Requirement: 未知事件可诊断
系统 SHALL 为未知或暂不支持的 update 保留 raw payload、sessionId、updateId 和时间戳，并 SHALL 不静默丢弃事件。

#### Scenario: 收到未知 update
- **WHEN** Devin CLI 发送当前 normalizer 不认识的事件
- **THEN** 系统记录脱敏后的 raw envelope 并显示未识别活动占位
- **THEN** 后续已知事件继续正常处理

### Requirement: Reasoning 和计划显示
系统 SHALL 根据本地显示偏好呈现或隐藏 Agent thought，并 SHALL 在 ACP 提供结构化 plan 时显示步骤状态；没有结构化 plan 时只能显示 Devin 返回的文本。

#### Scenario: 用户隐藏 reasoning
- **WHEN** 用户关闭 reasoning 显示且 ACP 发送 thought chunks
- **THEN** 系统保留会话处理所需状态但不在对话视图展开 thought 内容

### Requirement: 权限请求交互
系统 SHALL 把 `session/request_permission` 的候选项显示给用户，并 SHALL 把用户选择或取消返回 Devin CLI。系统 MUST NOT 自行执行被请求的工具。

#### Scenario: 用户批准一个候选项
- **WHEN** CLI 请求权限且用户选择其中一个有效 option
- **THEN** main 把对应 option id 返回 ACP
- **THEN** 后续工具执行结果仅来自 Devin CLI update

#### Scenario: 用户取消权限请求
- **WHEN** 用户拒绝或关闭权限对话框
- **THEN** 系统向 ACP 返回取消结果并保持会话可继续

### Requirement: 取消和 follow-up 降级
系统 SHALL 支持取消当前 prompt。由于 ACP v1 没有标准 steer，系统 MUST NOT 并发发送第二个 prompt 冒充运行中 steering。

#### Scenario: Agent 运行期间输入后续要求
- **WHEN** 当前 prompt 未结束且用户输入 follow-up
- **THEN** 系统只允许排队该输入或要求用户先取消当前 prompt
- **THEN** 系统不向同一 session 并发发送第二个 prompt

### Requirement: 动态命令体验
系统 SHALL 只展示 `available_commands_update` 或其他已广告来源提供的 slash commands，并 SHALL 隐藏未广告命令。

#### Scenario: Handoff 未被广告
- **WHEN** 当前 session 的命令列表不包含 `/handoff`
- **THEN** command palette 不显示 Handoff 操作

### Requirement: 安全的本地文件入口
系统 SHALL 将 Agent 输出中的候选路径交给 main 的预览 containment 校验，且 MUST NOT 因文本包含路径而直接读取工作区外文件。

#### Scenario: Agent 输出外部绝对路径
- **WHEN** assistant 消息包含工作区外绝对路径
- **THEN** 系统不把该路径变成可直接读取的预览入口
