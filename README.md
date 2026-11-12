# ⚡ Crisis Sim — Simulador de gestión de crisis comunicacional

Plataforma web en tiempo real para entrenar a equipos de **comunicaciones y gerencia** frente a una crisis. Un **administrador/facilitador** diseña el escenario y los canales y conduce la sesión en vivo. Los **participantes** reciben la información, deliberan y responden con contenidos propios, y el entorno reacciona a lo que publican.

## Inicio rápido

```bash
npm install
npm start            # http://localhost:3000
```

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `ADMIN_PASSWORD` | `admin` | Contraseña del panel de administración (**cámbiala**) |
| `DATA_DIR` | `./data` | Carpeta donde se guarda `db.json` (escenarios y sesiones) |

- **Administrador:** `http://<servidor>/admin.html`
- **Participantes:** `http://<servidor>/play.html?code=CODIGO` (o entran a la portada e ingresan el código)

## Roles

### 🛠️ Administrador / facilitador
- **Editor de escenarios:** título, organización, briefing para participantes y criterios de evaluación privados.
- **Canales configurables:** se pueden crear varios de cada tipo (p. ej. "Ministerio de Salud" y "Municipalidad").
  | Tipo | Formato | Cómo responde el equipo |
  |---|---|---|
  | 📰 Prensa | Noticias, consultas de periodistas | Comunicado de prensa / respuesta al medio |
  | 📱 Redes sociales | Publicaciones de usuarios | Publicación desde la cuenta oficial / respuesta |
  | 🏛️ Autoridades | Oficios y requerimientos formales | Respuesta formal |
  | ✉️ Stakeholders | Correos de directorio, clientes, socios | Correo |
  | 💬 Equipo interno | Chat privado del comité | Mensajes (sin impacto público) |
- **Injects programados:** cada uno tiene minuto de aparición, canal, emisor, severidad, imagen opcional, plazo de respuesta e impacto en los indicadores.
- **Sala de control en vivo:**
  - iniciar, pausar, reanudar y finalizar la sesión, con velocidad 1×/2×/5×/10×;
  - lanzar u omitir injects y crear **injects improvisados** en el momento;
  - ver cada respuesta con su **análisis de tono** (fortalezas y riesgos) y **evaluarla** con ajuste de reputación y retroalimentación;
  - ajustar los indicadores a mano, ocultar elementos y anotar observaciones;
  - activar o desactivar las reacciones automáticas, el ruido ambiental y la visibilidad de los indicadores.
- **Informe:** versión imprimible o PDF con KPIs, gráfico, desempeño por participante y cronología completa. Exporta en HTML, JSON y CSV.
- Importación y exportación de escenarios en JSON. Incluye **2 escenarios de ejemplo** con organizaciones ficticias: una intoxicación alimentaria y una filtración de datos.

### 🎯 Participante
- Ingresa con código, nombre y rol (Gerente General, Vocero/a, Community Manager, Legal…).
- Lee el briefing, navega por los canales con contadores de no leídos y recibe alertas sonoras, avisos emergentes y banners de **"Última hora"**.
- El panel de **pendientes** muestra cuenta regresiva para cada requerimiento con plazo.
- Redacta comunicados, publicaciones, oficios y correos, y coordina con su equipo por el chat interno.
- Al terminar ve un **debriefing** con indicadores, su tono y el feedback del facilitador.

## Dinámica de la simulación
- **Indicadores:** Reputación, Presión mediática y Relación con autoridades (0–100). Cambian con cada inject, con cada respuesta y con el paso del tiempo.
- **Análisis de tono** (heurístico, en español):
  - premia la empatía, asumir responsabilidad, las acciones concretas, los canales de contacto, la colaboración con autoridades y responder a tiempo;
  - penaliza "sin comentarios", culpar a otros, minimizar, el tono confrontacional o frívolo, las mayúsculas y los mensajes demasiado breves.
- **Reacciones automáticas:** comentarios de usuarios y métricas de engagement en redes, titulares de prensa según el tono del comunicado, acuse o advertencia de la autoridad, y respuesta de los stakeholders.
- **Escalamiento:** si vence el plazo de un requerimiento sin respuesta, aparece una noticia o publicación sobre "el silencio de la empresa" y los indicadores empeoran.
- **Ruido ambiental:** publicaciones aleatorias cuya frecuencia crece con la presión mediática. Se pueden personalizar por escenario.

## Arquitectura
- `server/index.js`: Express + Socket.IO, reloj de simulación, sesiones y persistencia en JSON.
- `server/engine.js`: análisis de tono y generación de reacciones.
- `server/sampleScenarios.js`: escenarios de ejemplo.
- `public/`: frontend en HTML/CSS/JS sin compilación (`admin.html`, `play.html`, `js/common.js`).

Las sesiones se guardan en `data/db.json`. Si el servidor se reinicia, las sesiones en curso quedan en pausa.

## Ideas de evolución
- Integrar un LLM (p. ej. Claude) para generar reacciones y preguntas de periodistas a partir del texto publicado.
- Varios equipos compitiendo en la misma sesión.
- Roles con permisos por canal (solo el vocero publica en prensa, etc.).
- Simulación de entrevista en vivo con preguntas encadenadas.
