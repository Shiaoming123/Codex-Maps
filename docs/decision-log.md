# Codex Maps 决策记录

## 2026-08-22 — 项目与仓库统一命名为 Codex Maps

决定：本地仓库目录名、公开仓库名统一为 `Codex-Maps`，插件 id 为 `codex-maps`。

原因：产品目标不是简单整理列表，而是把 Session 的状态、层级和派生关系呈现为可理解的工作地图。

## 2026-08-22 — MVP 必须包含双形态（已被后续宿主证据修订）

决定：Windows MVP 同时包含 Codex 内嵌页和独立副屏窗口；独立页是开发入口和产品形态之一，不是对内嵌失败的替代声明。

原因：内嵌页降低管理动作的切换成本，副屏页满足持续观察。两种场景都是核心需求。

修订：双形态仍是产品目标，但不再是当前公开 MVP 的完成条件。当前发布边界以同日后续“核心产品继续，原生宿主发布暂缓”决定和 ADR 0002 为准。

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

决定：仓库保留 plugin manifest，但不把它描述成现成的原生侧栏注册接口。内嵌页面只有在受支持挂载点出现后，才由版本绑定、fail-closed 的 Codex host adapter 实现。

原因：manifest 可以承载插件元数据和技能，但内嵌路由、窗口与打开 thread 属于桌面壳能力，需要单独验证。

## 2026-08-22 — 永久删除必须暴露级联范围

决定：`thread/delete` 前必须列出 spawned descendants、要求输入 Session 名称，并优先提供归档入口。

原因：官方方法会永久删除目标及 spawned descendant threads，普通二次点击不足以表达影响范围。

## 2026-08-22 — 公开仓库隐私边界

决定：只提交源码、协议适配、去敏测试、产品文档和原型；不提交个人 Session、凭据、transcript、私有数据库、真实日志或个人截图。

原因：公开的是工具实现，不是用户的工作历史。

## 2026-08-22 — 可视化按问题分层

决定：一级页默认采用项目泳道图，二级派生关系采用只读树图；鱼骨图仅作为等待、阻塞和失败场景的 MVP+1 诊断视图。列表和卡片始终作为降级形态保留。

原因：自由思维导图在 Session 数量增大后难以稳定扫视，鱼骨图擅长原因分析但不适合导航。按任务分配图形语法，才能同时保证管理效率和关系可解释性。

## 2026-08-22 — 目标 build 的生成合同决定功能开关

决定：上游官方文档用于判断产品方向；发布与运行时能力以目标 `codex` 二进制通过 `app-server generate-ts`（稳定与 `--experimental`）生成的合同为第一证据，再辅以无副作用探测。生成合同中不存在的方法不得在 UI 中显示为可用。

原因：同一台机器上同时存在 Desktop 捆绑的 `0.149.0-alpha.4.1` 和用户目录中的 `0.130.0-alpha.5`，两者合同差异很大。如果只按文档或 PATH 中的 CLI 编码，会错误关闭或开放功能。

## 2026-08-22 — 能力探针必须绑定 Active Desktop Binary

决定：Host Probe 先从正在运行的 Desktop App Server 进程解析 executable path，再记录 version/hash 和生成合同。PATH、用户目录副本和 Desktop 捆绑二进制分别作为独立 target，不互相替代。

原因：首轮误把用户目录 `0.130.0-alpha.5` 当成 Desktop 捆绑版本，得到“无 delete/project/Section”的错误结论；进程树证明 Desktop 实际运行 `0.149.0-alpha.4.1`，其合同包含这些能力。该问题已修正文档并列入自动化探针验收。

## 2026-08-22 — Session Map 以 renderer 需求定义深模块边界

决定：共享 UI 只依赖 `SessionMapModule.observe(query) -> SnapshotSource`；`sourceId` 表示权威数据源，`epoch` 表示连接代次，`revision` 表示 Host Bridge 已提交的读模型版本。JSONL、握手、分页、去重、能力探测和重连都封装在模块内部。

原因：renderer 需要的是稳定、可订阅、可比较的完整快照，而不是原始协议事件。这个边界能阻止两个窗口各自解释 App Server 通知，也为后续单 Store 提供约束。详细权衡见 `docs/adr/0001-session-map-module.md`。

## 2026-08-22 — 独立 App Server 只允许用于只读开发诊断

