# Codex Maps 路线图

路线按依赖顺序而非日期承诺组织。Windows MVP 的定义包含内嵌页和独立副屏；独立窗口可以作为开发与验证入口，但不能替代最终的内嵌验收。

## Phase 0 — Foundation（当前）

- 仓库、插件清单和项目名称统一为 Codex Maps。
- 产品问题、官方能力、双轴状态和隐私边界明确。
- Python 只读诊断片验证 initialize 与 thread/list 基本协议。
- PC 页面流覆盖双入口、一级/二级、项目、关系与删除确认。

退出条件：协议测试、文档链接、原型结构、公开仓库边界和 GitHub remote 全部校验。

## Phase 1 — Shared Source Gate

- 验证当前 Codex build 的 app-server ownership 与事件转发路径。
- 建立 Host Bridge 与单 mutation queue。
- 用两个最小窗口订阅同一个计数器/Session 状态。
- 定义 build hash allowlist 与 fail-closed 行为。

退出条件：真实 Session 在两个窗口同步变化；任一窗口关闭/重开不分裂状态；不存在第二个写者。

## Phase 2 — Readable Map Vertical Slice

- TypeScript App Server client、分页与能力探测。
- Session Store、项目/cwd 分组、搜索、置顶、归档筛选。
- 一级地图与二级详情的真实数据接入。
- 最近 Agent 输出摘录与 unknown/freshness UI。

退出条件：能从 500 个 Session 中找到目标、打开详情并跳回准确 Codex Session；未支持字段有明确降级。

## Phase 3 — Realtime State Vertical Slice

- thread status、active flags、turn、plan、item、token 和 goal 事件 reducer。
- 执行状态与目标状态分离。
- 重连快照、乱序/重复事件、睡眠唤醒和断线提示。
- 副屏看板与完成/等待提醒。

退出条件：创建 → 运行 → 等待 → Turn 完成 → 目标完成 → 失败恢复的真实链路在两个窗口一致。

## Phase 4 — Safe Management Vertical Slice

- rename、pin/unpin、archive、unarchive。
- delete descendants 预览、强确认与逐条通知核对。
- mutation 审计元数据、错误反馈和不确定结果处理。

退出条件：五类操作均有成功、取消、失败测试；删除无法误触，且 UI 影响范围与实际通知一致。

## Phase 5 — Windows Dual-Host MVP

- Codex 左侧入口与内嵌路由。
- 同进程独立副屏 BrowserWindow、多屏位置记忆和重开。
- Windows x64 打包、安装发现和 Codex build 门禁。
- 原生 PowerShell 与 WSL2 路径/打开 Session 验证。

退出条件：Windows x64 端到端验收全部通过；官方安装目录无写入；未知 build 自动停止内嵌加载。

## Phase 6 — Projects and Relationships

- project/threadSection 能力存在时读取和安全编辑。
- 多根目录、图标、颜色、排序和 section。
- Fork/子 Agent 两层关系图与列表降级。

退出条件：实验能力关闭时核心 MVP 不受影响；任何关系都可追溯到字段/事件来源。

## Phase 7 — Platform Expansion

- macOS Apple Silicon host adapter 与打包验证。
- Linux x64/ARM64 preview 适配。
- Wayland/XWayland 限制提示和能力降级。
- 跨平台 CI 跑共享核心，平台 smoke 使用真实桌面构建。

退出条件：新增平台不复制 Session Store/UI 逻辑；每个平台有版本、CPU、窗口、路径和升级证据。

## 发布原则

- Foundation 可以发布为计划与诊断工具，但必须写明尚未嵌入。
- Windows MVP 只有在双宿主、实时状态和安全 mutation 全部通过后才能称为“可用”。
- project、threadSection、parent/ancestor 等实验能力不阻塞核心列表/详情/状态。
- Codex 自动更新导致 host hash 失配时，兼容状态降级为“不支持此 build”，不能静默继续。
