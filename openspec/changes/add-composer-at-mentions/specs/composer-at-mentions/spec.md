## ADDED Requirements

### Requirement: `@` 选择器入口
系统 SHALL 在 composer 的可触发文本位置输入 `@` 时打开上下文选择器，并且首级只提供 Files、Directories、Skills 三类入口。

#### Scenario: 打开选择器
- **WHEN** 用户在空白后或输入起始位置输入 `@`
- **THEN** 系统展示 Files、Directories、Skills，并将键盘焦点保持在输入流程中

#### Scenario: 根级查询
- **WHEN** 用户在裸 `@` 后继续输入查询且没有先进入分类
- **THEN** 系统直接返回跨 Files、Directories、Skills 的结果；Files/Directories 可按名称或路径匹配，Skill 只在 Name 包含大小写不敏感的连续子字符串时返回

#### Scenario: 根级查询优先展示 Skill
- **WHEN** 根级查询同时匹配 Skill、File 或 Directory
- **THEN** 系统先展示全部匹配的 Skill，再展示 File 与 Directory，并保持各结果组内部的相关性排序

#### Scenario: 不支持的分类不出现
- **WHEN** 用户打开首级选择器
- **THEN** 系统不展示 Git、Rules、Conversations、Terminal 或 Codemaps

### Requirement: 键盘与鼠标导航
系统 SHALL 支持用方向键、Enter、Escape、Backspace 和鼠标完成分类进入、结果选择、返回与关闭，并提供可访问的活动项和空状态语义。

#### Scenario: 键盘选择结果
- **WHEN** 选择器打开且用户用方向键移动后按 Enter
- **THEN** 系统选择当前项、关闭选择器并在 composer 中加入对应 mention token

#### Scenario: 取消选择
- **WHEN** 用户按 Escape 或切换 session
- **THEN** 系统关闭选择器且不改变已有草稿与 mention token

### Requirement: 工作区文件与目录发现
系统 SHALL 只在当前已选择项目的工作区根内搜索 Files 和 Directories，并 SHALL 默认遵循 Git ignore、阻止符号链接越界和限制搜索资源消耗。

#### Scenario: 未选择项目
- **WHEN** 当前新会话没有选择项目
- **THEN** Files 和 Directories 显示“请先选择项目”的不可用状态，系统不扫描用户主目录

#### Scenario: 搜索工作区
- **WHEN** 用户进入 Files 或 Directories 并输入查询
- **THEN** 系统返回最多 100 个名称或相对路径匹配项，且旧查询结果不能覆盖更新查询

#### Scenario: 越界符号链接
- **WHEN** 候选路径的 realpath 位于当前工作区外
- **THEN** 系统不展示、不解析且不发送该候选

### Requirement: mention token 生命周期
系统 SHALL 将选择项保存为独立于普通文本的结构化 token，并在删除、立即发送、排队、队列编辑、队列重排和立即插队发送过程中保持其身份。

#### Scenario: 删除 token
- **WHEN** 用户点击 token 的删除操作
- **THEN** 系统只移除该 mention，不删除相邻普通文本或其他 mention

#### Scenario: 排队后编辑
- **WHEN** 含 mentions 的消息进入等待队列后被编辑
- **THEN** composer 恢复消息文本与所有 mentions，重新入队后仍发送相同结构化引用

### Requirement: 文件 ACP 序列化
系统 SHALL 在 main 进程发送前重新校验文件，并根据运行时 ACP prompt capability 选择 Embedded Resource 或 ResourceLink；系统 MUST NOT 由 renderer 读取文件正文。

#### Scenario: 小型文本文件且支持嵌入
- **WHEN** 文件位于当前工作区、为不超过 512 KiB 的 UTF-8 文本且 `embeddedContext === true`
- **THEN** 系统发送包含 main 读取文本、file URI 与 MIME 信息的 Embedded Resource

#### Scenario: 不支持嵌入或文件不适合内联
- **WHEN** `embeddedContext !== true`、文件超过上限或文件为二进制
- **THEN** 系统只发送包含 file URI、名称及可用元数据的 ResourceLink，不做无界文本或 base64 嵌入

#### Scenario: 文件在发送前变化
- **WHEN** 已选择文件在发送前被删除、替换为越界符号链接或变为特殊文件
- **THEN** 系统拒绝该引用、保留用户草稿并显示可操作错误

### Requirement: 目录引用
系统 SHALL 将当前工作区内的目录表示为可读相对路径标签和目录 ResourceLink，且 MUST NOT 递归嵌入目录或因普通 mention 修改 session 的 `additionalDirectories`。

