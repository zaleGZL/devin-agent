## ADDED Requirements

### Requirement: Telegram Bot 通过 Bot API 长轮询收发消息

Desktop MUST 通过 Telegram Bot API 的 `getUpdates` 长轮询接收用户消息，并通过 `sendMessage`/`sendPhoto`/`sendDocument` 发送 Devin 回复。所有请求 MUST 发往 `https://api.telegram.org`，HTTPS-only，禁止跟随重定向。

#### Scenario: 用户在 Telegram 发送文本

- **WHEN** 用户在 Telegram 中向 Bot 发送文本消息
- **THEN** Desktop MUST 通过 getUpdates 长轮询接收，将文本作为 prompt 发送给固定 Devin ACP 会话，并将回复通过 sendMessage 发回同一 chat

#### Scenario: 用户发送图片

- **WHEN** 用户发送图片且 Devin ACP 协商支持 image prompt
- **THEN** Desktop MUST 下载图片、落盘到工作目录，并将图片作为 image prompt item 发给 Devin

### Requirement: Telegram Bot 使用固定单会话

Telegram Bot MUST 绑定一个 Devin ACP 会话，会话 ID 持久化到 SQLite。会话身份变化时 MUST 停止运行以保护历史一致性。

#### Scenario: 会话身份变化

- **WHEN** loadSession 返回的 sessionId 与持久化的 sessionId 不一致
- **THEN** Desktop MUST 停止 agent runtime 并报错

### Requirement: 收发队列持久化且可崩溃恢复

Desktop MUST 将入站消息和出站消息持久化到 SQLite inbox/outbox 表。重启后 MUST 重发未完成 outbox、重处理未完成 inbox。

#### Scenario: 发送途中崩溃

- **WHEN** Desktop 在 sendMessage 调用前崩溃
- **THEN** 重启后 outbox 中该消息 MUST 被重新投递

### Requirement: 凭据加密存储

Bot Token MUST 通过 Electron safeStorage 加密存储，明文不得写入磁盘。错误信息和日志中 MUST redact token。

#### Scenario: safeStorage 不可用

- **WHEN** Electron safeStorage 不可用
- **THEN** 凭据 MAY 以明文存储，但文件权限 MUST 为 0600

### Requirement: 权限自动决策

Telegram Bot MUST 复用微信 Bot 的 `permissionDecisionForBot` 逻辑，通过正则匹配选项文本自动允许或拒绝权限请求，不阻塞等待人工操作。

#### Scenario: 权限请求

- **WHEN** Devin ACP 发出权限请求
- **THEN** Desktop MUST 自动选择包含"允许/allow"且不包含"拒绝/deny"的选项，否则取消

### Requirement: 工作目录隔离

附件 MUST 位于配置的工作目录内，禁止路径穿越。

#### Scenario: 附件路径穿越

- **WHEN** 附件路径解析到工作目录之外
- **THEN** Desktop MUST 拒绝该附件

### Requirement: 托盘与后台启动

Desktop MUST 在 Telegram Bot 在线时显示托盘菜单，支持暂停/恢复。`--telegram-background` 启动参数 MUST 支持后台启动。

#### Scenario: 后台启动

- **WHEN** 以 `--telegram-background` 启动且 Bot 已配置
- **THEN** Desktop MUST 在后台启动 Bot 轮询，不显示主窗口
