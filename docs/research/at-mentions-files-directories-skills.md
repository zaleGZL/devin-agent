# `@` 引用（Files / Directories / Skills）可行性研究

> 研究日期：2026-08-22；补充核对：2026-08-22
>
> 结论先行：Devin CLI 的 `@` 是交互层的补全入口，ACP v1 没有独立的“mention”类型；文件引用应优先映射为 ACP `resource_link`（协议基线），在 Devin ACP 明确广告 `promptCapabilities.embeddedContext` 时才发送内嵌 `resource`。当前工作区内的目录应发送可读标签与目录 ResourceLink，不能递归嵌入；`additionalDirectories` 只适合后续显式授权工作区外根目录，不能用一次普通 mention 静默扩大 session 根。Skills 可从受支持目录建立 metadata 快照，并按 Devin 当前文档定义的 `@skills:<name>` 文本语法调用；正文加载与执行仍必须完全交给 Devin CLI。

## 1. 证据范围与阅读方式

**事实。** `docs/devin-cli/` 是官方 Devin CLI 文档的本地镜像，索引注明来源为 `https://docs.devin.ai/cli/`（[索引](../devin-cli.md) 第 1–4 行）。本报告同时核对了现有 Electron 主进程、preload、renderer 和共享 ACP 类型，并以 ACP v1 官方规范作为协议边界。

**来源。**

