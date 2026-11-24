# 第三方项目与资源

本文件列出主要直接依赖与随仓库分发的字体 / 数据来源。实际依赖版本以 npm 和 Cargo 锁文件为准；各项目的完整许可文本与著作权声明以对应上游版本为准。

## 前端与本地网页工具

| 项目 | 许可证 | 用途 |
| --- | --- | --- |
| [Vue](https://github.com/vuejs/core) | MIT | 界面 |
| [Cherry Markdown](https://github.com/Tencent/cherry-markdown) | Apache-2.0 | 编辑器与 Markdown 解析 |
| [Lucide](https://lucide.dev/) | ISC，部分图标沿用 Feather 的 MIT 许可 | 界面 SVG 图标，见 [完整许可](public/licenses/Lucide-LICENSE.txt) |
| [Mermaid](https://github.com/mermaid-js/mermaid) | MIT | 图表 |
| [KaTeX](https://github.com/KaTeX/KaTeX) | MIT | 公式与字体资源 |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 OR Apache-2.0 | HTML / SVG 清理 |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | MIT | 网页 PDF 书签处理 |
| [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | 网页调试 PDF |
| [Vite](https://github.com/vitejs/vite) | MIT | 开发构建 |
| [jsdom](https://github.com/jsdom/jsdom) | MIT | 仅测试使用的 DOM 环境 |

Cherry Markdown 还使用 CodeMirror、Prism 等组件，Mermaid 使用若干布局与绘图库。它们经依赖管理器安装，不是本项目自行编写的实现。

## Rust 桌面端

| 项目 | 许可证 | 用途 |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) 与官方插件 | MIT OR Apache-2.0 | 窗口与系统接口 |
| [tauri-plugin-log](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/log) / [log](https://github.com/rust-lang/log) | MIT OR Apache-2.0 | 分级日志与文件轮换 |
| [windows-rs](https://github.com/microsoft/windows-rs) | MIT OR Apache-2.0 | Windows API |
| [webview2-rs](https://github.com/wravery/webview2-rs) | MIT | WebView2 COM |
| [lopdf](https://github.com/J-F-Liu/lopdf) | MIT | PDF 书签 |
| [Serde](https://github.com/serde-rs/serde) / serde_json | MIT OR Apache-2.0 | 数据序列化 |
| [Tokio](https://github.com/tokio-rs/tokio) | MIT | 异步与后台任务 |
| [base64](https://github.com/marshallpierce/rust-base64) | MIT OR Apache-2.0 | 图片数据编码 |

## 随仓库分发的资源

- `src/assets/fonts/markdown-desk-flags.woff2`：由 Noto Color Emoji v50 截取旗帜相关字符并重命名字体家族。原始字体采用 SIL Open Font License 1.1，版权与许可元数据保留在字体中。见 [说明](public/licenses/emoji-flags.txt) 和 [完整 OFL](public/licenses/Noto-Emoji-OFL.txt)。
- `src/data/emoji.json`：Unicode Emoji 18.0 分类及 CLDR 49 中文注释的整理数据，见 [来源说明](public/licenses/emoji-data-sources.txt) 和 [Unicode License](public/licenses/Unicode-LICENSE.txt)。
- `builtin/assets/demo-illustration.svg`、应用 M 图标和仓库界面截图为本项目的演示资源，不来自额外的图库或图标包。

部分常用依赖许可文本同时保存在 `public/licenses/`，构建时会随本地静态资源保留。此清单不改变任何上游许可证，也不替代其完整条款。
