## ADDED Requirements

### Requirement: 动态模型与模式
系统 SHALL 从当前 session 的 modes 和 configOptions 构建模型及模式选择器，并 MUST NOT 硬编码 DSCode provider、模型或 `plan/ask/auto/full` 枚举。

#### Scenario: 企业模型 allowlist 变化
- **WHEN** Devin CLI 返回的可选模型集合发生变化
- **THEN** UI 只显示当前返回的模型并保留服务端 current value

### Requirement: Sandbox 和权限政策归 Devin
系统 SHALL 把 Devin CLI 返回的 sandbox、permission 和企业策略结果作为最终真相，且 MUST NOT 使用 DSCode sandbox 或 approval engine 覆盖它们。

#### Scenario: Sandbox 启动失败
- **WHEN** 用户请求 sandbox 但 CLI 因平台或依赖失败
- **THEN** 系统 fail-closed 并显示具体限制
- **THEN** 系统不自动回退到未隔离执行

### Requirement: 扩展执行权归 Devin CLI
系统 MUST NOT 在 Desktop 中二次执行 MCP、Skills、Rules、Hooks、Plugins 或 Subagents。系统 SHALL 只显示 ACP 或 CLI 公开接口确认的状态、命令和事件。

#### Scenario: CLI 加载 MCP 工具
- **WHEN** Devin 通过 ACP tool update 暴露 MCP 工具活动
- **THEN** Desktop 渲染该活动
- **THEN** Desktop 不建立第二个 MCP client 执行同一工具

### Requirement: Subagent 能力降级
系统 SHALL 只在 ACP 命令或事件可观测时显示 Subagent 活动；没有独立管理 API 时 MUST NOT 提供 subagent 树、恢复或调度控制。

#### Scenario: 只有工具事件可用
- **WHEN** ACP 只返回 subagent 相关 tool updates
- **THEN** UI 把它们显示为工具活动
- **THEN** UI 不显示无法工作的独立管理按钮

### Requirement: Handoff 云边界
系统 SHALL 只在运行时广告 `/handoff` 时提供入口，并 SHALL 明确标记该操作会转入云 Devin 会话。

#### Scenario: 用户启动 Handoff
- **WHEN** `/handoff` 已广告且用户确认执行
- **THEN** 系统通过 ACP/命令接口提交请求
- **THEN** UI 明确提示后续能力和执行环境属于云端

### Requirement: 不支持能力必须隐藏或说明
系统 MUST NOT 宣称支持 ACP 未证实的原子 checkpoint/undo、运行中 steer、任意 system prompt personalization、完整 tool diff、准确 token/cost/cache 或 audio 输入。

#### Scenario: 用户查看功能说明
- **WHEN** 某项 DSCode 功能没有当前 Devin 能力映射
- **THEN** UI 隐藏对应控制或显示明确的不可用原因
- **THEN** 产品文档与 UI 状态保持一致

### Requirement: Personalization 不得静默注入
系统 SHALL 保留 profile 等本地显示偏好，但 MUST NOT 把 DSCode personalization 文本静默写成 Devin system prompt、AGENTS 或 rule。

#### Scenario: 迁移旧 personalization
- **WHEN** 本地存在旧 personalization 文本
- **THEN** 系统最多将其作为未启用的本地数据保留
- **THEN** 未经用户选择作用域和确认不会影响 Devin 行为
