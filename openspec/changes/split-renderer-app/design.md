## 背景

当前 `App.tsx` 的 6,007 行由两类内容组成：约一半是全局状态、effects 和跨域命令编排，另一半是 20 多个业务或 UI 组件及格式化辅助函数。直接把整份文件移动到单个 hook 或单个 `AppView.tsx` 只会转移单体，不能形成稳定边界。

## 目标与非目标

### 目标

- `App.tsx` 只保留应用级状态协调、跨域事件连接和业务组件组合。
- 按业务域拆出可独立理解、测试和继续演进的组件模块。
- 保持 DOM 结构、CSS class、交互语义、ACP 行为和持久化行为不变。
- 用文档与脚本共同阻止组合根重新膨胀。

### 非目标

- 不重做视觉设计、CSS 命名或用户流程。
- 不改变 ACP、IPC、权限、sandbox、认证或 session 数据模型。
- 不为了追求文件数量创建只有转发作用且没有清晰业务边界的包装层。
- 不把全部状态机械移动到另一个超大 controller/hook 文件。

## 决策

### 1. 以业务域作为第一层目录

业务组件放在 `renderer/features/<domain>/`，domain 包括 conversation、composer、sessions、inspector、settings、interactions 和 plans。组件只接收完成其业务渲染与交互所需的数据和回调，不直接拥有 Electron main 能力；跨进程调用仍由组合根或明确的业务 controller 发起。

通用、无业务语义的展示组件才可进入 `renderer/components/`。跨域纯函数继续放在 `renderer/lib/`；仅服务单一业务域的辅助函数与组件同目录。禁止用 `utils.ts` 或 `components.tsx` 重新形成无法识别所有权的杂物文件。

### 2. `App.tsx` 是组合根，不是组件仓库

`App.tsx` 可以持有应用级连接、全局状态和跨域协调，但不得再声明 `App` 之外的 React 组件。现有组件按所有权迁出；复杂的侧栏、主工作区和 overlay 也拆成业务组件，使 return 只表达页面拓扑。

本阶段将 `App.tsx` 硬上限设为 2,500 行，作为从 6,007 行单体迁移后的明确保护线。该阈值不是理想目标；后续状态域进一步稳定后，应继续把 session、composer、inspector controller 拆入各自 feature，并下调上限。

### 3. 先做行为保持型移动，再做接口收敛

迁移按组件边界逐批进行：先复制组件与所需类型/import，改为 named export，再由 `App.tsx` 引用并删除原实现。每批通过 TypeScript 发现遗漏依赖，不同时改动 UI 语义。业务组件 props 用明确类型表达；需要共享的展示模型显式 export，不通过 `any` 或全局上下文逃避依赖。

### 4. 用最小机械规则防止回归

新增 renderer 架构检查：

- `App.tsx` 不得超过 2,500 行。
- `App.tsx` 不得声明 `App` 之外的顶层 PascalCase function component。
- 错误信息必须指向编码规范和正确的业务域目录。

该检查加入 `pnpm check` 和 CI。行数不是完整架构度量，因此文档仍要求按所有权拆分，review 继续拒绝把业务实现藏进匿名块或单个超大 hook。

## 风险与权衡

- **props 变长**：拆分展示边界可能产生较长 props。优先按业务对象分组，只有同一域内稳定共享且不会隐藏跨域依赖时才使用 context。
- **循环依赖**：feature 不应反向依赖 `App.tsx`；共享类型下沉到 feature types 或 `lib/`。
- **行为回归**：纯移动也可能遗漏闭包依赖。通过 TypeScript、现有 Vitest、build 与 diff review 控制风险。
- **阈值被当成目标**：2,500 行仅为迁移保护线，不代表组合根在该长度就是理想结构。

## 迁移计划

1. 迁出格式化函数、共享展示类型和独立业务组件。
2. 迁出侧栏、主工作区和 overlay 展示边界，缩短 `App` return。
3. 删除 `App.tsx` 中所有附属组件实现并清理 imports。
4. 更新文档、增加架构检查和测试。
5. 运行 `pnpm check`、`pnpm check:independence`，确认行为与构建无回归。

## 实施结果

- `App.tsx` 从 6,007 行降至 2,432 行，只保留 `App` 一个顶层 React 组件声明。
- renderer 业务 UI 已拆入 12 个 `features/<domain>/` 模块，最大模块 565 行。
- `pnpm check:renderer-architecture` 同时限制 `App.tsx` 为 2,500 行、feature 模块为 600 行，并拒绝在组合根新增附属 PascalCase 组件。
- 架构检查 5 项 fixture、54 个 Vitest 文件共 256 项测试、typecheck、lint、build 与独立性扫描均通过。
