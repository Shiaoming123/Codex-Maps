# Codex Maps 架构与兼容性

## 1. 架构结论

Codex Maps 的目标架构仍是“共享核心 + 两个宿主”，而不是两个独立应用：

```text
                         ┌─ Codex 内嵌页（同壳路由）
Codex app-server         │
      │                  │
      ▼                  │
Host Bridge ──► Session Store ──► Shared React UI
      │                  │
      │                  └─ 独立副屏 BrowserWindow
      ▼
本地偏好 / 能力与版本记录
```

Host Bridge 是唯一的 App Server 连接与写操作出口；两个 renderer 只通过受控 IPC 读取同一个 Store 和发起命令。禁止内嵌页与独立页各自启动 app-server。

当前发布边界：共享核心和独立模式可以实施；Codex Desktop 原生 route/window 没有公开挂载合同，因此图中的内嵌分支处于 fail-closed。独立模式只对自己拥有的 App Server 声称实时与可写；不能借用 Desktop owner 时，不启动第二进程冒充同源。

## 2. 产品不是单一 manifest

[官方插件架构](https://developers.openai.com/plugins/concepts/plugins)定义了 skills、MCP server 和可选 UI resource；这些能力不能被直接当作“原生左侧路由 API”的证明。完整产品包含：

- Codex plugin package：manifest、skills、未来的用户命令。
- App Server client：JSON-RPC、分页、事件和 mutation。
- Session Store：规范化实体、索引、双轴状态和重连校正。
- Shared UI：一级地图、二级详情、副屏看板和确认弹窗。
- Codex host adapter：左侧入口、路由、打开具体 Session、同进程独立窗口。
- Platform adapter：安装发现、路径、窗口、更新、打包和日志目录。

内嵌宿主适配属于本地桌面扩展能力，必须标记为实验性并绑定已验证 build。

## 3. App Server 边界

[Codex App Server](https://developers.openai.com/codex/app-server) 是唯一的 Session 权威来源。默认 stdio 是 MVP 传输方式；官方 WebSocket transport 当前标记为实验且不支持生产，因此不作为首发依赖。

连接生命周期：

1. Host Bridge 启动或接管唯一连接。
2. 发送 `initialize`，声明真实客户端名称和需要的实验能力。
3. 发送 `initialized`。
4. 拉取 `thread/list` 分页快照与必要详情。
5. 持续处理 `thread/*`、`turn/*`、`item/*`、审批/输入和 Token 事件。
6. 断线后停止 mutation，重新握手，拉取权威快照，再恢复命令入口。

禁止用直接读写 rollout JSONL/SQLite 作为正常降级。只读诊断工具也必须显式说明它读取的是 App Server，而不是私有存储。

## 4. Session Store

建议的核心实体：

```text
Session
  id, name, preview, cwd, projectId, sectionId, isPinned, archived
  sourceKind, parentThreadId, forkedFromId, createdAt, updatedAt
  executionState, goalState, activeFlags, lastError
  currentTurn, plan, lastAgentExcerpt, tokenUsage, contextWindow
  childCount, descendantCount, capabilities, freshness
```

Store 维护以下索引：project、status、pinned、archived、updatedAt、parent/ancestor。完整 transcript 只在二级页按需读取，不默认常驻，也不写入公开日志。

### 双轴状态归一化

执行状态优先级示例：

1. 系统错误或 Turn failed → `failed`。
2. `activeFlags` 含等待审批/输入 → `waiting`。
3. thread status 为 active 或 Turn inProgress → `running`。
4. thread status 为 idle → `idle`。
5. notLoaded 或信息不足 → `unknown/notLoaded`。

目标状态独立来自 goal 生命周期或明确的用户标记。`turn/completed` 不能写入 `goalState=complete`。

### 快照与事件校正

- 初始快照带 `snapshotRevision`。
- 每条事件按 thread/turn/item id 去重并更新 `lastEventAt`。
- 事件只负责低延迟；分页快照负责最终一致性。
- 进程恢复、窗口唤醒、网络/管道重连后重新对账。
- 数据来源和 freshness 对 UI 可见；未知字段保持 null。

## 5. 单写者与双窗口技术门禁

App Server 对 thread history 存在单写者约束，第二个进程即使能读取历史，也可能无法对另一个进程拥有的 thread 执行 archive/delete 等操作。MVP 的第一个技术 Spike 必须证明：

1. Codex host adapter 能访问或转发当前 Codex 使用的权威事件源。
2. 内嵌 renderer 与副屏 BrowserWindow 能订阅同一 Host Bridge。
3. 任意 mutation 只经过一个串行命令队列。
4. 关闭任一窗口不会关闭仍被另一窗口使用的连接。

如果不能证明，内嵌功能必须 fail-closed，不能发布“看起来实时”的双数据源版本。

## 6. 目标代码结构

从当前 Python 诊断片演进到 TypeScript monorepo 时，保持最小分层：

```text
apps/desktop/                  # Host Bridge 与独立窗口
packages/app-server-client/    # typed JSON-RPC、能力探测
packages/session-store/        # 归一化、事件 reducer、selectors
packages/ui/                   # 两种宿主共享 React UI
packages/codex-host/           # Codex 路由/窗口/跳转 adapter
packages/platform/             # Windows/macOS/Linux/WSL
tests/fixtures/                # 去敏协议 fixtures
```

建议使用 TypeScript、React、Electron 与 npm workspaces。避免首版引入云后端、数据库服务或多进程消息系统；本地偏好可先使用原子 JSON/轻量 key-value，并通过版本化 schema 管理。

## 7. 跨平台兼容策略

截至 2026-08-22，官方桌面体验覆盖 macOS、Windows，并提供 Linux preview；Linux 对 Wayland 的窗口定位、浮窗、焦点和快捷键仍存在限制。兼容性必须按“协议、宿主、平台、架构、Codex build”五个维度测试。

| 目标 | MVP 策略 | 主要差异 | 退出门禁 |
|---|---|---|---|
| Windows 11 x64 | 首发独立模式；原生宿主另设门禁 | MSIX/WindowsApps 只读、PowerShell、盘符/反斜杠、窗口生命周期 | 独立模式全链路；Native Gate 单独验收 |
| Windows + WSL2 | 独立环境验证 | `C:\`、`/mnt/c`、`\\wsl.localhost` 映射，runner 与 cwd 归属 | 项目筛选和打开 Session 不串路径 |
| macOS Apple Silicon | 第二验证平台 | `.app` bundle、codesign/notarization、Command 快捷键、arm64 | 共享核心测试全过，host adapter smoke 过 |
| Linux x64/ARM64 preview | 第三适配 | deb/rpm、Wayland/XWayland、窗口定位和通知限制 | 不依赖固定窗口坐标；受限能力明确降级 |

实现约束：

- 领域层只接受规范化 URI/PathValue，不拼接平台路径。
- 使用 Node `path.win32`/`path.posix` 或明确的 path adapter，不用字符串替换猜路径。
- 包产物按 `win32-x64`、`darwin-arm64`、`linux-x64/arm64` 分开构建。
- 尽量避免原生 Node 依赖；不可避免时按 Electron ABI 和 CPU 架构构建。
- 快捷键、托盘、通知、多屏坐标和自动启动均由 platform adapter 提供。

官方平台依据：[桌面应用概览](https://developers.openai.com/codex/app)、[Windows 桌面应用](https://learn.chatgpt.com/docs/windows/windows-app)、[Linux 桌面预览](https://learn.chatgpt.com/docs/linux/linux-app)。

## 8. Codex 版本兼容

操作系统兼容不等于 Codex build 兼容。宿主层必须：

- 记录平台、CPU、Codex app version、app-server version 与 host bundle hash。
- 以能力握手决定 API，不根据版本号猜方法。
- 以 allowlist 决定是否加载 renderer/路由适配；未知 hash 默认拒绝。
- 不修改系统安装目录；在用户可控目录构建适配副本或加载受控扩展。
- 每次 Codex 更新后先跑启动、地图入口、实时状态、跳转和关闭恢复 smoke test。

## 9. 安全与隐私

- mutation 命令队列串行化并带 request id，重连时不自动重放不确定结果。
- archive/unarchive/rename/pin 显示目标；delete 显示所有 spawned descendants，并要求输入名称确认。
- 公开日志只记录方法、匿名 id、耗时、错误码和版本，不记录正文、命令输出或凭据。
- renderer 不直接拥有 app-server stdin、文件系统写权限或任意 shell 权限。
- 任何 host patch 失败都停止注入，不降级为 DOM 猜测或私有数据库写入。

## 10. 测试金字塔

- 协议单测：JSON-RPC、分页、错误、能力探测、去敏 fixtures。
- Reducer 单测：乱序/重复事件、重连快照、双轴状态、级联删除通知。
- UI 组件测试：空/加载/等待/失败/未知、确认弹窗、键盘导航。
- Host 集成：同一 Store 驱动两个窗口、打开 Session、窗口关闭重开。
- 平台 smoke：Windows/WSL/macOS/Linux 的路径、窗口、通知和升级门禁。
- 端到端：真实创建 → 运行 → 等待 → Turn 结束 → 目标完成 → 归档/恢复。
