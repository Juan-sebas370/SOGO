import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { Employee, EmployeeStatus, AREAS, CONTRACT_TYPES, fullName, initials, missingData, salaryAt, monthsBetween } from '../payroll.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';
import { dmy, stampOf } from '../payroll-format';

// Vigentes = personal actual (activos y en vacaciones); los retirados quedan aparte, con su historial
type Tab = 'Vigentes' | 'Todos' | EmployeeStatus;

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Empleados</h1>
      <p class="kit-sub">Personal del hospedaje: datos personales, laborales y contractuales.</p>
    </div>
    <a routerLink="/dashboard/payroll/employees/new" class="rsv-btn rsv-btn--primary" *ngIf="svc.canCreate">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Registrar empleado
    </a>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="created as e" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>{{ flash === 'updated' ? 'Empleado actualizado' : 'Empleado registrado exitosamente' }} · {{ e.code }} {{ name(e) }}</strong>
      {{ flash === 'updated' ? 'Los cambios quedaron en su historial.' : 'Ya está disponible para liquidar nómina.' }} Registro: {{ e.history[0].by }} · {{ stamp(e.history[0].at) }}.</div>
    <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/payroll/employees', e.id]">Ver ficha</a>
  </div>

  <div class="kit-banner kit-banner--info" *ngIf="withoutRecord.length" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <div><strong>Cuentas de Usuarios sin ficha de empleado:</strong>
      <ng-container *ngFor="let u of withoutRecord; let last = last">{{ u.firstName }} {{ u.lastName }}{{ last ? '' : ', ' }}</ng-container>.
      Si reciben salario, regístralos para incluirlos en la nómina.</div>
    <a class="rsv-btn rsv-btn--outline" *ngIf="svc.canCreate" routerLink="/dashboard/payroll/employees/new" [queryParams]="{ usuario: withoutRecord[0].id }">Registrar a {{ withoutRecord[0].firstName }}</a>
  </div>

  <section class="kit-kpis">
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--blue"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg></span>
      <div><span>Empleados activos</span><strong>{{ stats.active }}</strong><small>{{ newcomers ? 'Incluye ' + newcomers + ' por iniciar' : 'Sin ingresos pendientes' }}</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
      <div><span>Nómina base mensual</span><strong>{{ money(stats.monthlyBase) }}</strong><small>Suma de salarios activos</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <div><span>Datos incompletos</span><strong>{{ stats.incomplete.length }}</strong><small>{{ incompleteText || 'Todos completos' }}</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--purple"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
      <div><span>Contratos por vencer</span><strong>{{ stats.expiring.length }}</strong><small>{{ expiringText || 'Ninguno en 60 días' }}</small></div></div>
  </section>

  <section class="kit-card">
    <div class="pay-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t" [class.active]="tab === t" (click)="tab = t; apply()">
        {{ t === 'Activo' ? 'Activos' : t === 'Retirado' ? 'Retirados (exempleados)' : t }} <span>{{ counts[t] }}</span>
      </button>
    </div>
    <div class="pay-filters">
      <div class="kit-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Buscar por nombre, documento o código..." aria-label="Buscar empleado">
      </div>
      <label class="kit-select"><span>Área</span>
        <select [(ngModel)]="area" (ngModelChange)="apply()"><option value="">Todas</option><option *ngFor="let a of areas">{{ a }}</option></select></label>
      <label class="kit-select"><span>Cargo</span>
        <select [(ngModel)]="position" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let p of positions">{{ p }}</option></select></label>
      <label class="kit-select"><span>Tipo de contrato</span>
        <select [(ngModel)]="contract" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let c of contracts">{{ c }}</option></select></label>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Código</th><th>Empleado</th><th>Cargo / área</th><th>Contrato</th><th class="r">Salario</th><th>Ingreso</th><th>Estado</th><th class="r">Acciones</th></tr></thead>
        <tbody>
          <tr *ngFor="let e of filtered" [class.pay-retired]="e.status === 'Retirado'" [class.selected]="e.id === created?.id">
            <td class="kit-mono">{{ e.code }}</td>
            <td><div class="kit-prod"><span class="pay-avatar">{{ ini(e) }}</span><div><strong>{{ name(e) }}</strong><small class="kit-muted">{{ e.docType.split(' ')[0] }} {{ e.docNumber }}</small></div></div></td>
            <td>{{ e.position }}<small class="pay-sub">{{ e.area }}</small></td>
            <td class="kit-muted">{{ contractLabel(e) }}</td>
            <td class="r"><strong>{{ money(salary(e)) }}</strong></td>
            <td>{{ dmy(e.hireDate) }}</td>
            <td>
              <span class="rsv-badge" [ngClass]="badge(e)">{{ status(e) }}</span>
              <span class="rsv-badge rsv-badge--warn pay-badge2" *ngIf="e.status !== 'Retirado' && missing(e).length" [title]="'Falta: ' + missing(e).join(', ')">Datos incompletos</span>
              <small class="pay-sub" *ngIf="account(e) as a; else noAcc">Usuario {{ a.username }} · {{ a.status }}</small>
              <ng-template #noAcc><small class="pay-sub">Sin cuenta en SOGO</small></ng-template>
            </td>
            <td class="r"><a class="rsv-btn rsv-btn--outline pay-row-btn" [routerLink]="['/dashboard/payroll/employees', e.id]">{{ svc.canEdit ? 'Editar' : 'Ver ficha' }}</a></td>
          </tr>
          <tr *ngIf="!filtered.length"><td colspan="8" class="kit-empty">No hay empleados con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  `,
})
export class EmployeesComponent {
  readonly tabs: Tab[] = ['Vigentes', 'Activo', 'Vacaciones', 'Retirado', 'Todos'];
  readonly areas = AREAS;
  readonly contracts = CONTRACT_TYPES;
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly stamp = stampOf;
  readonly name = fullName;
  readonly ini = initials;
  readonly missing = missingData;

  employees: Employee[] = [];
  filtered: Employee[] = [];
  positions: string[] = [];
  counts = {} as Record<Tab, number>;
  tab: Tab = 'Vigentes';
  search = '';
  area = '';
  position = '';
  contract = '';
  created?: Employee;
  flash = '';
  stats!: ReturnType<PayrollService['getStats']>;
  newcomers = 0;
  incompleteText = '';
  expiringText = '';

  constructor(public svc: PayrollService, route: ActivatedRoute) {
    const createdId = route.snapshot.queryParamMap.get('creado') ?? route.snapshot.queryParamMap.get('actualizado');
    this.flash = route.snapshot.queryParamMap.has('actualizado') ? 'updated' : 'created';
    svc.getEmployees().subscribe(list => {
      this.employees = [...list].sort((a, b) => (a.status === 'Retirado' ? 1 : 0) - (b.status === 'Retirado' ? 1 : 0)
        || (b.hireDate > isoDate(0) ? 1 : 0) - (a.hireDate > isoDate(0) ? 1 : 0) || a.code.localeCompare(b.code));
      this.positions = [...new Set(list.map(e => e.position))].sort();
      this.created = createdId ? list.find(e => e.id === createdId) : undefined;
      this.stats = svc.getStats();
      this.newcomers = list.filter(e => e.status !== 'Retirado' && e.hireDate > isoDate(0)).length;
      this.incompleteText = this.stats.incomplete.map(e => `${e.firstName.split(' ')[0]} ${e.lastName.split(' ')[0]} · ${missingData(e).join(', ')}`).join(' · ');
      this.expiringText = this.stats.expiring.map(e => `${e.firstName.split(' ')[0]} ${e.lastName.split(' ')[0]} · ${dmy(e.contractEnd!)}`).join(' · ');
      this.apply();
    });
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    const base = this.employees.filter(e =>
      (!q || [fullName(e), e.docNumber, e.code].some(v => v.toLowerCase().includes(q)))
      && (!this.area || e.area === this.area) && (!this.position || e.position === this.position)
      && (!this.contract || e.contractType === this.contract));
    const inTab = (e: Employee, t: Tab) => t === 'Todos' || (t === 'Vigentes' ? e.status !== 'Retirado' : e.status === t);
    this.tabs.forEach(t => this.counts[t] = base.filter(e => inTab(e, t)).length);
    this.filtered = base.filter(e => inTab(e, this.tab));
  }

  salary(e: Employee): number { return salaryAt(e, e.status === 'Retirado' ? e.retiredAt ?? isoDate(0) : isoDate(0)); }
  status(e: Employee): string { return this.svc.displayStatus(e); }
  account(e: Employee) { return this.svc.accountOf(e); }
  get withoutRecord() { return this.svc.usersWithoutEmployee(); }

  badge(e: Employee): string {
    if (e.status === 'Retirado') return 'rsv-badge--muted';
    if (e.hireDate > isoDate(0)) return 'rsv-badge--info';
    return e.status === 'Vacaciones' ? 'rsv-badge--partial' : 'rsv-badge--ok';
  }

  contractLabel(e: Employee): string {
    if (e.contractType !== 'Término fijo' || !e.contractEnd) return e.contractType;
    const months = monthsBetween(e.hireDate.slice(0, 7), e.contractEnd.slice(0, 7)) + (e.contractEnd.slice(8) >= e.hireDate.slice(8) ? 1 : 0);
    return `Término fijo · hasta ${dmy(e.contractEnd)}${months > 0 && months <= 12 ? ' (' + (months === 12 ? '1 año' : months + ' meses') + ')' : ''}`;
  }
}
