export function standaloneClientScript(): string {
  return String.raw`(function () {
  var state = { snapshot: null, selectedId: null, filter: 'all', query: '', lastUpdated: null, transportError: false };
  var labels = { all: '全部', running: '运行中', waiting: '等待', idle: '空闲', failed: '失败', unknown: '未知' };
  var token = new URLSearchParams(location.search).get('token');
  var states = document.getElementById('states');
  var lanes = document.getElementById('lanes');
  var detail = document.getElementById('detail');
  var notice = document.getElementById('notice');
  var source = document.getElementById('source');
  var revision = document.getElementById('revision');
  function api(path) { return token ? path + '?token=' + encodeURIComponent(token) : path; }
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
  function apply(envelope) { state.snapshot = envelope.snapshot; state.transportError = false; state.lastUpdated = new Date(); source.replaceChildren(document.createTextNode('由 Codex Maps 持有 · 未与当前 Codex Desktop 共享连接')); revision.textContent = 'source ' + envelope.snapshot.version.sourceId + ' · r' + envelope.snapshot.version.revision; if (!state.selectedId && envelope.snapshot.sessions[0]) state.selectedId = envelope.snapshot.sessions[0].id; render(); }
  document.getElementById('search').addEventListener('input', function (event) { state.query = event.target.value; render(); });
  fetch(api('/api/snapshot')).then(function (response) { if (!response.ok) throw new Error('snapshot unavailable'); return response.json(); }).then(apply).catch(function () { state.snapshot = null; render(); });
  var events = new EventSource(api('/api/events'));
  events.addEventListener('snapshot', function (event) { apply(JSON.parse(event.data)); });
  events.onerror = function () { if (state.snapshot) { state.transportError = true; render(); } };
})();`;
}
