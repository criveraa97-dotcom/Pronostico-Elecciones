// Panel de administración / facilitador
(() => {
  const { $, $$, esc, CHANNEL_TYPES, SEV, STATUS, METRICS, fmtClock, metersHTML, chartSVG, renderItem, renderChat, thread, toast, download, modal } = CS;
  const app = $('#app');
  const socket = io();
  const clock = CS.makeClock();
  const PW = 'crisis-sim:admin';

  let scenarios = [];
  let sessions = [];
  let tab = 'sessions';
  let route = 'home'; // home | editor | control
  let draft = null; // escenario en edición
  let live = null; // sesión observada (vista completa)
  let filter = 'all';
  let logged = false;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => { if (r?.error) toast(r.error, 'Error', 'alta'); res(r || {}); }));

  // ------------------------------------------------------------ login
  function renderLogin(err = '') {
    app.innerHTML = `<div class="center-page"><form class="auth-box card stack" id="login">
      <div class="brand"><div class="logo">⚡</div><span>CRISIS SIM · Administración</span></div>
      <div><label>Contraseña de administrador</label><input type="password" id="pw" autofocus required></div>
      ${err ? `<div style="color:#ff8095">${esc(err)}</div>` : ''}
      <button class="btn primary lg" style="width:100%">Ingresar</button>
      <a href="/" class="small muted">← Volver</a></form></div>`;
    $('#login').onsubmit = (e) => { e.preventDefault(); login($('#pw').value); };
  }
  function login(password) {
    socket.emit('admin:login', { password }, (r) => {
      if (r.error) { sessionStorage.removeItem(PW); return renderLogin(r.error); }
      sessionStorage.setItem(PW, password);
      logged = true;
      scenarios = r.scenarios; sessions = r.sessions;
      if (route === 'control' && live) watch(live.id);
      else if (route !== 'editor') renderHome();
    });
  }
  socket.on('connect', () => { const pw = sessionStorage.getItem(PW); if (pw) login(pw); else if (!logged) renderLogin(); });
  socket.on('sessions:list', (l) => { sessions = l; if (route === 'home' && tab === 'sessions') renderHome(); });
  socket.on('session:full', (s) => { if (route === 'control' && live && s.id === live.id) { live = s; clock.set(s.clock); renderControl(); } });

  const topbar = (inner = '') => `<div class="topbar"><a class="brand" href="/admin.html" style="text-decoration:none;color:inherit"><div class="logo">⚡</div><span>CRISIS SIM</span></a>${inner}</div>`;

  // ------------------------------------------------------------ inicio
  function renderHome() {
    route = 'home';
    app.innerHTML = topbar(`<div class="tabs"><button class="tab ${tab === 'sessions' ? 'active' : ''}" data-tab="sessions">Sesiones</button><button class="tab ${tab === 'scenarios' ? 'active' : ''}" data-tab="scenarios">Escenarios</button></div><div class="spacer"></div><button class="btn sm ghost" id="logout">Cerrar sesión</button>`) + `<div class="admin-wrap" id="content"></div>`;
    $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderHome(); }));
    $('#logout').onclick = () => { sessionStorage.removeItem(PW); location.reload(); };
    tab === 'sessions' ? renderSessions() : renderScenarios();
  }

  function renderSessions() {
    const c = $('#content');
    c.innerHTML = `<div class="row" style="margin-bottom:16px"><h2 style="margin:0">Sesiones</h2><span class="spacer"></span>
      <select id="newSc" style="width:auto;max-width:320px">${scenarios.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select>
      <button class="btn primary" id="newSession" ${scenarios.length ? '' : 'disabled'}>＋ Nueva sesión</button></div>
      ${sessions.length ? `<div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Código</th><th>Sesión</th><th>Estado</th><th>Participantes</th><th>Creada</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr><td><b class="mono" style="font-size:15px;letter-spacing:.1em">${esc(s.code)}</b></td><td><b>${esc(s.name)}</b><div class="muted small">${esc(s.organization)}</div></td>
        <td><span class="pill ${s.status}">${STATUS[s.status]}</span></td><td>${s.online}/${s.participants} en línea</td><td class="muted small">${new Date(s.createdAt).toLocaleString('es')}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm primary" data-open="${s.id}">Abrir sala de control</button> <button class="btn sm danger" data-del="${s.id}">Eliminar</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="card"><p class="muted">Aún no hay sesiones. Elige un escenario y crea una nueva sesión; los participantes ingresarán con el código generado.</p></div>`}`;
    $('#newSession').onclick = async () => {
      const r = await emit('session:create', { scenarioId: $('#newSc').value });
      if (r.ok) watch(r.session.id);
    };
    $$('[data-open]').forEach((b) => (b.onclick = () => watch(b.dataset.open)));
    $$('[data-del]').forEach((b) => (b.onclick = () => { if (confirm('¿Eliminar la sesión y todo su registro?')) emit('session:delete', { id: b.dataset.del }); }));
  }

  function renderScenarios() {
    const c = $('#content');
    c.innerHTML = `<div class="row" style="margin-bottom:16px"><h2 style="margin:0">Escenarios</h2><span class="spacer"></span>
      <label class="btn" style="margin:0;color:var(--text);font-size:14px">⬆ Importar JSON<input type="file" id="imp" accept=".json,application/json" hidden></label>
      <button class="btn primary" id="newScn">＋ Nuevo escenario</button></div>
      <div class="grid-cards">${scenarios.map((s) => `<div class="card sc-card"><h3>${esc(s.title)}</h3><div class="muted small">${esc(s.organization)}</div><p>${esc((s.summary || '').slice(0, 180))}</p>
        <div class="row wrap small" style="margin-bottom:12px">${s.channels.map((c) => `<span class="ch-chip">${CHANNEL_TYPES[c.type].icon} ${esc(c.name)}</span>`).join('')}</div>
        <div class="muted small" style="margin-bottom:12px">${s.injects.length} injects · duración estimada ${Math.max(0, ...s.injects.map((i) => i.at))}+ min</div>
        <div class="row wrap"><button class="btn sm primary" data-edit="${s.id}">Editar</button><button class="btn sm" data-dup="${s.id}">Duplicar</button><button class="btn sm" data-exp="${s.id}">Exportar</button><button class="btn sm" data-ses="${s.id}">▶ Crear sesión</button><span class="spacer"></span><button class="btn sm danger" data-del="${s.id}">🗑</button></div></div>`).join('')}</div>`;
    $('#newScn').onclick = () => openEditor(null);
    $('#imp').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); delete data.id; const r = await emit('scenario:save', data); if (r.ok) { scenarios = r.scenarios; renderHome(); toast('Escenario importado', 'Escenarios', 'baja'); } }
      catch { toast('El archivo no es un JSON válido', 'Importar', 'alta'); }
    };
    $$('[data-edit]').forEach((b) => (b.onclick = () => openEditor(scenarios.find((s) => s.id === b.dataset.edit))));
    $$('[data-dup]').forEach((b) => (b.onclick = async () => { const s = JSON.parse(JSON.stringify(scenarios.find((x) => x.id === b.dataset.dup))); delete s.id; s.title += ' (copia)'; const r = await emit('scenario:save', s); if (r.ok) { scenarios = r.scenarios; renderHome(); } }));
    $$('[data-exp]').forEach((b) => (b.onclick = () => { const s = scenarios.find((x) => x.id === b.dataset.exp); download(`escenario-${s.title.replace(/\W+/g, '-').toLowerCase()}.json`, JSON.stringify(s, null, 2)); }));
    $$('[data-ses]').forEach((b) => (b.onclick = async () => { const r = await emit('session:create', { scenarioId: b.dataset.ses }); if (r.ok) watch(r.session.id); }));
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm('¿Eliminar este escenario? Las sesiones ya creadas no se verán afectadas.')) return; const r = await emit('scenario:delete', { id: b.dataset.del }); if (r.ok) { scenarios = r.scenarios; renderHome(); } }));
  }

  // ------------------------------------------------------------ editor de escenarios
  function openEditor(sc) {
    draft = sc ? JSON.parse(JSON.stringify(sc)) : {
      title: '', organization: '', summary: '', briefing: '', facilitatorNotes: '', noise: [],
      channels: Object.keys(CHANNEL_TYPES).map((t) => ({ id: t, type: t, name: CHANNEL_TYPES[t].label })), injects: [],
    };
    route = 'editor';
    renderEditor();
  }

  function collectGeneral() {
    if (!$('#eTitle')) return;
    draft.title = $('#eTitle').value; draft.organization = $('#eOrg').value; draft.summary = $('#eSummary').value;
    draft.briefing = $('#eBriefing').value; draft.facilitatorNotes = $('#eNotes').value;
    draft.noise = $('#eNoise').value.split('\n').map((x) => x.trim()).filter(Boolean);
    $$('[data-chname]').forEach((i) => { const c = draft.channels.find((x) => x.id === i.dataset.chname); if (c) c.name = i.value; });
  }

  function renderEditor() {
    const d = draft;
    const chName = (id) => { const c = d.channels.find((x) => x.id === id); return c ? `${CHANNEL_TYPES[c.type].icon} ${esc(c.name)}` : '<span style="color:#ff8095">(sin canal)</span>'; };
    d.injects.sort((a, b) => a.at - b.at);
    app.innerHTML = topbar(`<span class="muted">/ ${d.id ? 'Editar' : 'Nuevo'} escenario</span><div class="spacer"></div><button class="btn" id="cancel">Cancelar</button><button class="btn primary" id="save">💾 Guardar escenario</button>`) + `
    <div class="admin-wrap stack">
      <div class="card"><h3>1. Información general</h3><div class="form-grid">
        <div><label>Título del escenario</label><input type="text" id="eTitle" value="${esc(d.title)}" placeholder="Ej.: Accidente en planta industrial"></div>
        <div><label>Organización (nombre usado en comunicados y cuentas oficiales)</label><input type="text" id="eOrg" value="${esc(d.organization)}" placeholder="Ej.: Minera Andes del Sur"></div>
        <div class="full"><label>Resumen (visible para el administrador)</label><textarea id="eSummary" rows="2">${esc(d.summary)}</textarea></div>
        <div class="full"><label>Briefing inicial para participantes (contexto de la crisis)</label><textarea id="eBriefing" rows="6">${esc(d.briefing)}</textarea></div>
        <div class="full"><label>Notas del facilitador / criterios de evaluación (no visibles para participantes)</label><textarea id="eNotes" rows="3">${esc(d.facilitatorNotes)}</textarea></div>
      </div></div>

      <div class="card"><div class="row"><h3 style="margin:0">2. Canales disponibles</h3><span class="spacer"></span>
        <select id="addChType" style="width:auto">${Object.entries(CHANNEL_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select><button class="btn sm" id="addCh">＋ Agregar canal</button></div>
        <p class="muted small">Cada canal tiene un formato propio (noticias, publicaciones, oficios, correos o chat interno). Puedes crear varios del mismo tipo (p. ej. "Ministerio de Salud" y "Municipalidad").</p>
        <table class="tbl"><thead><tr><th>Tipo</th><th>Nombre visible</th><th>Injects</th><th></th></tr></thead><tbody>
        ${d.channels.map((c) => `<tr><td>${CHANNEL_TYPES[c.type].icon} ${CHANNEL_TYPES[c.type].label}</td><td><input type="text" data-chname="${c.id}" value="${esc(c.name)}"></td><td>${d.injects.filter((i) => i.channelId === c.id).length}</td><td style="text-align:right"><button class="btn sm danger" data-rmch="${c.id}">Quitar</button></td></tr>`).join('')}
        </tbody></table></div>

      <div class="card"><div class="row"><h3 style="margin:0">3. Injects (eventos programados)</h3><span class="spacer"></span><button class="btn sm primary" id="addInj" ${d.channels.length ? '' : 'disabled'}>＋ Nuevo inject</button></div>
        <p class="muted small">Un inject es un evento que llega a los participantes en el minuto indicado de la simulación: una noticia, un tuit viral, un oficio de la autoridad, un correo del directorio… Puedes exigir respuesta con plazo; si vence, la crisis escala automáticamente.</p>
        ${d.injects.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Min</th><th>Canal</th><th>Emisor</th><th>Contenido</th><th>Severidad</th><th>Respuesta</th><th>Impacto</th><th></th></tr></thead><tbody>
        ${d.injects.map((i, idx) => `<tr><td class="mono">${i.at}'</td><td>${chName(i.channelId)}</td><td>${esc(i.author)}</td><td><b>${esc(i.title)}</b><div class="muted small">${esc(i.body.slice(0, 110))}${i.body.length > 110 ? '…' : ''}</div></td>
          <td><span class="sev ${i.severity}">${SEV[i.severity]}</span></td><td>${i.requiresResponse ? `⏱ ${i.responseMinutes} min` : '—'}</td>
          <td class="small mono">${impactTxt(i.impact)}</td><td style="white-space:nowrap"><button class="btn sm" data-einj="${idx}">Editar</button> <button class="btn sm danger" data-rinj="${idx}">✕</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Sin injects todavía.</p>'}</div>

      <div class="card"><h3>4. Ruido ambiental en redes (opcional)</h3><p class="muted small">Durante la sesión aparecerán publicaciones aleatorias de usuarios; su frecuencia aumenta con la presión mediática. Escribe una por línea para personalizarlas (si no, se usan mensajes genéricos).</p>
        <textarea id="eNoise" rows="4">${esc((d.noise || []).join('\n'))}</textarea></div>
    </div>`;

    $('#cancel').onclick = () => { if (confirm('¿Descartar los cambios?')) { tab = 'scenarios'; renderHome(); } };
    $('#save').onclick = async () => {
      collectGeneral();
      if (!draft.title.trim()) return toast('Indica un título', 'Escenario', 'alta');
      if (!draft.channels.length) return toast('Agrega al menos un canal', 'Escenario', 'alta');
      const r = await emit('scenario:save', draft);
      if (r.ok) { scenarios = r.scenarios; toast('Escenario guardado', 'Escenarios', 'baja'); tab = 'scenarios'; renderHome(); }
    };
    $('#addCh').onclick = () => { collectGeneral(); const t = $('#addChType').value; draft.channels.push({ id: t + '-' + uid(), type: t, name: CHANNEL_TYPES[t].label }); renderEditor(); };
    $$('[data-rmch]').forEach((b) => (b.onclick = () => {
      collectGeneral();
      const used = draft.injects.filter((i) => i.channelId === b.dataset.rmch).length;
      if (used && !confirm(`Este canal tiene ${used} injects que también se eliminarán. ¿Continuar?`)) return;
      draft.channels = draft.channels.filter((c) => c.id !== b.dataset.rmch);
      draft.injects = draft.injects.filter((i) => i.channelId !== b.dataset.rmch);
      renderEditor();
    }));
    $('#addInj').onclick = () => { collectGeneral(); injectForm(null, draft.channels, (inj) => { draft.injects.push(inj); renderEditor(); }); };
    $$('[data-einj]').forEach((b) => (b.onclick = () => { collectGeneral(); const i = Number(b.dataset.einj); injectForm(draft.injects[i], draft.channels, (inj) => { draft.injects[i] = inj; renderEditor(); }); }));
    $$('[data-rinj]').forEach((b) => (b.onclick = () => { collectGeneral(); draft.injects.splice(Number(b.dataset.rinj), 1); renderEditor(); }));
  }

  const impactTxt = (im = {}) => {
    const p = [];
    if (im.reputacion) p.push(`Rep ${im.reputacion > 0 ? '+' : ''}${im.reputacion}`);
    if (im.presion) p.push(`Pres ${im.presion > 0 ? '+' : ''}${im.presion}`);
    if (im.autoridades) p.push(`Aut ${im.autoridades > 0 ? '+' : ''}${im.autoridades}`);
    return p.join(' · ') || '—';
  };

  // Formulario de inject (para el editor y para lanzar en vivo)
  function injectForm(inj, channels, onSave, { live: isLive = false } = {}) {
    const i = inj || { at: 0, channelId: channels[0].id, author: '', handle: '', title: '', body: '', severity: 'media', requiresResponse: false, responseMinutes: 5, impact: { reputacion: 0, presion: 0, autoridades: 0 }, imageUrl: '' };
    const m = modal(`<h2>${isLive ? '⚡ Lanzar inject en vivo' : inj ? 'Editar inject' : 'Nuevo inject'}</h2>
      <form id="injF" class="form-grid">
        ${isLive ? '' : `<div><label>Minuto de la simulación (T+)</label><input type="number" id="iAt" min="0" step="0.5" value="${i.at}"></div>`}
        <div class="${isLive ? 'full' : ''}"><label>Canal</label><select id="iCh">${channels.map((c) => `<option value="${c.id}" ${c.id === i.channelId ? 'selected' : ''}>${CHANNEL_TYPES[c.type].icon} ${esc(c.name)}</option>`).join('')}</select></div>
        <div><label>Emisor (medio, usuario, autoridad, persona)</label><input type="text" id="iAuthor" value="${esc(i.author)}" required></div>
        <div id="iHandleBox"><label>Usuario @ (solo redes)</label><input type="text" id="iHandle" value="${esc(i.handle)}"></div>
        <div class="full"><label>Título / asunto / titular</label><input type="text" id="iTitle" value="${esc(i.title)}"></div>
        <div class="full"><label>Contenido</label><textarea id="iBody" rows="5" required>${esc(i.body)}</textarea></div>
        <div><label>Severidad</label><select id="iSev">${Object.entries(SEV).map(([k, v]) => `<option value="${k}" ${k === i.severity ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Imagen (URL opcional)</label><input type="url" id="iImg" value="${esc(i.imageUrl || '')}" placeholder="https://…"></div>
        <div class="full row wrap"><label class="check"><input type="checkbox" id="iRR" ${i.requiresResponse ? 'checked' : ''}> Requiere respuesta del equipo</label>
          <span class="row" id="iRMbox"><span class="muted small">Plazo (min simulados)</span><input type="number" id="iRM" min="1" style="width:90px" value="${i.responseMinutes || 5}"></span></div>
        <div class="full"><label>Impacto al publicarse en los indicadores (valores negativos o positivos)</label>
          <div class="row"><span class="small muted">Reputación</span><input type="number" id="iRep" value="${i.impact?.reputacion || 0}"><span class="small muted">Presión</span><input type="number" id="iPre" value="${i.impact?.presion || 0}"><span class="small muted">Autoridades</span><input type="number" id="iAut" value="${i.impact?.autoridades || 0}"></div></div>
      </form>
      <div class="modal-foot"><button class="btn" id="iCancel">Cancelar</button><button class="btn primary" id="iOk">${isLive ? '⚡ Lanzar ahora' : 'Guardar'}</button></div>`);
    const syncVis = () => {
      const ch = channels.find((c) => c.id === $('#iCh', m).value);
      $('#iHandleBox', m).style.visibility = ch?.type === 'redes' ? 'visible' : 'hidden';
      $('#iRMbox', m).style.visibility = $('#iRR', m).checked ? 'visible' : 'hidden';
    };
    $('#iCh', m).onchange = syncVis; $('#iRR', m).onchange = syncVis; syncVis();
    $('#iCancel', m).onclick = m.close;
    $('#iOk', m).onclick = () => {
      if (!$('#iAuthor', m).value.trim() || !$('#iBody', m).value.trim()) return toast('Emisor y contenido son obligatorios', 'Inject', 'alta');
      onSave({
        id: i.id || 'inj-' + uid(),
        at: isLive ? 0 : Number($('#iAt', m).value) || 0,
        channelId: $('#iCh', m).value, author: $('#iAuthor', m).value.trim(), handle: $('#iHandle', m).value.trim().replace(/^@/, ''),
        title: $('#iTitle', m).value.trim(), body: $('#iBody', m).value.trim(), severity: $('#iSev', m).value, imageUrl: $('#iImg', m).value.trim(),
        requiresResponse: $('#iRR', m).checked, responseMinutes: Number($('#iRM', m).value) || 0,
        impact: { reputacion: Number($('#iRep', m).value) || 0, presion: Number($('#iPre', m).value) || 0, autoridades: Number($('#iAut', m).value) || 0 },
      });
      m.close();
    };
  }

  // ------------------------------------------------------------ sala de control
  async function watch(id) {
    const r = await emit('session:watch', { id });
    if (!r.ok) return renderHome();
    live = r.session; clock.set(live.clock); route = 'control'; filter = 'all';
    renderControl(true);
  }

  function renderControl(full = false) {
    const s = live;
    const sc = s.scenario;
    if (full || !$('#ctl')) {
      app.innerHTML = topbar(`<span class="muted">/</span><b class="grow" style="min-width:140px">${esc(s.name)}</b>
        <span class="code-box" id="code" title="Copiar enlace de ingreso">${esc(s.code)}</span>
        <span id="cStatus" class="pill"></span><span class="clock" id="cClock"></span>
        <div class="row" id="cButtons"></div>
        <select id="speed" style="width:auto" title="Velocidad de la simulación">${[1, 2, 5, 10].map((x) => `<option value="${x}">${x}×</option>`).join('')}</select>
        <button class="btn sm" id="report">📊 Informe</button><button class="btn sm ghost" id="back">← Sesiones</button>`) + `
        <div class="control" id="ctl">
          <div class="col-l"><div class="row" style="margin-bottom:10px"><h4 style="margin:0">Línea de tiempo</h4><span class="spacer"></span><button class="btn sm primary" id="liveInj">⚡ Inject en vivo</button></div><div id="timeline"></div></div>
          <div class="col-c" id="center"></div>
          <div class="col-r" id="right"></div>
        </div>`;
      $('#code').onclick = () => { const url = `${location.origin}/play.html?code=${s.code}`; navigator.clipboard?.writeText(url); toast(url, 'Enlace de ingreso copiado', 'baja'); };
      $('#speed').onchange = (e) => emit('session:control', { id: live.id, action: 'speed', speed: Number(e.target.value) });
      $('#report').onclick = openReport;
      $('#back').onclick = () => { live = null; tab = 'sessions'; renderHome(); };
      $('#liveInj').onclick = () => injectForm(null, live.scenario.channels, (inj) => emit('session:inject', { id: live.id, custom: inj }), { live: true });
    }
    $('#cStatus').className = 'pill ' + s.status; $('#cStatus').textContent = STATUS[s.status];
    $('#speed').value = String(s.speed);
    const btn = (a, label, cls = '') => `<button class="btn sm ${cls}" data-act="${a}">${label}</button>`;
    $('#cButtons').innerHTML =
      s.status === 'lobby' ? btn('start', '▶ Iniciar', 'ok') :
      s.status === 'running' ? btn('pause', '⏸ Pausar', 'warn') + btn('end', '⏹ Finalizar', 'danger') :
      s.status === 'paused' ? btn('resume', '▶ Reanudar', 'ok') + btn('end', '⏹ Finalizar', 'danger') :
      btn('reset', '↺ Reiniciar sesión');
    $$('#cButtons [data-act]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'end' && !confirm('¿Finalizar la simulación? Los participantes verán el debriefing.')) return;
      if (a === 'reset' && !confirm('Se borrará todo el registro de la sesión (los participantes se mantienen). ¿Continuar?')) return;
      emit('session:control', { id: live.id, action: a });
    }));

    // línea de tiempo
    const now = clock.now();
    const nextInj = sc.injects.find((i) => !s.fired.includes(i.id) && !s.skipped.includes(i.id));
    $('#timeline').innerHTML = sc.injects.map((i) => {
      const ch = sc.channels.find((c) => c.id === i.channelId);
      const fired = s.fired.includes(i.id), skipped = s.skipped.includes(i.id);
      return `<div class="inj-row ${fired || skipped ? 'fired' : ''} ${nextInj === i ? 'next' : ''}"><div class="at">${i.at}'</div>
        <div class="grow"><div class="small">${CHANNEL_TYPES[ch?.type]?.icon || ''} <b>${esc(i.author)}</b> ${i.severity !== 'baja' ? `<span class="sev ${i.severity}">${SEV[i.severity]}</span>` : ''}</div>
        <div class="small muted">${esc(i.title || i.body.slice(0, 60))}</div>
        <div class="small" style="margin-top:4px">${fired ? '✅ Lanzado' : skipped ? '⏭ Omitido' : `<span data-eta="${i.at * 60000}"></span>`}</div></div>
        ${!fired && s.status !== 'ended' ? `<div class="stack" style="text-align:right">${skipped ? '' : `<button class="btn sm" data-fire="${i.id}" title="Lanzar ahora">⚡</button><button class="btn sm ghost" data-skip="${i.id}" title="Omitir">⏭</button>`}</div>` : ''}</div>`;
    }).join('') || '<p class="muted small">El escenario no tiene injects programados.</p>';
    $$('[data-fire]').forEach((b) => (b.onclick = () => emit('session:inject', { id: live.id, injectId: b.dataset.fire })));
    $$('[data-skip]').forEach((b) => (b.onclick = () => emit('session:inject', { id: live.id, injectId: b.dataset.skip, skip: true })));

    // feed central
    const center = $('#center');
    const scroll = center.scrollTop;
    const responses = s.feed.filter((f) => f.kind === 'response').length;
    let html = `<div class="filter-bar"><button class="btn sm ${filter === 'all' ? 'active' : ''}" data-f="all">Todo</button><button class="btn sm ${filter === 'team' ? 'active' : ''}" data-f="team">Respuestas del equipo (${responses})</button>
      ${sc.channels.map((c) => `<button class="btn sm ${filter === c.id ? 'active' : ''}" data-f="${c.id}">${CHANNEL_TYPES[c.type].icon} ${esc(c.name)}</button>`).join('')}</div>`;
    const extra = (it) => adminExtra(it);
    if (filter === 'team') {
      const list = s.feed.filter((f) => f.kind === 'response').reverse();
      html += list.map((it) => renderItem(it, sc.channels.find((c) => c.id === it.channelId), { extra })).join('') || '<p class="muted">El equipo aún no ha respondido.</p>';
    } else {
      const chans = filter === 'all' ? sc.channels : sc.channels.filter((c) => c.id === filter);
      const roots = [];
      for (const ch of chans) {
        const th = thread(s.feed, ch.id);
        for (const r of th.roots) roots.push({ r, ch, th });
      }
      roots.sort((a, b) => b.r.t - a.r.t || b.r.at - a.r.at);
      html += roots.map(({ r, ch, th }) => {
        if (ch.type === 'interno') return `<div class="item t-interno"><div class="small muted" style="margin-bottom:6px">💬 ${esc(ch.name)}</div>${renderChat(r, null)}${adminExtra(r)}</div>`;
        return `<div class="small muted" style="margin:0 0 4px 2px">${CHANNEL_TYPES[ch.type].icon} ${esc(ch.name)}</div>` + renderItem(r, ch, { extra, children: th.childrenOf(r.id), childrenOf: th.childrenOf });
      }).join('') || `<div class="card"><p class="muted">${s.status === 'lobby' ? 'Comparte el código <b class="mono">' + esc(s.code) + '</b> con los participantes y presiona ▶ Iniciar cuando estén listos.' : 'Sin actividad todavía.'}</p></div>`;
    }
    center.innerHTML = html;
    CS.markFresh(center);
    center.scrollTop = scroll;
    $$('[data-f]', center).forEach((b) => (b.onclick = () => { filter = b.dataset.f; renderControl(); }));
    $$('[data-rate]', center).forEach((b) => (b.onclick = () => rateForm(b.dataset.rate)));
    $$('[data-hide]', center).forEach((b) => (b.onclick = () => emit('session:hide', { id: live.id, itemId: b.dataset.hide, hidden: b.dataset.v === '1' })));

    // columna derecha
    const pending = s.feed.filter((f) => f.requiresResponse && !f.answeredBy.length);
    const noteVal = $('#noteT')?.value || '';
    const noteFocus = document.activeElement?.id === 'noteT';
    const rScroll = $('#right').scrollTop;
    $('#right').innerHTML = `
      <h4>Indicadores</h4>${metersHTML(s.metrics)}<div style="margin-top:6px">${chartSVG(s.history, now)}</div>
      <button class="btn sm" id="adjust" style="margin-top:8px">Ajustar indicadores</button>
      <h4 style="margin-top:20px">Configuración</h4>
      <label class="check"><input type="checkbox" data-cfg="autoReactions" ${s.config.autoReactions ? 'checked' : ''}> Reacciones automáticas (público, medios, autoridades)</label>
      <label class="check" style="margin-top:6px"><input type="checkbox" data-cfg="ambientNoise" ${s.config.ambientNoise ? 'checked' : ''}> Ruido ambiental en redes</label>
      <label class="check" style="margin-top:6px"><input type="checkbox" data-cfg="showMetrics" ${s.config.showMetrics ? 'checked' : ''}> Mostrar indicadores a participantes</label>
      <h4 style="margin-top:20px">Participantes (${s.participants.length})</h4>
      ${s.participants.map((p) => `<div class="row small" style="margin-bottom:5px">${p.sockets > 0 ? '🟢' : '⚪'} <b>${esc(p.name)}</b><span class="muted">${esc(p.role)}</span><span class="spacer"></span><span class="muted">${s.feed.filter((f) => f.participantId === p.id).length} msj</span></div>`).join('') || '<p class="muted small">Nadie se ha unido aún.</p>'}
      <h4 style="margin-top:20px">Pendientes del equipo (${pending.length})</h4>
      ${pending.map((f) => `<div class="small" style="margin-bottom:5px"><span class="mono" data-deadline="${f.deadlineMs}"></span> <b>${esc(f.author)}</b> — ${esc((f.title || f.body).slice(0, 50))}</div>`).join('') || '<p class="muted small">Ninguno.</p>'}
      <h4 style="margin-top:20px">Notas del facilitador</h4>
      ${sc.facilitatorNotes ? `<div class="small muted" style="white-space:pre-wrap;margin-bottom:8px">${esc(sc.facilitatorNotes)}</div>` : ''}
      ${s.notes.map((n) => `<div class="small" style="margin-bottom:5px"><span class="mono muted">${fmtClock(n.t)}</span> ${esc(n.text)}</div>`).join('')}
      <form id="noteF" class="row" style="margin-top:6px"><input type="text" id="noteT" placeholder="Anotar observación…"><button class="btn sm">＋</button></form>`;
    $('#noteT').value = noteVal;
    if (noteFocus) $('#noteT').focus();
    $('#right').scrollTop = rScroll;
    $('#adjust').onclick = adjustForm;
    $$('[data-cfg]').forEach((c) => (c.onchange = () => emit('session:config', { id: live.id, config: { [c.dataset.cfg]: c.checked } })));
    $('#noteF').onsubmit = (e) => { e.preventDefault(); const t = $('#noteT').value.trim(); if (t) { $('#noteT').value = ''; emit('session:note', { id: live.id, text: t }); } };
    tick();
  }

  function adminExtra(it) {
    let h = '';
    if (it.analysis) {
      const a = it.analysis;
      h += `<div class="analysis"><div class="row wrap"><span>Tono: <span class="score ${a.label}">${a.label} ${a.score > 0 ? '+' : ''}${a.score}</span></span>
        ${it.impact ? `<span class="muted mono">${impactTxt({ reputacion: Math.round(it.impact.reputacion), presion: Math.round(it.impact.presion), autoridades: Math.round(it.impact.autoridades) })}</span>` : ''}
        <span class="spacer"></span>${it.rating ? `<span>${it.rating.delta > 0 ? '👍 +' : it.rating.delta < 0 ? '👎 ' : ''}${it.rating.delta || ''}</span>` : ''}
        <button class="btn sm" data-rate="${it.id}">Evaluar</button></div>
        ${a.strengths.length ? `<div style="margin-top:4px">✅ ${a.strengths.map(esc).join(' · ')}</div>` : ''}${a.risks.length ? `<div style="margin-top:2px">⚠️ ${a.risks.map(esc).join(' · ')}</div>` : ''}
        ${it.rating?.note ? `<div style="margin-top:4px"><b>Feedback:</b> ${esc(it.rating.note)}</div>` : ''}</div>`;
    } else if (it.kind === 'response') {
      h += `<div class="analysis row"><span class="muted">Mensaje interno</span><span class="spacer"></span><button class="btn sm" data-rate="${it.id}">Evaluar</button>${it.rating?.note ? `<span>📝 ${esc(it.rating.note)}</span>` : ''}</div>`;
    } else if (it.kind !== 'response') {
      h += `<div class="actions" style="margin-top:6px"><button class="btn sm ghost" data-hide="${it.id}" data-v="${it.hidden ? 0 : 1}">${it.hidden ? '👁 Mostrar a participantes' : '🙈 Ocultar a participantes'}</button></div>`;
    }
    return h;
  }

  function rateForm(itemId) {
    const it = live.feed.find((f) => f.id === itemId);
    const m = modal(`<h2>Evaluar respuesta</h2><div class="muted small">${esc(it.participantName)} · ${fmtClock(it.t)}</div>
      <div class="card" style="margin:10px 0;white-space:pre-wrap">${it.title ? `<b>${esc(it.title)}</b>\n` : ''}${esc(it.body)}</div>
      <label>Ajuste de reputación (−10 a +10)</label><input type="range" id="rD" min="-10" max="10" value="${it.rating?.delta || 0}"><div class="mono" id="rV" style="text-align:center"></div>
      <label style="margin-top:10px">Retroalimentación (visible en el debriefing)</label><textarea id="rN" rows="3">${esc(it.rating?.note || '')}</textarea>
      <div class="modal-foot"><button class="btn" id="rC">Cancelar</button><button class="btn primary" id="rO">Guardar</button></div>`);
    const v = () => ($('#rV', m).textContent = ($('#rD', m).value > 0 ? '+' : '') + $('#rD', m).value);
    $('#rD', m).oninput = v; v();
    $('#rC', m).onclick = m.close;
    $('#rO', m).onclick = () => { emit('session:rate', { id: live.id, itemId, delta: Number($('#rD', m).value), note: $('#rN', m).value }); m.close(); };
  }

  function adjustForm() {
    const m = modal(`<h2>Ajustar indicadores</h2><p class="muted small">Úsalo para reflejar el efecto de decisiones que el motor no captura (p. ej. una buena entrevista en vivo).</p>
      ${METRICS.map((d) => `<label style="margin-top:12px">${d.label}: <b id="v-${d.key}">${live.metrics[d.key]}</b></label><input type="range" min="0" max="100" id="m-${d.key}" value="${live.metrics[d.key]}" style="width:100%">`).join('')}
      <div class="modal-foot"><button class="btn" id="aC">Cancelar</button><button class="btn primary" id="aO">Aplicar</button></div>`);
    METRICS.forEach((d) => ($(`#m-${d.key}`, m).oninput = (e) => ($(`#v-${d.key}`, m).textContent = e.target.value)));
    $('#aC', m).onclick = m.close;
    $('#aO', m).onclick = () => { emit('session:metrics', { id: live.id, metrics: Object.fromEntries(METRICS.map((d) => [d.key, Number($(`#m-${d.key}`, m).value)])) }); m.close(); };
  }

  function tick() {
    if (route !== 'control' || !live) return;
    const now = clock.now();
    $('#cClock') && ($('#cClock').textContent = fmtClock(now));
    $$('[data-eta]').forEach((el) => { const d = Number(el.dataset.eta) - now; el.textContent = d > 0 ? `en ${fmtClock(d, false)}` : 'inminente'; el.className = 'muted'; });
    $$('[data-deadline]').forEach((el) => { const d = Number(el.dataset.deadline) - now; el.textContent = d >= 0 ? '⏱' + fmtClock(d, false) : 'VENCIDO'; el.style.color = d < 0 ? '#ff6b85' : d < 120000 ? '#ffb020' : ''; });
  }
  setInterval(tick, 500);

  // ------------------------------------------------------------ informe
  function openReport() {
    const s = live, sc = s.scenario;
    const chOf = (id) => sc.channels.find((c) => c.id === id);
    const required = s.feed.filter((f) => f.requiresResponse);
    const answered = required.filter((f) => f.answeredBy.length);
    const times = answered.map((f) => f.answeredAt - f.t).filter((x) => x >= 0);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const pub = s.feed.filter((f) => f.kind === 'response' && f.analysis);
    const first = pub[0];
    const people = s.participants.map((p) => {
      const mine = s.feed.filter((f) => f.participantId === p.id);
      const pubs = mine.filter((f) => f.analysis);
      const avgS = pubs.length ? pubs.reduce((a, f) => a + f.analysis.score, 0) / pubs.length : null;
      return { p, total: mine.length, pubs: pubs.length, avgS, rated: mine.filter((f) => f.rating).map((f) => f.rating.delta).reduce((a, b) => a + b, 0) };
    });
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe — ${esc(s.name)}</title><link rel="stylesheet" href="${location.origin}/css/styles.css"></head><body><div class="debrief">
      <div class="row no-print"><button class="btn" onclick="print()">🖨 Imprimir / PDF</button></div>
      <h1 style="margin-top:14px">Informe de simulación</h1>
      <p class="muted">${esc(sc.title)} · ${esc(sc.organization)} · Sesión ${esc(s.code)} · ${new Date(s.createdAt).toLocaleString('es')} · Duración simulada ${fmtClock(clock.now())}</p>
      <div class="kpis">
        ${METRICS.map((m) => `<div class="kpi"><div class="v" style="color:${m.color}">${s.metrics[m.key]}</div><div class="l">${m.label} final</div></div>`).join('')}
        <div class="kpi"><div class="v">${answered.length}/${required.length}</div><div class="l">Requerimientos respondidos</div></div>
        <div class="kpi"><div class="v">${avg != null ? fmtClock(avg, false) : '—'}</div><div class="l">Tiempo medio de respuesta</div></div>
        <div class="kpi"><div class="v">${first ? fmtClock(first.t, false) : '—'}</div><div class="l">Primera declaración pública</div></div>
        <div class="kpi"><div class="v">${pub.length}</div><div class="l">Mensajes públicos emitidos</div></div>
      </div>
      <div class="card"><h3>Evolución de indicadores</h3>${chartSVG(s.history, clock.now(), { wide: true })}</div>
      <h2 style="margin-top:24px">Participantes</h2>
      <div class="card" style="padding:0"><table class="tbl"><thead><tr><th>Nombre</th><th>Rol</th><th>Mensajes</th><th>Públicos</th><th>Tono promedio</th><th>Evaluación facilitador</th></tr></thead><tbody>
      ${people.map((x) => `<tr><td>${esc(x.p.name)}</td><td>${esc(x.p.role)}</td><td>${x.total}</td><td>${x.pubs}</td><td>${x.avgS == null ? '—' : x.avgS.toFixed(2)}</td><td>${x.rated > 0 ? '+' : ''}${x.rated}</td></tr>`).join('')}</tbody></table></div>
      <h2 style="margin-top:24px">Cronología completa</h2>
      <div class="card" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>Tiempo</th><th>Canal</th><th>Emisor</th><th>Contenido</th><th>Evaluación</th></tr></thead><tbody>
      ${s.feed.map((f) => { const ch = chOf(f.channelId); return `<tr><td class="mono">${fmtClock(f.t)}</td><td>${CHANNEL_TYPES[ch?.type]?.icon || ''} ${esc(ch?.name || '')}</td>
        <td>${f.kind === 'response' ? `<b>${esc(f.participantName)}</b><div class="muted small">${esc(f.role)}</div>` : esc(f.author)}${f.kind === 'system' ? '<div class="small" style="color:#ff8095">escalamiento</div>' : ''}</td>
        <td>${f.title ? `<b>${esc(f.title)}</b><br>` : ''}<span style="white-space:pre-wrap">${esc(f.body)}</span>${f.requiresResponse ? `<div class="small muted">${f.answeredBy.length ? '✅ respondido en ' + fmtClock(f.answeredAt - f.t, false) : '❌ sin respuesta'}</div>` : ''}</td>
        <td>${f.analysis ? `<span class="score ${f.analysis.label}">${f.analysis.label} ${f.analysis.score}</span><div class="small">${f.analysis.strengths.map(esc).join('<br>')}</div><div class="small" style="color:#ff8095">${f.analysis.risks.map(esc).join('<br>')}</div>` : ''}${f.rating ? `<div class="small"><b>Facilitador (${f.rating.delta > 0 ? '+' : ''}${f.rating.delta}):</b> ${esc(f.rating.note)}</div>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${s.notes.length ? `<h2 style="margin-top:24px">Observaciones del facilitador</h2><div class="card">${s.notes.map((n) => `<div style="margin-bottom:6px"><span class="mono muted">${fmtClock(n.t)}</span> ${esc(n.text)}</div>`).join('')}</div>` : ''}
      ${sc.facilitatorNotes ? `<h2 style="margin-top:24px">Criterios de evaluación</h2><div class="card" style="white-space:pre-wrap">${esc(sc.facilitatorNotes)}</div>` : ''}
    </div></body></html>`;
    const m = modal(`<h2>📊 Informe de la sesión</h2><p class="muted">Genera un informe con indicadores, cronología completa, evaluación de cada respuesta y observaciones.</p>
      <div class="row wrap"><button class="btn primary" id="rOpen">Abrir informe imprimible</button><button class="btn" id="rHtml">⬇ Descargar HTML</button><button class="btn" id="rJson">⬇ Exportar datos (JSON)</button><button class="btn" id="rCsv">⬇ Cronología (CSV)</button></div>
      <div class="modal-foot"><button class="btn" id="rClose">Cerrar</button></div>`);
    $('#rOpen', m).onclick = () => { const w = window.open('', '_blank'); w.document.write(html); w.document.close(); };
    $('#rHtml', m).onclick = () => download(`informe-${s.code}.html`, html, 'text/html');
    $('#rJson', m).onclick = () => download(`sesion-${s.code}.json`, JSON.stringify(s, null, 2));
    $('#rCsv', m).onclick = () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['tiempo', 'canal', 'tipo', 'emisor', 'rol', 'titulo', 'contenido', 'tono', 'puntaje', 'evaluacion_facilitador', 'feedback']];
      for (const f of s.feed) rows.push([fmtClock(f.t), chOf(f.channelId)?.name, f.kind, f.kind === 'response' ? f.participantName : f.author, f.role || '', f.title, f.body, f.analysis?.label || '', f.analysis?.score ?? '', f.rating?.delta ?? '', f.rating?.note || '']);
      download(`cronologia-${s.code}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
    };
    $('#rClose', m).onclick = m.close;
  }

  if (!sessionStorage.getItem(PW)) renderLogin();
  else app.innerHTML = '<div class="center-page"><p class="muted">Conectando…</p></div>';
})();
