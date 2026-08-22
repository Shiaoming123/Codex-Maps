# Codex Maps 开发与验证日志

本文件记录每个实施 checkpoint 的事实、问题、处置和剩余门禁。产品取舍写入 `decision-log.md`，可执行缺口写入 `issues.md`；这里保留时间顺序，避免后续重复诊断。

## 2026-08-22 — Conditional Go / 首个只读纵向切片

### 本轮目标

判断产品交互链路和架构是否足以进入开发，并落地最小但真实的 App Server → 领域快照链路。

### 已完成

- 比较三种模块接口后，选择 caller-first 的 `SessionMapModule.observe(query) -> SnapshotSource`；ADR 已记录被拒方案。
- 建立 pnpm + TypeScript + Vitest workspace。
- 实现 initialize/initialized、`thread/list` 全量分页、分页边界去重、冲突重复拒绝、游标循环拒绝、标题与执行状态归一化。
- 实现 Memory adapter 和 stdio child-process adapter；adapter 只负责所有权、进程生命周期和逐行传输，不解析业务 JSON。
- 使用用户目录 `codex-cli 0.130.0-alpha.5` 和 Desktop 实际捆绑的 `0.149.0-alpha.4.1` 分别完成内容无关 smoke：initialize 成功，随机无命中 `thread/list` 返回空数组。
- 核对 active Desktop build 的稳定与 experimental 生成合同：delete、project/Section 和关系字段可继续验证；App Server pin 字段不存在，需走 Host Bridge。

### 遇到的问题与处置

1. **适配器连接类型归属错误。** 初版 stdio adapter 引用了不存在的 `AppServerConnection`；实际公共契约是 `JsonlConnection`。已修正为共享类型，业务请求通道仍留在模块内部。
2. **真实 smoke 首次 5 秒超时。** 同一 Python 基线调用显示 App Server 冷启动可能超过默认测试预算；未降低协议断言，改为真实 smoke 独立 20 秒上限。复跑实际耗时约 2.1 秒并通过。默认单测仍保持快速且不依赖本机 Codex。
3. **错误绑定了 PATH 中的 CLI。** 首次探针把用户目录 `0.130.0-alpha.5` 当成 Desktop build，错误得出 delete、project/Section 缺失；进程树随后证明 Desktop 运行包内 `0.149.0-alpha.4.1`。已重新生成合同并修正文档。以后必须从 active process 解析 executable path，不能只执行 `codex --version`。
4. **standalone 与正式宿主容易混淆。** stdio tracer 会启动独立 App Server，只能证明协议链路，不能证明 Codex Desktop 内嵌复用。README、MVP 计划和决策日志均已明确该限制。
5. **Windows ASAR 路径语义。** `@electron/asar extract-file` 在当前环境要求归档内反斜杠路径；用正斜杠会报 file not found。探针必须先读取归档清单并使用返回的精确路径。
6. **临时 ASAR 探索目录的清理。** 内联递归删除最初被安全层拒绝；获得用户明确授权后，通过固定目标、根目录和目录名校验的一次性 PowerShell 脚本删除 1,452 个临时文件（315,489,525 字节），随后删除脚本本身并验证目录不存在。Git 工作区和 Codex 安装目录未被删除。正式 `probe-active-codex.ps1` 使用自身创建且严格校验的系统临时目录，并已验证能在 `finally` 中清理。

### Host Bridge Spike 初步证据

- Desktop 主进程当前只拥有一个 `codex.exe ... app-server`；两次 standalone smoke 退出后重新检查仍为一个，没有遗留第二进程。
- preload 存在受控 `electronBridge`，renderer 内部已有统一 request client、thread 方法和通知注册表。
- `scripts/probe-active-codex.ps1` 已把 active executable 识别、hash 校验和精确合同能力判断自动化；本轮报告确认 stable/experimental 的边界不同。
- 这把 CM-001 从“完全未知”推进到“有真实 seam，但未完成消费者复用证明”。详细指纹、冲突版本和下一实验见 `host-bridge-spike.md`。

### 验证证据

```text
pnpm verify
  TypeScript: pass
  Vitest: 2 pass, 1 real-environment smoke skipped by default

CODEX_MAPS_CODEX_PATH=<local codex.exe> pnpm test:smoke:app-server
  Vitest: 1 pass
```

Python 协议基线将在最终 checkpoint 与 TypeScript 验证一起重跑。真实 smoke 不输出或保存 Session 内容。

### 架构状态

