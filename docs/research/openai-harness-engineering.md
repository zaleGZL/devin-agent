# OpenAI Harness Engineering 研究报告

> 研究日期：2026-08-24
>
> 结论先行：OpenAI 所说的 harness 不是一套提示词，而是让 agent 能可靠工作的“可读环境 + 可执行约束 + 快速反馈循环”。对本仓库最有价值的迁移是：让 `AGENTS.md` 保持短小并只做导航；把架构、计划、质量和安全知识放入可索引、版本化的 `docs/`；把关键不变量、边界解析、验证与文档新鲜度变成自动检查。OpenAI 文章描述的是一个内部产品实验，不是可直接照搬的通用流程，尤其不能仅凭文章把本项目的合并门槛或自治级别降下来。

## 1. 研究范围与证据等级

本报告以 OpenAI 工程文章《Harness engineering: leveraging Codex in an agent-first world》为主证据，补读文章直接引用且与仓库治理、执行计划、架构地图和安全反馈有关的一手资料。**文章事实**是文章明确陈述的内容；**本仓库推论**是结合当前工作区快照提出的适配建议，不代表 OpenAI 对本项目的要求。

本次改造前的基线快照显示：仓库已有根目录 `AGENTS.md`、`docs/devin-cli/` 官方文档镜像和少量 `docs/research/` 报告；没有可见的根级 `ARCHITECTURE.md`、`PLANS.md`、`docs/exec-plans/`、文档索引/新鲜度检查或质量评分文档。根 `AGENTS.md` 已有命令、架构地图、ACP 不变量、测试和发布说明；`.github/workflows/desktop.yml` 的验证 job 执行 `pnpm check` 与 `pnpm check:independence`，但没有文档专门检查。

同一变更已据此把 `AGENTS.md` 收敛为导航，并新增项目知识索引、产品、架构、开发、安全与质量规范。尚未机械执行的项目继续记录在 `docs/quality.md` 的“Known gaps”中；本报告保留为决策证据，不作为现行规范。

主要来源：

