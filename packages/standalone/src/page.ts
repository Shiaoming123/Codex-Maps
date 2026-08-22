export function standalonePage(): string {
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
  <script>
    (function () {
      var state = { snapshot: null, selectedId: null, filter: 'all', query: '', lastUpdated: null, transportError: false };
      var labels = { all: '全部', running: '运行中', waiting: '等待', idle: '空闲', failed: '失败', unknown: '未知' };
      var states = document.getElementById('states');
      var lanes = document.getElementById('lanes');
      var detail = document.getElementById('detail');
      var notice = document.getElementById('notice');
      var source = document.getElementById('source');
      var revision = document.getElementById('revision');
      function node(tag, className, value) { var item = document.createElement(tag); if (className) item.className = className; if (value !== undefined) item.textContent = value; return item; }
      function formatTime(value) { return new Date(value * 1000).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }); }
      function updateNotice() {
        if (!state.snapshot) { notice.className = 'notice error'; notice.textContent = '无法连接本地 Map Reader。不会启动第二条连接来伪造与 Codex Desktop 的同步。'; return; }
        var sync = state.snapshot.sync;
        if (state.transportError || sync.phase === 'disconnected') { notice.className = 'notice stale'; notice.textContent = '连接已断开。以下为 ' + state.lastUpdated.toLocaleString('zh-CN') + ' 的最后完整快照，状态可能已变化。'; return; }
        if (sync.phase === 'stale') { notice.className = 'notice stale'; notice.textContent = '以下为最后完整快照，状态可能已变化。'; return; }
        notice.className = 'notice'; notice.textContent = '已获取最新快照 · 来源由 Codex Maps 持有，未与当前 Codex Desktop 共享。';
      }
      function filteredSessions() { if (!state.snapshot) return []; var term = state.query.trim().toLocaleLowerCase(); return state.snapshot.sessions.filter(function (session) { return (state.filter === 'all' || session.executionState === state.filter) && (!term || session.title.toLocaleLowerCase().includes(term) || session.preview.toLocaleLowerCase().includes(term)); }); }
      function renderFilters() { states.replaceChildren(); var sessions = state.snapshot ? state.snapshot.sessions : []; Object.keys(labels).forEach(function (key) { var count = key === 'all' ? sessions.length : sessions.filter(function (session) { return session.executionState === key; }).length; var button = node('button', 'choice' + (state.filter === key ? ' active' : ''), labels[key]); button.type = 'button'; button.appendChild(node('span', '', String(count))); button.addEventListener('click', function () { state.filter = key; render(); }); states.appendChild(button); }); }
      function renderDetail(session) { detail.replaceChildren(); if (!session) { detail.className = 'detail-empty'; detail.textContent = '选择一张 Session 卡片查看已确认的基础字段。'; return; } detail.className = ''; detail.appendChild(node('div', 'detail-title', session.title)); [['执行状态', labels[session.executionState] || '未知'], ['最近更新', formatTime(session.updatedAt)], ['工作目录', session.cwd], ['摘要', session.preview || '—'], ['Session ID', session.sessionId]].forEach(function (row) { var group = node('div', 'detail-row'); group.appendChild(node('div', 'label', row[0])); group.appendChild(node('div', 'value', row[1])); detail.appendChild(group); }); }
      function renderLanes() { lanes.replaceChildren(); var sessions = filteredSessions(); if (!sessions.length) { lanes.appendChild(node('div', 'empty', state.snapshot ? '没有匹配的 Session。' : '正在加载快照…')); return; } var groups = new Map(); sessions.forEach(function (session) { var key = session.cwd || '(未提供工作目录)'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(session); }); groups.forEach(function (items, cwd) { var lane = node('section', 'lane'); var head = node('div', 'lane-head'); head.appendChild(node('div', 'lane-name', cwd)); head.appendChild(node('div', 'lane-count', items.length + ' 个 Session')); lane.appendChild(head); var cards = node('div', 'cards'); items.forEach(function (session) { var card = node('button', 'card' + (state.selectedId === session.id ? ' selected' : '')); card.type = 'button'; var row = node('div', 'card-row'); row.appendChild(node('div', 'card-title', session.title)); row.appendChild(node('span', 'badge ' + session.executionState, labels[session.executionState] || '未知')); card.appendChild(row); card.appendChild(node('div', 'preview', session.preview || '—')); card.appendChild(node('div', 'time', '更新于 ' + formatTime(session.updatedAt))); card.addEventListener('click', function () { state.selectedId = session.id; render(); }); cards.appendChild(card); }); lane.appendChild(cards); lanes.appendChild(lane); }); }
      function render() { renderFilters(); renderLanes(); var selected = state.snapshot && state.snapshot.sessions.find(function (session) { return session.id === state.selectedId; }); renderDetail(selected); updateNotice(); }
      function apply(envelope) { state.snapshot = envelope.snapshot; state.transportError = false; state.lastUpdated = new Date(); source.innerHTML = ''; source.appendChild(document.createTextNode('由 Codex Maps 持有 · 未与当前 Codex Desktop 共享连接')); revision.textContent = 'source ' + envelope.snapshot.version.sourceId + ' · r' + envelope.snapshot.version.revision; if (!state.selectedId && envelope.snapshot.sessions[0]) state.selectedId = envelope.snapshot.sessions[0].id; render(); }
      document.getElementById('search').addEventListener('input', function (event) { state.query = event.target.value; render(); });
      fetch('/api/snapshot').then(function (response) { if (!response.ok) throw new Error('snapshot unavailable'); return response.json(); }).then(apply).catch(function () { state.snapshot = null; render(); });
      var events = new EventSource('/api/events');
      events.addEventListener('snapshot', function (event) { apply(JSON.parse(event.data)); });
      events.onerror = function () { if (state.snapshot) { state.transportError = true; render(); } };
    })();
  </script>
</body>
</html>`;
}
