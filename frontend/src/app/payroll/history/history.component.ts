import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService, PaymentRow } from '../payroll.service';
import { Employee, fullName, periodLabel, legalDeductions } from '../payroll.model';
import { BillingConfigService } from '../../billing/billing-config.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { dmy, payslipHtml } from '../payroll-format';

type Chip = 'Todos' | PaymentRow['status'];
const BADGE: Record<PaymentRow['status'], string> = { Pagado: 'rsv-badge--ok', Pendiente: 'rsv-badge--warn', Anulado: 'rsv-badge--muted' };

@Component({
  selector: 'app-payroll-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Historial de pagos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Historial de pagos</h1>
      <p class="kit-sub">Pagos realizados a cada empleado, con su comprobante.</p>
    </div>
  </header>

  <section class="kit-card pay-filters" style="margin-bottom: 18px">
    <label class="kit-select his-emp"><span>Empleado</span>
      <select [(ngModel)]="employeeId" (ngModelChange)="load()">
        <optgroup label="Personal vigente"><option *ngFor="let e of current" [value]="e.id">{{ e.code }} · {{ name(e) }} · {{ e.position }}</option></optgroup>
        <optgroup label="Retirados (exempleados)" *ngIf="retired.length"><option *ngFor="let e of retired" [value]="e.id">{{ e.code }} · {{ name(e) }} · retirado{{ e.retiredAt ? ' ' + dmy(e.retiredAt) : '' }}</option></optgroup>
      </select></label>
    <div class="kit-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="N.º de comprobante..." aria-label="Número de comprobante"></div>
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="apply()"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" (ngModelChange)="apply()"></label>
    <div class="kit-chips">
      <button type="button" class="kit-chip" *ngFor="let c of chips" [class.active]="chip === c" (click)="chip = c; apply()">{{ c }} <small>{{ counts[c] }}</small></button>
    </div>
  </section>

  <section class="kit-kpis">
    <div class="kit-kpi"><div><span>Total pagado en {{ year }}</span><strong>{{ money(kpi.paid) }}</strong><small>{{ kpi.count }} pago{{ kpi.count === 1 ? '' : 's' }}{{ kpi.range }}</small></div></div>
    <div class="kit-kpi"><div><span>Total deducciones {{ year }}</span><strong>{{ money(kpi.deductions) }}</strong><small>Salud y pensión</small></div></div>
    <div class="kit-kpi"><div><span>Promedio neto mensual</span><strong>{{ money(kpi.avg) }}</strong><small>Pagos efectivos</small></div></div>
    <div class="kit-kpi"><div><span>Próximo pago</span><strong>{{ kpi.next ? dmy(kpi.next.run.payDate) : '—' }}</strong><small>{{ kpi.next ? kpi.next.number + ' · pendiente' : 'Sin pagos pendientes' }}</small></div></div>
  </section>

  <div class="kit-layout">
    <section class="kit-card">
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Comprobante</th><th>Período</th><th>Fecha de pago</th><th class="r">Salario base</th><th class="r">Deducciones</th><th class="r">Neto pagado</th><th>Estado</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rows" class="clickable" [class.selected]="r === selected" [class.pay-retired]="r.status === 'Anulado'" (click)="selected = r" tabindex="0" (keydown.enter)="selected = r">
              <td><span class="kit-code">{{ r.number }}</span></td>
              <td>{{ period(r.run.period) }}<small class="pay-sub" *ngIf="r.note">{{ r.note }}</small></td>
              <td>{{ r.status === 'Anulado' ? '—' : dmy(r.run.payDate) + (r.status === 'Pendiente' ? ' (programado)' : '') }}</td>
              <td class="r">{{ money(r.line.baseSalary) }}</td>
              <td class="r pay-red">− {{ money(r.line.totalDeductions) }}</td>
              <td class="r"><strong>{{ money(r.line.net) }}</strong></td>
              <td><span class="rsv-badge" [ngClass]="badge[r.status]">{{ r.status }}</span></td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="7" class="kit-empty">No hay pagos con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="kit-aside" *ngIf="selected as s">
      <section class="kit-card">
        <div class="his-head">
          <div><span>Detalle del pago</span><strong>{{ s.number }}</strong></div>
          <span class="rsv-badge" [ngClass]="badge[s.status]">{{ s.status }}</span>
        </div>
        <dl class="his-facts">
          <div><dt>Período</dt><dd>{{ period(s.run.period) }}</dd></div>
          <ng-container *ngIf="s.run.payments?.[s.line.employeeId] as p; else noPay">
            <div><dt>Pagado el</dt><dd>{{ dmy(p.paidAt) }} · Nequi {{ p.to }}</dd></div>
            <div><dt>Referencia Nequi</dt><dd>{{ p.reference }}</dd></div>
            <div><dt>Firma de recibido</dt><dd>{{ p.receipt ? 'Firmado ' + dmy(p.receipt.at) : 'Pendiente' }}</dd></div>
          </ng-container>
          <ng-template #noPay><div><dt>Fecha de pago</dt><dd>{{ dmy(s.run.payDate) }} · {{ s.line.account }}</dd></div></ng-template>
        </dl>
        <h3 class="his-sub">Devengados</h3>
        <div class="kit-sum" *ngFor="let e of s.line.earnings"><span>{{ e.concept }}</span><strong>{{ money(e.value) }}</strong></div>
        <h3 class="his-sub">Deducciones</h3>
        <div class="kit-sum" *ngFor="let d of s.line.deductions"><span>{{ d.concept }}</span><strong class="pay-red">− {{ money(d.value) }}</strong></div>
        <div class="kit-sum kit-sum--total"><strong>{{ s.status === 'Pagado' ? 'Neto pagado' : 'Neto' }}</strong><strong>{{ money(s.line.net) }}</strong></div>
        <div class="his-actions">
          <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/payslips" [queryParams]="{ nomina: s.run.id }">Ver comprobante</a>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf(s)">Descargar PDF</button>
        </div>
      </section>
    </aside>
  </div>
  `,
  styles: [`
    .his-emp { min-width: 280px; }
    .his-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .his-head span:first-child { display: block; font-size: 10.5px; text-transform: uppercase; color: #6B7280; }
    .his-head strong { font-family: ui-monospace, 'Consolas', monospace; font-size: 15px; color: #0A2540; }
    .his-facts { margin: 0 0 10px; padding: 10px 12px; background: #F4F7FB; border-radius: 10px; font-size: 12px; }
    .his-facts div { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
    .his-facts dt { color: #6B7280; } .his-facts dd { margin: 0; font-weight: 600; color: #0A2540; }
    .his-sub { margin: 12px 0 2px; font-size: 13px; color: #0A2540; }
    .his-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .his-actions .rsv-btn { height: 38px; padding: 0 10px; }
  `],
})
export class HistoryComponent {
  readonly chips: Chip[] = ['Todos', 'Pagado', 'Pendiente', 'Anulado'];
  readonly badge = BADGE;
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly name = fullName;
  readonly period = periodLabel;
  readonly year = isoDate(0).slice(0, 4);

  employees: Employee[] = [];
  current: Employee[] = [];
  retired: Employee[] = [];
  employeeId = '';
  all: PaymentRow[] = [];
  rows: PaymentRow[] = [];
  selected?: PaymentRow;
  counts = {} as Record<Chip, number>;
  chip: Chip = 'Todos';
  search = '';
  from = `${isoDate(0).slice(0, 4)}-01-01`;
  to = `${isoDate(0).slice(0, 4)}-12-31`;
  kpi = { paid: 0, count: 0, range: '', deductions: 0, avg: 0, next: undefined as PaymentRow | undefined };

  constructor(private svc: PayrollService, private config: BillingConfigService, route: ActivatedRoute) {
    this.employees = [...svc.employeesSnapshot()].sort((a, b) => a.code.localeCompare(b.code));
    this.current = this.employees.filter(e => e.status !== 'Retirado');
    this.retired = this.employees.filter(e => e.status === 'Retirado');
    this.employeeId = route.snapshot.queryParamMap.get('empleado') ?? this.current[0]?.id ?? this.employees[0]?.id ?? '';
    svc.getRuns().subscribe(() => this.load());
  }

  load(): void {
    this.all = this.svc.paymentsFor(this.employeeId);
    const paid = this.all.filter(r => r.status === 'Pagado' && r.run.period.startsWith(this.year));
    const months = paid.map(r => r.run.period).sort();
    this.kpi = {
      paid: paid.reduce((s, r) => s + r.line.net, 0), count: paid.length,
      range: months.length ? ` · ${periodLabel(months[0]).split(' ')[0].toLowerCase()} a ${periodLabel(months[months.length - 1]).split(' ')[0].toLowerCase()}` : '',
      deductions: paid.reduce((s, r) => s + legalDeductions(r.line), 0),
      avg: paid.length ? Math.round(paid.reduce((s, r) => s + r.line.net, 0) / paid.length) : 0,
      next: this.all.find(r => r.status === 'Pendiente'),
    };
    this.selected = undefined;
    this.apply();
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    const base = this.all.filter(r => (!q || r.number.toLowerCase().includes(q))
      && (!this.from || r.run.payDate >= this.from) && (!this.to || r.run.payDate <= this.to));
    this.chips.forEach(c => this.counts[c] = base.filter(r => c === 'Todos' || r.status === c).length);
    this.rows = base.filter(r => this.chip === 'Todos' || r.status === this.chip);
    this.selected = this.rows.includes(this.selected!) ? this.selected : this.rows.find(r => r.status === 'Pagado') ?? this.rows[0];
  }

  pdf(r: PaymentRow): void {
    openDocument(`Comprobante ${r.number}`, payslipHtml(r.run, r.line, r.number, this.config.get().issuer), true);
  }
}
