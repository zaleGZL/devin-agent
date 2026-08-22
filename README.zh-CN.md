<p align="center">
  <img src="assets/devin-agent-brand.png" width="180" alt="Devin Coding Agent">
</p>

<h1 align="center">Devin Coding Agent</h1>

<p align="center">由本地安装的 Devin CLI 驱动的桌面编码 Agent。</p>

<p align="center">
  <a href="readme.md">English</a> · <strong>简体中文</strong>
</p>

---

Devin Coding Agent 是一个原生桌面客户端，通过 [Agent Client Protocol (ACP)](https://docs.devin.ai/cli/)
连接到 Devin CLI。应用不捆绑或重新分发 Devin CLI 二进制文件——你自行安装并认证 CLI，应用通过 ACP 驱动它。

## 功能

- 工作区管理，支持多个 Devin session
- 流式对话，包含 reasoning、plan 和工具活动
- 图片输入、动态模型与模式、权限请求
- 文件预览、主题、语言切换和命令面板
- 所有能力通过 ACP 运行时协商，不硬编码

## 前置条件

- [Node.js](https://nodejs.org/) `>= 22.19.0`
- [pnpm](https://pnpm.io/) `10.x`
- 已安装 [Devin CLI](https://docs.devin.ai/cli/) 并完成认证（`devin auth login`）

## 快速开始

```bash
git clone <repository-url>
cd devin-agent
pnpm install
pnpm dev
```

如果应用无法在 `PATH` 中找到 `devin`，打开**设置**并选择 Devin CLI 二进制文件的绝对路径。
应用会先运行 `devin --version` 验证，再通过 `devin acp` 建立连接。

## 开发

```bash
pnpm check              # typecheck + lint + test + build
pnpm check:independence # 确保无禁止的 DSCode 引用
pnpm test               # 仅单元测试
```

真实 ACP 冒烟测试（需要已认证的 Devin CLI）：

```bash
DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin
```

## 构建与打包

```bash
pnpm build              # 构建 electron + renderer
pnpm pack               # 本地未签名打包
```

## 发布

1. 修改 `apps/desktop/package.json` 的 `version`。
2. 提交。
3. 运行 `pnpm publish:desktop` —— 自动打 `desktop-v<version>` tag 并 push，CI 构建后
   将安装包发布到 GitHub Releases。

安装包当前**未签名**。macOS 用户需右键 → 打开来绕过 Gatekeeper；Windows 会显示 SmartScreen 警告。

## 平台说明

| 平台 | Sandbox | 说明 |
|------|---------|------|
| macOS | Seatbelt | 完整 sandbox 支持 |
| Linux | `bubblewrap` + `socat` | sandbox 所需依赖 |
| Windows | 不可用 | Devin CLI 在 Windows 上不支持 OS sandbox |

当请求 sandbox 但环境不支持时，应用会 fail-closed，不会静默回退到未隔离执行。

## 许可证

[MIT](apps/desktop/LICENSE)
