# ADR 0002：Host Bridge 租约与原生宿主发布边界

- 状态：Accepted
- 日期：2026-08-22

## 背景

Codex Maps 需要让内嵌页和副屏页共享同一份 Session 快照与同一个 App Server owner。当前 Codex Desktop build 的 preload 确实把 renderer 消息转发到主进程，并存在内部 `connect-app-host` MessagePort；renderer 也在使用统一 request client。但官方插件 manifest 和插件文档只公开 skills、MCP server 与会话内 UI resource，没有公开注册持久左侧导航、原生 route 或额外 BrowserWindow 的合同。

当前 `navigate-to-route` 也是宿主内部消息，未发现“实际打开的 thread id”回执。直接修改签名 MSIX/ASAR、注入 minified renderer 或按 DOM 文本找锚点都无法成为公开仓库的稳定安装方案。

## 决定

1. `SessionMapModule` 继续负责 Session 事实快照；`HostBridgeModule` 负责单一宿主连接、renderer lease、宿主能力门禁和精确 Session 导航。
2. 每个页面只能获得 lease：共享 `SnapshotSource`、发送产品级导航意图、释放自身 lease。页面关闭不得释放共享宿主连接；只有 Bridge owner 可以 `dispose()`。
3. Codex Desktop 按外部、版本绑定依赖处理。正式 adapter 必须先验证 fingerprint 与 capability，再 attach；未知 build 在 attach 前 fail-closed。
4. 导航 adapter 必须返回 `requestedThreadId` 和 `openedThreadId`。二者不一致或宿主无法确认时，`thread.navigate` 不可用；禁止标题搜索、最近会话回退或 DOM 猜测。
5. Desktop adapter 不得启动第二个 App Server，也不得在 attach 失败后静默切换到 stdio。stdio 只用于 standalone/协议诊断。
6. 不修改 Codex 安装目录和签名 ASAR。若没有官方扩展点或受支持的外部 loader，原生左侧入口与共享副屏不得进入公开发布。

## 当前 Go / No-Go

- **GO：** Session 数据模型、App Server client、实时 Store、一级/二级地图 UI、关系可视化和安全管理语义可以继续开发。
- **GO（能力受限）：** 官方 plugin 形态可以承载 skills、MCP 和会话内 UI；它不能被描述成常驻左侧页面。
- **NO-GO（当前 build 的公开发布）：** 原生左侧入口、精确宿主跳转、宿主创建副屏并共享现有 request client，尚无公开挂载合同，也没有完成运行时回执证明。
- **重新开放条件：** OpenAI 提供相应公开 API，或一个不修改安装包、能验证 sender/owner/导航回执并通过升级 smoke 的受支持 loader 出现。

因此产品想法本身可落地，但原始“双原生入口全部进入首版 MVP”的范围当前不可落地。实施改为双轨：先交付可验证的共享核心和受支持界面；原生宿主轨保持独立门禁，证据不足时不阻塞核心开发，也不伪装完成。

## 不变量

- 一个 Bridge lifetime 只 attach 一次底层宿主连接。
- 同一 commit 的 `sourceId/epoch/revision` 在所有 renderer 中一致；跨进程不要求对象引用相同。
- renderer lease 释放不影响其他 renderer 或 Desktop-owned App Server。
- 未知 fingerprint、能力缺失或 owner 无法证明时，在 attach 前失败。
- 精确导航必须有 thread id 回执；无回执即不可用。
- mutation 可能已送达但未确认时返回 unknown，不自动重放。

## 被拒方案

1. **两个窗口各启动一个 App Server：** 实时状态和写所有权不一致。
2. **把 preload MessagePort 伪装成 JSONL：** 会把已初始化 request client、通知分发和 server request 的语义压回错误抽象。
3. **修改 MSIX/ASAR 或 minified renderer：** 安装、更新、安全与公开分发不可接受。
4. **把插件 UI resource 当成侧栏 route：** 官方合同并未提供这种能力。
