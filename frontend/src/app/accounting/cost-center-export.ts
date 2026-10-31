import { CostCenter, Entry, accountByCode, counts, debitNature, isClosing, isResultAccount } from './accounting.model';
import { esc } from '../shared/documents';
import { fmtMoney } from '../reservations/reservation-format';

/** Grupo del estado de resultados: 4 ingresos, 6 y 7 costos, 5 gastos (sin la 59 de cierre). */
export type CcGroup = 'Ingresos' | 'Costos' | 'Gastos';
export const groupOf = (code: string): CcGroup => code[0] === '4' ? 'Ingresos' : code[0] === '5' ? 'Gastos' : 'Costos';

/** Código con el que se agrupan las líneas que quedaron sin centro de costo. */
export const NO_CENTER = 'SIN';

export interface CcLine { date: string; number: string; concept: string; third: string; detail: string; debit: number; credit: number; }
export interface CcAccount { code: string; name: string; group: CcGroup; value: number; lines: CcLine[]; }
export interface CcResult {
  code: string; name: string;
  income: number; costs: number; expenses: number;
  /** Ingresos − costos − gastos. */ result: number;
  /** Resultado sobre ingresos (null si no hubo ingresos). */ margin: number | null;
  accounts: CcAccount[];
}

/**
 * Estado de resultados por centro de costo en el rango. Toma el centro que trae cada línea del
 * comprobante (no reparte con reglas) y no cuenta el comprobante de cierre anual. Las líneas sin
 * centro se muestran aparte para que el contador las corrija.
 */
