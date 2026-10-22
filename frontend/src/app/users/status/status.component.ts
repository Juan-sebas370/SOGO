import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, StatusChange, UserStatus, fullName, initials } from '../users.model';
import { STATUS_BADGE, avatarColor, dmyTime, when } from '../users-ui';
import { PayrollService } from '../../payroll/payroll.service';

type Mode = 'deactivate' | 'reactivate' | 'unlock' | 'activate';
const REASONS: Record<Mode, string[]> = {
  deactivate: ['Retiro voluntario', 'Terminación de contrato', 'Vacaciones o licencia', 'Cambio de funciones', 'Seguridad: acceso sospechoso', 'Otro'],
  reactivate: ['Reintegro a la empresa', 'Regreso de vacaciones o licencia', 'Error al desactivar', 'Otro'],
  unlock: ['Identidad verificada en persona', 'Identidad verificada por teléfono', 'Otro'],
  activate: ['No recibió el correo de activación', 'Activación presencial', 'Otro'],
};
const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

@Component({
  selector: 'app-user-status',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Activar o desactivar</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Activar o desactivar cuentas</h1>
      <p class="kit-sub">Desactivar bloquea el acceso sin borrar la información ni el historial del usuario.</p>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="msg">{{ msg }}</p>
  <p class="kit-banner kit-banner--warn" *ngFor="let w of payrollWarnings">{{ w }}</p>

  <section class="kit-card st-mb">
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Usuario</th><th>Roles</th><th>Estado</th><th>Último cambio de estado</th><th class="r">Acceso</th></tr></thead>
        <tbody>
          <tr *ngFor="let u of users" [class.st-sel]="modal?.u?.id === u.id">
            <td><div class="ur-user"><span class="ur-avatar" [style.background]="color(u)">{{ ini(u) }}</span><div><strong>{{ name(u) }}</strong><code>{{ u.username }}</code></div></div></td>
            <td><div class="ur-roles"><span *ngFor="let r of rolesOf(u)" class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span></div></td>
            <td><span class="rsv-badge" [ngClass]="badge[u.status]">{{ u.status }}</span></td>
            <td class="st-last">
              <ng-container *ngIf="u.scheduledDeactivation as s; else lastChange">
                <span class="st-sched">Se desactiva {{ dmyTime(s.at) }} · {{ s.reason }}</span>
                <button type="button" class="st-link" (click)="svc.cancelScheduled(u.id)" *ngIf="canEdit">Cancelar</button>
              </ng-container>
              <ng-template #lastChange>{{ lastText(u) }}</ng-template>
            </td>
            <td class="r">
              <span class="rp-muted st-lock" *ngIf="isLastAdmin(u)">🔒 Rol crítico</span>
              <ng-container *ngIf="!isLastAdmin(u)">
                <button type="button" class="rsv-btn rsv-btn--outline st-btn" *ngIf="u.status === 'Bloqueado'" [disabled]="!canEdit" (click)="open(u, 'unlock')">Desbloquear</button>
                <ng-container *ngIf="u.status === 'Pendiente'">
                  <button type="button" class="st-link" (click)="resend(u)" [disabled]="!canEdit">Reenviar enlace</button>
                  <button type="button" class="rsv-btn rsv-btn--outline st-btn" [disabled]="!canEdit" (click)="open(u, 'activate')">Activar ahora</button>
                </ng-container>
                <label class="kit-toggle" *ngIf="u.status === 'Activo' || u.status === 'Inactivo'">
                  <input type="checkbox" [checked]="u.status === 'Activo'" [disabled]="!canEdit" (click)="$event.preventDefault(); open(u, u.status === 'Activo' ? 'deactivate' : 'reactivate')"
                         [attr.aria-label]="(u.status === 'Activo' ? 'Desactivar ' : 'Reactivar ') + name(u)"><i></i></label>
              </ng-container>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="kit-card">
    <h2 class="kit-card-title">Historial de cambios de estado</h2>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Cambio</th><th>Motivo</th><th>Por</th></tr></thead>
        <tbody>
          <tr *ngFor="let h of history">
            <td>{{ dmyTime(h.at) }}</td><td><code class="ur-mono">{{ h.username }}</code></td>
            <td><span class="rsv-badge" [ngClass]="badge[h.from]">{{ h.from }}</span> → <span class="rsv-badge" [ngClass]="badge[h.to]">{{ h.to }}</span></td>
            <td>{{ h.reason }}<small class="rp-muted" *ngIf="h.note"> · {{ h.note }}</small></td><td>{{ h.by }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="rsv-modal-overlay" *ngIf="modal as m" (click)="modal = null">
    <div class="rsv-modal st-modal" role="dialog" aria-modal="true" aria-labelledby="st-title" (click)="$event.stopPropagation()">
      <div class="st-mhead">
        <span class="st-micon" [class.danger]="m.mode === 'deactivate'"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path [attr.d]="m.mode === 'deactivate' ? 'M5.6 5.6l12.8 12.8' : 'M8 12.5l2.5 2.5L16 9.5'"/></svg></span>
        <div><h2 class="rsv-modal-title" id="st-title">{{ title(m.mode) }} {{ name(m.u) }}?</h2><small class="rp-muted"><code class="ur-mono">{{ m.u.username }}</code> · {{ roleNames(m.u) }}</small></div>
      </div>
      <div class="st-effects">
        <p *ngFor="let fx of effects(m)" [class.bad]="fx.bad"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path [attr.d]="fx.bad ? 'M12 7v6M12 16.5v.5' : 'M8 12.5l2.5 2.5L16 9.5'"/></svg>{{ fx.text }}</p>
      </div>
      <label class="kit-field">Motivo *<select class="rsv-input" [(ngModel)]="m.reason"><option value="">Selecciona…</option><option *ngFor="let r of reasons[m.mode]">{{ r }}</option></select></label>
      <p class="kit-banner kit-banner--info st-payroll" *ngIf="m.mode === 'deactivate' && m.reason && payrollEffect(m.u, m.reason) as fx">{{ fx }}</p>
      <label class="kit-field">Observación<input class="rsv-input" [(ngModel)]="m.note" maxlength="160"></label>
      <ng-container *ngIf="m.mode === 'deactivate'">
        <p class="st-label">¿Cuándo?</p>
        <div class="ur-grid-2">
          <label class="ur-choice" [class.active]="!m.schedule"><input type="radio" name="when" [value]="false" [(ngModel)]="m.schedule"><span><strong>Ahora mismo</strong></span></label>
          <label class="ur-choice" [class.active]="m.schedule"><input type="radio" name="when" [value]="true" [(ngModel)]="m.schedule">
            <span><strong>Programar</strong><input *ngIf="m.schedule" type="datetime-local" class="rsv-input st-dt" [(ngModel)]="m.at" [min]="minAt"></span></label>
        </div>
      </ng-container>
      <p class="rp-muted st-note">Se registrará fecha, hora, administrador y motivo. El cambio se refleja de inmediato en el inicio de sesión y los permisos.</p>
      <p class="kit-error" *ngIf="error">{{ error }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="modal = null">Cancelar</button>
        <button type="button" class="rsv-btn" [ngClass]="m.mode === 'deactivate' ? 'rsv-btn--danger' : 'rsv-btn--primary'" [disabled]="!m.reason || (m.schedule && !m.at)" (click)="apply()">{{ cta(m.mode, m.schedule) }}</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .st-payroll { margin: 10px 0 0; font-size: 12.5px; }
    .st-mb { margin-bottom: 16px; }
    th.r, td.r { text-align: right; }
    tr.st-sel td { background: #F2F7FD; }
    .st-last { font-size: 12px; color: #4B5563; }
    .st-sched { color: #B45309; font-weight: 600; }
    .st-link { border: none; background: none; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; margin: 0 6px; }
    .st-btn { height: 32px; padding: 0 12px; font-size: 12px; }
    .st-lock { font-size: 12px; }
    .st-modal { max-width: 520px; }
    .st-mhead { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .st-micon { width: 40px; height: 40px; border-radius: 10px; background: #E2F5EC; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .st-micon.danger { background: #FDECEA; }
    .st-micon svg { width: 20px; height: 20px; fill: none; stroke: #1F8A5B; stroke-width: 2.2; stroke-linecap: round; }
    .st-micon.danger svg { stroke: #C62828; }
    .st-effects { background: #F6F8FB; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; }
    .st-effects p { display: flex; gap: 8px; margin: 5px 0; font-size: 12.5px; color: #1F2937; }
    .st-effects svg { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: #1F8A5B; stroke-width: 2; stroke-linecap: round; }
    .st-effects p.bad svg { stroke: #C62828; }
    .st-label { margin: 10px 0 6px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .st-dt { margin-top: 6px; height: 36px; }
    .st-note { margin: 10px 0 0; font-size: 12px; }
  `],
})
export class StatusComponent implements OnDestroy {
  readonly badge = STATUS_BADGE; readonly dmyTime = dmyTime; readonly reasons = REASONS;
  users: AppUser[] = [];
  roles: Role[] = [];
  history: StatusChange[] = [];
  modal: { u: AppUser; mode: Mode; reason: string; note: string; schedule: boolean; at: string } | null = null;
  error = ''; msg = '';
  payrollWarnings: string[] = [];
  private sub: Subscription;

  constructor(public svc: UsersService, private payroll: PayrollService, route: ActivatedRoute) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles()]).subscribe(([u, r]) => {
      this.users = u; this.roles = r; this.history = svc.statusHistory;
      // Empleados retirados en Nómina que aún tienen la cuenta activa
      this.payrollWarnings = u.filter(x => x.employeeId && (x.status === 'Activo' || x.status === 'Pendiente') && payroll.getEmployee(x.employeeId)?.status === 'Retirado' && !x.scheduledDeactivation)
        .map(x => `${fullName(x)} figura como retirado en Nómina y su cuenta sigue ${x.status.toLowerCase()}. Considera desactivarla.`);
    });
    const id = route.snapshot.queryParamMap.get('u');
    const target = id ? this.users.find(x => x.id === id) : undefined;
    if (target && this.canEdit && !this.isLastAdmin(target)) {
      this.open(target, target.status === 'Bloqueado' ? 'unlock' : target.status === 'Pendiente' ? 'activate' : target.status === 'Activo' ? 'deactivate' : 'reactivate');
    }
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get minAt(): string { return local(new Date()); }
  name(u: AppUser): string { return fullName(u); }
  ini(u: AppUser): string { return initials(u); }
  color(u: AppUser): string { return avatarColor(u); }
  rolesOf(u: AppUser): Role[] { return u.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }
  roleNames(u: AppUser): string { return this.rolesOf(u).map(r => r.name).join(', '); }
  isLastAdmin(u: AppUser): boolean {
    return u.roles.includes('admin') && u.status === 'Activo' && !this.users.some(x => x.id !== u.id && x.status === 'Activo' && x.roles.includes('admin'));
  }
  lastText(u: AppUser): string {
    const h = this.history.find(x => x.username === u.username);
    if (h) return `${h.to} · ${dmyTime(h.at)} · ${h.by}`;
    if (u.status === 'Pendiente') return `Activación pendiente · enlace vence ${u.activationExpires ? when(u.activationExpires).toLowerCase() : '—'}`;
    return `Activa desde el registro · ${dmyTime(u.createdAt)}`;
  }

  /** Qué pasa en Nómina con la ficha de esta persona según el motivo (lo aplica el servidor). */
  payrollEffect(u: AppUser, reason: string): string {
    const emp = this.payroll.employeesSnapshot().find(e => e.userId === u.id || e.id === u.employeeId);
    if (!emp || emp.status === 'Retirado') return '';
    if (/^(Cambio de funciones|Seguridad)/.test(reason)) return `En Nómina, ${emp.code} sigue activo: solo pierde el acceso a SOGO.`;
    if (/^Vacaciones/.test(reason)) return `En Nómina, ${emp.code} pasa a Vacaciones y sigue en la nómina. Al reactivar la cuenta vuelve a Activo.`;
    return `En Nómina, ${emp.code} pasa a Retirado (exempleado) desde hoy: deja de liquidarse y sus días posteriores no se pagan.`;
  }

  title(m: Mode): string { return { deactivate: '¿Desactivar la cuenta de', reactivate: '¿Reactivar la cuenta de', unlock: '¿Desbloquear la cuenta de', activate: '¿Activar ahora la cuenta de' }[m]; }
  cta(m: Mode, schedule: boolean): string {
    return m === 'deactivate' ? (schedule ? 'Programar desactivación' : 'Desactivar cuenta') : m === 'reactivate' ? 'Reactivar cuenta' : m === 'unlock' ? 'Desbloquear' : 'Activar cuenta';
  }
  effects(m: { u: AppUser; mode: Mode }): { text: string; bad: boolean }[] {
    if (m.mode === 'deactivate') return [
      { text: 'No podrá iniciar sesión ni usar ningún módulo. Su sesión abierta se cerrará.', bad: true },
      { text: 'Se conservan sus registros, historial de actividad y auditoría.', bad: false },
      { text: 'Se conservan sus roles: si la reactivas, recupera los mismos permisos.', bad: false },
    ];
    if (m.mode === 'unlock') return [
      { text: `El contador de intentos fallidos vuelve a 0 (tenía ${m.u.failedAttempts}).`, bad: false },
      { text: 'Si no recuerda la contraseña, restablécela en «Contraseñas».', bad: false },
    ];
    return [
      { text: `Podrá iniciar sesión con sus roles: ${this.roleNames(m.u)}.`, bad: false },
      { text: m.mode === 'activate' ? 'Deberá cambiar la contraseña en el primer inicio de sesión.' : 'Conserva su historial anterior.', bad: false },
    ];
  }

  open(u: AppUser, mode: Mode): void {
    const emp = u.employeeId ? this.payroll.getEmployee(u.employeeId) : undefined;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(23, 0, 0, 0);
    const at = emp?.contractEnd && emp.contractEnd >= local(new Date()).slice(0, 10) ? `${emp.contractEnd}T23:00` : local(tomorrow);
    this.modal = { u, mode, reason: '', note: '', schedule: false, at };
    this.error = ''; this.msg = '';
  }

  resend(u: AppUser): void {
    this.svc.resendActivation(u.id);
    this.msg = `Se reenvió el enlace de activación a ${u.email} (válido ${this.svc.policy.activationHours} h).`;
  }

  apply(): void {
    const m = this.modal!;
    try {
      if (m.mode === 'deactivate' && m.schedule) {
        if (m.at <= local(new Date())) { this.error = 'La fecha programada debe ser futura.'; return; }
        this.svc.scheduleDeactivation(m.u.id, m.at, m.reason, m.note.trim());
        this.msg = `La cuenta de ${m.u.username} se desactivará el ${dmyTime(m.at)}.`;
      } else {
        const to: UserStatus = m.mode === 'deactivate' ? 'Inactivo' : 'Activo';
        this.svc.setStatus(m.u.id, to, m.reason, m.note.trim());
        this.msg = `Cuenta de ${m.u.username}: ${m.u.status} → ${to}.`;
      }
      this.history = this.svc.statusHistory;
      this.modal = null;
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
}
