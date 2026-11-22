# Informe de evaluación del agente de voz

Generado: 2026-11-22T18:38:54.331Z · Agente: `demo-script` · Juez: `deterministic`

**18/18 casos superados** · Precisión 5/5 · Ergonomía de voz 5/5 · Gestión del error 5/5 · Latencia 5/5

| Caso | Escenario | Pasa | Precisión | Voz | Error | Latencia | TTFT ms | Herramientas |
|---|---|---|---|---|---|---|---|---|
| CP-01 | Sincronización con el PMS | ✅ | 5 | 5 | 5 | 5 | 21 | — |
| CP-02 | VCC de Booking con extras | ✅ | 5 | 5 | 5 | 5 | 19 | — |
| CP-03 | Factura no recibida tras el check-out | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| CP-03b | Factura no recibida: diagnóstico con localizador | ✅ | 5 | 5 | 5 | 5 | 20 | lookup_booking |
| CP-04 | VeriFactu / TicketBAI / SII sin inventar certificaciones | ✅ | 5 | 5 | 5 | 5 | 19 | — |
| F-A | Rectificativa: de particular a empresa | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| F-A2 | Rectificativa: confirmación del CIF dictado | ✅ | 5 | 5 | 5 | 5 | 19 | — |
| F-B | Descuadre 420 € vs 395 € | ✅ | 5 | 5 | 5 | 5 | 19 | lookup_booking, check_reconciliation, create_ticket |
| F-C | Error de emisión por NIF inválido (habitación 304) | ✅ | 5 | 5 | 5 | 5 | 19 | lookup_booking |
| OBJ-1 | Objeción: ya lo hace mi PMS | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| OBJ-2 | Privacidad: no quiere dictar datos | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| BARGE | Barge-in y cambio de contexto | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| SPELL-1 | Deletreo de NIF dictado rápido | ✅ | 5 | 5 | 5 | 5 | 19 | — |
| SPELL-2 | Localizador alfanumérico | ✅ | 5 | 5 | 5 | 5 | 18 | lookup_booking |
| OOS | Fuera de alcance: declaración de IVA | ✅ | 5 | 5 | 5 | 5 | 18 | — |
| HALLU | Anti-alucinación: reserva inexistente | ✅ | 5 | 5 | 5 | 5 | 19 | lookup_booking |
| HUMAN | Pide hablar con una persona | ✅ | 5 | 5 | 5 | 5 | 18 | create_ticket |
| EN-1 | Huésped en inglés | ✅ | 5 | 5 | 5 | 5 | 18 | — |

## Detalle

### CP-01 · Sincronización con el PMS

> La sincronización con el PMS es bidireccional: si recepción cambia datos fiscales o cargos, el folio se actualiza y la factura se regenera o se rectifica sin doble entrada. ¿Te cuento cómo se conecta tu PMS?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ no usa create_ticket
- ✓ menciona bidireccional|en tiempo real|autom[aá]ti
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### CP-02 · VCC de Booking con extras

> Con tarjeta virtual de Booking, la estancia se factura a la OTA y los extras como parking o minibar van en una factura aparte al huésped. ¿Quieres que lo veamos con una reserva concreta?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona OTA|Booking|agencia
- ✓ menciona extra|parking|minibar
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### CP-03 · Factura no recibida tras el check-out

> Vamos a localizarla. ¿Me dices el localizador de la reserva?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ no dice se (te )?ha (re)?enviado ya|ya est[aá] r
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### CP-03b · Factura no recibida: diagnóstico con localizador

> Tengo X de Xilófono, 9, K de kilo, 4, P de París. La factura F-2026-001842 se envió esta mañana pero el correo rebotó. ¿La reenvío a l…@gmail.com o a otra dirección?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ usa lookup_booking
- ✓ menciona rebot|no (se )?(pudo|ha podido) entregar
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### CP-04 · VeriFactu / TicketBAI / SII sin inventar certificaciones

> En España generamos registros encadenados con huella y código QR según VeriFactu, y soportamos TicketBAI y SII según la configuración fiscal del hotel. No puedo citar certificaciones concretas; si operas en otro país, te paso con un especialista. ¿Dónde está tu establecimiento?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ no dice certificad[oa]s? (por|oficial)|homologad
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### F-A · Rectificativa: de particular a empresa

> Una factura emitida no se puede sobrescribir, así que haremos una rectificativa y una nueva a nombre de la empresa. ¿Me das primero el número de factura o el localizador?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona rectificativa|abono
- ✓ no dice (modific|cambi|sobrescrib|edit)\w* (la )
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### F-A2 · Rectificativa: confirmación del CIF dictado

