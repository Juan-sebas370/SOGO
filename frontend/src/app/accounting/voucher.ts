// =====================================================
// Comprobantes contables imprimibles con el formato del contador:
// encabezado del hospedaje (propietario, NIT, dirección, teléfono), recuadro
// del documento con Nº y fecha de emisión, tercero con identificación,
// tabla con centro de costo, sumas iguales, valor en letras y firmas.
// =====================================================

import { esc, logoTile } from '../shared/documents';
import { Entry, EntryKind, accountByCode, costCenterLabel, docTitle } from './accounting.model';
import { Issuer } from './accounting.service';

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function under1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 30 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNITS[r % 10] : '');
  return [HUNDREDS[h], rest].filter(Boolean).join(' ');
}

/** "uno" → "un" delante de mil, millones o pesos ("veintiuno" → "veintiún"). */
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');

function under1e6(x: number): string {
  const miles = Math.floor(x / 1000), u = x % 1000;
  return [miles ? (miles === 1 ? 'mil' : `${apocope(under1000(miles))} mil`) : '', under1000(u)].filter(Boolean).join(' ');
}

/** 5408000 → "Cinco millones cuatrocientos ocho mil pesos m/cte." */
export function amountInWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return 'Cero pesos m/cte.';
  const millones = Math.floor(n / 1_000_000), resto = n % 1_000_000;
  const parts: string[] = [];
  if (millones) parts.push(millones === 1 ? 'un millón' : `${apocope(under1e6(millones))} millones`);
  if (resto) parts.push(under1e6(resto));
  const text = apocope(parts.join(' ')) + (millones && !resto ? ' de' : '');
  return `${text[0].toUpperCase()}${text.slice(1)} pesos m/cte.`;
}

