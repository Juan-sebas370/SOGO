export type ReservationStatus = 'Confirmada' | 'Pendiente' | 'Finalizada' | 'Cancelada' | 'No presentada';
export type ReservationType   = 'Individual' | 'Grupo familiar' | 'Grupo de trabajo' | 'Evento / Pasadía';
// Habitación: una o varias habitaciones sueltas · Piso: el piso completo · Casa completa: todos los pisos
export type LodgingType       = 'Habitación' | 'Piso' | 'Casa completa';
export type PaymentStatus     = 'Pagado' | 'Parcial' | 'Pendiente';
// Wompi: pagos en línea hechos desde la página web del hospedaje
export type PaymentMethod     = 'Efectivo' | 'Nequi' | 'Daviplata' | 'Transferencia' | 'Tarjeta' | 'Wompi';
// Por dónde llegó la reserva (Reportes la usa para la mezcla de canales)
export type ReservationChannel = 'Web' | 'Directo' | 'Booking' | 'Airbnb' | 'Walk-in';
export const CHANNELS: ReservationChannel[] = ['Web', 'Directo', 'Booking', 'Airbnb', 'Walk-in'];

export interface Payment {
  date:    string;          // YYYY-MM-DDTHH:mm
  method:  PaymentMethod;
  amount:  number;
  receipt: string;          // n.º de comprobante
}

export interface Reservation {
  id:              string;
  code:            string;          // RSV-2026-00125
  // Huésped principal
  guestName:       string;          // nombre completo (nombres + apellidos)
  firstName?:      string;          // nombres
  lastName?:       string;          // apellidos
  docType:         string;
  docNumber:       string;
  phone:           string;
  email:           string;
  city:            string;          // Ciudad / Departamento de residencia
  // Reserva
  reservationType: ReservationType;
  channel:         ReservationChannel;
  lodgingType:     LodgingType;
  floor?:          number;          // solo cuando lodgingType === 'Piso'
  rooms:           string[];        // números de habitación incluidos
  adults:          number;
  children:        number;
  infants:         number;
  checkIn:         string;          // YYYY-MM-DD
  checkOut:        string;          // YYYY-MM-DD
  nights:          number;
  plan:            string;
  // Valores: total, abonado, saldo y estado del pago se derivan, nunca se guardan aparte
  lodgingAmount:   number;
  extrasAmount:    number;          // servicios adicionales
  payments:        Payment[];
  status:          ReservationStatus;
  // Estadía real (Alojamiento): se llenan al registrar check-in / check-out
  checkedInAt?:    string;          // YYYY-MM-DDTHH:mm
  checkedOutAt?:   string;
  observations:    string;
  createdAt:       string;          // YYYY-MM-DDTHH:mm
  updatedAt:       string;
  cancelReason?:   string;
  dataConsentAt?:  string;          // autorización de tratamiento de datos (Ley 1581)
}

export function totalAmount(r: Reservation): number {
  return r.lodgingAmount + r.extrasAmount;
}

export function paidAmount(r: Reservation): number {
  return r.payments.reduce((s, p) => s + p.amount, 0);
}

export function balance(r: Reservation): number {
  return Math.max(0, totalAmount(r) - paidAmount(r));
}

export function lastPayment(r: Reservation): Payment | undefined {
  return r.payments[r.payments.length - 1];
}

export function paymentStatus(r: Reservation): PaymentStatus {
  const paid = paidAmount(r);
  if (paid >= totalAmount(r) && totalAmount(r) > 0) return 'Pagado';
  return paid > 0 ? 'Parcial' : 'Pendiente';
}

export function totalGuests(r: Reservation): number {
  return r.adults + r.children + r.infants;
}

/** Texto de la columna "Alojamiento": Hab. 201 · 2 habitaciones · Piso 1 · Casa completa */
export function lodgingLabel(r: Reservation): string {
  if (r.lodgingType === 'Casa completa') return 'Casa completa';
  if (r.lodgingType === 'Piso') return `Piso ${r.floor}`;
  return r.rooms.length === 1 ? `Hab. ${r.rooms[0]}` : `${r.rooms.length} habitaciones`;
}

/** Texto de la columna "Habitaciones": 102, 104 · P1 + P2 */
export function roomsLabel(r: Reservation): string {
  return r.lodgingType === 'Casa completa' ? 'P1 + P2' : r.rooms.join(', ');
}

/** El huésped ya hizo check-in y todavía no ha salido. */
export function isInHouse(r: Reservation): boolean {
  return !!r.checkedInAt && !r.checkedOutAt;
}

/** Reserva activa que aún espera su check-in. */
export function awaitsCheckIn(r: Reservation): boolean {
  return (r.status === 'Confirmada' || r.status === 'Pendiente') && !r.checkedInAt;
}

/** Una reserva que ya no ocurrirá: no cuenta para ocupación, pagos ni llegadas. */
export function isVoid(r: Reservation): boolean {
  return r.status === 'Cancelada' || r.status === 'No presentada';
}

/**
 * Separa un nombre completo guardado en un solo campo: 2 palabras → 1 nombre + 1 apellido,
 * 3 → 1 + 2, 4 o más → mitad y mitad. Solo es una sugerencia que se revisa en el formulario.
 */
export function splitFullName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const n = words.length <= 2 ? 1 : words.length === 3 ? 1 : Math.ceil(words.length / 2);
  return [words.slice(0, n).join(' '), words.slice(n).join(' ')];
}
