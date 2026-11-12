// Motor de simulación: análisis de tono de las respuestas y generación de reacciones
// (público en redes, medios, autoridades y stakeholders). Heurísticas en español,
// sin dependencias externas, pensadas para dar retroalimentación inmediata y verosímil.

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const POSITIVE = [
  { re: /lamenta|lo sentimos|sentimos mucho|pedimos (perdon|disculpas)|disculp/, w: 0.25, tip: 'Expresa empatía o disculpa' },
  { re: /asumimos|nuestra responsabilidad|nos hacemos cargo|responsabiliz/, w: 0.25, tip: 'Asume responsabilidad' },
  { re: /transparen|informaremos|mantendremos informad|actualizaremos|nueva actualizacion|proximas horas/, w: 0.2, tip: 'Compromiso de información continua' },
  { re: /investigacion|investigando|auditoria|revision independiente|sumario/, w: 0.15, tip: 'Anuncia investigación' },
  { re: /afectad|familias|clientes|vecinos|comunidad|trabajadores|pacientes|usuarios/, w: 0.15, tip: 'Pone a las personas afectadas al centro' },
  { re: /medidas|hemos (suspendido|detenido|activado|retirado|habilitado)|protocolo|plan de accion|retiro/, w: 0.2, tip: 'Comunica acciones concretas' },
  { re: /autoridad|ministerio|seremi|fiscalia|superintendencia|municipalidad|colabora/, w: 0.1, tip: 'Muestra colaboración con autoridades' },
  { re: /linea (de )?(ayuda|telefonica|gratuita)|contacto|correo|whatsapp|800|\+?\d{2,3}[ -]?\d{3,}/, w: 0.15, tip: 'Entrega un canal de contacto' },
  { re: /seguridad|salud|prioridad|bienestar|proteger/, w: 0.1, tip: 'Prioriza seguridad y bienestar' },
  { re: /acompan|apoyo|ayuda|compensa|reembols|cubriremos/, w: 0.15, tip: 'Ofrece apoyo o reparación' },
];

const NEGATIVE = [
  { re: /sin comentarios|no comment|no vamos a comentar|no corresponde comentar/, w: 0.45, risk: 'Evita responder ("sin comentarios")' },
  { re: /no es (nuestra|nuestro) (culpa|responsabilidad)|culpa de|responsabilidad de terceros|no tenemos responsabilidad/, w: 0.4, risk: 'Traslada la culpa' },
  { re: /exagera|alarmis|no paso nada|no es para tanto|caso aislado|minim/, w: 0.35, risk: 'Minimiza el problema' },
  { re: /falso|mentira|fake|desinformacion|campana (de )?desprestigio|ataque/, w: 0.2, risk: 'Tono confrontacional / niega sin pruebas' },
  { re: /acciones legales|demandaremos|querella/, w: 0.2, risk: 'Amenaza legal puede leerse como intimidación' },
  { re: /\b(idiota|ignorante|ridicul|estupid|tont)/, w: 0.6, risk: 'Lenguaje ofensivo' },
  { re: /\bjaja|\blol\b|xd\b|😂|🤣/, w: 0.4, risk: 'Tono frívolo' },
];

const WEIGHT = { redes: 6, prensa: 7, autoridades: 4, stakeholders: 4, interno: 0 };

