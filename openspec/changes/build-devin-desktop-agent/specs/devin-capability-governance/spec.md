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

### Requirement: 不提供无效的 Personalization 控制
系统 SHALL 保留 profile 等确实影响 Desktop 展示的本地偏好，但 MUST NOT 暴露无法影响 Devin 的回复风格、自定义指令或 system prompt personalization 设置。

#### Scenario: 迁移旧 personalization
- **WHEN** 本地存在旧 personalization 文本
- **THEN** 系统不读取、不展示，也不通过 ACP、AGENTS、rule 或 system prompt 发送该文本
- **THEN** 旧值可作为惰性数据保留，以避免升级时擅自销毁用户曾输入的文本

### Requirement: Devin CLI 版本检查与显式更新

系统 SHALL 在用户打开模型设置页时，从固定的 Devin 官方 release manifest 查询最新版本，并 SHALL 使用数值版本比较判断当前 `devin --version` 是否落后。系统 MUST NOT 在没有用户操作时启动更新。

#### Scenario: 当前版本已是最新

- **WHEN** 当前版本大于或等于官方 manifest 的版本
- **THEN** UI 显示“已是最新版本”
- **THEN** UI 不显示更新按钮

#### Scenario: 检测到新版本

- **WHEN** 当前版本小于官方 manifest 的版本
- **THEN** UI 显示最新版本和更新按钮
- **THEN** 用户点击更新后，main 停止当前 ACP 并调用本机二进制的官方 `devin update`
- **THEN** 更新完成后系统重新执行 `devin --version`，只有达到目标版本才报告成功并重建 ACP

#### Scenario: 检查或更新失败

- **WHEN** manifest 不可访问、返回无效数据，或官方 updater 未完成更新
- **THEN** UI 显示可重试错误
- **THEN** 系统保留原有 CLI 路径，不自行下载或覆盖二进制，也不把旧版本标记为最新
