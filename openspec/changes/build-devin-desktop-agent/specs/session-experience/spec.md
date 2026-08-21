## ADDED Requirements

### Requirement: Devin session 是事实来源
系统 SHALL 使用 Devin `sessionId` 作为线程稳定主键，并 SHALL 以 ACP session 数据作为历史和核心元数据事实来源。本地存储 MUST NOT 建立第二份完整 transcript。

#### Scenario: 重启后恢复线程
- **WHEN** 应用重启并获得 session list/load capability
- **THEN** 系统通过 ACP 列出并加载 Devin session
- **THEN** 本地索引只补充 UI 元数据而不覆盖 Devin 历史

### Requirement: 会话新建与加载
系统 SHALL 支持在活动 cwd 新建 session，并 SHALL 在 load capability 可用时加载已有 session。

#### Scenario: 在工作区新建会话
- **WHEN** 用户在有效工作区选择新建线程
- **THEN** 系统用该 cwd 调用 ACP `session/new`
- **THEN** 侧栏显示返回的 sessionId、title 和更新时间

#### Scenario: 加载失败
- **WHEN** ACP 无法加载本地索引中的 sessionId
- **THEN** 系统保留摘要并显示可恢复错误
- **THEN** 用户可以返回列表或创建新 session

### Requirement: Capability-gated 会话操作
系统 SHALL 只在 initialize 广告对应 capability 时调用 session list、delete、resume、close 和 additional directories 操作。

#### Scenario: Delete capability 缺失
- **WHEN** ACP 未广告 session delete
- **THEN** UI 隐藏或禁用删除动作
- **THEN** 系统不发送 `session/delete`

### Requirement: 会话分组与搜索
系统 SHALL 按规范化 cwd 对 session 分组，并 SHALL 支持按 title、cwd 和 session 摘要搜索。

#### Scenario: 搜索跨工作区线程
- **WHEN** 用户输入与某个 title 或 cwd 匹配的查询
- **THEN** 侧栏只显示匹配的 session，同时保留其工作区分组上下文

### Requirement: 锁定会话保护
系统 SHALL 把 Devin 返回的锁定状态视为运行时提示，并 SHALL 阻止对已确认被其他 host 占用的 session 发送 prompt 或执行删除。

#### Scenario: 打开锁定线程
- **WHEN** session metadata 表明线程被其他 host 锁定
- **THEN** 系统以只读状态打开或显示占用提示
- **THEN** composer 和删除操作不可用

### Requirement: 附加目录
系统 SHALL 只在 ACP 广告 additional directories capability 时允许用户为 session 添加或移除额外目录。

#### Scenario: 添加额外目录
- **WHEN** capability 可用且用户选择一个允许目录
- **THEN** 系统通过标准 ACP 操作更新 session
- **THEN** 更新后的目录列表来自 CLI 确认结果

### Requirement: 本地 UI overlay 边界
系统 MAY 保存搜索、最近访问和产品明确启用的 pin/archive overlay，但 SHALL 清楚区分其本地性质，且 SHALL 不声称这些字段由 Devin 同步。

#### Scenario: 本地 pin overlay 启用
- **WHEN** 产品启用 pin 且用户固定一个 session
- **THEN** 固定状态只写入本应用存储
- **THEN** UI 不把该状态显示为 Devin 云端同步属性
