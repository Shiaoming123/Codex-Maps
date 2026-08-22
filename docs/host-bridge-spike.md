# Host Bridge Spike：2026-08-22 Windows 基线

## 结论

当前 Desktop 架构证明了内部共享源确实存在，但没有证明第三方可以通过受支持接口接入。当前公开发布结论是：**核心产品 GO，原生宿主接入 NO-GO / 等待新证据**。已证明 Codex Desktop 只有一个自身拥有的 App Server，renderer 通过受控 preload 消息桥使用现有 request client；但官方插件 manifest 没有持久左侧 route 或 BrowserWindow 注册字段，第三方页面也无法自行获得 Codex preload。因此不能把内部 seam 描述成可安装插件能力。

## 只读观察环境

- MSIX package identity：`OpenAI.Codex_26.818.5229.0_x64`。
- 外层包版本：`26.818.5229.0`；ASAR 内 `package.json` 版本：`26.818.41509`。两者冲突，后续探针必须分别记录，不能择一覆盖。
- Electron：`42.3.0`。
- `app.asar` SHA-256：`C5D839BC9B122B7EF2A2F0F45186B3E5895923DE5B6CEF5253C936FE670C0479`。
- Desktop App Server：`codex-cli 0.149.0-alpha.4.1`，SHA-256 `73D6D4A082A7CAD601A446A45B1B3FA9B77AFF9D3996052B74D9003D7947D515`。
- 观察时进程树只有一个 `app-server`，由主 `ChatGPT.exe` 直接拥有，命令含 `features.code_mode_host=true`。

WindowsApps ACL 禁止从普通 shell 直接执行包内 `codex.exe`。本轮只读复制该二进制到临时探针目录后生成 schema；复制前后 SHA-256 一致。未修改安装目录。

## 已观察到的宿主 seam

preload 通过 `contextBridge` 暴露 `window.electronBridge`，其中至少包含：

- `sendMessageFromView` / `codex_desktop:message-from-view`；
- `codex_desktop:message-for-view` 的订阅入口；
- shared-object snapshot；
- worker message bridge；
- `connect-app-host` 的 MessagePort 转发。

本轮进一步确认：renderer 自行创建 `MessageChannel` 并发送 `connect-app-host`，preload 才把 port 转发到私有 IPC channel `codex_desktop:connect-app-host`。这条能力依赖 Codex 自己的 preload；普通插件 UI 或外部窗口没有该 preload。插件 manifest 实测只声明 skills、MCP server 和 interface 元数据，没有 route/window 字段。

renderer bundle 内部已有统一 request client，并通过它调用 `thread/list`、`thread/read`、`thread/name/set`、`thread/archive` 和 `thread/unarchive`；通知表包含 thread、turn、goal、token 等事件。这说明“复用宿主已有连接”在结构上有真实落点，但这些是版本绑定的内部 seam，不是公开插件 API。

## Active Desktop 合同

稳定 schema 生成 663 个文件，experimental 生成 781 个文件。精确解析 `ClientRequest` 和字段文件后，当前目标合同包括：

- 稳定：`thread/delete`、`threadSection/list/create/update/delete`、`thread/section/move` 和 `thread/list.sectionId`；
- experimental：`project/list/read/create/import/update/move/delete`，以及 `thread/list` 的 `projectId`、`parentThreadId`、`ancestorThreadId`；
- 实验 `Thread.projectId`、`parentThreadId`，以及 `Thread.section`、`forkedFromId`、Agent nickname/role。

`thread/metadata/update` 只有 `projectId` 和 `gitInfo`，没有 `isPinned`。renderer 中存在 host-local pinned order，因此置顶属于宿主状态集成，而不是 App Server mutation。

## 尚未证明

- 现有 bridge 是否允许一个受限 Codex Maps route 获取同一 request client，而无需修改 minified bundle。
- `navigate-to-route` 对精确 thread id 的正式消息合同。
- 新 BrowserWindow 是否能被主进程注册到同一消息路由、同一 Store 和同一 source owner。
- Desktop 更新后是否存在稳定、唯一且可回退的挂载锚点。
- delete、project 和 Section 写操作的实际通知、占用与失败语义。

## 下一实验

1. 在 **复制的测试 fixture** 中建立 `HostCapabilities` 读取探针，不改 WindowsApps 安装目录。
2. 识别 renderer request client 的消息 envelope，只允许 `thread/list` 和通知订阅，验证两个 probe consumer 得到相同 host instance id。
3. 在主进程测试 harness 中创建第二 BrowserWindow，复用同一 bridge；进程计数必须始终保持一个 App Server owner。
4. 证明精确 thread navigation 后，再讨论左侧入口的唯一注入锚点。

任一步需要新 App Server、DOM 标题匹配或直接写 ASAR 才能成立，即判定该路径失败并停止注入方案。

## 本轮退出判定

- Host Bridge 的内存合同已经证明：单 attach、双 lease、同一 snapshot、单 lease 关闭不影响另一方、未知 fingerprint 在 attach 前拒绝。
- 当前 `navigate-to-route` 是内部 fire-and-forget 消息；尚无实际打开 thread id 的回执，因此 `thread.navigate` 必须保持不可用。
- 当前插件系统没有公开 native route/window mount；不修改签名安装包的第三方接入路径没有找到。

因此 CM-001 的**内存架构部分通过**，Desktop production adapter 部分在当前 build 上停止。若未来出现公开接口或受支持 loader，从本文件的 fingerprint、owner、双 lease 和 exact-navigation 门禁继续，不重做已验证的核心模块。

## 2026-08-22 复验：多 App Server 环境与当前安装包

- 同时存在三个 `codex app-server` 进程时，探针已改为只选择直接由 `ChatGPT.exe`（`OpenAI.Codex_*` 包路径）拥有的唯一 Desktop owner；独立 Reader 与开发工具子进程不会再让 Desktop probe 误报失败。
- 当前 owner 为 `codex-cli 0.149.0-alpha.4.1`，稳定合同仍包含 `thread/list`、`thread/read`、`thread/delete` 与 `threadSection/*`，experimental 合同仍包含 project 与 parent/ancestor 筛选。协议能力没有改变“谁拥有正在运行的连接”这一事实。
- 只读 ASAR 探针再次确认 `connect-app-host` 由 Desktop 的 preload 使用 `ipcRenderer.postMessage("codex_desktop:connect-app-host", ...)` 转发；renderer 内部创建的 `MessageChannel` 依赖该 preload。没有发现可供第三方进程使用的 socket、端口、外部 host identifier 或 route/window 注册合同。

结论不变：当前 build 的 Host Bridge 只能作为 Codex 自身私有实现证据，不能成为 Codex Maps 的 production adapter。继续通过注入、ASAR 修改、DOM 获取或第二 App Server 伪造共享源均违反本项目的退出判定。
