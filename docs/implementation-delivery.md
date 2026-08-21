# Devin Coding Agent 实施交付说明

## 交付结论

当前仓库是完整且独立的 Desktop 工程。新的开发者不需要 DSCode checkout 或 DSCode package；只要满足 Node/pnpm 前置条件，并在本机安装、认证 Devin CLI，即可从源码安装、运行和打包。

应用只把外部 `devin acp` 作为 Agent runtime。安装包不包含 Devin CLI、credential、DSCode Core 或 DSCode checkout。

## 已验证基线

验证日期：2026-08-21。

| 组件 | 已验证版本或协议 |
|---|---|
| Node.js | `22.23.2` |
| pnpm | `10.12.2` |
| Electron | `43.4.1`（lockfile 解析版本） |
| React / React DOM | `19.2.8` |
| `@agentclientprotocol/sdk` | `1.4.0` |
| Devin CLI | `3000.4.25` |
| ACP | initialize 返回 `protocolVersion: 1` |

这是一组已验证快照，不是对未来 Devin CLI 的静态白名单。模型、模式、命令、session 操作、图片、认证与扩展入口继续以运行时 ACP capability 为准；未广告的能力不调用。

## 克隆后运行

```bash
git clone <repository-url>
cd devin-agent
pnpm install --frozen-lockfile
devin auth login
pnpm dev
```

若 Electron GUI 的 PATH 找不到 `devin`，在设置页选择其绝对路径。main 进程会先执行 `devin --version`，再以绝对路径、`args: ["acp"]`、`shell: false` 启动 ACP。

设置页使用固定的 Devin 官方 release manifest 检查最新版本。仅在用户点击更新后，main 才停止 ACP 并调用本机 `devin update`；应用不实现另一套下载器。更新结果以重新执行 `devin --version` 为准，成功后重建 ACP host。

## 验证证据

本机已执行：

```bash
pnpm check
pnpm check:independence
pnpm run pack
pnpm --dir apps/desktop smoke:packaged
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

结果：typecheck、lint、全部单元/契约测试、生产 build、macOS arm64 unpacked pack、packaged 启停和独立性扫描通过。真实 Devin CLI 冒烟覆盖 ACP initialize/auth 状态、session new/load/delete、图片 prompt、prompt/cancel、1 次 permission request、动态 model/mode 写回、agent/thought/tool updates 与进程重启恢复；测试 session 已删除。

另在不包含 `.git`、`node_modules`、`dist`、`dist-electron`、`release` 和 DSCode checkout 的临时副本执行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm check:independence
pnpm run pack
```

全部通过。安装包内容检查未发现 symlink、source map、Devin binary、credential 或禁止的 DSCode 引用；打包后的 host 模块可独立加载，应用退出后没有遗留 `devin acp` 子进程。

## 跨平台构建

最窄命令如下；CI 在原生 runner 上分别执行对应目标：

```bash
pnpm --dir apps/desktop dist:mac
pnpm --dir apps/desktop dist:win
pnpm --dir apps/desktop dist:linux
```

electron-builder 目标为 macOS arm64/x64 的 DMG/ZIP、Windows x64 的 NSIS、Linux x64 的 DEB/RPM。本轮只在 macOS arm64 本机实际启动产物；Windows/Linux 由 CI 原生 runner 的 package 与 packaged smoke job 验证，不把跨平台配置等同于本机运行证据。

## 平台约束

- macOS：Devin sandbox 使用 Seatbelt；正式分发需要 Apple Developer ID 和公证凭据。
- Linux：Devin sandbox 需要 `bubblewrap`（`bwrap`）与 `socat`；缺失时由 CLI fail-closed。
- Windows：当前 Devin CLI 文档标明 OS sandbox 不可用；若组织强制 sandbox，Desktop 不回退到未隔离执行。
- 认证、企业策略、sandbox、工具与扩展均由用户本机 Devin CLI 决定；Desktop 不读取 credential 文件，也不实现第二套执行器。

## 跳过与降级

- checkpoint/undo：ACP v1 没有已证实的 snapshot/restore。
- 运行中 steer：使用排队或先取消再发送，不伪装协议能力。
- 任意 system prompt personalization：Desktop 不提供对应设置或 IPC；历史本地值不读取、不展示，也不注入 AGENTS、Rules 或 system prompt。
- 完整 tool diff、精确 cost/cache：只展示协议实际返回的数据。
- Audio：未广告时隐藏。
- MCP、Skills、Rules、Hooks、Plugins、Subagents：只展示 ACP 可观测入口和状态，执行权仍在 Devin CLI。
- Handoff：只在 `/handoff` 被广告时显示，并明确标记为 Devin Cloud 边界。
- Knowledge、Playbooks、Secrets、Memories、Workflows、Code Lenses、App Deploys、Conversation Sharing、Arena：没有已证实的 Devin Local/ACP 等价能力，不实现。

## 发布前未决事项

1. 取得并配置 macOS 签名/公证及所需发布凭据；Windows 如需代码签名，另行配置证书。
2. 在 Windows x64 与 Linux x64 的发布 CI 中完成一次真实外部 Devin CLI 冒烟，而非只依赖 mock 和 packaged 启动测试。
3. 发布名称、图标和商店文案不得暗示 Cognition/Devin 官方背书；当前使用自有中性图标，仍需发布方完成商标法务确认。
4. 不得重新分发 Devin CLI binary；应用内更新必须继续委托官方 `devin update`，不得改为自行覆盖可执行文件。DSCode 移植部分继续保留 MIT notice、来源 commit 与复制清单。
