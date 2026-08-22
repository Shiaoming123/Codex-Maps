# Codex-Maps 能力矩阵

> 核对日期：2026-08-22。本文以 OpenAI 官方 Codex 仓库 `main` 分支的 App Server 文档和 v2 协议 Schema 为准。实际安装的 Codex Desktop 可能捆绑较早的 App Server，因此“文档存在”不等于“本机可用”；实验能力和壳层能力都必须在运行时探测。

## 当前 Windows 构建快照

2026-08-22 发现本机存在两个不同的 Codex CLI，必须分开记录：

- **Desktop 实际宿主：** MSIX `OpenAI.Codex_26.818.5229.0_x64` 运行包内 `codex-cli 0.149.0-alpha.4.1`，SHA-256 `73D6D4A082A7CAD601A446A45B1B3FA9B77AFF9D3996052B74D9003D7947D515`。稳定生成 663 个文件，experimental 生成 781 个文件。
- **用户目录 CLI：** `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` 为 `codex-cli 0.130.0-alpha.5`，SHA-256 `DD4ADF302B112FDC30FCE509A5E261A0A6F1118DC58AC2DA636EB84E0A6B3E3E`。它不是当前 Desktop 进程使用的二进制，只能作为旧版本兼容 fixture。

Desktop 稳定合同包含 `thread/delete`、`threadSection/*`、`thread/section/move` 和 `sectionId` 筛选。experimental 合同另加入 `project/*`、`projectId`、`parentThreadId` 和 `ancestorThreadId`。实验 `Thread` 还包含 `projectId`、`parentThreadId`，并与稳定字段 `sessionId`、`forkedFromId`、`agentNickname`、`agentRole` 共同支持关系展示。

两个合同都没有 App Server `isPinned` 字段。Desktop renderer 把 pinned order 保存在宿主侧栏状态中，因此置顶同步属于 Host Bridge 私有能力，不能用 `thread/metadata/update` 假装实现。

因此，本表的“稳定/实验”表示上游官方口径，不代表任意已安装 build 必然具备。产品必须先识别 active Desktop binary，再根据该二进制的生成合同、初始化能力和无副作用运行时探测启用功能。

## 稳定性口径

- **稳定**：官方 App Server 文档已列出，且没有标注为 experimental 的公开 JSON-RPC 能力。
- **实验**：官方标注为 experimental，或本项目决定在不同 Codex 版本上先做能力探测、再开放的能力。
- **壳层私有**：Codex Desktop 自身可以做到，但没有公开 App Server 合同；不能假定 Windows、macOS、Linux 或不同 Desktop 版本实现一致。

## Codex Maps 当前本机兼容源

下面是当前默认 `filesystem-compat` 源的实际能力，不是上游 App Server 合同的承诺：

| 能力 | 当前状态 | UI 行为 |
| --- | --- | --- |
| 读取 Session 元数据 | 可用 | 展示 session id、cwd、标题索引、创建/最近活动时间 |
| 运行状态 | 可用 | 展示 running、completed、interrupted；未知事件保持 unknown |
| Token / 上下文 | 可用但字段可缺失 | 展示已验证数值；缺失显示“未提供”，不转成 0 |
| 结构化计划 / goal | 不可用 | 不显示完成百分比，不把一次 turn 完成当作目标完成 |
| 项目、Section、置顶 | 不可用 | 只按 cwd 本地分组，并显示兼容模式边界 |
| rename、archive、unarchive、delete | 不可用 | 不显示写操作入口，不修改 JSONL/SQLite |
| 在 Codex Desktop 中打开 | 不可用 | 只保留 Maps 自己的详情，不猜测宿主导航 |
| Fork / 子 Agent 关系 | 当前源不提供 | 没有来源字段时不绘制关系边 |

只有在 `AppServerAdapter` 或经过验证的 `HostBridgeAdapter` 提供 capability、权威回执和重读确认后，表中的“不可用”能力才可以进入 UI；文件兼容源永远不承担这些写操作。

## 能力矩阵

