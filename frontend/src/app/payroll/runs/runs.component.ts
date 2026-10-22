import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { PayLine, PayrollRun, RunStatus, RUN_BADGE, RunTotals, runTotals, periodLabel, periodEnd, addMonths } from '../payroll.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { dmy } from '../payroll-format';

interface Row { run: PayrollRun; lines: PayLine[]; t: RunTotals; }

@Component({
  selector: 'app-payroll-runs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Consultar nómina</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Consultar nómina</h1>
      <p class="kit-sub">Nóminas liquidadas por período, con su detalle por empleado y el comprobante asociado.</p>
    </div>
  </header>

  <section class="kit-card pay-filters" style="margin-bottom: 18px">
    <div class="kit-search">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Buscar por empleado..." aria-label="Buscar por empleado">
    </div>
    <label class="kit-select"><span>Desde</span><input type="month" [(ngModel)]="from" (ngModelChange)="apply()"></label>
    <label class="kit-select"><span>Hasta</span><input type="month" [(ngModel)]="to" (ngModelChange)="apply()"></label>
    <label class="kit-select"><span>Cargo</span>
      <select [(ngModel)]="position" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let p of positions">{{ p }}</option></select></label>
    <label class="kit-select"><span>Estado</span>
      <select [(ngModel)]="status" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
  </section>

  <div class="kit-layout runs-layout">
    <section class="kit-card">
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Período</th><th>Tipo</th><th class="r">Empleados</th><th class="r">Devengado</th><th class="r">Deducciones</th><th class="r">Neto</th><th>Estado</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rows" class="clickable" [class.selected]="r.run.id === selected?.run?.id" [class.pay-retired]="r.run.status === 'Anulada'"
                (click)="selected = r" tabindex="0" (keydown.enter)="selected = r">
              <td><strong>{{ name(r.run.period) }}</strong><small class="pay-sub">01–{{ periodEnd(r.run.period).slice(8) }}/{{ r.run.period.slice(5) }}</small></td>
              <td>Mensual</td>
              <td class="r">{{ r.t.employees }}</td>
              <td class="r">{{ money(r.t.earnings) }}</td>
              <td class="r pay-red">{{ money(r.t.deductions) }}</td>
              <td class="r"><strong>{{ money(r.t.net) }}</strong></td>
              <td><span class="rsv-badge" [ngClass]="badge[r.run.status]">{{ statusText(r.run) }}</span><small class="pay-sub">{{ who(r.run) }}</small></td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="7" class="kit-empty">No hay nóminas con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="kit-aside" *ngIf="selected as s">
      <section class="kit-card">
        <div class="runs-head">
          <div><span>Detalle de la nómina</span><strong>{{ name(s.run.period) }}</strong></div>
          <span class="rsv-badge" [ngClass]="badge[s.run.status]">{{ statusText(s.run) }}{{ s.run.paidAt ? ' · ' + s.run.paidAt.slice(8, 10) + '/' + s.run.paidAt.slice(5, 7) : '' }}</span>
        </div>
        <div class="runs-mini">
          <div><span>Salario base</span><strong>{{ money(s.t.base) }}</strong></div>
          <div><span>Deducciones</span><strong class="pay-red">{{ money(s.t.deductions) }}</strong></div>
          <div><span>{{ s.run.status === 'Pagada' ? 'Neto pagado' : 'Neto' }}</span><strong>{{ money(s.t.net) }}</strong></div>
        </div>
        <p class="pay-footnote" *ngIf="s.run.annulment">Anulada: {{ s.run.annulment.reason }} · {{ s.run.annulment.by }}</p>
        <table class="kit-table">
          <thead><tr><th>Empleado</th><th class="r">Neto</th><th>Comprobante</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of s.lines">
              <td>{{ l.name }}<small class="pay-sub" *ngIf="l.note">{{ l.note }}</small></td>
              <td class="r"><strong>{{ money(l.net) }}</strong></td>
              <td><a class="kit-code" routerLink="/dashboard/payroll/payslips" [queryParams]="{ nomina: s.run.id }">{{ slip(s.run, l) }}</a></td>
            </tr>
          </tbody>
        </table>
        <div class="runs-actions">
          <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/liquidation" [queryParams]="{ nomina: s.run.id }">{{ s.run.status === 'Borrador' ? 'Continuar liquidación' : 'Ver liquidación' }}</a>
          <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/reports" [queryParams]="{ periodo: s.run.period }">Reporte</a>
        </div>
      </section>
    </aside>
  </div>
  `,
  styles: [`
    .runs-layout { grid-template-columns: minmax(0, 1fr) 380px; }
    .runs-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .runs-head span:first-child { display: block; font-size: 10.5px; text-transform: uppercase; color: #6B7280; }
    .runs-head strong { font-size: 17px; color: #0A2540; }
    .runs-mini { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .runs-mini div { padding: 9px; border-radius: 10px; background: #F4F7FB; font-size: 11px; color: #6B7280; }
    .runs-mini strong { display: block; font-size: 13px; color: #0A2540; }
    .runs-actions { display: flex; gap: 8px; margin-top: 12px; }
    .runs-actions .rsv-btn { flex: 1; height: 38px; }
  `],
})
export class RunsComponent {
  readonly statuses: RunStatus[] = ['Borrador', 'Confirmada', 'Pagada', 'Anulada'];
  readonly badge = RUN_BADGE;
  readonly money = fmtMoney;
  readonly name = periodLabel;
  readonly periodEnd = periodEnd;

  all: Row[] = [];
  rows: Row[] = [];
  selected?: Row;
  positions: string[] = [];
  search = '';
  from = '';
  to = '';
  position = '';
  status = '';

  constructor(private svc: PayrollService) {
    const current = svc.currentPeriod();
    this.from = addMonths(current, -5);
    this.to = current;
    svc.getRuns().subscribe(runs => {
      this.all = runs.map(run => { const lines = svc.effectiveLines(run); return { run, lines, t: runTotals(lines) }; });
      this.positions = [...new Set(this.all.flatMap(r => r.lines.map(l => l.position)))].sort();
      this.apply();
    });
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    this.rows = this.all
      .filter(r => (!this.from || r.run.period >= this.from) && (!this.to || r.run.period <= this.to) && (!this.status || r.run.status === this.status))
      .map(r => {
        // Con búsqueda o cargo, los totales son los de los empleados que coinciden
        if (!q && !this.position) return r;
        const lines = r.lines.filter(l => (!q || l.name.toLowerCase().includes(q)) && (!this.position || l.position === this.position));
        return { ...r, lines, t: runTotals(lines) };
      })
      .filter(r => r.lines.length);
    this.selected = this.rows.find(r => r.run.id === this.selected?.run.id) ?? this.rows.find(r => r.run.id === this.svc.workRun()?.id) ?? this.rows.find(r => r.run.status === 'Pagada') ?? this.rows[0];
  }

  statusText(run: PayrollRun): string {
    return run.status === 'Borrador' || run.status === 'Confirmada' ? 'Pendiente' : run.status;
  }

  who(run: PayrollRun): string {
    const d = (iso?: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
    if (run.status === 'Borrador') return `Borrador · ${d(run.createdAt)}`;
    const p = this.svc.paymentProgress(run);
    if (run.status === 'Confirmada') return `Por pagar · ${p.paid}/${p.total} pagados por Nequi`;
    if (run.status === 'Anulada') return `${run.annulment?.reason ?? 'Anulada'} · ${d(run.annulment?.at)}`;
    return `${run.paidBy} · ${d(run.paidAt)} · firmas ${p.signed}/${p.total}`;
  }

  slip(run: PayrollRun, l: PayLine): string {
    const p = this.svc.payslipFor(run, l.employeeId);
    return p.payslip ? p.number : 'Sin generar';
  }
}
