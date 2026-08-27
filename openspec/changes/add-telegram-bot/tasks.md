## 1. OpenSpec 提案

- [x] 1.1 撰写 proposal.md、design.md、tasks.md 和 delta spec
- [x] 1.2 定义可观察的验收标准

## 2. Telegram 协议层

- [x] 2.1 实现 `telegram/protocol.ts`：TelegramApi（getUpdates、sendMessage、sendChatAction、sendPhoto、sendDocument、getFile）
- [x] 2.2 实现 `telegram/store.ts`：SQLite 持久化（state、messages、inbox、outbox、media）
- [x] 2.3 实现 `telegram/secrets.ts`：Electron safeStorage 加密 botToken

## 3. 编排层

- [x] 3.1 实现 `telegram/service.ts`：poll 主循环、acceptInbound、runAgent、reply、durable queue 恢复
- [x] 3.2 复用 permissionDecisionForBot 权限自动决策
- [x] 3.3 实现 ensureAgent 固定单会话与模型/模式设置

## 4. 类型与 IPC

- [x] 4.1 在 `shared/types.ts` 增加 Telegram 类型与 `DesktopApi.telegram` 接口
- [x] 4.2 在 `main/index.ts` 注册 `telegram:*` IPC handler
- [x] 4.3 泛化托盘菜单以同时支持微信与 Telegram Bot
- [x] 4.4 支持 `--telegram-background` 后台启动

## 5. 渲染层

- [x] 5.1 实现 `renderer/TelegramBotView.tsx`：配置、历史、输入、附件
- [x] 5.2 在 `AppMainPane` 增加 telegram 视图路由
- [x] 5.3 在 `AppSidebar` 增加 Telegram Bot 入口
- [x] 5.4 在 `App.tsx` 增加 activeView 与 telegramStatus 状态

## 6. 测试与验证

- [x] 6.1 为 protocol、store、secrets、service 添加 co-located Vitest 测试
- [x] 6.2 运行 `pnpm check`（typecheck + lint + test + build）
- [x] 6.3 运行 `pnpm check:independence`
- [x] 6.4 提升 `apps/desktop/package.json` patch 版本
