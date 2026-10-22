import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PayrollService, NewEmployee } from '../payroll.service';
import {
  Employee, EmployeeStatus, ContractType, ArlRisk, Area, AREAS, CONTRACT_TYPES, DOC_TYPES, RETIREMENT_REASONS, RetirementReason, PAYMENT_METHODS, NEQUI_RE, nequiFmt,
  EPS_LIST, PENSION_LIST, ARL_LIST, CCF_LIST, fullName, initials, salaryAt, rulesFor, periodLabel, periodEnd, addMonths,
} from '../payroll.model';
import { EMAIL_RE } from '../../billing/invoice.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';
import { dmy, stampOf } from '../payroll-format';
import { UsersService } from '../../users/users.service';
import { AppUser } from '../../users/users.model';

interface Form {
  firstName: string; lastName: string; birthDate: string; docType: string; docNumber: string; email: string; phone: string; address: string;
  position: string; area: Area; hireDate: string; status: EmployeeStatus; retiredAt: string; retirementReason: RetirementReason | '';
  contractType: ContractType; contractEnd: string; weeklyHours: number | null; salary: number | null; salaryFrom: string;
  eps: string; pensionFund: string; arl: string; arlRisk: ArlRisk; ccf: string; bank: string; accountNumber: string;
}
interface Check { label: string; ok: boolean; detail?: string; }
interface Diff { field: string; before: string; after: string; }

const LABELS: Partial<Record<keyof Form, string>> = {
  firstName: 'Nombres', lastName: 'Apellidos', birthDate: 'Fecha de nacimiento', docType: 'Tipo de documento', docNumber: 'Número de documento',
  email: 'Correo', phone: 'Teléfono', address: 'Dirección', position: 'Cargo', area: 'Área', hireDate: 'Fecha de ingreso', status: 'Estado',
  retiredAt: 'Fecha de retiro', retirementReason: 'Motivo del retiro', contractType: 'Tipo de contrato', contractEnd: 'Fin del contrato', weeklyHours: 'Jornada', eps: 'EPS',
  pensionFund: 'Fondo de pensiones', arl: 'ARL', arlRisk: 'Clase de riesgo', ccf: 'Caja de compensación', bank: 'Medio de pago',
  accountNumber: 'Número Nequi',
};

