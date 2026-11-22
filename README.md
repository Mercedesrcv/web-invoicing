# GuestBill · Invoice automation para hoteles + agente de voz IA

Web de producto (ES/EN) para una plataforma de **facturación hotelera automática** con un **agente de voz** que resuelve dudas de preventa e incidencias de facturación, y escala a una persona con contexto limpio. Todas las interacciones se registran (con datos sensibles enmascarados) y se ven en un **panel de métricas**.

> Proyecto de demostración de producto. El nombre del producto se configura con `NEXT_PUBLIC_BRAND_NAME` (por defecto GuestBill) y el hotel de pruebas solo contiene datos inventados.

*English summary: Next.js site for a hotel invoice-automation product, with a browser voice agent powered by Claude (Web Speech API for STT/TTS, text-chat fallback, barge-in), masked interaction logging, an admin metrics dashboard and a 28-case evaluation suite. Deploys to Vercel; see "Despliegue".*

## Qué incluye

| Pieza | Dónde | Qué hace |
|---|---|---|
| Landing | `components/Landing.tsx` | Propuesta de valor, problemas reales (los "bordes" de la facturación), casos de uso y flujo check-in → factura conciliada |
| Simulador "prueba el producto" | `components/Simulator.tsx` | Convierte una reserva en facturas: split OTA/huésped con VCC, IVA por concepto, tasa no sujeta, validación real de NIF/CIF, conciliación y ticket ante descuadre |
| Agente de voz | `components/VoiceAgent.tsx` | Voz en el navegador (Web Speech API) con habla frase a frase, **barge-in** con filtro de eco, y modo texto como alternativa |
| Cerebro del agente | `lib/agent/*` | Claude (`claude-opus-5-5` por defecto) con streaming, prompt del sistema del diseño de producto y 7 herramientas sobre un hotel de demostración |
| Monitorización | `app/api/agent`, `app/api/events`, `lib/store/*` | Eventos de uso, transcripciones enmascaradas, latencias, herramientas, escalados, valoraciones |
| Panel admin | `/admin` (solo por URL, no aparece en el menú) | Explica cómo se mide la calidad y muestra sesiones, resolución, contención, escalados, latencia p50/p95, calidad por turno, CSAT, intenciones, transcripciones y export CSV |
| Suite de evaluación | `evals/` | 28 casos (matriz de pruebas, flujos de incidencia, casos nuevos y estrés de voz) puntuados con la rúbrica de 4 dimensiones |

## Arranque en local

Requisitos: Node 20 o superior.

```bash
npm install
cp .env.example .env.local   # añade ANTHROPIC_API_KEY para usar Claude
npm run dev                  # http://localhost:3000
```

Sin `ANTHROPIC_API_KEY` la web funciona en **modo demo**: respuestas guionizadas que usan las mismas herramientas del hotel de pruebas. Sirve para enseñar la web sin coste, pero no es el agente real.

Para probar la voz usa Chrome, Edge o Safari (Firefox no tiene reconocimiento de voz; el agente pasa a texto). Con auriculares el barge-in funciona mejor, porque el micrófono no oye al propio agente.

Localizadores del hotel de demostración:

| Dato | Escenario |
|---|---|
| `X9K4P` | Check-out hoy, la factura se envió pero el correo rebotó |
| `BK-55120` | Booking.com con VCC: estancia a la OTA, extras al huésped |
| `LOC-7781` | Factura de ayer a nombre de particular, para pasarla a empresa |
| `DQ-420` | Pasarela 420 € vs factura 395 € (late check-out cobrado tras cerrar el folio) |
| Habitación `304` | Emisión bloqueada: CIF de 8 caracteres y país fiscal vacío |
| `PA-118` | "Me habéis cobrado dos veces": un cobro y una preautorización ya liberada |
| `CX-930` | Cancelación con devolución de 120 € y factura aún por 240 € |
| `OCT-552` | Factura de octubre (periodo cerrado): la rectificativa la aprueba administración |

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New → Project → Import** el repositorio. Framework: Next.js (se detecta solo).
3. Variables de entorno (Settings → Environment Variables):

