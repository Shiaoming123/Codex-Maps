# Codex Session Organizer

一个面向个人使用的 Codex Session 可视化管理器。项目以 `codex app-server` 作为 Session 的唯一事实来源，目标是让大量任务更容易搜索、筛选、分组和回看，并在稳定后提供 Windows 私有 Codex 壳层/侧栏增强。

当前状态：`0.1.0 foundation`。已经建立插件骨架、产品边界、架构决策、问题清单和只读 app-server CLI；尚未宣称已经嵌入 Codex 官方桌面左侧栏。

## 为什么单独建项目

这个工具与 Blog 或其他业务项目无关，需要独立运行、打包、测试和跟随 Codex 版本迭代。官方 Codex 安装保持不变，未来的 Windows 补丁也必须使用独立副本和可回退方案。

## 当前实现

```text
codex-session-organizer/
├─ .codex-plugin/plugin.json   # Codex 插件清单
├─ docs/                       # 产品、架构、路线图、问题清单
├─ scripts/                    # 本地只读 app-server 客户端
├─ skills/                     # 后续供 Codex 调用的管理技能
├─ data/                       # 仅存本地偏好，不提交个人 Session 数据
└─ tests/                      # 协议和 CLI 测试
```

## 本地试运行

要求：已安装并可在 PATH 中调用 `codex`，且已完成 Codex 登录。

```powershell
python .\scripts\codex_session_organizer.py list --limit 25
python .\scripts\codex_session_organizer.py list --search "Blog"
python .\scripts\codex_session_organizer.py list --archived --json
```

这个 CLI 只调用 `initialize` 和 `thread/list`，不会归档、删除、重命名或读取完整对话正文。`--json` 输出给未来 UI 使用。

## 开发方向

先完成可验证的独立管理器，再做私有侧栏壳层：

1. 只读检索：列表、搜索、项目路径、状态、归档、最近使用。
2. 项目与分组：优先使用 app-server 的 `project/*`、`threadSection/*`；本地只保存标签别名、颜色和视图偏好。
3. 安全写操作：重命名、置顶/移动、归档等全部先生成预览，再由用户确认；默认不删除。
4. 独立 UI：先做独立窗口/本地 Web UI，验证交互和数据模型。
5. Windows 壳层：复制官方 Codex、独立用户数据目录、版本检测、补丁失败自动回退。

完整范围、边界和验收标准见：

- [产品简报](./docs/product-brief.md)
- [架构说明](./docs/architecture.md)
- [问题清单](./docs/issues.md)
- [路线图](./docs/roadmap.md)
- [决策记录](./docs/decision-log.md)

## 公开仓库边界

仓库只包含代码、协议适配、文档和测试，不包含个人 Session、Codex 登录凭据、完整对话、截图或本机路径快照。发布前必须检查 Git diff 和敏感文件扫描。

## 许可证

MIT。该项目是个人工具，不代表 OpenAI，也不修改或重新分发 Codex 官方安装包。
