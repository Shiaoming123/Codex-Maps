# Electron 桌面壳交付计划

## 当前切片：源码开发启动

Codex Maps 以 Electron 提供 Windows 和 macOS 共用的独立桌面壳。它启动一个由 Codex Maps 自己拥有的只读 Map Reader，并只把该 Reader 的 localhost 页面载入安全 BrowserWindow。

```text
Electron main process
  -> createRuntimeReader
    -> SessionMapModule
      -> codex app-server
  -> BrowserWindow (localhost Reader page)
```

Renderer 没有 Node.js、任意 Electron IPC 或文件系统权限。窗口开启 `contextIsolation`、sandbox、`webSecurity`，拒绝权限请求、外部导航和新窗口。Electron 每次启动为 Reader 生成随机 capability token；token 只在主进程传给自己的 BrowserWindow，不能从无 token 的 localhost API 读取快照。

### 启动

```powershell
$env:CODEX_MAPS_CODEX_PATH = "$env:LOCALAPPDATA\OpenAI\Codex\bin\codex.exe"
pnpm start:desktop
```

`CODEX_MAPS_CODEX_PATH` 是可选覆盖；未设置时使用 PATH 中的 `codex`。如默认端口已被另一个 Reader 占用，可设置 `CODEX_MAPS_PORT` 为 1024–65535 的空闲端口。

当前验收仅包括：源码构建、Electron 主窗口、单实例聚焦、Reader 生命周期与安全窗口配置。Windows 关闭最后一个窗口会先关闭 Reader 再退出；macOS 关闭最后一个窗口保留应用，退出应用时释放 Reader。

## 诚实的能力边界

这不是 Codex Desktop 的嵌入页，也不与正在运行的 Codex Desktop 共享内存事件流。它仍只展示自身 App Server 能观察到的快照；不能宣称实时共享 Desktop Turn、置顶、原生跳转、Token、计划或子 Agent。

## 后续发布切片（不在当前实现）

1. **Codex 发现 adapter：** 以显式路径/PATH 为稳定基线，分别在 Windows 和 macOS 收集真实安装与升级 smoke 证据；不要猜测 `.app` bundle 或修改安装目录。
2. **Windows 发布：** 在干净 Windows x64 环境验证源码启动、安装、卸载和升级；之后再选择并接入 Electron Forge 的安装器与签名配置。签名证书、发布凭据和自动更新均不提交仓库。
3. **macOS 发布：** 在真实 Apple Silicon macOS 构建并 smoke；正式发布前需 Apple Developer 证书、codesign、notarization 和 Gatekeeper 安装验证。Windows 构建不能替代这项验证。
4. **发布安全：** 打包时再选择 ASAR、产物签名、许可、隐私扫描和更新策略；当前不生成安装器、不发布自动更新。

平台门禁与安全模型依据 Electron 官方的 [安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 与 [代码签名说明](https://www.electronjs.org/docs/latest/tutorial/code-signing)。
