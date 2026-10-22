import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { PayLine, PayrollRun, RunStatus, AREAS, Area, runTotals, RunTotals, periodLabel, monthShort, addMonths } from '../payroll.model';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDateTime } from '../../shared/date-utils';
import { stampOf } from '../payroll-format';

interface Filters { period: string; employee: string; position: string; area: Area | ''; state: 'Todas excepto anuladas' | RunStatus; }

@Component({
  selector: 'app-payroll-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css', './payroll-report.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Reportes de nómina</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de nómina</h1>
      <p class="kit-sub">Vista previa antes de exportar o imprimir.{{ run?.status === 'Borrador' ? ' ' + label + ' con la liquidación en borrador.' : '' }}</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport" (click)="csv('xls')">Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport" (click)="csv('csv')">CSV</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">Imprimir</button>
    </div>
  </header>

  <section class="kit-card prp-filters">
    <label class="kit-select"><span>Período de pago</span>
      <select [(ngModel)]="draft.period"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
    <label class="kit-select"><span>Empleado</span>
      <select [(ngModel)]="draft.employee"><option value="">Todos</option><option *ngFor="let e of employeeNames" [value]="e">{{ e }}</option></select></label>
    <label class="kit-select"><span>Cargo</span>
      <select [(ngModel)]="draft.position"><option value="">Todos</option><option *ngFor="let p of positions">{{ p }}</option></select></label>
    <label class="kit-select"><span>Área de trabajo</span>
      <select [(ngModel)]="draft.area"><option value="">Todas</option><option *ngFor="let a of areas">{{ a }}</option></select></label>
    <label class="kit-select"><span>Estado</span>
      <select [(ngModel)]="draft.state"><option *ngFor="let s of states">{{ s }}</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" (click)="generate()">Generar</button>
  </section>

  <p class="kit-banner kit-banner--warn" *ngIf="!run">No hay una nómina de {{ label }} con el estado seleccionado.</p>

  <section class="kit-kpis prp-kpis">
    <div class="kit-kpi"><div><span>Total devengado</span><strong>{{ money(t.earnings) }}</strong><small>{{ t.employees }} empleados</small></div></div>
    <div class="kit-kpi"><div><span>Total deducciones</span><strong>{{ money(t.deductions) }}</strong><small>Salud, pensión y autorizadas</small></div></div>
    <div class="kit-kpi"><div><span>Aportes del empleador</span><strong>{{ money(t.employer) }}</strong><small>Seguridad social y caja</small></div></div>
    <div class="kit-kpi"><div><span>Prestaciones (provisión)</span><strong>{{ money(t.provisions) }}</strong><small>Cesantías, prima, vacaciones</small></div></div>
    <div class="kit-kpi prp-main"><div><span>Costo total de personal</span><strong>{{ money(t.earnings + t.employer + t.provisions) }}</strong><small>Devengado + aportes + prestaciones</small></div></div>
  </section>

  <div class="prp-grid">
    <section class="kit-card">
      <h2 class="kit-card-title">Total devengado por mes · {{ name(months[0].period).split(' ')[0].toLowerCase() }} a {{ label.toLowerCase() }}</h2>
      <p class="kit-card-sub">COP · sin anuladas</p>
      <div class="prp-chart" role="img" [attr.aria-label]="chartLabel">
        <div class="prp-axis"><span *ngFor="let tk of ticks">{{ short(tk) }}</span></div>
        <div class="prp-bars">
          <div class="prp-bar" *ngFor="let m of months" [class.draft]="m.draft">
            <strong>{{ m.amount ? short(m.amount) : '' }}</strong>
            <i [style.height.%]="max ? m.amount / max * 100 : 0"></i>
            <span>{{ m.label }}{{ m.draft ? '*' : '' }}</span>
          </div>
        </div>
      </div>
      <p class="pay-footnote" *ngIf="hasDraft">* Nómina en borrador: el valor puede cambiar antes de confirmar.</p>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Por área · {{ label.split(' ')[0].toLowerCase() }}</h2>
      <p class="kit-card-sub">Total devengado</p>
      <div class="prp-area" *ngFor="let a of byArea">
        <div><span>{{ a.area }}</span><strong>{{ money(a.amount) }} <small>· {{ a.pct }}%</small></strong></div>
        <i><b [style.width.%]="a.pct"></b></i>
      </div>
      <p class="kit-empty" *ngIf="!byArea.length">Sin datos.</p>
    </section>
  </div>

  <section class="kit-card">
    <div class="prp-detail-head">
      <h2 class="kit-card-title">Detalle por empleado · {{ label.toLowerCase() }}</h2>
      <span class="kit-muted">Generado {{ stamp(generatedAt) }} por {{ user }} · registrado en auditoría</span>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Empleado</th><th>Cargo</th><th class="r">Salario base</th><th class="r">Ingresos</th><th class="r">Deducciones</th><th class="r">Prestaciones</th><th class="r">Aportes empleador</th><th class="r">Neto pagado</th></tr></thead>
        <tbody>
          <tr *ngFor="let l of lines">
            <td><strong>{{ l.name }}</strong></td><td class="kit-muted">{{ l.position }}</td>
            <td class="r">{{ money(l.baseSalary) }}</td><td class="r">{{ money(l.totalEarnings) }}</td><td class="r pay-red">{{ money(l.totalDeductions) }}</td>
            <td class="r">{{ money(l.provisions.total) }}</td><td class="r">{{ money(l.employer.total) }}</td><td class="r"><strong>{{ money(l.net) }}</strong></td>
          </tr>
          <tr *ngIf="!lines.length"><td colspan="8" class="kit-empty">Sin empleados para estos filtros.</td></tr>
          <tr class="prp-total" *ngIf="lines.length">
            <td colspan="2">Totales del período</td><td class="r">{{ money(t.base) }}</td><td class="r">{{ money(t.earnings) }}</td><td class="r pay-red">{{ money(t.deductions) }}</td>
            <td class="r">{{ money(t.provisions) }}</td><td class="r">{{ money(t.employer) }}</td><td class="r">{{ money(t.net) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="pay-footnote">Prestaciones = provisión mensual de cesantías, intereses, prima, vacaciones y dotación. Aportes del empleador = salud, pensión, ARL, caja, SENA e ICBF.
      Detalle por concepto en el <a routerLink="/dashboard/payroll/costs" [queryParams]="{ periodo: applied.period }">informe de costos</a> (formato del contador).</p>
  </section>
  `,
})
export class PayrollReportComponent {
  readonly areas = AREAS;
  readonly states: Filters['state'][] = ['Todas excepto anuladas', 'Borrador', 'Confirmada', 'Pagada', 'Anulada'];
  readonly money = fmtMoney;
  readonly name = periodLabel;
  readonly stamp = stampOf;
  get user(): string { return this.svc.actor; }

  periods: string[] = [];
  positions: string[] = [];
  employeeNames: string[] = [];
  draft: Filters;
  applied: Filters;
  run?: PayrollRun;
  lines: PayLine[] = [];
  t!: RunTotals;
  months: { period: string; label: string; amount: number; draft: boolean }[] = [];
  max = 0;
  ticks: number[] = [];
  byArea: { area: string; amount: number; pct: number }[] = [];
  generatedAt = isoDateTime();

  constructor(public svc: PayrollService, private audit: UsersService, route: ActivatedRoute) {
    const wanted = route.snapshot.queryParamMap.get('periodo') ?? svc.workRun()?.period ?? svc.runsSnapshot().find(r => r.status !== 'Anulada')?.period ?? svc.currentPeriod();
    this.draft = { period: wanted, employee: '', position: '', area: '', state: 'Todas excepto anuladas' };
    this.applied = { ...this.draft };
    svc.getRuns().subscribe(runs => {
      this.periods = [...new Set(runs.map(r => r.period))].sort().reverse();
      const all = runs.flatMap(r => svc.effectiveLines(r));
      this.positions = [...new Set(all.map(l => l.position))].sort();
      this.employeeNames = [...new Set(all.map(l => l.name))].sort();
      this.compute();
    });
  }

  get label(): string { return periodLabel(this.applied.period); }
  get hasDraft(): boolean { return this.months.some(m => m.draft); }
  get chartLabel(): string { return this.months.map(m => `${m.label} ${this.money(m.amount)}`).join(', '); }

  generate(): void {
    this.applied = { ...this.draft };
    this.generatedAt = isoDateTime();
    this.compute();
    this.audit.addLog('Nómina: reporte generado', `${this.label} · ${this.lines.length} empleados · devengado ${this.money(this.t.earnings)}`);
  }

  private runFor(period: string, state: Filters['state']): PayrollRun | undefined {
    return this.svc.runsSnapshot().find(r => r.period === period && (state === 'Todas excepto anuladas' ? r.status !== 'Anulada' : r.status === state));
  }

  private filterLines(lines: PayLine[]): PayLine[] {
    const f = this.applied;
    return lines.filter(l => (!f.employee || l.name === f.employee) && (!f.position || l.position === f.position) && (!f.area || l.area === f.area));
  }

  private compute(): void {
    const f = this.applied;
    this.run = this.runFor(f.period, f.state);
    if (this.run) this.svc.setWorkPeriod(this.run.period);
    this.lines = this.run ? this.filterLines(this.svc.effectiveLines(this.run)) : [];
    this.t = runTotals(this.lines);

    this.months = Array.from({ length: 6 }, (_, i) => addMonths(f.period, i - 5)).map(p => {
      const run = this.runFor(p, 'Todas excepto anuladas');
      return { period: p, label: monthShort(p), amount: run ? runTotals(this.filterLines(this.svc.effectiveLines(run))).earnings : 0, draft: run?.status === 'Borrador' };
    });
    const top = Math.max(0, ...this.months.map(m => m.amount));
    const step = niceStep(top / 4);
    this.max = step * 4;
    this.ticks = [4, 3, 2, 1, 0].map(i => i * step);

    const areas = new Map<string, number>();
    this.lines.forEach(l => areas.set(l.area, (areas.get(l.area) ?? 0) + l.totalEarnings));
    this.byArea = [...areas].map(([area, amount]) => ({ area, amount, pct: this.t.earnings ? Math.round(amount / this.t.earnings * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  short(v: number): string {
    return v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M` : v ? `${Math.round(v / 1000)} mil` : '0';
  }

  private exportRows(): unknown[][] {
    return [
      ['Código', 'Empleado', 'Cargo', 'Área', 'Días', 'Salario base', 'Ingresos', 'IBC', 'Deducciones', 'Neto', 'Aportes empleador', 'Prestaciones'],
      ...this.lines.map(l => [l.code, l.name, l.position, l.area, l.days, l.baseSalary, l.totalEarnings, l.ibc, l.totalDeductions, l.net, l.employer.total, l.provisions.total]),
      ['', 'Totales', '', '', '', this.t.base, this.t.earnings, '', this.t.deductions, this.t.net, this.t.employer, this.t.provisions],
    ];
  }

  csv(kind: 'csv' | 'xls'): void {
    downloadCsvFile(this.exportRows(), `nomina-${this.applied.period}${kind === 'xls' ? '-excel' : ''}.csv`);
    this.audit.addLog('Nómina: reporte exportado', `${kind === 'xls' ? 'Excel' : 'CSV'} · ${this.label}`);
  }

  pdf(): void {
    const body = `
      <header><div><h1>Reporte de nómina · ${esc(this.label)}</h1><div class="muted">${esc(this.run ? this.run.status : 'Sin nómina')} · ${this.t.employees} empleados</div></div><div class="brand">SOGO</div></header>
      <table><tbody>
        <tr><td>Total devengado</td><td class="r">${this.money(this.t.earnings)}</td></tr>
        <tr><td>Total deducciones</td><td class="r">${this.money(this.t.deductions)}</td></tr>
        <tr><td>Aportes del empleador</td><td class="r">${this.money(this.t.employer)}</td></tr>
        <tr><td>Prestaciones (provisión)</td><td class="r">${this.money(this.t.provisions)}</td></tr>
        <tr class="total"><td>Costo total de personal</td><td class="r">${this.money(this.t.earnings + this.t.employer + this.t.provisions)}</td></tr>
      </tbody></table>
      <h2>Detalle por empleado</h2>
      <table><thead><tr><th>Empleado</th><th>Cargo</th><th class="r">Ingresos</th><th class="r">Deducciones</th><th class="r">Neto</th></tr></thead><tbody>
      ${this.lines.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.position)}</td><td class="r">${this.money(l.totalEarnings)}</td><td class="r">${this.money(l.totalDeductions)}</td><td class="r">${this.money(l.net)}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Totales</td><td class="r">${this.money(this.t.earnings)}</td><td class="r">${this.money(this.t.deductions)}</td><td class="r">${this.money(this.t.net)}</td></tr>
      </tbody></table>
      <p class="muted">Generado ${esc(stampOf(this.generatedAt))} por ${esc(this.user)}.</p>`;
    openDocument(`Reporte de nómina ${this.label}`, body, true);
  }
}

function niceStep(raw: number): number {
  if (raw <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find(m => m * pow >= raw) ?? 10) * pow;
}
