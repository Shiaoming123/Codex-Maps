# 架构说明

## 官方依据

- [Codex App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex App Server thread list schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadListParams.json)
- [Unlocking the Codex harness: how we built the App Server](https://openai.com/index/unlocking-the-codex-harness/)

## 1. 事实来源

`codex app-server` 是唯一的 Session 权威来源。它通过 stdio 传输 newline-delimited JSON-RPC；连接必须先发送一次 `initialize`，再发送 `initialized`，之后才能调用其他方法。

首版只实现只读 `thread/list`。客户端不扫描 Codex 的 rollout 文件、不解析内部 SQLite，也不以 DOM 结构作为数据 API。

## 2. 分层

```text
┌─────────────────────────────────────────┐
│ UI: independent dashboard                │
│ search / filters / projects / preview    │
└──────────────────────┬──────────────────┘
                       │ typed view model
┌──────────────────────▼──────────────────┐
│ Organizer service                         │
│ pagination / capability probe / caching  │
└──────────────────────┬──────────────────┘
                       │ JSON-RPC over stdio
┌──────────────────────▼──────────────────┐
│ codex app-server                          │
│ thread / project / section / events      │
└─────────────────────────────────────────┘
```

未来的 Windows 适配层只负责启动、版本识别和 UI 壳层注入，不重新实现 Session 数据访问。

## 3. 权威字段与本地字段

| 数据 | 来源 | 处理原则 |
|---|---|---|
| thread id、标题预览、状态、时间、cwd、归档状态 | app-server | 只读同步，按分页加载 |
| project / section 归属 | app-server 实验 API | 能力探测后使用，失败时降级 |
| 颜色、别名、保存的筛选器、布局 | 本地偏好 | 与 thread id 关联，不能覆盖权威字段 |
| 对话正文 | app-server `thread/read` 或分页 API | 按需加载，不做默认索引，不上传 |
| 侧栏注入状态 | 本地版本记录 | 绑定 Codex build/version，失配则停止注入 |

## 4. 兼容策略

- 协议版本：默认使用稳定 API；实验 API 通过 `initialize.capabilities.experimentalApi` 明确协商。
- 能力探测：启动后记录 app-server 响应和支持的方法，不根据版本号猜测。
- 分页：所有列表都保留 `nextCursor`，不能只取首屏。
- 事件恢复：断线后重新初始化并以 `thread/list` 重新拉取权威快照，不能只依赖缓存事件。
- 错误：对 `-32001` 等可重试错误使用有限次数的指数退避；其他错误展示原始方法和错误码。
- 写操作：每个 mutation 都先生成计划，再经用户确认；不提供默认删除动作。

## 5. Windows 私有壳层

这不是普通 plugin manifest 能保证的能力，而是个人使用的本地适配层：

1. 识别当前 Codex Desktop 安装与版本。
2. 复制到独立目录，使用独立 Electron 用户数据目录。
3. 在副本中加载管理器 UI 或注入 renderer。
4. 运行 smoke test：启动、列表、搜索、点击回到 Session、关闭。
5. 失败时不触碰官方安装，回退到独立管理器。

任何 ASAR/renderer patch 都必须绑定具体版本、保存原始 hash、提供撤销方式，并在 README 中标记为实验性个人功能。
