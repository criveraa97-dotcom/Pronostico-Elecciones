// Vista del participante
(() => {
  const { $, $$, esc, CHANNEL_TYPES, STATUS, ROLES, fmtClock, metersHTML, chartSVG, renderItem, renderChat, thread, toast, breaking, beep } = CS;
  const app = $('#app');
  const socket = io();
  const clock = CS.makeClock();
  const LS = 'crisis-sim:participant';

  let S = null; // vista de sesión
  let me = null; // participantId
  let view = null; // 'join' | 'lobby' | 'main' | 'debrief'
  let current = null; // canal activo
  let replyTo = null;
  let seen = new Set();
  let firstLoad = true;

  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } })();
  const urlCode = new URLSearchParams(location.search).get('code');

  // ------------------------------------------------------------ ingreso
  function renderJoin(err = '') {
    view = 'join';
    app.innerHTML = `<div class="center-page"><div class="auth-box card stack">
      <div class="brand"><div class="logo">⚡</div><span>CRISIS SIM</span></div>
      <h2>Ingresar a la simulación</h2>
      <p class="muted" style="margin-top:-4px">Usa el código que te entregó el facilitador.</p>
      <form id="join" class="stack">
        <div><label>Código de sesión</label><input id="code" class="mono" style="text-transform:uppercase;letter-spacing:.2em;font-size:18px" maxlength="6" required value="${esc(urlCode || saved?.code || '')}"></div>
        <div><label>Tu nombre</label><input id="name" required maxlength="80" value="${esc(saved?.name || '')}"></div>
        <div><label>Rol en el comité de crisis</label><select id="role">${ROLES.map((r) => `<option ${saved?.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        ${err ? `<div style="color:#ff8095">${esc(err)}</div>` : ''}
        <button class="btn primary lg" style="width:100%">Entrar</button>
      </form>
      <a href="/" class="small muted">← Volver</a></div></div>`;
    $('#join').onsubmit = (e) => {
      e.preventDefault();
      join({ code: $('#code').value, name: $('#name').value, role: $('#role').value });
    };
  }

  function join(data) {
    socket.emit('participant:join', data, (res) => {
      if (res.error) {
        localStorage.removeItem(LS);
        return renderJoin(res.error);
      }
      me = res.participantId;
      localStorage.setItem(LS, JSON.stringify({ code: res.session.code, participantId: me, name: data.name, role: data.role }));
      update(res.session);
    });
  }

  socket.on('connect', () => {
    if (me && S) join({ code: S.code, participantId: me });
  });
  socket.on('session:view', (s) => { if (me) update(s); });
  socket.on('session:closed', () => { localStorage.removeItem(LS); me = null; S = null; renderJoin('La sesión fue eliminada por el facilitador.'); });
  socket.on('alert', (a) => {
    if (!S || S.status !== 'running') return;
    const ch = S.scenario.channels.find((c) => c.id === a.channelId);
    if (a.channelId === current && document.hasFocus()) { if (a.severity === 'critica') breaking(a.title); return; }
    toast(a.title, `${CHANNEL_TYPES[ch?.type]?.icon || ''} ${ch?.name || ''} · ${a.author || ''}`, a.severity, () => { switchChannel(a.channelId); if (a.itemId) flash(a.itemId); });
    beep(a.severity);
    if (a.severity === 'critica') breaking(a.title);
  });

  // ------------------------------------------------------------ estado
  function update(s) {
    const prevStatus = S?.status;
    S = s;
    clock.set(s.clock);
    if (s.status === 'lobby') return renderLobby();
    if (s.status === 'ended') return renderDebrief();
    if (view !== 'main') {
      renderMain();
      if (prevStatus === 'lobby' || firstLoad) showBriefing();
    } else refreshMain();
    firstLoad = false;
  }

  function renderLobby() {
    view = 'lobby';
    const sc = S.scenario;
    app.innerHTML = `<div class="center-page"><div class="hero card" style="max-width:760px">
      <div class="row"><span class="pill lobby">${STATUS.lobby}</span><span class="muted">Sesión <b class="mono">${esc(S.code)}</b></span></div>
      <h1 style="margin-top:14px;font-size:30px">${esc(sc.title)}</h1>
      <p class="muted">${esc(sc.organization)}</p>
      <div class="body" style="white-space:pre-wrap;line-height:1.6;margin:16px 0">${esc(sc.briefing || sc.summary)}</div>
      <h4 class="muted small" style="text-transform:uppercase;letter-spacing:.08em">Canales disponibles</h4>
      <div class="row wrap" style="margin-bottom:16px">${sc.channels.map((c) => `<span class="ch-chip">${CHANNEL_TYPES[c.type].icon} ${esc(c.name)}</span>`).join('')}</div>
      <h4 class="muted small" style="text-transform:uppercase;letter-spacing:.08em">Equipo conectado (${S.participants.length})</h4>
      <div class="row wrap">${S.participants.map((p) => `<span class="ch-chip">${p.online ? '🟢' : '⚪'} ${esc(p.name)} <span class="muted">· ${esc(p.role)}</span></span>`).join('')}</div>
      <p class="muted" style="margin-top:22px">⏳ Esperando que el facilitador inicie la simulación…</p></div></div>`;
  }

  function showBriefing() {
    const sc = S.scenario;
    const m = CS.modal(`<h2>📋 Briefing — ${esc(sc.title)}</h2><p class="muted">${esc(sc.organization)}</p>
      <div style="white-space:pre-wrap;line-height:1.6">${esc(sc.briefing || sc.summary)}</div>
      <div class="modal-foot"><button class="btn primary" id="go">Entendido</button></div>`);
    $('#go', m).onclick = m.close;
  }

  // ------------------------------------------------------------ vista principal
  function renderMain() {
    view = 'main';
    const sc = S.scenario;
    if (!current || !sc.channels.some((c) => c.id === current)) current = sc.channels[0]?.id;
    app.innerHTML = `<div class="play">
      <div class="topbar">
        <div class="brand"><div class="logo">⚡</div><div><div>${esc(sc.organization)}</div><div class="small muted" style="font-weight:500">${esc(sc.title)}</div></div></div>
        <span id="status" class="pill"></span>
        <div class="clock" id="clock">T+00:00</div>
        <div class="spacer"></div>
        <div class="metrics-inline" id="metricsTop"></div>
        <button class="btn sm" id="briefBtn">📋 Briefing</button>
        <button class="btn sm" id="sideBtn">☰ Pendientes</button>
      </div>
      <div class="play-main" id="main">
        <nav class="sidebar" id="channels"></nav>
        <div class="feed-wrap">
          <div class="feed-head" id="feedHead"></div>
          <div class="feed" id="feed"><div class="feed-inner"><div id="composerBox"></div><div id="list"></div></div></div>
          <div class="chat-composer hidden" id="chatBox"><form class="row" id="chatForm"><input type="text" id="chatInput" placeholder="Escribe al equipo interno…" autocomplete="off"><button class="btn primary">Enviar</button></form></div>
        </div>
        <aside class="rightbar">
          <section><h4>Indicadores</h4><div id="meters"></div><div id="chart"></div></section>
          <section><h4>Pendientes de respuesta</h4><div id="pending"></div></section>
          <section><h4>Equipo</h4><div id="team"></div></section>
        </aside>
      </div></div>`;
    $('#briefBtn').onclick = showBriefing;
    $('#sideBtn').onclick = () => $('#main').classList.toggle('show-right');
    $('#chatForm').onsubmit = (e) => {
      e.preventDefault();
      const v = $('#chatInput').value.trim();
      if (!v) return;
      send({ channelId: current, body: v, kind: 'chat' }, () => { $('#chatInput').value = ''; });
    };
    $('#feed').addEventListener('click', onFeedClick);
    renderComposer();
    refreshMain();
  }

  function onFeedClick(e) {
    const b = e.target.closest('[data-reply]');
    if (b) { setReply(b.dataset.reply); }
  }

  function setReply(id) {
    replyTo = id;
    renderComposer();
    $('#feed').scrollTo({ top: 0, behavior: 'smooth' });
    $('#cBody')?.focus();
  }

  function switchChannel(id) {
    if (id !== current) { current = id; replyTo = null; renderComposer(); }
    refreshMain();
    $('#main')?.classList.remove('show-right');
  }

  function flash(id) {
    setTimeout(() => {
      const el = document.getElementById('it-' + id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2000);
    }, 50);
  }

  const chOf = (id) => S.scenario.channels.find((c) => c.id === id);

  function renderComposer() {
    const ch = chOf(current);
    const box = $('#composerBox');
    if (!ch || !box) return;
    const isChat = ch.type === 'interno';
    $('#chatBox').classList.toggle('hidden', !isChat);
    if (isChat) { box.innerHTML = ''; return; }
    const t = CHANNEL_TYPES[ch.type];
    const target = replyTo && S.feed.find((f) => f.id === replyTo);
    const needsTitle = ch.type !== 'redes';
    const titleLabel = ch.type === 'prensa' ? 'Titular del comunicado' : 'Asunto';
    const placeholder = {
      prensa: 'Redacta el comunicado o la respuesta al medio…',
      redes: '¿Qué publicará la cuenta oficial?',
      autoridades: 'Redacta la respuesta formal a la autoridad…',
      stakeholders: 'Redacta el correo…',
    }[ch.type];
    const prevTitle = $('#cTitle')?.value || '';
    const prevBody = $('#cBody')?.value || '';
    box.innerHTML = `<form class="composer" id="cForm">
      <div class="row" style="margin-bottom:8px"><b>${t.icon} ${target ? 'Responder' : t.verb}</b><span class="muted small">como ${esc(S.scenario.organization)}</span></div>
      ${target ? `<div class="reply-to"><span class="grow">↩ En respuesta a <b>${esc(target.author)}</b>: ${esc((target.title || target.body).slice(0, 90))}</span><button type="button" class="btn ghost sm" id="cancelReply">✕</button></div>` : ''}
      ${needsTitle ? `<input type="text" id="cTitle" placeholder="${titleLabel}" maxlength="200" style="margin-bottom:8px">` : ''}
      <textarea id="cBody" placeholder="${placeholder}" maxlength="5000"></textarea>
      <div class="row" style="margin-top:8px"><span class="muted small" id="cCount"></span><div class="spacer"></div><button class="btn primary" id="cSend">Publicar</button></div>
    </form>`;
    if ($('#cTitle')) $('#cTitle').value = prevTitle;
    $('#cBody').value = prevBody;
    const count = () => { const n = $('#cBody').value.length; $('#cCount').textContent = ch.type === 'redes' ? `${n}/280 recomendado` : `${n} caracteres`; $('#cCount').style.color = ch.type === 'redes' && n > 280 ? '#ffb020' : ''; };
    $('#cBody').oninput = count; count();
    $('#cancelReply') && ($('#cancelReply').onclick = () => { replyTo = null; renderComposer(); });
    $('#cForm').onsubmit = (e) => {
      e.preventDefault();
      const body = $('#cBody').value.trim();
      if (!body) return;
      if (!confirm('¿Publicar este mensaje? Una vez enviado no se puede retirar.')) return;
      send({ channelId: current, title: $('#cTitle')?.value || '', body, replyTo, kind: replyTo ? 'respuesta' : 'comunicado' }, () => {
        if ($('#cTitle')) $('#cTitle').value = '';
        $('#cBody').value = '';
        replyTo = null;
        renderComposer();
      });
    };
  }

  function send(data, done) {
    socket.emit('participant:respond', data, (res) => {
      if (res.error) return toast(res.error, 'No se pudo enviar', 'alta');
      done?.();
    });
  }

  function refreshMain() {
    if (view !== 'main') return;
    const sc = S.scenario;
    const ch = chOf(current);
    // marcar como vistos
    for (const f of S.feed) if (f.channelId === current) seen.add(f.id);

    $('#status').className = 'pill ' + S.status;
    $('#status').textContent = STATUS[S.status];
    $('#channels').innerHTML = '<h4>Canales</h4>' + sc.channels.map((c) => {
      const unread = S.feed.filter((f) => f.channelId === c.id && !seen.has(f.id) && f.kind !== 'response').length;
      return `<button class="ch-btn ${c.id === current ? 'active' : ''}" data-ch="${c.id}"><span class="ic">${CHANNEL_TYPES[c.type].icon}</span><span>${esc(c.name)}</span>${unread ? `<span class="badge">${unread}</span>` : ''}</button>`;
    }).join('');
    $$('#channels [data-ch]').forEach((b) => (b.onclick = () => switchChannel(b.dataset.ch)));

    $('#feedHead').innerHTML = `<span style="font-size:20px">${CHANNEL_TYPES[ch.type].icon}</span><div><b>${esc(ch.name)}</b><div class="small muted">${channelHint(ch.type)}</div></div>${S.status === 'paused' ? '<span class="spacer"></span><span class="pill paused">Simulación en pausa</span>' : ''}`;

    const feedEl = $('#feed');
    const atBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 80;
    const { roots, childrenOf } = thread(S.feed, current);
    if (ch.type === 'interno') {
      $('#list').innerHTML = roots.length ? roots.map((i) => renderChat(i, me)).join('') : '<p class="muted">Aún no hay mensajes del equipo.</p>';
      if (atBottom || firstLoad) feedEl.scrollTop = feedEl.scrollHeight;
    } else {
      const html = [...roots].reverse().map((i) => renderItem(i, ch, { meId: me, canReply: S.status === 'running', children: childrenOf(i.id), childrenOf })).join('');
      $('#list').innerHTML = html || '<p class="muted">Sin novedades en este canal por ahora.</p>';
    }
    CS.markFresh($('#list'));

    $('#metricsTop').innerHTML = S.metrics ? metersHTML(S.metrics) : '';
    $('#meters').innerHTML = S.metrics ? metersHTML(S.metrics) : '<p class="muted small">El facilitador ocultó los indicadores.</p>';
    $('#chart').innerHTML = S.metrics ? chartSVG(S.history, clock.now()) : '';
    $('#team').innerHTML = S.participants.map((p) => `<div class="row small" style="margin-bottom:6px">${p.online ? '🟢' : '⚪'} <b>${esc(p.name)}</b><span class="muted">${esc(p.role)}</span>${p.id === me ? '<span class="muted">(tú)</span>' : ''}</div>`).join('');
    renderPending();
    tickClock();
  }

  function channelHint(t) {
    return {
      prensa: 'Noticias, consultas de periodistas y comunicados oficiales',
      redes: 'Lo que se dice en redes. Publica desde la cuenta oficial o responde a usuarios',
      autoridades: 'Requerimientos formales de organismos públicos',
      stakeholders: 'Directorio, clientes, socios e inversionistas',
      interno: 'Canal privado del comité de crisis (no tiene impacto público)',
    }[t];
  }

  function renderPending() {
    const list = S.feed.filter((f) => f.requiresResponse && !f.answeredBy?.length);
    $('#pending').innerHTML = list.length ? list.map((f) => {
      const ch = chOf(f.channelId);
      return `<div class="pending-item" data-pid="${f.id}" data-pch="${f.channelId}">
        <div class="row small"><span>${CHANNEL_TYPES[ch?.type]?.icon || ''} ${esc(ch?.name || '')}</span><span class="spacer"></span><span class="cd" data-deadline="${f.deadlineMs}"></span></div>
        <div style="margin-top:3px"><b>${esc(f.author)}</b>: ${esc((f.title || f.body).slice(0, 70))}</div></div>`;
    }).join('') : '<p class="muted small">✅ Sin pendientes.</p>';
    $$('#pending [data-pid]').forEach((el) => (el.onclick = () => { switchChannel(el.dataset.pch); setReply(el.dataset.pid); }));
  }

  function tickClock() {
    if (view === 'main') {
      const now = clock.now();
      $('#clock').textContent = fmtClock(now);
      $$('[data-deadline]').forEach((el) => {
        const left = Number(el.dataset.deadline) - now;
        el.textContent = left >= 0 ? '⏱ ' + fmtClock(left, false) : 'VENCIDO';
        el.style.color = left < 0 ? '#ff6b85' : left < 120000 ? '#ffb020' : '';
        el.closest('.pending-item')?.classList.toggle('late', left < 0);
      });
    }
  }
  setInterval(tickClock, 500);

  // ------------------------------------------------------------ debrief
  function renderDebrief() {
    view = 'debrief';
    const sc = S.scenario;
    const team = S.feed.filter((f) => f.kind === 'response');
    const external = team.filter((f) => f.analysis);
    const required = S.feed.filter((f) => f.requiresResponse);
    const answered = required.filter((f) => f.answeredBy?.length);
    const times = answered.map((f) => (f.answeredAt ?? f.t) - f.t).filter((x) => x >= 0);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const pos = external.filter((f) => f.analysis.label === 'positivo').length;
    app.innerHTML = `<div class="debrief">
      <div class="row"><div class="brand"><div class="logo">⚡</div><span>CRISIS SIM</span></div><span class="spacer"></span><span class="pill ended">Finalizada</span><button class="btn sm no-print" onclick="print()">🖨 Imprimir</button></div>
      <h1 style="margin-top:20px">Debriefing: ${esc(sc.title)}</h1>
      <p class="muted">${esc(sc.organization)} · Duración simulada ${fmtClock(S.clock.elapsedMs)}</p>
      <div class="kpis">
        ${CS.METRICS.map((m) => `<div class="kpi"><div class="v" style="color:${m.color}">${S.metrics?.[m.key] ?? '—'}</div><div class="l">${m.label} final</div></div>`).join('')}
        <div class="kpi"><div class="v">${answered.length}/${required.length}</div><div class="l">Requerimientos respondidos</div></div>
        <div class="kpi"><div class="v">${avg != null ? fmtClock(avg, false) : '—'}</div><div class="l">Tiempo medio de respuesta</div></div>
        <div class="kpi"><div class="v">${external.length ? Math.round((pos / external.length) * 100) + '%' : '—'}</div><div class="l">Mensajes públicos con tono positivo</div></div>
      </div>
      <div class="card"><h3>Evolución de indicadores</h3>${chartSVG(S.history, S.clock.elapsedMs, { wide: true })}</div>
      <h2 style="margin-top:26px">Mensajes del equipo</h2>
      ${external.length ? external.map((f) => {
        const ch = chOf(f.channelId);
        const a = f.analysis;
        return `<div class="card" style="margin-bottom:10px"><div class="row small muted"><span>${CHANNEL_TYPES[ch.type].icon} ${esc(ch.name)}</span><span class="mono">${fmtClock(f.t)}</span><span>· ${esc(f.participantName)} (${esc(f.role)})</span><span class="spacer"></span><span class="score ${a.label}">${a.label} ${a.score > 0 ? '+' : ''}${a.score}</span></div>
        ${f.title ? `<h4 style="margin-top:8px">${esc(f.title)}</h4>` : ''}<div style="white-space:pre-wrap;margin-top:6px">${esc(f.body)}</div>
        <div class="analysis">${a.strengths.length ? `<b>Fortalezas</b><ul>${a.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${a.risks.length ? `<b>Riesgos</b><ul>${a.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${f.rating ? `<div style="margin-top:6px"><b>Facilitador:</b> ${f.rating.delta > 0 ? '👍' : f.rating.delta < 0 ? '👎' : ''} ${esc(f.rating.note || '')}</div>` : ''}</div></div>`;
      }).join('') : '<p class="muted">El equipo no emitió mensajes públicos.</p>'}
      ${required.length - answered.length ? `<h2 style="margin-top:26px">Requerimientos sin respuesta</h2>${required.filter((f) => !f.answeredBy?.length).map((f) => `<div class="card" style="margin-bottom:8px"><b>${esc(f.author)}</b> — ${esc(f.title || f.body.slice(0, 120))} <span class="muted mono small">${fmtClock(f.t)}</span></div>`).join('')}` : ''}
      <p class="no-print" style="margin-top:30px"><button class="btn" id="leave">Salir de la sesión</button></p></div>`;
    $('#leave').onclick = () => { localStorage.removeItem(LS); location.href = '/'; };
  }

  // ------------------------------------------------------------ inicio
  if (saved?.participantId && (!urlCode || urlCode.toUpperCase() === saved.code)) {
    me = saved.participantId;
    app.innerHTML = '<div class="center-page"><p class="muted">Reconectando…</p></div>';
    socket.emit('participant:join', { code: saved.code, participantId: saved.participantId }, (res) => {
      if (res.error) { me = null; localStorage.removeItem(LS); return renderJoin(); }
      update(res.session);
    });
  } else renderJoin();
})();
