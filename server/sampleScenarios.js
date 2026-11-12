// Escenarios de ejemplo (organizaciones ficticias) para comenzar a usar el simulador.

const CHANNELS = [
  { id: 'prensa', type: 'prensa', name: 'Prensa' },
  { id: 'redes', type: 'redes', name: 'Redes sociales' },
  { id: 'autoridades', type: 'autoridades', name: 'Autoridades' },
  { id: 'stakeholders', type: 'stakeholders', name: 'Stakeholders' },
  { id: 'interno', type: 'interno', name: 'Equipo interno' },
];

let n = 0;
const inj = (at, channelId, author, title, body, extra = {}) => ({
  id: 'inj' + ++n,
  at, channelId, author, title, body,
  handle: extra.handle || '',
  severity: extra.severity || 'media',
  requiresResponse: !!extra.rr,
  responseMinutes: extra.rr || 0,
  impact: { reputacion: extra.rep || 0, presion: extra.pre || 0, autoridades: extra.aut || 0 },
  imageUrl: extra.img || '',
});

module.exports = [
  {
    id: 'demo-alimentos',
    title: 'Intoxicación masiva por producto lácteo',
    organization: 'Lácteos Cordillera',
    summary: 'Decenas de personas, entre ellas niños, presentan síntomas de intoxicación tras consumir un yogur de la marca. Las redes explotan y la autoridad sanitaria exige información.',
    briefing:
      'Son las 08:30 de un lunes. Ustedes integran el comité de crisis de Lácteos Cordillera, empresa con 40 años de trayectoria y 1.200 trabajadores.\n\nDurante la noche, tres hospitales reportaron casos de intoxicación alimentaria asociados al consumo de "Yogur Cordillera Frutilla 1L", lote L2311. Aún no existe confirmación oficial.\n\nSu misión: proteger a las personas, coordinar con autoridades y gestionar la reputación de la compañía a través de los canales disponibles.',
    facilitatorNotes:
      'Objetivos de evaluación: (1) rapidez de la primera declaración; (2) empatía y foco en afectados; (3) anuncio de retiro preventivo del lote; (4) coordinación con la autoridad sanitaria; (5) consistencia del mensaje entre canales; (6) manejo del rumor sobre ocultamiento.',
    noise: [
      'Mi hijo está en urgencias después de tomar yogur Cordillera. ¿Nadie va a responder? 😡',
      '¿Es seguro tomar otros productos de Lácteos Cordillera? Tengo el refri lleno.',
      'Dicen que la empresa sabía del problema desde la semana pasada…',
      'Supermercados ya están sacando el yogur de las góndolas, ¿y la marca qué dice?',
    ],
    channels: CHANNELS,
    injects: [
      inj(0, 'interno', 'Gerencia de Calidad', 'Alerta interna', 'Recibimos llamadas de 3 hospitales. Hay 27 personas con síntomas (8 niños). Todas consumieron Yogur Frutilla lote L2311. Estamos revisando registros de producción. ¿Activamos el comité de crisis?', { severity: 'alta' }),
      inj(1, 'redes', 'Carolina M.', 'Publicación viral', 'Mi hija de 5 años está hospitalizada después de tomar yogur Cordillera. Tres niños más del jardín igual. ¿¿Hasta cuándo?? @LacteosCordillera #IntoxicaciónCordillera', { handle: 'caro_mamade2', severity: 'alta', rr: 8, rep: -6, pre: 12, img: '' }),
      inj(3, 'prensa', 'Canal 24 Noticias — Andrea Salinas', 'Consulta de prensa', 'Buenos días. Estamos saliendo en vivo a las 09:00 desde el Hospital Regional. ¿Pueden confirmar si existe un problema con su yogur de frutilla? ¿Habrá retiro del producto? Necesito una respuesta antes de salir al aire.', { severity: 'alta', rr: 6, pre: 10 }),
      inj(5, 'autoridades', 'Autoridad Sanitaria Regional', 'Oficio N° 1458 — Requerimiento urgente', 'En virtud de las notificaciones recibidas, se requiere a Lácteos Cordillera informar en un plazo máximo de 10 minutos: (a) lotes involucrados, (b) distribución geográfica, (c) medidas adoptadas, (d) responsable técnico de contacto.', { severity: 'critica', rr: 10, aut: -5 }),
      inj(7, 'stakeholders', 'Presidente del Directorio', 'Necesito saber qué está pasando', 'Me están llamando inversionistas y la cadena de supermercados. ¿Cuál es nuestra posición? ¿Estamos frente a un retiro? Necesito un resumen en 5 líneas.', { rr: 8 }),
      inj(9, 'prensa', 'Diario La Jornada', 'ÚLTIMA HORA: Suben a 54 los casos', 'La autoridad sanitaria confirmó 54 personas afectadas en tres regiones. Fuentes extraoficiales indican que la planta habría tenido una falla de refrigeración el fin de semana.', { severity: 'critica', rep: -8, pre: 15 }),
      inj(11, 'redes', 'Ex trabajador anónimo', 'Rumor de ocultamiento', 'Trabajé en la planta de Cordillera. El viernes se cortó la luz y la cámara de frío estuvo horas apagada. Los jefes dijeron que igual se despachara. 🧵', { handle: 'explanta_anon', severity: 'critica', rr: 8, rep: -10, pre: 15 }),
      inj(14, 'stakeholders', 'Gerente Comercial — Supermercados Líder Sur', 'Retiro de góndolas', 'Por protocolo retiramos TODOS sus productos de nuestros 120 locales hasta nuevo aviso. Necesitamos una carta formal con el alcance del problema para evaluar reposición.', { severity: 'alta', rr: 10, rep: -4 }),
      inj(17, 'prensa', 'Radio Continental — Programa "Mañana Informativa"', 'Invitación a entrevista en vivo', 'Queremos al gerente general en vivo a las 11:00. Si no asiste, diremos al aire que la empresa declinó la invitación. ¿Confirman vocero?', { rr: 6, pre: 8 }),
      inj(20, 'autoridades', 'Autoridad Sanitaria Regional', 'Resultados preliminares', 'Muestras del lote L2311 arrojan presencia de Staphylococcus aureus. Se ordena retiro obligatorio y se inicia sumario sanitario. Se solicita plan de retiro y comunicación a la población.', { severity: 'critica', rr: 10, rep: -5, pre: 10 }),
      inj(25, 'interno', 'Gerencia Legal', 'Recomendación', 'Sugerimos no reconocer responsabilidad públicamente hasta tener el informe técnico. ¿Cómo lo compatibilizamos con lo que ya se ha comunicado?', { severity: 'media' }),
    ],
  },
  {
    id: 'demo-datos',
    title: 'Filtración de datos de clientes',
    organization: 'Financiera Horizonte',
    summary: 'Un grupo de hackers publica una muestra de datos personales y financieros de clientes. La noticia se viraliza y el regulador exige explicaciones.',
    briefing:
      'Martes 15:00. Un foro de ciberdelincuentes publicó un archivo con datos de 5.000 clientes de Financiera Horizonte (nombres, RUT, correos y últimos 4 dígitos de tarjetas) y afirma tener 800.000 registros más.\n\nEl equipo de TI aún no confirma el origen. Ustedes son el comité de crisis: deben coordinar la comunicación con clientes, prensa, regulador y directorio.',
    facilitatorNotes:
      'Evaluar: (1) no confirmar ni negar datos sin verificar; (2) instrucciones claras de autoprotección para clientes; (3) notificación oportuna al regulador; (4) gestión de la extorsión (no negociar públicamente); (5) consistencia y tono.',
    noise: [
      '¿Mis datos están entre los filtrados? @FinancieraHorizonte nadie responde',
      'Me llegó un correo raro pidiendo mi clave supuestamente de Horizonte… ¿es phishing?',
      'Cerré mi cuenta en Horizonte. No pienso esperar a que me roben.',
    ],
    channels: CHANNELS,
    injects: [
      inj(0, 'interno', 'CISO — Seguridad de la Información', 'Incidente confirmado parcialmente', 'Validamos que al menos 300 registros de la muestra son reales. Aún no sabemos el vector de ingreso. Recomiendo no dar cifras todavía.', { severity: 'alta' }),
      inj(2, 'redes', 'CiberAlerta', 'Publicación', '🚨 Filtran datos de clientes de Financiera Horizonte: nombres, RUT, correos y tarjetas. Los atacantes dicen tener 800K registros. #HorizonteHackeado', { handle: 'ciberalerta_news', severity: 'alta', rr: 8, rep: -6, pre: 12 }),
      inj(4, 'prensa', 'El Observador — Unidad de Investigación', 'Consulta de prensa', '¿Confirman la filtración? ¿Cuántos clientes están afectados? ¿Desde cuándo lo saben? Publicamos en 15 minutos con o sin su versión.', { severity: 'alta', rr: 7, pre: 10 }),
      inj(6, 'autoridades', 'Comisión para el Mercado Financiero', 'Requerimiento de información', 'Se instruye informar de inmediato el incidente de ciberseguridad, conforme a la normativa vigente: naturaleza, alcance estimado, medidas de contención y plan de comunicación a clientes.', { severity: 'critica', rr: 10, aut: -5 }),
      inj(9, 'stakeholders', 'Directora independiente', 'Consulta del directorio', '¿Por qué me entero por la prensa? Convoquen sesión extraordinaria. Necesito saber si hay riesgo de multas y cuál es nuestra exposición.', { rr: 8 }),
      inj(12, 'redes', 'Grupo "ShadowLeak"', 'Extorsión pública', 'Horizonte tiene 48 horas para pagar o publicamos todo. Ya les escribimos. ¿Le dirán a sus clientes que prefieren no pagar? 😈', { handle: 'shadowleak', severity: 'critica', rep: -6, pre: 15 }),
      inj(15, 'prensa', 'Canal 24 Noticias', 'Clientes reportan cargos no reconocidos', 'Al menos 40 clientes denuncian cargos fraudulentos en sus tarjetas en las últimas horas. Especialistas vinculan los casos a la filtración.', { severity: 'critica', rep: -8, pre: 12 }),
      inj(18, 'redes', 'Asociación de Consumidores', 'Anuncio de demanda colectiva', 'Anunciamos demanda colectiva contra Financiera Horizonte. Afectados pueden inscribirse en nuestro sitio. Exigimos compensación y transparencia.', { handle: 'consumidores_u', severity: 'alta', rr: 10, rep: -5, pre: 8 }),
      inj(22, 'autoridades', 'Comisión para el Mercado Financiero', 'Inicio de fiscalización', 'Se informa inicio de proceso de fiscalización. Se requiere listado de clientes notificados y protocolo aplicado en un plazo de 24 horas.', { severity: 'alta', rr: 12, aut: -3 }),
    ],
  },
];
