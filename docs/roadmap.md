# 路线图

## Phase 0 — Foundation（当前）

- 独立仓库与插件清单。
- `codex app-server` 只读连接。
- `thread/list` 首页检索 CLI。
- 产品边界、架构、问题清单和公开发布门。

退出条件：协议测试通过；本机有 Codex 时能真实列出 Session；没有 Codex 时错误明确；公开仓库不含私密数据。

## Phase 1 — Searchable Organizer

- 完整 cursor 分页和缓存失效。
- `thread/read` 按需详情。
- cwd、状态、归档、最近使用、多条件筛选。
- 稳定/实验能力探测。

退出条件：至少数百个 Session 的列表仍可操作；断线重连后视图与权威快照一致。

## Phase 2 — Visual UI

- 独立本地 Web/Electron 界面。
- 项目树、section、颜色、别名、最近使用。
- 键盘导航和详情预览。
- 本地偏好存储与公开仓库隔离。

退出条件：核心检索流程无需打开原生列表；UI 测试覆盖 away-and-back、归档/恢复和空状态。

## Phase 3 — Safe Mutations

- 预览式重命名、移动、归档。
- 可重试队列与逐项结果。
- 失败恢复和审计日志（只记录操作元数据，不记录正文）。

退出条件：任何批量操作都能解释“将改变什么”，且不会误删 Session。

## Phase 4 — Windows Private Shell

- 独立 Codex 副本。
- 版本识别与 hash 门禁。
- renderer/壳层适配。
- 自动回退和升级后恢复。

退出条件：官方版不受影响；至少一个明确支持的 Codex build 完成端到端验证。

## 发布原则

每个阶段都先发布可用的独立管理器，不把侧栏注入当作整个项目的单点成功条件。若 Codex 内部 UI 变化导致注入不可维护，独立 UI 仍是完整产品，而不是失败的临时方案。
