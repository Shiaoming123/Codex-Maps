# Codex Maps

让 Codex Session 像地图一样可观察、可理解、可管理。

Codex Maps 计划提供同一套 Session 地图的两种形态：Codex 左侧入口打开的内嵌页，以及适合放在副屏持续观察的独立窗口。两者必须共享同一个实时 Session Store，避免状态延迟、冲突或重复写入。

当前状态：`0.1.0 foundation / core GO / native host blocked`。仓库已经完成命名、产品边界、MVP 架构与 PC 页面流，并落地 App Server 只读切片和 Host Bridge 合同切片。**产品核心可以继续实现；当前 Codex Desktop 没有公开 native route/window 挂载合同，所以本版本不是原生左侧插件，也不会修改签名安装包来伪装实现。**

## MVP 要解决什么

- 一级地图：按运行状态、项目、置顶、归档和最近更新查看 Session。
- 二级详情：查看当前进度、最近输出、Token/上下文、派生 Session 与子 Agent。
- 实时状态：运行、等待输入、空闲、失败，以及目标进行中、暂停、阻塞、完成分别展示。
- 基础管理：重命名、置顶、归档、恢复和永久删除；删除前必须展示会被级联删除的派生 Session。
- 双入口：Windows Codex Desktop 内嵌页与独立副屏窗口使用同一份 UI 和事件源。
- 安全跳转：从地图打开准确的原 Codex Session。

完整 Fork 关系图、项目根目录编辑、跨 Session 智能摘要和分析统计属于 MVP 后增强；项目图标、颜色、根目录等信息会在 MVP 中尽可能读取展示。

## 核心技术判断

`codex app-server` 是 Session 的权威来源。Codex Maps 不直接修改 Codex 的 JSONL 或 SQLite 私有存储。功能开关必须以 **Codex Desktop 实际运行的二进制** 生成合同为准，不能误用 PATH 中另一个 CLI。当前桌面宿主运行 `codex-cli 0.149.0-alpha.4.1`：稳定合同包含删除和 Section，experimental 合同另包含项目与 parent/ancestor 关系筛选；置顶仍是 Desktop 宿主的本地侧栏状态，没有 App Server `isPinned` 字段，因此必须通过 Host Bridge 单独验证。

[官方插件架构](https://developers.openai.com/plugins/concepts/plugins)允许插件组合 skills、MCP server 和可选 UI resource，但这并不等于存在“注册持久化原生左侧页面”的公开接口。因此本项目实际由两部分组成：

1. 可安装的 Codex 插件包，用于名称、技能和后续命令入口。
2. 本地桌面宿主适配层，用于能力门禁、独立窗口，以及未来受支持的内嵌路由和共享事件桥。

壳层适配必须绑定具体 Codex build，失配时停止加载；不得直接改写系统安装目录。

当前落地判断：Session Map 核心、独立只读地图，以及由 Codex Maps 自己拥有 App Server 时的实时管理模式可实现；原生左侧入口、借用 Desktop 当前 request client 的副屏和可核验的原生跳转暂不可公开交付。详见 [Host Bridge 发布边界 ADR](./docs/adr/0002-host-bridge-and-release-boundary.md)。

## 平台策略

MVP 首发目标是当前开发环境的 Windows x64 Codex Desktop。业务模型、App Server 客户端和共享 React UI 从第一天保持跨平台；Windows、macOS、Linux/Wayland 和 WSL 差异被隔离在 host/platform adapter 中。

- Windows x64：MVP 完整验收目标。
- macOS Apple Silicon：第二个正式验证平台。
- Linux x64/ARM64：跟随官方桌面预览能力，作为第三阶段适配。
- WSL2：视为独立执行环境，专门验证 Windows、UNC 与 Linux 路径映射。

## 仓库结构

```text
Codex-Maps/
├─ .codex-plugin/plugin.json      # Codex 插件清单
├─ docs/                          # 产品、架构、能力矩阵和开发规划
│  └─ prototypes/                 # 可交互 PC 页面流原型
├─ packages/session-map/          # 首个 TS 深模块与 App Server 适配器
├─ scripts/codex_maps.py          # 只读 App Server 诊断客户端
├─ skills/                        # 后续插件技能入口
├─ data/                          # 仅本地偏好，不提交 Session 数据
└─ tests/                         # Python 协议基线测试
```

## TypeScript 纵向切片

```powershell
pnpm install
pnpm verify

# 可选：连接本机 App Server，只执行随机无命中搜索，不输出 Session 内容
$env:CODEX_MAPS_CODEX_PATH="$env:LOCALAPPDATA\OpenAI\Codex\bin\codex.exe"
pnpm test:smoke:app-server
```

默认测试会跳过真实环境 smoke；只有显式设置 `CODEX_MAPS_CODEX_PATH` 才会启动独立、只读的诊断 App Server。该进程仅用于开发验证，不能作为内嵌页或副屏窗口的数据源；正式宿主仍必须复用 Codex Desktop 的唯一 Host Bridge。

Windows Host Bridge 开发前先运行 active-process 探针，避免误用 PATH 中的另一个 CLI：

```powershell
.\scripts\probe-active-codex.ps1
```

报告写入被 `.gitignore` 排除的 `.local/host-probe.json`，只包含进程/版本/哈希和合同能力，不读取 Session 数据。

如需复核当前 Desktop preload 的 Bridge envelope，可运行：

```powershell
.\scripts\probe-desktop-bridge.ps1
```

该脚本只读取安装包中的 JavaScript bundle，在系统临时目录提取有限文件并自动清理；不读取 Session，也不修改 Codex 安装目录。

## 当前诊断客户端

要求：已安装可执行的 `codex`，并已完成登录。

```powershell
python .\scripts\codex_maps.py list --limit 25
python .\scripts\codex_maps.py list --search "Website"
python .\scripts\codex_maps.py list --archived --json
```

如果 Microsoft Store 的 `codex` 别名在普通 PowerShell 中被拒绝执行，可显式传入用户目录中的可执行文件：

```powershell
python .\scripts\codex_maps.py list --codex-path "$env:LOCALAPPDATA\OpenAI\Codex\bin\codex.exe"
```

该 CLI 当前只调用 `initialize` 和 `thread/list`，不会读取完整正文，也不会执行写操作。

## 设计与开发文档

- [产品简报](./docs/product-brief.md)
- [架构与兼容性](./docs/architecture.md)
- [官方能力矩阵](./docs/capability-matrix.md)
- [MVP 实施计划](./docs/mvp-plan.md)
- [问题与验收清单](./docs/issues.md)
- [路线图](./docs/roadmap.md)
- [决策记录](./docs/decision-log.md)
- [开发与验证日志](./docs/development-log.md)
- [Windows Host Bridge Spike](./docs/host-bridge-spike.md)
- [Session Map 模块 ADR](./docs/adr/0001-session-map-module.md)
- [Host Bridge 与发布边界 ADR](./docs/adr/0002-host-bridge-and-release-boundary.md)
- [PC 页面流原型](./docs/prototypes/codex-maps-flow.html)

官方技术依据：[Codex App Server](https://developers.openai.com/codex/app-server)、[App Server 开源协议说明](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)、[Codex harness 介绍](https://openai.com/index/unlocking-the-codex-harness/)。

## 隐私与发布边界

公开仓库只包含代码、协议适配、文档、无敏感 fixture 和测试。不得提交个人 Session 正文、登录凭据、Token、Codex 私有数据库、真实项目路径快照或包含隐私的截图。

MIT。Codex Maps 是独立社区项目，不代表 OpenAI，也不重新分发官方 Codex 安装包。
