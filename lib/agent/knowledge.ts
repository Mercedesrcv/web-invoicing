/**
 * Base de conocimiento de producto (lo que el agente PUEDE afirmar).
 * Separada a propósito de las reglas operativas del prompt: en producción
 * esto se sustituye por recuperación (RAG) sobre la documentación versionada.
 * Si algo no está aquí, el agente no debe afirmarlo.
 */
export const PRODUCT_KNOWLEDGE = `
# FICHA DE PRODUCTO (fuente de verdad; si un dato no está aquí, no lo afirmes)
- Qué es: plataforma que emite, envía y concilia facturas automáticamente a partir del check-in/check-out, los datos fiscales capturados y los cargos/pagos del PMS y la pasarela.
- Captura de datos fiscales: el huésped o la empresa introduce NIF/CIF/VAT, razón social y dirección en el pre-check-in online, en recepción o en un portal self-service, también después del check-out mediante enlace seguro. Se valida el formato y el dígito de control antes de emitir.
- Sincronización con PMS: bidireccional. Los cambios de datos fiscales o de líneas de cargo en el PMS actualizan el folio; si la factura aún no está emitida se regenera, si ya está emitida se gestiona con rectificativa. Sin doble entrada manual. Los retrasos de sincronización se muestran como estado "pendiente de sync".
- Series e impuestos: se configuran por establecimiento en el panel (series para facturas, rectificativas y simplificadas; tipos de IVA por concepto; tasa turística como concepto no sujeto cuando corresponde). Cambiar series de un periodo ya emitido requiere a un administrador.
- Split billing y VCC: reglas de folio que separan la estancia (facturada a la OTA o agencia y cobrada a su tarjeta virtual) de los extras (parking, minibar, tasa turística), que se facturan y cobran al huésped.
- Rectificativas: una factura emitida nunca se sobrescribe. Se emite una rectificativa (abono) y una nueva factura con los datos correctos. Si el periodo contable está cerrado, lo aprueba administración.
- Envío: email, SMS o WhatsApp con enlace de descarga; reenvío bajo demanda; registro de entrega.
- Conciliación: cruza importes de la pasarela, la VCC y el folio del PMS; marca descuadres con su causa probable (cargos tras el cierre, tasas, preautorizaciones no liberadas, retrasos de sync) y no fuerza cierres.
- Cumplimiento en España: numeración correlativa e inalterable, registros encadenados con huella (hash) y código QR según el formato VeriFactu; soporte TicketBAI en territorios forales y envío al SII cuando el establecimiento está obligado, según su configuración fiscal. No hay certificaciones, sellos ni homologaciones que puedas citar; para otros países o dudas normativas concretas, ofrece un especialista.
- Exportación: libros de facturas emitidas y rectificativas en CSV/Excel listos para la gestoría. No presentamos impuestos ni hacemos asesoría fiscal.
- Precio: planes según número de habitaciones o unidades; rectificativas, reenvíos y portal self-service incluidos sin coste por documento. No des cifras: el equipo comercial prepara la propuesta.
- Integraciones: PMS y pasarelas de pago mediante conectores; la lista concreta la confirma el equipo de integraciones (no enumeres marcas).
`.trim();
