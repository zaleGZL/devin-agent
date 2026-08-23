## 1. 协议契约与交互基础设施

- [x] 1.1 在修改 ACP types/transport 前阅读 `docs/devin-cli.md` 索引及相关 ACP 文档，确认 SDK 1.4.0 的 `elicitation/create`、`elicitation/complete` 与 Devin 扩展 method 形状
- [x] 1.2 扩展 shared ACP 类型和 capability normalizer，分离 Desktop 已实现的 client capability 与 Agent 运行时广告的 `editableCommands`、`commandRevision`、`chains`、`sessionRename`
- [x] 1.3 实现统一 pending interaction broker，覆盖 `interactionId`、session/request/toolCall scope、connection generation、exactly-once 完成、超时和集中取消
- [x] 1.4 为 broker 添加单元测试，覆盖并发交互、迟到响应、重复完成、session 取消、窗口销毁和 ACP 重连
- [x] 1.5 在 `acp-transport.ts` 使用官方 SDK 注册 `elicitation/create` 与 `elicitation/complete`，保留 permission/session update 行为并拒绝未白名单请求
- [x] 1.6 扩展 main/preload/renderer 的受控 IPC 联合类型，使 renderer 只能按 `interactionId` 回答已知交互，不能提交任意 ACP method

## 2. 结构化 elicitation

- [x] 2.1 实现 ACP primitive form schema 的解析、默认值应用和共享校验纯函数，覆盖 string、number、integer、boolean、单选与多选
- [x] 2.2 为 form schema 添加单元测试，覆盖 required、enum/oneOf、数值边界、未知类型、矛盾约束和输出字段白名单
- [x] 2.3 在 Host 中实现 session、tool call 与 request-scoped `elicitation/create` 路由，正确返回 `accept`、`decline` 或 `cancel`
- [x] 2.4 实现 renderer form UI 与交互队列，支持字段说明、可定位错误、提交、拒绝和生命周期取消
- [x] 2.5 实现 URL 校验与受控系统浏览器外链，只允许无 userinfo 的 HTTPS URL，并按 `elicitationId` 等待匹配 completion notification
- [x] 2.6 为 URL 流程添加 mock ACP 测试，覆盖用户确认、拒绝、不安全 scheme、completion 不匹配、超时和重连取消
- [x] 2.7 仅在 form/URL 各自完整 handler 与测试启用后，由集中式构造器广告对应 `clientCapabilities.elicitation` 模式

## 3. 可编辑审批与 command revision

- [x] 3.1 用当前 Devin CLI 捕获并脱敏固化 editable command、自然语言 revision 和最终命令复核的真实 ACP fixture，不记录 credentials 或敏感命令内容
- [x] 3.2 基于已验证 fixture 实现 vendor `_meta` 类型守卫和稳定内部模型，未知或畸形 payload 必须回退标准 permission 或取消
- [x] 3.3 扩展 permission broker 与 IPC，保留 request/toolCall 身份、原始 options、revision 序号和最终候选命令，且不在 Desktop 执行任何命令
- [x] 3.4 扩展审批 UI，按 Agent capability 分别显示直接编辑与“描述修改要求”，并在 Devin 返回最终命令后强制二次明确批准
- [x] 3.5 添加审批契约测试，覆盖能力缺失、标准 option 兼容、编辑往返、revision 往返、拒绝最终命令、旧 revision 迟到和连接重建
- [x] 3.6 不把 Agent 侧 `editableCommands`/`commandRevision` 误广告为客户端能力，并在完整往返闭环与 fixture 测试通过前保持对应 UI 入口关闭

## 4. `/btw` chain side-chat

- [x] 4.1 用当前 Devin CLI 固化声明与未声明 `cognition.ai/chains` 时的命令列表 fixture，以及 `/btw` chain session update 的脱敏 fixture
- [x] 4.2 扩展 ACP normalizer，为已验证的 chain 事件产生稳定 `chainId`，无法识别的 chain 事件只生成脱敏诊断
- [x] 4.3 扩展 conversation reducer，按 `sessionId + chainId` 隔离消息、tool call、streaming、stop reason、错误和 generation 生命周期
- [x] 4.4 实现 side-chat 面板和 `/btw` 输入，使用运行时动态 command 的 name、description 与 input hint，且关闭面板不取消主 prompt
- [x] 4.5 添加 chain 测试，覆盖主流与 side-chat 交错、多个 chain、side-chat 失败、未知 chain、session 切换和 ACP 重连
- [x] 4.6 仅在 chain normalizer、状态、UI 和测试完整后声明 `cognition.ai/chains: true`，并以 Agent `chains` capability 与动态 `/btw` 命令共同门控入口

## 5. 原生会话重命名

- [x] 5.1 将 `cognition.ai/sessionRename` 加入运行时 capability gate，并为存在、缺失和跨连接刷新添加单元测试
- [x] 5.2 在 Host 中实现显式白名单 `_cognition.ai/session/rename`，校验已知 session ID 和标题，不向 renderer 暴露通用 vendor RPC
- [x] 5.3 扩展 session index 数据模型以区分 local 与 native/server 标题来源，并按提交时间或请求序号防止旧 list/load 结果覆盖新标题
- [x] 5.4 调整 rename IPC 与 renderer optimistic UI：原生成功后持久化和广播，失败时回滚并报错，能力缺失或 ACP 不可用时保留 local-only 降级
- [x] 5.5 添加 Host、session index 和 renderer 状态测试，覆盖原生成功、错误、超时、generation 改变、本地降级、恢复能力不自动上传和多窗口同步

## 6. 集成、文案与回归验证

- [x] 6.1 补齐中英文 renderer 文案与无障碍标签，确保 form、URL、可编辑审批、side-chat 和 rename 状态可理解且不误报同步或执行
- [x] 6.2 扩展 `smoke:devin` 的显式 opt-in 合约覆盖，在 `DEVIN_LIVE_TEST=1` 时验证 elicitation、`/btw` 广告与原生 rename，不把真实 Devin、浏览器或 MCP 作为默认测试依赖
- [x] 6.3 运行相关 Vitest 测试、`pnpm test` 和 `pnpm check`，修复 typecheck、lint、test 与 build 回归
- [x] 6.4 若变更触及依赖、imports 或路径，运行 `pnpm check:independence` 并确认没有 DSCode 引用
- [x] 6.5 在每个代码提交前提升 `apps/desktop/package.json` 的 patch 版本，并将版本变更纳入同一提交

## 7. 本地 App 端到端验收

- [x] 7.1 在端口 `5173` 已被占用时启动真实 App，并确认 Electron 使用 Vite 实际分配的端口而不是打开其他服务
- [x] 7.2 使用已登录 Devin CLI 验证 `ask_user_question` 单选表单可提交并返回所选值
- [x] 7.3 验证原生 rename 在 UI 与 session index 中同步，标题来源记录为 `native`
- [x] 7.4 在主 permission 挂起时验证 `/btw` 独立返回，且主审批保持待处理
- [x] 7.5 验证可编辑审批的两阶段协议：首次回传 `outcome._meta.updatedInput`，最终未变化审批不重复回传，实际只执行编辑后的命令
