## 1. 共享契约与状态模型

- [x] 1.1 在 shared 中新增 `MentionRef`、mention 搜索请求/结果及 file/directory/skill 判别联合类型，并为路径长度、结果数量和 JSON 边界添加校验。
- [x] 1.2 补全 ACP `ResourceLink` 与 Embedded Resource 显式类型，扩展内部 queued prompt、草稿和 optimistic user message 以携带 mentions。
- [x] 1.3 扩展 `AvailableCommand` normalizer，保留运行时 command 的安全 `raw/category` metadata，并用 fixture 验证 Skills 分类不会被丢失。

## 2. 工作区索引与安全解析

- [x] 2.1 新增 main-side mention 索引模块：Git 仓库使用 `git ls-files`，非 Git 仓库使用不跟随软链接的有界遍历，并实现默认 ignore、100,000 候选和 100 结果上限。
- [x] 2.2 实现可取消、可缓存的 Files/Directories 搜索与排序，确保项目切换、根目录变化和新查询会使旧结果失效。
- [x] 2.3 复用 `safeRealpath`/`isPathInside` 增加发送前二次校验，覆盖不存在路径、`..`、越界符号链接、特殊文件和敏感文件确认分类。
- [x] 2.4 通过 preload 暴露最小 `mentions.search` IPC，并验证 renderer 不能请求任意工作区外路径或文件正文。

## 3. ACP prompt 序列化

- [x] 3.1 在 main prompt adapter 中把小于等于 512 KiB 的 UTF-8 文件按 `embeddedContext` capability 转成 Embedded Resource，否则转成 ResourceLink。
- [x] 3.2 为二进制和超大文件实现 ResourceLink 降级，禁止无界读取或 base64，并在路径变化时把可操作错误返回 composer。
- [x] 3.3 把工作区目录序列化为 `@relative/path/` 标签和目录 ResourceLink，明确禁止递归嵌入与修改 `additionalDirectories`。
- [x] 3.4 将当前 session Skill 快照中的单个 canonical name 按 `@skills:<name>` 前置到文本 prompt，并确保 Desktop 不读取正文或执行 `SKILL.md`。

## 4. `@` 选择器与 composer 交互

- [x] 4.1 在 composer 中实现 `@` 首级菜单，只显示 Files、Directories、Skills，并在没有项目时禁用前两类而不扫描 `~`。
- [x] 4.2 实现分类内搜索、120ms debounce、过期请求取消、空/错误/加载状态和名称/相对路径/描述展示。
- [x] 4.3 实现方向键、Enter、Escape、Backspace、鼠标与 ARIA 导航，并将浮层约束在窗口视口内。
- [x] 4.4 实现可删除 mention token；选择新 Skill 时替换旧 Skill，同时保留普通文本、annotations、文件与目录 mentions。
- [x] 4.5 在项目切换、session 切换、发送、失焦和输入法组合状态中验证菜单关闭与草稿保持逻辑。

## 5. 队列、历史与多 session 一致性

- [x] 5.1 扩展等待队列的入队、编辑、删除、拖拽重排、立即发送和强制插队路径，使每条消息完整保留 mentions。
- [x] 5.2 为当前运行期的 user message 保存并展示 optimistic mention metadata，发送失败时恢复原草稿和 tokens。
- [x] 5.3 在 ACP 历史 normalizer 中解析实际 Resource/ResourceLink；历史只有文本时保持文本，不从 `@` 字符串猜测引用。
- [x] 5.4 让 Skills 列表按 session 保存不可变快照，验证切换 session 不泄漏旧列表，且进行中的 session 不因磁盘变化自动刷新。

## 6. 验证与文档

- [x] 6.1 为索引、模糊匹配、ignore、越界/软链接、TOCTOU、敏感文件和大小/编码边界增加 co-located Vitest 测试。
- [x] 6.2 为 `embeddedContext` true/false、ResourceLink 降级、目录拒绝、Skills metadata 和单 Skill 限制增加 mock ACP 集成测试。
- [x] 6.3 更新用户文档，说明 `@` 首期范围、未选项目状态、文件内联上限、目录限制与 Skills 由 Devin CLI 执行的边界。
- [x] 6.4 运行 `pnpm check` 与 `pnpm check:independence`，修复所有回归。
- [x] 6.5 在已认证 Devin CLI 环境中运行 opt-in live smoke，验证本地文件 Resource/ResourceLink 和目录 URI；若目录不受支持，则按规范禁用 Directories 并记录结果。

## 7. 根级检索与 Skill 快照修正

- [x] 7.1 将 Files/Directories 索引改为显式刷新缓存，输入搜索只执行内存中的大小写不敏感连续子字符串/模糊排序，并支持根级跨类型查询。
- [x] 7.2 新增 main-side Skill 索引：覆盖全局与项目支持目录、有界解析 frontmatter、项目同名覆盖全局，并拒绝软链接与无界读取。
- [x] 7.3 为草稿、新会话和既有 session 建立 Skill 缓存生命周期；新会话开始前刷新，进行中 session 使用不可变快照。
- [x] 7.4 扩展 IPC、shared 类型和 composer，使根级 `@query` 混合展示三类结果，并让 Skills 使用索引快照而非 ACP command metadata。
- [x] 7.5 将 Skill prompt 序列化改为 `@skills:<name>`，发送前用 session 快照校验，Desktop 不执行 Skill 或注入正文。
- [x] 7.6 补充索引缓存、`pack` 子字符串、全局/项目覆盖、session 快照和跨类型 UI 单元测试，更新研究与用户文档并运行完整检查。
- [x] 7.7 调整根级混合搜索顺序，使 Skills 始终优先于 Files/Directories，并补充稳定分组顺序回归测试。
- [x] 7.8 将 Skill 搜索限制为仅对 Name 的大小写不敏感连续子字符串匹配，移除 command、description、source 与 subsequence 匹配并补充负向测试。
