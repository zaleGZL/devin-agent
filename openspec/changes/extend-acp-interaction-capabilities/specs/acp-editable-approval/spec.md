## ADDED Requirements

### Requirement: 编辑入口由 Agent 运行时能力门控

Desktop MUST 仅依据当前 Agent initialize/session 响应中的 `editableCommands` 与 `commandRevision` 能力决定是否显示对应审批入口，不得静态推断、补齐或跨连接复用这些能力。

#### Scenario: Agent 未广告编辑能力

- **WHEN** 当前 ACP capability 不含 `editableCommands`
- **THEN** permission UI MUST NOT 显示直接编辑候选命令的入口

#### Scenario: Agent 仅广告自然语言 revision

- **WHEN** 当前 Agent 广告 `commandRevision` 但未广告 `editableCommands`
- **THEN** permission UI SHALL 只显示描述修改要求的入口，且不得显示直接命令编辑器

### Requirement: 保留 permission 与命令修订的真实关联

Desktop SHALL 保留原始 permission options、tool call 内容、已识别的 Devin vendor `_meta`、请求身份和 revision 序号，并使用经真实 Devin fixture 验证的类型守卫处理 vendor payload。

#### Scenario: 可编辑审批请求到达

- **WHEN** Agent 发送带有已验证 editable command 元数据的 permission request
- **THEN** Desktop SHALL 将编辑 UI 关联到该请求和 tool call，且 renderer 不获得任意 ACP method 调用能力

#### Scenario: vendor payload 未通过类型守卫

- **WHEN** editable 或 revision 元数据缺少 fixture 证实的必要字段
- **THEN** Desktop MUST 隐藏编辑入口并回退到标准 permission options 或取消，不得猜测字段语义

### Requirement: 编辑和 revision 不得在 Desktop 执行命令

Desktop MUST 只把用户编辑的候选命令或自然语言修改要求回传给 Devin；Desktop 不得执行、模拟执行或代替 Devin 应用命令变更。

#### Scenario: 用户直接编辑候选命令

- **WHEN** 用户提交修改后的命令文本
- **THEN** Desktop SHALL 将该候选变更发送给原 permission/revision 流程，且本地不得启动任何进程

#### Scenario: 用户描述修改要求

- **WHEN** 用户提交自然语言 revision 指令
- **THEN** Desktop SHALL 把该指令关联到当前审批并等待 Devin 返回修订结果，不得自行重写命令

### Requirement: 修订后的最终命令必须再次确认

Desktop MUST 在 Devin 返回修订后的最终命令时展示其完整内容，并要求用户再次显式批准；第一次编辑或 revision 意图不得视为执行授权。

#### Scenario: Devin 返回修订命令

- **WHEN** 当前 permission 的有效 revision 返回一个最终候选命令
- **THEN** Desktop SHALL 展示最终命令并保持未批准状态，直到用户选择允许或拒绝

#### Scenario: 用户批准未再变化的最终命令

- **WHEN** Devin 针对已更新的最终候选命令再次请求 permission，且用户未继续修改命令
- **THEN** Desktop SHALL 只返回标准选择结果，不得重复附带相同的 `cognition.ai/updatedInput`

#### Scenario: 用户拒绝最终命令

- **WHEN** 用户查看修订后的最终命令并选择拒绝
- **THEN** Desktop SHALL 返回拒绝或取消结果，且不得复用之前的批准选择

### Requirement: 过期审批和 revision fail-closed

Desktop SHALL 以 request/toolCall 身份、ACP generation 和单调 revision 序号校验结果；session 取消、请求替换、连接重建或较新 revision 出现后，旧结果 MUST 失效。

#### Scenario: 较旧 revision 迟到

- **WHEN** revision N+1 已成为当前候选，而 revision N 的结果随后到达
- **THEN** Desktop MUST 忽略 revision N，不得覆盖或批准当前候选

#### Scenario: 连接在审批期间重建

- **WHEN** editable permission 尚未完成而 ACP generation 改变
- **THEN** Desktop SHALL 取消该审批并清除命令草稿，且不得把结果发给新连接

### Requirement: 标准 permission 行为保持兼容

Desktop SHALL 在编辑能力不存在或用户不使用编辑入口时，继续按 Agent 广告的 permission options 返回选择结果。

#### Scenario: 用户选择标准 permission option

- **WHEN** permission request 只包含标准 options 或用户直接选择其中一个 option
- **THEN** Desktop SHALL 返回该 option 的稳定标识，行为与变更前一致
