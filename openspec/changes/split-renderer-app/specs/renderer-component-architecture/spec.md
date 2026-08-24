## ADDED Requirements

### Requirement: App 是 renderer 组合根

Desktop renderer MUST 将 `App.tsx` 限定为应用级组合根和跨业务协调器；该文件 MUST NOT 声明 `App` 之外的业务或 UI React 组件，且本阶段 MUST NOT 超过 2,500 行。

#### Scenario: 新增业务展示

- **WHEN** 开发者新增或扩展会话、对话、编辑器、检查器、设置、权限交互或计划 UI
- **THEN** 实现 MUST 位于对应 `renderer/features/<domain>/` 模块，并由 `App.tsx` 组合

#### Scenario: 组合根重新膨胀

- **WHEN** `App.tsx` 超过 2,500 行或新增其他顶层 PascalCase function component
- **THEN** renderer 架构检查 MUST 失败并指出业务域拆分规范

### Requirement: 组件按所有权分层

业务组件 SHALL 位于 `renderer/features/<domain>/`，跨业务且无业务状态的通用 UI 组件 SHALL 位于 `renderer/components/`，纯逻辑 SHALL 位于对应 feature 或 `renderer/lib/`。

#### Scenario: 单一业务域组件

- **WHEN** 组件只服务 conversation、composer、sessions、inspector、settings、interactions 或 plans 中的一个域
- **THEN** 组件 SHALL 与该业务域同目录，而不是放入 `App.tsx` 或无所有权的聚合文件

#### Scenario: 通用展示组件

- **WHEN** 组件在多个业务域复用且不包含业务状态或 Electron/ACP 副作用
- **THEN** 组件 MAY 放入 `renderer/components/` 并通过明确 props 工作

### Requirement: 拆分保持现有行为边界

组件拆分 MUST 保持现有 DOM 语义、CSS class、用户交互、ACP capability 门控、IPC 边界和状态所有权，不得通过 renderer 组件引入第二执行器或新的原生能力入口。

#### Scenario: 业务组件需要原生操作

- **WHEN** 拆出的业务组件需要打开文件、更新设置或发送 agent 命令
- **THEN** 组件 SHALL 通过组合根提供的受控回调或既有 typed API 边界完成，不得创建通用 raw IPC 通道