**可继续开发，但尚不可发布。** 只读协议深模块的方向成立；整个产品仍受 CM-001 阻塞：必须证明内嵌页和副屏能复用 Codex Desktop 已有的 Host Bridge，并共享同一 `sourceId/revision`。在此之前，不进入真实 mutation 和发布接线。

### 下一开发批次

1. **CM-001 Host Bridge Spike：** 只读检查桌面宿主 bundle、IPC 和 App Server 所有权；产出 `HostCapabilities`、指纹报告和 fail-closed fixture，不修改系统安装目录。
2. **CM-002 客户端生命周期：** 先写合同测试，再实现 server request 拒绝策略、通知分发、响应超时、stderr 摘要、断线和重新握手。
3. **CM-003 Store：** 以快照为真相、通知为低延迟增量，实现双轴状态、stale/reconcile 和双订阅者同 revision 测试。
4. **CM-004 只读 UI：** 只在前三项门禁通过后，将现有项目泳道/二级关系原型接入 fixture 和共享 Store。

每项完成后更新本日志、`issues.md` 状态和对应 ADR；出现未知 Codex build、新协议字段或宿主所有权变化时，先记录证据再继续。

## 2026-08-22 — Host Bridge 合同与可落地性判定

### 本轮目标

把 CM-001 从“内部 seam 看起来存在”推进到可复核的 Go/No-Go，并用代码固定两个 renderer 的所有权和安全导航边界。

### 已完成

- 比较四份独立 interface 设计，选择最小 lease 方案：Bridge owner 单次 attach；页面只获得共享 SnapshotSource、exact-open 意图与自身 dispose。
- TDD 实现 `HostBridgeModule` 与 Memory adapter，覆盖单 attach、双 lease 同源、关闭一个 lease 不影响另一个、Bridge owner 只 release 一次、未知 fingerprint 在 attach 前拒绝。
- 增加 exact-navigation 回执校验；宿主返回的 `openedThreadId` 与请求不一致时直接失败。
- 新增只读 `probe-desktop-bridge.ps1`，从当前 ASAR 临时提取目标 bundle、输出有限上下文并在严格校验的系统临时目录中清理。
- 核验当前 preload：renderer 的 `connect-app-host` MessagePort 会被转发到私有 `codex_desktop:connect-app-host`；该 Bridge 只存在于 Codex 自己的 preload。
- 核验本机 bundled plugin manifests：声明范围为 skills、MCP server 和 interface 元数据，未发现 native route 或 BrowserWindow 注册字段。

### 决策

结论更新为 **Core GO / Codex Native NO-GO for current public release**：Session Map 核心、独立模式和安全管理语义继续开发；原生左侧入口、借用 Desktop 当前 request client 的副屏及精确原生跳转等待公开 API 或受支持 loader。禁止修改 MSIX/ASAR、DOM 注入和第二 App Server fallback。详见 ADR 0002。

### 遇到的问题与处置

1. **内联临时清理脚本被安全策略拒绝。** 将提取和 cleanup 写成可审计的固定脚本，并校验临时根目录和目录名前缀后执行；临时目录已在 `finally` 中删除。
2. **PowerShell `New-Item` 参数错误。** 当前 runtime 的 `New-Item` 不接受 `-LiteralPath`；改用 `-Path`，其余删除仍使用经过根目录校验的 `-LiteralPath`。
3. **内部 Bridge 不等于插件 API。** preload 和 renderer 证据只能证明 Codex 自身如何连接主进程，不能证明第三方可获得相同 sender 身份或 MessagePort。将其从“promising”调整为 production adapter 阻塞，而不是继续逆向注入。
4. **导航消息缺少回执。** 观察到 `navigate-to-route`，但没有 exact thread id 的确认合同；代码先锁定回执比较，当前 Desktop capability 保持关闭。

### 下一开发批次

1. CM-002：把顺序读取的 RequestChannel 升级为单 reader pump，正确分发并发 response、notification 和 server request。
2. CM-003：实现实时快照 Store、stale/reconcile 与双轴状态 reducer。
3. CM-004：把现有项目泳道/二级关系原型接入 fixture，先交付 Map Reader。
4. Host Integration Gate：只在官方 API 或受支持 loader 出现时恢复，不重复逆向当前 ASAR。

## 2026-08-22 — CM-002 单 reader pump 纵向切片

### 本轮目标

证明独立模式能够可靠消费长期 App Server 连接，而不是只完成一次 `thread/list` 后丢失实时事件。

### 已完成