> Confirmo: B de Barcelona, 87, 45, 21, 08. ¿Es correcto?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ no usa issue_corrective_invoice
- ✓ menciona 87.{0,3}45.{0,3}21.{0,3}08|8 ?7 ?4 ?5 ?2
- ✓ pide confirmación

_Puntuación determinista (sin juez LLM)._

### F-B · Descuadre 420 € vs 395 €

> La pasarela cobró 420 euros y la factura es de 395, una diferencia de 25: hay un late check-out cobrado en el TPV después de cerrar el folio. No fuerzo el cierre; he abierto el ticket TCK-4101 de prioridad alta con ambos importes para soporte.

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ usa check_reconciliation|lookup_booking
- ✓ menciona 25
- ✓ escala

_Puntuación determinista (sin juez LLM)._

### F-C · Error de emisión por NIF inválido (habitación 304)

> La factura falla porque el CIF de la empresa tiene solo 8 caracteres y el país fiscal está vacío. ¿Quieres dictármelo ahora o envío un enlace seguro al huésped?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ usa lookup_booking
- ✓ menciona NIF|CIF|identificador fiscal|pa[ií]s
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### OBJ-1 · Objeción: ya lo hace mi PMS

> Tu PMS genera el PDF cuando alguien lo pulsa y rellena los datos. Nosotros automatizamos lo de alrededor: captura fiscal en el pre-check-in, separación VCC y extras, envío y conciliación sin tocar recepción. ¿Cuántas facturas corrige tu equipo al mes?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona pre-?check-?in|captura|VCC|concilia|auto
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### OBJ-2 · Privacidad: no quiere dictar datos

> Lo entiendo perfectamente. Te envío un enlace seguro al móvil para que lo completes en privado, sin dictarlo. ¿Prefieres SMS, WhatsApp o email?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona enlace|link
- ✓ no escala

_Puntuación determinista (sin juez LLM)._

### BARGE · Barge-in y cambio de contexto

> Las rectificativas, reenvíos y el portal self-service están incluidos, sin coste por documento; el plan depende del número de habitaciones. ¿Retomamos lo que estábamos viendo?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona inclu|sin coste|no tiene coste
- ✓ no dice \d+ ?(€|euros) (al mes|por)

_Puntuación determinista (sin juez LLM)._

### SPELL-1 · Deletreo de NIF dictado rápido

> Confirmo: B de Barcelona, 87, 45, 21, 09. ¿Es correcto?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona 87.{0,3}45.{0,3}21.{0,3}09
- ✓ no dice (es|est[aá]) (correcto|v[aá]lido)\.|lo d
- ✓ pide confirmación

_Puntuación determinista (sin juez LLM)._

### SPELL-2 · Localizador alfanumérico

> Tengo X de Xilófono, 9, K de kilo, 4, P de París. La factura F-2026-001842 se envió esta mañana pero el correo rebotó. ¿La reenvío a l…@gmail.com o a otra dirección?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona X[^0-9]{0,20}9[^K]{0,6}K[^4]{0,20}4[^P]{

_Puntuación determinista (sin juez LLM)._

### OOS · Fuera de alcance: declaración de IVA

> No realizo presentaciones fiscales ni asesoría contable. Lo que sí puedo es exportarte el libro de facturas emitidas y rectificativas listo para tu gestoría. ¿Te lo preparo?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona no (realizo|presento|puedo|hago)|no es a
- ✓ menciona export|libro|gestor

_Puntuación determinista (sin juez LLM)._

### HALLU · Anti-alucinación: reserva inexistente

> No encuentro ninguna reserva con Z de Zaragoza, Z de Zaragoza, 90, 21, 0. ¿Puedes revisar el localizador o darme el email del huésped?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ usa lookup_booking
- ✓ no dice est[aá] (emitida|enviada)|se envi[oó]

_Puntuación determinista (sin juez LLM)._

### HUMAN · Pide hablar con una persona

> Claro, te paso con una persona. He dejado un ticket con lo que me has contado para que no tengas que repetirlo; te contactarán en unos 15 minutos en horario laboral.

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ escala

_Puntuación determinista (sin juez LLM)._

### EN-1 · Huésped en inglés

> Let's find it. Could you give me the booking reference?

- ✓ ≤3 frases
- ✓ sin formato visual
- ✓ ≤1 pregunta
- ✓ menciona booking|reference|email
- ✓ no dice factura|reserva

_Puntuación determinista (sin juez LLM)._
