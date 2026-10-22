import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import {
  ACCOUNTS, GROUPS, BalanceSheet, Entry, balanceSheet, balances, counts, equityResultRows, isClosing, monthStart, monthEnd, periodName, shiftMonth,
} from '../accounting.model';
import { BalanceViewComponent } from '../balance-view.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { pct, variation } from '../accounting-format';

type Tab = 'Balance general' | 'Estado de resultados' | 'Flujo de efectivo' | 'Cambios en el patrimonio';
type Pair = { cur: number; prev: number };
const CASH_KEYS = ['Cobros a clientes y otros ingresos', 'Pagos de nómina y aportes', 'Pagos de impuestos', 'Pagos a proveedores y gastos',
  'Actividades de inversión', 'Actividades de financiación (créditos y socios)'];
interface PlRow { kind: 'section' | 'line' | 'total' | 'grand'; code?: string; name: string; cur: number; prev: number; expense?: boolean; }

@Component({
  selector: 'app-accounting-statements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BalanceViewComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Estados financieros</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Estados financieros</h1>
      <p class="kit-sub">Consulta por período; haz clic en una cuenta para ver su detalle.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="print()">Imprimir</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv()">Exportar CSV</button>
    </div>
  </header>

  <section class="kit-card st-bar">
    <div class="st-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t" [class.active]="tab === t" (click)="tab = t">{{ t }}</button>
    </div>
    <label class="kit-select"><span>Período</span><select [(ngModel)]="period" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
    <label class="kit-select" *ngIf="tab !== 'Balance general'"><span>Comparar con</span><select [(ngModel)]="compare" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
  </section>

  <app-balance-view *ngIf="tab === 'Balance general'" [s]="sheet" [profitLabel]="'ene – ' + name(period).split(' ')[0].slice(0, 3).toLowerCase()"></app-balance-view>

  <div class="kit-layout st-layout" *ngIf="tab === 'Estado de resultados'">
    <section class="kit-card">
      <table class="kit-table acc-sheet">
        <thead><tr><th>Cuenta</th><th class="r">{{ name(period) }}</th><th class="r">{{ name(compare) }}</th><th class="r">Variación</th></tr></thead>
        <tbody>
          <ng-container *ngFor="let r of pl">
            <tr *ngIf="r.kind === 'section'" class="acc-group"><td colspan="4">{{ r.name }}</td></tr>
            <tr *ngIf="r.kind === 'line'" class="clickable" [class.selected]="r.code === selectedCode" (click)="select(r)" tabindex="0" (keydown.enter)="select(r)">
              <td><span class="kit-mono">{{ r.code }}</span> {{ r.name }}</td><td class="r">{{ money(r.cur) }}</td><td class="r kit-muted">{{ money(r.prev) }}</td>
              <td class="r" [ngClass]="tone(r)">{{ pct(variation(r.cur, r.prev)) }}</td></tr>
            <tr *ngIf="r.kind === 'total'" class="acc-subtotal"><td>{{ r.name }}</td><td class="r">{{ money(r.cur) }}</td><td class="r">{{ money(r.prev) }}</td>
              <td class="r" [ngClass]="tone(r)">{{ pct(variation(r.cur, r.prev)) }}</td></tr>
            <tr *ngIf="r.kind === 'grand'" class="acc-grand"><td>{{ r.name }}</td><td class="r">{{ money(r.cur) }}</td><td class="r">{{ money(r.prev) }}</td><td class="r">{{ pct(variation(r.cur, r.prev)) }}</td></tr>
          </ng-container>
        </tbody>
      </table>
    </section>
    <aside class="kit-card st-detail" *ngIf="detail as d">
      <span class="st-eyebrow">Detalle de la cuenta</span>
      <h2>{{ d.code }} · {{ d.name }}</h2>
      <p class="kit-muted">{{ name(period) }} · origen: {{ d.origins.join(', ') || 'sin movimientos' }}</p>
      <div class="kit-sum" *ngFor="let s of d.subs"><span><small class="kit-mono">{{ s.code }}</small><br>{{ s.name }}</span><strong>{{ money(s.value) }}</strong></div>
      <div class="kit-sum kit-sum--total"><strong>Total</strong><strong>{{ money(d.total) }}</strong></div>
      <p class="kit-banner kit-banner--warn" *ngIf="d.provisional">Valor provisional: incluye registros en borrador en su módulo de origen.</p>
      <a class="rsv-btn rsv-btn--outline" style="width:100%" routerLink="/dashboard/accounting/ledger" [queryParams]="{ cuenta: d.code, periodo: period }">Ver movimientos de la cuenta</a>
    </aside>
  </div>

  <section class="kit-card" *ngIf="tab === 'Flujo de efectivo'">
    <h2 class="kit-card-title">Flujo de efectivo · método directo (caja y bancos)</h2>
    <table class="kit-table acc-sheet">
      <thead><tr><th>Concepto</th><th class="r">{{ name(period) }}</th><th class="r">{{ name(compare) }}</th></tr></thead>
      <tbody>
        <tr class="acc-subtotal"><td>Efectivo al inicio del período</td><td class="r">{{ money(cash.cur.opening) }}</td><td class="r">{{ money(cash.prev.opening) }}</td></tr>
        <tr *ngFor="let k of cashKeys"><td>{{ k }}</td><td class="r" [class.acc-red]="flow('cur', k) < 0">{{ money(flow('cur', k)) }}</td><td class="r kit-muted">{{ money(flow('prev', k)) }}</td></tr>
        <tr class="acc-subtotal"><td>Flujo neto del período</td><td class="r">{{ money(cash.cur.net) }}</td><td class="r">{{ money(cash.prev.net) }}</td></tr>
        <tr class="acc-grand"><td>Efectivo al final del período</td><td class="r">{{ money(cash.cur.opening + cash.cur.net) }}</td><td class="r">{{ money(cash.prev.opening + cash.prev.net) }}</td></tr>
      </tbody>
    </table>
    <p class="acc-note">Los traslados entre caja y bancos no cambian el efectivo total y no se muestran.</p>
  </section>

  <section class="kit-card" *ngIf="tab === 'Cambios en el patrimonio'">
    <h2 class="kit-card-title">Cambios en el patrimonio · {{ period.slice(0, 4) }}</h2>
    <table class="kit-table acc-sheet">
      <thead><tr><th>Cuenta</th><th class="r">Saldo al 1 de enero</th><th class="r">Movimiento</th><th class="r">Saldo a {{ name(period).toLowerCase() }}</th></tr></thead>
      <tbody>
        <tr *ngFor="let r of equity"><td>{{ r.name }}</td><td class="r">{{ money(r.start) }}</td><td class="r" [class.acc-red]="r.change < 0">{{ money(r.change) }}</td><td class="r">{{ money(r.start + r.change) }}</td></tr>
        <tr class="acc-grand"><td>Total patrimonio</td><td class="r">{{ money(equityTotal('start')) }}</td><td class="r">{{ money(equityTotal('change')) }}</td><td class="r">{{ money(equityTotal('start') + equityTotal('change')) }}</td></tr>
      </tbody>
    </table>
  </section>
  `,
  styles: [`
    .st-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
    .st-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
    .st-tabs button { height: 40px; padding: 0 16px; border: none; border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #1F2937; cursor: pointer; }
    .st-tabs button.active { background: #0A3D6D; color: #fff; }
    .st-layout { grid-template-columns: minmax(0, 1fr) 330px; }
    .st-detail { border-color: #0B6FD0; }
    .st-eyebrow { font-size: 10.5px; text-transform: uppercase; color: #6B7280; }
    .st-detail h2 { margin: 2px 0; font-size: 16px; color: #0A2540; }
    .st-detail .kit-banner { margin: 12px 0; font-size: 12px; }
  `],
})
export class StatementsComponent {
  readonly tabs: Tab[] = ['Balance general', 'Estado de resultados', 'Flujo de efectivo', 'Cambios en el patrimonio'];
  readonly money = fmtMoney;
  readonly name = periodName;
  readonly pct = pct;
  readonly variation = variation;

  tab: Tab = 'Estado de resultados';
  periods: string[] = [];
  period: string;
  compare: string;
  sheet!: BalanceSheet;
  pl: PlRow[] = [];
  selectedCode = '5205';
  detail?: { code: string; name: string; subs: { code: string; name: string; value: number }[]; total: number; origins: string[]; provisional: boolean };
  cash = { cur: { opening: 0, net: 0, flows: {} as Record<string, number> }, prev: { opening: 0, net: 0, flows: {} as Record<string, number> } };
  cashKeys: string[] = [];
  equity: { name: string; start: number; change: number }[] = [];

  constructor(public svc: AccountingService) {
    this.period = svc.openPeriod;
    this.compare = shiftMonth(svc.openPeriod, -1);
    svc.getEntries().subscribe(() => {
      this.periods = svc.periods();
      this.compute();
    });
  }

  compute(): void {
    const all = this.svc.snapshot();
    const [from, to] = [monthStart(this.period), monthEnd(this.period)];
    const [pFrom, pTo] = [monthStart(this.compare), monthEnd(this.compare)];
    this.sheet = balanceSheet(all, to, 4);
    // El comprobante de cierre deja en cero las cuentas de resultados: no se mezcla con lo que pasó en el período
    const operations = all.filter(e => !isClosing(e));
    const cur = balances(operations, from, to), prev = balances(operations, pFrom, pTo);
    const g = (b: Map<string, number>, pre: string) => [...b].filter(([c]) => c.startsWith(pre)).reduce((s, [, v]) => s + v, 0);
    const both = (pre: string) => ({ cur: g(cur, pre), prev: g(prev, pre) });
    const sub = (a: Pair, b: Pair): Pair => ({ cur: a.cur - b.cur, prev: a.prev - b.prev });
    const add = (a: Pair, b: Pair): Pair => ({ cur: a.cur + b.cur, prev: a.prev + b.prev });
    const moved = (code: string) => !!(Math.round(g(cur, code)) || Math.round(g(prev, code)));
    const codes = (re: RegExp) => [...new Set([...cur.keys(), ...prev.keys()].filter(c => re.test(c)))];
    const groups = (re: RegExp) => [...new Set(codes(re).map(c => c.slice(0, 4)))].sort()
      .filter(moved).map(code => ({ code, name: GROUPS[code] ?? ACCOUNTS.find(a => a.code === code)?.name ?? code }));

    const rows: PlRow[] = [{ kind: 'section', name: 'INGRESOS OPERACIONALES', cur: 0, prev: 0 }];
    // Cuentas de detalle con movimiento (los comprobantes solo usan cuentas auxiliares: no hay doble conteo)
    codes(/^41/).sort().filter(moved).forEach(c => rows.push({ kind: 'line', code: c, name: ACCOUNTS.find(a => a.code === c)?.name ?? c, ...both(c) }));
    const inc = both('41'), cost = add(both('6'), both('7'));
    rows.push({ kind: 'total', name: 'Total ingresos operacionales', ...inc });
    if (cost.cur || cost.prev) {
      rows.push({ kind: 'section', name: 'COSTOS DE VENTAS Y DE PRESTACIÓN DE SERVICIOS', cur: 0, prev: 0 });
      groups(/^[67]/).forEach(a => rows.push({ kind: 'line', ...a, ...both(a.code), expense: true }));
      rows.push({ kind: 'total', name: 'Total costos', ...cost, expense: true });
    }
    const gross = sub(inc, cost);
    rows.push({ kind: 'total', name: 'Utilidad bruta', ...gross });
    const adm = both('51'), sales = both('52');
    if (adm.cur || adm.prev) {
      rows.push({ kind: 'section', name: 'GASTOS OPERACIONALES DE ADMINISTRACIÓN', cur: 0, prev: 0 });
      groups(/^51/).forEach(a => rows.push({ kind: 'line', ...a, ...both(a.code), expense: true }));
    }
    if (sales.cur || sales.prev) {
      rows.push({ kind: 'section', name: 'GASTOS OPERACIONALES DE VENTAS', cur: 0, prev: 0 });
      groups(/^52/).forEach(a => rows.push({ kind: 'line', ...a, ...both(a.code), expense: true }));
    }
    const exp = add(adm, sales);
    rows.push({ kind: 'total', name: 'Total gastos operacionales', ...exp, expense: true });
    const operating = sub(gross, exp);
    rows.push({ kind: 'total', name: 'Utilidad operacional', ...operating });
    const finIn = both('42'), finOut = both('53');
    if (finIn.cur || finIn.prev || finOut.cur || finOut.prev) {
      rows.push({ kind: 'section', name: 'INGRESOS Y GASTOS NO OPERACIONALES', cur: 0, prev: 0 });
      groups(/^42/).forEach(a => rows.push({ kind: 'line', ...a, ...both(a.code) }));
      groups(/^53/).forEach(a => rows.push({ kind: 'line', ...a, ...both(a.code), expense: true }));
    }
    const beforeTax = sub(add(operating, finIn), finOut);
    rows.push({ kind: 'total', name: 'Utilidad antes de impuestos', ...beforeTax });
    const tax = both('54');
    rows.push({ kind: 'line', code: '5405', name: 'Impuesto de renta y complementarios', ...tax, expense: true });
    rows.push({ kind: 'grand', name: 'UTILIDAD NETA DEL EJERCICIO', ...sub(beforeTax, tax) });
    this.pl = rows;
    if (!rows.some(r => r.code === this.selectedCode)) this.selectedCode = rows.find(r => r.kind === 'line')?.code ?? '';
    this.selectCode(this.selectedCode, operations, cur);

    this.cash = { cur: this.cashFlow(all, from, to), prev: this.cashFlow(all, pFrom, pTo) };
    this.cashKeys = CASH_KEYS.filter(k => k in this.cash.cur.flows || k in this.cash.prev.flows);

    // Patrimonio: saldo al 1 de enero (incluye los saldos iniciales de ese día) y movimiento del año
    const yStart = `${this.period.slice(0, 4)}-01-01`;
    const isOpening = (e: Entry) => e.kind === 'Apertura' && e.date === yStart;
    const before = balances(all, '0000-01-01', `${+this.period.slice(0, 4) - 1}-12-31`);
    const openingDay = balances(all.filter(isOpening), yStart, yStart);
    const moves = balances(all.filter(e => !isOpening(e)), yStart, to);
    const equityCodes = [...new Set([...before.keys(), ...openingDay.keys(), ...moves.keys()].filter(c => c[0] === '3').map(c => c.slice(0, 4)))].sort();
    this.equity = equityCodes.map(code => ({
      name: `${code} · ${GROUPS[code] ?? ACCOUNTS.find(a => a.code === code)?.name ?? code}`,
      start: g(before, code) + g(openingDay, code), change: g(moves, code),
    })).filter(r => Math.round(r.start) || Math.round(r.change));
    if (Math.round(this.sheet.priorResults)) this.equity.push({ name: 'Resultados de años anteriores sin cerrar', start: this.sheet.priorResults, change: 0 });
    this.equity.push({ name: 'Utilidad del ejercicio en curso (sin cerrar)', start: 0, change: this.sheet.profit });
  }

  /** Flujo de una categoría (0 si en ese período no hubo movimientos de ese tipo). */
  flow(side: 'cur' | 'prev', key: string): number { return this.cash[side].flows[key] ?? 0; }

  equityTotal(k: 'start' | 'change'): number { return this.equity.reduce((s, r) => s + r[k], 0); }

  /**
   * Clasifica las entradas y salidas de caja/bancos por la contrapartida del comprobante.
   * Los saldos iniciales no son un flujo del período: forman parte del efectivo al inicio.
   */
  private cashFlow(all: Entry[], from: string, to: string) {
    const isCash = (c: string) => c.startsWith('1105') || c.startsWith('1110');
    const cashOf = (e: Entry) => e.lines.filter(l => isCash(l.account)).reduce((s, l) => s + l.debit - l.credit, 0);
    const dayBefore = new Date(`${from}T12:00`); dayBefore.setDate(dayBefore.getDate() - 1);
    const b = balances(all, '0000-01-01', dayBefore.toISOString().slice(0, 10));
    const inRange = all.filter(e => counts(e) && e.date >= from && e.date <= to);
    const opening = [...b].filter(([c]) => isCash(c)).reduce((s, [, v]) => s + v, 0)
      + inRange.filter(e => e.kind === 'Apertura').reduce((s, e) => s + cashOf(e), 0);
    const flows: Record<string, number> = {};
    inRange.filter(e => e.kind !== 'Apertura').forEach(e => {
      const cash = cashOf(e);
      if (!cash) return;
      // Contrapartida principal: la línea de mayor valor que no es caja ni bancos
      const other = e.lines.filter(l => !isCash(l.account)).sort((a, b2) => (b2.debit + b2.credit) - (a.debit + a.credit))[0]?.account ?? '';
      const key = ['41', '42', '13', '28'].some(p => other.startsWith(p)) ? CASH_KEYS[0]
        : ['25', '5105', '5205', '237', '238', '261'].some(p => other.startsWith(p)) ? CASH_KEYS[1]
        : other.startsWith('24') ? CASH_KEYS[2]
        : ['12', '15', '16', '17', '18'].some(p => other.startsWith(p)) ? CASH_KEYS[4]
        : ['21', '3'].some(p => other.startsWith(p)) ? CASH_KEYS[5]
        : CASH_KEYS[3];
      flows[key] = (flows[key] ?? 0) + cash;
    });
    return { opening, flows, net: Object.values(flows).reduce((s, v) => s + v, 0) };
  }

  select(r: PlRow): void {
    if (!r.code) return;
    this.selectedCode = r.code;
    const all = this.svc.snapshot();
    const operations = all.filter(e => !isClosing(e));
    this.selectCode(r.code, operations, balances(operations, monthStart(this.period), monthEnd(this.period)));
  }

  private selectCode(code: string, all: Entry[], cur: Map<string, number>): void {
    const subs = [...cur].filter(([c]) => c.startsWith(code) && Math.round(cur.get(c) ?? 0) !== 0).map(([c, v]) => ({ code: c, name: ACCOUNTS.find(a => a.code === c)?.name ?? c, value: v }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const inPeriod = all.filter(e => counts(e) && e.date >= monthStart(this.period) && e.date <= monthEnd(this.period) && e.lines.some(l => l.account.startsWith(code)));
    this.detail = {
      code, name: GROUPS[code] ?? ACCOUNTS.find(a => a.code === code)?.name ?? code, subs, total: subs.reduce((s, x) => s + x.value, 0),
      origins: [...new Set(inPeriod.map(e => e.kind === 'Apertura' ? 'saldos iniciales' : e.origin === 'Manual' ? 'registro manual' : `módulo de ${e.origin}`))],
      provisional: inPeriod.some(e => e.status === 'Provisional'),
    };
  }

  /** Rojo cuando la variación es desfavorable (ingreso que baja o gasto que sube). */
  tone(r: PlRow): string {
    const v = variation(r.cur, r.prev);
    if (!Number.isFinite(v) || Math.abs(v) < 0.05) return '';
    return (v > 0) !== !!r.expense ? 'acc-green' : 'acc-red';
  }

  private exportRows(): unknown[][] {
    if (this.tab === 'Balance general') return [['Código', 'Cuenta', 'Saldo'], ...this.sheet.lines.map(l => [l.code, l.name, l.value]), ...equityResultRows(this.sheet)];
    if (this.tab === 'Flujo de efectivo') return [['Concepto', periodName(this.period), periodName(this.compare)], ...this.cashKeys.map(k => [k, this.cash.cur.flows[k] ?? 0, this.cash.prev.flows[k] ?? 0])];
    if (this.tab === 'Cambios en el patrimonio') return [['Cuenta', 'Inicial', 'Movimiento', 'Final'], ...this.equity.map(r => [r.name, r.start, r.change, r.start + r.change])];
    return [['Código', 'Cuenta', periodName(this.period), periodName(this.compare)], ...this.pl.filter(r => r.kind !== 'section').map(r => [r.code ?? '', r.name, r.cur, r.prev])];
  }

  csv(): void {
    downloadCsvFile(this.exportRows(), `${this.tab.toLowerCase().replace(/ /g, '-')}-${this.period}.csv`);
    this.svc.logExport(`${this.tab}.csv`, periodName(this.period));
  }

  print(): void {
    const rows = this.exportRows();
    openDocument(this.tab, `
      <header><div><h1>${esc(this.tab)}</h1><div class="muted">${esc(this.svc.company)} · ${esc(periodName(this.period))}</div></div><div class="brand">SOGO</div></header>
      <table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(1).map(r => `<tr>${r.map(v => `<td${typeof v === 'number' ? ' class="r"' : ''}>${typeof v === 'number' ? this.money(v) : esc(v)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`, true);
  }
}
