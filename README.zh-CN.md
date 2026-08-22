<p align="center">
  <img src="apps/desktop/src/renderer/assets/devin-agent-logo.png" width="180" alt="Devin Coding Agent">
</p>

<h1 align="center">Devin Coding Agent</h1>

<p align="center">由本地安装的 Devin CLI 驱动的桌面编码 Agent。</p>

<p align="center">
  <a href="readme.md">English</a> · <strong>简体中文</strong>
</p>

---

Devin Coding Agent 是一个原生桌面客户端，通过 [Agent Client Protocol (ACP)](https://docs.devin.ai/cli/)
连接到 Devin CLI。应用不捆绑或重新分发 Devin CLI 二进制文件——你自行安装并认证 CLI，应用通过 ACP 驱动它。

## 下载

请前往项目的 [GitHub Releases 页面](https://github.com/zaleGZL/devin-agent/releases)下载最新的
macOS 和 Linux 安装包。Apple Silicon Mac 选择 `arm64`，Intel Mac 选择 `x64`。安装包当前未签名；
macOS 安装方法见下文。

## 功能

- 工作区管理，支持多个 Devin session
- 流式对话，包含 reasoning、plan 和工具活动
- 图片输入、动态模型与模式、权限请求
- 支持通过 `@` 引用项目文件、目录，以及缓存的全局/项目 Skills
- 文件预览、主题、语言切换和命令面板
- 所有能力通过 ACP 运行时协商，不硬编码

### 输入框 `@` 引用

在输入框键入 `@` 可引用**文件**、**目录**或 **Skills**。文件和目录仅在选择项目后可用；
应用不会把用户主目录作为兜底扫描范围。只有 Devin 声明支持 ACP embedded context 时，
应用才会内联不超过 512 KiB 的 UTF-8 文件；二进制文件、超大文件或不支持内联的文件会降级为
resource link。目录始终只作为链接发送，不递归展开。Skill metadata 来自 Devin 支持的全局与项目
`SKILL.md` 目录，同名时项目 Skill 覆盖全局 Skill；每个新 session 保存独立的不可变快照。
选中 Skill 后发送 Devin 文档定义的 `@skills:<name>`，加载和执行正文的仍是 Devin CLI，Desktop
不读取正文或执行 Skill。

## 前置条件

- [Node.js](https://nodejs.org/) `>= 22.19.0`
- 当前稳定版 [pnpm](https://pnpm.io/)；仓库不锁定 pnpm 版本
- 已安装 [Devin CLI](https://docs.devin.ai/cli/) 并完成认证（`devin auth login`）

运行 pnpm 前必须先启用 Node.js `>= 22.19.0`。仓库直接使用当前环境中的 pnpm，
不会自行选择或强制指定包管理器版本。

## 快速开始

```bash
git clone https://github.com/zaleGZL/devin-agent.git
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
pnpm pack:mac           # 构建未签名 Apple Silicon DMG，复制到 Downloads 并打开 Finder
```

## 发布

1. 修改 `apps/desktop/package.json` 的 `version`。
2. 提交。
3. 运行 `pnpm publish:desktop` —— 自动打 `desktop-v<version>` tag 并 push，CI 构建后
   将安装包发布到 GitHub Releases。

安装包当前**未签名且未经过 Apple 公证**。Windows 会显示 SmartScreen 警告；macOS 请按以下步骤安装。

### 安装未签名的 macOS 包

Gatekeeper 可能提示“无法验证开发者”或“Apple 无法检查其是否包含恶意软件”。仅对从本项目
[GitHub Releases 官方页面](https://github.com/zaleGZL/devin-agent/releases)下载的 DMG 执行以下放行操作。

1. 下载与机器匹配的 DMG（Apple Silicon 使用 `arm64`，Intel 使用 `x64`），打开后将
   **Devin Agent** 拖入**应用程序**目录。
2. 先尝试打开一次已安装的应用，再进入**系统设置 → 隐私与安全性**，滚动到**安全性**，
   点击**仍要打开**，完成身份验证后确认**打开**。参见
   [Apple 的 Gatekeeper 说明](https://support.apple.com/zh-cn/102445)。
3. 如果确认下载来源可信、重新下载后仍提示“已损坏”或无法打开，仅移除该应用的隔离属性，
   然后启动应用：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Devin Agent.app"
   open "/Applications/Devin Agent.app"
   ```

   如果第一条命令提示权限不足，在该命令前加 `sudo` 后重试。

不要全局关闭 Gatekeeper。移除隔离属性会绕过一项 macOS 安全检查，执行命令前必须确认下载来源。

## 平台说明

| 平台 | Sandbox | 说明 |
|------|---------|------|
| macOS | Seatbelt | 完整 sandbox 支持 |
| Linux | `bubblewrap` + `socat` | sandbox 所需依赖 |
| Windows | 不可用 | Devin CLI 在 Windows 上不支持 OS sandbox |

当请求 sandbox 但环境不支持时，应用会 fail-closed，不会静默回退到未隔离执行。

## 许可证

[MIT](LICENSE)
