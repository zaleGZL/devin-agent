## Why

当前输入框只能发送普通文本和已协商支持的图片，用户无法像 Devin 客户端一样通过 `@` 精确引用工作区文件、目录或当前 Devin 会话提供的 Skill。这使上下文选择依赖自然语言路径描述，也无法复用 ACP 已提供的结构化资源和运行时命令能力。

## What Changes

- 在消息输入框中增加 `@` 触发的上下文选择器，首期仅提供 Files、Directories、Skills 三类入口。
- Files 与 Directories 从当前已选择的工作区中搜索；未选择工作区时明确禁用这两类入口，避免默认扫描用户主目录。
- 已选择的文件或目录以可删除的 mention token 展示，并在发送、排队、编辑队列消息和重新发送时保持结构化上下文。
- Files 优先按 ACP `embeddedContext` 能力发送嵌入资源；不支持嵌入或资源不适合内联时退化为 ACP ResourceLink。Directories 作为 ResourceLink 发送，不递归嵌入整个目录。
- Skills 从 Devin 支持的全局目录和当前项目目录发现；同名时项目 Skill 覆盖全局 Skill。Desktop 只索引 `SKILL.md` 的名称、描述和来源，不读取正文作为 prompt，也不自行执行 Skill。
- 裸 `@` 展示 Files、Directories、Skills 分类；继续输入查询时直接跨三类搜索。Skill 只对 Name 执行大小写不敏感的连续子字符串匹配；Files/Directories 仍可使用路径匹配和低优先级模糊补充。
- 文件与目录索引按工作区缓存；Skill 在应用启动和每个新会话开始前刷新，并为会话保存不可变快照，持续聊天期间不因输入变化反复遍历。
- 增加键盘导航、空状态、能力降级、越界路径与符号链接防护，以及对应的主进程、IPC、状态管理和序列化测试。
- Git、Rules、Conversations、Terminal、Codemaps 等其他 Devin `@` 分类不在本次范围内。

## Capabilities

### New Capabilities

- `composer-at-mentions`: 定义 Files、Directories、Skills 的发现、选择、展示、序列化、排队和安全边界。

### Modified Capabilities

无。

## Impact

- Electron main：增加受工作区边界约束的文件/目录索引与搜索 IPC，并复用现有真实路径校验。
- Preload/shared：增加 mention 搜索、mention 数据结构和 ACP Resource/ResourceLink 内容类型。
- Renderer：扩展输入框、队列消息和发送管线，消费 main-side 引用索引、会话级 Skill 快照与 prompt capability。
- ACP：继续使用现有 Devin CLI 进程；不新增 provider、执行器、凭据访问或 Devin CLI 私有协议。
- 依赖：优先使用 Git 与 Node 标准能力完成索引和排序，不把 DSCode 或 Devin CLI 二进制引入依赖。
