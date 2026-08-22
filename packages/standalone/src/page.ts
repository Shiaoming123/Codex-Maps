export function standalonePage(accessToken?: string): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Maps · 独立只读地图</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #20252c; background: #f5f7fa; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 980px; background: #f5f7fa; }
    button, input { font: inherit; }
    .topbar { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; background: #fff; border-bottom: 1px solid #e4e8ee; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -.2px; }
    .mark { width: 24px; height: 24px; border-radius: 7px; background: #232a33; display: grid; place-items: center; color: white; font-size: 12px; }
    .mode { color: #5d6775; font-size: 13px; }
    .layout { display: grid; grid-template-columns: 256px minmax(540px, 1fr) 320px; min-height: calc(100vh - 64px); }
    .filters, .detail { background: #fff; padding: 22px; }
    .filters { border-right: 1px solid #e4e8ee; }
    .detail { border-left: 1px solid #e4e8ee; }
    .content { padding: 24px 28px 42px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 21px; }
    h2 { font-size: 15px; }
    h3 { font-size: 13px; color: #657082; font-weight: 600; margin-bottom: 10px; }
    .sub { margin-top: 6px; color: #697586; font-size: 13px; }
    .source { margin-top: 20px; padding: 13px 15px; display: flex; justify-content: space-between; gap: 16px; border: 1px solid #dfe5ec; border-radius: 10px; background: #fff; color: #4e5968; font-size: 12px; }
    .source strong { color: #27303b; }
    .notice { margin: 16px 0 20px; padding: 12px 14px; border-radius: 9px; background: #edf1f5; color: #4e5968; font-size: 13px; line-height: 1.5; }
    .notice.stale { background: #fff5df; color: #74551e; }
    .notice.error { background: #fdeceb; color: #8a3530; }
    .field { width: 100%; height: 38px; padding: 0 11px; border: 1px solid #d9e0e8; border-radius: 8px; outline: none; color: #27303b; }
    .field:focus { border-color: #697586; box-shadow: 0 0 0 3px #e8edf3; }
    .section { margin-top: 24px; }
    .choices { display: grid; gap: 4px; }
    .choice { width: 100%; text-align: left; border: 0; border-radius: 7px; background: transparent; padding: 9px 10px; color: #4d5867; cursor: pointer; }
    .choice:hover, .choice.active { background: #eef2f6; color: #20252c; font-weight: 600; }
    .choice span { float: right; font-size: 12px; color: #7d8794; font-weight: 400; }
    .lanes { display: grid; gap: 18px; }
    .lane { border: 1px solid #e0e5eb; border-radius: 12px; overflow: hidden; background: #fff; }
    .lane-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid #edf0f3; background: #fbfcfd; }
    .lane-name { font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lane-count { color: #778291; font-size: 12px; }
    .cards { padding: 10px; display: grid; gap: 8px; }
    .card { width: 100%; text-align: left; border: 1px solid #e3e8ee; border-radius: 9px; padding: 12px 13px; background: #fff; cursor: pointer; }
    .card:hover, .card.selected { border-color: #7c8795; background: #f8fafc; }
    .card-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .card-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 650; }
    .preview { margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #697586; font-size: 12px; }
    .time { margin-top: 8px; color: #8a94a3; font-size: 11px; }
    .badge { flex: 0 0 auto; border-radius: 999px; padding: 3px 7px; background: #edf1f5; color: #4b5664; font-size: 11px; }
    .badge.running { background: #e7eff8; color: #315d88; }
    .badge.waiting { background: #fff2db; color: #7c5719; }
    .badge.failed { background: #fde9e7; color: #903c37; }
    .empty { padding: 42px 18px; text-align: center; color: #7b8695; font-size: 13px; }
    .detail-empty { color: #7b8695; font-size: 13px; line-height: 1.6; padding-top: 12px; }
    .detail-title { font-size: 16px; line-height: 1.4; word-break: break-word; }
    .detail-row { margin-top: 18px; }
    .label { color: #7b8695; font-size: 11px; text-transform: uppercase; letter-spacing: .45px; }
    .value { margin-top: 5px; color: #3e4855; font-size: 13px; line-height: 1.55; word-break: break-word; white-space: pre-wrap; }
    .boundary { margin-top: 30px; padding-top: 18px; border-top: 1px solid #edf0f3; color: #7b8695; font-size: 12px; line-height: 1.6; }
    .revision { color: #7b8695; font-size: 12px; white-space: nowrap; }
  </style>
</head>
<body>
  <header class="topbar"><div class="brand"><span class="mark">M</span><span>Codex Maps</span></div><span class="mode">独立只读地图</span></header>
  <div class="layout">
    <aside class="filters">
      <h2>筛选 Session</h2>
      <div class="section"><input class="field" id="search" type="search" placeholder="搜索标题或预览"></div>
      <div class="section"><h3>执行状态</h3><div class="choices" id="states"></div></div>
      <div class="boundary">按工作目录分组，不把工作目录推断为 Codex 项目。当前版本不显示置顶、归档、Token、计划或子 Agent。</div>
    </aside>
    <main class="content">
      <h1>Session 地图</h1><p class="sub">查看此独立数据源返回的 Session 快照。</p>
      <div class="source"><span id="source">正在建立只读数据源</span><span class="revision" id="revision">—</span></div>
      <div class="notice" id="notice">正在建立只读数据源，尚未显示会话。</div>
      <section class="lanes" id="lanes"><div class="empty">正在加载快照…</div></section>
    </main>
    <aside class="detail"><h2>Session 详情</h2><div id="detail" class="detail-empty">选择一张 Session 卡片查看已确认的基础字段。</div></aside>
  </div>
  <script src="/assets/app.js${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ""}"></script>
</body>
</html>`;
}
