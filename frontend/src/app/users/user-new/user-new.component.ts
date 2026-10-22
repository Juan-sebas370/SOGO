import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { AppUser, Role, Module, MODULES, ACTIONS, ACTION_LABEL, passwordRules, passwordStrength, fullName, initials, docLabel } from '../users.model';
import { avatarColor } from '../users-ui';
import { PayrollService } from '../../payroll/payroll.service';
import { Employee } from '../../payroll/payroll.model';
import { EMAIL_RE } from '../../billing/invoice.model';

const DOC_TYPES = [{ code: 'CC', label: 'Cédula de ciudadanía' }, { code: 'CE', label: 'Cédula de extranjería' }, { code: 'PA', label: 'Pasaporte' }, { code: 'PPT', label: 'Permiso por protección temporal' }];

@Component({
  selector: 'app-user-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Nuevo usuario</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar usuario</h1>
      <p class="kit-sub">Solo los administradores pueden crear cuentas. Los campos con * son obligatorios.</p>
    </div>
    <div class="kit-actions">
      <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/users">Cancelar</a>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!!errors.length || !canCreate" (click)="save()">Registrar usuario</button>
    </div>
  </header>
  <p class="kit-banner kit-banner--danger" *ngIf="!canCreate">Tu rol no puede crear cuentas de usuario.</p>

  <div class="kit-layout">
    <div>
      <section class="kit-card ur-section">
        <h2 class="kit-card-title">1. Datos personales</h2>
        <div class="ur-grid-2">
          <label class="ur-field">Nombres *<input class="rsv-input" [(ngModel)]="f.firstName" (ngModelChange)="suggest()" maxlength="60" [class.invalid]="touched && !f.firstName.trim()"></label>
          <label class="ur-field">Apellidos *<input class="rsv-input" [(ngModel)]="f.lastName" (ngModelChange)="suggest()" maxlength="60" [class.invalid]="touched && !f.lastName.trim()"></label>
        </div>
        <div class="ur-grid-3 un-mt">
          <label class="ur-field">Tipo de documento *<select class="rsv-input" [(ngModel)]="f.docType"><option *ngFor="let d of docTypes" [value]="d.code">{{ d.label }}</option></select></label>
          <label class="ur-field">Número de documento *<input class="rsv-input" [(ngModel)]="f.docNumber" (ngModelChange)="onDoc()" inputmode="numeric" maxlength="15" [class.invalid]="!!docError">
            <small class="err" *ngIf="docError">{{ docError }}</small>
            <small class="ok" *ngIf="employee && !docError">Empleado {{ employee.code }} de Nómina · se vinculan</small></label>
          <label class="ur-field">Teléfono<input class="rsv-input" [(ngModel)]="f.phone" inputmode="tel" maxlength="20"></label>
        </div>
        <div class="ur-grid-2 un-mt">
          <label class="ur-field">Correo electrónico *<input class="rsv-input" type="email" [(ngModel)]="f.email" [class.invalid]="!!emailError" [class.valid]="!emailError && !!f.email.trim()">
            <small class="err" *ngIf="emailError">{{ emailError }}</small></label>
          <label class="ur-field">Cargo<select class="rsv-input" [(ngModel)]="f.position"><option value="">Sin cargo</option><option *ngFor="let p of positions">{{ p }}</option></select>
            <small>Si el cargo existe en Nómina, se vincula con el empleado.</small></label>
        </div>
      </section>

      <section class="kit-card ur-section">
        <h2 class="kit-card-title">2. Credenciales de acceso</h2>
        <div class="ur-grid-2">
          <label class="ur-field">Nombre de usuario *<input class="rsv-input ur-mono" [(ngModel)]="f.username" (ngModelChange)="userEdited = true" maxlength="30" autocomplete="off"
                 [class.invalid]="!!usernameError" [class.valid]="!usernameError && !!f.username">
            <small class="err" *ngIf="usernameError">{{ usernameError }}</small><small class="ok" *ngIf="!usernameError && f.username">Disponible</small></label>
          <label class="ur-field">Contraseña *
            <span class="un-pw"><input class="rsv-input" [type]="show ? 'text' : 'password'" [(ngModel)]="f.password" autocomplete="new-password" maxlength="64">
              <button type="button" (click)="show = !show">{{ show ? 'Ocultar' : 'Mostrar' }}</button></span>
            <span class="ur-strength" aria-hidden="true"><i *ngFor="let n of [1,2,3,4]" [class.on]="strength.score >= n" [class.weak]="strength.score === 1" [class.mid]="strength.score === 2"></i></span>
            <small *ngIf="strength.label">Seguridad: <strong>{{ strength.label }}</strong></small></label>
        </div>
        <div class="ur-rules">
          <span class="ur-rule" *ngFor="let r of rules" [class.ok]="r.ok"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path *ngIf="r.ok" d="M8 12.5l2.5 2.5L16 9.5"/></svg>{{ r.label }}</span>
        </div>
        <div class="ur-grid-2">
          <label class="ur-field">Confirmar contraseña *<input class="rsv-input" [type]="show ? 'text' : 'password'" [(ngModel)]="f.confirm" autocomplete="new-password" [class.invalid]="!!f.confirm && f.confirm !== f.password">
            <small class="err" *ngIf="f.confirm && f.confirm !== f.password">Las contraseñas no coinciden.</small></label>
          <label class="un-toggle"><span class="kit-toggle"><input type="checkbox" [(ngModel)]="f.mustChange"><i></i></span> Exigir cambio de contraseña en el primer inicio de sesión</label>
        </div>
      </section>

      <section class="kit-card ur-section">
        <div class="un-row"><h2 class="kit-card-title">3. Roles *</h2><span class="rp-muted">Puedes asignar uno o varios · {{ f.roles.length }} seleccionado{{ f.roles.length === 1 ? '' : 's' }}</span></div>
        <div class="un-roles">
          <label class="un-role" *ngFor="let r of roles" [class.active]="f.roles.includes(r.id)">
            <input type="checkbox" [checked]="f.roles.includes(r.id)" (change)="toggleRole(r.id)">
            <span><span class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span><small>{{ r.description }}</small></span>
          </label>
        </div>
        <p class="kit-error" *ngIf="touched && !f.roles.length">Asigna al menos un rol.</p>
      </section>

      <section class="kit-card ur-section">
        <h2 class="kit-card-title">4. Estado inicial de la cuenta</h2>
        <div class="ur-grid-2">
          <label class="ur-choice" [class.active]="f.status === 'Activo'"><input type="radio" name="st" value="Activo" [(ngModel)]="f.status">
            <span><strong>Activa</strong><small>Puede iniciar sesión de inmediato.</small></span></label>
          <label class="ur-choice" [class.active]="f.status === 'Pendiente'"><input type="radio" name="st" value="Pendiente" [(ngModel)]="f.status">
            <span><strong>Pendiente de activación</strong><small>Se activa cuando la persona confirme su correo (enlace válido {{ svc.policy.activationHours }} h). Definido en Configuración.</small></span></label>
        </div>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card">
        <h2 class="kit-card-title">Resumen</h2>
        <div class="ur-user"><span class="ur-avatar ur-avatar--lg" [style.background]="avatar">{{ ini }}</span>
          <div><strong class="un-name">{{ name || 'Nuevo usuario' }}</strong><small class="rp-muted">{{ f.username || 'usuario' }} · {{ f.docType }} {{ docFmt }}</small></div></div>
        <div class="ur-roles un-mt"><span *ngFor="let r of selectedRoles" class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span></div>
        <div class="ur-kv un-mt"><span>Estado inicial</span><strong [class.un-pend]="f.status === 'Pendiente'">{{ f.status === 'Pendiente' ? 'Pendiente de activación' : 'Activa' }}</strong></div>
        <p class="un-sub">Módulos a los que tendrá acceso</p>
        <div class="un-mod" *ngFor="let m of access"><strong>{{ m.module }}</strong><span>{{ m.text }}</span></div>
        <p class="rp-muted" *ngIf="!access.length">Elige un rol para ver los accesos.</p>
      </section>
      <section class="kit-card ur-note ur-lock">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <span>La contraseña se guarda cifrada (hash) y nunca se muestra en texto plano. El registro guarda fecha, hora y administrador responsable para auditoría.</span>
      </section>
      <section class="kit-card" *ngIf="created">
        <p class="un-sub">Mensaje al guardar</p>
        <p class="kit-banner kit-banner--ok un-done"><span><strong>Usuario registrado correctamente.</strong>
          {{ created.status === 'Pendiente' ? 'Se envió el enlace de activación a ' + created.email + '.' : 'Ya puede iniciar sesión.' }}</span></p>
        <div class="un-row"><a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/users', created.id]">Ver usuario</a><button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Registrar otro</button></div>
      </section>
      <p class="kit-error" *ngIf="touched && errors.length">{{ errors[0] }}</p>
    </aside>
  </div>
  `,
  styles: [`
    .un-mt { margin-top: 12px; }
    .un-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .un-pw { position: relative; display: block; }
    .un-pw input { width: 100%; padding-right: 76px; box-sizing: border-box; }
    .un-pw button { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: none; background: none; font: inherit; font-size: 12px; color: #6B7280; cursor: pointer; }
    .un-toggle { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #1F2937; padding-top: 18px; }
    .un-roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .un-role { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #D5DEEA; border-radius: 12px; padding: 12px; cursor: pointer; }
    .un-role input { margin-top: 3px; accent-color: #1565C0; width: 16px; height: 16px; }
    .un-role small { display: block; font-size: 11.5px; color: #6B7280; margin-top: 5px; line-height: 1.4; }
    .un-role.active { border: 2px solid #1565C0; background: #F2F7FD; padding: 11px; }
    .un-name { font-size: 15px !important; }
    .un-pend { color: #B45309 !important; }
    .un-sub { margin: 14px 0 8px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .un-mod { display: flex; justify-content: space-between; gap: 10px; background: #F6F8FB; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; font-size: 12px; }
    .un-mod strong { color: #0A2540; }
    .un-mod span { color: #6B7280; text-align: right; }
    .un-done { margin: 0 0 10px; }
  `],
})
export class UserNewComponent {
  readonly docTypes = DOC_TYPES;
  f = this.blank();
  roles: Role[] = [];
  positions: string[] = [];
  employee: Employee | undefined;
  userEdited = false;
  show = false;
  touched = false;
  created: AppUser | null = null;

  constructor(public svc: UsersService, private payroll: PayrollService, private router: Router, route: ActivatedRoute) {
    svc.getRoles().subscribe(r => this.roles = r);
    const fromPayroll = payroll.employeesSnapshot().filter(e => e.status !== 'Retirado').map(e => e.position);
    this.positions = [...new Set([...fromPayroll, 'Administrador', 'Contadora (externa)', 'Recepcionista'])].sort();
    // "Crear cuenta de usuario" desde la ficha del empleado (Nómina): se proponen sus datos y se vinculan
    const emp = payroll.getEmployee(route.snapshot.queryParamMap.get('empleado') ?? '');
    if (emp && emp.status !== 'Retirado') {
      const docType = emp.docType.split(' ')[0];
      if (DOC_TYPES.some(d => d.code === docType)) this.f.docType = docType;
      this.f.docNumber = emp.docNumber;
      this.f.email = emp.email;
      this.onDoc();
    }
  }

  private blank() {
    return { firstName: '', lastName: '', docType: 'CC', docNumber: '', phone: '', email: '', position: '', username: '', password: '', confirm: '',
      mustChange: true, roles: [] as string[], status: this.svc.policy.newAccountStatus as 'Activo' | 'Pendiente' };
  }

  get canCreate(): boolean { return this.svc.can('Usuarios', 'create'); }
  get name(): string { return fullName({ firstName: this.f.firstName.trim(), lastName: this.f.lastName.trim() }); }
  get ini(): string { return this.f.firstName && this.f.lastName ? initials(this.f) : '+'; }
  get avatar(): string { return avatarColor({ username: this.f.username || 'nuevo' }); }
  get docFmt(): string { const d = this.f.docNumber.replace(/\D/g, ''); return d ? Number(d).toLocaleString('es-CO') : '—'; }
  get selectedRoles(): Role[] { return this.roles.filter(r => this.f.roles.includes(r.id)); }
  get rules() { return passwordRules(this.f.password, this.svc.policy, this.f.username, this.f.docNumber.replace(/\D/g, '')); }
  get strength() { return passwordStrength(this.f.password, this.svc.policy); }

  get emailError(): string {
    const e = this.f.email.trim();
    if (!e) return '';
    if (!EMAIL_RE.test(e)) return 'Correo no válido.';
    const other = this.svc.emailTaken(e);
    return other ? `Este correo ya está registrado para ${fullName(other)} (${other.username}). Usa otro correo.` : '';
  }
  get docError(): string {
    const d = this.f.docNumber.replace(/\D/g, '');
    if (!d) return '';
    if (d.length < 5) return 'Número de documento incompleto.';
    const other = this.svc.docTaken(d);
    return other ? `Ya existe un usuario con este documento: ${fullName(other)} (${other.username}).` : '';
  }
  get usernameError(): string {
    const u = this.f.username.trim();
    if (!u) return '';
    if (!/^[a-z0-9._-]{4,30}$/.test(u)) return 'Usa de 4 a 30 letras minúsculas, números, punto o guion.';
    const other = this.svc.usernameTaken(u);
    return other ? `No disponible: lo usa ${fullName(other)}.` : '';
  }

  /** Módulos con acceso y qué puede hacer, según la unión de los roles elegidos (con herencia). */
  get access(): { module: Module; text: string }[] {
    const p = this.svc.permissionsFor(this.f.roles);
    return MODULES.filter(m => p[m].view).map(m => {
      const scope = this.selectedRoles.map(r => r.scope[m]).find(Boolean);
      const acts = ACTIONS.filter(a => p[m][a]).map(a => ACTION_LABEL[a].toLowerCase());
      const text = acts.length === 5 ? 'Acceso total' : acts.length === 1 ? (scope ? `Solo ${scope.charAt(0).toLowerCase()}${scope.slice(1)}` : 'Solo ver') : acts.join(', ').replace(/^./, c => c.toUpperCase());
      return { module: m, text };
    });
  }

  get errors(): string[] {
    const e: string[] = [];
    if (!this.f.firstName.trim() || !this.f.lastName.trim()) e.push('Escribe nombres y apellidos.');
    if (!this.f.docNumber.replace(/\D/g, '')) e.push('Escribe el número de documento.');
    if (this.docError) e.push(this.docError);
    if (!this.f.email.trim()) e.push('Escribe el correo electrónico.');
    if (this.emailError) e.push(this.emailError);
    if (!this.f.username.trim()) e.push('Escribe el nombre de usuario.');
    if (this.usernameError) e.push(this.usernameError);
    if (this.rules.some(r => !r.ok)) e.push('La contraseña no cumple la política de seguridad.');
    if (this.f.password !== this.f.confirm) e.push('Las contraseñas no coinciden.');
    if (!this.f.roles.length) e.push('Asigna al menos un rol.');
    return e;
  }

  /** Propone el usuario: inicial del nombre + primer apellido (si aún no se escribió a mano). */
  suggest(): void {
    if (this.userEdited) return;
    const plain = (s: string) => s.normalize('NFD').replace(/[^a-zA-Z\s]/g, '').toLowerCase().trim();
    const first = plain(this.f.firstName)[0] ?? '';
    const last = plain(this.f.lastName).split(/\s+/)[0] ?? '';
    let base = `${first}${last}`, n = 1, cand = base;
    while (cand && this.svc.usernameTaken(cand)) cand = `${base}${++n}`;
    this.f.username = cand;
  }

  /** Si el documento es de un empleado de Nómina, se vinculan y se proponen sus datos. */
  onDoc(): void {
    const d = this.f.docNumber.replace(/\D/g, '');
    this.employee = d ? this.payroll.findByDoc(d) : undefined;
    const e = this.employee;
    if (!e) return;
    if (!this.f.firstName) this.f.firstName = e.firstName;
    if (!this.f.lastName) this.f.lastName = e.lastName;
    if (!this.f.phone) this.f.phone = e.phone.replace('+57 ', '');
    if (!this.f.position) this.f.position = e.position;
    this.suggest();
  }

  toggleRole(id: string): void {
    this.f.roles = this.f.roles.includes(id) ? this.f.roles.filter(r => r !== id) : [...this.f.roles, id];
  }

  save(): void {
    this.touched = true;
    if (this.errors.length || !this.canCreate) return;
    const f = this.f;
    this.created = this.svc.createUser({
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), username: f.username, email: f.email, docType: f.docType, docNumber: f.docNumber,
      phone: f.phone.trim(), position: f.position, roles: f.roles, employeeId: this.employee?.id,
    }, { password: f.password, mustChange: f.mustChange, status: f.status });
    this.f.password = this.f.confirm = '';
  }

  reset(): void {
    this.f = this.blank();
    this.created = null; this.touched = false; this.userEdited = false; this.employee = undefined;
  }
}
