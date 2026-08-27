## 背景

微信 Bot 通过腾讯 iLink 私有协议实现扫码登录、长轮询收消息、加密媒体上传下载和打字指示。Telegram Bot API 是标准 HTTP REST，只需一个 Bot Token 即可工作，无需扫码、无需媒体加密、无需 context_token。两者在编排层（固定单会话、持久化队列、权限自动决策、工作目录隔离）的需求一致。

## 目标与非目标

### 目标

- 用户在桌面端粘贴 Telegram Bot Token，即可在 Telegram 中与 Devin CLI 对话。
- 复用微信 Bot 已验证的编排模式：固定单会话、持久化收发队列、崩溃恢复、权限自动决策。
- 支持文本和图片附件的双向传递。
- 支持后台启动与托盘控制。

### 非目标

- 不支持 Telegram 群组多用户独立会话（本阶段沿用固定单会话）。
- 不实现 Telegram webhook 模式（仅用 getUpdates 长轮询，与微信一致，无需公网入口）。
- 不修改微信 Bot 的任何现有行为。
- 不实现 Telegram 内联模式、频道、机器人命令等高级特性。

## 决策

### 1. 协议层只保留 Bot API 必需子集

`telegram/protocol.ts` 实现 `TelegramApi` 类，封装 `getUpdates`（长轮询，`offset` 游标）、`sendMessage`、`sendChatAction`、`sendPhoto`、`sendDocument`、`getFile`（下载）。所有请求发往 `https://api.telegram.org/bot<token>/`，HTTPS-only，`redirect: "error"`。不引入第三方 Telegram 库，保持与微信 Bot 一致的零运行时依赖风格。

### 2. 持久化层复用微信 Store 模式

`telegram/store.ts` 用 `node:sqlite`（WAL，0600）存储 bot 状态、消息历史、inbox/outbox 持久化队列。表名以 `telegram_` 前缀，与微信表共存于同一数据库文件目录但独立数据库文件。媒体落盘到 `media/{inbound,outbound}/YYYY-MM-DD/`。

### 3. 凭据用 Electron safeStorage 加密

`telegram/secrets.ts` 复用微信 secrets 的加密模式，只存储 `botToken`。

### 4. 编排层平移微信 service 的骨架

`telegram/service.ts` 复用 `poll → acceptInbound → runAgent → reply` 主循环、`operationQueue` 串行化、`recoverDurableQueues` 崩溃恢复、`ensureAgent` 固定单会话、`permissionDecisionForBot` 权限自动决策。差异点：

- 无 QR 登录，配置只需 token + 工作目录。
- 无 context_token，直接用 `chatId` 发消息。
- 无媒体加密，用 multipart/form-data 上传。
- 长轮询游标用 Telegram 的 `update_id + 1`（替代微信的 `get_updates_buf`）。
- 打字指示用 `sendChatAction`（替代微信的 ticket 机制）。

### 5. 托盘菜单泛化

托盘当前硬编码微信。改为：任一 Bot 在线即显示托盘；菜单按在线的 Bot 动态生成条目。工具提示改为 "Devin Agent"。

### 6. 视图路由增加 telegram

`activeView` 类型从 `"thread" | "weixin"` 扩展为 `"thread" | "weixin" | "telegram"`。侧栏增加 Telegram Bot 入口。`AppMainPane` 在 `activeView === "telegram"` 时渲染 `TelegramBotView`。

## 风险与权衡

- **托盘泛化回归**：改动托盘逻辑可能影响微信 Bot 现有行为。通过保留微信 Bot 的 `accountId` 判定路径不变来控制风险。
- **Token 安全**：Bot Token 泄露等于 Bot 被接管。用 Electron safeStorage 加密存储，日志和错误信息中 redact token。
- **长轮询阻塞**：getUpdates 默认超时 30s，与微信一致。失败时指数退避。
- **固定单会话限制**：多用户共用 Bot 时会话上下文混合。本阶段接受此限制，与微信 Bot 对齐。
