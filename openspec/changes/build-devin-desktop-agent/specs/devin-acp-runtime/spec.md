## ADDED Requirements

### Requirement: Devin CLI 发现与验证
系统 SHALL 只使用用户独立安装的 Devin CLI，并 SHALL 通过绝对路径执行 `devin --version` 和 ACP initialize 验证候选 binary。

#### Scenario: 找到有效 CLI
- **WHEN** 用户配置路径或受控发现流程找到可执行的 `devin`
- **THEN** 系统验证版本和 ACP 握手后进入 ready 状态

#### Scenario: CLI 不可用
- **WHEN** 找不到 binary、版本不兼容或 ACP initialize 失败
- **THEN** 系统进入可诊断错误状态并提供官方安装或路径选择指引
- **THEN** 系统不自动下载或替换 binary

### Requirement: 安全 ACP 子进程
系统 SHALL 在 Electron main 中以绝对 command、`args: ["acp"]`、`shell: false` 和独立 stdio pipes 启动 Devin ACP，并 SHALL 在进程退出时拒绝全部 pending request。

#### Scenario: ACP 进程异常退出
- **WHEN** Devin ACP 在请求完成前退出
- **THEN** 所有 pending request 以可识别错误结束
- **THEN** UI 显示可重连状态且不把旧事件写入新会话

### Requirement: 协议与能力协商
系统 SHALL 使用锁定版本的官方 ACP TypeScript SDK 协商协议，并 SHALL 保存标准 capability、Devin `_meta` 和未知扩展字段。

#### Scenario: Initialize 返回未知扩展
- **WHEN** ACP initialize 返回当前应用尚未识别的 `_meta` 字段
- **THEN** 系统保留原始字段用于诊断和未来适配
- **THEN** 已知功能继续依据标准 capability 工作

### Requirement: ACP 认证
系统 SHALL 使用运行时广告的 ACP auth method 完成认证，SHALL 支持通过系统浏览器承载 browser 方法，并 SHALL 不读取 Devin credential 文件。

#### Scenario: 需要浏览器认证
- **WHEN** ACP 返回 auth required 且广告 browser 方法
- **THEN** 系统通过安全外链启动认证流程并等待协议结果
- **THEN** token 或 credential 文件内容不进入 renderer 或应用日志

### Requirement: 单活动会话生命周期
系统 SHALL 为一个活动 UI 会话维护一个 ACP host，并 SHALL 在切换会话前取消当前 prompt。系统 MUST 仅在广告 `session.close` 时调用 close，否则 SHALL 终止 host 并为目标 session 重建连接。

#### Scenario: 无 close capability 时切换会话
- **WHEN** 用户切换线程且当前 ACP 未广告 `session.close`
- **THEN** 系统取消当前 prompt、终止当前 host、启动新 host 并 load 目标 session
- **THEN** 原会话事件不会进入目标会话

### Requirement: 标准模式与配置写回
系统 SHALL 使用 `session/set_mode` 写入模式，使用 `session/set_config_option` 写入其他会话配置，并 SHALL 在协议拒绝时回滚 UI 当前值。

#### Scenario: 配置写回失败
- **WHEN** 用户选择的模型或模式被 CLI 或企业策略拒绝
- **THEN** 系统恢复服务端确认的原值并显示错误原因
- **THEN** 系统不静默创建新 session

### Requirement: 请求超时与关闭
系统 SHALL 为 ACP request 提供超时和取消，并 SHALL 在应用退出时取消 prompt、终止子进程和清理 listener。

#### Scenario: 应用退出时仍有请求
- **WHEN** 用户退出且存在 pending ACP request
- **THEN** 系统以确定性错误结束请求并终止子进程
- **THEN** 应用不遗留孤儿 ACP 进程