| Variable | Obligatoria | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | Para el agente real | Tu clave de la consola de Anthropic |
| `ADMIN_TOKEN` | Sí en producción | La contraseña del panel `/admin` (no se guarda en el código); protege también las APIs de métricas |
| `DATABASE_URL` | Recomendado | URL de Postgres. Con **Vercel → Storage → Neon (Postgres)** se crea sola como `DATABASE_URL`/`POSTGRES_URL`. También vale Supabase (connection string) |
| `ANTHROPIC_MODEL` | No | Por defecto `claude-opus-5-5`. Para menos latencia en voz puedes probar `claude-haiku-5-5` |
| `ANTHROPIC_EFFORT` | No | `low` por defecto (prioriza latencia en voz) |
| `RATE_LIMIT_PER_MIN` | No | Turnos por minuto e IP (30 por defecto) para proteger la clave |
| `NEXT_PUBLIC_BRAND_NAME` | No | Nombre de la marca |

4. Deploy. La tabla `agent_events` se crea sola en el primer evento; si prefieres crearla antes: `DATABASE_URL=... npm run db:init`.

**Almacenamiento.** Con `DATABASE_URL` se usa Postgres. Sin base de datos se usa un fichero JSONL (`.data/events.jsonl` en local). En Vercel sin base de datos el fichero va a `/tmp`, que es efímero y no se comparte entre instancias: sirve para una demo rápida, no para medir. `STORAGE=memory|file|postgres` fuerza un backend.

## Monitorización

Cada turno del agente y cada acción relevante del navegador genera un evento:

| Evento | Origen | Datos |
|---|---|---|
| `session_start`, `consent` | Navegador | Nivel de consentimiento, soporte de voz |
| `user_turn` | Servidor | Intención clasificada, longitud, texto enmascarado (solo con consentimiento completo) |
| `assistant_turn` | Servidor | Primer token (TTFT), duración total, herramientas, tokens, motivo de parada, **puntuación de calidad del turno**, texto enmascarado |
| `tool_call` | Servidor | Herramienta, error, entrada/salida enmascaradas |
| `escalation` | Servidor | Ticket, prioridad, intención |
| `tts_first_audio` | Navegador | Desde que el usuario termina de hablar hasta que suena la primera frase |
| `barge_in` | Navegador | Tiempo de corte de la locución y de detección |
| `rating` | Navegador | ¿Se resolvió? + 1 a 5 estrellas |
| `stt_error`, `error` | Ambos | Código de error |
| `simulator_run` | Navegador | Escenario, facturas, bloqueo, descuadre |

Métricas del panel (`lib/metrics.ts`): sesiones y turnos, % voz, **resolución declarada**, **contención** (sin humano), **tasa de escalado** y tickets de prioridad alta, **latencia** (TTFT p50/p95, turno completo, primer audio, corte por barge-in), **calidad** (media por turno y CSAT), alertas de ergonomía de voz, intenciones con su volumen y escalado, y sesiones con transcripción. `GET /api/admin/export?days=30` (con `Authorization: Bearer $ADMIN_TOKEN`) descarga todo en CSV, o en JSON con `&format=json`.

**Privacidad.**
- Antes de la primera interacción se pide consentimiento: completo (texto enmascarado) o solo métricas anónimas (no se guarda texto).
- `lib/pii.ts` enmascara NIF/NIE/CIF, emails, teléfonos, IBAN y tarjetas en todo lo que se registra, también dentro de entradas y salidas de herramientas.
- El audio no se graba: el reconocimiento y la síntesis de voz ocurren en el navegador. Ojo: en Chrome el reconocimiento de voz lo procesa un servicio de Google; si eso no es aceptable, sustituye la Web Speech API por un proveedor de STT propio.
- El agente sí recibe los datos sin enmascarar para poder confirmarlos y validarlos; las herramientas devuelven los emails como pista (`l…@gmail.com`), nunca completos.

## El agente

