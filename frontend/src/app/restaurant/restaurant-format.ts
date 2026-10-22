import { isoDate } from '../shared/date-utils';
import { logoTile, esc } from '../shared/documents';
import { amountInWords } from '../billing/number-words';
import { fmtMoney } from '../reservations/reservation-format';
import { RestaurantOrder, orderTotals, sumTotals, shortNumber } from './restaurant.model';

/** YYYY-MM-DDTHH:mm → "hoy 08:20" · "ayer 20:15" · "25/09 13:00" */
export function dayTime(iso: string): string {
  const [date, time = ''] = iso.split('T');
  const day = date === isoDate(0) ? 'hoy' : date === isoDate(-1) ? 'ayer' : dayMonth(date);
  return `${day} ${time.slice(0, 5)}`.trim();
}

/** YYYY-MM-DD → "25/09" */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** YYYY-MM-DDTHH:mm → "28/09/2026 · 08:20" */
export function stamp(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y} · ${iso.slice(11, 16)}`;
}

/** Comanda para cocina (se imprime en una pestaña nueva). */
export function ticketHtml(o: RestaurantOrder): string {
  const where = o.reservationId ? `${o.unitLabel} · ${o.clientName}` : `${o.table} · ${o.clientName}`;
  return `
  <header><div><h1>Comanda ${esc(shortNumber(o.number))}</h1><div class="muted">${esc(where)}</div></div>
  <div class="brand">${esc(stamp(o.createdAt))}</div></header>
  <table><thead><tr><th>Cant.</th><th>Producto</th></tr></thead><tbody>
  ${o.items.map(i => `<tr><td><strong>${i.quantity}</strong></td><td>${esc(i.name)}</td></tr>`).join('')}
  </tbody></table>
  ${o.observations ? `<h2>Observaciones</h2><p>${esc(o.observations)}</p>` : ''}
  <p class="muted">Registrado por ${esc(o.createdBy)}</p>`;
}

/** Factura electrónica del restaurante (representación gráfica imprimible). */
export function invoiceHtml(orders: RestaurantOrder[], issuer: { name: string; nit: string; address: string; city: string }): string {
  const inv = orders[0].invoice!;
  const t = sumTotals(orders);
  const origin = orders.length === 1 ? `Pedido ${orders[0].number}` : `${orders.length} pedidos · ${orders[0].unitLabel}`;
  const lines = orders.flatMap(o => o.items).map(i =>
    `<tr><td>${esc(i.name)}</td><td class="r">${i.quantity}</td><td class="r">${fmtMoney(i.unitPrice)}</td><td>INC ${Math.round(orders[0].taxRate * 100)}%</td><td class="r">${fmtMoney(i.unitPrice * i.quantity)}</td></tr>`).join('');
  return `
  <header data-own-letterhead><div style="display:flex;gap:14px;align-items:center">${logoTile(56)}<div><h1>${esc(issuer.name)}</h1>
  <div class="muted">NIT ${esc(issuer.nit)} · ${esc(issuer.address)} · ${esc(issuer.city)}</div></div></div>
  <div class="brand">FACTURA ELECTRÓNICA<br>${esc(inv.number)}<div class="muted" style="font-size:12px;font-weight:400">${esc(stamp(inv.at))}<br>Contado · ${esc(inv.method)}</div></div></header>
  <p><strong>Cliente:</strong> ${esc(inv.clientName)} · ${esc(inv.clientDoc)}<br><strong>Origen:</strong> ${esc(origin)}</p>
  <table><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">V. unitario</th><th>Impuesto</th><th class="r">Valor</th></tr></thead>
  <tbody>${lines}
  <tr><td colspan="4" class="r">Subtotal</td><td class="r">${fmtMoney(t.subtotal)}</td></tr>
  <tr><td colspan="4" class="r">INC</td><td class="r">${fmtMoney(t.tax)}</td></tr>
  <tr class="total"><td colspan="4" class="r">Total</td><td class="r">${fmtMoney(t.total)}</td></tr></tbody></table>
  <p class="muted">${esc(amountInWords(t.total))}</p>
  <p class="muted" style="word-break:break-all"><strong>CUFE:</strong> ${esc(inv.cufe)}</p>`;
}

export const orderTotal = (o: RestaurantOrder) => orderTotals(o).total;
