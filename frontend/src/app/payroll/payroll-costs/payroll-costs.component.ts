import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { PayLine, PayrollRun, EXEMPTION, PAYROLL_START, periodLabel } from '../payroll.model';
import { CostSheet, CostRow, COST_NOTES, costSheet } from '../cost-sheet';
import { UsersService } from '../../users/users.service';
import { BillingConfigService } from '../../billing/billing-config.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDateTime } from '../../shared/date-utils';
import { stampOf } from '../payroll-format';

const ALL = '';

@Component({
  selector: 'app-payroll-costs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Informe de costos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Informe de costos de nómina</h1>
      <p class="kit-sub">Formato del contador: por concepto, lo que asume el trabajador y lo que asume el empleador.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport || !run" (click)="pdf(false)">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport || !run" (click)="excel()">Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!run" (click)="pdf(true)">Imprimir</button>
    </div>
  </header>

  <section class="kit-card pc-filters">
    <label class="kit-select"><span>Mes</span>
      <select [(ngModel)]="period" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}{{ hasRun(p) ? '' : ' · sin liquidar' }}</option></select></label>
    <div class="pc-who">
      <span class="kit-muted">Ver:</span>
      <div class="kit-chips">
        <button type="button" class="kit-chip" [class.active]="who === all" (click)="pick(all)">Consolidado <small>{{ lines.length }}</small></button>
        <button type="button" class="kit-chip" *ngFor="let l of lines" [class.active]="who === l.employeeId" (click)="pick(l.employeeId)">
          {{ first(l.name) }} <small>{{ l.position }}</small></button>
      </div>
    </div>
  </section>

  <p class="kit-banner kit-banner--warn" *ngIf="!run">{{ name(period) }} todavía no está liquidado en SOGO.
    <a class="rsv-btn rsv-btn--outline" *ngIf="svc.canCreate" routerLink="/dashboard/payroll/liquidation" [queryParams]="{ periodo: period }">Liquidar {{ name(period).toLowerCase() }}</a></p>
  <p class="kit-banner kit-banner--warn" *ngIf="run?.status === 'Borrador'">Nómina en borrador: los valores se recalculan con cualquier cambio hasta que se confirme.</p>

  <ng-container *ngIf="run && s">
  <section class="kit-kpis pc-kpis">
    <div class="kit-kpi pc-main"><div><span>Asume el empleador en el mes</span><strong>{{ money(s.employerMonth) }}</strong><small>Salario, auxilio, prestaciones, aportes y dotación</small></div></div>
    <div class="kit-kpi"><div><span>Neto a pagar al empleado</span><strong>{{ money(s.net) }}</strong><small>Devengado {{ money(s.earnings) }} − deducciones {{ money(s.deductions) }}</small></div></div>
    <div class="kit-kpi"><div><span>Costo por cada $1 de salario</span><strong>{{ factorText }}</strong><small>Lo que la empresa asume sobre el salario básico</small></div></div>
    <div class="kit-kpi"><div><span>Asume el empleador en el año</span><strong>{{ money(s.employerYear) }}</strong><small>Real {{ accRange }}: {{ money(acc.employer) }} ({{ acc.months }} {{ acc.months === 1 ? 'mes' : 'meses' }})</small></div></div>
  </section>

  <section class="kit-card pc-sheet">
    <div class="pc-title">
      <strong>{{ issuer.name }}</strong>
      <span>Nómina {{ year }} · mes: {{ month }}{{ selected ? ' · ' + selected.position : '' }}</span>
      <b>{{ selected ? 'Empleado: ' + selected.name : 'Consolidado · ' + lines.length + ' empleados' }}</b>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table pc-table">
        <thead><tr><th>Concepto</th><th class="r">Base para liquidar</th><th class="r">Porcentaje</th><th class="r">Asume el trabajador</th><th class="r">Porcentaje</th><th class="r">Asume el empleador</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of s.rows" [ngClass]="'pc-' + r.group">
            <td>{{ r.concept }} <small class="pc-note">{{ r.notes }}</small></td>
            <td class="r">{{ r.base !== null ? money(r.base) : '' }}</td>
            <td class="r pc-pct">{{ r.workerPct }}</td>
            <td class="r">{{ cell(r, r.worker) }}</td>
            <td class="r pc-pct">{{ r.employerPct }}</td>
            <td class="r">{{ cell(r, r.employer) }}</td>
          </tr>
          <tr class="pc-strong"><td colspan="5">Valores asumidos por el empleador en el mes</td><td class="r pc-hl">{{ money(s.employerMonth) }}</td></tr>
          <tr><td colspan="5">Devengado por el empleado <small class="pc-note">(11)</small></td><td class="r">{{ money(s.earnings) }}</td></tr>
          <tr><td colspan="3">Deducciones para el empleado</td><td class="r pay-red">{{ money(s.deductions) }}</td><td colspan="2"></td></tr>
          <tr class="pc-strong"><td colspan="5">Neto por pagar al empleado en el mes</td><td class="r pc-hl">{{ money(s.net) }}</td></tr>
          <tr class="pc-year"><td colspan="5">Valores asumidos por el empleador en el año</td><td class="r">{{ money(s.employerYear) }}</td></tr>
          <tr><td colspan="5">Valores netos pagados al empleado en el año</td><td class="r">{{ money(s.netYear) }}</td></tr>
          <tr class="pc-proj"><td colspan="5">Seguimiento · acumulado real {{ accRange }} ({{ acc.months }} {{ acc.months === 1 ? 'nómina' : 'nóminas' }}) <small>· empleador / neto</small></td><td class="r">{{ money(acc.employer) }}<small class="pay-sub">{{ money(acc.net) }}</small></td></tr>
        </tbody>
      </table>
    </div>
    <ol class="pc-notes">
      <li *ngFor="let n of notes"><b>({{ n[0] }})</b> {{ n[1] }}</li>
    </ol>
    <p class="pay-footnote">{{ exemptText }} Los porcentajes salen de la liquidación; se cambian en
      <a routerLink="/dashboard/settings/payroll">Configuración › Parámetros de nómina</a> y aplican a los borradores (las nóminas confirmadas conservan los suyos).
      {{ run.status !== 'Borrador' ? 'Nómina ' + run.status.toLowerCase() + (run.confirmedAt ? ' el ' + stamp(run.confirmedAt) : '') + '.' : '' }}</p>
  </section>

  <section class="kit-card" *ngIf="!selected && lines.length > 1">
    <h2 class="kit-card-title">Costo por empleado · {{ name(period).toLowerCase() }}</h2>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Empleado</th><th>Cargo</th><th class="r">Devengado</th><th class="r">Asume el empleador</th><th class="r">Neto</th><th>Parte del costo</th></tr></thead>
        <tbody>
          <tr *ngFor="let p of people" class="clickable" (click)="pick(p.line.employeeId)" tabindex="0" (keydown.enter)="pick(p.line.employeeId)">
            <td><strong>{{ p.line.name }}</strong></td><td class="kit-muted">{{ p.line.position }}</td>
            <td class="r">{{ money(p.sheet.earnings) }}</td><td class="r"><strong>{{ money(p.sheet.employerMonth) }}</strong></td><td class="r">{{ money(p.sheet.net) }}</td>
            <td class="pc-share"><i><b [style.width.%]="p.pct"></b></i><span>{{ p.pct }} %</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  </ng-container>
  `,
  styles: [`
    .pc-filters { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 18px; }
    .pc-filters .kit-select { min-width: 180px; }
    .pc-who { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; flex: 1; }
    .pc-kpis { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .pc-main { border-color: #0B6FD0; }
    .pc-main strong { color: #0A3D6D; }
    .pc-sheet { margin-bottom: 18px; }
    .pc-title { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-bottom: 14px; text-align: center; }
    .pc-title strong { font-size: 14px; color: #0A2540; text-transform: uppercase; letter-spacing: .03em; }
    .pc-title span { font-size: 12.5px; color: #374151; }
    .pc-title b { font-size: 12px; color: #0B6FD0; }
    .pc-table th { white-space: nowrap; }
    .pc-table td { padding-top: 7px; padding-bottom: 7px; }
    .pc-note { color: #6B7280; font-size: 10.5px; }
    .pc-pct { color: #6B7280; font-size: 12px; }
    .pc-prestacion td { background: #F4F8FD; }
    .pc-aporte td { background: #F7FAF8; }
    .pc-strong td { font-weight: 700; color: #0A2540; border-top: 2px solid #D5DEEA; }
    .pc-hl { background: #E3EEFF; color: #0A3D6D; }
    .pc-year td { border-top: 2px solid #0A2540; font-weight: 600; }
    .pc-proj td { color: #6B7280; font-size: 12px; }
    .pc-notes { margin: 14px 0 6px; padding: 0; list-style: none; columns: 2 320px; column-gap: 24px; font-size: 11.5px; color: #4B5563; line-height: 1.5; }
    .pc-notes li { break-inside: avoid; margin-bottom: 4px; }
    .pc-share { display: flex; align-items: center; gap: 8px; min-width: 140px; }
    .pc-share i { flex: 1; height: 7px; border-radius: 999px; background: #E6EBF2; overflow: hidden; }
    .pc-share b { display: block; height: 100%; background: #1565C0; }
    .pc-share span { font-size: 12px; color: #374151; min-width: 38px; text-align: right; }
  `],
})
export class PayrollCostsComponent {
  readonly money = fmtMoney;
  readonly name = periodLabel;
  readonly stamp = stampOf;
  readonly notes = COST_NOTES;
  readonly all = ALL;

  periods: string[] = [];
  period: string;
  who = ALL;
  run?: PayrollRun;
  lines: PayLine[] = [];
  s?: CostSheet;
  acc = { employer: 0, net: 0, months: 0, from: '' };
  people: { line: PayLine; sheet: CostSheet; pct: number }[] = [];

  constructor(public svc: PayrollService, private audit: UsersService, private config: BillingConfigService, route: ActivatedRoute) {
    this.period = route.snapshot.queryParamMap.get('periodo') ?? svc.workRun()?.period ?? svc.runsSnapshot().find(r => r.status !== 'Anulada')?.period ?? PAYROLL_START;
    this.who = route.snapshot.queryParamMap.get('empleado') ?? ALL;
    svc.getRuns().subscribe(runs => {
      this.periods = svc.liquidablePeriods();
      if (this.periods.length && !this.periods.includes(this.period)) this.period = this.periods[0];
      this.compute();
    });
  }

  get issuer() { return this.config.get().issuer; }
  get year(): string { return this.period.slice(0, 4); }
  get month(): string { return periodLabel(this.period).split(' ')[0].toLowerCase(); }
  get monthShort(): string { return this.month.slice(0, 3); }
  /** "sep–oct": meses con nómina que suman en el acumulado del año. */
  get accRange(): string {
    const from = this.acc.from ? periodLabel(this.acc.from).slice(0, 3).toLowerCase() : this.monthShort;
    return from === this.monthShort ? from : `${from}–${this.monthShort}`;
  }
  hasRun(p: string): boolean { return this.svc.runsSnapshot().some(r => r.period === p && r.status !== 'Anulada'); }
  get selected(): PayLine | undefined { return this.lines.find(l => l.employeeId === this.who); }
  get factorText(): string { return this.s ? '$ ' + this.s.factor.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }
  get exemptText(): string {
    return EXEMPTION.exempt114 ? 'Exoneración art. 114-1 activa: salud del empleador, SENA e ICBF en 0 para salarios menores a 10 SMMLV.'
      : 'Se liquidan salud del empleador (8,5 %), SENA e ICBF: la exoneración del art. 114-1 no está activa.';
  }

  first(n: string): string { return n.split(' ')[0]; }

  /** "$ -" en prestaciones que no asume el trabajador (como en el formato); vacío si no aplica. */
  cell(r: CostRow, v: number | null): string { return v === null ? '' : v === 0 ? '$ -' : this.money(v); }

  pick(id: string): void { this.who = id; this.compute(); }

  private runFor(period: string): PayrollRun | undefined {
    return this.svc.runsSnapshot().find(r => r.period === period && r.status !== 'Anulada');
  }

  private mine(lines: PayLine[]): PayLine[] { return this.who === ALL ? lines : lines.filter(l => l.employeeId === this.who); }

  compute(): void {
    this.run = this.runFor(this.period);
    if (this.run) this.svc.setWorkPeriod(this.run.period);
    this.lines = this.run ? this.svc.effectiveLines(this.run) : [];
    if (this.who !== ALL && !this.selected) this.who = ALL;
    this.s = this.run ? costSheet(this.mine(this.lines)) : undefined;

    // Acumulado del año: nóminas vigentes de enero hasta el mes escogido
    this.acc = { employer: 0, net: 0, months: 0, from: '' };
    this.svc.runsSnapshot().filter(r => r.status !== 'Anulada' && r.period.startsWith(this.year) && r.period <= this.period).forEach(r => {
      const mine = this.mine(this.svc.effectiveLines(r));
      if (!mine.length) return;
      const x = costSheet(mine);
      this.acc.employer += x.employerMonth;
      this.acc.net += x.net;
      this.acc.months++;
      if (!this.acc.from || r.period < this.acc.from) this.acc.from = r.period;
    });

    const total = this.s && this.who === ALL ? this.s.employerMonth : 0;
    this.people = this.lines.map(line => {
      const sheet = costSheet([line]);
      return { line, sheet, pct: total ? Math.round(sheet.employerMonth / total * 100) : 0 };
    }).sort((a, b) => b.sheet.employerMonth - a.sheet.employerMonth);
  }

  private get heading(): string {
    const who = this.selected ? `${this.selected.position.toUpperCase()} · ${this.selected.name}` : 'CONSOLIDADO';
    return `NÓMINA ${this.year} · MES: ${this.month.toUpperCase()} · ${who}`;
  }

  private exportRows(): unknown[][] {
    const s = this.s!;
    const v = (x: number | null) => x === null ? '' : x;
    return [
      [this.issuer.name], [this.heading], [],
      ['Concepto', 'Notas', 'Base para liquidar', 'Porcentaje', 'Asume el trabajador', 'Porcentaje', 'Asume el empleador'],
      ...s.rows.map(r => [r.concept, r.notes, v(r.base), r.workerPct, v(r.worker), r.employerPct, v(r.employer)]),
      ['Valores asumidos por el empleador en el mes', '', '', '', '', '', s.employerMonth],
      ['Devengado por el empleado', '(11)', '', '', '', '', s.earnings],
      ['Deducciones para el empleado', '', '', '', s.deductions, '', ''],
      ['Neto por pagar al empleado en el mes', '', '', '', '', '', s.net],
      ['Valores asumidos por el empleador en el año', '', '', '', '', '', s.employerYear],
      ['Valores netos pagados al empleado en el año', '', '', '', '', '', s.netYear],
      [`Seguimiento · acumulado real empleador (${this.acc.months} meses)`, '', '', '', '', '', this.acc.employer],
      ['Seguimiento · acumulado real neto pagado', '', '', '', '', '', this.acc.net],
      [], ...COST_NOTES.map(n => [`(${n[0]}) ${n[1]}`]),
    ];
  }

  excel(): void {
    if (!this.s) return;
    const who = this.selected ? this.selected.code : 'consolidado';
    downloadCsvFile(this.exportRows(), `costos-nomina-${this.period}-${who}.csv`);
    this.audit.addLog('Nómina: informe de costos exportado', `Excel · ${periodLabel(this.period)} · ${this.selected?.name ?? 'Consolidado'}`);
  }

  pdf(print: boolean): void {
    const s = this.s;
    if (!s) return;
    const m = (x: number | null, r?: CostRow) => x === null ? '' : x === 0 && r ? '$ -' : this.money(x);
    const body = `
      <div style="text-align:center;margin-bottom:16px"><h1 style="margin:0">${esc(this.issuer.name.toUpperCase())}</h1>
        <div style="font-weight:700">${esc(this.heading)}</div>
        <div class="muted">Nómina ${esc(this.run!.status.toLowerCase())} · generado ${esc(stampOf(isoDateTime()))} por ${esc(this.svc.actor)}</div></div>
      <table><thead><tr><th>Concepto</th><th class="r">Base para liquidar</th><th class="r">%</th><th class="r">Trabajador</th><th class="r">%</th><th class="r">Empleador</th></tr></thead><tbody>
      ${s.rows.map(r => `<tr${r.group === 'prestacion' || r.group === 'aporte' ? ' style="background:#F4F8FD"' : ''}><td>${esc(r.concept)} <span class="muted">${esc(r.notes)}</span></td>
        <td class="r">${m(r.base)}</td><td class="r">${esc(r.workerPct)}</td><td class="r">${m(r.worker, r)}</td><td class="r">${esc(r.employerPct)}</td><td class="r">${m(r.employer, r)}</td></tr>`).join('')}
      <tr class="total"><td colspan="5">Valores asumidos por el empleador en el mes</td><td class="r">${this.money(s.employerMonth)}</td></tr>
      <tr><td colspan="5">Devengado por el empleado (11)</td><td class="r">${this.money(s.earnings)}</td></tr>
      <tr><td colspan="3">Deducciones para el empleado</td><td class="r">${this.money(s.deductions)}</td><td colspan="2"></td></tr>
      <tr class="total"><td colspan="5">Neto por pagar al empleado en el mes</td><td class="r">${this.money(s.net)}</td></tr>
      <tr class="total"><td colspan="5">Valores asumidos por el empleador en el año</td><td class="r">${this.money(s.employerYear)}</td></tr>
      <tr><td colspan="5">Valores netos pagados al empleado en el año</td><td class="r">${this.money(s.netYear)}</td></tr>
      <tr><td colspan="5" class="muted">Seguimiento · acumulado real ${this.accRange} (${this.acc.months} meses) · empleador / neto</td><td class="r muted">${this.money(this.acc.employer)} / ${this.money(this.acc.net)}</td></tr>
      </tbody></table>
      <div class="muted" style="font-size:11px;margin-top:14px">${COST_NOTES.map(n => `(${n[0]}) ${esc(n[1])}`).join('<br>')}<br>${esc(this.exemptText)}</div>`;
    openDocument(`Costos de nómina ${periodLabel(this.period)}`, body, print);
    this.audit.addLog('Nómina: informe de costos exportado', `${print ? 'Impreso' : 'PDF'} · ${periodLabel(this.period)} · ${this.selected?.name ?? 'Consolidado'}`);
  }
}
