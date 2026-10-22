import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Entry, balanceSheet, balances, counts, isClosing, pnl, monthStart, monthEnd, monthAbbr, periodName, shiftMonth } from '../accounting.model';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile } from '../../shared/documents';
import { isoDateTime } from '../../shared/date-utils';
import { dmy, millions, pct, variation } from '../accounting-format';

interface Snapshot { income: number; expenses: number; profit: number; margin: number; payroll: number; cashFlow: number; current: number; debt: number; cash: number; }
interface Row { name: string; formula: string; cur: string; prev: string; delta: string; bad: boolean; reading: string; }

@Component({
  selector: 'app-accounting-indicators',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Indicadores financieros</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Indicadores financieros</h1>
      <p class="kit-sub">Calculados con los comprobantes contabilizados: alojamiento, facturación, nómina, inventarios y registros manuales.</p>
    </div>
    <div class="kit-actions">
      <label class="kit-select"><span>Período</span><select [(ngModel)]="period" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
      <label class="kit-select"><span>Comparar con</span><select [(ngModel)]="compare" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
      <label class="kit-select ind-goal"><span>Meta de margen</span><input type="number" min="0" max="100" [(ngModel)]="goal" (ngModelChange)="compute()"></label>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="export()">Exportar</button>
    </div>
  </header>

  <section class="kit-kpis ind-kpis">
    <div class="kit-kpi"><div><span>Ingresos totales</span><strong>{{ money(c.income) }}</strong><small><em class="ind-chip" [class.bad]="c.income < p.income">{{ pct(variation(c.income, p.income)) }}</em> vs {{ short(compare) }}</small></div></div>
    <div class="kit-kpi"><div><span>Egresos totales</span><strong>{{ money(c.expenses) }}</strong><small><em class="ind-chip" [class.bad]="c.expenses > p.expenses">{{ pct(variation(c.expenses, p.expenses)) }}</em> vs {{ short(compare) }}</small></div></div>
    <div class="kit-kpi"><div><span>Utilidad neta</span><strong [class.acc-red]="c.profit < 0">{{ money(c.profit) }}</strong><small><em class="ind-chip" [class.bad]="c.profit < p.profit">{{ pct(variation(c.profit, p.profit)) }}</em> después de impuestos</small></div></div>
    <div class="kit-kpi"><div><span>Margen de rentabilidad</span><strong>{{ pct(c.margin).replace('+', '') }}</strong><small>{{ short(compare) }} {{ pct(p.margin).replace('+', '') }}</small></div></div>
    <div class="kit-kpi"><div><span>Flujo de caja operativo</span><strong [class.acc-red]="c.cashFlow < 0">{{ money(c.cashFlow) }}</strong><small>{{ short(compare) }} {{ money(p.cashFlow) }}</small></div></div>
    <div class="kit-kpi"><div><span>Razón corriente</span><strong>{{ c.current.toFixed(2) }}</strong><small><em class="ind-chip" [class.bad]="c.current < 1" [class.warn]="c.current < 1">{{ c.current < 1 ? 'Menor a 1' : 'Sobre 1' }}</em> activo cte / pasivo cte</small></div></div>
  </section>

  <div class="ind-grid">
    <section class="kit-card">
      <div class="acc-head-row">
        <div><h2 class="kit-card-title">Ingresos y egresos por mes</h2><p class="kit-card-sub">{{ name(months[0].p).split(' ')[0] }} a {{ name(period).toLowerCase() }} · millones de COP</p></div>
        <div class="ind-legend"><span><i class="in"></i>Ingresos</span><span><i class="out"></i>Egresos</span></div>
      </div>
      <svg class="ind-svg" viewBox="0 0 600 240" role="img" [attr.aria-label]="barsLabel">
        <g *ngFor="let t of barTicks"><line x1="40" x2="590" [attr.y1]="y(t)" [attr.y2]="y(t)" class="grid"/><text x="34" [attr.y]="y(t) + 4" class="tick">{{ (t / 1e6) | number:'1.0-0' }}</text></g>
        <g *ngFor="let m of months; let i = index">
          <rect [attr.x]="60 + i * 90" [attr.y]="y(m.income)" width="30" [attr.height]="200 - y(m.income)" class="in" rx="3"><title>Ingresos {{ name(m.p) }}: {{ money(m.income) }}</title></rect>
          <rect [attr.x]="94 + i * 90" [attr.y]="y(m.expenses)" width="30" [attr.height]="200 - y(m.expenses)" class="out" rx="3"><title>Egresos {{ name(m.p) }}: {{ money(m.expenses) }}</title></rect>
          <text [attr.x]="92 + i * 90" y="222" class="lbl">{{ abbr(m.p) }}</text>
          <ng-container *ngIf="i === months.length - 1">
            <text [attr.x]="75 + i * 90" [attr.y]="y(m.income) - 6" class="val">{{ (m.income / 1e6) | number:'1.1-1' }}</text>
            <text [attr.x]="109 + i * 90" [attr.y]="y(m.expenses) - 6" class="val">{{ (m.expenses / 1e6) | number:'1.1-1' }}</text>
          </ng-container>
        </g>
      </svg>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Margen de rentabilidad</h2>
      <p class="kit-card-sub">Utilidad antes de impuestos / ingresos totales · meta {{ goal }}%</p>
      <svg class="ind-svg" viewBox="0 0 400 240" role="img" [attr.aria-label]="marginLabel">
        <g *ngFor="let t of marginTicks"><line x1="40" x2="390" [attr.y1]="my(t)" [attr.y2]="my(t)" class="grid"/><text x="34" [attr.y]="my(t) + 4" class="tick">{{ t }}%</text></g>
        <line x1="40" x2="390" [attr.y1]="my(goal)" [attr.y2]="my(goal)" class="goal"/>
        <polyline [attr.points]="marginPoints" class="line"/>
        <g *ngFor="let m of months; let i = index">
          <circle [attr.cx]="mx(i)" [attr.cy]="my(m.margin)" r="4" class="dot"><title>{{ name(m.p) }}: {{ m.margin | number:'1.1-1' }}%</title></circle>
          <text [attr.x]="mx(i)" y="222" class="lbl">{{ abbr(m.p) }}</text>
          <text *ngIf="i === months.length - 1 || m.margin === maxMargin" [attr.x]="mx(i)" [attr.y]="my(m.margin) - 9" class="val">{{ m.margin | number:'1.1-1' }}%</text>
        </g>
      </svg>
    </section>
  </div>

  <section class="kit-card">
    <div class="acc-head-row">
      <h2 class="kit-card-title">Comparación entre períodos</h2>
      <span class="kit-muted">Generado {{ dmy(generatedAt) }} {{ generatedAt.slice(11, 16) }} por {{ user }} · registrado en auditoría</span>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Indicador</th><th>Fórmula</th><th class="r">{{ name(period) }}</th><th class="r">{{ name(compare) }}</th><th class="r">Variación</th><th>Lectura</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows"><td><strong>{{ r.name }}</strong></td><td class="kit-muted">{{ r.formula }}</td><td class="r"><strong>{{ r.cur }}</strong></td>
            <td class="r kit-muted">{{ r.prev }}</td><td class="r" [class.acc-red]="r.bad" [class.acc-green]="!r.bad">{{ r.delta }}</td><td class="kit-muted">{{ r.reading }}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="acc-note">* Antes de impuesto de renta. Calculado con los comprobantes guardados en la base de datos desde el inicio de la contabilidad en SOGO ({{ dmy(svc.goLive) }}).</p>
  </section>
  `,
  styles: [`
    .ind-goal { max-width: 120px; }
    .ind-kpis { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .ind-chip { font-style: normal; padding: 1px 6px; border-radius: 5px; background: #DDF7E6; color: #15803D; font-weight: 600; }
    .ind-chip.bad { background: #FDE2E2; color: #B91C1C; }
    .ind-chip.warn { background: #FEF1D6; color: #92400E; }
    .ind-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; margin-bottom: 18px; }
    .ind-legend { display: flex; gap: 12px; font-size: 12px; }
    .ind-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; }
    .ind-legend .in, .ind-svg .in { background: #1565C0; fill: #1565C0; }
    .ind-legend .out, .ind-svg .out { background: #D98A0B; fill: #D98A0B; }
    .ind-svg { width: 100%; height: auto; }
    .ind-svg .grid { stroke: #E6EBF2; }
    .ind-svg .goal { stroke: #16A34A; stroke-dasharray: 4 4; }
    .ind-svg .tick { font-size: 10px; fill: #6B7280; text-anchor: end; }
    .ind-svg .lbl { font-size: 11px; fill: #6B7280; text-anchor: middle; }
    .ind-svg .val { font-size: 10.5px; font-weight: 700; fill: #0A2540; text-anchor: middle; }
    .ind-svg .line { fill: none; stroke: #1565C0; stroke-width: 2; }
    .ind-svg .dot { fill: #1565C0; }
    @media (max-width: 1100px) { .ind-grid { grid-template-columns: 1fr; } }
  `],
})
export class IndicatorsComponent {
  readonly money = fmtMoney;
  readonly name = periodName;
  readonly abbr = monthAbbr;
  readonly pct = pct;
  readonly variation = variation;
  readonly dmy = dmy;
  get user(): string { return this.svc.actor; }

  periods: string[] = [];
  period: string;
  compare: string;
  goal = 15;
  c!: Snapshot;
  p!: Snapshot;
  months: ({ p: string } & Snapshot)[] = [];
  rows: Row[] = [];
  barTicks: number[] = [];
  barMax = 1;
  marginTicks: number[] = [];
  marginMin = 0;
  marginMax = 30;
  maxMargin = 0;
  generatedAt = isoDateTime();

  constructor(public svc: AccountingService, private audit: UsersService) {
    this.period = svc.openPeriod;
    this.compare = shiftMonth(svc.openPeriod, -1);
    svc.getEntries().subscribe(() => {
      this.periods = svc.periods();
      this.compute();
    });
    this.audit.addLog('Contabilidad: indicadores consultados', periodName(this.period));
  }

  short(p: string): string { return periodName(p).split(' ')[0].toLowerCase(); }

  private snapshot(all: Entry[], period: string): Snapshot {
    const from = monthStart(period), to = monthEnd(period);
    const r = pnl(all, from, to);
    const net = r.net;
    const b = balances(all.filter(e => !isClosing(e)), from, to);
    // Gastos y costos de personal: 5105 administración, 5205 ventas, 7205 mano de obra
    const payroll = [...b].filter(([k]) => ['5105', '5205', '7205'].some(p => k.startsWith(p))).reduce((s, [, v]) => s + v, 0);
    const sheet = balanceSheet(all, to);
    const isCash = (k: string) => k.startsWith('1105') || k.startsWith('1110');
    // Flujo operativo: movimiento de caja y bancos sin traslados, créditos ni inversiones
    const cashFlow = all.filter(e => counts(e) && e.date >= from && e.date <= to && e.kind !== 'Apertura').reduce((s, e) => {
      const cash = e.lines.filter(l => isCash(l.account)).reduce((a, l) => a + l.debit - l.credit, 0);
      const other = e.lines.find(l => !isCash(l.account))?.account ?? '';
      return other.startsWith('21') || other.startsWith('15') ? s : s + cash;
    }, 0);
    return {
      income: r.income, expenses: r.expenses + r.tax, profit: net, margin: r.income ? net / r.income * 100 : 0, payroll, cashFlow,
      current: sheet.currentLiabilities ? sheet.currentAssets / sheet.currentLiabilities : 0,
      debt: sheet.assets ? sheet.liabilities / sheet.assets * 100 : 0,
      cash: sheet.lines.filter(l => l.code.startsWith('11')).reduce((s, l) => s + l.value, 0),
    };
  }

  compute(): void {
    const all = this.svc.snapshot();
    this.c = this.snapshot(all, this.period);
    this.p = this.snapshot(all, this.compare);
    this.months = Array.from({ length: 6 }, (_, i) => shiftMonth(this.period, i - 5)).map(p => ({ p, ...this.snapshot(all, p) }));
    const top = Math.max(1, ...this.months.flatMap(m => [m.income, m.expenses]));
    const step = Math.ceil(top / 4 / 10_000_000) * 10_000_000 || 10_000_000;
    this.barMax = step * 4;
    this.barTicks = [0, 1, 2, 3, 4].map(i => i * step);
    this.maxMargin = Math.max(...this.months.map(m => m.margin));
    this.marginMin = Math.min(0, Math.floor(Math.min(...this.months.map(m => m.margin)) / 10) * 10);
    this.marginMax = Math.max(30, Math.ceil(Math.max(this.maxMargin, this.goal) / 10) * 10);
    this.marginTicks = [];
    for (let t = this.marginMin; t <= this.marginMax; t += 10) this.marginTicks.push(t);
    this.rows = this.buildRows();
    this.generatedAt = isoDateTime();
  }

  y(v: number): number { return 200 - Math.max(0, v) / this.barMax * 185; }
  mx(i: number): number { return 60 + i * 64; }
  my(v: number): number { return 200 - (v - this.marginMin) / (this.marginMax - this.marginMin) * 185; }
  get marginPoints(): string { return this.months.map((m, i) => `${this.mx(i)},${this.my(m.margin)}`).join(' '); }
  get barsLabel(): string { return this.months.map(m => `${periodName(m.p)}: ingresos ${millions(m.income)}, egresos ${millions(m.expenses)}`).join('; '); }
  get marginLabel(): string { return this.months.map(m => `${periodName(m.p)}: ${m.margin.toFixed(1)}%`).join('; '); }

  private buildRows(): Row[] {
    const c = this.c, p = this.p;
    const money = (v: number) => this.money(v);
    const pp = (a: number, b: number) => `${a - b >= 0 ? '+' : '−'}${Math.abs(a - b).toFixed(1).replace('.', ',')} pp`;
    const payrollWeight = (s: Snapshot) => s.income ? s.payroll / s.income * 100 : 0;
    return [
      { name: 'Ingresos totales', formula: 'Operacionales + no operacionales', cur: money(c.income), prev: money(p.income), delta: pct(variation(c.income, p.income)), bad: c.income < p.income,
        reading: c.income < p.income ? 'Menos ingresos que el período de comparación' : 'Crecen los ingresos' },
      { name: 'Egresos totales', formula: 'Costos + gastos', cur: money(c.expenses), prev: money(p.expenses), delta: pct(variation(c.expenses, p.expenses)), bad: c.expenses > p.expenses,
        reading: c.expenses > p.expenses ? 'Suben los egresos' : 'Bajan los egresos' },
      { name: 'Utilidad neta', formula: 'Ingresos − costos − gastos − impuesto de renta', cur: money(c.profit), prev: money(p.profit), delta: pct(variation(c.profit, p.profit)), bad: c.profit < p.profit,
        reading: c.profit < 0 ? 'El período cierra con pérdida' : c.profit < p.profit ? 'Menor utilidad que el período anterior' : 'Mejora la utilidad' },
      { name: 'Margen de rentabilidad', formula: 'Utilidad / ingresos', cur: `${c.margin.toFixed(1).replace('.', ',')}%`, prev: `${p.margin.toFixed(1).replace('.', ',')}%`, delta: pp(c.margin, p.margin), bad: c.margin < p.margin,
        reading: c.margin < this.goal ? `Por debajo de la meta del ${this.goal}%` : `Cumple la meta del ${this.goal}%` },
      { name: 'Peso de la nómina', formula: 'Gastos de personal / ingresos', cur: `${payrollWeight(c).toFixed(1).replace('.', ',')}%`, prev: `${payrollWeight(p).toFixed(1).replace('.', ',')}%`,
        delta: pp(payrollWeight(c), payrollWeight(p)), bad: payrollWeight(c) > payrollWeight(p), reading: payrollWeight(c) > 50 ? 'Principal gasto del hospedaje' : 'Dentro de lo esperado' },
      { name: 'Flujo de caja operativo', formula: 'Entradas − salidas de efectivo', cur: money(c.cashFlow), prev: money(p.cashFlow), delta: pct(variation(c.cashFlow, p.cashFlow)), bad: c.cashFlow < p.cashFlow,
        reading: `${c.cashFlow >= 0 ? 'Positivo' : 'Negativo'}; efectivo disponible ${money(c.cash)}` },
      { name: 'Razón corriente', formula: 'Activo cte / pasivo cte', cur: c.current.toFixed(2), prev: p.current.toFixed(2), delta: `${c.current - p.current >= 0 ? '+' : '−'}${Math.abs(c.current - p.current).toFixed(2)}`,
        bad: c.current < p.current, reading: c.current < 1 ? 'Las obligaciones de corto plazo superan el activo corriente' : 'Cubre las obligaciones de corto plazo' },
      { name: 'Endeudamiento', formula: 'Pasivo total / activo total', cur: `${c.debt.toFixed(1).replace('.', ',')}%`, prev: `${p.debt.toFixed(1).replace('.', ',')}%`, delta: pp(c.debt, p.debt), bad: c.debt > p.debt,
        reading: c.debt < 40 ? 'Nivel bajo' : c.debt < 60 ? 'Nivel moderado' : 'Nivel alto' },
    ];
  }

  export(): void {
    downloadCsvFile([['Indicador', 'Fórmula', periodName(this.period), periodName(this.compare), 'Variación', 'Lectura'],
      ...this.rows.map(r => [r.name, r.formula, r.cur, r.prev, r.delta, r.reading])], `indicadores-${this.period}.csv`);
    this.svc.logExport('Indicadores financieros.csv', periodName(this.period));
  }
}
