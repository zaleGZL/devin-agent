## 1. 独立工程与来源基线

- [x] 1.1 创建根 `package.json`、`pnpm-workspace.yaml`、TypeScript/Vitest 基础配置和统一的 `typecheck`、`test`、`build`、`pack` 脚本
- [x] 1.2 把 DSCode Desktop 所需的 main、preload、renderer、shared、样式、资产、测试和构建配置复制到当前仓库，并形成逐文件迁移清单
- [x] 1.3 增加 `THIRD_PARTY_NOTICES` 或等价文件，记录 DSCode MIT 许可、来源 commit 和复制范围
- [x] 1.4 删除复制代码中的 DSCode Core、多 provider、DeepSeek、Terminal/VS Code 和 `@thinkany/dscode-*` import、依赖及启动入口
- [x] 1.5 实现独立性扫描脚本，检查 manifest、lockfile、imports、scripts、symlinks 和 source map 中的 DSCode checkout/path/runtime 引用
- [x] 1.6 在没有 DSCode checkout 的临时环境验证依赖安装与基础 typecheck，修复所有隐式路径依赖

## 2. Electron Desktop 壳与安全边界

- [x] 2.1 建立 `apps/desktop` 的 Electron main、preload、React renderer 和 shared types 构建入口
- [x] 2.2 移植 BrowserWindow、菜单、窗口生命周期和单实例行为，并配置 `contextIsolation=true`、`nodeIntegration=false` 与 renderer sandbox
- [x] 2.3 移植并收紧页面导航与外链策略，只允许 main 校验后的 HTTP(S) URL 交给系统浏览器
- [x] 2.4 定义 typed `DesktopApi` 和 IPC schema，覆盖 workspace、settings、files、sessions、auth 与 agent，并拒绝非法参数
- [x] 2.5 移植 DSCode 主布局、侧栏、会话区、composer、settings、command palette、theme、i18n 和相关样式资产
- [x] 2.6 移植目录选择、最近项目、忘记项目和活动 cwd 状态，确保所有文件系统操作只发生在 main
- [x] 2.7 移植 file inspector 与内部 preview protocol，保留类型/大小限制并阻断 `..`、外部绝对路径和软链接逃逸
- [x] 2.8 为窗口安全配置、IPC schema、workspace 状态和 preview containment 增加单元测试

## 3. Devin CLI 发现、ACP Transport 与认证

- [x] 3.1 添加并锁定官方 `@agentclientprotocol/sdk`，建立 ACP 标准类型与 Devin unknown `_meta` envelope
- [x] 3.2 实现 Devin binary discovery：用户绝对路径、受控常见路径和 PATH 候选，并以 `devin --version` 验证
- [x] 3.3 实现 `DevinAcpHost` 子进程启动与关闭，使用绝对 command、`args: ["acp"]`、`shell: false`、分离 stdio 和输出上限
- [x] 3.4 实现 ACP request id、超时、AbortSignal、pending rejection、stderr 脱敏和 child exit/reconnect 状态机
- [x] 3.5 实现 initialize 协商与 `DevinCapabilities` 归一化，覆盖 prompt/session/auth/modes/configOptions/extensions 并保留未知字段
- [x] 3.6 实现运行时广告驱动的 ACP authenticate 流程和 browser auth 外链，不读取 credential 文件
- [x] 3.7 实现单活动 host 生命周期、prompt cancel，以及仅在 capability 广告时调用 close、否则终止并重建 host 的线程切换流程
- [x] 3.8 建立 mock ACP server 与版本化 fixture，覆盖 initialize、auth、timeout、malformed response、unknown extension 和进程异常退出

## 4. Devin Session 与本地索引

- [x] 4.1 定义以 `sessionId` 为主键的 `SessionSummary`、`ThreadState` 和连接状态，不保留多 provider 字段
- [x] 4.2 实现 `session/new` 和 `session/load`，把活动 cwd、client capabilities 与 additional directories 按协议传入
- [x] 4.3 实现 capability-gated `session/list`、`session/delete`、`session/resume`、`session.close` 和 additional directories 操作
- [x] 4.4 实现会话切换时的 cancel、事件隔离和 load 失败恢复，确保旧 host update 不进入新线程
- [x] 4.5 实现基于 cwd 的侧栏分组及 title/cwd/session 摘要搜索，首版不暴露 DSCode renderer 未接线的 pin/archive UI
- [x] 4.6 实现锁定 session 的只读提示，并禁用 prompt 与删除操作
- [x] 4.7 建立仅保存最近工作区、session 摘要、搜索与本地 UI 偏好的索引，禁止保存第二份完整 transcript
- [x] 4.8 为 new/load/list/delete、缺失 capability、locked、additional directories、切换与重启恢复增加契约测试

## 5. ACP 事件与 Coding Conversation