- **Prompt del sistema**: `lib/agent/prompt.ts`. Es el diseñado en la fase de producto, casi literal, con dos bloques añadidos: uso de herramientas y ficha de producto (`lib/agent/knowledge.ts`), que es la única fuente de verdad sobre lo que el producto hace. En producción esa ficha se sustituye por recuperación (RAG) sobre la documentación.
- **Herramientas** (`lib/agent/tools.ts`): `lookup_booking`, `validate_tax_id`, `check_reconciliation`, `resend_invoice`, `issue_corrective_invoice`, `send_secure_link`, `create_ticket`. Las acciones exigen `confirmed_by_user`, la diferencia de un descuadre la calcula el servidor (no el modelo) y una reserva inexistente devuelve "no encontrada" para que el agente no invente estados.
- **Llamada a Claude** (`lib/agent/core.ts`): streaming, caché de prompt sobre herramientas y sistema, `effort: low` para latencia, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) por si el modelo declina, y manejo de errores tipado. Desactiva el fallback con `ANTHROPIC_DISABLE_FALLBACKS=1`.
- **Voz**: el texto se habla por frases según llega, lo que baja el tiempo hasta el primer audio. Cada enunciado se guarda en memoria hasta que termina (Chrome puede cortar a mitad uno que pierde su referencia). El micrófono también oye al propio agente, así que la interrupción va en dos pasos: con 3 o más palabras que no son eco se **pausa** la voz y se guarda lo que faltaba; si llega una frase completa del usuario se responde a ella, y si en 2,5 s no llega era ruido o eco y el agente **retoma** la frase interrumpida. Tras cada falsa alarma se exigen más palabras para volver a pausar. El turno interrumpido se marca en el historial para que el agente retome donde estaba.

## Evaluación

```bash
npm run eval              # los 28 casos
npm run eval -- F-B OBJ-2 # solo algunos
```

Casos en `evals/cases.ts`: CP-01 a CP-04 (funcionales), flujos A, B y C (rectificativa, descuadre 420/395, NIF inválido en la 304), objeciones ("ya lo hace mi PMS", privacidad), barge-in, deletreo de NIF y de localizador, fuera de alcance (declaración de IVA), anti-alucinación (reserva inexistente), petición de humano y un huésped en inglés. Casos nuevos propuestos: series e impuestos (CP-05), datos fiscales en el check-in online (CP-06), cobro duplicado por preautorización (N-01), reembolso por cancelación (N-02), rectificativa en periodo cerrado (N-03), empresa de otro país de la UE (N-04), petición de datos de otro huésped (N-05), usuario enfadado (N-06), "no te he oído" (N-07) e intento de saltarse las reglas (N-08).

Cada respuesta pasa por comprobaciones deterministas (máximo 3 frases, sin formato, una pregunta por turno, herramientas esperadas, frases obligatorias o prohibidas, escalado sí/no, pide confirmación) y, con clave de API, por un **juez LLM** que puntúa de 1 a 5 **precisión funcional**, **ergonomía de voz** y **gestión del error**. La **latencia** se puntúa por TTFT (5 si es menor de 1,5 s). Un caso pasa si cumple todas las comprobaciones, precisión ≥ 4 y gestión del error ≥ 3.

El informe se guarda en `evals/results/latest.json` (lo muestra `/admin`) y `latest.md`. **El informe incluido en el repositorio se generó en modo demo** (sin clave de API), así que solo prueba que el guion y las comprobaciones funcionan. Ejecuta `npm run eval` con `ANTHROPIC_API_KEY` para obtener los resultados reales del agente con Claude y vuelve a subir `latest.json`.

## Tests

```bash
npm test     # validación NIF/CIF, enmascarado, herramientas, calidad de turno, intenciones
npm run lint # comprobación de tipos
```

## Estructura

```
app/
  page.tsx               landing
  admin/page.tsx         panel de métricas
  api/agent/route.ts     turno del agente (NDJSON en streaming) + registro
  api/events/route.ts    eventos del navegador
  api/admin/*            métricas, export CSV/JSON, último informe de evals
components/              Landing, Simulator, VoiceAgent, AdminDashboard, i18n
lib/agent/               prompt, ficha de producto, herramientas, hotel de demo, modo demo, calidad, intenciones
lib/store/               almacenamiento: Postgres, fichero JSONL o memoria
lib/pii.ts, lib/taxid.ts enmascarado y validación fiscal
evals/                   casos, runner y resultados
docs/PRODUCT.md          decisiones de producto, métricas y siguientes pasos
```