- Devin CLI 本地镜像：[配置文件](../devin-cli/reference/configuration/config-file.md)、[配置层级](../devin-cli/reference/configuration/global-vs-local.md)、[命令参考](../devin-cli/reference/commands.md)、[快捷键](../devin-cli/reference/keyboard-shortcuts.md)、[Skills 概览](../devin-cli/extensibility/skills/overview.md)、[创建 Skills](../devin-cli/extensibility/skills/creating-skills.md)、[ACP/JetBrains](../devin-cli/acp/jetbrains.md)。
- Devin 当前在线一手文档：[Skills](https://docs.devin.ai/product-guides/skills)（技能文件位置、索引仓库/克隆仓库、会话开始和重新扫描行为）。在线页面比仓库内的旧镜像更新，以下差异会明确标注。
- 其他 Coding Agent 一手资料：VS Code 官方文档的[搜索说明](https://github.com/microsoft/vscode-docs/blob/main/docs/editing/codebasics.md)、[搜索问题排查](https://github.com/microsoft/vscode/wiki/Search-Issues)，以及官方源码的[`anythingQuickAccess.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts)和[`fuzzyScorer.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/fuzzyScorer.ts)。
- 仓库架构约束：[AGENTS.md](../../AGENTS.md) 第 24–31、54–60、70–71 行：主进程拥有 Devin 子进程、文件系统和原生能力；preload 是校验后的 IPC 桥；renderer 不得执行第二套 agent/Skills/Rules；未广告的 ACP 能力不得调用。
- ACP v1 官方：[Content](https://agentclientprotocol.com/protocol/v1/content)、[Initialization](https://agentclientprotocol.com/protocol/v1/initialization)、[Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)、[Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)、[File System](https://agentclientprotocol.com/protocol/v1/file-system)、[Slash Commands](https://agentclientprotocol.com/protocol/v1/slash-commands)。

## 2. `@`、文本和 ACP 结构化内容的边界

### 2.1 结论矩阵

| 方式 | 协议事实 | 对本项目含义 |
| --- | --- | --- |
| 在文本中发送 `@path` | Devin CLI 快捷键只说明 `@` 打开文件/目录自动补全（本地镜像 `reference/keyboard-shortcuts.md` 第 11–30 行）；ACP 将命令和普通消息作为 `session/prompt` 中的文本发送（官方 [Slash Commands](https://agentclientprotocol.com/protocol/v1/slash-commands) 的 Running commands）。ACP v1 没有 `mention`/`file_mention` 内容类型。 | 可以做兼容性降级，但它只是字面量文本，不能保证 Devin ACP 读取该路径，也丢失 URI、mime、大小等元数据。不能把文本 `@` 当作成功的文件/目录引用。 |
| `ContentBlock::resource_link` | ACP v1 的 `Resource Link` 有 `uri`、`name`、可选 `mimeType`/`title`/`description`/`size`（官方 [Content](https://agentclientprotocol.com/protocol/v1/content) 的 Resource Link）。初始化规范将 `Text` 和 `ResourceLink` 列为 Agent 必须支持的 prompt 基线（官方 [Initialization](https://agentclientprotocol.com/protocol/v1/initialization) 的 Prompt capabilities）。 | 文件引用的首选 MVP；只发送文件 URI/元数据，不把整个文件内容复制到 prompt。仍需在真实 Devin ACP smoke test 中确认它对本地 `file://` URI 的实现行为；文档没有给出 Devin 专属的 ResourceLink 示例。 |
| `ContentBlock::resource`（Embedded Resource） | 内容块包含完整 `uri` + `text` 或 `blob`；ACP 明确称这是“使用 `@` 引用文件等资源时首选”的方式，但需要 Agent 在 `initialize` 中广告 `promptCapabilities.embeddedContext`（官方 [Content](https://agentclientprotocol.com/protocol/v1/content) 的 Embedded Resource；[Initialization](https://agentclientprotocol.com/protocol/v1/initialization) 第 Prompt capabilities）。 | 只有运行时 capability 为 `true` 才可发送。应对文本文件做大小/编码上限；二进制优先 ResourceLink，不要默认转 base64。 |
| 目录的内容块 | ACP v1 没有专用目录内容块，也没有“递归读取目录”的 prompt 类型；ResourceLink 只规定 URI/名称等通用资源元数据。 | 首期目录引用应限制在当前工作区，发送相对路径标签与 `file://` ResourceLink，并以真实 Devin ACP smoke 验证目录 URI 行为；不要递归打包目录。`additionalDirectories` 是扩展根目录，不是普通 mention 的替代物。 |

**事实。** 当前共享类型仅把 `resource` 定义成通用 `JsonObject`，没有显式 `resource_link` 类型（`apps/desktop/src/shared/acp-types.ts` 第 162–182 行）；renderer 的 prompt builder 只构造 text/image（`apps/desktop/src/renderer/lib/capabilities.ts` 第 38–70 行）；主进程 prompt 目前只对 image 做 capability 检查（`apps/desktop/src/main/devin-acp-host.ts` 第 423–449 行）。

**推论。** 新的引用状态必须独立于纯文本和现有 response annotation。当前 annotation 会把选择内容序列化为普通文本标记（`apps/desktop/src/renderer/lib/annotations.ts` 第 19–33 行），复用该机制会让路径失去结构化语义，并可能把用户输入误当作 annotation。

**建议。** renderer 只维护编辑器中的 `@` 查询、选择项和可视化 chip；发送时由 main/preload 将稳定的引用对象转换为 ACP 内容块。可在文本块中保留一行可读标签，但标签不是权限或路径依据。

## 3. 文件与目录发现：主进程、preload、renderer 的职责

### 3.1 现状证据

- 仓库约束明确主进程“owns Devin subprocess, filesystem, native capabilities”，preload 是校验后的 IPC bridge，renderer 无 Node 访问（[AGENTS.md](../../AGENTS.md) 第 24–31 行）。
- 现有 preload 仅暴露文件选择/预览、校验候选路径等 IPC（`apps/desktop/src/preload/index.ts` 第 36–50 行），没有目录枚举、路径元数据或 `realpath` API。
- 文件 IPC 在主进程执行 `realpath`、工作区边界校验和文件预览（`apps/desktop/src/main/index.ts` 第 481–544 行）。这说明安全路径解析已经是 main 的责任，但现有 `files:valid-preview-paths` 只接受少量候选文件且仅服务预览（第 515–529 行）。
- ACP 的文件系统方法是 Agent 调用 Client 的 `fs/read_text_file`/`fs/write_text_file`，并且 Agent 必须先检查 Client 的 `initialize` capability（官方 [File System](https://agentclientprotocol.com/protocol/v1/file-system)）。这不是桌面端“发现目录”的替代 API；桌面端仍需在本地完成安全枚举，再把引用交给 ACP。

### 3.2 推荐分层

1. **renderer：** 监听 `@`，做 debounced 子字符串搜索、分组显示 Files/Directories/Skills；只接收 main 返回的名称、相对显示路径、类型、大小和稳定引用 ID。不能直接读目录、跟随软链接或读取 `SKILL.md`。
2. **preload：** 增加最小 IPC（例如 `mentions.search`、`mentions.resolve`），对参数做长度、数量和类型校验；不暴露任意 Node API。
3. **main：** 依据当前 session 的 `cwd` 与已授权 additional roots 构造有效根；执行 `realpath/stat/readdir`、忽略规则、软链接和大小限制；发送前再次解析并校验，防止“搜索后文件被替换”的 TOCTOU 问题。
4. **ACP host：** 根据 initialize/session capability 生成 `resource_link`/`resource`。首期目录仅允许当前工作区内路径；未来若支持工作区外目录，再单独设计显式授权与 session `additionalDirectories` 生命周期。未广告的可选能力不得调用。

## 4. Files 的可行实现

**事实。** ACP `session/prompt` 的 `prompt` 是 `ContentBlock[]`，官方示例同时发送 text 和 resource（[Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn) 第 User Message）；现有 host 已接受 `PromptContent[]`（`apps/desktop/src/main/devin-acp-host.ts` 第 423–449 行），但 renderer 尚未生成资源块。

**建议的数据形状（内部，不是新增 ACP 类型）：**

```ts
type MentionRef = {
  kind: "file";
  absolutePath: string;       // main 解析后的 realpath，不接受 renderer 传入的 URI 作为权限依据
  displayPath: string;        // UI 展示，可为相对 cwd 的路径
  uri: string;                // pathToFileURL(absolutePath).href
  mimeType?: string;
  size: number;
};
```

发送策略：

- `embeddedContext === true`：对大小受限的文本文件读取 UTF-8 内容，发送 `{ type: "resource", resource: { uri, mimeType, text } }`。ACP 文档要求完整内容并明确其适用于 `@` 上下文；超过上限、无法解码或二进制文件只发送 ResourceLink 或提示用户。
- 其它情况：发送 `{ type: "resource_link", uri, name, mimeType, size }`。ResourceLink 是 ACP prompt 基线，但 Devin ACP 是否接受本地 `file://` URI 尚无仓库 fixture 证明，必须增加 `DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin` 场景验证（命令见 [AGENTS.md](../../AGENTS.md) 第 18–22 行）。
- 若 Agent 既没有 ResourceLink 实现（违反 ACP v1 基线）又没有 Embedded Resource capability：不发送 `@` 引用，保留可复制的纯文本路径并显示错误；禁止静默把大文件内容拼进文本。

**不要做。** 不把绝对路径直接拼入系统 prompt 作为唯一实现，不从 renderer 读取文件，不默认传输密钥/`.env`/证书内容，不允许用户通过 `@` 绕过 Devin CLI 的权限模式。

## 5. Directories 的可行实现与限制

**事实。** Devin CLI 明确把 `@` 定义为本地文件/目录自动补全（本地 [快捷键](../devin-cli/reference/keyboard-shortcuts.md) 第 29 行），但 ACP v1 没有独立目录块。ResourceLink 是通用 URI 资源且属于 prompt 基线；协议没有承诺 Agent 如何解释 `file://` 目录 URI，因此必须用真实 Devin ACP 验证。

**事实。** ACP `sessionCapabilities.additionalDirectories` 允许在 `session/new`、`session/load`、`session/resume` 上传入额外工作根；它改变的是 session 可访问根集合，并要求绝对路径和完整列表（官方 [Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup) 的 Additional Workspace Roots）。这比“引用当前工作区中的一个目录”拥有更大的权限与生命周期影响。

**首期建议流程：**

1. 选择目录时 main 先 `realpath`，确认它是目录且位于当前 session 的 `cwd` 内。
2. UI 用 chip 表示工作区相对路径；发送时加入可读的 `@relative/path/` 标签和目录 ResourceLink，不读取或递归附加子文件。
3. 若真实 Devin ACP smoke 证明目录 ResourceLink 不被解释为上下文，则该版本必须把 Directories 标记为受限/实验能力，而不是偷偷改成扩根。
4. 工作区外目录引用另立后续能力：必须由用户显式授权，并在 `additionalDirectories` capability 存在时管理 new/load/resume 的完整根列表。

**明确限制。** 普通目录 mention 不发送 `additionalDirectories`，也不调用 `/add-dir`；不能因为用户引用一个子目录就扩大或重载整个 session 的工作根。

## 6. Skills 的发现、引用和边界

### 6.1 Devin 负责加载和执行

**事实。** Skills 会注入 prompt、限制工具、应用权限并可切换模型（本地 [Skills 概览](../devin-cli/extensibility/skills/overview.md) 第 81–89 行）；第三方 Skills 可以执行任意代码（第 114–120 行）。仓库规则也明确 Skills/Rules/Plugins 等均由 Devin CLI 执行，桌面端只发送请求和展示结果（[AGENTS.md](../../AGENTS.md) 第 54–60 行）。

**推论。** Desktop 不应读取 `SKILL.md` 正文后自行拼 prompt，也不应在本地实现技能运行器。`@` 菜单只索引名称、描述与来源，选中后发送 Devin 文档定义的 `@skills:<name>` 普通文本；是否加载正文、如何运行以及工具权限仍由 Devin CLI 决定。

### 6.2 发现位置

| 范围 | 目录/来源 | 已核对的行为 |
| --- | --- | --- |
| 仓库内（当前在线 Devin 文档） | `.agents/skills/<name>/SKILL.md`、`.devin/skills/<name>/SKILL.md`、`.github/skills/<name>/SKILL.md`、`.claude/skills/<name>/SKILL.md`、`.cursor/skills/<name>/SKILL.md`、`.codex/skills/<name>/SKILL.md`、`.cognition/skills/<name>/SKILL.md`、`.windsurf/skills/<name>/SKILL.md`、`.codeium/skills/<name>/SKILL.md` | 在线官方文档明确写明这 9 个路径会在每个仓库扫描（[Devin Skills](https://docs.devin.ai/product-guides/skills) 的 “Supported Skill File Locations”）。用户提供的路径列表与此一致。 |
| Devin 后端索引仓库 | 已连接组织的仓库中的 `SKILL.md` | 会话开始前即可用，即使仓库尚未克隆到会话机器（[Devin Skills](https://docs.devin.ai/product-guides/skills) 的 “Indexed repos”）。 |
| 已克隆仓库 | 克隆到会话机器后的上述仓库路径 | Devin 会扫描磁盘；同一仓库的磁盘版本会更新或覆盖索引版本。仓库在会话中途克隆完成时会自动重新扫描（同一官方页面的 “Cloned repos”）。 |
| 本地全局目录（仓库镜像） | `~/.agents/skills/<name>/SKILL.md`、`~/.config/devin/skills/<name>/SKILL.md`、`~/.codeium/<channel>/skills/<name>/SKILL.md` | 仓库内镜像曾记录这些路径（[本地旧镜像](../devin-cli/extensibility/skills/overview.md) 第 124–143 行），但当前在线官方页面已说明“global/org-level skills”尚未作为独立能力提供。不能把旧镜像当作当前 Devin ACP 的稳定协议。 |

**版本差异与产品决策。** 当前在线文档是更高优先级的一手来源：Devin 官方目前把 Skills 定义为仓库内 `SKILL.md`，并用后端索引和克隆后磁盘扫描提供会话能力；它没有承诺 `~/.config/devin/skills` 等本机全局目录可被 ACP 列出。用户要求的“全局目录 + 当前项目目录”可以作为 Desktop 的本地聚合策略，但应明确这是本产品的发现层，不代表 Devin ACP 已广告该能力；Desktop 不读取全局/项目 `SKILL.md` 正文，也不执行技能。

项目根由 `.git`/`.jj` 向上查找，项目 `.devin/` 配置从根加载；嵌套 `.devin/` 有优先级（本地 [配置层级](../devin-cli/reference/configuration/global-vs-local.md) 第 169–175 行）。在线 Skills 文档没有规定 9 个仓库路径之间的同名覆盖顺序，也没有规定“全局目录覆盖项目目录”的顺序；因此产品应显式固定为“项目项覆盖同名全局项”，并在结果中保留来源（project/global）供调试，不要声称这是 Devin 官方优先级。

**可行方案：**

- ACP v1 的 `available_commands_update` 可描述 slash commands，但 Skills 无需假装成 ACP capability。Devin 当前官方 Skills 页面明确规定可在任意 prompt 中发送 `@skills:skill-name`，因此 Desktop 可以把本地 descriptor 用作补全并发送这段普通文本；这不等于 Desktop 自行执行 Skill。
- 协议没有 `isSkill` 字段，Devin CLI 的 `devin skills list/show/paths` 是 CLI 管理命令（本地 `reference/commands.md` 第 169–183 行），文档未规定 JSON 输出或 ACP 对应 method。因此不能把人类可读 stdout 当作稳定协议。
- **MVP 建议：** 由 main 生成“全局目录 + 当前项目 9 个路径”的轻量 descriptor 索引（只读有界 frontmatter/文件名元数据，不读正文），并以 session 不可变快照驱动补全。选择后发送 `@skills:<directory-name>`；本地 descriptor 不能绕过 Devin 的权限、sandbox 或组织策略，也不能直接把 `SKILL.md` 正文拼进 prompt。

### 6.3 技能列表的生命周期

**事实。** Devin 在每个 session 开始时提供可用技能的名称和描述；仓库克隆完成后会重新扫描；官方文档还允许在技能被修改或推送后请求 Devin “search/list/reload” 技能（[Devin Skills](https://docs.devin.ai/product-guides/skills) 的 “How Devin Uses Skills”）。因此“会话开始加载一次”并不等于“永远不刷新”：刷新边界由 session 和重新扫描事件决定。

**针对 Desktop 的可验证策略：**

1. App 启动时加载一次全局 descriptor 索引；项目打开或路径变更时加载项目 descriptor，并以 `project` 覆盖同名 `global`。
2. 新建 session 之前重新获取当前项目和全局 descriptor，并记录该 session 的不可变 snapshot；这样新会话能看到新增/修改的技能，持续聊天不会因输入每个字符而扫描磁盘。
3. 持续聊天期间不更新 snapshot；普通搜索只在内存索引上过滤。磁盘变化只影响应用重启后恢复的 session 或下一次新建 session。
4. 切换到已有 session 时使用该 session 的 snapshot；只有该 session 被恢复/重新建立时才重新获取，避免不同 session 的技能列表互相污染。
5. 发送前按当前 session 快照校验 canonical name；Desktop 只发送 `@skills:<name>`，不读取正文、不运行 Skill，也不伪造 ACP method。

## 7. 路径、安全、忽略规则和性能

### 7.1 路径和软链接

**事实。** ACP 的 `cwd` 与 `additionalDirectories` 必须是绝对路径，有效根集合应约束文件工具（官方 [Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)）。当前 main 已对选择文件调用 `realpath`（`apps/desktop/src/main/index.ts` 第 505–513 行）。

**建议不变量：**

- 所有 renderer 输入先做 `realpath`，再 `stat`，最后检查是否位于 `cwd` 或 additional roots 内；URI 只能由 main 用 `pathToFileURL` 生成。
- 对符号链接按解析后的目标路径检查；目标越界则拒绝，避免用 `link/../` 或替换文件绕过根边界。若产品需要展示链接本身，可只显示元数据，不发送其越界目标。
- 拒绝 `..` 越界、空路径、设备/特殊文件和不存在的路径；根路径本身可选择但不应递归读取。

### 7.2 Git 忽略和敏感文件

**事实。** Devin 配置中 `include_gitignored_files` 只影响 `@` 自动补全，默认不显示 gitignored 文件；`respect_gitignore` 独立控制 agent 工具是否访问 gitignored 路径（本地 [配置文件](../devin-cli/reference/configuration/config-file.md) 第 226–242 行）。这两个设置不能混为一个桌面权限开关。

**建议。** Desktop 搜索默认遵循 `include_gitignored_files=false` 的用户预期，但不要偷偷改写 Devin 配置；如果无法读取 CLI 配置，应在 UI 标注“补全过滤不代表 Agent 工具权限”。对 `.env`、SSH 密钥、云凭证等敏感文件至少给出发送前警告；不能仅因路径出现在补全中就绕过 Devin 的 `Read(...)`/sandbox/组织策略。

### 7.3 性能和一致性

**其他 Coding Agent 的一手证据。** VS Code 的 Quick Open 不是“每次按键都递归遍历”：官方源码在一次 picker 生命周期内创建 `FileQueryCacheState`，文件搜索未准备好时用 `ThrottledDelayer` 合并输入，查询结果通过 `searchService.fileSearch` 获取，并提供 `clearCache(cacheKey)` 失效入口（[`anythingQuickAccess.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts#L3050-L3138)）。候选项拿到后，VS Code 用 `scoreItemFuzzy`/`compareItemsByFuzzyScore` 在内存中排序，并把 label、description、是否允许非连续匹配和规范化 query 的 hash 作为 scorer cache key（[`fuzzyScorer.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/fuzzyScorer.ts#L2671-L2691)）。官方文档说明普通文件搜索由 ripgrep 驱动，并遵循 `.gitignore`、`.ignore`、`.rgignore` 和工作区排除设置（[Search Issues](https://github.com/microsoft/vscode/wiki/Search-Issues#missing-search-results)）。这三点可直接迁移为本项目的设计约束：文件枚举缓存、输入节流、纯内存匹配/排序，以及明确的失效边界。

**子字符串匹配与模糊匹配必须区分。** 用户输入 `@pack` 时，至少应命中 `package.json`、`src/packager.ts` 等候选，因为 query 是候选显示路径或 basename 的不区分大小写连续子字符串；不应只做前缀或完整词匹配。VS Code 的 `fuzzyScorer` 进一步支持非连续字符匹配，并对 label 前缀、label 内命中、description/path 命中分别加权（[`fuzzyScorer.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/fuzzyScorer.ts#L2774-L2858)）；本产品可以把连续子字符串作为硬过滤条件，把非连续匹配作为可选的低优先级排序项，但不能用纯 subsequence 结果替代用户明确要求的子字符串命中。

**本项目现状审计。** `apps/desktop/src/main/mention-index.ts` 的 `rankMentionPaths` 已按 exact → basename prefix → basename substring → path substring → subsequence 排序，因此 Files/Directories 的连续子字符串基础已经存在；但该函数只接收路径数组，Skills 的 `skillCommands` 目前只消费 ACP `category === "Skills"` 命令，不会把全局/项目 descriptor 纳入同一匹配器。这正是 `@pack` 对技能没有结果时应优先排查的边界：不是把文件扫描改成每次遍历，而是让技能 descriptor 进入同一内存索引，并按名称/描述做子字符串过滤。

**建议。** 采用以下上限和机制，避免输入 `@` 后扫描整个 home：

- 启动/项目打开/新 session 前建立一次候选索引：Files/Directories 是当前有效根内的相对路径，Skills 是全局与项目 descriptor；索引对象应保持不可变，查询只在内存中执行。
- 搜索键规范化为 `localeLowerCase`/Unicode 归一化，先做连续子字符串过滤，再按 exact、basename 前缀、basename 中段、完整路径命中和（可选）非连续模糊命中排序；结果必须包含高亮区间，便于验证用户输入确实命中。
- 对同一个 `indexVersion + kind + normalizedQuery + limit` 可缓存排序结果；不要把 query 作为唯一缓存，root、项目来源、Skills 覆盖结果和忽略配置也必须参与版本键。
- 输入采用短 debounce/throttle；每次新查询取消旧任务或以 generation token 丢弃旧结果，不能让慢的旧枚举覆盖新 query。VS Code 同时使用 throttled file search 与 cancellation token，应保持同样的不变量。
- 索引失效只由明确事件触发：App 重启、项目根变化、新 session 创建或文件系统错误；不要用固定 TTL 让 UI 在持续输入时反复遍历。进行中的 session 不接收 watcher 或显式 reload 导致的 Skill 变化，这是用户要求的快照不变量。
- 工作区文件增删可以通过 `fs.watch`/Git 状态变化做去抖批量更新；只重建受影响 root 的索引。技能 descriptor 变化沿用 6.3 的 session snapshot 规则。
- 选中后发送前再次 `realpath/stat` 和大小检查，处理文件删除、替换和权限变化。
- Resource 内嵌设置明确字节上限并计算 prompt 预算；超过上限改用 ResourceLink/报错，不做无界 base64。

## 8. MVP、验收和明确不支持项

### 8.1 建议 MVP

1. `@` 面板支持 Files/Directories 两个分组；首期搜索只覆盖当前 `cwd`，不扫描主目录或工作区外路径。
2. File 选择返回受控 `MentionRef`，main 二次校验；优先 ResourceLink，只有 `embeddedContext=true` 时对小型文本发送 Embedded Resource。
3. Directory 选择发送相对路径标签与 ResourceLink，不递归嵌入；工作区外扩根不在首期范围。
4. Skills 在会话开始前聚合全局 descriptor 与当前项目 9 个路径的 descriptor；同名由项目覆盖全局。搜索按 name/description 的连续子字符串匹配并在内存中排序；选择项序列化为官方 `@skills:<name>` 文本，由 Devin CLI 解析和执行。
5. 增加 mock ACP 测试：capability 组合（resource_link 基线、embeddedContext true/false、additionalDirectories true/false）、越界路径/软链接、删除后重验证、大小上限；再补一个人工认证的 `smoke:devin` 用真实 Devin ACP 验证 file URI 和资源块。

### 8.2 明确不支持（或不应默认支持）

- 自定义 ACP `mention` 内容类型或依赖 Devin 私有、未公开的字段。
- 将 `@` 文本当作可靠路径授权；将绝对路径写进 system prompt 作为唯一实现。
- 递归把目录或整个项目嵌入 prompt；无上限读取/编码二进制文件。
- 发送不在有效根集合内的路径、跟随软链接越界、通过 `..` 绕过边界。
- 在 renderer 读取/解析/执行 Skills；从 `SKILL.md` 复制 prompt；在桌面启动第二个 agent/技能执行器。
- 用普通目录 mention 调用 `additionalDirectories` 或 `/add-dir`；在现有 session 上静默改变根或授权范围。
- 依赖 `devin skills list` 的未文档化 stdout 格式或静态内置技能列表。

### 8.3 真实协议验证结果

2026-08-22 在已认证的本地 Devin CLI 环境执行 `DEVIN_LIVE_TEST=1 pnpm --dir apps/desktop smoke:devin`，三种 mention prompt 均以 `end_turn` 正常结束：

1. `embeddedContext=true` 的小型 UTF-8 文件以 Embedded Resource 发送成功。
2. 本地文件 `file://` ResourceLink 发送成功。
3. 当前工作区内目录的 `file://` ResourceLink 发送成功，未递归嵌入、未修改 `additionalDirectories`。

因此首期可以启用 Files 与 Directories。Skills 的发现层可按官方 9 个仓库路径和 Devin CLI 的全局目录建立缓存；调用层发送官方 `@skills:<name>` 文本，Desktop 不读取正文、不执行 Skill，也不依赖未标准化的 `available_commands_update` metadata。

### 8.4 本轮研究转化为验收条件

- `@pack` 能命中候选路径或技能名称/描述中包含连续 `pack` 的项；大小写差异不影响命中；仅字符间隔相同但不连续的项只能作为明确标注的低优先级模糊结果。
- 连续输入不会触发磁盘枚举：首次建立索引后，查询只访问内存；测试应统计同一 root 的 `readdir`/`git ls-files` 次数，在多次 query 下保持一次或按失效事件增加。
- App 重启和新 session 会重新加载 Skills；同一 session 持续聊天时，新增 `SKILL.md` 不会改变现有 snapshot；已有 session 切换不应把另一个 session 的技能列表混入。
- 项目与全局同名技能只显示一个项目版本；来源字段可用于诊断，不能因为全局版本存在而覆盖项目版本。
- 项目内 9 个官方路径均被扫描；一个路径中的 malformed frontmatter 不得阻塞其他路径，descriptor 缺少 `name` 时回退到父目录名称（官方 [Devin Skills](https://docs.devin.ai/product-guides/skills)）。

## 9. 结论

**事实结论：** 这项功能可以在不依赖 DSCode、保持 Devin CLI 为唯一执行器的前提下实现，但必须把“界面上的 `@`”、ACP 结构化内容和 session 工作根分开。Files 可用 ResourceLink/Embedded Resource；Directories 首期只引用当前工作区路径，不能借 mention 静默扩根；Skills 按官方路径建立 descriptor 快照，并用官方 `@skills:<name>` 文本调用。

**实现建议：** 子字符串过滤是必需语义，模糊匹配只能作为可选排序补充；索引应按 app/session 生命周期缓存，查询只在内存中完成。全局 Skills 是本机 CLI 发现层，项目同名项覆盖它；无论来源如何，Desktop 都只发送名字而不读取正文或成为第二套执行器。
