## Why

当前仓库只有 Devin CLI 文档和研究结论，尚无可运行的 Desktop Coding Agent。需要把 DSCode 的 Desktop 源码、样式与交互复制到当前仓库并独立维护，以 Devin CLI ACP 取代 DSCode Core，在不依赖 DSCode 仓库的前提下提供一致的桌面体验。

## What Changes

- 建立可独立安装、测试、构建和打包的 Electron、React、TypeScript Desktop 工程，并复制 DSCode 的窗口结构、布局、样式、资产和 provider 无关交互。
- 建立安全的 Electron main/preload/renderer 边界，保留工作区选择、最近项目、文件预览、主题、语言、设置、命令面板和会话侧栏。
- 实现唯一的 Devin provider：在 main 中发现并启动用户已安装的 `devin acp`，通过官方 ACP TypeScript SDK 完成认证、能力协商、会话和 prompt 生命周期。
- 将 ACP 消息、reasoning、plan、tool、terminal、usage、命令、模式及配置更新归一化为 Desktop 会话视图，并支持动态模型、模式、图片和权限请求。
- 由 Devin CLI 继续拥有 sandbox、permissions、MCP、Skills、Rules、Hooks、Plugins、Subagents 和 Handoff 的执行职责；Desktop 只提供协议允许的入口、状态与降级提示。
- 建立 Devin session 为事实来源的会话索引、恢复和搜索机制；不复制 DSCode Core transcript 或 provider 状态。
- 建立 macOS、Windows、Linux 的打包与诊断流程；MVP 只检测并引导安装 Devin CLI，不捆绑或自动替换其二进制。
- 明确跳过没有 ACP 等价能力的 DSCode 行为，包括原子 checkpoint/undo、运行中 steer、任意 system prompt personalization，以及未被运行时广告的云端或扩展能力。
- **BREAKING** 删除所有 DSCode 运行时、workspace、路径、软链接、submodule 和 `@thinkany/dscode-*` 依赖；DSCode checkout 仅作为一次性源码输入和视觉基线。

## Capabilities

### New Capabilities

- `desktop-shell`: 独立 Electron Desktop 壳、DSCode 同款布局与交互、工作区、文件预览、主题、语言和安全 IPC。
- `devin-acp-runtime`: Devin CLI 二进制发现、ACP 进程、认证、能力协商、会话生命周期、配置写回与故障恢复。
- `coding-conversation`: prompt composer、流式消息、reasoning、plan、工具/终端活动、权限请求、附件和动态命令体验。
- `session-experience`: Devin session 列表、新建、加载、删除、搜索、工作区分组和本地 UI 元数据管理。
- `devin-capability-governance`: 模型、模式、sandbox、企业策略及 MCP/Skills/Hooks/Plugins/Subagents/Handoff 的能力门禁和降级规则。
- `desktop-distribution-independence`: 零 DSCode 依赖、许可证归属、外部 Devin CLI 安装约束、跨平台构建打包和独立性验证。

### Modified Capabilities

无。当前仓库没有既有 OpenSpec capability。

## Impact

- 新增完整 Desktop 应用源码、共享类型、测试、构建和打包配置。
- 新增官方 `@agentclientprotocol/sdk`、Electron、React、TypeScript、Vite、Vitest、electron-builder 等依赖。
- 运行时依赖用户独立安装并认证的 Devin CLI；不依赖 DSCode checkout 或 DSCode runtime package。
- 复制自 DSCode 的代码和资产必须保留 MIT 许可及来源 commit 记录。
- 产品行为受 Devin ACP 运行时能力、企业策略和平台 sandbox 限制约束。