决定：测试和本地 smoke 可以显式启动一个临时 `codex app-server` 验证 stdio 合同，但不得把它接入正式内嵌页或副屏。产品运行时必须复用 Codex Desktop 当前的唯一 Host Bridge；无法复用时 fail-closed。

原因：开发期需要可重复验证协议和传输，但这不能改变单事件源门禁，也不能用独立进程伪造两个宿主的实时一致性。

## 2026-08-22 — 真实 smoke 使用内容无关查询

决定：真实 App Server smoke 使用随机、预期无命中的 `searchTerm`，只断言握手成功和返回空数组，不打印 Session 标题、正文、ID 或总量。真实测试单独显式启用，默认测试套件跳过。

原因：既要证明本机二进制与 TypeScript stdio 适配器能真实互通，也要避免测试输出、失败快照或公开验收记录泄露个人工作数据。

## 2026-08-22 — 核心产品继续，原生宿主发布暂缓

决定：Codex Maps 的共享核心、地图 UI 和受支持的插件界面继续开发；原生左侧 route、宿主创建副屏和共享 Desktop request client 不再作为当前公开 MVP 的既成能力。它们保留为独立 Host Integration Gate，只有公开 API 或不修改安装包的受支持 loader 通过后才重新进入发布范围。

原因：当前 build 虽有内部 `electronBridge`、`connect-app-host` 和 request client，但插件 manifest 没有 route/window 注册合同，Bridge 只存在于 Codex 自己的 preload，精确导航也没有已验证回执。用 ASAR 修改、DOM 注入或第二 App Server 补齐都会破坏安全和单一事实源约束。详细边界见 `docs/adr/0002-host-bridge-and-release-boundary.md`。

## 2026-08-22 — 页面只拥有 Host Bridge lease

决定：Host Bridge 在 composition root 中只 attach 一次；内嵌页和副屏页各持有一个 lease，共享同一 SnapshotSource 与导航适配器。释放某个 lease 不关闭事实源；只有 Bridge owner 可以释放底层连接。未知 fingerprint 在 attach 前拒绝，导航必须核对宿主回执中的 exact thread id。

原因：这个边界同时编码了单 owner、多 renderer、fail-closed 和安全跳转，避免把 Electron IPC、ASAR hash、PID 或原始协议 envelope 暴露给 React。合同与权衡见 ADR 0002。

## 2026-08-22 — App Server 客户端成为 UI 无关的单读者深模块

决定：将 JSONL 请求/响应分发从 `SessionMapModule` 抽取为 `AppServerClient`。它独占一个输入 reader，以单调 request id 管理并发 pending 请求，以私有 writer queue 串行输出；UI 和页面只继续消费 `SessionMapModule.observe()` 的快照。

约束：每个请求独立超时，超时只表示投递结果未知，不自动重试或重放；通知监听器、关闭监听器的异常不得终止 reader；`dispose()` 可以重复调用，但底层连接只能释放一次。未知或迟到 response 不得错误完成其他请求。

原因：长期连接的并发、乱序响应、server request 拒绝和关闭竞争属于协议复杂度，不能泄漏给 Store 或 UI。集中在可替换 `JsonlConnection` seam 后，Memory fixture 能以确定时序验证，而 `SessionMapModule` 保持领域快照边界。

## 2026-08-22 — 独立只读 Map Reader 可先行交付

决定：在 Native Host Gate 阻塞期间，交付一个只绑定 `127.0.0.1` 的独立浏览器页面。它拥有一条自己的只读 App Server 连接，HTTP 层只消费 `SessionMapModule.observe({ kind: "overview" })` 的完整快照，并以 SSE 推送整个新快照；浏览器不接触 JSONL、协议增量或写操作。

边界：该页面不是当前 Codex Desktop 的第二窗口，也没有共享 Desktop 的内存事件源。它只能展示独立连接可见的 Session 列表、基础字段和自身收到的状态通知；Desktop 正在运行的 Turn、置顶顺序、原生导航、Token、计划和子 Agent 一律不伪造。断线时显示最后完整快照与 stale 提示。

原因：这让用户可以立即使用地图界面，同时保留单事件源和宿主兼容性判断的真实性。未来若出现受支持 Host Bridge，只替换页面的数据源 adapter，不重写页面协议或领域模块。
