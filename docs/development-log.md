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
