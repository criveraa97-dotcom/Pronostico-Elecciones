// Utilidades compartidas entre la vista de administrador y la de participante
window.CS = (() => {
  const CHANNEL_TYPES = {
    prensa: { icon: '📰', label: 'Prensa', verb: 'Comunicado de prensa' },
    redes: { icon: '📱', label: 'Redes sociales', verb: 'Publicación oficial' },
    autoridades: { icon: '🏛️', label: 'Autoridades', verb: 'Respuesta formal' },
    stakeholders: { icon: '✉️', label: 'Stakeholders', verb: 'Correo' },
    interno: { icon: '💬', label: 'Equipo interno', verb: 'Mensaje' },
  };
  const SEV = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
  const STATUS = { lobby: 'En espera', running: 'En curso', paused: 'En pausa', ended: 'Finalizada' };
  const ROLES = ['Gerente General', 'Director/a de Comunicaciones', 'Vocero/a', 'Community Manager', 'Asesor/a Legal', 'Relaciones Institucionales', 'Recursos Humanos', 'Operaciones', 'Otro'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function fmtClock(ms, withSign = true) {
    const neg = ms < 0; ms = Math.abs(ms);
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (withSign ? (neg ? 'T−' : 'T+') : '') + (h ? p(h) + ':' : '') + p(m) + ':' + p(s);
  }
  const fmtMin = (ms) => 'T+' + String(Math.floor(ms / 60000)).padStart(2, '0') + "'";

  // Reloj sincronizado con el servidor
  function makeClock() {
    let c = null, offset = 0;
    return {
      set(clock) { c = clock; offset = Date.now() - clock.serverNow; },
      now() {
        if (!c) return 0;
        if (c.status !== 'running') return c.elapsedMs;
        return c.elapsedMs + (Date.now() - offset - c.serverNow) * c.speed;
      },
      get status() { return c?.status; },
    };
  }

  function toast(title, sub = '', sev = 'media', onClick) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + sev;
    el.innerHTML = `<div class="t1">${esc(sub)}</div><div class="t2">${esc(title)}</div>`;
    el.onclick = () => { onClick?.(); el.remove(); };
    box.prepend(el);
    setTimeout(() => el.remove(), sev === 'critica' ? 9000 : 6000);
    while (box.children.length > 4) box.lastChild.remove();
  }

  function breaking(text) {
    const el = document.createElement('div');
    el.className = 'breaking';
    el.textContent = '⚠ Última hora: ' + text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  let audio;
  function beep(sev = 'media') {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const notes = sev === 'critica' ? [880, 660, 880] : sev === 'alta' ? [740, 990] : [660];
      notes.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.14 + 0.13);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + i * 0.14); o.stop(audio.currentTime + i * 0.14 + 0.15);
      });
    } catch { /* sin audio */ }
  }

  const COLORS = ['#e8505b', '#f39c12', '#16a085', '#2980b9', '#8e44ad', '#d35400', '#27ae60', '#c0392b', '#2c3e50', '#7f8c8d'];
  const avatarColor = (s) => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const METRICS = [
    { key: 'reputacion', label: 'Reputación', color: '#2ecc8f', good: 'high' },
    { key: 'presion', label: 'Presión mediática', color: '#ff5a3c', good: 'low' },
    { key: 'autoridades', label: 'Relación con autoridades', color: '#4ea1ff', good: 'high' },
  ];
  function meterColor(v, good) {
    const x = good === 'low' ? 100 - v : v;
    return x >= 60 ? '#2ecc8f' : x >= 35 ? '#ffb020' : '#ff3355';
  }
  function metersHTML(m) {
    if (!m) return '';
    return METRICS.map((d) => `<div class="meter"><div class="lbl"><span>${d.label}</span><b>${m[d.key]}</b></div><div class="bar"><i style="width:${m[d.key]}%;background:${meterColor(m[d.key], d.good)}"></i></div></div>`).join('');
  }

  function chartSVG(history, endMs, { wide = false } = {}) {
    if (!history || history.length < 1) return '<div class="muted small">Sin datos aún</div>';
    const W = wide ? 900 : 300, H = wide ? 240 : 140, P = 22;
    const maxT = Math.max(60000, endMs || 0, ...history.map((h) => h.t));
    const x = (t) => P + (t / maxT) * (W - P - 6);
    const y = (v) => 6 + (1 - v / 100) * (H - P - 6);
    const grid = [0, 50, 100].map((v) => `<line x1="${P}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="#263049" stroke-dasharray="3 3"/><text x="2" y="${y(v) + 4}" fill="#8b97b0" font-size="9">${v}</text>`).join('');
    const lines = METRICS.map((d) => {
      const pts = history.map((h) => `${x(h.t).toFixed(1)},${y(h[d.key]).toFixed(1)}`).join(' ');
      return `<polyline fill="none" stroke="${d.color}" stroke-width="2" stroke-linejoin="round" points="${pts}"/>`;
    }).join('');
    const ticks = [0, maxT / 2, maxT].map((t) => `<text x="${x(t)}" y="${H - 4}" fill="#8b97b0" font-size="9" text-anchor="middle">${Math.round(t / 60000)}'</text>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:auto">${grid}${lines}${ticks}</svg>
      <div class="legend">${METRICS.map((d) => `<span><i style="background:${d.color}"></i>${d.label}</span>`).join('')}</div>`;
  }

  function download(name, content, type = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function modal(html, { wide = false } = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    bg.close = () => bg.remove();
    return bg;
  }

  // Render de un elemento del feed (compartido); opts.extra(item) agrega HTML (p. ej. análisis para admin)
  function renderItem(item, ch, opts = {}) {
    const type = ch?.type || 'prensa';
    const mine = opts.meId && item.participantId === opts.meId;
    const isTeam = item.kind === 'response';
    const children = (opts.children || []).map((c) => renderItem(c, ch, { ...opts, children: opts.childrenOf?.(c.id) })).join('');
    const sev = item.kind === 'inject' && item.severity && item.severity !== 'baja' ? `<span class="sev ${item.severity}">${SEV[item.severity]}</span>` : '';
    const time = `<span class="mono">${fmtClock(item.t)}</span>`;
    let rr = '';
    if (item.requiresResponse) {
      if (item.answeredBy?.length) rr = '<span class="tag-ok">Respondido</span>';
      else if (item.escalated) rr = '<span class="tag-late">Plazo vencido</span>';
      else rr = '<span class="tag-rr">Requiere respuesta</span>';
    }
    const byLine = isTeam ? `<span class="muted">· por ${esc(item.participantName)}${item.role ? ' (' + esc(item.role) + ')' : ''}</span>` : '';
    const replyBtn = opts.canReply && !isTeam && type !== 'interno' ? `<button class="btn sm" data-reply="${item.id}">↩ Responder</button>` : '';
    const extra = opts.extra ? opts.extra(item) : '';
    const img = item.imageUrl ? `<img class="media" src="${esc(item.imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    const cls = `item t-${type} ${mine ? 'mine' : ''} ${item.kind === 'system' ? 'escal' : ''}`;
    const actions = replyBtn || extra ? `<div class="actions">${replyBtn}</div>${extra}` : '';
    const kids = children ? `<div class="children">${children}</div>` : '';

    if (type === 'redes') {
      const name = item.author || 'Usuario';
      return `<div class="${cls}" id="it-${item.id}">
        <div class="s-head"><div class="avatar" style="background:${isTeam ? 'linear-gradient(135deg,#ff5a3c,#ffb020)' : avatarColor(name)}">${esc(initials(name))}</div>
        <div class="grow"><div class="meta"><span class="author">${esc(name)}</span>${isTeam ? ' ✔️' : ''}<span>@${esc(item.handle || name.toLowerCase().replace(/\s+/g, ''))}</span>· ${time} ${sev} ${rr} ${byLine}</div>
        ${item.title && item.kind !== 'inject' && item.kind !== 'system' ? `<div class="title">${esc(item.title)}</div>` : ''}
        <div class="body">${esc(item.body)}</div>${img}
        ${item.likes || item.shares ? `<div class="stats"><span>♥ ${item.likes || 0}</span><span>🔁 ${item.shares || 0}</span><span>💬 ${(opts.children || []).length}</span></div>` : ''}
        ${actions}</div></div>${kids}</div>`;
    }
    if (type === 'stakeholders') {
      return `<div class="${cls}" id="it-${item.id}">
        <div class="mail-h"><div>De: <b>${esc(item.author)}</b> ${byLine}</div><div>Asunto: <b>${esc(item.title || '(sin asunto)')}</b></div><div class="row" style="margin-top:4px">${time} ${sev} ${rr}</div></div>
        <div class="body">${esc(item.body)}</div>${img}${actions}${kids}</div>`;
    }
    if (type === 'autoridades') {
      return `<div class="${cls}" id="it-${item.id}">
        <div class="meta"><span class="author">${isTeam ? esc(item.author) + ' → Autoridad' : esc(item.author)}</span>· ${time} ${sev} ${rr} ${byLine}</div>
        ${item.title ? `<div class="title">${esc(item.title)}</div>` : ''}
        <div class="body">${esc(item.body)}</div>${img}${actions}${kids}</div>`;
    }
    // prensa (por defecto)
    const label = isTeam ? (item.subtype === 'respuesta' ? 'Respuesta a medio' : 'Comunicado oficial') : item.kind === 'reaction' ? 'Cobertura' : item.requiresResponse ? 'Consulta de prensa' : 'Noticia';
    return `<div class="${cls}" id="it-${item.id}">
      <div class="meta"><span class="outlet">${esc(item.author)}</span><span class="muted">· ${label}</span>· ${time} ${sev} ${rr} ${byLine}</div>
      ${item.title ? `<div class="title">${esc(item.title)}</div>` : ''}
      <div class="body">${esc(item.body)}</div>${img}${actions}${kids}</div>`;
  }

  function renderChat(item, meId) {
    const mine = item.participantId && item.participantId === meId;
    const sys = item.kind !== 'response';
    const name = item.participantName || item.author || 'Sistema';
    return `<div class="chat-msg ${mine ? 'mine' : ''} ${sys ? 'sys' : ''}" id="it-${item.id}">
      <div class="avatar" style="background:${avatarColor(name)}">${esc(initials(name))}</div>
      <div class="bubble"><div class="who">${esc(name)} <span class="muted small">${esc(item.role || (sys ? 'Mensaje entrante' : ''))} · ${fmtClock(item.t)}</span> ${item.severity && sys && item.severity !== 'baja' ? `<span class="sev ${item.severity}">${SEV[item.severity]}</span>` : ''}</div>
      ${item.title && sys ? `<b>${esc(item.title)}</b><br>` : ''}<div class="body" style="white-space:pre-wrap">${esc(item.body)}</div></div></div>`;
  }

  // Agrupa el feed por canal: devuelve raíces y función de hijos
  function thread(feed, channelId) {
    const items = feed.filter((f) => f.channelId === channelId);
    const ids = new Set(items.map((i) => i.id));
    const kids = {};
    for (const i of items) if (i.replyTo && ids.has(i.replyTo)) (kids[i.replyTo] ||= []).push(i);
    const roots = items.filter((i) => !i.replyTo || !ids.has(i.replyTo));
    return { roots, childrenOf: (id) => kids[id] || [] };
  }

  // Anima solo los elementos que aparecen por primera vez
  const shown = new Set();
  function markFresh(root) {
    const first = shown.size === 0;
    root.querySelectorAll('[id^="it-"]').forEach((el) => {
      if (!shown.has(el.id)) { shown.add(el.id); if (!first) el.classList.add('fresh'); }
    });
  }

  return { markFresh, CHANNEL_TYPES, SEV, STATUS, ROLES, METRICS, esc, $, $$, fmtClock, fmtMin, makeClock, toast, breaking, beep, avatarColor, initials, metersHTML, chartSVG, download, modal, renderItem, renderChat, thread };
})();
