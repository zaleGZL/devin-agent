## Context

当前 renderer 用 textarea 管理文本草稿，发送管线只把文本、图片和 annotation 转成 prompt；main 负责 Devin ACP 进程、文件系统和受校验的原生 IPC。ACP v1 没有独立 mention 类型，但规定 Text 与 ResourceLink 是 prompt 基线，并在运行时 `promptCapabilities.embeddedContext=true` 时允许 Embedded Resource。Devin Skills 是文件系统约定：Desktop 可索引 Skill 的轻量 metadata，但必须继续由 Devin CLI 解析和执行。

Devin 文档把 `@` 定义为文件/目录补全，并把 `@skills:<name>` 定义为显式 Skill 调用语法。因此 Desktop 只负责发现 metadata、选择和 prompt 序列化，不能读取 `SKILL.md` 正文后自行拼装 prompt，也不能把普通目录引用误实现为 `additionalDirectories` 扩权。

## Goals / Non-Goals

**Goals:**

- 在 composer 内提供 Files、Directories、Skills 三类 `@` 搜索与选择体验。
- 保留 mention 的结构化身份，使其在立即发送、等待队列、编辑和重排后仍能正确序列化。
- 所有文件系统访问留在 main，所有可选 ACP 内容按运行时 capability fail-closed。
- 索引 Devin 支持的全局与项目 Skill 位置，并按会话保存不可变候选快照；Desktop 不成为 Skill 执行器。
- 让搜索在大型仓库中可取消、有界且不扫描用户主目录。

**Non-Goals:**

- Git、Rules、Conversations、Terminal、Codemaps 等其他 `@` 分类。
- 工作区外目录授权、动态修改 session roots 或递归嵌入目录。
- 读取或复制 `SKILL.md` 正文作为模型上下文，以及静态内置 Skill 清单。
- 用自定义 ACP mention 类型、Devin 私有未公开方法或 DSCode 代码/依赖。

## Decisions

### 1. mention 是独立的草稿数据，不是文本路径

新增 `MentionRef`，只保存稳定 ID、`kind`、工作区相对路径或 Skill command、展示名称和必要 metadata。草稿与队列项持有 `mentions: MentionRef[]`；composer 用可删除的 token/chip 展示。输入 `@` 只负责打开选择器，选中后移除触发查询片段并加入 token。

这样可避免把路径字符串当授权依据，也可让排队、编辑和重排保持引用。备选方案是直接把 `@path` 写入 textarea，但它无法可靠区分用户普通文本、重命名后的路径和已校验资源，因此不采用。

### 2. 文件与目录搜索由 main 提供有界 IPC

preload 暴露最小的 `mentions.search` 接口；renderer 只传 session/workspace 标识、类别、查询和分页上限。main 从可信 session/project 状态取得工作区根，执行 `realpath`、`stat`、边界检查和搜索，返回相对路径与类型，不返回文件正文或任意 Node 能力。

Git 工作区优先用 `git ls-files --cached --others --exclude-standard -z` 获得默认遵循 `.gitignore` 的候选；非 Git 工作区使用不跟随符号链接的有界遍历。搜索默认排除 `.git`、`node_modules` 和构建缓存，单次最多返回 100 项，索引设置受控候选上限；renderer 使用 120ms debounce 和可取消请求，旧请求结果不得覆盖新查询。文件树只在首次使用或显式刷新时建立，输入字符仅在内存候选上排序。未选择项目时 Files/Directories 不可用，Skills 仍可用。

备选方案是在 renderer 扫描目录，但这违反 renderer 无 Node 访问的架构和路径安全边界，因此不采用。

### 3. main 在发送时重新解析资源并生成 ACP 内容块

renderer 发送 `{ text, images, annotations, mentions }` 的内部 prompt。main 以当前 session 的工作区根重新 `realpath/stat` 每个路径，拒绝不存在、特殊文件、软链接越界和 `..` 越界，随后用 `pathToFileURL` 生成 URI。搜索结果不是持续授权，发送时校验用于抵御 TOCTOU。

- 小型 UTF-8 文本文件：当 `embeddedContext === true` 且不超过 512 KiB 时，生成 Embedded Resource；否则生成 ResourceLink。
- 二进制或超过 512 KiB 的文件：只生成 ResourceLink，不做无界 base64。
- 目录：生成可读的 `@relative/path/` 文本标签和目录 ResourceLink，不递归读取，也不修改 `additionalDirectories`。
- 资源标签追加到用户文本的独立上下文行；用户原文保持不变。

ResourceLink 是 ACP prompt 基线；Embedded Resource 必须继续按 runtime capability 门控。若真实 Devin ACP 不接受本地目录 URI，Directories 必须显示不可用/实验错误，不能以扩根冒充成功。

### 4. Skills 使用全局与项目索引，并按会话冻结

