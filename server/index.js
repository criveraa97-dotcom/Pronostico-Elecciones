// Simulador de Gestión de Crisis — servidor en tiempo real (Express + Socket.IO)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const engine = require('./engine');
const samples = require('./sampleScenarios');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------- persistencia
let db = { scenarios: [], sessions: [] };
function load() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.scenarios ||= [];
    db.sessions ||= [];
  } catch {
    db = { scenarios: JSON.parse(JSON.stringify(samples)), sessions: [] };
  }
  // Las sesiones en curso quedan pausadas tras un reinicio del servidor
  for (const s of db.sessions) if (s.status === 'running') { s.elapsedMs = elapsed(s); s.status = 'paused'; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 400);
}

// ---------------------------------------------------------------- utilidades
const uid = () => crypto.randomBytes(6).toString('hex');
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const str = (v, max = 5000) => String(v ?? '').slice(0, max);
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from({ length: 6 }, () => A[crypto.randomInt(A.length)]).join('');
  while (db.sessions.some((s) => s.code === c));
  return c;
}
function elapsed(s) {
  return s.elapsedMs + (s.status === 'running' ? (Date.now() - s.resumedAt) * s.speed : 0);
}
const findSession = (id) => db.sessions.find((s) => s.id === id);
const findScenario = (id) => db.scenarios.find((s) => s.id === id);
const channelOf = (s, id) => s.scenario.channels.find((c) => c.id === id);

