# 问题清单与验收标准

优先级含义：P0 是没有它就不能形成可信 MVP；P1 是独立管理器的核心体验；P2 是侧栏和长期维护能力。

## P0 — 当前迭代

### CSO-001 app-server 连接与身份

状态：`doing`

验收：能启动 `codex app-server --stdio`，完成 `initialize`/`initialized`，明确展示缺少 Codex、登录失败和协议错误。

风险：Codex CLI 版本变化；客户端身份会进入合规日志语境，不能伪装成官方客户端。

### CSO-002 Session 列表与检索

状态：`done-for-foundation`

验收：支持 `thread/list` 的 limit、cursor、searchTerm、cwd、archived、sortKey；当前 CLI 已覆盖首页 limit、搜索、cwd、归档和 JSON 输出，分页 UI 留在下一片。

### CSO-003 公开发布隐私门

状态：`doing`

验收：git diff、敏感文件扫描、`.gitignore` 检查全部通过；仓库中没有 Session 内容、token、截图、本机路径快照或私有日志。

### CSO-004 版本与能力探测

状态：`todo`

验收：启动时探测稳定/实验 API；实验能力不可用时 UI 明确显示降级状态，不假设 `project/*` 或 section API 永远存在。

## P1 — 独立管理器

### CSO-010 项目与分组视图

状态：`todo`

验收：优先使用 app-server 的 project/section；本地只补充别名、颜色和筛选器；删除 project 只允许解除归属，绝不删除 Session 或文件。

### CSO-011 独立可视化 UI

状态：`todo`

验收：搜索框、项目树、状态筛选、归档区、详情页和“打开/跳转”动作可用；大列表不依赖一次性加载全部历史。

### CSO-012 安全批量操作

状态：`todo`

验收：重命名、置顶/移动、归档均展示 diff/预览；用户确认后逐项执行；失败项可重试；默认无删除。

### CSO-013 断线与事件一致性

状态：`todo`

验收：重启 app-server 或断开连接后，客户端能重新握手并以权威列表修复视图；不重复执行 mutation。

## P2 — Windows 私有侧栏

### CSO-020 独立 Codex 副本

状态：`blocked-until-p1`

验收：官方安装目录无写入；副本和用户数据目录独立；可明确启动“官方版”和“Organizer 版”。

### CSO-021 renderer/壳层注入

状态：`blocked-until-version-lab`

验收：绑定 Codex build hash；注入失败自动回退；至少保留一个原始副本和撤销命令；每个支持版本有 smoke test。

### CSO-022 升级恢复

状态：`todo`

验收：Codex 更新后检测失配、暂停补丁、提示重新构建；不自动下载或执行未经检查的补丁。

## 明确不作为问题的方向

- 不把“普通插件直接注册原生左侧栏”当作现成接口实现。
- 不通过读取私有数据库绕过 app-server。
- 不在没有用户确认时批量归档或删除。
- 不为了“看起来像产品”先接云端数据库、账号、分析或远程同步。