| 用户诉求 | 官方方法 / 事件 | 稳定性 | MVP 决策 | 降级方案 |
| --- | --- | --- | --- | --- |
| 查看、分页、搜索和筛选 Session | `thread/list`；支持游标分页，以及 `archived`、`cwd`、`searchTerm`、`sectionId` 等筛选。`projectId`、`parentThreadId`、`ancestorThreadId` 属于扩展筛选。 | **稳定**（基础列表）／**实验**（项目和关系筛选） | **MVP 必做。** 首屏以 `thread/list` 为权威快照，分页加载；基础搜索、归档筛选和工作目录筛选直接启用，实验筛选通过能力探测后启用。 | 实验筛选不可用时，先拉取基础列表，在 Codex-Maps 本地做分组；界面明确标注“本地分组”，不伪装成 Codex 原生项目归属。 |
| 查看 Session 摘要和详情 | `thread/read`；`includeTurns` 可读取历史 Turn。分页历史可进一步使用实验性的 `thread/turns/list`、`thread/items/list`。 | **稳定**（`thread/read`）／**实验**（分页历史） | **MVP 必做。** 一级页只读列表摘要；二级页按需调用 `thread/read`，避免首屏加载完整上下文。 | 分页历史不可用时使用 `thread/read(includeTurns: true)`；若历史过大或读取受限，只显示元数据、最近摘要和明确的“历史未加载”状态。 |
| 重命名 Session | `thread/name/set`；成功后产生 `thread/name/updated`。名称无需唯一。 | **稳定** | **MVP 必做。** 乐观更新前保留旧值，收到成功响应或通知后提交；失败则回滚并显示原因。 | 禁用编辑并保留复制 Session ID 的能力；绝不只改 Codex-Maps 本地标题而冒充 Codex 标题。 |
| 归档 Session | `thread/archive`；产生 `thread/archived`。官方说明会尝试一并移动 spawned descendants 的 rollout。 | **稳定** | **MVP 必做。** 操作前显示后代影响提示；成功后从当前列表移除并允许切换到归档视图。 | 线程被其他进程占用或请求失败时保留原状态，提示用户回到 Codex 完成归档；不直接移动 rollout 文件。 |
| 取消归档 | `thread/unarchive`；返回恢复后的 thread，并产生 `thread/unarchived`。 | **稳定** | **MVP 必做。** 在归档视图提供恢复动作，并用返回的 thread 刷新缓存。 | 失败时保持归档状态并提供重试；不手工改 SQLite 或移动文件。 |
| 删除 Session | `thread/delete`；产生 `thread/deleted`。**该操作会硬删除目标 thread 及其所有 spawned descendant threads。** | **稳定** | **MVP 必做，但设为高风险动作。** 删除前先枚举可见后代、展示数量和不可恢复说明，要求二次确认；逐个消费 `thread/deleted` 以清理视图。 | 无法可靠枚举后代时，确认框明确写“官方删除仍会级联删除后代”；能力或占用状态不确定时禁用按钮，引导用户在 Codex 原界面操作。 |
| 置顶／取消置顶 | 当前 Desktop 的 App Server 合同没有 `isPinned`；renderer 维护宿主侧的 pinned order，Section API 另有内建 pinned 分区。 | **壳层私有**（侧栏置顶）／**实验**（section 管理） | **MVP 目标是同步 Codex 侧栏置顶。** 只有 Host Bridge 能读写同一 pinned order 且重新读取确认后才开放。 | Host Bridge 不可用时，可提供 Codex Maps 自己的“收藏”，并醒目标注“仅在 Codex Maps 中收藏”；不能声称已与 Codex 侧边栏同步。 |
| 实时显示运行、空闲和错误状态 | `thread/status/changed`；thread 状态为 `notLoaded`、`idle`、`active` 或 `systemError`。`turn/started` 与 `turn/completed` 描述单次 Turn 生命周期。 | **稳定** | **MVP 必做。** 建立“执行状态”轴：运行中、空闲、错误、未知。`notLoaded` 只能解释为当前 App Server 未加载，不能解释为已完成。断线重连后先拉权威快照，再消费增量事件。 | 没有共享实时连接时显示“状态未知／上次更新时间”，只轮询持久化快照；禁止把未加载或长时间无事件渲染成“已完成”。 |
| 显示任务计划和步骤进度 | `turn/plan/updated`；每个步骤为 `pending`、`inProgress` 或 `completed`。 | **稳定** | **MVP 必做二级页展示。** 以最近一次 plan 快照渲染步骤，不从聊天文本猜测进度。 | 没有 plan 事件时显示“该 Session 未提供结构化计划”，仅展示最近输出摘要。 |
| 显示 Token 和上下文占用 | `thread/tokenUsage/updated`；v2 Schema 包含累计／最近 Token 使用分解及 `modelContextWindow`。 | **稳定** | **MVP 做只读指标。** 显示输入、缓存输入、输出、推理、总量和上下文窗口；同时保存事件时间，避免把旧快照当实时值。 | 未收到事件或模型未提供窗口时显示“暂无数据”，不自行估算成本或上下文百分比。 |
| 区分“一轮结束”和“整个目标完成” | `turn/completed` 只终结当前 Turn；目标使用 `thread/goal/set`、`thread/goal/get`、`thread/goal/clear`，以及 `thread/goal/updated`、`thread/goal/cleared`。 | **稳定** | **MVP 采用双状态轴。** `turn/completed` 只把执行状态从运行中切到空闲／失败；**它不等于目标完成**。只有 goal 明确进入完成状态，或用户在 Codex-Maps 中显式标记完成，才显示整项任务的完成勾。 | 没有 goal 时保持“未声明目标状态”，可提供仅存于 Codex-Maps 的人工完成标记；该标记必须与 Codex 原生 goal 分开展示。 |
| 从某个 Session 创建分支 | `thread/fork`；返回的新 thread 可带 `forkedFromId` 指向来源，且产生 `thread/started`。 | **稳定**（基本 fork）／**实验**（部分边界和分页选项） | MVP 先**只读呈现已知 fork 来源**，创建分支复用官方 `thread/fork`，但不在首版做复杂图编辑。 | 无法获得来源字段时把新 Session 作为未关联节点展示；不通过标题或时间相近度猜测父子关系。 |
| 查看 parent、ancestor 和 subAgent | `thread/list(parentThreadId=…)` 获取直接 spawned children，`thread/list(ancestorThreadId=…)` 获取全部 spawned descendants；结果保留直接 `parentThreadId`。`thread/list`／`thread/read` 还可返回 `agentNickname`、`agentRole`。Review 和 Guardian 不属于该 spawn-edge 查询。 | **实验** | MVP 二级页显示**已知子 Agent 数量、昵称、角色和父链**；完整关系地图列为 MVP 后增强，因为官方关系集合本身可能不完整。 | 探测失败时只展示当前 thread 已携带的 `parentThreadId`／Agent 字段；未知关系标为未知，不补造边。 |
| 查看和管理项目、多根目录、项目排序 | `project/list`、`project/read`、`project/create`、`project/import`、`project/update`、`project/move`、`project/delete`；`project/changed`、`thread/project/updated` 用于增量同步。项目支持有序绝对 roots 和 metadata；`project/delete` 只清除归属，不删除 thread、目录或文件。 | **实验** | **必须先做能力探测。** MVP 在可用时先开放只读项目分组、roots 和外观信息；创建、改根目录、移动、删除放在功能开关后，完成跨版本验证才开放。 | 不可用时按 `cwd` 做本地项目视图，并明确它不是 Codex Project；绝不直接编辑 Codex SQLite。 |
| 管理置顶区、自定义分类、图标和颜色 | `threadSection/list/create/update/delete`、`thread/section/move`；section 可带 `appearance.icon` 和 `appearance.color`，内建 pinned section 不可更新或删除。 | **实验**（本项目按跨版本非承诺能力处理） | **必须先做能力探测。** MVP 可读则同步显示分类、图标、颜色和顺序；写操作逐项探测，并验证通知／重新拉取后的结果一致。 | 退化为 Codex-Maps 本地标签、颜色和排序；本地字段使用独立命名空间，不覆盖官方 metadata。 |
| 从地图打开某个具体 Session | App Server 的 `thread/read`／`thread/resume` 操作数据与运行时，**不等于让 Codex Desktop 导航到该页面**。公开 App Server 没有“打开 Desktop 中指定 Session”的 UI 方法。 | **壳层私有** | MVP 定义 `HostNavigation` 适配器：嵌入模式先探测 Codex 壳层的导航能力，成功才显示“在 Codex 中打开”；独立页调用同一适配器，不能自行假设 deep link。 | 打开 Codex-Maps 自己的 Session 详情页，并提供复制 Session ID；没有经验证的宿主导航时隐藏原生打开按钮。 |
| 在 Codex 左侧增加入口并显示内嵌页 | App Server 提供会话协议，但官方文档没有 Desktop 侧边栏／路由注入 API；普通 Agent Plugin 也不能据此获得原生页面挂载点。当前插件 manifest 实测也没有 route/window 字段。 | **壳层私有** | **当前 Native Gate 为 NO-GO。** 内部 preload Bridge 不能当成第三方安装合同；等待公开 API 或受支持 loader 后重新验收。 | 发布独立模式或会话内插件 UI，并明确“未嵌入当前 Codex 壳层”；不修改 MSIX/ASAR。 |
| 单独窗口／副屏页面 | 独立客户端可以通过官方 App Server JSON-RPC 构建；但实时状态是 App Server 进程内状态，分页 thread 同一时间只能由一个 App Server 进程持有写权限。 | **稳定**（独立协议客户端）／**壳层私有**（复用 Desktop 的同一实时源） | MVP 要让内嵌页和独立页共享同一个 Session Store 与事件源。优先由 Codex 宿主桥接出第二窗口；不能让两个页面各自启动 App Server 并同时声称掌握实时状态。 | 只能启动独立 App Server 时，独立页默认只读，并把 Desktop 中正在运行但不可观测的 Session 标为“状态未知”；写操作需检测占用并失败即停。 |
| Windows、macOS、Linux 兼容 | App Server 使用双向 JSON-RPC，默认走 stdio；协议层可跨平台，但可执行文件发现、原生路径、进程生命周期和 Desktop 壳层实现属于宿主差异。 | **稳定**（协议层）／**壳层私有**（内嵌层） | 核心 Store、协议模型和 UI 保持跨平台；将 `AppServerTransport`、`PathAdapter`、`HostNavigation`、`EmbeddedMount` 分层。MVP 先验证当前 Windows 环境，随后用同一合同验证 macOS；没有对应 Desktop 壳层证据的平台只承诺独立页。 | 某系统找不到兼容 App Server 时进入离线说明页；壳层适配失效时自动切换独立页，不修改官方安装目录，也不假装兼容。 |

