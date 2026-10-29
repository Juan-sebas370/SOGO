import { Component, OnDestroy } from '@angular/core';
import { ReportNavComponent } from '../report-nav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, FinancialReport, FinancialFilters, COST_CENTERS, INCOME_SOURCES, EXPENSE_CATEGORIES } from '../reports.service';
import { Delta, delta, money, pct, num, monthLabel, monthName, monthShort, shiftMonth, lastMonths, millions, COLORS } from '../reports.model';
import { Origin } from '../../accounting/accounting.model';
import { BarsComponent, Series } from '../charts/charts';
import { DeltaComponent } from '../delta.component';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { svgMarkup } from '../charts/chart-export';

const ORIGINS: Origin[] = ['Manual', 'Reservas', 'Alojamiento', 'Facturación', 'Nómina', 'Inventarios'];

@Component({
  selector: 'app-reports-financial',
  standalone: true,
  imports: [ReportNavComponent, CommonModule, FormsModule, RouterLink, BarsComponent, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <rp-nav></rp-nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte financiero</h1>
      <p class="kit-sub">Ingresos, egresos, utilidad y flujo de caja tomados de Contabilidad, que integra Reservas, Facturación, Nómina e Inventarios.</p>
    </div>
    <div class="kit-actions" *ngIf="svc.canExport()">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">Excel (CSV)</button>
    </div>
  </header>

  <p class="kit-banner kit-banner--danger" *ngIf="!svc.canView('Contable')">Tu rol no tiene permiso para consultar la información contable.</p>
  <ng-container *ngIf="svc.canView('Contable')">
  <section class="kit-card rp-filters">
    <label class="kit-select"><span>Período</span><select [(ngModel)]="draft.period"><option *ngFor="let p of periods" [value]="p">{{ monthLabel(p) }}{{ p === svc.livePeriod ? ' (en curso)' : '' }}</option></select></label>
    <label class="kit-select"><span>Comparar con</span><select [(ngModel)]="draft.compare"><option *ngFor="let p of periods" [value]="p" [disabled]="p >= draft.period">{{ monthLabel(p) }}</option></select></label>
    <label class="kit-select"><span>Categoría</span><select [(ngModel)]="draft.category"><option value="">Todas</option>
      <optgroup label="Ingresos"><option *ngFor="let c of incomeCats">{{ c }}</option></optgroup>
      <optgroup label="Egresos"><option *ngFor="let c of expenseCats">{{ c }}</option></optgroup></select></label>
    <label class="kit-select"><span>Centro de costo</span><select [(ngModel)]="draft.center"><option value="">Todos</option><option *ngFor="let c of centers">{{ c }}</option></select></label>
    <label class="kit-select"><span>Módulo de origen</span><select [(ngModel)]="draft.origin"><option value="">Todos</option><option *ngFor="let o of origins">{{ o }}</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="draft.compare >= draft.period" (click)="apply()">Generar</button>
  </section>

  <div class="kit-banner kit-banner--warn" *ngIf="payrollDraft">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>
    <div><strong>La nómina de {{ monthName(applied.period) }} todavía no está contabilizada.</strong>
      Está en borrador ({{ money(payrollCost) }} de costo total): hasta que se confirme, los egresos y la utilidad del mes no la incluyen.</div>
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/liquidation">Ir a Nómina</a>
  </div>

  <section class="kit-kpis rp-kpis">
    <div class="rp-kpi"><span>Ingresos totales</span><strong>{{ money(cur.income) }}</strong><div><rp-delta [d]="d.income"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ money(prev.income) }}</small></div></div>
    <div class="rp-kpi"><span>Egresos totales</span><strong>{{ money(cur.expenses) }}</strong><div><rp-delta [d]="d.expenses"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ money(prev.expenses) }}</small></div></div>
    <div class="rp-kpi"><span>Utilidad antes de imp.</span><strong [class.rp-neg]="cur.profit < 0">{{ money(cur.profit) }}</strong><div><rp-delta [d]="d.profit"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ money(prev.profit) }}</small></div></div>
    <div class="rp-kpi"><span>Margen</span><strong>{{ pct(cur.margin) }}</strong><div><rp-delta [d]="d.margin"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ pct(prev.margin) }}</small></div></div>
    <div class="rp-kpi"><span>Flujo de caja operativo</span><strong [class.rp-neg]="cur.cashFlow < 0">{{ money(cur.cashFlow) }}</strong><small>Variación de caja y bancos · razón corriente {{ num(cur.currentRatio, 2) }}</small></div>
  </section>

  <div class="rp-grid rp-grid--2-1">
    <section class="kit-card">
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">Ingresos y egresos por mes</h2><p class="kit-card-sub">Millones de COP · {{ chartRange }}</p></div>
        <div class="rp-legend"><span><i [style.background]="C.blue"></i>Ingresos</span><span><i [style.background]="C.amber"></i>Egresos</span></div>
      </div>
      <rp-bars [labels]="monthLabels" [series]="monthSeries" valuesShown="max" [tick]="tickM" [valueLabel]="valueM" [tooltip]="tip" aria="Ingresos y egresos por mes"></rp-bars>
      <p class="rp-note">{{ insight }}</p>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Ingresos por fuente</h2>
      <div class="rp-hbar" *ngFor="let s of cur.sources"><span>{{ s.label }}</span><div class="rp-hbar-track"><b [style.width.%]="share(s.value, maxSource)" [style.background]="C.blue"></b></div><strong>{{ money(s.value) }}</strong></div>
      <h2 class="kit-card-title fn-mt">Egresos por categoría</h2>
      <div class="rp-hbar" *ngFor="let c of topCategories"><span>{{ c.label }}</span><div class="rp-hbar-track"><b [style.width.%]="share(c.value, maxCategory)" [style.background]="C.amber"></b></div><strong>{{ money(c.value) }}</strong></div>
      <p class="rp-muted" *ngIf="!topCategories.length">Sin egresos en el período.</p>
    </section>
  </div>

  <section class="kit-card">
    <div class="rp-card-head"><h2 class="kit-card-title">Resultado por centro de costo</h2><span class="rp-muted">Valores sin impuestos al consumo (INC / IVA) · validar con el contador</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table rp-table">
        <thead><tr><th>Centro de costo</th><th class="r">Ingresos</th><th class="r">Egresos</th><th class="r">Utilidad</th><th class="r">Margen</th><th class="r">Utilidad {{ monthName(applied.compare) }}</th><th>Tendencia</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of cur.centers; let i = index">
            <td><strong>{{ c.center }}</strong></td>
            <td class="r">{{ c.income ? money(c.income) : '—' }}</td><td class="r">{{ money(c.expenses) }}</td>
            <td class="r" [class.rp-pos]="c.profit >= 0" [class.rp-neg]="c.profit < 0">{{ money(c.profit) }}</td>
            <td class="r">{{ isFinite(c.margin) ? pct(c.margin) : '—' }}</td>
            <td class="r rp-muted">{{ money(prevCenter(c.center)) }}</td>
            <td><span class="rsv-badge" [ngClass]="c.profit >= prevCenter(c.center) ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ c.profit >= prevCenter(c.center) ? 'Mejora' : 'Empeora' }}</span></td>
          </tr>
          <tr class="rp-total"><td>Total</td><td class="r">{{ money(cur.income) }}</td><td class="r">{{ money(cur.expenses) }}</td><td class="r">{{ money(cur.profit) }}</td><td class="r">{{ pct(cur.margin) }}</td><td class="r">{{ money(prev.profit) }}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="rp-note">Reparto: cada ingreso va a su centro según la cuenta (414005 alojamiento, 414095 pasadías y servicios); la nómina se reparte según el área de cada empleado
      (administración y el resto a alojamiento); los servicios públicos 85 % a alojamiento y 15 % a pasadías y servicios; mantenimiento, depreciación y aseo a alojamiento;
      honorarios, impuestos, software, gastos bancarios y lo demás a administración.</p>
  </section>
  </ng-container>
  `,
  styles: [`.fn-mt { margin-top: 18px; } .kit-banner .rsv-btn { flex-shrink: 0; }`],
})
export class FinancialComponent implements OnDestroy {
  readonly C = COLORS;
  readonly money = money; readonly pct = pct; readonly num = num; readonly monthLabel = monthLabel; readonly monthName = monthName; readonly isFinite = isFinite;
  readonly centers = COST_CENTERS;
  readonly origins = ORIGINS;
  readonly incomeCats = INCOME_SOURCES.map(s => s.label);
  readonly expenseCats = EXPENSE_CATEGORIES.map(s => s.label);
  readonly tickM = (v: number) => num(v / 1e6);
  readonly valueM = (v: number) => num(v / 1e6, 1);

  periods: string[];
  draft: FinancialFilters & { period: string; compare: string };
  applied: FinancialFilters & { period: string; compare: string };
  cur!: FinancialReport;
  prev!: FinancialReport;
  d!: Record<'income' | 'expenses' | 'profit' | 'margin', Delta>;
  cmpName = '';
  monthLabels: string[] = []; monthSeries: Series[] = []; chartRange = ''; insight = '';
  private monthly: { period: string; r: FinancialReport }[] = [];
  payrollDraft = false; payrollCost = 0;
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.periods = svc.periods();
    this.draft = { period: svc.livePeriod, compare: shiftMonth(svc.livePeriod, -1), category: '', center: '', origin: '' };
    this.applied = { ...this.draft };
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get topCategories() { return this.cur.categories.filter(c => c.value > 0).slice(0, 6); }
  get maxSource(): number { return Math.max(1, ...this.cur.sources.map(s => s.value)); }
  get maxCategory(): number { return Math.max(1, ...this.cur.categories.map(s => s.value)); }
  share(v: number, max: number): number { return Math.max(0, v / max * 100); }
  prevCenter(c: string): number { return this.prev.centers.find(x => x.center === c)?.profit ?? 0; }

  readonly tip = (i: number) => {
    const m = this.monthly[i];
    return m ? [monthLabel(m.period), `Ingresos ${millions(m.r.income)} · egresos ${millions(m.r.expenses)}`, `Utilidad ${millions(m.r.profit)} · margen ${pct(m.r.margin)}`] : [];
  };

  apply(): void {
    this.applied = { ...this.draft };
    this.compute();
    const f = this.applied;
    this.svc.log('reporte financiero generado', `${monthLabel(f.period)} vs ${monthLabel(f.compare)}${f.category ? ` · ${f.category}` : ''}${f.center ? ` · ${f.center}` : ''}${f.origin ? ` · origen ${f.origin}` : ''}`);
  }

  private compute(): void {
    const s = this.svc, f = this.applied;
    const filters = { category: f.category, center: f.center, origin: f.origin };
    this.cur = s.financial(s.monthRange(f.period), filters);
    this.prev = s.financial(s.monthRange(f.compare), filters);
    this.cmpName = monthName(f.compare).replace(/^./, c => c.toUpperCase());
    this.d = {
      income: delta(this.cur.income, this.prev.income), expenses: delta(this.cur.expenses, this.prev.expenses, 'rel', false),
      profit: delta(this.cur.profit, this.prev.profit), margin: delta(this.cur.margin, this.prev.margin, 'pp'),
    };
    const pay = s.payrollSummary(f.period);
    this.payrollDraft = !!pay.run && pay.status === 'Borrador' && !f.origin;
    this.payrollCost = pay.cost;

    const months = s.monthsUpTo(f.period, 6);
    this.monthly = months.map(period => ({ period, r: s.financial(s.monthRange(period), filters) }));
    this.monthLabels = months.map(monthShort);
    this.chartRange = `${monthName(months[0])} – ${monthName(months[months.length - 1])} ${months[months.length - 1].slice(0, 4)}`;
    this.monthSeries = [
      { name: 'Ingresos', color: COLORS.blue, values: this.monthly.map(m => m.r.income) },
      { name: 'Egresos', color: COLORS.amber, values: this.monthly.map(m => m.r.expenses) },
    ];
    if (this.payrollDraft) {
      const adjusted = this.cur.profit - this.payrollCost;
      this.insight = `${monthLabel(f.period)} todavía no incluye la nómina (${millions(this.payrollCost)} liquidados en borrador). `
        + `Con ese costo, la utilidad sería ${millions(adjusted)} y el margen ${pct(this.cur.income ? adjusted / this.cur.income * 100 : 0)}.`;
      return;
    }
    const best = this.monthly.reduce((a, b) => b.r.profit > a.r.profit ? b : a, this.monthly[0]);
    const last = this.monthly[this.monthly.length - 1];
    this.insight = best && last && best !== last
      ? `La utilidad pasó de ${millions(best.r.profit)} en ${monthName(best.period)} a ${millions(last.r.profit)} en ${monthName(last.period)}`
        + (last.r.profit < best.r.profit ? (last.r.income < best.r.income ? ': los ingresos bajaron más rápido que los egresos.' : ': los egresos crecieron más que los ingresos.') : '.')      : `${monthLabel(last.period)} es el mes con mayor utilidad del período mostrado.`;
  }

  private rows(): unknown[][] {
    const f = this.applied;
    return [
      [`Reporte financiero · ${this.svc.company}`, monthLabel(f.period), `comparado con ${monthLabel(f.compare)}`],
      ...(f.category || f.center || f.origin ? [[`Filtros: ${[f.category, f.center, f.origin && `origen ${f.origin}`].filter(Boolean).join(' · ')}`]] : []), [],
      ['Concepto', monthLabel(f.period), monthLabel(f.compare)],
      ['Ingresos totales', Math.round(this.cur.income), Math.round(this.prev.income)], ['Egresos totales', Math.round(this.cur.expenses), Math.round(this.prev.expenses)],
      ['Utilidad antes de impuestos', Math.round(this.cur.profit), Math.round(this.prev.profit)], ['Margen %', num(this.cur.margin, 1), num(this.prev.margin, 1)],
      ['Flujo de caja operativo', Math.round(this.cur.cashFlow), Math.round(this.prev.cashFlow)], [],
      ['Ingresos por fuente'], ...this.cur.sources.map(s => [s.label, Math.round(s.value)]), [],
      ['Egresos por categoría'], ...this.cur.categories.map(c => [c.label, Math.round(c.value)]), [],
      ['Centro de costo', 'Ingresos', 'Egresos', 'Utilidad', 'Margen %', `Utilidad ${monthName(f.compare)}`],
      ...this.cur.centers.map(c => [c.center, Math.round(c.income), Math.round(c.expenses), Math.round(c.profit), isFinite(c.margin) ? num(c.margin, 1) : '', Math.round(this.prevCenter(c.center))]),
      [], ['Mes', 'Ingresos', 'Egresos', 'Utilidad'], ...this.monthly.map(m => [monthLabel(m.period), Math.round(m.r.income), Math.round(m.r.expenses), Math.round(m.r.profit)]),
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.rows(), `reporte-financiero-${this.applied.period}.csv`);
    this.svc.log('exportación', `Reporte financiero.csv · ${monthLabel(this.applied.period)}`);
  }

  pdf(): void {
    const f = this.applied;
    const host = document.querySelector('app-reports-financial rp-bars');
    const line = (label: string, a: number, b: number) => `<tr><td>${label}</td><td class="r">${money(a)}</td><td class="r">${money(b)}</td></tr>`;
    openDocument('Reporte financiero', `
      <header><div><h1>Reporte financiero</h1><div class="muted">${esc(this.svc.company)} · ${monthLabel(f.period)} comparado con ${monthLabel(f.compare)}</div></div><div class="brand">SOGO</div></header>
      ${this.payrollDraft ? `<p><strong>Nota:</strong> la nómina de ${monthName(f.period)} está en borrador y aún no se incluye en los egresos.</p>` : ''}
      <table><thead><tr><th>Concepto</th><th class="r">${monthLabel(f.period)}</th><th class="r">${monthLabel(f.compare)}</th></tr></thead><tbody>
      ${line('Ingresos totales', this.cur.income, this.prev.income)}${line('Egresos totales', this.cur.expenses, this.prev.expenses)}
      ${line('Utilidad antes de impuestos', this.cur.profit, this.prev.profit)}${line('Flujo de caja operativo', this.cur.cashFlow, this.prev.cashFlow)}
      <tr><td>Margen</td><td class="r">${pct(this.cur.margin)}</td><td class="r">${pct(this.prev.margin)}</td></tr></tbody></table>
      ${host ? `<h2>Ingresos y egresos por mes</h2>${svgMarkup(host, 700)}` : ''}
      <h2>Resultado por centro de costo</h2><table><thead><tr><th>Centro</th><th class="r">Ingresos</th><th class="r">Egresos</th><th class="r">Utilidad</th></tr></thead><tbody>
      ${this.cur.centers.map(c => `<tr><td>${esc(c.center)}</td><td class="r">${money(c.income)}</td><td class="r">${money(c.expenses)}</td><td class="r">${money(c.profit)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="r">${money(this.cur.income)}</td><td class="r">${money(this.cur.expenses)}</td><td class="r">${money(this.cur.profit)}</td></tr></tbody></table>
      <p class="muted">Valores sin impuestos al consumo. Validar con el contador.</p>`, true);
    this.svc.log('exportación', `Reporte financiero.pdf · ${monthLabel(f.period)}`);
  }
}
