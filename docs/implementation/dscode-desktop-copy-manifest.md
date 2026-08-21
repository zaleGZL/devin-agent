# Desktop 复制清单

该清单记录 DSCode Desktop 一次性复制到本仓库的 provider-neutral 文件。清单本身不要求访问 DSCode checkout；构建输入仅来自当前仓库。

来源 commit：`1ce0328cfa856700f6c955f5429ca00b08d99ea5`

## 已复制并改造

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/main.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/renderer/assets/devin-agent-logo.svg`（替换为中性 DA 图标）
- `apps/desktop/src/renderer/lib/`
- `apps/desktop/src/renderer/preview-api.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/tetris/` 与 `apps/desktop/tetris.html`（独立彩蛋页面，不接入 Agent runtime）
- `apps/desktop/src/main/app-settings.ts`
- `apps/desktop/src/main/recent-workspaces.ts`
- `apps/desktop/src/main/index.ts`（重写为 Devin-only Electron 壳）
- `apps/desktop/src/preload/index.ts`（typed `devinAgent` bridge）
- `apps/desktop/build/` 的构建结构；应用图标已替换为本项目原创的中性 `DA` 资产，不复用上游品牌图标
- `apps/desktop/vite.config.ts`、`tsup.config.ts`、`electron-builder.yml`

## 本仓库新增或替换

- `apps/desktop/src/main/devin-acp-host.ts`、`acp-transport.ts`、`devin-discovery.ts`：Devin ACP 运行时实现
- `apps/desktop/src/shared/`：ACP、会话、能力和 conversation view model 类型
- `apps/desktop/src/main/session-index.ts`：仅保存 Devin session 摘要与本地 UI overlay，不保存 transcript
- `scripts/check-independence.mjs`：独立性扫描

## 明确未复制

- DSCode Core 与其 RPC/agent host
- 多 provider、DeepSeek credential/model routing
- Terminal/TUI、VS Code/IDE 集成
- DSCode credential store、personalization system prompt 注入
- 任何 DSCode checkout、workspace path、symlink、submodule 或 `@thinkany/dscode-*` runtime package
