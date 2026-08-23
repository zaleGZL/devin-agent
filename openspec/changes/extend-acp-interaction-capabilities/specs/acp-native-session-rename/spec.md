## ADDED Requirements

### Requirement: 原生 rename 由运行时 sessionRename 能力门控

Desktop MUST 仅在当前 Agent 运行时广告 `cognition.ai/sessionRename` 时调用原生 `_cognition.ai/session/rename`，不得根据 CLI 版本、命令存在或历史连接推断该能力。

#### Scenario: 当前连接支持原生 rename

- **WHEN** 用户重命名已知 session 且当前能力含 `cognition.ai/sessionRename`
- **THEN** Host SHALL 通过显式白名单方法发送该 session ID 和已校验标题

#### Scenario: 当前连接未广告能力

- **WHEN** 用户重命名 session 而当前能力不含 `cognition.ai/sessionRename`
- **THEN** Desktop MUST NOT 调用原生 rename，并 SHALL 使用本地标题降级

### Requirement: renderer 不得获得通用 vendor RPC

Desktop SHALL 只暴露专用 rename IPC，主进程 MUST 校验 session ID 属于已知 session、标题去除首尾空白后非空且不超过既有限制，并固定调用 `_cognition.ai/session/rename`。

#### Scenario: renderer 提供任意 method 名

- **WHEN** renderer 尝试通过 rename IPC 注入 ACP method 或额外参数
- **THEN** 主进程 MUST 拒绝未知字段，且不得将其转发给 Devin

#### Scenario: 标题无效

- **WHEN** 标题为空、仅含空白或超过允许长度
- **THEN** Desktop SHALL 在发送 ACP 请求前拒绝重命名

### Requirement: 原生成功是同步提交点

当原生能力可用时，Desktop MUST 仅在 `_cognition.ai/session/rename` 成功后确认跨客户端重命名，随后同步本地 session index、当前视图和其他窗口。

#### Scenario: 原生 rename 成功

- **WHEN** Devin 接受原生 rename 请求
- **THEN** Desktop SHALL 将本地标题镜像更新为确认后的标题，并向所有已打开窗口广播同一 session 的更新

#### Scenario: 原生 rename 失败

- **WHEN** 原生 rename 返回错误、超时或 ACP generation 改变
- **THEN** Desktop SHALL 回滚 optimistic UI、保留原标题并显示错误，不得写入伪成功的本地标题

### Requirement: 本地降级与原生标题来源可区分

Desktop SHALL 在原生能力缺失或 ACP 暂不可用时保留现有本地 title overlay，并在持久化模型中区分 local 与 native/server 来源；本地降级不得被报告为已同步到 Devin。

#### Scenario: 离线时本地重命名

- **WHEN** ACP 不可用且用户提交有效标题
- **THEN** Desktop SHALL 更新本地展示并将标题来源记录为 local

#### Scenario: 之后恢复原生能力

- **WHEN** 一个含本地 overlay 的 session 在新连接中重新获得原生 rename 能力
- **THEN** Desktop MUST NOT 自动把本地标题上传覆盖 Devin 标题，后续用户再次重命名时才发起原生请求

### Requirement: session 列表刷新不得破坏已确认标题

Desktop SHALL 在 session/list、load 或 rename 广播到达时按标题来源和更新时间合并，保持原生成功结果一致，并避免旧响应覆盖较新的重命名。

#### Scenario: 旧 session/list 响应迟到

- **WHEN** 原生 rename 已成功，而较早发起的 session/list 随后返回旧标题
- **THEN** Desktop MUST 保留较新的确认标题

#### Scenario: 另一窗口接收 rename 广播

- **WHEN** 一个窗口完成原生 rename
- **THEN** 其他窗口 SHALL 更新同一 session 的标题，且不得要求重新载入整个会话
