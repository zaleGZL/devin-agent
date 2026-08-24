---
name: release
description: 发布 Devin Agent 桌面版本并同步 main、dev 分支。仅在用户明确要求正式发布、执行 release 流程或发布桌面安装包时使用；普通本地构建不使用。
---

# Release

按固定顺序发布当前 `apps/desktop/package.json` 中的版本，并在发布后同步开发分支。

## 前置约束

- 必须从仓库根目录执行。
- 发布和推送 tag 是外部变更；仅在用户明确要求发布时执行。
- 开始前检查工作区。若存在未提交改动，停止并报告；不得自动 stash、丢弃或覆盖改动。
- 不修改版本号。版本应已由待发布代码提交按仓库规则更新。
- 分支切换、拉取或合并失败时停止；不得使用强制切换、rebase、reset 或强推。

## 执行流程

1. 执行 `git switch main`。
2. 执行 `git pull --ff-only origin main`，确保本地 `main` 与远端一致。
3. 再次确认工作区干净，然后执行 `pnpm publish:desktop`。
   - 必须等待该本地命令结束，并确认 release tag 已成功推送。
   - 命令结束后不等待、不轮询 GitHub Actions，也不等待 GitHub Release 安装包生成。
4. 立即执行 `pnpm pack:mac`，等待本地 Apple Silicon DMG 构建完成并复制到 `~/Downloads`。
5. 执行 `git switch dev`。
6. 执行 `git merge main`，把刚发布的 `main` 合并到本地 `dev`。
   - 若发生冲突，停止并报告冲突文件，不擅自解决。
   - 除非用户另外要求，否则不推送 `dev`。

## 完成报告

简要报告以下事实：

- 发布版本与已推送的 tag。
- 本地 DMG 的绝对路径。
- 最终所在分支及工作区状态。
- GitHub Actions 未等待，其状态尚未作为本流程完成条件。
