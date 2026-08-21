# Devin Coding Agent

一个仅面向 Desktop 的本地 Coding Agent。界面与 provider 无关交互移植自 DSCode Desktop，Agent runtime 只有一个：用户本机安装的 Devin CLI，通过 ACP 协议连接。

## 前置条件

- Node.js `>=22.19.0`
- pnpm `10.x`
- 已安装 Devin CLI
- 已执行 `devin auth login`

应用不会捆绑、下载或更新 Devin CLI，也不需要 DSCode 仓库或任何 `@thinkany/dscode-*` package。其他人只需克隆本仓库、安装依赖，并在本机安装且登录 Devin CLI，即可运行。

## 本地运行

```bash
pnpm install
pnpm dev
```

如果 Electron GUI 无法从 PATH 找到 `devin`，可在应用设置中选择 Devin CLI 的绝对路径。应用会先运行 `devin --version`，再通过 `devin acp` 完成协议握手。

## 验证与打包

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm pack
pnpm check:independence
```

已认证账号可在受控临时目录运行真实 ACP 冒烟；该命令会发送少量 prompt，并创建后删除测试 session：

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

`check:independence` 会检查 manifest、lockfile、imports、scripts、symlink 和构建产物，确保项目不引用 DSCode checkout、DSCode Core 或 `@thinkany/dscode-*` runtime package。

## 功能边界

支持范围包括工作区、Devin session、流式对话、reasoning、plan、工具活动、图片输入、动态模型与模式、权限请求、文件预览、主题、语言和命令面板。具体能力由当前 Devin CLI 的 ACP capability 动态决定。

以下功能不会伪造实现：DSCode 原子 checkpoint/undo、运行中 steer、任意 system prompt personalization、完整 tool diff、准确 cost/cache、未被 ACP 广告的 Subagent/Handoff 入口。MCP、Skills、Rules、Hooks、Plugins、Subagents、sandbox 和企业权限仍由 Devin CLI 执行。

## 平台限制

- macOS：Devin sandbox 使用 Seatbelt。
- Linux：Devin sandbox 需要 `bubblewrap` 和 `socat`。
- Windows：当前 Devin CLI 文档标明 OS sandbox 不可用；应用不会把未隔离执行显示为 sandbox。

详见 [使用与兼容性说明](docs/implementation-status.md)、[实施交付说明](docs/implementation-delivery.md) 和 [实现研究报告](docs/research/devin-coding-agent-dscode-implementation.md)。

## 第三方来源

移植自 DSCode 的代码与资产遵循其 MIT License。来源 commit、复制范围和许可文本记录在仓库内的 `THIRD_PARTY_NOTICES.md` 或等价清单中；该记录不构成对 DSCode 的技术依赖。
