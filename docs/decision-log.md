# Codex Maps 决策记录

## 2026-08-22 — 项目与仓库统一命名为 Codex Maps

决定：本地仓库目录名、公开仓库名统一为 `Codex-Maps`，插件 id 为 `codex-maps`。

原因：产品目标不是简单整理列表，而是把 Session 的状态、层级和派生关系呈现为可理解的工作地图。

## 2026-08-22 — MVP 必须包含双形态

决定：Windows MVP 同时包含 Codex 内嵌页和独立副屏窗口；独立页是开发入口和产品形态之一，不是对内嵌失败的替代声明。

原因：内嵌页降低管理动作的切换成本，副屏页满足持续观察。两种场景都是核心需求。

## 2026-08-22 — 两个窗口共享唯一事件源

决定：Host Bridge 是唯一 App Server 连接与 mutation 出口；内嵌 renderer 和副屏 BrowserWindow 共享 Session Store。

原因：多 app-server 会造成实时事件不一致，并可能触发 thread 单写者冲突。共享 Store 是 MVP 的第一技术门禁。

## 2026-08-22 — 执行状态与目标状态分离

决定：`turn/completed` 只结束当前执行，不自动标记整个 Session 目标完成。完成勾选来自明确 goal 状态或用户显式标记。

原因：一次 Agent 回复结束与任务整体完成语义不同；混用会产生最危险的“假完成”。

## 2026-08-22 — Windows 首发、核心跨平台

决定：首个完整支持目标为 Windows 11 x64；macOS Apple Silicon 第二验证，Linux x64/ARM64 preview 第三；WSL2 单列测试。领域、协议、Store 和 UI 不允许包含平台分支。

原因：当前真实使用环境可以提供最快的端到端反馈，同时官方桌面已跨多个系统，后补架构会造成路径和宿主层重写。

## 2026-08-22 — App Server 是权威来源

决定：不直接读写 Codex JSONL/SQLite。稳定方法优先；project、threadSection、parent/ancestor 等实验能力通过 initialize 和运行时探测启用。

原因：App Server 是官方用于富客户端的协议边界，私有存储格式与桌面版本耦合且存在并发风险。

依据：[Codex App Server](https://developers.openai.com/codex/app-server)、[开源协议 README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)。

## 2026-08-22 — 插件与宿主扩展如实区分

决定：仓库保留 plugin manifest，但不把它描述成现成的原生侧栏注册接口。内嵌页面由版本绑定、可回退的 Codex host adapter 实现。

原因：manifest 可以承载插件元数据和技能，但内嵌路由、窗口与打开 thread 属于桌面壳能力，需要单独验证。

## 2026-08-22 — 永久删除必须暴露级联范围

决定：`thread/delete` 前必须列出 spawned descendants、要求输入 Session 名称，并优先提供归档入口。

原因：官方方法会永久删除目标及 spawned descendant threads，普通二次点击不足以表达影响范围。

## 2026-08-22 — 公开仓库隐私边界

决定：只提交源码、协议适配、去敏测试、产品文档和原型；不提交个人 Session、凭据、transcript、私有数据库、真实日志或个人截图。

原因：公开的是工具实现，不是用户的工作历史。