function sanitizeScenario(input) {
  const channels = (Array.isArray(input.channels) ? input.channels : []).slice(0, 20).map((c) => ({
    id: str(c.id || uid(), 40),
    type: ['prensa', 'redes', 'autoridades', 'stakeholders', 'interno'].includes(c.type) ? c.type : 'prensa',
    name: str(c.name || c.type, 60),
  }));
  const ids = new Set(channels.map((c) => c.id));
  const injects = (Array.isArray(input.injects) ? input.injects : []).slice(0, 300).map((i) => ({
    id: str(i.id || uid(), 40),
    at: Math.max(0, Number(i.at) || 0),
    channelId: ids.has(i.channelId) ? i.channelId : channels[0]?.id,
    author: str(i.author, 120),
    handle: str(i.handle, 60).replace(/^@/, ''),
    title: str(i.title, 200),
    body: str(i.body),
    severity: ['baja', 'media', 'alta', 'critica'].includes(i.severity) ? i.severity : 'media',
    requiresResponse: !!i.requiresResponse,
    responseMinutes: Math.max(0, Number(i.responseMinutes) || 0),
    impact: {
      reputacion: Number(i.impact?.reputacion) || 0,
      presion: Number(i.impact?.presion) || 0,
      autoridades: Number(i.impact?.autoridades) || 0,
    },
    imageUrl: str(i.imageUrl, 1000),
  }));
  injects.sort((a, b) => a.at - b.at);
  return {
    id: input.id ? str(input.id, 40) : uid(),
    title: str(input.title || 'Escenario sin título', 200),
    organization: str(input.organization || 'Organización', 120),
    summary: str(input.summary, 2000),
    briefing: str(input.briefing, 8000),
    facilitatorNotes: str(input.facilitatorNotes, 8000),
    noise: (Array.isArray(input.noise) ? input.noise : []).map((x) => str(x, 500)).filter(Boolean).slice(0, 50),
    channels,
    injects,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------- vistas
function sessionSummary(s) {
  return {
    id: s.id, code: s.code, name: s.name, status: s.status, createdAt: s.createdAt,
    scenarioTitle: s.scenario.title, organization: s.scenario.organization,
    participants: s.participants.length, online: s.participants.filter((p) => p.sockets > 0).length,
  };
}
function clock(s) {
  return { status: s.status, elapsedMs: elapsed(s), serverNow: Date.now(), speed: s.speed };
}
function adminView(s) {
  return { ...s, clock: clock(s) };
}
function participantView(s) {
  const ended = s.status === 'ended';
  const { scenario } = s;
  return {
    id: s.id, code: s.code, name: s.name, status: s.status, config: s.config, clock: clock(s),
    scenario: { title: scenario.title, organization: scenario.organization, summary: scenario.summary, briefing: scenario.briefing, channels: scenario.channels },
    participants: s.participants.map((p) => ({ id: p.id, name: p.name, role: p.role, online: p.sockets > 0 })),
    metrics: s.config.showMetrics || ended ? s.metrics : null,
    history: s.config.showMetrics || ended ? s.history : [],
    feed: s.feed.map((f) => (ended ? f : { ...f, analysis: undefined, rating: undefined, facilitatorOnly: undefined })).filter((f) => !f.hidden),
  };
}
function broadcast(s, { list = false } = {}) {
  io.to('a:' + s.id).emit('session:full', adminView(s));
  io.to('s:' + s.id).emit('session:view', participantView(s));
  if (list) io.to('admins').emit('sessions:list', db.sessions.map(sessionSummary));
  save();
}

// ---------------------------------------------------------------- lógica de simulación
function applyImpact(s, impact = {}) {
  s.metrics.reputacion = clamp(s.metrics.reputacion + (impact.reputacion || 0));
  s.metrics.presion = clamp(s.metrics.presion + (impact.presion || 0));
  s.metrics.autoridades = clamp(s.metrics.autoridades + (impact.autoridades || 0));
}

function pushItem(s, item) {
  const full = {
    id: uid(), t: elapsed(s), at: Date.now(), kind: 'inject', author: '', handle: '', title: '', body: '',
    severity: 'media', requiresResponse: false, deadlineMs: null, answeredBy: [], escalated: false,
    replyTo: null, likes: 0, shares: 0, ...item,
  };
  s.feed.push(full);
  return full;
}

function fireInject(s, inj, { manual = false } = {}) {
  const item = pushItem(s, {
    kind: 'inject', injectId: inj.id || null, channelId: inj.channelId, author: inj.author, handle: inj.handle,
    title: inj.title, body: inj.body, severity: inj.severity, imageUrl: inj.imageUrl || '',
    requiresResponse: !!inj.requiresResponse && inj.responseMinutes > 0,
    responseMinutes: inj.responseMinutes || 0,
    manual,
  });
  if (item.requiresResponse) item.deadlineMs = item.t + inj.responseMinutes * 60000;
  if (channelOf(s, item.channelId)?.type === 'redes') {
    item.likes = Math.round(50 + Math.random() * 900 * (item.severity === 'critica' ? 3 : 1));
    item.shares = Math.round(item.likes * (0.3 + Math.random() * 0.5));
  }
  applyImpact(s, inj.impact);
  if (inj.id && !s.fired.includes(inj.id)) s.fired.push(inj.id);
  io.to('s:' + s.id).emit('alert', { itemId: item.id, channelId: item.channelId, severity: item.severity, title: item.title || item.body.slice(0, 80), author: item.author });
  return item;
}

function later(s, ms, fn) {
  setTimeout(() => {
    const cur = findSession(s.id);
    if (!cur || cur.status === 'ended') return;
    fn(cur);
    broadcast(cur);
  }, ms / Math.max(1, s.speed));
}

function handleResponse(s, p, { channelId, title, body, replyTo, kind }) {
  const ch = channelOf(s, channelId);
  if (!ch) throw new Error('Canal no válido');
  body = str(body).trim();
  title = str(title, 200).trim();
  if (!body) throw new Error('El mensaje está vacío');
  const now = elapsed(s);
  const target = replyTo ? s.feed.find((f) => f.id === replyTo) : null;
  let onTime = null;
  if (target?.requiresResponse) onTime = target.deadlineMs == null || now <= target.deadlineMs;
  const analysis = ch.type === 'interno' ? null : engine.analyze(`${title}\n${body}`, ch.type, { isReply: !!target, onTime });
  const item = pushItem(s, {
    kind: 'response', subtype: str(kind, 40) || 'mensaje', channelId, title, body,
    author: ch.type === 'interno' ? p.name : s.scenario.organization,
    handle: ch.type === 'redes' ? s.scenario.organization.normalize('NFD').replace(/[^A-Za-z0-9]/g, '') : '',
    participantId: p.id, participantName: p.name, role: p.role,
    replyTo: target ? target.id : null, analysis, rating: null, severity: 'baja',
  });
  if (target) {
    target.answeredBy.push(item.id);
    if (target.answeredAt == null) target.answeredAt = now;
  }
  if (!analysis) return item;

  // impacto inmediato en indicadores
  const w = engine.WEIGHT[ch.type] || 0;
  const imp = { reputacion: analysis.score * w, presion: 0, autoridades: 0 };
  if (ch.type === 'prensa' || ch.type === 'redes') imp.presion = analysis.label === 'positivo' ? -6 : analysis.label === 'negativo' ? 6 : -2;
  if (ch.type === 'autoridades') imp.autoridades = analysis.score * 12;
  if (onTime === false) imp.reputacion -= 1;
  applyImpact(s, imp);
  item.impact = imp;

  if (!s.config.autoReactions) return item;
  const ctx = { org: s.scenario.organization };
  if (ch.type === 'redes') {
    later(s, 2500 + Math.random() * 2500, (cur) => {
      const r = engine.socialReactions(analysis, ctx);
      const it = cur.feed.find((f) => f.id === item.id);
      if (it) { it.likes = r.likes; it.shares = r.shares; }
      r.comments.forEach((c, i) => pushItem(cur, { kind: 'reaction', channelId, author: c.author, handle: c.handle, body: c.body, replyTo: item.id, severity: 'baja', likes: Math.round(Math.random() * 60) }));
    });
  } else if (ch.type === 'prensa') {
    later(s, 6000 + Math.random() * 4000, (cur) => {
      const h = engine.mediaHeadline(analysis, ctx, title);
      pushItem(cur, { kind: 'reaction', channelId, ...h, severity: analysis.label === 'negativo' ? 'alta' : 'media', reactionTo: item.id });
      io.to('s:' + cur.id).emit('alert', { channelId, severity: 'media', title: h.title, author: h.author });
    });
  } else if (ch.type === 'autoridades') {
    const authority = target?.author || s.feed.slice().reverse().find((f) => f.channelId === channelId && f.kind === 'inject')?.author;
    later(s, 7000 + Math.random() * 4000, (cur) => {
      const r = engine.authorityReply(analysis, authority);
      pushItem(cur, { kind: 'reaction', channelId, ...r, replyTo: item.id, severity: analysis.label === 'positivo' ? 'baja' : 'alta' });
      io.to('s:' + cur.id).emit('alert', { channelId, severity: 'media', title: r.title, author: r.author });
    });
  } else if (ch.type === 'stakeholders') {
    const who = target?.author || s.feed.slice().reverse().find((f) => f.channelId === channelId && f.kind === 'inject')?.author;
    later(s, 6000 + Math.random() * 4000, (cur) => {
      const r = engine.stakeholderReply(analysis, who);
      pushItem(cur, { kind: 'reaction', channelId, ...r, replyTo: item.id, severity: 'media' });
      io.to('s:' + cur.id).emit('alert', { channelId, severity: 'media', title: r.title, author: r.author });
    });
  }
  return item;
}

function tick() {
  for (const s of db.sessions) {
    if (s.status !== 'running') continue;
    const now = elapsed(s);
    let changed = false;

    for (const inj of s.scenario.injects) {
      if (!s.fired.includes(inj.id) && !s.skipped.includes(inj.id) && inj.at * 60000 <= now) { fireInject(s, inj); changed = true; }
    }

    const ctx = { org: s.scenario.organization };
    for (const f of s.feed) {
      if (f.requiresResponse && !f.escalated && f.answeredBy.length === 0 && f.deadlineMs != null && now > f.deadlineMs) {
        f.escalated = true;
        const ch = channelOf(s, f.channelId);
        const e = engine.escalation(ch?.type, ctx, f);
        const it = pushItem(s, { kind: 'system', subtype: 'escalamiento', channelId: f.channelId, ...e, severity: 'alta', reactionTo: f.id });
        applyImpact(s, { reputacion: -5, presion: 8, autoridades: ch?.type === 'autoridades' ? -10 : 0 });
        io.to('s:' + s.id).emit('alert', { itemId: it.id, channelId: f.channelId, severity: 'alta', title: e.title || e.body.slice(0, 80), author: e.author });
        changed = true;
      }
    }

    // cada minuto simulado: ruido ambiental, evolución de presión e histórico
    const minute = Math.floor(now / 60000);
    if (minute > s.lastMinute) {
      s.lastMinute = minute;
      const pending = s.feed.filter((f) => f.requiresResponse && f.answeredBy.length === 0).length;
      applyImpact(s, { presion: pending ? pending * 1.5 : -2, reputacion: pending > 2 ? -1 : 0 });
      const redes = s.scenario.channels.find((c) => c.type === 'redes');
      if (s.config.ambientNoise && redes && Math.random() < 0.25 + s.metrics.presion / 150) {
        const a = engine.ambientPost(ctx, s.scenario.noise || []);
        pushItem(s, { kind: 'reaction', subtype: 'ambiente', channelId: redes.id, ...a, severity: 'baja', likes: Math.round(Math.random() * 300), shares: Math.round(Math.random() * 120) });
      }
      s.history.push({ t: minute * 60000, ...s.metrics });
      changed = true;
    }
    if (changed) broadcast(s);
  }
}

function createSession(scenario, name) {
  const s = {
    id: uid(), code: makeCode(), name: str(name || scenario.title, 200), createdAt: Date.now(),
    status: 'lobby', elapsedMs: 0, resumedAt: null, speed: 1, lastMinute: -1,
    scenario: JSON.parse(JSON.stringify(scenario)),
    config: { autoReactions: true, ambientNoise: true, showMetrics: true },
    participants: [], feed: [], fired: [], skipped: [], notes: [],
    metrics: { reputacion: 70, presion: 20, autoridades: 60 },
    history: [],
  };
  db.sessions.unshift(s);
  return s;
}

// ---------------------------------------------------------------- sockets
io.on('connection', (socket) => {
  const isAdmin = () => socket.data.admin === true;
  const guard = (fn) => (data, ack = () => {}) => {
    if (!isAdmin()) return ack({ error: 'No autorizado' });
    try { ack(fn(data || {}) || { ok: true }); } catch (e) { ack({ error: e.message }); }
  };

  socket.on('admin:login', ({ password } = {}, ack = () => {}) => {
    if (password !== ADMIN_PASSWORD) return ack({ error: 'Contraseña incorrecta' });
    socket.data.admin = true;
    socket.join('admins');
    ack({ ok: true, scenarios: db.scenarios, sessions: db.sessions.map(sessionSummary) });
  });

  socket.on('scenario:list', guard(() => ({ scenarios: db.scenarios })));
  socket.on('scenario:save', guard((data) => {
    const sc = sanitizeScenario(data);
    const i = db.scenarios.findIndex((x) => x.id === sc.id);
    if (i >= 0) db.scenarios[i] = sc; else db.scenarios.unshift(sc);
    save();
    return { ok: true, scenario: sc, scenarios: db.scenarios };
  }));
  socket.on('scenario:delete', guard(({ id }) => {
    db.scenarios = db.scenarios.filter((x) => x.id !== id);
    save();
    return { ok: true, scenarios: db.scenarios };
  }));

  socket.on('session:create', guard(({ scenarioId, name }) => {
    const sc = findScenario(scenarioId);
    if (!sc) throw new Error('Escenario no encontrado');
    const s = createSession(sc, name);
    broadcast(s, { list: true });
    return { ok: true, session: sessionSummary(s) };
  }));
  socket.on('session:delete', guard(({ id }) => {
    db.sessions = db.sessions.filter((x) => x.id !== id);
    io.to('s:' + id).emit('session:closed');
    io.to('admins').emit('sessions:list', db.sessions.map(sessionSummary));
    save();
  }));
  socket.on('session:watch', guard(({ id }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    for (const r of socket.rooms) if (r.startsWith('a:')) socket.leave(r);
    socket.join('a:' + s.id);
    return { ok: true, session: adminView(s) };
  }));

  socket.on('session:control', guard(({ id, action, speed }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    if (action === 'start' || action === 'resume') {
      if (s.status === 'ended') throw new Error('La sesión ya finalizó');
      if (s.status !== 'running') { s.status = 'running'; s.resumedAt = Date.now(); }
      if (action === 'start' && s.history.length === 0) s.history.push({ t: 0, ...s.metrics });
    } else if (action === 'pause') {
      if (s.status === 'running') { s.elapsedMs = elapsed(s); s.status = 'paused'; }
    } else if (action === 'end') {
      s.elapsedMs = elapsed(s); s.status = 'ended'; s.endedAt = Date.now();
      s.history.push({ t: s.elapsedMs, ...s.metrics });
    } else if (action === 'speed') {
      s.elapsedMs = elapsed(s); if (s.status === 'running') s.resumedAt = Date.now();
      s.speed = [1, 2, 5, 10].includes(Number(speed)) ? Number(speed) : 1;
    } else if (action === 'reset') {
      Object.assign(s, { status: 'lobby', elapsedMs: 0, resumedAt: null, lastMinute: -1, feed: [], fired: [], skipped: [], history: [], metrics: { reputacion: 70, presion: 20, autoridades: 60 } });
    }
    broadcast(s, { list: true });
    tick();
  }));

  socket.on('session:config', guard(({ id, config }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    for (const k of ['autoReactions', 'ambientNoise', 'showMetrics']) if (k in (config || {})) s.config[k] = !!config[k];
    broadcast(s);
  }));

  socket.on('session:inject', guard(({ id, injectId, custom, skip }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    if (s.status === 'ended') throw new Error('La sesión ya finalizó');
    if (injectId) {
      const inj = s.scenario.injects.find((x) => x.id === injectId);
      if (!inj) throw new Error('Inject no encontrado');
      if (skip) { if (!s.skipped.includes(inj.id)) s.skipped.push(inj.id); }
      else fireInject(s, inj, { manual: true });
    } else if (custom) {
      const [inj] = sanitizeScenario({ channels: s.scenario.channels, injects: [custom] }).injects;
      inj.id = null;
      fireInject(s, inj, { manual: true });
    }
    broadcast(s);
  }));

  socket.on('session:metrics', guard(({ id, metrics }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    for (const k of ['reputacion', 'presion', 'autoridades']) if (metrics && k in metrics) s.metrics[k] = clamp(Number(metrics[k]));
    s.history.push({ t: elapsed(s), ...s.metrics });
    broadcast(s);
  }));

  socket.on('session:rate', guard(({ id, itemId, delta, note }) => {
    const s = findSession(id);
    const it = s?.feed.find((f) => f.id === itemId);
    if (!it) throw new Error('Elemento no encontrado');
    const prev = it.rating?.delta || 0;
    const d = Math.max(-10, Math.min(10, Number(delta) || 0));
    it.rating = { delta: d, note: str(note, 2000) };
    applyImpact(s, { reputacion: d - prev });
    broadcast(s);
  }));

  socket.on('session:note', guard(({ id, text }) => {
    const s = findSession(id);
    if (!s) throw new Error('Sesión no encontrada');
    s.notes.push({ id: uid(), t: elapsed(s), text: str(text, 2000) });
    broadcast(s);
  }));

  socket.on('session:hide', guard(({ id, itemId, hidden }) => {
    const s = findSession(id);
    const it = s?.feed.find((f) => f.id === itemId);
    if (!it) throw new Error('Elemento no encontrado');
    it.hidden = !!hidden;
    broadcast(s);
  }));

  // ---------------- participantes
  socket.on('participant:join', ({ code, name, role, participantId } = {}, ack = () => {}) => {
    const s = db.sessions.find((x) => x.code === str(code, 10).toUpperCase().trim());
    if (!s) return ack({ error: 'Código de sesión no válido' });
    let p = participantId && s.participants.find((x) => x.id === participantId);
    if (!p) {
      if (!str(name).trim()) return ack({ error: 'Ingresa tu nombre' });
      p = { id: uid(), name: str(name, 80).trim(), role: str(role, 80).trim() || 'Participante', joinedAt: Date.now(), sockets: 0 };
      s.participants.push(p);
    }
    p.sockets = (p.sockets || 0) + 1;
    socket.data.sessionId = s.id;
    socket.data.participantId = p.id;
    socket.join('s:' + s.id);
    ack({ ok: true, participantId: p.id, session: participantView(s) });
    broadcast(s, { list: true });
  });

  socket.on('participant:respond', (data = {}, ack = () => {}) => {
    const s = findSession(socket.data.sessionId);
    const p = s?.participants.find((x) => x.id === socket.data.participantId);
    if (!s || !p) return ack({ error: 'No estás en una sesión' });
    if (s.status !== 'running') return ack({ error: s.status === 'paused' ? 'La simulación está en pausa' : 'La simulación no está activa' });
    try {
      const item = handleResponse(s, p, data);
      broadcast(s);
      ack({ ok: true, itemId: item.id });
    } catch (e) { ack({ error: e.message }); }
  });

  socket.on('disconnect', () => {
    const s = findSession(socket.data.sessionId);
    const p = s?.participants.find((x) => x.id === socket.data.participantId);
    if (p) { p.sockets = Math.max(0, (p.sockets || 1) - 1); broadcast(s, { list: true }); }
  });
});

load();
for (const s of db.sessions) for (const p of s.participants) p.sockets = 0;
setInterval(tick, 1000);
server.listen(PORT, () => {
  console.log(`Simulador de crisis escuchando en http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Contraseña de administrador por defecto: "admin" (define ADMIN_PASSWORD para cambiarla)');
});
