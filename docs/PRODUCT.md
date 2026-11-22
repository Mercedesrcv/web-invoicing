# Notas de producto

Documento de apoyo para defender las decisiones de la demo en una entrevista de Product Manager.

## Problema

La facturación hotelera no falla en el caso normal (reserva directa, particular, pago con tarjeta). Falla en los bordes, y cada borde cuesta minutos de recepción y administración:

1. **Factura a empresa a última hora.** Llega después de emitir la factura al particular: rectificativa, nueva factura, reenvío.
2. **VCC de OTA.** La estancia se cobra a la tarjeta virtual de la OTA y los extras al huésped. Si se mezclan, la factura es incorrecta.
3. **Descuadres de cobro.** Tasas, preautorizaciones o cargos tras cerrar el folio hacen que pasarela, PMS y factura no cuadren. Se descubre en el cierre de mes.
4. **Datos fiscales incompletos o inválidos.** Bloquean la emisión y obligan a perseguir al huésped.
5. **Desincronización PMS y pasarela.** Estados distintos en cada sistema.

## Usuarios

| Perfil | Trabajo que quiere hacer | Qué le frustra |
|---|---|---|
| Recepción (B2B) | Hacer el check-out sin colas | Pararse a corregir facturas con el huésped delante |
| Administración y contabilidad (B2B) | Cerrar el mes sin descuadres | Conciliar a mano pasarela, VCC y PMS |
| Revenue o dirección (B2B) | Saber si la herramienta compensa | "Mi PMS ya hace facturas" |
| Huésped o empresa cliente (B2C) | Tener su factura correcta, rápido | Pedirla tres veces, dictar el CIF por teléfono |

## Por qué un agente de voz, y con qué límites

La mayoría de incidencias son repetitivas y tienen un diagnóstico claro (factura no recibida, cambio a empresa, NIF inválido). Un agente puede resolverlas en el momento. Las que no, debe **escalarlas bien**, porque un escalado con contexto limpio también es un éxito.

Decisiones de diseño:

- **Voz primero, texto siempre.** Recepción tiene las manos ocupadas; el huésped puede estar en la calle. Pero no todos los navegadores tienen reconocimiento de voz y no todo el mundo quiere hablar: el chat de texto es el mismo agente.
- **Turnos cortos y un dato por turno.** En voz, la memoria de trabajo del usuario es el cuello de botella. Se mide en cada turno (máximo 3 frases, sin listas, una pregunta).
- **Confirmación agrupada de datos críticos.** "B de Barcelona, 87, 45, 21, 09". La validación del dígito de control se hace después, con una herramienta, no a ojo del modelo.
- **No inventar estados.** El agente solo conoce el estado de una factura si se lo devuelve una herramienta. La suite tiene un caso específico (reserva inexistente).
- **No forzar cierres.** Ante un descuadre se crea un ticket de prioridad alta con los cuatro datos que soporte necesita (reserva, importe pasarela, importe factura, diferencia). La diferencia la calcula el servidor.
- **Privacidad como alternativa, no como obstáculo.** Si el usuario no quiere dictar datos, enlace seguro al momento.
- **Fuera de alcance explícito.** No presenta impuestos ni hace asesoría; ofrece exportar los libros para la gestoría.

## Cómo sabemos si funciona

| Pregunta | Métrica | Dónde |
|---|---|---|
| ¿Resuelve? | Resolución declarada (sí/no al final) y contención (sin humano) | `/admin` |
| ¿Escala bien? | Tasa de escalado, prioridad, intención que más escala | `/admin` |
| ¿Es rápido? | TTFT p50/p95, primer audio p50, corte por barge-in | `/admin` |
| ¿Habla bien? | Calidad por turno (reglas de voz) y alertas por regla | `/admin` |
| ¿Gusta? | CSAT 1 a 5 | `/admin` |
| ¿Es fiable antes de lanzar un cambio? | Suite de 18 casos con rúbrica (precisión, voz, error, latencia) | `npm run eval` |

Objetivos orientativos para un piloto: contención por encima del 60 % en incidencias B2C, 0 alucinaciones de estado en la suite, primer audio por debajo de 1,5 s en p50 y corte por barge-in por debajo de 500 ms.

Trade-off conocido: la contención alta no es buena si sube a costa de no escalar descuadres. Por eso se mira junto a la resolución declarada y a la tasa de escalado por intención.

## Siguientes pasos

1. Ejecutar la suite con el modelo real y fijar la línea base; añadir casos a partir de transcripciones reales que fallen.
2. Probar `claude-haiku-5-5` para turnos sencillos y comparar latencia y calidad con la suite antes de cambiar.
3. Sustituir la ficha de producto por recuperación sobre la documentación versionada.
4. STT/TTS de un proveedor con streaming para bajar la latencia y no depender del navegador.
5. Conectar las herramientas a la API real de PMS y pasarela, manteniendo la confirmación explícita antes de cada acción.
6. Canal telefónico (SIP) con el mismo cerebro y la misma monitorización.
