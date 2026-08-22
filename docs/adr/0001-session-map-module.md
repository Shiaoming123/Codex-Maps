# ADR 0001：以 SessionMapModule 作为 renderer 的唯一事实接口

- 状态：Accepted
- 日期：2026-08-22

## 背景

内嵌页与副屏页必须共享一个 App Server 连接、一份规范化状态和同一提交序列。JSON-RPC、分页、通知、重连和 capability 差异不能扩散到 React 页面或 Electron renderer。

## 备选设计

1. `observe(): AsyncIterable<StateFrame>` 加单一 mutation 入口：接口最小，但 renderer 需要维护 iterable 生命周期并自行适配 React snapshot 语义。
2. Runtime、Renderer Lease、分页 feed 和 prepared command：扩展性最强，但对当前只读切片过宽，容易提前实现尚未验证的写操作和 IPC 机制。
3. `observe(query) -> SnapshotSource` 加产品意图入口：调用者直接消费稳定、不可变的完整快照，同时保留按 overview/detail 延迟加载的空间。

## 决定

采用方案 3 作为外部 interface。第一个只读切片只实现：

```ts
interface SessionMapModule {
  observe(query: SessionQuery): SnapshotSource<SessionMapSnapshot>;
  dispose(): Promise<void>;
}
```

写操作在能力与唯一写队列门禁通过后，以单一 `change(intent)` 判别联合加入；不预先暴露五组浅方法。

内部使用 `AppServerAdapter` seam，当前存在两个 adapter：测试用 Memory adapter 和真实 stdio adapter。握手、请求 ID、上游 cursor、去重、状态归一化与断线策略均留在 module implementation 中。

## 不变量

- renderer 不接触 JSON-RPC、stdio、上游 cursor 或原始通知。
- `sourceId` 标识权威来源；`epoch` 标识该来源的连接代次；`revision` 只表示 Host Bridge 成功提交读模型的顺序，不冒充 App Server 事件游标。
- 分页全部成功并去重前，不发布半份新快照。
- 同一 revision 对所有 renderer 表示同一份不可变数据；不同窗口只要求按同一提交序列收敛，不要求物理同时渲染。
- `turn/completed` 只改变执行状态，不改变目标状态。
- 未来 mutation 只有在权威状态确认后返回 `confirmed`；断线或超时导致结果不确定时返回 `unknown`，绝不自动重放。
- UI 只消费产品级 availability，不根据版本号或 JSON-RPC 方法名自行启用按钮。

## 结果

该 interface 为 React `useSyncExternalStore`、Electron preload mirror 和纯内存契约测试提供同一个稳定 seam。代价是 MVP 初期发布完整快照会增加少量 IPC 数据量；若真实性能证据表明不可接受，再在 preload adapter 内增加增量传输，不改变 renderer 的 snapshot interface。