- 以既有 `SessionMapModule.observe() -> SnapshotSource` 为公共测试 seam，把静态 source 升级为 React-safe 的原子快照提交。
- 将每个 request 自行读取 iterator 改为单 reader pump；pending response、notification 和 server request 由一个输入消费者分发。
- 支持 `thread/status/changed`：已知 Session 的 execution state 更新并发布 `revision + 1`；初始化分页期间到达的通知先缓冲，完整列表建立后再提交。
- 未知 thread id 不创建残缺 Session，也不产生虚假 revision。
- malformed status notification 不覆盖已有状态，也不会因 reducer 抛错而误判 transport 断线；未知 active flag 作为字符串保留，不把协议扩展变成解析崩溃。
- 意外 transport EOF 保留最后完整 sessions，发布 `sync=disconnected/stale:true`；显式 module dispose 不伪装成意外断线。
- 未支持的 App Server request 使用原始 ID 返回 JSON-RPC `-32601`，不会静默吞掉或自动批准。

### TDD 证据

每个行为均先得到失败测试，再做最小实现：缺少通知入口、初始化期通知被丢失、断线无状态、server request 被吞和未知 thread 产生虚假 revision，均分别经历 red → green。

### 仍未完成

- request timeout、orphan/duplicate response 诊断和逆序并发 response 合同。
- 单 writer queue 与写失败语义。
- notification sink 隔离、协议 classifier 的全部非法 envelope 测试。
- 自动重新 acquire、重新握手、全量校正和 epoch 推进。
- `thread/read`、goal、plan、token 与 turn reducers。

因此 CM-002 状态是 `single-reader-foundation-done`，不是 production complete。下一条最小切片应抽出可公开测试的 App Server client seam，先完成“两个并发 request、逆序 response 仍各自正确完成”和 request timeout。

## 2026-08-22 — CM-002 可验证客户端边界

### 本轮目标

把单 reader pump 收敛为 UI 无关的客户端边界，并证明长期 JSONL 连接在并发、超时和关闭竞争下不会错配或重复释放。

### 已完成

- 新增 `AppServerClient`：单一输入 reader、按递增 request id 的 pending map、私有串行 writer 和一次性 terminal close。
- `SessionMapModule` 改为消费该客户端；其公开边界仍然只有 `observe()` 快照，UI 不接触 JSONL envelope、timer 或传输生命周期。
- 新增 `MemoryJsonlConnection` 用于可控时序合同：两个并发请求的 response 以 `2 → 1` 逆序到达时，结果仍各自正确完成。
- 每个请求拥有独立 timeout；一个无 response 的请求超时后，另一个请求仍能正常完成。
- terminal close（含 EOF）会释放底层连接；重复 `dispose()` 仍只调用一次 `release()`。通知与关闭 listener 的异常被隔离，不能杀死共享 reader。

### 决策与问题

1. **不把并发协议暴露给 UI。** `AppServerClient` 是内部核心 seam，测试可导入，页面不能直接依赖；这避免两个 renderer 各自处理 raw event。
2. **timeout 不等于未送达。** 当前错误只表明 delivery unknown，因此没有自动重试或重放，尤其不能用于未来 mutation。
3. **测试曾出现 PromiseRejectionHandledWarning。** 原因是 fake timer 先触发 rejection、后注册断言；已改为在创建请求时立即绑定 rejection 断言，最终测试无未处理 rejection。

### 剩余门禁

- 为 writer 失败、orphan/duplicate response、server request 与本地 request id 碰撞、EOF/release 竞争补充合同测试。
- 实现 reconnect/re-handshake 和全量 reconcile 后，才能把 disconnected/stale 恢复为 ready。
- 再进入 `thread/read`、goal/plan/token 与二级详情 reducer；不在此阶段提前接入 UI。

## 2026-08-22 — 独立只读 Map Reader 首次交付

### 本轮目标

在不等待原生左侧嵌入的前提下，提供一个可启动、可查看、会随完整快照更新的独立页面，同时不误导用户它与正在运行的 Codex Desktop 共享实时状态。

### 已完成

- 新增本地 HTTP Reader：`GET /api/snapshot` 返回明确标记 `standalone-app-server / desktopShared:false` 的完整快照；`GET /api/events` 在连接后立即推送当前快照，并在 revision 更新时推送下一份完整快照。
- 新增零依赖浏览器页面：搜索、执行状态筛选、按工作目录分泳道、卡片选择和基础 Session 详情均消费上述快照；不把 `cwd` 伪装成项目。
- 页面将 ready、stale/disconnected 和不可连接分别显示为“最新完整快照”“最后完整快照”“无法连接”，不把未知运行态渲染为完成。
- 新增 `pnpm start:standalone`，默认启动 `127.0.0.1:41761`；本机实际启动后首页 HTTP 200，通过独立 App Server 完成初始化和首份快照。
- 以 PC 页面流模板新增独立 Reader 流程图，包含启动、就绪和断线三种页面状态。

