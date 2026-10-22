import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, AuditEvent, Module, MODULES, ACTIONS, ACTION_LABEL, Action, fullName, initials, docLabel } from '../users.model';
import { STATUS_BADGE, RESULT_BADGE, avatarColor, when, dmy, dmyTime } from '../users-ui';
import { PayrollService } from '../../payroll/payroll.service';
import { EMAIL_RE } from '../../billing/invoice.model';

type Tab = 'detalle' | 'editar' | 'permisos' | 'actividad';
interface Diff { field: string; before: string; after: string; extra?: string; }

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <ng-container *ngIf="u as user; else missing">
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>{{ name(user) }}</span><ng-container *ngIf="tab === 'editar'"><span>/</span><span>Editar</span></ng-container></nav>

  <section class="kit-card ud-head">
    <div class="ur-user">
      <span class="ur-avatar ur-avatar--lg" [style.background]="color(user)">{{ ini(user) }}</span>
      <div>
        <div class="ud-title"><h1>{{ name(user) }}</h1><span class="rsv-badge" [ngClass]="badge[user.status]">{{ user.status }}</span></div>
        <small class="rp-muted"><code class="ur-mono">{{ user.username }}</code> · {{ user.position || 'Sin cargo' }} · creado {{ dmy(user.createdAt) }} · último acceso {{ when(user.lastAccess).toLowerCase() }}</small>
      </div>
    </div>
    <div class="ur-tabs ud-tabs" role="tablist">
      <button type="button" class="ur-tab" *ngFor="let t of tabs" role="tab" [attr.aria-selected]="tab === t.key" [class.active]="tab === t.key" (click)="go(t.key)">{{ t.label }}</button>
    </div>
  </section>

  <!-- Detalle -->
  <div class="ud-grid" *ngIf="tab === 'detalle'">
    <section class="kit-card">
      <h2 class="kit-card-title">Datos de la cuenta</h2>
      <div class="ur-kv"><span>Documento</span><strong>{{ doc(user) }}</strong></div>
      <div class="ur-kv"><span>Correo</span><strong>{{ user.email }}</strong></div>
      <div class="ur-kv"><span>Teléfono</span><strong>{{ user.phone || '—' }}</strong></div>
      <div class="ur-kv"><span>Cargo</span><strong>{{ user.position || '—' }}</strong></div>
      <div class="ur-kv"><span>Empleado de Nómina</span><strong>
        <a *ngIf="employeeCode; else noEmp" [routerLink]="['/dashboard/payroll/employees', user.employeeId]">{{ employeeCode }}</a><ng-template #noEmp>No vinculado</ng-template></strong></div>
      <div class="ur-kv"><span>Roles</span><strong><span class="ur-roles ud-end"><span *ngFor="let r of rolesOf(user)" class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span></span></strong></div>
      <div class="ur-kv"><span>Contraseña</span><strong>Cambiada {{ dmy(user.passwordSetAt) }}{{ user.mustChangePassword ? ' · debe cambiarla al entrar' : '' }}</strong></div>
      <div class="ur-kv"><span>Intentos fallidos</span><strong>{{ user.failedAttempts }} de {{ svc.policy.maxAttempts }}</strong></div>
      <div class="ur-kv" *ngIf="user.activationExpires"><span>Enlace de activación</span><strong>Vence {{ dmyTime(user.activationExpires) }}</strong></div>
      <div class="ur-kv" *ngIf="user.scheduledDeactivation"><span>Desactivación programada</span><strong>{{ dmyTime(user.scheduledDeactivation.at) }} · {{ user.scheduledDeactivation.reason }}</strong></div>
      <div class="ud-btns" *ngIf="canEdit">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="go('editar')">Editar</button>
        <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/users/passwords" [queryParams]="{ u: user.id }">Restablecer contraseña</a>
        <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/users/status" [queryParams]="{ u: user.id }">Activar / desactivar</a>
      </div>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Módulos con acceso · {{ modules.length }} de {{ allModules.length }}</h2>
      <div class="ud-mod" *ngFor="let m of allModules" [class.off]="!perms[m].view">
        <strong>{{ m }}</strong><span>{{ perms[m].view ? actionsText(m) : 'Sin acceso' }}</span>
      </div>
    </section>
  </div>

  <!-- Editar -->
  <div class="kit-layout" *ngIf="tab === 'editar'">
    <div>
      <section class="kit-card ur-section">
        <div class="ur-field-head"><h2 class="kit-card-title">Datos personales y de acceso</h2><span class="rsv-badge rsv-badge--info" *ngIf="diffs.length">{{ diffs.length }} cambio{{ diffs.length === 1 ? '' : 's' }} sin guardar</span></div>
        <div class="ur-grid-2">
          <label class="ur-field">Nombres *<input class="rsv-input" [(ngModel)]="e.firstName" maxlength="60"></label>
          <label class="ur-field">Apellidos *<input class="rsv-input" [(ngModel)]="e.lastName" maxlength="60"></label>
          <label class="ur-field"><span class="ur-field-head">Número de documento<span class="rp-muted">🔒 Dato crítico</span></span>
            <input class="rsv-input" [value]="doc(user)" disabled><small>Solo se cambia con validación de identidad y aprobación de un segundo administrador.</small></label>
          <label class="ur-field"><span class="ur-field-head">Correo electrónico *<span class="ur-changed" *ngIf="e.email !== user.email">Modificado</span></span>
            <input class="rsv-input" type="email" [(ngModel)]="e.email" [class.invalid]="!!emailError" [class.valid]="!emailError && e.email !== user.email">
            <small class="err" *ngIf="emailError">{{ emailError }}</small>
            <small class="ok" *ngIf="!emailError && e.email !== user.email">Correo disponible · antes {{ user.email }}</small></label>
          <label class="ur-field">Teléfono<input class="rsv-input" [(ngModel)]="e.phone" maxlength="20"></label>
          <label class="ur-field"><span class="ur-field-head">Cargo<span class="ur-changed" *ngIf="e.position !== user.position">Modificado</span></span>
            <select class="rsv-input" [(ngModel)]="e.position"><option value="">Sin cargo</option><option *ngFor="let p of positions">{{ p }}</option></select></label>
        </div>
      </section>

      <section class="kit-card ur-section">
        <div class="ur-field-head"><h2 class="kit-card-title">Roles y estado</h2><span class="ur-changed" *ngIf="rolesChanged">Modificado</span></div>
        <div class="ud-chips">
          <span *ngFor="let r of editRoles" class="ur-role ud-chip" [ngClass]="'ur-role--' + r.color" [class.ud-new]="!user.roles.includes(r.id)">
            {{ r.name }}<button type="button" (click)="removeRole(r.id)" [attr.aria-label]="'Quitar ' + r.name">×</button></span>
          <span class="rsv-badge rsv-badge--ok" *ngIf="addedRoles.length">Nuevo</span>
          <select class="rsv-input ud-add" [(ngModel)]="addRole" (ngModelChange)="assign()" aria-label="Asignar rol">
            <option value="">+ Asignar rol</option><option *ngFor="let r of available" [value]="r.id">{{ r.name }}</option></select>
        </div>
        <p class="kit-error" *ngIf="!e.roles.length">El usuario debe tener al menos un rol.</p>
        <div class="ur-grid-2 ud-mt">
          <label class="ur-field">Estado de la cuenta<input class="rsv-input" [value]="user.status" disabled>
            <small>Para activar, desactivar o desbloquear usa <a routerLink="/dashboard/users/status" [queryParams]="{ u: user.id }">«Activar / desactivar»</a>, que pide motivo.</small></label>
          <label class="ur-field">Contraseña<span class="ud-pw"><span>No se edita aquí</span><a routerLink="/dashboard/users/passwords" [queryParams]="{ u: user.id }">Restablecer</a></span></label>
        </div>
      </section>

      <section class="kit-card">
        <div class="ur-field-head"><h2 class="kit-card-title">Historial de modificaciones</h2><span class="rp-muted">Solo lectura</span></div>
        <div class="kit-table-wrap"><table class="kit-table">
          <thead><tr><th>Fecha</th><th>Campo</th><th>Antes</th><th>Después</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody><tr *ngFor="let h of user.history"><td>{{ dmyTime(h.at) }}</td><td>{{ h.field }}</td><td>{{ h.before }}</td><td>{{ h.after }}</td><td>{{ h.reason }}</td><td>{{ h.by }}</td></tr></tbody>
        </table></div>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card ud-confirm">
        <h2 class="kit-card-title">Confirmar cambios</h2>
        <p class="rp-muted">Revisa los cambios antes de guardarlos. Se aplican de inmediato en todos los módulos.</p>
        <div class="ud-diff" *ngFor="let d of diffs">
          <span>{{ d.field }}</span>
          <div><s>{{ d.before || '—' }}</s><strong>{{ d.after || '—' }}</strong><small *ngIf="d.extra">{{ d.extra }}</small></div>
        </div>
        <p class="rp-muted" *ngIf="!diffs.length">Aún no hay cambios.</p>
        <label class="ur-field ud-mt">Motivo del cambio *<textarea class="rsv-input" rows="3" [(ngModel)]="reason" maxlength="200" placeholder="Ej.: ascenso, cambio de área, corrección de datos"></textarea></label>
        <p class="ur-note ud-mt">Se registrará: {{ nowText }} · {{ svc.actor() }} · valores anteriores y nuevos.</p>
        <p class="kit-error" *ngIf="editError">{{ editError }}</p>
        <div class="ud-btns2">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="discard()" [disabled]="!diffs.length">Descartar</button>
          <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!diffs.length || !reason.trim() || !!editError || !canEdit" (click)="saveEdit()">Confirmar y guardar</button>
        </div>
        <ng-container *ngIf="savedMsg">
          <p class="ud-sub">Mensaje al guardar</p>
          <p class="kit-banner kit-banner--ok"><span><strong>Usuario actualizado.</strong> {{ savedMsg }}</span></p>
        </ng-container>
      </section>
    </aside>
  </div>

  <!-- Permisos -->
  <section class="kit-card" *ngIf="tab === 'permisos'">
    <h2 class="kit-card-title">Permisos efectivos</h2>
    <p class="kit-card-sub">Unión de los permisos de sus roles ({{ roleNames(user) }}), incluidos los heredados. Se cambian en «Roles y permisos».</p>
    <div class="kit-table-wrap"><table class="kit-table ud-matrix">
      <thead><tr><th>Módulo</th><th *ngFor="let a of actions">{{ label[a] }}</th><th>Otorgado por</th></tr></thead>
      <tbody><tr *ngFor="let m of allModules" [class.off]="!perms[m].view">
        <td><strong>{{ m }}</strong></td>
        <td *ngFor="let a of actions"><span [class.yes]="perms[m][a]">{{ perms[m][a] ? '✓' : '—' }}</span></td>
        <td class="rp-muted">{{ grantedBy(m) }}</td>
      </tr></tbody>
    </table></div>
    <a class="rsv-btn rsv-btn--outline ud-mt" routerLink="/dashboard/users/roles">Ir a Roles y permisos</a>
  </section>

  <!-- Actividad -->
  <section class="kit-card" *ngIf="tab === 'actividad'">
    <div class="ur-field-head"><h2 class="kit-card-title">Actividad reciente</h2><a routerLink="/dashboard/users/activity" [queryParams]="{ usuario: user.username }">Ver en el historial completo</a></div>
    <div class="kit-table-wrap"><table class="kit-table">
      <thead><tr><th>Fecha y hora</th><th>IP</th><th>Módulo</th><th>Acción</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr *ngFor="let ev of activity"><td>{{ dmy(ev.at) }} {{ ev.at.slice(11, 19) }}</td><td>{{ ev.ip }}</td><td>{{ ev.module }}</td><td>{{ ev.action }}<small class="rp-muted" *ngIf="ev.detail"> · {{ ev.detail }}</small></td>
          <td><span class="rsv-badge" [ngClass]="resultBadge[ev.result]">{{ ev.result }}</span></td></tr>
        <tr *ngIf="!activity.length"><td colspan="5" class="kit-empty">Sin actividad registrada.</td></tr>
      </tbody>
    </table></div>
  </section>
  </ng-container>
  <ng-template #missing><p class="kit-empty">El usuario no existe. <a routerLink="/dashboard/users">Volver a Usuarios</a></p></ng-template>
  `,
  styles: [`
    .ud-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .ud-title { display: flex; align-items: center; gap: 10px; }
    .ud-title h1 { margin: 0; font-size: 21px; color: #0A2540; }
    .ud-tabs { border: none; padding: 0; }
    .ud-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .ud-end { justify-content: flex-end; }
    .ud-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .ud-mod { display: flex; justify-content: space-between; padding: 8px 10px; border-radius: 8px; background: #F6F8FB; margin-bottom: 6px; font-size: 12.5px; }
    .ud-mod span { color: #4B5563; }
    .ud-mod.off { background: transparent; color: #9AA5B4; }
    .ud-mod.off strong, .ud-mod.off span { color: #9AA5B4; }
    .ud-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .ud-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 8px 6px 10px; }
    .ud-chip button { border: none; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0; }
    .ud-new { outline: 2px dashed #1F8A5B; outline-offset: 2px; }
    .ud-add { width: auto; height: 36px; }
    .ud-mt { margin-top: 12px; }
    .ud-pw { display: flex; justify-content: space-between; align-items: center; height: 44px; padding: 0 12px; border: 1px solid #D5DEEA; border-radius: 10px; font-weight: 400; color: #9AA5B4; }
    .ud-pw a { font-weight: 700; color: #0B6FD0; text-decoration: none; }
    .ud-confirm { border: 2px solid #1565C0; }
    .ud-diff { display: grid; grid-template-columns: 70px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid #EEF1F5; font-size: 12.5px; }
    .ud-diff > span { color: #6B7280; }
    .ud-diff s { display: block; color: #9AA5B4; }
    .ud-diff strong { display: block; color: #0A2540; }
    .ud-diff small { display: block; color: #1F8A5B; font-weight: 600; }
    .ud-btns2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .ud-sub { margin: 14px 0 6px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .ud-matrix td, .ud-matrix th { text-align: center; }
    .ud-matrix td:first-child, .ud-matrix th:first-child, .ud-matrix td:last-child, .ud-matrix th:last-child { text-align: left; }
    .ud-matrix .yes { color: #1F8A5B; font-weight: 700; }
    .ud-matrix tr.off td { color: #9AA5B4; }
    @media (max-width: 900px) { .ud-grid { grid-template-columns: 1fr; } }
  `],
})
export class UserDetailComponent implements OnDestroy {
  readonly tabs: { key: Tab; label: string }[] = [{ key: 'detalle', label: 'Detalle' }, { key: 'editar', label: 'Editar' }, { key: 'permisos', label: 'Permisos' }, { key: 'actividad', label: 'Actividad' }];
  readonly badge = STATUS_BADGE; readonly resultBadge = RESULT_BADGE;
  readonly when = when; readonly dmy = dmy; readonly dmyTime = dmyTime;
  readonly allModules = MODULES; readonly actions = ACTIONS; readonly label = ACTION_LABEL;

  id = '';
  u: AppUser | undefined;
  roles: Role[] = [];
  events: AuditEvent[] = [];
  tab: Tab = 'detalle';
  e = { firstName: '', lastName: '', email: '', phone: '', position: '', roles: [] as string[] };
  reason = '';
  addRole = '';
  savedMsg = '';
  editError = '';
  positions: string[] = [];
  private sub: Subscription;

  constructor(public svc: UsersService, private payroll: PayrollService, private route: ActivatedRoute, private router: Router) {
    this.positions = [...new Set([...payroll.employeesSnapshot().map(x => x.position), 'Administrador', 'Contadora (externa)', 'Coordinador de inventarios y nómina'])].sort();
    this.sub = combineLatest([route.paramMap, route.queryParamMap, svc.getUsers(), svc.getRoles(), svc.getEvents()]).subscribe(([p, q, users, roles, events]) => {
      const idChanged = p.get('id') !== this.id;
      this.id = p.get('id') ?? '';
      this.u = users.find(x => x.id === this.id);
      this.roles = roles; this.events = events;
      const t = q.get('tab') as Tab | null;
      this.tab = t && this.tabs.some(x => x.key === t) ? t : 'detalle';
      if (this.tab === 'editar' && !this.canEdit) this.tab = 'detalle';
      if (idChanged && this.u) this.load(this.u);
      if (this.u && this.u.position && !this.positions.includes(this.u.position)) this.positions = [...this.positions, this.u.position].sort();
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get perms() { return this.svc.permissionsFor(this.u?.roles ?? []); }
  get modules(): Module[] { return MODULES.filter(m => this.perms[m].view); }
  get activity(): AuditEvent[] { return this.u ? this.events.filter(x => x.user === this.u!.username).slice(-60).reverse() : []; }
  get employeeCode(): string { return this.u?.employeeId ? this.payroll.getEmployee(this.u.employeeId)?.code ?? '' : ''; }
  get editRoles(): Role[] { return this.e.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }
  get available(): Role[] { return this.roles.filter(r => !this.e.roles.includes(r.id)); }
  get addedRoles(): string[] { return this.e.roles.filter(r => !this.u!.roles.includes(r)); }
  get rolesChanged(): boolean { return !!this.u && [...this.e.roles].sort().join() !== [...this.u.roles].sort().join(); }
  get nowText(): string {
    const n = new Date(), p = (x: number) => String(x).padStart(2, '0');
    return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
  }
  get emailError(): string {
    const m = this.e.email.trim();
    if (!m) return 'El correo es obligatorio.';
    if (!EMAIL_RE.test(m)) return 'Correo no válido.';
    const other = this.svc.emailTaken(m, this.id);
    return other ? `Este correo ya está registrado para ${fullName(other)} (${other.username}).` : '';
  }

  name(u: AppUser): string { return fullName(u); }
  ini(u: AppUser): string { return initials(u); }
  color(u: AppUser): string { return avatarColor(u); }
  doc(u: AppUser): string { return docLabel(u); }
  rolesOf(u: AppUser): Role[] { return u.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }
  roleNames(u: AppUser): string { return this.rolesOf(u).map(r => r.name).join(', '); }
  actionsText(m: Module): string {
    const acts = ACTIONS.filter(a => this.perms[m][a]);
    return acts.length === 5 ? 'Acceso total' : acts.map(a => ACTION_LABEL[a]).join(', ');
  }
  grantedBy(m: Module): string {
    if (!this.u) return '';
    return this.rolesOf(this.u).filter(r => ACTIONS.some((a: Action) => this.svc.effective(r.id)[m][a]))
      .map(r => ACTIONS.some((a: Action) => this.svc.source(r.id, m, a) === 'own') ? r.name : `${r.name} (heredado)`).join(', ') || '—';
  }

  go(t: Tab): void { this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t === 'detalle' ? null : t } }); }

  private load(u: AppUser): void {
    this.e = { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, position: u.position, roles: [...u.roles] };
    this.reason = ''; this.editError = '';
  }

  get diffs(): Diff[] {
    const u = this.u;
    if (!u) return [];
    const d: Diff[] = [];
    const t = (s: string) => s.trim();
    if (t(this.e.firstName) !== u.firstName) d.push({ field: 'Nombres', before: u.firstName, after: t(this.e.firstName) });
    if (t(this.e.lastName) !== u.lastName) d.push({ field: 'Apellidos', before: u.lastName, after: t(this.e.lastName) });
    if (t(this.e.email).toLowerCase() !== u.email) d.push({ field: 'Correo', before: u.email, after: t(this.e.email).toLowerCase() });
    if (t(this.e.phone) !== u.phone) d.push({ field: 'Teléfono', before: u.phone, after: t(this.e.phone) });
    if (this.e.position !== u.position) d.push({ field: 'Cargo', before: u.position, after: this.e.position });
    if (this.rolesChanged) {
      const names = (ids: string[]) => ids.map(id => this.roles.find(r => r.id === id)?.name ?? id).join(', ');
      const added = this.e.roles.filter(r => !u.roles.includes(r)), removed = u.roles.filter(r => !this.e.roles.includes(r));
      d.push({ field: 'Roles', before: names(u.roles), after: names(this.e.roles),
        extra: [added.length ? `+ ${names(added)}` : '', removed.length ? `− ${names(removed)}` : ''].filter(Boolean).join(' · ') });
    }
    return d;
  }

  assign(): void {
    if (this.addRole) this.e.roles = [...this.e.roles, this.addRole];
    setTimeout(() => this.addRole = '');
  }
  removeRole(id: string): void { this.e.roles = this.e.roles.filter(r => r !== id); }
  discard(): void { if (this.u) this.load(this.u); }

  saveEdit(): void {
    const u = this.u!;
    this.editError = '';
    if (!this.e.firstName.trim() || !this.e.lastName.trim()) { this.editError = 'Nombres y apellidos son obligatorios.'; return; }
    if (this.emailError) { this.editError = this.emailError; return; }
    if (!this.e.roles.length) { this.editError = 'El usuario debe tener al menos un rol.'; return; }
    const lastAdmin = u.roles.includes('admin') && !this.e.roles.includes('admin')
      && !this.svc.usersSnapshot().some(x => x.id !== u.id && x.status === 'Activo' && x.roles.includes('admin'));
    if (lastAdmin) { this.editError = `${fullName(u)} es el único administrador activo: no se le puede quitar el rol.`; return; }
    const diffs = this.diffs;
    this.svc.updateUser(u.id, {
      firstName: this.e.firstName.trim(), lastName: this.e.lastName.trim(), email: this.e.email.trim().toLowerCase(),
      phone: this.e.phone.trim(), position: this.e.position, roles: [...this.e.roles],
    }, diffs.map(d => ({ field: d.field, before: d.before, after: d.after })), this.reason.trim());
    this.savedMsg = `Los cambios ya están activos para ${u.username}.`;
    this.reason = '';
  }
}
