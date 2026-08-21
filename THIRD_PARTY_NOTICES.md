# Third-party notices

## DSCode Desktop source and assets

本项目的 Desktop 布局、交互、样式、文件预览与工作区实现基于 DSCode 仓库一次性复制并在本仓库独立维护。复制来源：

- 来源仓库：`/Users/guozeling/workspace/git/dscode`（上游项目：`https://github.com/thinkany-ai/dscode`）
- 来源 commit：`1ce0328cfa856700f6c955f5429ca00b08d99ea5`
- 复制范围：`apps/desktop/src/renderer/` 的 provider-neutral UI、`apps/desktop/src/main/app-settings.ts`、`recent-workspaces.ts`、`themes.ts`、Electron 构建结构、样式及对应单元测试；具体文件见 `docs/implementation/dscode-desktop-copy-manifest.md`。应用图标与 renderer 品牌标识已由本项目原创中性资产替换。
- 排除范围：DSCode Core、provider/runtime、credential store、Terminal/TUI、VS Code 集成、DSCode 路径与 workspace package。

上游 DSCode 使用 MIT License。按照 MIT License，本仓库保留如下许可声明：

```text
MIT License

Copyright (c) 2026 ThinkAny

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Devin CLI

Devin CLI is an independently installed runtime. This repository does not
bundle, download, replace, or redistribute its binary. Users must install and
authenticate Devin CLI according to the official documentation under
`docs/devin-cli/`.