### 决策与问题

1. **独立页不叫 Desktop 副屏。** 它可以自行展示独立连接数据，但没有证据表明能复用 Desktop 内存事件；文案固定说明未共享连接。
2. **浏览器只收完整快照。** SSE 不泄漏 JSONL，也不把协议 reducer 分散到 UI。浏览器重连后只需收到最新完整快照，无需 `Last-Event-ID` 回放。
3. **随机端口会触发浏览器禁用端口。** 测试曾遇到浏览器拒绝随机端口；正式启动改为固定、可配置的 `41761`，测试使用安全端口范围。

### 剩余门禁

- 当前没有自动 reconnect/re-handshake 或 3–5 秒全量对账；断线后只保留 stale 快照，不自动宣称已恢复。
- 独立 Reader 不进入 mutation、Desktop 导航、项目/置顶同步或 Token/计划/子 Agent 展示。
- Native Host Gate 仍按 ADR 0002 维持阻塞，未来以受支持 adapter 替换独立数据源。

## 2026-08-22 — Electron 独立桌面壳源码开发切片

### 本轮目标

把已交付的独立 Reader 装入可在 Windows/macOS 使用同一源码启动的 Electron 壳，同时不把该窗口描述为 Codex Desktop 的嵌入或共享实时源。

### 已完成

- 新增 `packages/desktop/`：Electron main process 创建唯一 `createRuntimeReader`，并以 `BrowserWindow` 承载 Reader 的 localhost 页面。
- 窗口默认启用 `contextIsolation`、sandbox、`webSecurity`，关闭 Node integration、webview、外部导航、新窗口和所有权限请求；Renderer 没有 raw IPC 或文件系统入口。
- 生命周期模块以可替换 application seam 覆盖单实例锁、second-instance 聚焦、macOS activate、Windows 最后窗口关闭与重复 close；Windows 会等待 Reader 完成关闭才退出。
- `pnpm start:desktop` 完成 TypeScript 构建并启动 Electron。一次 Windows 开发 smoke 使用显式 Codex executable 和独立端口，Electron 进程存活且首页返回 HTTP 200；未读取或输出任何 Session 内容。
- 将 Runtime Reader 抽出，浏览器 standalone 与 Electron 入口复用同一启动逻辑；新增交付计划、README 命令、问题状态与决策记录。

### 决策与问题

1. **首版不引入 preload/IPC。** 只读页面完全可通过它已有的 localhost HTTP/SSE 消费快照；保留最小权限面，未来只有真实桌面命令需要时才以窄化 contextBridge 添加 IPC。
2. **显式路径/PATH 优先于猜测安装位置。** `CODEX_MAPS_CODEX_PATH` 与 PATH 是当前稳定启动合同；Windows/macOS 自动发现必须拿到真实安装与升级证据后再加 platform adapter。
3. **不提前打包。** Electron 依赖仅用于源码开发启动。Windows 安装器/签名、macOS Apple Silicon codesign/notarization、发布凭据和自动更新都留在独立发布切片。
4. **导航解析错误按拒绝处理。** 安全测试发现无效 URL 会使 `new URL()` 抛错；窗口回调现捕获该错误并取消导航，而不是让主进程回调异常。

### 验证证据

```text
pnpm verify
  TypeScript: pass
  Vitest: 22 pass, 1 real-environment smoke skipped by default
  Python: 3 pass

pnpm start:desktop (Windows source smoke)
  TypeScript build: pass
  Electron process: running
  localhost Reader homepage: HTTP 200

pnpm start:desktop (token hardening rerun)
  Electron listener: running
  unauthenticated localhost snapshot: HTTP 403
```

### 剩余门禁

- macOS Apple Silicon 真实机启动与关闭 smoke。
- Windows 安装/卸载、签名与升级验证。
- Codex executable 平台发现 adapter；未知路径/版本必须给出可行动诊断，不猜测或修改官方安装。
- 断线恢复、详情字段和后续只读/写能力仍受现有 App Server 合同与 Native Host Gate 约束。

## 2026-08-22 — 地图优先页面与交互对齐

### 发现

- 实际 Electron 页面沿用了 Reader 早期三栏布局：固定详情栏挤占主区域，Session 仅纵向堆叠，和已确认原型中的“概览 → 筛选 → 工作线/泳道 → 按需详情”不一致。
- 目前的可信快照只有 `cwd`，不能把工作目录展示成 Codex 项目，也不能填充原型中尚无数据来源的置顶、归档、项目颜色、Token、计划或子 Agent。

