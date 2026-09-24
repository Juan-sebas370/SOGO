export type ReservationStatus = 'Confirmada' | 'Pendiente' | 'Finalizada' | 'Cancelada' | 'No presentada';
export type ReservationType   = 'Individual' | 'Grupo familiar' | 'Grupo de trabajo' | 'Evento / Pasadía';
// Habitación: una o varias habitaciones sueltas · Piso: el piso completo · Casa completa: todos los pisos
export type LodgingType       = 'Habitación' | 'Piso' | 'Casa completa';
export type PaymentStatus     = 'Pagado' | 'Parcial' | 'Pendiente';
// Estado del registro TRA exigido para la reserva (una pasadía o una reserva que no se dio no lo requiere)
export type ReservationTraStatus = 'Completa' | 'Pendiente' | 'No aplica';

export interface Reservation {
  id:              string;
  code:            string;          // RSV-2026-00125
  // Huésped principal
  guestName:       string;
  docType:         string;
  docNumber:       string;
  phone:           string;
  email:           string;
  // Reserva
  reservationType: ReservationType;
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
  // Pago: el estado se deriva de estos dos montos, nunca se guarda aparte
  totalAmount:     number;
  paidAmount:      number;
  status:          ReservationStatus;
  traStatus:       ReservationTraStatus;
  observations:    string;
  createdAt:       string;
  cancelReason?:   string;
}

export function paymentStatus(r: Reservation): PaymentStatus {
  if (r.paidAmount >= r.totalAmount && r.totalAmount > 0) return 'Pagado';
  return r.paidAmount > 0 ? 'Parcial' : 'Pendiente';
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

/** Una reserva que ya no ocurrirá: no cuenta para ocupación, pagos ni llegadas. */
export function isVoid(r: Reservation): boolean {
  return r.status === 'Cancelada' || r.status === 'No presentada';
}
