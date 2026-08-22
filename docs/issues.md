# Codex Maps 问题与验收清单

优先级：P0 决定 Windows MVP 是否真实可用；P1 完善项目管理与跨平台；P2 扩展关系图和长期分析。`done-foundation` 仅表示文档/诊断片完成，不等于产品功能已交付。

## P0 — Windows MVP

### CM-001 单一事件源技术 Spike

状态：`doing`

验收：在一个受控 Codex build 中证明内嵌页和副屏窗口订阅同一个 Host Bridge/Session Store；mutation 只有一个写队列；关闭任一窗口不破坏另一窗口；第二个独立 app-server 不参与实时状态。

失败条件：只能通过两个 app-server 或轮询私有存储获得状态。此时内嵌发布必须停止并重新评估宿主方案。

### CM-002 生产级 App Server 客户端

状态：`todo`（Python 只读诊断片为 `done-foundation`）

验收：TypeScript 客户端完成 initialize、分页、read、订阅、超时、能力探测和结构化错误；断线后重新握手；未知 mutation 结果不自动重放。

### CM-003 规范化 Session Store

状态：`todo`

验收：快照与事件 reducer 能处理重复、乱序、缺失和重连；执行状态与目标状态分离；`turn/completed` 不产生目标完成；字段缺失显示 unknown。

### CM-004 一级地图与二级详情

状态：`prototype-done / implementation-todo`

验收：搜索、分页、项目/cwd、置顶、归档、状态筛选可用；详情显示计划、最近输出摘录、Token/上下文和派生数量；至少 500 个 Session 下仍可操作。

### CM-005 实时可观察性

状态：`todo`

验收：running、waiting、idle、failed 与 goal 状态在两个窗口一致；事件到 UI 的本机 P95 目标小于 1 秒；断线、重连和数据陈旧有可见提示。

### CM-006 安全管理操作

状态：`todo`

验收：rename、pin/unpin、archive、unarchive、delete 均有成功/失败反馈；delete 在确认前列出 spawned descendants、说明级联、要求输入标题，不提供批量快速删除。

### CM-007 打开准确的 Codex Session

状态：`todo`

验收：从两个宿主点击同一 Session 都打开准确 thread id；不存在或已删除时不跳到相似标题；Windows 原生与 WSL cwd 均验证。

### CM-008 双形态宿主

状态：`todo`

验收：左侧入口、内嵌路由、副屏窗口、多屏记忆和窗口恢复可用；两个宿主复用同一 UI 包；副屏关闭后可从内嵌页重新打开。

### CM-009 Codex build 门禁与回退

状态：`todo`

验收：记录 app/version/hash；未知 build 不加载内嵌适配；不写系统安装目录；失败时官方应用仍可启动，诊断信息能解释不兼容原因。

### CM-010 隐私与公开发布门

状态：`doing`

验收：diff、secret scan、fixture 去敏和 `.gitignore` 全过；仓库不包含真实 Session 正文、凭据、私有数据库、真实运行日志或个人截图。

## P1 — 项目管理与跨平台

### CM-101 项目/Section 读取展示

状态：`todo`

验收：能力存在时显示项目名称、图标、颜色、顺序、多个 roots、置顶 section；不存在时按 cwd 分组并显示“兼容模式”，不伪造项目归属。

### CM-102 项目/Section 安全编辑

状态：`todo-after-capability-probe`

验收：实验 API 可用才启用创建、更新、移动和删除归属；删除项目只清除归属，不删除 Session 或磁盘目录；roots 变更展示影响数量。

### CM-103 macOS Apple Silicon 适配

状态：`todo-after-windows-mvp`

验收：共享核心测试不分叉；host adapter 通过 app bundle、arm64、快捷键、窗口与升级 smoke；不要求改写领域层。

### CM-104 WSL2 兼容

状态：`todo`

验收：保存并比较路径时保留 source environment；`C:\`、`/mnt/c`、UNC 不误判为同一目录；项目筛选、打开 Session 和详情路径均正确。

## P2 — 关系地图与 Linux

### CM-201 Fork / 子 Agent 关系图

状态：`todo`

验收：节点关系有明确来源与置信度；区分用户 Fork 与 spawned subAgent；支持至少两层展开；能力缺失时退回列表，不从标题猜关系。

### CM-202 Linux x64/ARM64 preview

状态：`todo-after-macos`

验收：支持官方列出的 deb/rpm 平台；Wayland 下不依赖绝对窗口位置；浮窗/快捷键限制明确展示；X11/Wayland 至少各有一次 smoke 记录。

### CM-203 历史分析与智能摘要

状态：`future`

验收：用户显式开启才生成；摘要带来源与更新时间；不默认上传完整 transcript；Token 统计不把未知值记为 0。

## 明确禁止的捷径

- 通过 DOM 文本或标题相似度识别 thread id。
- 两个窗口各维护 app-server 进程再用轮询“最终同步”。
- 把一次 Turn 结束显示为整个目标完成。
- 直接修改 Codex JSONL/SQLite 来实现重命名、归档或删除。
- 在未知 Codex build 上继续注入 renderer。
- 为了展示完整而伪造 Token、项目、关系或状态。