#### Scenario: 发送工作区目录
- **WHEN** 用户选择一个 realpath 位于当前工作区内的目录并发送消息
- **THEN** 系统发送 `@relative/path/` 可读标签与对应 file URI ResourceLink，不读取全部子文件

#### Scenario: 目录协议不被运行时接受
- **WHEN** Devin ACP 明确拒绝目录 ResourceLink
- **THEN** 系统显示失败原因且不把该引用静默转换成 session 扩根

### Requirement: Skills 运行时发现
系统 SHALL 从 Devin 支持的全局和当前项目 Skill 目录发现 `SKILL.md`，合并时 SHALL 让项目同名 Skill 覆盖全局 Skill，并为每个 session 保存独立不可变快照。

#### Scenario: 合并全局与项目 Skill
- **WHEN** 全局目录和当前项目目录均存在 Skill
- **THEN** Skills 列表展示两者的名称与描述；同名时只展示项目版本

#### Scenario: 新会话刷新
- **WHEN** 应用启动后首次使用 Skills 或用户开始一个新会话
- **THEN** 系统重新扫描受支持目录并把结果缓存为该新 session 的 Skill 快照

#### Scenario: 进行中会话保持快照
- **WHEN** session 已开始且磁盘上的 `SKILL.md` 新增、删除或变化
- **THEN** 当前 session 的可搜索 Skill 不变，输入搜索不重新遍历目录；应用重启后重新打开时才重建

### Requirement: Skill 调用
系统 SHALL 通过 Devin 的 `@skills:<name>` 语法调用当前 session 快照中的 Skill，并 SHALL 限制每条 prompt 最多一个 Skill mention。

#### Scenario: Skill 只按 Name 匹配
- **WHEN** 用户搜索 Skill
- **THEN** 系统只判断查询是否为 Skill Name 的大小写不敏感连续子字符串，不使用 command、description、source 或非连续模糊字符产生匹配

#### Scenario: 带用户指令调用 Skill
- **WHEN** 用户选择 Skill、输入任务说明并发送
- **THEN** 系统把 `@skills:<name>` 置于 prompt 文本开头并交由 Devin CLI 执行

#### Scenario: 替换已选 Skill
- **WHEN** 草稿已有 Skill mention 且用户选择另一个 Skill
- **THEN** 系统用新 Skill 替换旧 Skill并保留普通文本及文件/目录 mentions

### Requirement: 历史与展示一致性
系统 SHALL 在本地发送生命周期中展示已选择 mentions，并且在加载历史时只根据 ACP 实际返回的 Resource 或 ResourceLink 重建资源 mention。

#### Scenario: 本地发送后展示
- **WHEN** 含 mentions 的 prompt 已提交到当前 session
- **THEN** 用户消息立即展示对应 token，不等待 Agent 首次响应

#### Scenario: 历史没有结构化资源
- **WHEN** 加载的 ACP 历史只包含普通文本而没有 Resource 或 ResourceLink
- **THEN** 系统按普通文本展示且不从 `@` 字符串猜测 mention

### Requirement: 安全与隐私边界
系统 SHALL 让 main 成为路径解析和内容读取的唯一执行边界，默认过滤 ignored/敏感候选，并保持 Devin CLI 的权限、sandbox 和组织策略不变。

#### Scenario: renderer 伪造绝对路径
- **WHEN** renderer 请求解析未由当前工作区候选产生的绝对路径或 `..` 越界路径
- **THEN** main 拒绝请求且不读取或发送内容

#### Scenario: 敏感文件确认
- **WHEN** 用户选择常见凭据、密钥或环境文件
- **THEN** 系统在发送前给出明确确认提示，取消时保留草稿且不发送资源

### Requirement: 验证与降级
系统 SHALL 通过 mock ACP 测试覆盖能力组合与路径失败，并提供 opt-in 真实 Devin ACP smoke 场景验证本地 file URI 和目录行为。

#### Scenario: 自动化回归验证
- **WHEN** 执行仓库检查
- **THEN** 类型、单元测试、构建和独立性检查覆盖 mention 数据、搜索、序列化、队列及 capability 降级

#### Scenario: 真实协议验证未执行
- **WHEN** 环境没有启用 `DEVIN_LIVE_TEST=1`
- **THEN** 自动化测试不得宣称已验证当前 Devin 服务对目录 ResourceLink 的真实支持
