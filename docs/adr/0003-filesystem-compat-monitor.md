# ADR 0003：以本机只读 JSONL 兼容模式监控当前 Codex 状态

- 状态：Accepted（experimental compatibility mode）
- 日期：2026-08-22

## 背景

公开的 Codex App Server 没有发现/附着到当前 Desktop owner 的合同；private preload、`codex-ipc`、ASAR/DOM 注入均被 ADR 0002 拒绝。与此同时，本机 `~/.codex/sessions` 保存的 JSONL 在任务生命周期中含有带时间戳的 `session_meta`、`task_started`、`task_complete`、`turn_aborted` 与 `token_count` 事件。

## 决定

新增一个用户本机运行的、只读的 `FilesystemCompatSessionMapModule`：首次索引后每秒扫描 `~/.codex/sessions` 的文件元数据，只重读大小或修改时间变化的 JSONL；忽略未知、损坏和正在追加的截断行，只投影以下字段到现有 `SessionMapModule.observe({ kind: "overview" })` seam：

- session id、cwd、创建/最近活动时间；
- `running`、`completed`、`interrupted` 三类确定执行状态；
- 来源与 stale 状态。

它不提取、保存或投影 message/reasoning/tool 的内容字段，不把 transcript、ID、cwd 或统计上传、记录到公开日志或放入 fixture；不提供 rename/archive/delete/导航；不连接 private IPC；不修改 Codex 安装或用户数据。无法解析或目录不可读时保留最后完整快照并标记 stale。

## 结果与边界

- **GO：** Windows 当前用户的独立 Electron 地图可近实时呈现真实 Desktop 写入的任务开始、完成、中断与新鲜度。
- **非承诺：** 这不是官方插件 API、不是共享 Desktop 内存，也不保证 schema、title、fork、项目、置顶、子 Agent 或完成百分比。Codex 版本升级后可能失效。
- **跨平台：** Node 文件访问路径由 `homedir()` 构造；Windows 已做本机 smoke。macOS/Linux 需要各自真实 Codex session 目录与追加行为的 smoke 后才宣称支持。
- **退出条件：** 一旦官方提供 attach/discovery/event API，优先切回受支持 Host Bridge；兼容模式保留为可选诊断/迁移路径。

## 验证

- 合成 fixture 覆盖 start、complete、abort 与截断 JSONL。
- 临时本地 JSONL 追加覆盖从 `running` 到 `completed` 的 250ms 轮询更新。
- 真实本机 smoke 只断言来源、同步状态、数量与状态分布；不输出 session 标题、ID、cwd 或正文。
