import { Account, ACCOUNTS, Entry, balances, debitNature } from './accounting.model';
import { esc } from '../shared/documents';
import { fmtMoney } from '../reservations/reservation-format';

/** Nivel del PUC según la longitud del código. */
export function levelOf(code: string): string {
  return code.length === 1 ? 'Clase' : code.length === 2 ? 'Grupo' : code.length <= 4 ? 'Cuenta' : code.length <= 6 ? 'Subcuenta' : 'Auxiliar';
}

/** Naturaleza: débito (activo, gasto, costo) o crédito; las de naturaleza contraria se invierten. */
export function natureOf(a: Account): 'Débito' | 'Crédito' {
  const debit = debitNature(a.code);
  return (a.contra ? !debit : debit) ? 'Débito' : 'Crédito';
}

export interface ChartOptions { inactive: boolean; cut: string; cls?: string; }

/** Cuentas a exportar (ordenadas por código) con su saldo al corte. */
export function chartAccounts(entries: Entry[], o: ChartOptions): { a: Account; balance: number }[] {
  const b = balances(entries, '0000-01-01', o.cut);
  // El saldo de una cuenta título es la suma de sus subcuentas
  const balanceOf = (code: string) => [...b].filter(([c]) => c.startsWith(code)).reduce((s, [, v]) => s + v, 0);
  return [...ACCOUNTS]
    .filter(a => (o.inactive || a.active !== false) && (!o.cls || a.cls === o.cls))
    .sort((x, y) => x.code.localeCompare(y.code))
    .map(a => ({ a, balance: Math.round(balanceOf(a.code)) }));
}

/** Filas para Excel / CSV. */
export function chartRows(list: { a: Account; balance: number }[]): unknown[][] {
  return [
    ['Código', 'Cuenta', 'Clase', 'Nivel', 'Naturaleza', 'Corriente', 'Estado', 'Saldo al corte'],
    ...list.map(({ a, balance }) => [a.code, a.name, a.cls, levelOf(a.code), natureOf(a),
      a.cls === 'Activo' || a.cls === 'Pasivo' ? (a.current ? 'Sí' : 'No') : '', a.active === false ? 'Inactiva' : 'Activa', balance]),
  ];
}

/** Plan de cuentas imprimible: niveles sangrados, clases y grupos en negrita. */
export function chartHtml(list: { a: Account; balance: number }[], company: string, cut: string, user: string): string {
  const pad = (code: string) => ({ Clase: 0, Grupo: 10, Cuenta: 22, Subcuenta: 34, Auxiliar: 46 } as Record<string, number>)[levelOf(code)];
  const strong = (code: string) => code.length <= 2;
  const d = `${cut.slice(8, 10)}/${cut.slice(5, 7)}/${cut.slice(0, 4)}`;
  return `
  <header><div><h1>Plan de cuentas</h1><div class="muted">${esc(company)} · ${list.length} cuentas · saldos al ${d} · generado por ${esc(user)}</div></div><div class="brand">SOGO</div></header>
  <table><thead><tr><th>Código</th><th>Cuenta</th><th>Nivel</th><th>Naturaleza</th><th class="r">Saldo</th></tr></thead><tbody>
  ${list.map(({ a, balance }) => `<tr${strong(a.code) ? ' style="background:#F4F7FB;font-weight:700"' : ''}>
    <td>${esc(a.code)}</td><td style="padding-left:${pad(a.code) + 8}px">${esc(a.name)}${a.active === false ? ' <span class="muted">(inactiva)</span>' : ''}</td>
    <td class="muted">${levelOf(a.code)}</td><td class="muted">${natureOf(a)}</td><td class="r">${balance ? fmtMoney(balance) : ''}</td></tr>`).join('')}
  </tbody></table>`;
}
