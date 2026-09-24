import { ReservationStatus, ReservationType, PaymentStatus, ReservationTraStatus } from './reservation.model';

// Formato y colores compartidos por listado, detalle y formulario de reservas,
// para que un mismo estado nunca se pinte distinto entre pantallas.

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** YYYY-MM-DD → dd/MM/yyyy (sin pasar por Date, así no hay desfases de zona horaria) */
export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DDTHH:mm → "24/09/2026 10:32 a. m." */
export function fmtDateTime(iso: string): string {
  const [date, time] = iso.slice(0, 16).split('T');
  if (!time) return fmtDate(date);
  const [h, m] = time.split(':').map(Number);
  return `${fmtDate(date)} ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** YYYY-MM-DD → "25 sep" */
export function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function fmtMoney(value: number): string {
  return money.format(value);
}

export function typeBadge(t: ReservationType): string {
  return {
    'Individual':       'rsv-badge--individual',
    'Grupo familiar':   'rsv-badge--familiar',
    'Grupo de trabajo': 'rsv-badge--trabajo',
    'Evento / Pasadía': 'rsv-badge--evento',
  }[t];
}

export function statusBadge(s: ReservationStatus): string {
  return {
    'Confirmada':    'rsv-badge--info',
    'Pendiente':     'rsv-badge--warn',
    'Finalizada':    'rsv-badge--muted',
    'Cancelada':     'rsv-badge--danger',
    'No presentada': 'rsv-badge--danger',
  }[s];
}

export function paymentBadge(p: PaymentStatus): string {
  return { 'Pagado': 'rsv-badge--ok', 'Parcial': 'rsv-badge--partial', 'Pendiente': 'rsv-badge--warn' }[p];
}

export function traBadge(t: ReservationTraStatus): string {
  return { 'Completa': 'rsv-badge--ok', 'Pendiente': 'rsv-badge--warn', 'No aplica': 'rsv-badge--muted' }[t];
}