main 只检查 Devin 支持的 Skill 根目录下一级子目录中的 `SKILL.md`。项目位置为 `.agents/skills`、`.devin/skills`、`.github/skills`、`.claude/skills`、`.cursor/skills`、`.codex/skills`、`.cognition/skills`、`.windsurf/skills`、`.codeium/skills`；全局位置为 `~/.agents/skills`、`~/.config/devin/skills` 与 `~/.codeium/<channel>/skills`。只读取有界 YAML frontmatter 中的 `name`、`description`；调用标识始终取包含目录名，显示名称缺失时才回退到目录名，不读取正文作为 prompt。

先合并全局 Skill，再以项目 Skill 覆盖同名项。应用启动后首次使用会建立草稿缓存；每个新会话真正开始前强制重扫并把结果绑定为该 session 的不可变快照。已开始的会话在切换或持续聊天时始终复用自己的快照；只有应用重启后第一次重新打开该会话才重建。这样输入检索不会触发文件系统遍历，也不会让后台 session 的可选 Skill 随磁盘变化漂移。

选中 Skill 后保存规范名称；发送时把 `@skills:<name>` 放在 prompt 文本最前面，由 Devin CLI 解析与执行。一个 prompt 最多选择一个 Skill；选择新 Skill 替换旧 Skill。main 发送前必须用当前 session 快照校验名称，Skill 已从新会话快照消失时拒绝发送并保留草稿。

### 5. 选择器支持分类浏览与根级跨类型查询

在光标位于可触发位置只输入 `@` 时显示一级分类；用户继续输入查询时，直接查询 Files、Directories、Skills 的内存候选。Files/Directories 可对名称与路径执行连续子字符串匹配，并用 subsequence 作为次级模糊匹配；Skills 只对展示 Name 执行大小写不敏感的连续子字符串匹配，command、description、source 不参与过滤，也不使用 subsequence。用户仍可先选择分类再进行限定搜索。支持方向键、Enter、Escape、Backspace 返回、鼠标点击；焦点、ARIA active descendant 和空状态可被辅助技术识别。结果显示名称与相对路径/描述，禁止把绝对 home 路径作为主文案。

根级混合查询采用稳定的分组优先级：Skills 始终位于 Files 与 Directories 之前；每组内部继续保留自身的相关性排序。这样可让显式能力调用优先于同名目录或文件，同时不改变分类内搜索行为。

菜单锚定输入框并限制在窗口可视区域；项目切换、session 切换、发送或失焦时关闭。该交互不引入新的富文本编辑器依赖，以降低对现有 annotation、队列和输入法逻辑的回归风险。

### 6. 本地状态和历史展示采用可恢复但不伪造的策略

队列项必须序列化完整 `MentionRef`；编辑队列消息时恢复 token。发送后，当前运行期使用本地 optimistic message metadata 展示 mention token。加载历史 session 时，仅当 ACP 历史返回 Resource/ResourceLink 时重建文件/目录 mention；若历史只返回文本则按文本展示，不能猜测或伪造 mention。

## Risks / Trade-offs

- [目录 ResourceLink 的 Devin 行为未由公开文档保证] → 增加真实 ACP smoke 场景；不通过时将 Directories 显示为不可用，且不改用 `additionalDirectories`。
- [大型仓库索引延迟或过期] → 有界索引、取消旧查询、缓存按工作区失效，并在发送时二次校验。
- [文件内容包含秘密] → 默认遵循 `.gitignore`，对常见凭据文件提示确认；最终读取仍由 main 受控，且不改变 Devin 权限模式。
- [ResourceLink 暴露绝对 file URI 给本地 Devin 进程] → 仅允许当前工作区内 realpath；UI 与持久化状态保留相对路径，不向远程 provider 扩展本能力。
- [Skill metadata 可能损坏或与磁盘正文变化不同步] → 有界解析并逐项容错；调用前按 session 快照校验，正文始终由 Devin CLI 在执行时读取。
- [token 与 textarea 分离不是真正的行内富文本] → 视觉上放在 composer 上下文区并提供清晰删除/预览；优先保证输入法、annotation 和队列稳定。

## Migration Plan

1. 先增加共享 mention/ACP 类型、main 搜索与序列化单元测试，不改变旧 prompt 的输出。
2. 接入 preload 与 renderer 选择器，再扩展队列和 optimistic message 状态。
3. 在 capability fixture 中覆盖 Embedded Resource 开关，并覆盖 Skill 索引刷新与会话快照生命周期。
4. 运行 `pnpm check`、`pnpm check:independence`；经用户授权的本机环境再运行 `DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin` 验证文件与目录 URI。
5. 若出现回归，可隐藏 `@` 入口；旧文本/图片 prompt 数据结构保持兼容，无持久化迁移阻塞启动。

## Open Questions

- 真实 Devin ACP 对 `file://` 目录 ResourceLink 与文本 `@relative/path/` 的优先解释行为，需要 live smoke 结果决定 Directories 是否在首版正式开放。
- Devin 未来是否会通过 ACP 暴露正式 Skill 列表；若提供稳定能力，可在不破坏会话快照语义的前提下替代本地 descriptor 索引。
