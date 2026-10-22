import { DianStatus, InvoiceState } from './invoice.model';

// Colores compartidos por todas las pantallas de Facturación (clases del kit de página).

export const STATE_BADGE: Record<InvoiceState, string> = {
  'Borrador':  'rsv-badge--muted',
  'Emitida':   'rsv-badge--info',
  'Pendiente': 'rsv-badge--warn',
  'Pagada':    'rsv-badge--ok',
  'Vencida':   'rsv-badge--danger',
  'Anulada':   'rsv-badge--muted',
};

export const DIAN_BADGE: Record<DianStatus, string> = {
  'Borrador':      'rsv-badge--muted',
  'En validación': 'rsv-badge--warn',
  'Aceptada':      'rsv-badge--ok',
  'Rechazada':     'rsv-badge--danger',
};

/** YYYY-MM-DDTHH:mm(:ss) → "HH:mm" */
export function timeOf(at: string): string {
  return at.slice(11, 16);
}

/** YYYY-MM-DD... → "dd/mm" */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}
