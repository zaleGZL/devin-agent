# Devin CLI 知识库索引

本仓库 `docs/devin-cli/` 目录下存放了 Devin CLI 官方文档的本地镜像（来源：https://docs.devin.ai/cli/）。
当用户询问 Devin CLI 相关问题时，请优先查阅本地镜像中对应的文档，再作答。

## 路由索引

按主题分类，路径均相对于 `docs/devin-cli/`。

### 入门与核心使用

- [Quickstart](docs/devin-cli/index.md): 2 分钟上手 Devin CLI（本地命令行编码 agent，深度集成 Devin Cloud）
- [Essential Commands](docs/devin-cli/essential-commands.md): 最常用的命令速查
- [Subagents](docs/devin-cli/subagents.md): 将任务委派给前台/后台独立 subagent
- [Hand off to cloud Devins](docs/devin-cli/handoff.md): 用 `/handoff` 把任务从 CLI 交给云端 Devin 会话
- [Models](docs/devin-cli/models.md): 可用模型及配置方式
- [Adaptive](docs/devin-cli/adaptive.md): Cognition 的智能模型路由器，自动为每个任务选择最佳模型
- [Sandbox](docs/devin-cli/sandbox.md): Devin CLI 会话的 OS 级隔离、网络过滤与企业强制策略
- [Troubleshooting](docs/devin-cli/troubleshooting.md): 常见问题与修复方法

### IDE 集成 (ACP)

- [JetBrains](docs/devin-cli/acp/jetbrains.md): 在 JetBrains IDE 的 AI Chat 中通过 ACP 运行 Devin（含 Remote Development）
- [Zed](docs/devin-cli/acp/zed.md): 在 Zed 编辑器 Agent Panel 中作为自定义 ACP agent 运行
- [Xcode](docs/devin-cli/acp/xcode.md): 在 Xcode 编码助手中通过 ACP 运行，或通过 Xcode MCP bridge 接入项目

### 可扩展性 (Extensibility)

- [Extensibility Overview](docs/devin-cli/extensibility/index.md): 用 rules、skills、MCP servers 定制扩展 Devin CLI
- [Configuration](docs/devin-cli/extensibility/configuration.md): 用配置文件控制 Devin CLI 行为
- [Rules & AGENTS.md](docs/devin-cli/extensibility/rules.md): 提供始终生效的指令与上下文，引导每次会话
- [MCP Overview](docs/devin-cli/extensibility/mcp/overview.md): 用 Model Context Protocol 接入外部工具服务器
- [MCP Configuration](docs/devin-cli/extensibility/mcp/configuration.md): 添加、配置、管理 MCP 服务器
- [Skills Overview](docs/devin-cli/extensibility/skills/overview.md): 创建可复用的 prompt 与工作流扩展 agent 能力
- [Creating Skills](docs/devin-cli/extensibility/skills/creating-skills.md): `SKILL.md` 格式与 frontmatter 选项完整参考
- [Plugins](docs/devin-cli/extensibility/plugins/overview.md): 跨 Devin 云会话、CLI、Desktop 的插件安装、编写与治理
- [Quickstart: team marketplace](docs/devin-cli/extensibility/plugins/quickstart.md): 为团队搭建共享插件市场（skills/rules/hooks/MCP/治理）
- [Hooks](docs/devin-cli/extensibility/hooks/overview.md): 在会话特定事件触发时运行自定义逻辑
- [Lifecycle Hooks](docs/devin-cli/extensibility/hooks/lifecycle-hooks.md): 各生命周期事件的触发时机与可用数据

### 企业版 (Enterprise)

- [Devin Auth](docs/devin-cli/enterprise/devin-auth.md): 用现有 Devin 账号认证 Devin CLI
- [Legacy Windsurf Auth](docs/devin-cli/enterprise/windsurf-auth.md): 用旧版 Windsurf 企业账号认证
- [Team Settings](docs/devin-cli/enterprise/team-settings.md): 配置团队级设置控制用户的 Devin CLI 使用
- [System Configuration](docs/devin-cli/enterprise/system-config.md): 用 MDM 下发的 `system.json` 策略固定登录与代理设置
- [Controls](docs/devin-cli/enterprise/controls.md): Devin CLI 作为本地 agent 与 Cascade 的功能/控制差异

### 参考手册 (Reference)

- [Commands & Flags](docs/devin-cli/reference/commands.md): 命令参数、子命令、交互式斜杠命令完整参考
- [Keyboard Shortcuts](docs/devin-cli/reference/keyboard-shortcuts.md): Devin CLI 常用快捷键
- [Terminal Compatibility](docs/devin-cli/reference/terminal-compatibility.md): 支持的终端与推荐
- [Configuration File](docs/devin-cli/reference/configuration/config-file.md): Devin CLI 配置文件格式完整参考
- [Configuration Import](docs/devin-cli/reference/configuration/read-config-from.md): 从 Cursor/Windsurf/Claude Code/Copilot/OpenCode/Zed 导入设置
- [Configuration Precedence](docs/devin-cli/reference/configuration/global-vs-local.md): 全局、项目、本地设置的优先级关系
- [Permissions](docs/devin-cli/reference/permissions.md): 用细粒度权限规则控制 agent 能做什么
