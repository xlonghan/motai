# 墨台项目指引

<!-- codebase-memory-mcp:start -->
For structural codebase exploration, use the installed `codebase-memory` skill.
<!-- codebase-memory-mcp:end -->

本项目使用 Vue 3、Cherry Markdown、Tauri 2 和系统 WebView2。当前桌面交付目标为 Windows x64。修改前用 `svn status` 核对工作区，保留现有改动。结构索引覆盖不足或过期时，以当前源码为准。

## Windows 构建与安装

- `npm run build:desktop` 构建便携版，由 `scripts/build-desktop.mjs` 输出到 `output/desktop/墨台.exe`。便携版使用普通构建，更新 EXE 时保留已有 `builtin/`、数据和文档。
- `npm run build:installers` 由 `scripts/build-installers.mjs` 用 Cargo 的 `installed` feature 编译同一个安装版 EXE，再分别打包到 `output/installers/`。安装包文件名包含版本、架构和安装范围。
- 用户级 NSIS 包使用 `currentUser`，默认安装到 `%LOCALAPPDATA%\墨台`，权限清单应为 `asInvoker`。系统级使用 `perMachine`，默认安装到 `%ProgramFiles%\墨台`，权限清单应为 `requireAdministrator`。两份包保持独立，Tauri 的 `both` 模式也会为用户级选项请求管理员权限。
- NSIS 内置 WebView2 引导程序。已有 WebView2 的系统可复用运行时，缺少运行时时需要联网。构建使用仓库固定的 Rust MSVC 工具链，支持 `RUST_BUILD_CACHE_ROOT` 和 `CARGO_TARGET_DIR`，产物与缓存留在各自目录。

## 数据、预置文档与启动

- `src-tauri/src/portable.rs` 和 `portable_runtime.rs` 负责数据路径。便携版以 EXE 目录为根，安装版以当前账户的 `%LOCALAPPDATA%\MarkdownDesk` 为根。系统级安装共享程序文件，每个账户各自保存设置、草稿、缓存、新建文档和默认导出文件。测试可通过 `MARKDOWN_DESK_DATA_DIR` 指向独立目录。
- 桌面设置以 JSON 为准。草稿自动保存到 `data/drafts/workspace.json`，显式保存才写回原 Markdown。保留原子写入和外部修改检查。安装版与便携版各自维护数据目录。
- 项目根目录的 `builtin/` 是预置文档的源。启动时只补齐数据根目录内缺失的预置文件，保留用户改过的内容、图片和空文件。启动阶段只加载预置目录信息，正文在用户打开时加载。保留 `src/lazy-mermaid.js` 的按需加载。

## Windows 文件关联

- `.md` 的「打开方式」候选、资源管理器打开历史、旧版 `Applications` 登记和 Windows 默认应用是独立状态。注册候选使用 `OpenWithProgids` 与 `RegisteredApplications`，完成后调用 `SHChangeNotify`。默认应用由用户在 Windows 系统界面确认。
- `src-tauri/src/file_association.rs` 负责登记、查询和默认应用跳转。`legacy_open_with.rs` 负责核对并清理用户选中的旧登记。移除候选时保留当前默认程序所需的启动命令，保护 `UserChoice` 和其他文件类型。清理重复登记只操作已核对的注册表项，程序文件保留。
- 同名「墨台」可能来自不同 EXE。排查时核对完整路径、登记来源和当前默认应用。扫描注册表名称时保留原始 Windows 字符串，避免无效 UTF-16 名称中断扫描。

## 编辑、预览与导出

- 在 `src/page-navigation.js` 维护源码行和预览块的位置映射。回归时覆盖长文档尾部、展开和收起、滚动条从底部向上拖动以及切换主题后的阅读位置。检查明暗主题下源码、预览和扩展内容的对比度。
- 应用图标通过 `src/Icon.vue` 和 `src/icons.js` 使用 Lucide SVG。保留文档中的 Emoji、示例插图和 Mermaid 图表内容。
- Cherry 负责 Markdown 渲染。导出通过 `src/export-readiness.js` 等待当前预览，HTML 由项目封装，桌面 PDF 通过 WebView2 的 `PrintToPdf` 生成。保留「跟随编辑器预览」的正文样式、复选框状态、图表对齐和文档显式指定的图片对齐。相对图片按原 Markdown 的目录解析，并检查导出后的图片是否能独立显示。

## 验证

- 前端回归运行 `npm test`。修改预置演示或 Mermaid 模板后，用 `npm run demo:check` 核对。
- 修改 Windows 原生逻辑时运行 `src-tauri` 的 Rust 测试。关联写入和清理使用隔离注册表测试，现场只读核对时记录实际生效的处理程序。
- 交付安装包时分别核对两个 EXE 的权限清单、安装版数据根目录和打包输出。报告时区分通过静态校验、隔离启动与实际安装或卸载验证。
