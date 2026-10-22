import {
  Reservation, paymentStatus, totalAmount, paidAmount, balance, totalGuests, lodgingLabel, roomsLabel
} from './reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from './reservation-format';
import { isoDateTime } from '../shared/date-utils';
import { esc, openDocument, downloadCsvFile } from '../shared/documents';

// Documentos de una reserva: confirmación, comprobante de pago, correo y CSV.

function header(title: string, r: Reservation): string {
  return `<header><div><h1>${esc(title)}</h1><div class="muted">Reserva ${esc(r.code)} · generado el ${esc(fmtDateTime(isoDateTime()))}</div></div>
  <div class="brand">SOGO<div class="muted" style="font-size:11px;font-weight:400">Hospedaje Sebastián</div></div></header>`;
}

/** Planilla / confirmación de la reserva. */
export function openConfirmation(r: Reservation, print = false): void {
  const rows = (pairs: [string, unknown][]) => pairs.map(([k, v]) => `<tr><th style="width:38%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  openDocument(`Reserva ${r.code}`, `${header('Confirmación de reserva', r)}
  <h2>Cliente</h2><table>${rows([
    ['Nombre', r.guestName], [r.docType, r.docNumber], ['Teléfono', r.phone], ['Correo', r.email], ['Ciudad / Departamento', r.city],
  ])}</table>
  <h2>Reserva</h2><table>${rows([
    ['Estado', r.status], ['Tipo de reserva', r.reservationType], ['Alojamiento', lodgingLabel(r)], ['Habitaciones', roomsLabel(r)],
    ['Entrada', fmtDate(r.checkIn)], ['Salida', fmtDate(r.checkOut)], ['Noches', r.nights || 'Pasadía'],
    ['Huéspedes', `${totalGuests(r)} (${r.adults} adultos · ${r.children} niños · ${r.infants} bebés)`], ['Plan / tarifa', r.plan],
  ])}</table>
  <h2>Valores</h2><table>${rows([
    ['Total', fmtMoney(totalAmount(r))], ['Pagado', fmtMoney(paidAmount(r))], ['Saldo pendiente', fmtMoney(balance(r))], ['Estado del pago', paymentStatus(r)],
  ])}</table>
  ${r.observations ? `<h2>Observaciones</h2><p>${esc(r.observations)}</p>` : ''}`, print);
}

/** Comprobante de pago con el detalle de cada abono. */
export function openPaymentReceipt(r: Reservation, print = false): void {
  const lines = r.payments.map(p => `<tr><td>${esc(fmtDateTime(p.date))}</td><td>${esc(p.method)}</td><td>${esc(p.receipt)}</td><td class="r">${esc(fmtMoney(p.amount))}</td></tr>`).join('')
    || `<tr><td colspan="4" class="muted">Aún no se han registrado pagos.</td></tr>`;
  openDocument(`Comprobante ${r.code}`, `${header('Comprobante de pago', r)}
  <p><strong>${esc(r.guestName)}</strong> · ${esc(r.docType)} ${esc(r.docNumber)}<br><span class="muted">${esc(lodgingLabel(r))} · ${esc(fmtDate(r.checkIn))} - ${esc(fmtDate(r.checkOut))}</span></p>
  <h2>Liquidación</h2><table>
    <tr><td>Alojamiento (${r.nights || 'pasadía'}${r.nights ? ' noches' : ''})</td><td class="r">${esc(fmtMoney(r.lodgingAmount))}</td></tr>
    <tr><td>Servicios adicionales</td><td class="r">${esc(fmtMoney(r.extrasAmount))}</td></tr>
    <tr class="total"><td>Total</td><td class="r">${esc(fmtMoney(totalAmount(r)))}</td></tr>
  </table>
  <h2>Pagos recibidos</h2><table><tr><th>Fecha</th><th>Método</th><th>N.º comprobante</th><th class="r">Valor</th></tr>${lines}
    <tr class="total"><td colspan="3">Total pagado</td><td class="r">${esc(fmtMoney(paidAmount(r)))}</td></tr>
    <tr><td colspan="3">Saldo pendiente</td><td class="r">${esc(fmtMoney(balance(r)))}</td></tr>
  </table>`, print);
}

/** Enlace mailto con el resumen de la reserva para el huésped. */
export function guestMailto(r: Reservation): string {
  const body = [
    `Hola ${r.guestName},`, '',
    `Te compartimos el resumen de tu reserva ${r.code}:`,
    `- Alojamiento: ${lodgingLabel(r)} (habitaciones ${roomsLabel(r)})`,
    `- Entrada: ${fmtDate(r.checkIn)} · Salida: ${fmtDate(r.checkOut)}`,
    `- Huéspedes: ${totalGuests(r)}`,
    `- Total: ${fmtMoney(totalAmount(r))} · Pagado: ${fmtMoney(paidAmount(r))} · Saldo: ${fmtMoney(balance(r))}`,
    `- Estado: ${r.status}`, '', 'Hospedaje Sebastián',
  ].join('\n');
  return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(`Tu reserva ${r.code}`)}&body=${encodeURIComponent(body)}`;
}

/** Listado de reservas en CSV. */
export function downloadCsv(rows: Reservation[], traStatus: (r: Reservation) => string, fileName: string): void {
  if (!rows.length) return;
  const header = ['Código', 'Huésped principal', 'Documento', 'Teléfono', 'Correo', 'Ciudad', 'Tipo de reserva', 'Alojamiento',
    'Habitaciones', 'Adultos', 'Niños', 'Bebés', 'Entrada', 'Salida', 'Noches', 'Alojamiento ($)', 'Servicios ($)', 'Total',
    'Pagado', 'Saldo', 'Pago', 'Estado', 'TRA'];
  const lines = rows.map(r => [
    r.code, r.guestName, `${r.docType} ${r.docNumber}`, r.phone, r.email, r.city, r.reservationType, lodgingLabel(r),
    roomsLabel(r), r.adults, r.children, r.infants, fmtDate(r.checkIn), fmtDate(r.checkOut), r.nights,
    r.lodgingAmount, r.extrasAmount, totalAmount(r), paidAmount(r), balance(r), paymentStatus(r), r.status, traStatus(r),
  ]);
  downloadCsvFile([header, ...lines], fileName);
}