- [OpenAI：Harness engineering（2026-02-11）](https://openai.com/index/harness-engineering/)：本文核心证据。
- [OpenAI Cookbook：Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans)：OpenAI 对长任务执行计划的可复用定义。
- [AGENTS.md 开放格式](https://agents.md/)：文件定位、层级和常见内容的格式说明；这是社区格式说明，不是本仓库专属规则。
- [ARCHITECTURE.md，matklad](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html)：文章直接引用的架构地图原始文章。
- [OpenAI Aardvark / Codex Security](https://openai.com/index/introducing-aardvark/)：文章直接引用的持续安全分析与隔离验证实例。
- [Parse, don’t validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)：文章用来说明边界解析的原始文章。
- [AI Is Forcing Us To Write Good Code](https://bits.logic.inc/p/ai-is-forcing-us-to-write-good-code)：文章引用的严格边界、快速隔离环境等补充经验；以下仅把它当作作者自身经验，不当作 OpenAI 事实。
- [everything is a ralph loop](https://ghuntley.com/loop/)：文章引用的循环式 agent 工作流原始文章；以下不把其中的夸张效率主张外推到本仓库。

## 2. OpenAI 文章中的事实

### 2.1 工程师的主要产物从代码转向 harness

**文章事实。** OpenAI 描述了一个从空仓库开始的内部 beta：产品代码、测试、CI、文档、可观测性和内部工具均由 Codex 生成；团队报告约五个月达到百万行规模、约 1,500 个合并 PR，并强调“人负责引导，agent 负责执行”。工程师的主要工作变成设计环境、表达意图和建立反馈环路；遇到失败时，优先问“缺少什么能力，如何让它对 agent 可读且可执行”，而不是只要求 agent 重试。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**边界。** 这些数字是一个内部实验的自述，文章没有给出可独立复现的测量方法，也明确说其端到端自治依赖该仓库的特定结构和工具，不能视为本项目的产能承诺或通用基准。[来源：同上](https://openai.com/index/harness-engineering/)

### 2.2 `AGENTS.md` 是地图，不是百科全书

**文章事实。** OpenAI 试过把所有规则塞进一个巨大的 `AGENTS.md`，观察到四类问题：上下文稀缺、指导过多反而失去优先级、规则快速腐化、内容难以机械验证。其做法是保持一份约 100 行的 `AGENTS.md` 作为目录，把结构化知识放在仓库内的 `docs/`，通过渐进式披露让 agent 从稳定入口继续导航。文中示例目录包含设计文档、执行计划、生成文档、产品规格、引用资料，以及 `DESIGN.md`、`FRONTEND.md`、`PLANS.md`、`PRODUCT_SENSE.md`、`QUALITY_SCORE.md`、`RELIABILITY.md`、`SECURITY.md` 等主题文档。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**直接资料的补充事实。** `AGENTS.md` 格式说明把它定位为面向 coding agent 的项目 README，通常覆盖项目概览、构建/测试命令、代码风格、安全注意事项和提交/发布步骤；大型仓库可在子目录放置更近的 `AGENTS.md`，最近文件优先。[来源：[AGENTS.md](https://agents.md/)]

### 2.3 仓库本地、版本化知识才对 agent 可见

**文章事实。** OpenAI 将代码、Markdown、schema、可执行计划等仓库内版本化产物当作知识系统的记录；聊天、云文档和人的记忆若不被导入仓库，在 agent 运行上下文中就等同不存在。团队因此持续把架构决定、产品原则和工程规范迁入仓库，并让文档有索引、验证状态和交叉链接。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**直接资料的补充事实。** 架构地图的原始建议是写一份短的鸟瞰图和模块 codemap，回答“做 X 的代码在哪里”和“当前模块做什么”；明确写出架构不变量、层边界和横切关注点，并避免把容易变化的实现细节塞进地图。[来源：[ARCHITECTURE.md](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html)]

### 2.4 可观测性和产品表面必须对 agent 直接可读

**文章事实。** 为降低人工 QA 瓶颈，OpenAI 让应用可按 git worktree 启动，为 agent 接入 Chrome DevTools Protocol、DOM 快照、截图和导航；每个 worktree 还有隔离且短生命周期的日志、指标和 trace，agent 可查询 LogQL/PromQL。这样“启动小于 800ms”或“关键旅程不得有超过两秒的 span”等目标才可被 agent 直接复现和验证。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

### 2.5 约束应表达不变量，且优先机械执行

**文章事实。** OpenAI 不是规定每个实现细节，而是要求边界处解析数据形状，并以固定层次和严格依赖方向组织业务域；自定义 linter 与 structural test 拒绝非法依赖、结构化日志违规、命名违规、文件过大和平台可靠性问题。错误信息还被写成可供 agent 直接采取修复动作的说明。文章强调“中心化约束，局部自主表达”。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**直接资料的补充事实。** “Parse, don’t validate”原作者主张把不可信输入一次转换成可信的数据表示，再让后续代码只处理已解析类型，而不是在各处反复检查同一个原始形状。[来源：[Parse, don’t validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)]

### 2.6 长任务需要自包含、可持续更新的执行计划

**文章事实。** OpenAI 把复杂任务的执行计划作为一等仓库产物；活跃、完成和技术债计划都应版本化并与代码并存。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**OpenAI Cookbook 的直接规范。** `PLANS.md` 建议：执行计划必须自包含、可由新手从头完成、以可观察结果为验收标准，并记录精确文件、命令、预期输出、验证、幂等/恢复路径。计划是 living document，必须维护 `Progress`、`Surprises & Discoveries`、`Decision Log`、`Outcomes & Retrospective`；每个里程碑应独立可验证，发现和路线变更要回写计划。[来源：[Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans)]

### 2.7 反馈环路覆盖实现、复现、审查和恢复

**文章事实。** OpenAI 描述的 agent 工作流会自行审查改动、请求额外 agent 审查、处理反馈、运行测试和 UI 验证，并循环直到满足条件；在更高自治级别，单次 prompt 还能复现 bug、录制前后视频、修复、处理构建失败、开 PR，只有需要判断时才升级给人。文章同时声明这依赖特定仓库投资，不能假设自然泛化。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

**补充事实。** Aardvark 的安全流水线体现了类似的闭环：先建立全仓库威胁模型，再扫描提交、在隔离沙箱验证可利用性，最后给出可供人审阅的补丁；文章称其后来整合进 Codex Security。[来源：[Introducing Aardvark](https://openai.com/index/introducing-aardvark/)]

### 2.8 高吞吐会改变合并权衡，但不是普适规则

**文章事实。** OpenAI 表示，在 agent 产出远高于人工注意力的环境里，他们采用较少阻塞式合并门、短生命周期 PR，并把 flaky test 作为后续重跑/修复对象；理由是纠错成本低、等待成本高。文章明确这是低吞吐环境下可能不负责任的取舍。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

### 2.9 持续清理是防止“熵”积累的垃圾回收

**文章事实。** Agent 会复制仓库中已有的好坏模式；OpenAI 曾每周花约 20% 时间清理“AI slop”，后来改为把“黄金原则”写成机械规则，并由定期后台任务扫描偏差、更新质量等级、提交小型重构 PR，常见修复可自动合并。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

## 3. 面向本仓库的推论与建议

以下不是 OpenAI 的事实，而是依据上节证据、当前仓库快照和项目既有边界作出的适配建议。

### P0：把 `AGENTS.md` 收敛为可验证的导航入口

1. 保留项目身份、最短可用命令、架构地图、不可违反的 ACP/安全不变量和文档入口；把长篇背景、设计理由、故障排查、发布细节、协议解释迁移到 `docs/`。
2. 每个指针都应指向稳定的主题文档或索引，避免在 `AGENTS.md` 重复一份容易过时的实现手册。当前根文件已有 `docs/devin-cli.md` 入口，这个模式可以扩展为架构、质量、安全、计划和研究索引。
3. 如果未来在 `apps/desktop/` 或更深目录出现局部规则，使用最近路径的嵌套 `AGENTS.md`，并在根索引说明其作用域；不要把所有 renderer/main 细节重新堆回根文件。该层级模型与 [AGENTS.md 格式说明](https://agents.md/) 一致。

### P0：新增稳定的仓库知识拓扑

建议至少补齐一个可导航的文档入口，并按实际维护能力分阶段增加：

- **架构地图**：根级 `ARCHITECTURE.md` 或明确等价的 `docs/architecture.md`，记录 Electron main/preload/renderer/shared、ACP 边界、关键数据流和不变量；只写低频变化的地图，详细实现留在模块文档。依据：[ARCHITECTURE.md 原始建议](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html)。
- **执行计划**：建立与现有 OpenSpec 变更流程的映射。长任务计划应有目的、进度、发现、决策、结果、验证和恢复信息；不要另造一个与 OpenSpec 相互矛盾的状态源。依据：[OpenAI Cookbook ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans)。
- **主题索引**：为 `docs/` 提供索引和每类文档的 owner/状态/更新时间，至少区分 Devin CLI 镜像、项目架构、开发流程、研究和变更计划。
- **质量/可靠性/安全**：把当前 `AGENTS.md` 中的动态 ACP capability、无第二 executor、凭据边界、sandbox fail-closed、版本 bump、独立性检查等不变量集中成可引用的质量与安全规范，并链接到验证命令。
- **技术债与研究**：把已知缺口和研究报告纳入版本控制，便于后续 agent 从仓库恢复上下文，而不是依赖聊天记录。

### P0：把关键不变量转成机械检查

当前 `pnpm check` 和 `pnpm check:independence` 已是可复用入口，但 harness 还需要让失败信息能直接指导修复。建议在不改变现有安全边界的前提下逐步增加：

- 文档链接、必需索引、front matter/状态字段和更新时间检查；CI 需要在文档变化时运行，而不是只监听 `apps/desktop/**`。
- ACP 边界的结构测试：未广告 capability 不得调用；未知 Agent→Client 请求继续 fail-closed；禁止静态能力替代 runtime negotiation。
- 分层依赖、路径/文件大小、结构化日志和敏感数据规则的 lint/test。错误信息应包含“违反了哪个不变量、应查看哪个文档/命令”。
- 对每个新规则提供最小失败 fixture 和通过 fixture；否则“规则写进文档”仍不可验证。

### P1：提升 agent 对应用和反馈的可读性

本项目是 Electron 桌面端，不应未经授权复制 OpenAI 的浏览器/可观测性基础设施。可先做低成本、可复现的版本：

- 在文档中明确 `pnpm dev`、`pnpm check`、打包 smoke 的可观察结果和常见失败诊断；为 ACP mock 测试和 live smoke 标注副作用、前置条件和清理方式。
- 为每个工作区/测试运行隔离临时目录、端口和 session，避免 agent 读取其他任务的状态；若无法隔离，文档中明确限制，不宣称支持并发自治。
- 让 UI/主进程关键状态能由测试或结构化日志观察；把“如何证明修复有效”写进计划或模块文档，而不是只写“测试通过”。
- 对需要真实 Devin CLI 的验证保留人工确认和凭据边界；Desktop 继续只通过 ACP 发送请求、展示结果，不实现第二执行器。

### P1：在边界处解析，在内部使用可信类型

对 ACP JSON、IPC 输入、文件路径、配置和外部 CLI 输出，优先在单一边界完成 schema/类型解析，之后在内部传递已解析的类型；禁止把“猜测字段形状后继续运行”当成正常路径。该建议直接对应文章的 boundary parsing 例子和 [Parse, don’t validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)；具体库和实现应由本项目现有依赖、ACP schema 与安全需求决定，不应为了追随文章而引入任意库。

### P1：建立持续的文档与代码“垃圾回收”

可先以低风险、可审阅的方式实现：定期扫描失效链接、过期命令、重复规则、未索引报告和已不符合代码的架构描述；生成小型修复 PR，并把无法自动判断的项目列为技术债。不要一开始就自动重写规范或自动合并涉及权限、sandbox、发布和协议的变更。依据：[OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) 对 doc-gardening、质量等级和 golden principles 的描述。

### P2：谨慎评估 agent-to-agent 审查和低阻塞合并

可以为短 PR 增加本地自审、定向测试和可选 agent review，但当前仓库仍需以 `pnpm check`、独立性检查、真实 ACP smoke 的风险为准。只有收集到失败率、修复时延、人工注意力成本等本项目数据后，才有证据决定是否放宽合并门；不能把 OpenAI 内部“等待昂贵、纠错便宜”的假设直接套用。[来源：OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)

### 不应直接复制的做法

- 不把“零手写代码”、百万行或每日 PR 数当作本项目目标；它们是 OpenAI 内部实验背景，不是质量指标。
- 不为了变短而删除 `AGENTS.md` 中的安全/ACP 硬约束；应迁移解释，保留必须在每次 agent 运行时可见的不变量。
- 不把外部博客或 OpenAI 文章中的具体库、层名、覆盖率目标当成仓库规范；先验证是否与 Electron、ACP、Devin CLI 和现有测试相容。
- 不因高吞吐叙事而移除 sandbox fail-closed、凭据保护、动态 capability 门控、版本 bump 或 release 验证。
- 不把持续后台任务、自动合并或自治升级接入发布/权限路径，除非有明确 owner、审计、回滚和失败隔离。

## 4. 建议的最小落地顺序

1. 先更新根 `AGENTS.md` 的目录结构和文档入口，同时保留全部安全与 ACP 不变量。
2. 新增架构地图和文档索引；把当前已有 `docs/devin-cli/`、研究报告和 OpenSpec 变更纳入索引。
3. 定义计划文档与 OpenSpec 的边界；为多小时任务提供自包含、可验证、可恢复的模板。
4. 将文档链接/索引/状态检查纳入 `pnpm check` 或独立 CI job，并让 workflow 在文档变化时运行。
5. 再增加 ACP 结构测试、架构不变量 lint、过期文档扫描和小型技术债清理任务。
6. 收集一段时间的检查耗时、失败类型、人工修复时延和 flaky 情况后，才评估更高自治或更少阻塞的合并策略。

## 5. 证据限制与待验证问题

- OpenAI 文章没有公开其自定义 linter、结构测试、worktree 启动脚本、可观测性栈或 doc-gardening agent 的实现；本报告只提炼机制，不声称已有可复制代码。
- 文章的产能、自治和质量描述主要是内部经验，缺少对照组、完整指标定义和长期演化数据；不能据此预测本项目收益。
- 改造前的仓库基线证明了当时文件和脚本的存在与缺失，但没有证明 agent 实际如何读取文档、并发工作区是否安全、或当前 `pnpm check` 的真实耗时；这些需要后续脚本、测试和运行记录验证。
- `AGENTS.md` 的嵌套优先级来自开放格式说明；Devin CLI 在本仓库中的具体加载/覆盖行为仍应以本地官方镜像和真实运行时为准，不应只凭格式网站推断。
