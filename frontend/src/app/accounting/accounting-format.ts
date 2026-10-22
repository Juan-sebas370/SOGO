import { esc } from '../shared/documents';
import { fmtMoney } from '../reservations/reservation-format';
import { Entry, accountLabel, entryTotal } from './accounting.model';

export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Valor con signo para variaciones: "+8,0%" / "−5,2 pp". */
export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export const variation = (cur: number, prev: number) => prev ? ((cur - prev) / Math.abs(prev)) * 100 : NaN;

/** "15,2 M" para ejes y etiquetas de gráficas. */
export const millions = (v: number) => `${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;

/** Comprobante contable imprimible. */
export function entryHtml(e: Entry, company: string): string {
  const d = e.lines.reduce((s, l) => s + l.debit, 0), c = e.lines.reduce((s, l) => s + l.credit, 0);
  return `
  <header><div><h1>${esc(company)}</h1><div class="muted">Comprobante contable · ${esc(e.kind)} · ${esc(e.origin)}</div></div>
  <div class="brand">${esc(e.number)}<div class="muted" style="font-size:12px;font-weight:400">${dmy(e.date)} ${esc(e.time)}</div></div></header>
  <p><strong>Concepto:</strong> ${esc(e.concept)}${e.third ? `<br><strong>Tercero:</strong> ${esc(e.third)}` : ''}${e.sourceRef ? `<br><strong>Origen:</strong> ${esc(e.origin)} · ${esc(e.sourceRef)}` : ''}</p>
  <table><thead><tr><th>Cuenta</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead><tbody>
  ${e.lines.map(l => `<tr><td>${esc(accountLabel(l.account))}</td><td>${esc(l.detail)}</td><td class="r">${l.debit ? fmtMoney(l.debit) : ''}</td><td class="r">${l.credit ? fmtMoney(l.credit) : ''}</td></tr>`).join('')}
  <tr class="total"><td colspan="2">Sumas iguales</td><td class="r">${fmtMoney(d)}</td><td class="r">${fmtMoney(c)}</td></tr></tbody></table>
  ${[...e.supports, ...(e.files ?? []).map(f => f.name)].length ? `<p class="muted">Soportes: ${esc([...e.supports, ...(e.files ?? []).map(f => f.name)].join(', '))}</p>` : ''}
  ${e.observations ? `<p>${esc(e.observations)}</p>` : ''}
  <p class="muted">Estado: ${esc(e.status)} · Registró: ${esc(e.createdBy)} · Valor ${fmtMoney(entryTotal(e))}</p>`;
}
