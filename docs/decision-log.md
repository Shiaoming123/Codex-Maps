# 决策记录

## 2026-08-22 — 独立项目目录

决定：项目放在 `D:\Project\Local\Codex-Maps\codex-session-organizer`，不放入 Blog 或 Codex 生成目录。

原因：它是独立的本地工具，生命周期、运行时和发布边界都不同；独立仓库也便于公开审阅和回退。

## 2026-08-22 — 双层产品路线

决定：先做 `codex app-server + 独立可视化 UI`，再做 Windows 私有壳层/侧栏增强。

原因：前者有明确的 JSON-RPC 接口和可测试的数据边界；后者依赖桌面 renderer/ASAR 细节，必须绑定版本且不能影响官方安装。

## 2026-08-22 — app-server 优先

决定：不直接读写 Codex JSONL/SQLite；项目和分组优先使用 app-server 的 project/section 实验 API，本地只补充 UI 偏好。

依据：官方 app-server README 将 `thread/list` 定义为 history UI 的列表接口，并描述了 project/section 的实验 API；实验 API 需要在 initialize 时显式协商，因此必须做能力探测和降级。

参考：[Codex App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)、[OpenAI App Server 介绍](https://openai.com/index/unlocking-the-codex-harness/)。

## 2026-08-22 — 首版只读

决定：第一片只实现 initialize、thread/list、搜索、cwd、归档筛选和 JSON 输出。

原因：先验证协议连接和数据模型，降低误归档、误删除和版本差异风险。写操作必须在后续以预览/确认方式加入。

## 2026-08-22 — 公开仓库隐私边界

决定：公开仓库只放源码、文档和测试；不提交个人 Session、凭据、transcript、截图或本机路径。

原因：项目本身是个人管理工具，但公开的是工具实现，不是用户的工作历史。
