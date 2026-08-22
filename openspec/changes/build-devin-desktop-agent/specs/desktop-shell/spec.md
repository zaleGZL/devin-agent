## ADDED Requirements

### Requirement: 独立 Desktop 应用壳
系统 SHALL 在当前仓库提供 Electron main、context-isolated preload、React renderer 和共享类型，并 SHALL 保持 DSCode Desktop provider 无关页面的布局、导航、快捷键与状态反馈。

#### Scenario: 启动主窗口
- **WHEN** 用户启动 Desktop 应用
- **THEN** 系统显示包含项目/会话侧栏、会话主区域、composer 和设置入口的主窗口
- **THEN** 页面结构和 provider 无关交互与 DSCode Desktop 基线一致

### Requirement: Electron 安全边界
系统 SHALL 启用 `contextIsolation` 和 renderer sandbox，SHALL 禁用 renderer Node integration，并 SHALL 只通过带类型和参数校验的 preload API 暴露系统能力。

#### Scenario: Renderer 请求系统能力
- **WHEN** renderer 选择工作区、读取预览或打开外链
- **THEN** 请求通过白名单 IPC 发送给 main
- **THEN** renderer 不能直接访问 Node、文件系统或子进程

### Requirement: 工作区与最近项目
系统 SHALL 支持选择目录、打开最近项目、忘记项目和按活动工作区更新界面，并 SHALL 在 main 中规范化路径。

#### Scenario: 选择新工作区
- **WHEN** 用户通过原生目录选择器选择一个有效目录
- **THEN** 系统把该目录设为活动 cwd 并加入最近项目
- **THEN** renderer 不直接读取该目录

### Requirement: 本地文件预览
系统 SHALL 支持 DSCode Desktop 已支持的文本、代码、Markdown、HTML、图片、PDF、视频和音频预览，并 SHALL 验证目标路径位于允许的工作区范围内。

#### Scenario: 预览工作区内文件
- **WHEN** 用户打开一个受支持且位于允许目录中的文件
- **THEN** main 返回受限的预览数据或内部预览 URL
- **THEN** renderer 在 inspector 中展示内容

#### Scenario: 拒绝越界预览
- **WHEN** 预览路径通过 `..`、软链接或绝对路径逃逸允许目录
- **THEN** 系统拒绝读取并返回安全错误

### Requirement: 外观和本地偏好
系统 SHALL 保留主题、语言、profile/avatar、reasoning 显示、侧栏状态和 command palette 等 provider 无关偏好，并 SHALL 将其存储在本应用数据目录。

#### Scenario: 重启后恢复偏好
- **WHEN** 用户修改主题、语言或布局偏好并重启应用
- **THEN** 系统恢复最近保存的有效偏好
- **THEN** 不需要启动 Agent 才能应用这些偏好

### Requirement: 安全外链与导航
系统 SHALL 阻止 renderer 窗口导航到任意外部页面，并 SHALL 只允许经 main 校验的 HTTP(S) URL 交给系统浏览器。

#### Scenario: 打开认证外链
- **WHEN** 认证流程请求打开一个有效 HTTPS URL
- **THEN** main 使用系统浏览器打开 URL
- **THEN** Desktop renderer 保持在本地应用页面