export function costCenterReport(entries: Entry[], from: string, to: string, centers: CostCenter[]): CcResult[] {
  const map = new Map<string, Map<string, CcAccount>>();
  entries.filter(e => counts(e) && !isClosing(e) && e.date >= from && e.date <= to)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .forEach(e => e.lines.filter(l => isResultAccount(l.account)).forEach(l => {
      const cc = l.costCenter || NO_CENTER;
      const accounts = map.get(cc) ?? new Map<string, CcAccount>();
      map.set(cc, accounts);
      const acc = accounts.get(l.account) ?? { code: l.account, name: accountByCode(l.account)?.name ?? '', group: groupOf(l.account), value: 0, lines: [] };
      accounts.set(l.account, acc);
      acc.value += debitNature(l.account) ? l.debit - l.credit : l.credit - l.debit;
      acc.lines.push({ date: e.date, number: e.number, concept: e.concept, third: l.third || e.third, detail: l.detail ?? '', debit: l.debit, credit: l.credit });
    }));

  const list = centers.map(c => ({ code: c.code, name: c.name }));
  if (map.has(NO_CENTER)) list.push({ code: NO_CENTER, name: 'Sin centro asignado' });
  [...map.keys()].filter(k => !list.some(c => c.code === k)).forEach(k => list.push({ code: k, name: k }));

  return list.map(({ code, name }) => {
    const accounts = [...(map.get(code)?.values() ?? [])].map(a => ({ ...a, value: Math.round(a.value) }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const sum = (g: CcGroup) => accounts.filter(a => a.group === g).reduce((s, a) => s + a.value, 0);
    const income = sum('Ingresos'), costs = sum('Costos'), expenses = sum('Gastos');
    const result = income - costs - expenses;
    return { code, name, income, costs, expenses, result, margin: income ? result / income : null, accounts };
  });
}

/** Suma de varios centros (la columna "Total"). */
export function ccTotal(list: CcResult[]): CcResult {
  const income = list.reduce((s, c) => s + c.income, 0), costs = list.reduce((s, c) => s + c.costs, 0), expenses = list.reduce((s, c) => s + c.expenses, 0);
  const result = income - costs - expenses;
  return { code: 'TOTAL', name: 'Total', income, costs, expenses, result, margin: income ? result / income : null, accounts: [] };
}

const pct = (m: number | null) => m === null ? '' : `${(m * 100).toFixed(1).replace('.', ',')} %`;
const centerTitle = (c: CcResult) => c.code === NO_CENTER ? c.name : `${c.code} ${c.name}`;

/** Filas para Excel / CSV: resumen por centro y luego el detalle por cuenta (o por movimiento). */
export function costCenterRows(list: CcResult[], withLines: boolean): unknown[][] {
  // Sin movimientos basta con cuenta y valor; con movimientos se agregan fecha, comprobante, tercero, débito y crédito
  const blank = withLines ? ['', '', '', '', '', ''] : [];
  const rows: unknown[][] = [
    ['Centro de costo', 'Grupo', 'Código', 'Cuenta', ...(withLines ? ['Fecha', 'Comprobante', 'Tercero', 'Descripción', 'Débito', 'Crédito'] : []), 'Valor'],
  ];
  list.forEach(c => {
    (['Ingresos', 'Costos', 'Gastos'] as CcGroup[]).forEach(g => c.accounts.filter(a => a.group === g).forEach(a => {
      if (withLines) a.lines.forEach(l => rows.push([centerTitle(c), g, a.code, a.name, l.date, l.number, l.third, l.detail || l.concept, l.debit, l.credit, '']));
      rows.push([centerTitle(c), g, a.code, withLines ? `Total ${a.name}` : a.name, ...blank, a.value]);
    }));
    rows.push([centerTitle(c), 'Resultado', '', `Resultado del centro${c.margin === null ? '' : ` (margen ${pct(c.margin)})`}`, ...blank, c.result]);
  });
  return rows;
}

/** Informe imprimible: comparativo de los centros y el detalle de cada uno. */
export function costCenterHtml(list: CcResult[], o: { company: string; period: string; user: string; withLines: boolean }): string {
  const many = list.length > 1;
  const cols = many ? [...list, ccTotal(list)] : list;
  const money = (v: number) => v ? fmtMoney(v) : '—';
  const row = (label: string, pick: (c: CcResult) => string, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td>${cols.map(c => `<td class="r">${pick(c)}</td>`).join('')}</tr>`;
  const summary = `
  <table><thead><tr><th></th>${cols.map(c => `<th class="r">${esc(c.name)}${c.code !== 'TOTAL' && c.code !== NO_CENTER ? `<br><span class="muted">${esc(c.code)}</span>` : ''}</th>`).join('')}</tr></thead><tbody>
    ${row('Ingresos', c => money(c.income))}${row('Costos', c => money(c.costs))}${row('Gastos', c => money(c.expenses))}
    ${row('Resultado', c => `<span style="color:${c.result < 0 ? '#B42318' : '#0A2540'}">${fmtMoney(c.result)}</span>`, 'total')}
    ${row('Margen sobre ingresos', c => pct(c.margin) || '—')}
  </tbody></table>`;

  const detail = list.filter(c => c.accounts.length).map(c => `
  <h2>${esc(centerTitle(c))}</h2>
  <table><thead><tr><th style="width:96px">Código</th><th>Cuenta</th>${o.withLines ? '<th>Fecha</th><th>Comprobante</th><th>Descripción</th>' : ''}<th class="r">Valor</th></tr></thead><tbody>
  ${(['Ingresos', 'Costos', 'Gastos'] as CcGroup[]).filter(g => c.accounts.some(a => a.group === g)).map(g => `
    <tr style="background:#F4F7FB;font-weight:700"><td colspan="${o.withLines ? 5 : 2}">${g}</td><td class="r">${fmtMoney(c.accounts.filter(a => a.group === g).reduce((s, a) => s + a.value, 0))}</td></tr>
    ${c.accounts.filter(a => a.group === g).map(a => o.withLines
      ? a.lines.map(l => `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td>${esc(l.date.slice(8, 10) + '/' + l.date.slice(5, 7))}</td><td>${esc(l.number)}</td><td class="muted">${esc(l.detail || l.concept)}</td>
          <td class="r">${fmtMoney(debitNature(a.code) ? l.debit - l.credit : l.credit - l.debit)}</td></tr>`).join('')
      : `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td class="r">${fmtMoney(a.value)}</td></tr>`).join('')}`).join('')}
  <tr class="total"><td colspan="${o.withLines ? 5 : 2}">Resultado del centro</td><td class="r">${fmtMoney(c.result)}</td></tr>
  </tbody></table>`).join('');

  const missing = list.find(c => c.code === NO_CENTER);
  return `
  <header><div><h1>Informe por centros de costo</h1><div class="muted">${esc(o.company)} · ${esc(o.period)} · generado por ${esc(o.user)}</div></div><div class="brand">SOGO</div></header>
  <h2>${many ? 'Comparativo de centros' : 'Resumen'}</h2>${summary}
  ${missing ? `<p class="muted">Hay movimientos sin centro de costo por ${fmtMoney(Math.abs(missing.income) + Math.abs(missing.costs) + Math.abs(missing.expenses))}: asígnelos en el comprobante para que el informe quede completo.</p>` : ''}
  ${detail}
  <p class="muted" style="margin-top:18px">Tomado de los comprobantes contabilizados y provisionales, según el centro de costo de cada línea. No incluye el comprobante de cierre anual.</p>`;
}