- [x] 5.1 定义稳定的内部 `AgentEvent`、`ChatMessage`、`ToolActivity`、`PlanState` 与 raw diagnostic 结构
- [x] 5.2 实现 `AcpUpdateNormalizer`，覆盖 user/agent message、thought、tool call/update、plan、commands、mode、config、session info 和 usage
- [x] 5.3 为未知 update 保留 raw/sessionId/updateId/timestamp，执行脱敏并生成不中断会话的诊断占位
- [x] 5.4 把复制后的 conversation reducer 改接内部事件，保持流式合并、Markdown/GFM、reasoning、tool row、错误和耗时展示
- [x] 5.5 实现文本 prompt composer、发送状态、取消按钮、快捷键和上下文卡片
- [x] 5.6 根据 prompt capability 与当前模型 `supportsImages` 实现图片附件门禁和 ACP content block 转换，并保持 audio 默认隐藏
- [x] 5.7 实现运行中 follow-up 排队或“先取消再发送”流程，禁止并发 prompt 冒充 ACP steer
- [x] 5.8 实现 `session/request_permission` renderer 对话框、候选 option 返回和取消结果，确保 Desktop 不执行被审批工具
- [x] 5.9 实现 `available_commands_update` 驱动的命令面板，只显示当前 session 广告的 slash commands
- [x] 5.10 为事件顺序、重复 chunk、tool 生命周期、unknown update、reasoning 隐藏、图片门禁、取消、follow-up 和 permission 增加单元/契约测试

## 6. 动态模型、模式与能力治理

- [x] 6.1 由 session modes/configOptions 构建 Devin-only 模型与模式选择器，删除 DSCode 静态 provider/model/effort 枚举
- [x] 6.2 通过 `session/set_mode` 和 `session/set_config_option` 写回选择，并在 CLI 或企业策略拒绝时回滚 UI
- [x] 6.3 显示 Devin 返回的 sandbox、permission 和组织策略状态；sandbox 启动失败时 fail-closed，不回退未隔离执行
- [x] 6.4 将 MCP、Skills、Rules、Hooks、Plugins 和 Subagents 限定为 ACP 命令/工具/事件的只读入口与状态，不创建第二套执行器
- [x] 6.5 仅在运行时广告时显示 Subagent 与 `/handoff`，并把 Handoff 明确标记为云端执行边界
- [x] 6.6 隐藏或说明 checkpoint/undo、steer、任意 system prompt personalization、完整 diff、精确 cost/cache 和 audio 等不支持能力
- [x] 6.7 保留 profile/avatar/theme/language/reasoning 等本地偏好，但禁止把旧 personalization 自动写入 AGENTS、rule 或 system prompt
- [x] 6.8 为模型/模式动态更新、配置回滚、企业限制、sandbox failure、扩展缺失和 Handoff 门禁增加测试

## 7. 设置、诊断与错误恢复

- [x] 7.1 在设置页增加 Devin CLI 路径、检测版本、认证状态和重新连接入口，删除多 provider credential/base URL 表单
- [x] 7.2 实现 binary 缺失、版本不兼容、auth required、session locked、ACP crash 和协议错误的明确状态与恢复操作
- [x] 7.3 实现日志与诊断脱敏，覆盖 token、credential-like 值、敏感环境变量、ACP stderr 和测试 fixture
- [x] 7.4 实现应用退出时的 prompt cancel、pending rejection、listener 清理、SIGTERM 与有界 SIGKILL fallback，验证不遗留 ACP 进程
- [x] 7.5 更新用户文档，说明 Devin CLI 安装/认证、平台 sandbox 限制、云 Handoff 边界和所有跳过/降级功能

## 8. 跨平台构建与分发

- [x] 8.1 移植并改造 electron-builder 配置，生成 macOS arm64/x64、Windows x64 和 Linux x64 目标产物
- [x] 8.2 确保所有安装包排除 Devin CLI binary、DSCode checkout、DSCode Core 和 credential 文件
- [x] 8.3 实现 Electron GUI 环境下的跨平台 CLI path 诊断，并为 macOS、Linux、Windows 提供准确安装指引
- [x] 8.4 配置 macOS 签名/公证、Windows/Linux 打包元数据和应用图标品牌资产，不复用未经确认的 DSCode/Devin 商标
- [x] 8.5 在 Windows sandbox 不可用、Linux 缺少 bwrap/socat 等情况下显示平台级 fail-closed 诊断
- [x] 8.6 验证 unpacked/packaged 应用均能发现外部 CLI、启动 ACP、关闭子进程，并且产物不包含被禁止的依赖

## 9. 最终验证与交付准备

- [x] 9.1 运行并修复根 workspace 与 Desktop 的 typecheck、lint 和 unit/contract test
- [x] 9.2 运行并修复生产 build 与 Electron pack，记录各平台可执行的最窄验证命令
- [x] 9.3 在无 DSCode checkout 的干净临时环境执行 install、typecheck、test、build、pack 和独立性扫描
- [x] 9.4 检查复制清单、MIT notice、lockfile、imports、scripts、symlinks、source map 和安装包内容，确认零 DSCode 技术依赖
- [x] 9.5 使用受控临时仓库和已认证 Devin CLI 验证 initialize、auth、new/load、prompt/cancel、permission、模型/模式、图片和恢复 fixture
- [x] 9.6 对照六份 capability spec 完成需求追踪，确保每个跳过或降级项在 UI 与用户文档中一致
- [x] 9.7 记录支持的 Devin CLI/ACP/SDK 版本、已知平台限制和发布前未决法务事项，形成实施交付说明
