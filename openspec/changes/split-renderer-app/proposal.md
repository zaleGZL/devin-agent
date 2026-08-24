## 为什么

`apps/desktop/src/renderer/App.tsx` 已达到 6,007 行，同时承载应用编排、业务状态、侧栏、会话、对话、编辑器、检查器、设置、权限交互、计划和大量格式化工具。该结构让任何局部改动都需要理解整份文件，扩大回归面，也会诱导后续 agent 继续复制单文件模式。

## 变更内容

- 将 `App.tsx` 收敛为应用组合根与跨业务协调器，不再在其中实现业务组件和可复用 UI 组件。
- 按 conversation、composer、sessions、inspector、settings、interactions、plans 等业务域建立 `renderer/features/` 目录。
- 将跨域、无业务状态的展示组件放入 `renderer/components/`；纯格式化与边界辅助函数放入 `renderer/lib/`。
- 在开发与架构文档中明确 renderer 的按业务域拆分规则、依赖方向和禁止事项。
- 增加机械检查，限制 `App.tsx` 行数并禁止在组合根继续声明其他 React 组件。

## 能力范围

### 新增能力

- `renderer-component-architecture`：定义 renderer 组合根、业务组件、通用 UI 组件和纯逻辑模块的职责边界。

### 修改能力

无。本变更保持现有 UI、ACP、IPC、状态所有权和用户行为不变，只调整 renderer 内部结构。

## 影响范围

- `apps/desktop/src/renderer/App.tsx` 及新增的 `features/`、`components/`、`lib/` 模块。
- renderer TypeScript imports、组件 props 和现有 Vitest 覆盖。
- `docs/architecture.md`、`docs/development.md`、`docs/quality.md` 和仓库检查脚本。
- 代码提交需要提升 `apps/desktop/package.json` patch 版本。
