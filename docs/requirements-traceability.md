# Capability 需求追踪

| Capability | 主要实现区域 | 主要验证 | 结论 |
|---|---|---|---|
| `desktop-shell` | `src/main/index.ts`、`desktop-security.ts`、preload、renderer、workspace/settings/file preview | IPC、窗口安全、preview containment、workspace 单测；typecheck/build | 满足 |
| `devin-acp-runtime` | `devin-discovery.ts`、`acp-transport.ts`、`devin-acp-host.ts`、`runtime-adapter.ts` | 官方 SDK fixture、mock ACP、malformed/timeout/exit；真实 CLI initialize/auth/session/recovery | 满足 |
| `coding-conversation` | `acp-normalizer.ts`、`conversation.ts`、composer、permission UI、follow-up | reducer、unknown update、tool 生命周期、图片门禁、取消、permission 单测；真实 agent/thought/tool updates | 满足 |
| `session-experience` | host session API、sidebar/search、`session-index.ts`、本地 overlay | new/load/list/delete、locked、additional directories、切换/恢复契约；真实 new/load/delete | 满足 |
| `devin-capability-governance` | `capabilities.ts`、runtime adapter、model/mode/config、sandbox 与扩展门禁 | 动态更新、缺失能力、配置回滚、platform policy、Handoff 门禁；真实 model/mode write | 满足 |
| `desktop-distribution-independence` | workspace/build 配置、CI、notice、复制清单、independence scan、交付文档 | 干净临时副本 install/check/pack；安装包、symlink、source map 与禁用引用扫描 | 满足 |

## 不变量

1. 当前仓库是唯一源码和构建输入。
2. Devin CLI 是唯一 Agent provider，且由用户独立安装与认证。
3. Renderer 不直接访问 Node、文件系统、credential 或子进程。
4. Devin session 是 transcript 事实来源，本地只保存 UI 元数据。
5. 未被 ACP 能力证实的操作不发送、不伪造。
6. Sandbox、permissions、MCP、Skills、Hooks、Plugins 与 Subagents 的执行权属于 Devin CLI。

## 交付检查

- 在不存在 DSCode checkout 的环境完成 install、typecheck、test、build 和 pack。
- 扫描 manifest、lockfile、imports、scripts、symlink、source map 和安装包。
- 用 mock ACP fixture 覆盖 capability 缺失、unknown update、timeout、配置拒绝和 child exit。
- 用受控临时仓库验证已认证 Devin CLI 的 initialize、session、prompt/cancel、permission、model/mode 和恢复流程。
- 确保 UI 与本文档对所有跳过、降级和云端边界使用一致文案。

上述检查已于 2026-08-21 完成；命令、版本、平台证据和未决事项见 [实施交付说明](implementation-delivery.md)。