## MVP 状态判定合同

Codex-Maps 必须同时维护两个彼此独立的状态轴：

1. **执行状态**：由 `thread/status/changed`、`turn/started`、`turn/completed` 驱动，回答“现在是否正在运行”。
2. **目标状态**：由 `thread/goal/*` 或用户显式的本地标记驱动，回答“整项任务是否完成”。

因此：

- `turn/completed(status=completed)` 只表示这一轮结束，界面应从 loading 回到 idle；
- goal 明确完成时，才显示整个 Session 的完成勾；
- `notLoaded` 表示该 App Server 当前未加载 thread，不代表空闲，也不代表完成；
- 断线、重启或切换宿主后，先重新读取快照，再接收事件，不能只依赖内存中的最后一个通知。

## 能力探测最低要求

初始化连接后，Codex-Maps 应记录 App Server 版本／协议结果，并按以下顺序探测：

1. 先识别 Desktop 当前 App Server 的真实 executable path、version 和 hash；不得用 PATH 或用户目录中的另一个 `codex.exe` 替代。
2. 再验证当前生成合同中的稳定基线：`thread/list`、`thread/read`、`thread/name/set`、归档／恢复、删除和核心事件订阅；高风险 mutation 仍需 fixture 与一次性测试数据验证。
3. 再以实验能力初始化，分别探测关系筛选、`project/*`、`threadSection/*` 和 `thread/section/move`；任何一个方法不可用都只关闭对应功能，不拖垮基础 Session 列表。
4. 最后由各系统的宿主适配器探测侧栏置顶、打开具体 Session、内嵌入口和共享实时事件源。
5. 对项目和分类写操作执行“调用后重新读取”校验；只有服务端返回状态与预期一致，UI 才确认成功。

## 跨系统结论

不同系统必须从第一天就纳入架构，但不需要在 MVP 同时完成所有壳层适配。合理边界是：

- **跨平台核心现在就做**：JSON-RPC 客户端、状态归一化、缓存、关系模型和共享 UI 不包含 Windows 专用路径或进程假设。
- **宿主集成逐个平台验证**：内嵌页、原生导航、复用 Desktop 实时连接都属于易随 Codex 版本变化的壳层私有能力。
- **MVP 验收以 Windows 独立模式为首个平台**：先验证共享核心、App Server owner、地图 UI 和安全降级；Native Gate 通过后再追加“内嵌页 + 副屏 + 同一事件源”。其他平台在没有官方 Desktop 壳层证据前，只承诺独立 App Server 客户端。

## 官方依据

- [Codex App Server README：初始化、thread 生命周期、项目、分类、目标、关系与事件](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex App Server v2：Thread Token Usage Updated Schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json)
- [Codex App Server v2 协议 Schema 目录](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol/schema/json/v2)
