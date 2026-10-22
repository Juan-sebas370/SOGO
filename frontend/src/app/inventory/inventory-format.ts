import { esc } from '../shared/documents';
import { fmtMoney } from '../reservations/reservation-format';
import { Movement, fmtQty, lineValue, movementValue } from './inventory.model';

export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Comprobante imprimible de un movimiento de inventario. */
export function movementHtml(m: Movement, company: string): string {
  const facts = [
    m.supplier && `Proveedor: ${m.supplier}`, m.invoice && `Factura: ${m.invoice}`, m.receivedBy && `Recibió: ${m.receivedBy}`,
    m.area && `Área: ${m.area}`, m.deliveredTo && `Entregado a: ${m.deliveredTo}`, m.reference && `Referencia: ${m.reference}`,
    m.location && `Ubicación: ${m.location}`,
  ].filter(Boolean).map(f => esc(f)).join('<br>');
  return `
  <header><div><h1>${esc(company)}</h1><div class="muted">Comprobante de ${esc(m.kind.toLowerCase())} de inventario · ${esc(m.reason)}</div></div>
  <div class="brand">${esc(m.number)}<div class="muted" style="font-size:12px;font-weight:400">${dmy(m.date)} ${esc(m.time)}</div></div></header>
  <p>${facts}</p>
  <table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cantidad</th><th class="r">Antes</th><th class="r">Después</th><th class="r">Costo unit.</th><th class="r">Valor</th></tr></thead><tbody>
  ${m.lines.map(l => `<tr><td>${esc(l.code)}</td><td>${esc(l.name)}${l.reason ? ` · ${esc(l.reason)}` : ''}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ''}</td>
    <td class="r">${l.qty > 0 ? '+' : ''}${fmtQty(l.qty)} ${esc(l.unit)}</td><td class="r">${fmtQty(l.before)}</td><td class="r">${fmtQty(l.after)}</td>
    <td class="r">${fmtMoney(l.unitCost)}</td><td class="r">${fmtMoney(lineValue(l))}</td></tr>`).join('')}
  <tr class="total"><td colspan="6">Total</td><td class="r">${fmtMoney(movementValue(m))}</td></tr></tbody></table>
  ${m.observations ? `<p>${esc(m.observations)}</p>` : ''}
  <p class="muted">Registró: ${esc(m.user)}</p>
  <p style="margin-top:50px;display:flex;justify-content:space-between"><span>______________________<br>Entrega</span><span>______________________<br>Recibe</span></p>`;
}