### 已调整

- 首页改为地图优先：顶部状态、四项实时概览、状态/工作区筛选、横向工作区泳道和 Session 节点；保留列表视图作为降级形态。
- 当无工作区筛选时默认只呈现最近活跃的 6 条工作线，用户可显式展开全部；避免真实历史数据很多时，地图再次退化为无限长列表。
- Session 详情改为点击节点后打开的右侧抽屉，不再常驻占用地图空间；Esc、遮罩和关闭按钮均可收起。
- 已确认的 `forkedFromId` 以虚线节点和来源提示呈现；不存在时不从标题或内容推断关系。
- Windows/Linux 源码开发壳隐藏 Electron 默认 File/Edit 菜单，macOS 仍保留原生菜单栏。

### 后续验证

- 以真实本地 Reader 快照检查大量工作区/Session 时的横向滚动、筛选、列表降级和详情抽屉。
- 得到项目/Section 的受支持数据源后，将“工作区泳道”升级为项目泳道；此前保持兼容模式标签。

## 2026-08-22 — Host Bridge 可行性复验

### 验证结果

- 活动 Desktop probe 在三个 App Server 并存时，已可靠选择由 `ChatGPT.exe` 直接拥有的 Desktop owner；生成的稳定/experimental 合同与既有记录一致。
- 只读 ASAR 探针确认实时 request client 与 `connect-app-host` 都依赖 Codex 自己的 Electron preload 和私有 IPC；没有获得外部 socket、attach/discovery 入口、route/window 注册合同或可验证的精确导航回执。
- 因此，Codex Maps 已能实时渲染**自己拥有的** App Server 快照，但当前不能实时、可靠地监控用户正在使用的 Codex Desktop 中的任务。该限制来自公开宿主接入接口缺失，不是地图 UI 或事件 reducer 的实现缺口。

### 记录的决策

按 Host Bridge Spike 的退出条件停止 private bridge 路径；不采用 ASAR 修改、DOM 注入、preload 冒用、进程内存读取或第二 App Server 伪造同步。恢复当前 Desktop 监控开发的前提是官方提供 attach/discovery/event bridge，或用户明确选择将 Codex Maps 改为自己创建和管理任务的独立工作台。

## 2026-08-22 — 本机 JSONL 兼容监控切片

### 结论

当前 Desktop 任务状态可以以本机只读兼容模式落地；这解除的是“独立页面能否观察当前 Desktop Session 状态”的阻塞，不解除 Native Host Gate。

### 已完成

- 新增 `FilesystemCompatSessionMapModule`，复用 `observe({ kind: "overview" }) -> SnapshotSource`，不向 renderer 暴露原始 JSONL。
- 只解析 `session_meta`、`task_started`、`task_complete`、`turn_aborted`；损坏或截断行忽略，目录读取失败将最后完整快照标为 stale。
- 默认 standalone/Electron 使用该模式；`CODEX_MAPS_SOURCE=app-server` 可显式保留旧的独立 App Server 诊断路径。
- UI 新增已完成、已中断状态与来源说明；session 标题以短 id 显示，正文不进入页面。
- 合成测试、临时文件追加测试、全量 `pnpm verify` 与本机只读 smoke 已通过。

### 待办与风险

- 首次索引会读取历史 JSONL；后续每秒只检查文件元数据并重读变化文件。本机 1,454 个 session 的两个刷新窗口 CPU 约 16ms；目录 watcher/真正的尾随解析留待跨平台性能证据出现后再决定。
- Token 事件尚未投影数值；完成百分比、标题、Fork、项目/Section、子 Agent 和写操作仍没有足够的稳定来源。
- macOS/Linux 需要实机验证 session 路径和追加行为；当前只宣称 Windows 本机 smoke。

## 2026-08-22 — Windows 快速启动入口

### 决定

在尚未进入安装器/签名阶段前，提供受版本控制的 `start-codex-maps.vbs` 和 `shortcut:windows` 安装脚本；它们创建用户桌面的 `Codex Maps.lnk`，通过隐藏的 Windows Script Host 启动已有 `pnpm start:desktop` 流程。

### 边界

- 快捷方式只启动本仓库的源码开发壳，不修改 Codex Desktop、系统安装目录或注册表。
- 首次或源码变更后仍会构建 TypeScript；未提供后台更新、开机启动、安装/卸载或代码签名。
- 已存在同名快捷方式时，脚本默认拒绝覆盖，必须显式 `-Force`。