@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/payroll">Nómina</a><span>/</span><a routerLink="/dashboard/payroll/employees">Empleados</a><span>/</span><span>{{ original?.code ?? 'Nuevo' }}</span>
  </nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">{{ original ? 'Actualizar empleado' : 'Registrar empleado' }}</h1>
      <p class="kit-sub">Los campos con * son obligatorios.{{ original ? '' : ' El código del empleado se genera al guardar.' }}</p>
    </div>
    <div class="kit-actions">
      <a routerLink="/dashboard/payroll/employees" class="rsv-btn rsv-btn--outline">{{ (original ? svc.canEdit : svc.canCreate) ? 'Cancelar' : 'Volver' }}</a>
      <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="original ? svc.canEdit : svc.canCreate" [disabled]="(tried && errorCount > 0) || (original && !diffs.length)" (click)="save()">
        {{ original ? 'Guardar cambios' : 'Guardar empleado' }}
      </button>
    </div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="tried && errorCount" role="alert">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><b>No se puede guardar:</b> {{ dupDoc ? 'el número de documento ya pertenece a ' + dupDoc.code + ' · ' + name(dupDoc) + (dupDoc.status === 'Retirado' ? ' (retirado)' : '') + (errorCount > 1 ? ' y ' : '.') : '' }}{{ errorCount - (dupDoc ? 1 : 0) > 0 ? 'falta' + (errorCount - (dupDoc ? 1 : 0) === 1 ? ' 1 campo' : 'n ' + (errorCount - (dupDoc ? 1 : 0)) + ' campos') + ' por corregir.' : '' }}</div>
    <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="dupDoc?.status === 'Retirado' && !original" (click)="reactivate(dupDoc!)">Reactivar {{ dupDoc!.code }}</button>
  </div>

  <div class="kit-card pay-person" *ngIf="original as o" style="margin-bottom: 18px">
    <span class="pay-avatar pay-avatar--lg">{{ ini(o) }}</span>
    <div style="flex:1"><h2>{{ name(o) }}</h2><p>{{ o.code }} · {{ o.docType.split(' ')[0] }} {{ o.docNumber }} · ingreso {{ dmy(o.hireDate) }}</p></div>
    <span class="rsv-badge" [ngClass]="o.status === 'Retirado' ? 'rsv-badge--muted' : 'rsv-badge--ok'">{{ o.status }}</span>
    <span class="rsv-badge rsv-badge--info" *ngIf="diffs.length">{{ diffs.length }} cambio{{ diffs.length === 1 ? '' : 's' }} sin guardar</span>
  </div>

  <div class="kit-layout">
    <div class="kit-stack">
      <section class="kit-card">
        <h2 class="pay-section-title">Datos personales</h2>
        <div class="pay-grid">
          <label class="kit-field">Nombres *<input class="rsv-input" [(ngModel)]="f.firstName" (blur)="touch('firstName')" [class.invalid]="bad('firstName')" [class.ok]="good('firstName')">
            <span class="kit-error" *ngIf="bad('firstName')">{{ errors.firstName }}</span></label>
          <label class="kit-field">Apellidos *<input class="rsv-input" [(ngModel)]="f.lastName" (blur)="touch('lastName')" [class.invalid]="bad('lastName')" [class.ok]="good('lastName')">
            <span class="kit-error" *ngIf="bad('lastName')">{{ errors.lastName }}</span></label>
          <label class="kit-field">Fecha de nacimiento<input class="rsv-input" type="date" [(ngModel)]="f.birthDate" (blur)="touch('birthDate')" [class.invalid]="bad('birthDate')">
            <span class="kit-error" *ngIf="bad('birthDate')">{{ errors.birthDate }}</span></label>
          <label class="kit-field">Tipo de documento *<select class="rsv-input" [(ngModel)]="f.docType"><option *ngFor="let d of docTypes">{{ d }}</option></select></label>
          <label class="kit-field">Número de documento *<input class="rsv-input" inputmode="numeric" [(ngModel)]="f.docNumber" (blur)="touch('docNumber')" [class.invalid]="bad('docNumber')" [class.ok]="good('docNumber')">
            <span class="kit-error" *ngIf="bad('docNumber')">{{ errors.docNumber }}</span>
            <span class="pay-was" *ngIf="was('docNumber')">Antes: {{ original!.docNumber }}</span></label>
          <label class="kit-field">Correo electrónico *<input class="rsv-input" type="email" [(ngModel)]="f.email" (blur)="touch('email')" [class.invalid]="bad('email')" [class.ok]="good('email')">
            <span class="kit-error" *ngIf="bad('email')">{{ errors.email }}</span>
            <span class="pay-hint" *ngIf="good('email')">Verificado: no está registrado</span></label>
          <label class="kit-field">Teléfono *<input class="rsv-input" type="tel" [(ngModel)]="f.phone" (blur)="touch('phone')" [class.invalid]="bad('phone')" [class.ok]="good('phone')">
            <span class="kit-error" *ngIf="bad('phone')">{{ errors.phone }}</span>
            <span class="pay-was" *ngIf="was('phone')">Antes: {{ original!.phone }}</span></label>
          <label class="kit-field wide">Dirección *<input class="rsv-input" [(ngModel)]="f.address" placeholder="Ej. Calle 6 # 5-20, Filandia" (blur)="touch('address')" [class.invalid]="bad('address')" [class.ok]="good('address')">
            <span class="kit-error" *ngIf="bad('address')">{{ errors.address }}</span>
            <span class="pay-was" *ngIf="was('address')">Antes: {{ original!.address || '—' }}</span></label>
        </div>
      </section>

      <section class="kit-card">
        <h2 class="pay-section-title">Información laboral y contractual</h2>
        <div class="pay-grid">
          <label class="kit-field">Cargo *
            <input class="rsv-input" list="positions" [(ngModel)]="f.position" (blur)="touch('position')" [class.invalid]="bad('position')" [class.ok]="good('position')">
            <datalist id="positions"><option *ngFor="let p of positions" [value]="p"></option></datalist>
            <span class="kit-error" *ngIf="bad('position')">{{ errors.position }}</span>
            <span class="pay-was" *ngIf="was('position')">Antes: {{ original!.position }}</span></label>
          <label class="kit-field">Área de trabajo<select class="rsv-input" [(ngModel)]="f.area"><option *ngFor="let a of areas">{{ a }}</option></select></label>
          <label class="kit-field">Fecha de ingreso *<input class="rsv-input" type="date" [(ngModel)]="f.hireDate" (blur)="touch('hireDate')" [class.invalid]="bad('hireDate')" [class.ok]="good('hireDate')">
            <span class="kit-error" *ngIf="bad('hireDate')">{{ errors.hireDate }}</span></label>
          <label class="kit-field">Estado<select class="rsv-input" [(ngModel)]="f.status"><option>Activo</option><option>Vacaciones</option><option>Retirado</option></select></label>
          <label class="kit-field" *ngIf="f.status === 'Retirado'">Fecha de retiro *<input class="rsv-input" type="date" [(ngModel)]="f.retiredAt" (blur)="touch('retiredAt')" [class.invalid]="bad('retiredAt')">
            <span class="kit-error" *ngIf="bad('retiredAt')">{{ errors.retiredAt }}</span></label>
          <label class="kit-field" *ngIf="f.status === 'Retirado'">Motivo del retiro *<select class="rsv-input" [(ngModel)]="f.retirementReason" (blur)="touch('retirementReason')" [class.invalid]="bad('retirementReason')">
            <option value="">Selecciona…</option><option *ngFor="let r of retirementReasons">{{ r }}</option></select>
            <span class="kit-error" *ngIf="bad('retirementReason')">{{ errors.retirementReason }}</span>
            <small class="kit-muted" style="display: block; margin-top: 4px">Al guardar, su cuenta de usuario en SOGO (si tiene) se desactiva.</small></label>
          <label class="kit-field">Tipo de contrato<select class="rsv-input" [(ngModel)]="f.contractType"><option *ngFor="let c of contracts">{{ c }}</option></select></label>
          <label class="kit-field" *ngIf="f.contractType !== 'Término indefinido'">Fin del contrato *
            <input class="rsv-input" type="date" [(ngModel)]="f.contractEnd" [min]="f.hireDate" (blur)="touch('contractEnd')" [class.invalid]="bad('contractEnd')">
            <span class="kit-error" *ngIf="bad('contractEnd')">{{ errors.contractEnd }}</span>
            <span class="pay-hint" *ngIf="!errors.contractEnd && f.contractEnd">{{ durationText }}</span></label>
          <label class="kit-field">Jornada laboral
            <select class="rsv-input" [(ngModel)]="f.weeklyHours">
              <option [ngValue]="null">Tiempo completo · {{ legal.weeklyHours }} h/sem</option>
              <option [ngValue]="24">Medio tiempo · 24 h/sem</option>
            </select></label>
          <label class="kit-field">Salario mensual (COP) *
            <input class="rsv-input" type="number" step="1000" [(ngModel)]="f.salary" (blur)="touch('salary')" [class.invalid]="bad('salary')" [class.ok]="good('salary')">
            <span class="kit-error" *ngIf="bad('salary')">{{ errors.salary }}</span>
            <span class="pay-hint" *ngIf="!bad('salary')">{{ salaryHint }}</span>
            <span class="pay-was" *ngIf="salaryChanged">Antes: {{ money(currentSalary) }}</span></label>
          <label class="kit-field" *ngIf="salaryChanged">Nuevo salario aplica desde *
            <input class="rsv-input" type="date" [(ngModel)]="f.salaryFrom" (blur)="touch('salaryFrom')" [class.invalid]="bad('salaryFrom')">
            <span class="kit-error" *ngIf="bad('salaryFrom')">{{ errors.salaryFrom }}</span></label>
        </div>

        <h2 class="pay-section-title" style="margin-top: 8px">Seguridad social</h2>
        <div class="pay-grid">
          <label class="kit-field">EPS<select class="rsv-input" [(ngModel)]="f.eps"><option value="">Sin registrar</option><option *ngFor="let x of eps">{{ x }}</option></select></label>
          <label class="kit-field">Fondo de pensiones<select class="rsv-input" [(ngModel)]="f.pensionFund" [class.invalid]="!f.pensionFund && original"><option value="">Sin registrar</option><option *ngFor="let x of pensions">{{ x }}</option></select></label>
          <label class="kit-field">ARL<select class="rsv-input" [(ngModel)]="f.arl"><option value="">Sin registrar</option><option *ngFor="let x of arls">{{ x }}</option></select></label>
          <label class="kit-field">Clase de riesgo<select class="rsv-input" [(ngModel)]="f.arlRisk"><option *ngFor="let r of risks" [value]="r">Riesgo {{ r }}</option></select></label>
          <label class="kit-field">Caja de compensación<select class="rsv-input" [(ngModel)]="f.ccf"><option value="">Sin registrar</option><option *ngFor="let x of ccfs">{{ x }}</option></select></label>
        </div>

        <h2 class="pay-section-title" style="margin-top: 8px">Pago de la nómina</h2>
        <div class="pay-grid">
          <label class="kit-field">Medio de pago<select class="rsv-input" [(ngModel)]="f.bank"><option *ngFor="let m of payMethods">{{ m }}</option></select>
            <small class="kit-muted" style="display: block; margin-top: 4px">Por ahora la nómina se paga solo por Nequi.</small></label>
          <label class="kit-field">Número Nequi (celular) *
            <input class="rsv-input" inputmode="numeric" maxlength="12" placeholder="3001234567" [(ngModel)]="f.accountNumber" (blur)="touch('accountNumber')" [class.invalid]="bad('accountNumber')" [class.ok]="good('accountNumber')">
            <span class="kit-error" *ngIf="bad('accountNumber')">{{ errors.accountNumber }}</span>
            <button type="button" class="pay-link" *ngIf="phoneAsNequi && f.accountNumber !== phoneAsNequi" (click)="f.accountNumber = phoneAsNequi; touch('accountNumber')">Usar su celular {{ nequi(phoneAsNequi) }}</button></label>
        </div>
        <p class="pay-hint" *ngIf="missingSS.length">Sin {{ missingSS.join(', ') }} el empleado queda con «Datos incompletos» y su aporte no se podrá reportar en la planilla.</p>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card" *ngIf="!original">
        <h2 class="kit-card-title">Validación</h2>
        <p class="pay-check" *ngFor="let c of checks" [class.ok]="c.ok" [class.bad]="!c.ok">
          <svg *ngIf="c.ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
          <svg *ngIf="!c.ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ c.label }}<small *ngIf="!c.ok && c.detail">{{ c.detail }}</small></span>
        </p>
      </section>
      <section class="kit-card" *ngIf="!original">
        <h2 class="kit-card-title">Código asignado</h2>
        <div class="pay-code">{{ nextCode }}</div>
        <p class="pay-hint">Se confirma al guardar. Quedará registrado quién y cuándo creó el empleado.</p>
      </section>
      <section class="kit-card" *ngIf="original as o">
        <h2 class="kit-card-title">Cuenta de usuario en SOGO</h2>
        <ng-container *ngIf="account as a; else noAccount">
          <p class="pay-acc"><strong>{{ a.username }}</strong>
            <span class="rsv-badge" [ngClass]="a.status === 'Activo' ? 'rsv-badge--ok' : a.status === 'Inactivo' ? 'rsv-badge--muted' : 'rsv-badge--warn'">{{ a.status }}</span></p>
          <p class="pay-hint">{{ a.email }} · {{ roleNames(a) }}</p>
          <p class="pay-hint pay-warn" *ngIf="o.status === 'Retirado' && a.status !== 'Inactivo'">El empleado está retirado pero su cuenta sigue {{ a.status.toLowerCase() }}: desactívala en Usuarios.</p>
          <p class="pay-hint" *ngIf="o.status !== 'Retirado' && a.status === 'Inactivo'">La cuenta quedó inactiva (retiro anterior). Si debe volver a ingresar, reactívala en Usuarios.</p>
          <a class="rsv-btn rsv-btn--outline pay-acc-btn" *ngIf="canSeeUsers" [routerLink]="['/dashboard/users', a.id]">Ver cuenta</a>
        </ng-container>
        <ng-template #noAccount>
          <p class="pay-hint">No tiene cuenta para ingresar a SOGO. No todos los empleados la necesitan; créala solo si va a usar el sistema.</p>
          <a class="rsv-btn rsv-btn--outline pay-acc-btn" *ngIf="canCreateUsers && o.status !== 'Retirado'" routerLink="/dashboard/users/new" [queryParams]="{ empleado: o.id }">Crear cuenta de usuario</a>
        </ng-template>
      </section>
      <section class="kit-card" *ngIf="original as o">
        <h2 class="kit-card-title">Historial de modificaciones</h2>
        <ul class="pay-timeline">
          <li *ngFor="let h of o.history.slice(0, 8)"><strong>{{ h.text }}</strong><span>{{ stamp(h.at) }} · {{ h.by }}</span></li>
        </ul>
      </section>
      <p class="kit-banner kit-banner--info pay-footnote">
        <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <span>Datos personales protegidos: acceso por rol y registro de auditoría (Ley 1581 de 2012).</span>
      </p>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="confirming" (click)="confirming = false">
    <div class="rsv-modal pay-modal" role="dialog" aria-modal="true" aria-labelledby="diff-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="diff-title">Confirma los cambios de {{ name(original!) }}</h2>
      <p class="rsv-modal-desc">Revisa el resumen antes de guardar. Se conservará el valor anterior en el historial.</p>
      <div class="kit-table-wrap">
        <table class="kit-table pay-diff">
          <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead>
          <tbody><tr *ngFor="let d of diffs"><td><strong>{{ d.field }}</strong></td><td><s>{{ d.before || '—' }}</s></td><td><b>{{ d.after || '—' }}</b></td></tr></tbody>
        </table>
      </div>
      <p class="kit-banner kit-banner--info pay-footnote" *ngIf="salaryChanged">{{ salaryNote }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirming = false">Seguir editando</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="commit()">Confirmar y guardar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .pay-modal { max-width: 560px; }
    .pay-modal .rsv-modal-title, .pay-modal .rsv-modal-desc { text-align: left; }
    .pay-modal .kit-banner { margin: 14px 0 0; }
    .pay-masked { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; border: 1px solid #D5DEEA; border-radius: 8px; font-size: 13.5px; font-weight: 400; }
    .pay-acc { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 4px; color: #0A2540; }
    .pay-warn { color: #B45309; }
    .pay-acc-btn { width: 100%; margin-top: 10px; height: 38px; }
    .pay-link { display: block; margin-top: 4px; border: none; background: none; padding: 0; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; }
    .pay-masked button { border: none; background: none; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  `],
})
export class EmployeeFormComponent {
  readonly areas = AREAS;
  readonly contracts = CONTRACT_TYPES;
  readonly retirementReasons = RETIREMENT_REASONS;
  readonly payMethods = PAYMENT_METHODS;
  readonly nequi = nequiFmt;
  readonly docTypes = DOC_TYPES;
  readonly eps = EPS_LIST;
  readonly pensions = PENSION_LIST;
  readonly arls = ARL_LIST;
  readonly ccfs = CCF_LIST;
  readonly risks: ArlRisk[] = ['I', 'II', 'III', 'IV', 'V'];
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly stamp = stampOf;
  readonly name = fullName;
  readonly ini = initials;
  readonly legal = rulesFor(isoDate(0));

  original?: Employee;
  f!: Form;
  private initial!: Form;
  touched: Partial<Record<keyof Form, boolean>> = {};
  tried = false;
  confirming = false;

  constructor(public svc: PayrollService, private users: UsersService, route: ActivatedRoute, private router: Router) {
    const id = route.snapshot.paramMap.get('id');
    this.original = id ? svc.getEmployee(id) : undefined;
    if (id && !this.original) { router.navigate(['/dashboard/payroll/employees']); return; }
    this.f = this.original ? this.fromEmployee(this.original) : this.blank();
    // "Registrar como empleado" desde una cuenta de Usuarios: mismos datos (se vinculan por el documento)
    const fromUser = !this.original ? users.usersSnapshot().find(u => u.id === route.snapshot.queryParamMap.get('usuario')) : undefined;
    if (fromUser) {
      const doc = DOC_TYPES.find(t => t.startsWith(fromUser.docType + ' ')) ?? DOC_TYPES[0];
      Object.assign(this.f, { firstName: fromUser.firstName, lastName: fromUser.lastName, docType: doc, docNumber: fromUser.docNumber,
        email: fromUser.email, phone: fromUser.phone, position: fromUser.position });
      if (this.phoneAsNequi) this.f.accountNumber = this.phoneAsNequi;
    }
    this.initial = { ...this.f };
    // "Corregir datos del empleado" desde la liquidación marca el campo pendiente
    if (route.snapshot.queryParamMap.get('corregir')) this.tried = true;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.confirming = false; }

  get nextCode(): string { return this.svc.nextCode(); }
  get positions(): string[] { return this.svc.positions(); }
  /** El celular del empleado, si sirve como número Nequi. */
  get phoneAsNequi(): string { const d = this.f.phone.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, ''); return NEQUI_RE.test(d) ? d : ''; }
  get account() { return this.original ? this.svc.accountOf(this.original) : undefined; }
  get canSeeUsers(): boolean { return this.users.can('Usuarios', 'view'); }
  get canCreateUsers(): boolean { return this.users.can('Usuarios', 'create'); }
  roleNames(a: AppUser): string { return a.roles.map(r => this.users.role(r)?.name ?? r).join(', ') || 'sin rol'; }
  get currentSalary(): number { return this.original ? salaryAt(this.original, isoDate(0)) : 0; }
  get salaryChanged(): boolean { return !!this.original && +(this.f.salary ?? 0) !== this.currentSalary; }
  get dupDoc(): Employee | undefined { return this.svc.findByDoc(this.f.docNumber, this.original?.id); }
  get missingSS(): string[] {
    return [!this.f.eps && 'EPS', !this.f.pensionFund && 'fondo de pensiones', !this.f.arl && 'ARL', !this.f.ccf && 'caja de compensación',
      !NEQUI_RE.test(this.f.accountNumber) && 'número Nequi'].filter(Boolean) as string[];
  }

  get salaryHint(): string {
    const s = +(this.f.salary ?? 0);
    const r = rulesFor(this.f.hireDate || isoDate(0));
    if (!s) return `SMMLV ${r.smmlv ? fmtMoney(r.smmlv) : ''}`;
    return s <= 2 * r.smmlv ? `${s === r.smmlv ? 'SMMLV ' + this.f.hireDate.slice(0, 4) + ' · ' : ''}con auxilio de transporte` : 'Sin auxilio de transporte (más de 2 SMMLV)';
  }

  get durationText(): string {
    if (!this.f.hireDate || !this.f.contractEnd) return '';
    const days = Math.round((Date.parse(this.f.contractEnd) - Date.parse(this.f.hireDate)) / 86400000) + 1;
    const months = Math.round(days / 30.4);
    return `${months >= 1 ? months + (months === 1 ? ' mes' : ' meses') : days + ' días'} · hasta ${dmy(this.f.contractEnd)}`;
  }

  get salaryNote(): string {
    const from = this.f.salaryFrom;
    const period = isoDate(0).slice(0, 7);
    return from > periodEnd(period)
      ? `La nómina de ${periodLabel(period).toLowerCase()} se liquida con el salario anterior. El nuevo salario aplica desde ${dmy(from)} en Nómina, Reportes y Contabilidad.`
      : `El nuevo salario aplica desde ${dmy(from)}: la nómina de ${periodLabel(period).toLowerCase()} en borrador se recalcula con él.`;
  }

  get errors(): Partial<Record<keyof Form, string>> {
    const f = this.f, e: Partial<Record<keyof Form, string>> = {};
    const r = rulesFor(f.hireDate || isoDate(0));
    if (f.firstName.trim().length < 2) e.firstName = 'Campo obligatorio';
    if (f.lastName.trim().length < 2) e.lastName = 'Campo obligatorio';
    if (f.birthDate) {
      const age = (Date.parse(isoDate(0)) - Date.parse(f.birthDate)) / (365.25 * 86400000);
      if (age < 15 || age > 90) e.birthDate = age < 15 ? 'Debe tener al menos 15 años' : 'Fecha no válida';
    }
    const digits = f.docNumber.replace(/\D/g, '');
    const dup = this.dupDoc;
    if (!digits) e.docNumber = 'Campo obligatorio';
    else if (digits.length < 5 || digits.length > 11) e.docNumber = 'Entre 5 y 11 dígitos';
    else if (dup) e.docNumber = `Ya registrado para ${dup.code} (${fullName(dup)})`;
    if (!f.email.trim()) e.email = 'Campo obligatorio';
    else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Correo no válido';
    else if (this.svc.findByEmail(f.email, this.original?.id)) e.email = `Ya registrado para ${this.svc.findByEmail(f.email, this.original?.id)!.code}`;
    if (f.phone.replace(/\D/g, '').length < 7) e.phone = f.phone.trim() ? 'Teléfono no válido' : 'Campo obligatorio';
    if (!f.address.trim()) e.address = 'Campo obligatorio';
    if (!f.position.trim()) e.position = 'Campo obligatorio';
    if (!f.hireDate) e.hireDate = 'Campo obligatorio';
    if (f.status === 'Retirado' && (!f.retiredAt || f.retiredAt < f.hireDate)) e.retiredAt = !f.retiredAt ? 'Campo obligatorio' : 'No puede ser anterior al ingreso';
    if (f.status === 'Retirado' && !f.retirementReason) e.retirementReason = 'Indica por qué se retiró';
    if (f.contractType !== 'Término indefinido' && (!f.contractEnd || f.contractEnd <= f.hireDate)) e.contractEnd = !f.contractEnd ? 'Campo obligatorio' : 'Debe ser posterior al ingreso';
    const s = +(f.salary ?? 0);
    const min = f.weeklyHours === null ? r.smmlv : Math.round(r.smmlv * f.weeklyHours / r.weeklyHours);
    if (!s) e.salary = 'Campo obligatorio';
    else if (s < min) e.salary = `No puede ser menor que ${fmtMoney(min)}${f.weeklyHours === null ? ' (SMMLV)' : ' (SMMLV proporcional)'}`;
    if (this.salaryChanged && (!f.salaryFrom || f.salaryFrom < f.hireDate)) e.salaryFrom = 'Indica desde cuándo aplica';
    if (f.accountNumber && !NEQUI_RE.test(f.accountNumber.replace(/\D/g, ''))) e.accountNumber = 'Celular de 10 dígitos que empieza por 3';
    return e;
  }

  get errorCount(): number { return Object.keys(this.errors).length; }

  get checks(): Check[] {
    const e = this.errors;
    return [
      { label: 'Nombres y apellidos', ok: !e.firstName && !e.lastName, detail: 'Incompletos' },
      { label: 'Documento único', ok: !e.docNumber, detail: this.dupDoc ? `Duplicado con ${this.dupDoc.code}` : e.docNumber },
      { label: 'Correo único y válido', ok: !e.email, detail: e.email },
      { label: 'Teléfono', ok: !e.phone, detail: e.phone },
      { label: 'Dirección', ok: !e.address, detail: 'Vacía' },
      { label: 'Cargo y fecha de ingreso', ok: !e.position && !e.hireDate, detail: 'Incompletos' },
      { label: 'Salario y contrato', ok: !e.salary && !e.contractEnd, detail: e.salary ?? e.contractEnd },
    ];
  }

  get diffs(): Diff[] {
    if (!this.original) return [];
    const out: Diff[] = [];
    (Object.keys(LABELS) as (keyof Form)[]).forEach(k => {
      if (String(this.f[k] ?? '') === String(this.initial[k] ?? '')) return;
      const show = (v: unknown) => k === 'accountNumber' ? nequiFmt(String(v ?? ''))
        : k === 'weeklyHours' ? (v === null ? 'Tiempo completo' : `${v} h/sem`)
        : /Date|At|End/.test(k) && v ? dmy(String(v)) : String(v ?? '');
      out.push({ field: LABELS[k]!, before: show(this.initial[k]), after: show(this.f[k]) });
    });
    if (this.salaryChanged) out.push({ field: 'Salario', before: fmtMoney(this.currentSalary), after: `${fmtMoney(+this.f.salary!)} · desde ${dmy(this.f.salaryFrom)}` });
    return out;
  }

  touch(k: keyof Form): void { this.touched[k] = true; }
  bad(k: keyof Form): boolean { return !!this.errors[k] && (this.tried || !!this.touched[k]); }
  good(k: keyof Form): boolean { return !this.errors[k] && !!this.touched[k]; }
  was(k: keyof Form): boolean { return !!this.original && this.f[k] !== this.initial[k]; }

  save(): void {
    this.tried = true;
    if (this.errorCount) return;
    if (this.original) { this.confirming = true; return; }
    const created = this.svc.createEmployee(this.toData());
    this.router.navigate(['/dashboard/payroll/employees'], { queryParams: { creado: created.id } });
  }

  commit(): void {
    const o = this.original!;
    // El salario no se reemplaza: se agrega una vigencia nueva (updateEmployee)
    const data: Partial<NewEmployee> = this.toData();
    delete data.salaries;
    const summary = this.diffs.map(d => d.field === 'Salario' ? `Salario ${d.before} → ${d.after}` : `${d.field}: ${d.before || '—'} → ${d.after || '—'}`);
    this.svc.updateEmployee(o.id, data, this.salaryChanged ? { amount: +this.f.salary!, from: this.f.salaryFrom } : null, summary);
    this.confirming = false;
    this.router.navigate(['/dashboard/payroll/employees'], { queryParams: { actualizado: o.id } });
  }

  reactivate(e: Employee): void {
    this.svc.reactivate(e.id, this.f.hireDate || isoDate(0));
    this.router.navigate(['/dashboard/payroll/employees', e.id]);
  }

  private toData(): NewEmployee {
    const f = this.f;
    return {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), birthDate: f.birthDate, docType: f.docType, docNumber: f.docNumber.replace(/\D/g, ''),
      email: f.email.trim().toLowerCase(), phone: f.phone.trim(), address: f.address.trim(), position: f.position.trim(), area: f.area,
      hireDate: f.hireDate, status: f.status, retiredAt: f.status === 'Retirado' ? f.retiredAt : undefined,
      retirementReason: f.status === 'Retirado' && f.retirementReason ? f.retirementReason : undefined,
      contractType: f.contractType, contractEnd: f.contractType === 'Término indefinido' ? undefined : f.contractEnd,
      weeklyHours: f.weeklyHours, salaries: [{ from: f.hireDate, amount: +f.salary! }],
      eps: f.eps, pensionFund: f.pensionFund, arl: f.arl, arlRisk: f.arlRisk, ccf: f.ccf, bank: f.bank || 'Nequi', accountType: 'Nequi', accountNumber: f.accountNumber.replace(/\D/g, ''),
    };
  }

  private blank(): Form {
    const firstNext = `${addMonths(isoDate(0).slice(0, 7), 1)}-01`;
    return {
      firstName: '', lastName: '', birthDate: '', docType: DOC_TYPES[0], docNumber: '', email: '', phone: '+57 ', address: '',
      position: '', area: 'Recepción', hireDate: firstNext, status: 'Activo', retiredAt: '', retirementReason: '', contractType: 'Término fijo', contractEnd: '',
      weeklyHours: null, salary: this.legal.smmlv, salaryFrom: firstNext,
      eps: '', pensionFund: '', arl: '', arlRisk: 'I', ccf: '', bank: 'Nequi', accountNumber: '',
    };
  }

  private fromEmployee(e: Employee): Form {
    // Un cambio de salario aplica por defecto desde el próximo período
    const firstNext = `${addMonths(isoDate(0).slice(0, 7), 1)}-01`;
    return {
      firstName: e.firstName, lastName: e.lastName, birthDate: e.birthDate, docType: e.docType, docNumber: e.docNumber, email: e.email,
      phone: e.phone, address: e.address, position: e.position, area: e.area, hireDate: e.hireDate, status: e.status, retiredAt: e.retiredAt ?? '', retirementReason: e.retirementReason ?? '',
      contractType: e.contractType, contractEnd: e.contractEnd ?? '', weeklyHours: e.weeklyHours, salary: salaryAt(e, isoDate(0)), salaryFrom: firstNext,
      eps: e.eps, pensionFund: e.pensionFund, arl: e.arl, arlRisk: e.arlRisk, ccf: e.ccf, bank: 'Nequi', accountNumber: e.accountNumber ?? '',
    };
  }
}
