## ADDED Requirements

### Requirement: 零 DSCode 技术依赖
系统 SHALL 以当前仓库作为唯一源码和构建输入，并 MUST NOT 通过路径依赖、symlink、submodule、workspace dependency、动态加载、脚本或 `@thinkany/dscode-*` runtime package 引用 DSCode。

#### Scenario: 无 DSCode checkout 构建
- **WHEN** 在完全不存在 DSCode checkout 的干净环境执行 install、typecheck、test、build 和 pack
- **THEN** 所有步骤仅使用当前仓库和声明的公开依赖完成

### Requirement: 复制来源与许可
系统 SHALL 在当前仓库保存 DSCode MIT 许可文本或第三方声明，并 SHALL 记录复制文件对应的来源 commit。

#### Scenario: 检查第三方归属
- **WHEN** 发布流程检查复制来源
- **THEN** 可以从仓库内 notice 或清单确定 DSCode 来源、commit 和 MIT 条款
- **THEN** 该记录不需要访问 DSCode checkout

### Requirement: 外部 Devin CLI 依赖
系统 SHALL 要求用户独立安装和更新 Devin CLI，并 MUST NOT 在未取得书面授权时把 binary 打入安装包、自动下载或自动替换它。

#### Scenario: 打包 Desktop 应用
- **WHEN** 生成任一平台安装包
- **THEN** 包内不包含 Devin CLI binary
- **THEN** 首次启动通过 discovery 和诊断引导用户完成外部安装

### Requirement: 跨平台产物
系统 SHALL 提供 macOS arm64/x64、Windows x64 和 Linux x64 的构建配置，并 SHALL 对各平台 Devin sandbox 限制给出准确诊断。

#### Scenario: Windows 请求 sandbox
- **WHEN** Windows 平台上的当前 Devin CLI 不支持 OS sandbox
- **THEN** 系统显示不支持状态并拒绝以 sandbox 名义启动未隔离会话

### Requirement: 独立性完整性扫描
系统 SHALL 在验证流程中扫描 package manifest、lockfile、imports、scripts、symlinks 和构建产物 source map，确保不存在 DSCode 绝对路径、相对路径依赖或 runtime package。

#### Scenario: 引入 DSCode 路径依赖
- **WHEN** 某次变更在 manifest、import 或脚本中加入 DSCode checkout 路径
- **THEN** 完整性检查失败并指出引用位置

### Requirement: Secret 与日志保护
系统 SHALL 对 ACP stderr、错误、diagnostic 和 fixture 执行敏感信息过滤，并 MUST NOT 记录 token、credential 文件内容或完整敏感环境变量。

#### Scenario: CLI 返回含敏感值的错误
- **WHEN** ACP stderr 或认证错误包含 credential-like 数据
- **THEN** 持久化日志和 renderer 错误消息只包含脱敏值

### Requirement: 最窄验证集合
系统 SHALL 至少通过相关 workspace 的 typecheck、unit/contract test、build、pack 和完整性扫描，且 SHALL 不把浏览器 E2E 或截图验收设为默认必要条件。

#### Scenario: 准备实施交付
- **WHEN** 变更进入交付验证
- **THEN** 执行最窄静态和进程级检查并记录结果
- **THEN** 未被规范明确要求的真实浏览器自动化不阻塞交付