const money = (v: number) => '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const STYLE = `<style>
  .vc { border: 1px solid #1F2937; padding: 22px 24px; margin: 0 0 26px; page-break-inside: avoid; }
  .vc-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
  .vc-issuer { display: flex; gap: 14px; align-items: flex-start; }
  .vc-head h2 { margin: 0 0 4px; font-size: 19px; color: #0A2540; text-transform: uppercase; letter-spacing: .02em; }
  .vc-head p { margin: 1px 0; font-size: 12.5px; }
  .vc-box { border: 2px solid #7CC4B0; padding: 8px 14px; min-width: 230px; }
  .vc-box strong { display: block; font-size: 13.5px; text-transform: uppercase; margin-bottom: 6px; }
  .vc-box div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 2px 0; }
  .vc-box code { font-family: ui-monospace, Consolas, monospace; }
  .vc-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 18px 0 14px; }
  .vc-info span { display: block; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #374151; font-weight: 700; }
  .vc-info b { font-weight: 400; font-size: 12.5px; }
  .vc-note { font-size: 12px; color: #374151; margin: 14px 0; }
  .vc table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .vc th { text-align: left; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; border-bottom: 1.5px solid #1F2937; padding: 6px; background: none; }
  .vc td { border-bottom: 1px solid #D1D5DB; padding: 7px 6px; vertical-align: top; }
  .vc td small { display: block; color: #6B7280; font-size: 10px; }
  .vc .cc { color: #0B6FD0; font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
  .vc .sum td { font-weight: 700; border-top: 1.5px solid #1F2937; border-bottom: none; }
  .vc .blank td { height: 26px; }
  .vc-words { font-size: 12px; margin: 10px 0 30px; }
  .vc-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px 22px; margin-top: 10px; }
  .vc-sign div { border-top: 1px solid #9CA3AF; padding-top: 4px; font-size: 11.5px; color: #374151; }
  .vc-status { font-size: 11px; color: #B91C1C; font-weight: 700; margin-top: 8px; }
  .vc-check { font-size: 12px; }
</style>`;

function header(title: string, number: string, date: string, i: Issuer): string {
  return `
  <div class="vc-head" data-own-letterhead>
    <div class="vc-issuer">${logoTile(64)}<div><h2>${esc(i.nombre)}</h2>
      ${i.propietario ? `<p>Propietario: ${esc(i.propietario)}</p>` : ''}${i.nit ? `<p>NIT ${esc(i.nit)}</p>` : ''}
      ${i.direccion ? `<p>${esc(i.direccion)}</p>` : ''}${i.telefono ? `<p>Tel. ${esc(i.telefono)}</p>` : ''}</div></div>
    <div class="vc-box"><strong>${esc(title)}</strong><div><span>Nº</span><code>${esc(number)}</code></div><div><span>Fecha de emisión</span><code>${esc(date)}</code></div></div>
  </div>`;
}

const signatures = (kind: EntryKind) => `<div class="vc-sign"><div>Elaboró</div><div>Revisó</div><div>Aprobó</div><div>Contabilizó</div>
  <div>${kind === 'Egreso' || kind === 'Pago' ? 'Recibí conforme (firma y NIT/CC)' : 'Firma y sello'}</div></div>`;

const NOTE_TEXT: Partial<Record<EntryKind, string>> = {
  'Nota crédito': 'Se emite para disminuir el valor cobrado a un cliente en una factura: errores, devoluciones o rebajas, o para anular una factura electrónica. Debe enlazarse con la facturación electrónica. Una factura que simplemente no se pagó no va aquí: se maneja como cartera deteriorada o incobrable.',
  'Nota débito': 'Se emite para cobrar al cliente un valor adicional al valor inicial facturado. Debe enlazarse con la facturación electrónica.',
};

/** Comprobante contable con el formato del contador. */
export function voucherHtml(e: Entry, issuer: Issuer): string {
  const title = docTitle(e.kind);
  const debit = e.lines.reduce((s, l) => s + l.debit, 0), credit = e.lines.reduce((s, l) => s + l.credit, 0);
  const isReceipt = e.kind === 'Ingreso' || e.kind === 'Cobro', isPayment = e.kind === 'Egreso' || e.kind === 'Pago', isNote = e.kind.startsWith('Nota ');
  const thirdLabel = isReceipt ? 'Recibido de' : isPayment ? 'Pagado a' : isNote ? 'Cliente' : 'Tercero';
  const docLabel = e.thirdDoc && /^\d{9,10}(-\d)?$/.test(e.thirdDoc.replace(/\./g, '')) && e.thirdDoc.includes('-') ? 'NIT' : 'Identificación';
  const info = [
    `<div><span>${thirdLabel}</span><b>${esc(e.third || '—')}</b></div>`,
    `<div><span>${isNote ? 'NIT / CC' : docLabel}</span><b>${esc(e.thirdDoc || '—')}</b></div>`,
    isReceipt || isPayment ? `<div><span>Forma de pago</span><b>${esc(e.method || '—')}</b></div>` : '',
    isNote ? `<div><span>Factura que afecta</span><b>${esc(e.invoiceRef || '—')}</b></div>` : '',
    isNote ? `<div><span>${e.kind === 'Nota débito' ? 'Motivo del cobro adicional' : 'Motivo'}</span><b>${esc(e.noteReason || '—')}</b></div>` : '',
    `<div><span>Concepto</span><b>${esc(e.concept)}</b></div>`,
  ].filter(Boolean).join('');
  const rows = e.lines.map(l => `<tr>
    <td>${esc(l.account)}</td><td>${esc(accountByCode(l.account)?.name ?? '')}</td>
    <td>${esc(l.third || e.third || '')}${l.thirdDoc || e.thirdDoc ? `<small>${esc(l.thirdDoc || e.thirdDoc || '')}</small>` : ''}</td>
    <td class="cc">${esc(costCenterLabel(l.costCenter))}</td><td>${esc(l.detail || '')}</td>
    <td class="r">${money(l.debit)}</td><td class="r">${money(l.credit)}</td></tr>`).join('');
  return `${STYLE}<div class="vc">
    ${header(title, e.number, dmy(e.date), issuer)}
    ${isNote && NOTE_TEXT[e.kind] ? `<p class="vc-note">${NOTE_TEXT[e.kind]}</p>` : ''}
    <div class="vc-info">${info}</div>
    <table><thead><tr><th>Código</th><th>Cuenta</th><th>Tercero</th><th>Centro de costo</th><th>Descripción</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
    <tbody>${rows}<tr class="sum"><td colspan="5">Sumas iguales</td><td class="r">${money(debit)}</td><td class="r">${money(credit)}</td></tr></tbody></table>
    <p class="vc-words"><b>Valor en letras:</b> ${amountInWords(debit)}</p>
    ${[...e.supports, ...(e.files ?? []).map(f => f.name)].length ? `<p class="vc-note">Soportes: ${esc([...e.supports, ...(e.files ?? []).map(f => f.name)].join(', '))}</p>` : ''}
    ${e.observations ? `<p class="vc-note">${esc(e.observations)}</p>` : ''}
    ${signatures(e.kind)}
    ${e.status === 'Anulado' ? `<p class="vc-status">ANULADO${e.annulment ? ' · ' + esc(e.annulment.reason) : ''}</p>` : e.status !== 'Contabilizado' ? `<p class="vc-status">${esc(e.status.toUpperCase())}</p>` : ''}
  </div>`;
}

/** Formato en blanco (para llenar a mano) de una nota crédito, débito u otro comprobante. */
export function blankVoucherHtml(kind: EntryKind, issuer: Issuer, prefix: string): string {
  const isNote = kind.startsWith('Nota ');
  const info = isNote
    ? `<div><span>Cliente</span><b>&nbsp;</b></div><div><span>NIT / CC</span><b>&nbsp;</b></div>
       <div><span>Factura que afecta</span><b>&nbsp;</b></div>
       <div><span>${kind === 'Nota débito' ? 'Motivo del cobro adicional' : 'Motivo'}</span><b class="vc-check">${kind === 'Nota crédito' ? '☐ Error ☐ Devolución ☐ Rebaja ☐ Anulación' : '&nbsp;'}</b></div>`
    : `<div><span>Tercero</span><b>&nbsp;</b></div><div><span>Identificación</span><b>&nbsp;</b></div><div><span>Concepto</span><b>&nbsp;</b></div>`;
  return `${STYLE}<div class="vc">
    ${header(docTitle(kind), `${prefix}-______`, '__/__/____', issuer)}
    ${NOTE_TEXT[kind] ? `<p class="vc-note">${NOTE_TEXT[kind]}</p>` : ''}
    <div class="vc-info">${info}</div>
    <table><thead><tr><th>Código</th><th>Cuenta</th><th>Tercero</th><th>Centro de costo</th><th>Descripción</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
    <tbody>${'<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(4)}
    <tr class="sum"><td colspan="5">Sumas iguales</td><td></td><td></td></tr></tbody></table>
    <p class="vc-words"><b>Valor en letras:</b></p>
    ${signatures(kind)}
  </div>`;
}
