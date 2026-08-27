## 为什么

桌面端已通过微信 Bot 将 Devin CLI 暴露给移动端用户，但微信 Bot 依赖腾讯 iLink 私有协议，难以在非微信生态中使用。Telegram Bot API 是开放、文档齐全的 HTTP 协议，且无需扫码登录，可让更多用户在移动端驱动 Devin CLI。

## 变更内容

- 新增 `apps/desktop/src/main/telegram/` 模块，实现 Telegram Bot API 客户端、SQLite 持久化、凭据加密和编排服务。
- 复用微信 Bot 的固定单会话、持久化收发队列、权限自动决策和工作目录隔离等成熟模式。
- 在 `shared/types.ts` 增加 Telegram 类型与 `DesktopApi.telegram` IPC 接口。
- 在 `main/index.ts` 注册 `telegram:*` IPC handler，并将托盘菜单泛化为同时支持微信与 Telegram Bot。
- 在 renderer 增加 `TelegramBotView`，通过侧栏入口切换；配置只需粘贴 Bot Token，无需扫码。
- 支持 `--telegram-background` 后台启动，与微信 Bot 的后台模式对齐。

## 能力范围

### 新增能力

- `telegram-bot-bridge`：定义 Telegram Bot 与 Devin CLI 的桥接协议、持久化、编排和桌面集成边界。

### 修改能力

无。本变更不修改微信 Bot、ACP、IPC 主链路、权限、sandbox 或认证的现有行为。

## 影响范围

- `apps/desktop/src/main/telegram/`（新增）。
- `apps/desktop/src/shared/types.ts`、`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/renderer/TelegramBotView.tsx`（新增）及 `features/app/AppMainPane.tsx`、`features/sessions/AppSidebar.tsx`、`App.tsx` 的视图路由。
- 代码提交需要提升 `apps/desktop/package.json` patch 版本。
