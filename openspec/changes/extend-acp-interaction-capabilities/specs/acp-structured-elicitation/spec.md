## ADDED Requirements

### Requirement: 完整实现后才广告 elicitation 能力

Desktop MUST 仅在 form 或 URL 模式对应的 transport handler、生命周期管理、IPC、renderer UI 和响应校验均已启用时，才在初始化请求中广告该模式的 `clientCapabilities.elicitation`；任一环节不可用时 MUST 省略对应模式。

#### Scenario: form handler 完整时广告 form

- **WHEN** Desktop 构建 ACP initialize 请求且 form handler、UI 与响应路径均已启用
- **THEN** `clientCapabilities.elicitation.form` MUST 为显式空对象

#### Scenario: URL handler 不完整时省略 URL

- **WHEN** URL completion handler 或受控外链 UI 未启用
- **THEN** Desktop MUST NOT 广告 `clientCapabilities.elicitation.url`

### Requirement: form elicitation 支持 ACP primitive schema

Desktop SHALL 将 `elicitation/create` 的 form 请求按其 `requestedSchema` 渲染，支持 `string`、`number`、`integer`、`boolean`、字符串数组、required、默认值、枚举、单选、多选和数值边界，并在提交前按同一 schema 校验。

#### Scenario: ask_user_question 返回结构化答案

- **WHEN** Devin 发送 session-scoped form elicitation 且用户填写的值满足 schema
- **THEN** Desktop SHALL 返回 `action: "accept"` 和只含 schema 已定义字段的 `content`

#### Scenario: Plan 澄清包含必填选择

- **WHEN** form schema 包含 required 枚举字段而用户尚未选择
- **THEN** Desktop SHALL 阻止提交并显示该字段的可定位校验错误

#### Scenario: 用户明确拒绝回答

- **WHEN** 用户在有效 form elicitation 中选择拒绝
- **THEN** Desktop SHALL 返回 `action: "decline"` 且不附带表单 content

### Requirement: elicitation 保持原始 scope 关联

Desktop MUST 将每个 elicitation 与其 session scope、可选 `toolCallId` 或 request scope、ACP connection generation 和内部 `interactionId` 关联，并确保响应恰好完成原请求一次。

#### Scenario: MCP tool call 发起表单

- **WHEN** `elicitation/create` 同时包含 `sessionId` 和 `toolCallId`
- **THEN** Desktop SHALL 把交互展示在该 session，并将结果返回给同一 tool call 的原始 ACP 请求

#### Scenario: session 之外的请求发起 elicitation

- **WHEN** `elicitation/create` 使用 `requestId` scope
- **THEN** Desktop SHALL 保持 request scope，不得伪造 session ID 或附着到当前活动 session

#### Scenario: 迟到响应来自旧连接

- **WHEN** renderer 回答的交互属于已失效的 ACP generation
- **THEN** Desktop MUST 拒绝该响应，且不得完成新连接中的任何请求

### Requirement: URL elicitation 使用安全外链并等待完成

Desktop SHALL 只允许用户确认后通过系统浏览器打开不含 userinfo 的 `https:` URL，并保持请求待处理，直到收到相同 `elicitationId` 的 `elicitation/complete`。

#### Scenario: 有效 URL 完成交互

- **WHEN** 用户确认打开有效 HTTPS URL，随后 Agent 发送匹配 `elicitationId` 的 completion notification
- **THEN** Desktop SHALL 向原始 `elicitation/create` 返回 `action: "accept"`

#### Scenario: URL completion 不匹配

- **WHEN** Desktop 收到未知或不匹配的 `elicitationId`
- **THEN** Desktop MUST 保持现有请求未完成并记录脱敏诊断

#### Scenario: URL scheme 不安全

- **WHEN** URL 使用 `http:`、`file:`、自定义 scheme、包含 userinfo 或无法解析
- **THEN** Desktop MUST NOT 打开该 URL，并 MUST fail-closed 地取消交互

### Requirement: elicitation 生命周期可取消且不悬挂

Desktop SHALL 在用户取消、session 取消、窗口销毁、请求超时、Host 退出或 ACP generation 改变时清理待处理交互，并在协议允许时返回 `action: "cancel"`。

#### Scenario: session 在等待回答时被取消

- **WHEN** session-scoped elicitation 尚未回答而对应 session 被取消
- **THEN** Desktop SHALL 关闭该交互、返回取消结果并释放全部待处理状态

#### Scenario: 未知 mode 或畸形 schema

- **WHEN** `elicitation/create` 使用 Desktop 不理解的 mode、属性类型或矛盾 schema
- **THEN** Desktop MUST NOT 将其近似渲染为已知表单，并 SHALL 取消请求及记录脱敏诊断