function analyze(text, channelType, { isReply = false, onTime = null } = {}) {
  const t = norm(text);
  const strengths = [];
  const risks = [];
  let score = 0;

  // Primero se detectan (y retiran) las frases negativas, para que
  // "no es nuestra responsabilidad" no cuente como "asume responsabilidad".
  let rest = t;
  for (const n of NEGATIVE) if (n.re.test(rest)) { score -= n.w; risks.push(n.risk); rest = rest.replace(new RegExp(n.re.source, 'g'), ' '); }
  for (const p of POSITIVE) if (p.re.test(rest)) { score += p.w; strengths.push(p.tip); }

  const raw = text || '';
  const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  const upper = raw.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  if (letters.length > 20 && upper.length / letters.length > 0.6) { score -= 0.25; risks.push('Uso excesivo de mayúsculas'); }
  if ((raw.match(/!/g) || []).length >= 3) { score -= 0.1; risks.push('Exceso de signos de exclamación'); }

  const len = raw.trim().length;
  const minLen = channelType === 'redes' ? 60 : channelType === 'interno' ? 0 : 150;
  if (len < minLen && channelType !== 'interno') { score -= 0.15; risks.push('Mensaje demasiado breve para la gravedad'); }
  if (channelType === 'redes' && len > 600) { score -= 0.1; risks.push('Demasiado extenso para redes sociales'); }
  if (/\d/.test(raw) && channelType !== 'interno') { score += 0.05; strengths.push('Incluye datos concretos'); }

  if (onTime === true) { score += 0.1; strengths.push('Respondió dentro del plazo'); }
  if (onTime === false) { score -= 0.1; risks.push('Respuesta fuera de plazo'); }

  score = Math.max(-1, Math.min(1, score));
  const label = score >= 0.25 ? 'positivo' : score <= -0.15 ? 'negativo' : 'neutral';
  return { score: Math.round(score * 100) / 100, label, strengths: [...new Set(strengths)], risks: [...new Set(risks)] };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const fill = (s, ctx) => s.replace(/\{org\}/g, ctx.org || 'la empresa');

const NAMES = [
  ['Camila Rojas', 'camirojas'], ['Javier Muñoz', 'javimunoz_'], ['Valentina Soto', 'valesoto'], ['Diego Fuentes', 'dfuentes'],
  ['Martina Díaz', 'martidiaz'], ['Tomás Herrera', 'tomasherrera'], ['Fernanda Pizarro', 'ferpizarro'], ['Matías Vega', 'matiasvega'],
  ['Josefa Navarro', 'jose_navarro'], ['Benjamín Castro', 'benjacastro'], ['Isidora León', 'isileon'], ['Ignacio Reyes', 'nachoreyes'],
  ['Antonia Morales', 'antomorales'], ['Sebastián Torres', 'sebatorres'], ['Observatorio Ciudadano', 'obs_ciudadano'],
  ['Consumidores Unidos', 'consumidores_u'], ['Periodista Indep.', 'periodismo_libre'], ['Vecinos Organizados', 'vecinosorg'],
];

const SOCIAL = {
  positivo: [
    'Bien que {org} dé la cara. Ahora esperamos que cumplan.',
    'Por fin una respuesta clara. Ojalá sigan informando.',
    'Valoro que asuman la responsabilidad, no es lo habitual.',
    'Al menos hay un canal de contacto. Lo voy a compartir.',
    'Buena respuesta, pero las palabras no bastan: queremos ver acciones.',
    'Gracias por la info, ¿cuándo será la próxima actualización?',
  ],
  neutral: [
    '¿Y qué pasa con los afectados? No queda claro.',
    'Comunicado muy genérico. ¿Qué medidas concretas van a tomar?',
    'Ok, pero llegan tarde.',
    'Esperemos a ver qué dicen las autoridades.',
    '¿Alguien entendió qué van a hacer exactamente?',
    'Me gustaría saber quién se hace responsable.',
  ],
  negativo: [
    'Vergonzoso. {org} sigue sin hacerse cargo. #Boicot',
    'Esto es una burla para los afectados.',
    'Típico: culpar a otros y no asumir nada.',
    'No les creo nada. Que intervenga la fiscalía.',
    'Con esta respuesta solo empeoran las cosas 🤦',
    'Dejé de ser cliente de {org} hoy mismo.',
    'Respuesta arrogante. Exigimos explicaciones reales.',
  ],
};

const AMBIENT = [
  '¿Alguien de {org} va a dar la cara o seguimos esperando?',
  'Llevo una hora tratando de comunicarme con {org} y nadie contesta.',
  'Mi familia está preocupada, ¿alguien sabe algo nuevo de lo que pasó con {org}?',
  'Circula un audio en WhatsApp diciendo que esto es peor de lo que parece 👀',
  'Los noticieros ya están hablando del tema. #Crisis{tag}',
  'El silencio de {org} dice mucho.',
  'Hilo 🧵 con todo lo que sabemos hasta ahora sobre el caso {org}…',
  'Exigimos una explicación pública. RT si estás de acuerdo.',
  'Trabajé en {org}, esto se veía venir…',
  '¿Las autoridades no van a decir nada?',
];

function socialReactions(analysis, ctx) {
  const n = 2 + Math.floor(Math.random() * 2);
  const label = analysis.label;
  const mix = label === 'positivo' ? ['positivo', 'positivo', 'neutral'] : label === 'negativo' ? ['negativo', 'negativo', 'neutral'] : ['neutral', 'negativo', 'positivo'];
  const people = sample(NAMES, n);
  const base = label === 'positivo' ? 1.5 : label === 'negativo' ? 0.6 : 1;
  return {
    likes: Math.round((80 + Math.random() * 400) * base),
    shares: Math.round((20 + Math.random() * 200) * (label === 'negativo' ? 2.2 : base)),
    comments: people.map((p, i) => ({ author: p[0], handle: p[1], body: fill(pick(SOCIAL[mix[i % mix.length]]), ctx) })),
  };
}

function ambientPost(ctx, custom = []) {
  const p = pick(NAMES);
  const pool = custom.length && Math.random() < 0.6 ? custom : AMBIENT;
  const tag = (ctx.org || 'Empresa').normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  return { author: p[0], handle: p[1], body: fill(pick(pool), ctx).replace('{tag}', tag) };
}

const OUTLETS = ['Diario La Jornada', 'Radio Continental', 'Canal 24 Noticias', 'El Observador', 'Portal Noticias Hoy', 'Agencia Informativa Sur'];

function mediaHeadline(analysis, ctx, title) {
  const outlet = pick(OUTLETS);
  const org = ctx.org || 'La empresa';
  const quote = title ? ` "${title}"` : '';
  const H = {
    positivo: [
      [`${org} asume responsabilidad y anuncia medidas`, `En un comunicado${quote}, la compañía reconoció la situación, detalló acciones inmediatas y comprometió nuevas actualizaciones. Expertos valoran la rapidez de la respuesta, aunque advierten que falta conocer el alcance real.`],
      [`${org} rompe el silencio: "Las personas afectadas son nuestra prioridad"`, `La empresa entregó información sobre las acciones en curso y habilitó canales de contacto. Organizaciones de la sociedad civil señalan que seguirán atentas al cumplimiento.`],
    ],
    neutral: [
      [`${org} emite comunicado, pero persisten las dudas`, `La declaración${quote} no despejó las principales interrogantes: cuántas personas están afectadas, desde cuándo se conocía el problema y quién responde. Analistas califican el mensaje como "genérico".`],
      [`Respuesta de ${org} deja preguntas abiertas`, `Si bien la compañía se refirió al caso, no entregó cifras ni plazos. Los afectados exigen mayor claridad.`],
    ],
    negativo: [
      [`Polémica por la respuesta de ${org}: acusan falta de empatía`, `Las declaraciones${quote} generaron rechazo transversal en redes sociales y entre autoridades. Especialistas en comunicación estratégica advierten que el tono "agrava la crisis".`],
      [`${org} minimiza el caso y desata ola de críticas`, `La reacción de la empresa fue calificada como "defensiva" por expertos. Parlamentarios ya piden explicaciones y no se descarta una citación.`],
    ],
  };
  const [h, b] = pick(H[analysis.label]);
  return { author: outlet, title: h, body: b };
}

function authorityReply(analysis, authorName) {
  const a = authorName || 'Autoridad sanitaria';
  if (analysis.label === 'positivo') {
    return { author: a, title: 'Acusa recibo y valora colaboración', body: 'Se acusa recibo de la información entregada. Se valora la disposición a colaborar. Se solicita mantener reportes periódicos cada 2 horas y designar un punto de contacto permanente.' };
  }
  if (analysis.label === 'neutral') {
    return { author: a, title: 'Información insuficiente', body: 'La información remitida resulta insuficiente. Se requiere ampliar antecedentes: cronología de los hechos, número de personas afectadas, medidas adoptadas y responsables. Plazo: 30 minutos.' };
  }
  return { author: a, title: 'Advertencia formal', body: 'La respuesta recibida no se ajusta a lo requerido. Se advierte que la falta de colaboración podrá dar lugar al inicio de un sumario sanitario/administrativo y a las sanciones que correspondan según la normativa vigente.' };
}

function stakeholderReply(analysis, authorName) {
  const a = authorName || 'Directorio';
  const T = {
    positivo: ['Gracias por la rápida información', 'Agradezco la claridad. Mantengámonos coordinados; necesito un resumen ejecutivo al cierre del día.'],
    neutral: ['Necesitamos más detalle', 'Recibido, pero no tengo claridad sobre el impacto financiero ni sobre los próximos pasos. ¿Podemos tener una llamada en 20 minutos?'],
    negativo: ['Preocupación seria', 'Esta respuesta no me da tranquilidad. Si la situación no se controla, tendremos que escalar el tema al directorio y evaluar responsabilidades.'],
  };
  const [title, body] = T[analysis.label];
  return { author: a, title, body };
}

function escalation(channelType, ctx, item) {
  const org = ctx.org || 'la empresa';
  switch (channelType) {
    case 'prensa': return { author: pick(OUTLETS), title: `${org} guarda silencio ante consultas de la prensa`, body: `Pese a reiteradas consultas sobre "${item.title || 'el caso'}", la compañía no ha entregado respuesta. El silencio alimenta especulaciones.` };
    case 'redes': { const p = pick(NAMES); return { author: p[0], handle: p[1], title: '', body: `Ya pasó harto rato y ${org} sigue sin responder. Esto se viralizó y nadie da la cara. #${org.normalize('NFD').replace(/[^A-Za-z0-9]/g, '')}Responde` }; }
    case 'autoridades': return { author: item.author || 'Autoridad', title: 'Segundo requerimiento — plazo vencido', body: `No se ha recibido respuesta al requerimiento "${item.title || ''}". Se reitera la solicitud con carácter urgente y se evaluarán las acciones administrativas correspondientes.` };
    case 'stakeholders': return { author: item.author || 'Stakeholder', title: `RE: ${item.title || 'Consulta'} — sin respuesta`, body: 'Sigo esperando una respuesta. La falta de información me obliga a tomar decisiones por mi cuenta.' };
    default: return { author: 'Sistema', title: 'Plazo vencido', body: `Venció el plazo para responder "${item.title || ''}".` };
  }
}

module.exports = { analyze, socialReactions, ambientPost, mediaHeadline, authorityReply, stakeholderReply, escalation, WEIGHT };
