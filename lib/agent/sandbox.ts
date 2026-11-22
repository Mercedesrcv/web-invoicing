/**
 * Hotel de demostración. Los datos son ficticios y sirven para que el agente
 * trabaje con estados reales devueltos por herramientas (no inventados).
 * Cada reserva representa uno de los escenarios de la matriz de pruebas.
 */
export interface FolioLine {
  concept: string;
  amount: number;
  billTo: "guest" | "ota" | "company";
  postedAfterClose?: boolean;
}

export interface Booking {
  id: string;
  locator: string;
  room: string;
  guestName: string;
  email: string;
  channel: "direct" | "booking.com" | "expedia" | "agency";
  payment: "card" | "vcc" | "transfer";
  checkIn: string;
  checkOut: string;
  status: "in_house" | "checked_out";
  pmsSync: "ok" | "delayed";
  folio: FolioLine[];
  gatewayCharged: number;
  invoices: Array<{
    id: string;
    to: string;
    taxId?: string;
    total: number;
    status: "issued" | "sent" | "queued" | "error";
    error?: string;
    sentAt?: string;
    delivery?: "delivered" | "bounced" | "pending";
    periodClosed?: boolean;
  }>;
}

export const BOOKINGS: Booking[] = [
  {
    id: "RES-10231",
    locator: "X9K4P",
    room: "112",
    guestName: "Laura Méndez",
    email: "laura.mendez@gmail.com",
    channel: "direct",
    payment: "card",
    checkIn: "2026-11-19",
    checkOut: "2026-11-22",
    status: "checked_out",
    pmsSync: "ok",
    folio: [
      { concept: "Alojamiento 3 noches", amount: 330, billTo: "guest" },
      { concept: "Desayunos", amount: 45, billTo: "guest" },
    ],
    gatewayCharged: 375,
    invoices: [
      { id: "F-2026-001842", to: "Laura Méndez", total: 375, status: "sent", sentAt: "2026-11-22T10:14:00+01:00", delivery: "bounced" },
    ],
  },
  {
    id: "RES-10377",
    locator: "BK-55120",
    room: "208",
    guestName: "Tom Becker",
    email: "t.becker@example.de",
    channel: "booking.com",
    payment: "vcc",
    checkIn: "2026-11-20",
    checkOut: "2026-11-22",
    status: "in_house",
    pmsSync: "ok",
    folio: [
      { concept: "Alojamiento 2 noches (VCC Booking.com)", amount: 280, billTo: "ota" },
      { concept: "Parking 2 días", amount: 36, billTo: "guest" },
      { concept: "Minibar", amount: 12.5, billTo: "guest" },
      { concept: "Tasa turística (no sujeta a IVA)", amount: 8, billTo: "guest" },
    ],
    gatewayCharged: 280,
    invoices: [{ id: "F-2026-001851", to: "Booking.com B.V.", total: 280, status: "issued" }],
  },
  {
    id: "RES-10188",
    locator: "LOC-7781",
    room: "415",
    guestName: "Javier Ortega",
    email: "javier.ortega@outlook.com",
    channel: "direct",
    payment: "card",
    checkIn: "2026-11-19",
    checkOut: "2026-11-21",
    status: "checked_out",
    pmsSync: "ok",
    folio: [{ concept: "Alojamiento 2 noches", amount: 312.4, billTo: "guest" }],
    gatewayCharged: 312.4,
    invoices: [{ id: "F-2026-001799", to: "Javier Ortega", total: 312.4, status: "sent", delivery: "delivered", sentAt: "2026-11-21T11:02:00+01:00", periodClosed: false }],
  },
  {
    id: "RES-10402",
    locator: "DQ-420",
    room: "215",
    guestName: "Marta Ruiz",
    email: "marta.ruiz@empresa-demo.es",
    channel: "direct",
    payment: "card",
    checkIn: "2026-11-20",
    checkOut: "2026-11-22",
    status: "checked_out",
    pmsSync: "delayed",
    folio: [
      { concept: "Alojamiento 2 noches", amount: 360, billTo: "guest" },
      { concept: "Desayunos", amount: 35, billTo: "guest" },
    ],
    gatewayCharged: 420,
    invoices: [{ id: "F-2026-001856", to: "Marta Ruiz", total: 395, status: "sent", delivery: "delivered" }],
  },
  {
    id: "RES-10415",
    locator: "R304-88",
    room: "304",
    guestName: "Nordic Consulting S.L. (huésped: Erik Lund)",
    email: "admin@nordic-demo.com",
    channel: "agency",
    payment: "transfer",
    checkIn: "2026-11-18",
    checkOut: "2026-11-22",
    status: "checked_out",
    pmsSync: "ok",
    folio: [{ concept: "Alojamiento 4 noches", amount: 540, billTo: "company" }],
    gatewayCharged: 0,
    invoices: [
      { id: "BORRADOR-304", to: "Nordic Consulting S.L.", taxId: "B8745210", total: 540, status: "error", error: "TAX_ID_INVALID: el NIF/CIF tiene 8 caracteres y el país fiscal está vacío" },
    ],
  },
];

/** Cargos registrados en la pasarela que no llegaron al folio (para conciliación). */
export const GATEWAY_EXTRA: Record<string, Array<{ concept: string; amount: number; at: string }>> = {
  "RES-10402": [{ concept: "Late check-out cobrado en TPV tras cerrar el folio", amount: 25, at: "2026-11-22T12:41:00+01:00" }],
};

export function maskEmailHint(email: string) {
  const [u, d] = email.split("@");
  return `${u[0]}…@${d}`;
}

export function findBooking(q: { locator?: string; room?: string; email?: string }): Booking | undefined {
  const norm = (s?: string) => (s ?? "").toUpperCase().replace(/[\s\-]/g, "");
  return BOOKINGS.find(
    (b) =>
      (q.locator && (norm(b.locator) === norm(q.locator) || norm(b.id) === norm(q.locator))) ||
      (q.room && b.room === String(q.room).replace(/\D/g, "")) ||
      (q.email && b.email.toLowerCase() === q.email.toLowerCase().trim()),
  );
}
