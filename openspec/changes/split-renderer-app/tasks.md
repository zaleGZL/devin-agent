## 1. 基线与模块边界

- [x] 1.1 记录 `App.tsx` 当前 6,007 行基线，并识别业务组件、通用 UI、纯函数和组合根职责
- [x] 1.2 定义 `features/<domain>`、`components/`、`lib/` 的所有权与依赖规则
- [x] 1.3 建立业务域目录和共享展示类型，保持 existing renderer API 不变

## 2. 业务组件拆分

- [x] 2.1 迁出 conversation、follow-up、work log、tool 和 image lightbox 组件
- [x] 2.2 迁出 composer controls、model/mode/permission picker 和 mention/attachment UI
- [x] 2.3 迁出 inspector 的 changes/file preview 组件
- [x] 2.4 迁出 settings、session/project dialog 和 command/search 组件
- [x] 2.5 迁出 permission/elicitation、extension、auth 和 plan 交互组件
- [x] 2.6 迁出侧栏、主工作区与 overlay 展示边界，使 `App.tsx` return 只负责拓扑组合
- [x] 2.7 迁出格式化与展示辅助函数，清理 `App.tsx` imports 和附属声明

## 3. 规范与机械约束

- [x] 3.1 在 `docs/development.md` 增加 renderer 按业务域拆分的编码规范与禁止事项
- [x] 3.2 在 `docs/architecture.md` 增加 renderer feature/component/lib 依赖地图
- [x] 3.3 更新 `docs/quality.md`，将 App 单体缺口替换为可执行的持续拆分标准
- [x] 3.4 增加 `App.tsx` 行数与附属组件检查，并接入 `pnpm check`
- [x] 3.5 为架构检查添加成功与失败 fixture 测试

## 4. 验证与版本

- [x] 4.1 运行相关 Vitest、架构检查和 `pnpm check`
- [x] 4.2 运行 `pnpm check:independence`，确认新增 imports 与路径没有 DSCode 耦合
- [x] 4.3 确认 `App.tsx` 不超过 2,500 行且只声明 `App` 一个顶层组件
- [x] 4.4 将 `apps/desktop/package.json` patch 版本从 `0.1.21` 提升到 `0.1.22`
