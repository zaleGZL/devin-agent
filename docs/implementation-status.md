# Devin Coding Agent 使用与兼容性说明

## 运行模型

Desktop 进程只连接一个外部 Agent：`devin acp`。Electron main 持有 Devin 子进程、文件系统和原生系统能力；preload 暴露经过校验的 IPC；renderer 不拥有 Node、文件系统或子进程权限。

一个活动 UI 会话对应一个 ACP host。切换会话时先取消当前 prompt；只有 CLI 广告 `session.close` 时才调用 close，否则终止当前 host 并为目标 session 重建连接。

## 安装和认证

1. 按 [Devin CLI 官方安装文档](devin-cli/index.md)安装 CLI。
2. 运行 `devin auth login` 并完成登录。
3. 在本仓库运行 `pnpm install && pnpm dev`。
4. 如自动发现失败，在应用设置中选择 `devin` 绝对路径。

应用不读取或复制 Devin credential 文件。Browser auth 只通过 ACP 广告的方法和系统浏览器完成。

## 动态能力

下列 UI 不能使用静态常量，必须来自 ACP initialize/session 响应：

- session list、delete、resume、close 和 additional directories
- prompt 的 image、audio 与 embedded context
- models、modes、configOptions 和 `supportsImages`
- slash commands、permission options、usage 与 Devin `_meta` 扩展

模式通过 `session/set_mode` 写回，其他配置通过 `session/set_config_option` 写回。CLI 或企业策略拒绝时，UI 回滚到服务端确认值。

## 能力归属

| 功能 | 责任方 | Desktop 行为 |
|---|---|---|
| Agent prompt、tools、terminal | Devin CLI | 通过 ACP 发送和展示 |
| permission、sandbox、企业策略 | Devin CLI | 展示请求和结果，不重复执行 |
| MCP、Skills、Rules、Hooks、Plugins | Devin CLI | 仅显示已广告命令、工具或状态 |
| Subagents | Devin CLI | 仅在 ACP 可观测时显示活动 |
| Handoff | Devin CLI / Devin Cloud | 仅在广告 `/handoff` 时显示，并标记云端边界 |
| workspace、settings、file preview | Desktop | main 执行，renderer 通过安全 IPC 使用 |
| session transcript | Devin session | 本地只保存 UI 索引，不复制完整 transcript |

## 明确跳过或降级

- 原子 checkpoint/undo：ACP 没有已证实的 snapshot/restore 接口。
- 运行中 steer：ACP v1 没有标准方法；follow-up 只能排队或先取消。
- 任意 system prompt personalization：不会静默写入 AGENTS、Rules 或 Devin 配置。
- 完整 tool diff、准确 token/cost/cache：只展示协议实际返回的数据。
- Audio：能力未广告时隐藏。
- Knowledge、Playbooks、Secrets、Memories、Workflows、Code Lenses、App Deploys、Conversation Sharing、Arena：Devin Local 文档未提供等价能力。

## Sandbox 平台差异

- macOS 使用 Seatbelt。
- Linux 需要 `bubblewrap` 与 `socat`。
- Windows 当前不支持 Devin OS sandbox。

请求 sandbox 但环境不满足时，应用必须 fail-closed，不得静默回退到未隔离执行。

## 版本与发布约束

支持版本以 `package.json`、lockfile、协议 fixture 和发布说明为准。模型与扩展能力随 CLI 变化，应用只依赖运行时协商结果。

未经书面授权，安装包不包含 Devin CLI binary。跨平台安装包也必须排除 credential、DSCode checkout、DSCode Core 和 `@thinkany/dscode-*` runtime package。
