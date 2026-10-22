import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, PasswordReset, fullName, initials, passwordRules, passwordStrength } from '../users.model';
import { avatarColor, dmyTime, when } from '../users-ui';
import { stampOf } from '../users-seed';

const REASONS = ['Olvidó la contraseña', 'Cuenta bloqueada por intentos fallidos', 'Sospecha de acceso ajeno', 'Contraseña vencida', 'Primer ingreso asistido', 'Otro'];

@Component({
  selector: 'app-passwords',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Restablecer contraseña</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Restablecer contraseña</h1>
      <p class="kit-sub">Recupera el acceso de un usuario de forma segura. No cambia sus roles, permisos ni datos personales.</p>
    </div>
  </header>

  <div class="kit-layout">
    <div>
      <section class="kit-card ur-section">
        <h2 class="pw-step"><b>1</b> Usuario</h2>
        <div class="pw-user" *ngIf="u && !picking">
          <div class="ur-user"><span class="ur-avatar ur-avatar--lg" [style.background]="color(u)">{{ ini(u) }}</span>
            <div><strong class="pw-name">{{ name(u) }}</strong><small class="rp-muted"><code class="ur-mono">{{ u.username }}</code> · {{ u.email }} · {{ roleNames(u) }}</small></div></div>
          <span class="rsv-badge" [ngClass]="u.status === 'Bloqueado' ? 'rsv-badge--danger' : u.status === 'Activo' ? 'rsv-badge--ok' : 'rsv-badge--muted'">
            {{ u.status }}{{ u.status === 'Bloqueado' ? ' · ' + u.failedAttempts + ' intentos fallidos' : '' }}</span>
          <button type="button" class="pw-link" (click)="picking = true">Cambiar</button>
        </div>
        <label class="kit-select" *ngIf="!u || picking"><span>Selecciona el usuario</span>
          <select [ngModel]="u?.id ?? ''" (ngModelChange)="pick($event)"><option value="" disabled>Elige…</option>
            <option *ngFor="let x of users" [value]="x.id">{{ name(x) }} · {{ x.username }} ({{ x.status }})</option></select></label>
        <p class="kit-banner kit-banner--warn pw-mt" *ngIf="u?.status === 'Inactivo'">La cuenta está desactivada: la nueva contraseña no servirá hasta que se reactive en «Activar / desactivar».</p>
      </section>

      <section class="kit-card ur-section" *ngIf="u">
        <h2 class="pw-step"><b>2</b> Nueva contraseña</h2>
        <div class="ur-grid-2">
          <label class="ur-choice" [class.active]="mode === 'temp'"><input type="radio" name="m" value="temp" [(ngModel)]="mode">
            <span><strong>Generar contraseña temporal</strong><small>12 caracteres aleatorios · vence en {{ svc.policy.tempPasswordHours }} horas · se muestra una sola vez para que la entregues.</small></span></label>
          <label class="ur-choice" [class.active]="mode === 'manual'"><input type="radio" name="m" value="manual" [(ngModel)]="mode">
            <span><strong>Definir una contraseña</strong><small>El administrador la escribe; debe cumplir la política de seguridad.</small></span></label>
        </div>
        <ng-container *ngIf="mode === 'manual'">
          <div class="ur-grid-2 pw-mt">
            <label class="ur-field">Contraseña *<input class="rsv-input" type="password" [(ngModel)]="pw" autocomplete="new-password">
              <span class="ur-strength" aria-hidden="true"><i *ngFor="let n of [1,2,3,4]" [class.on]="strength.score >= n" [class.weak]="strength.score === 1" [class.mid]="strength.score === 2"></i></span></label>
            <label class="ur-field">Confirmar *<input class="rsv-input" type="password" [(ngModel)]="pw2" autocomplete="new-password" [class.invalid]="!!pw2 && pw2 !== pw"></label>
          </div>
          <div class="ur-rules"><span class="ur-rule" *ngFor="let r of rules" [class.ok]="r.ok"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path *ngIf="r.ok" d="M8 12.5l2.5 2.5L16 9.5"/></svg>{{ r.label }}</span></div>
        </ng-container>
        <label class="pw-toggle"><span class="kit-toggle"><input type="checkbox" checked disabled><i></i></span> Exigir cambio de contraseña en el primer inicio de sesión <span class="rsv-badge rsv-badge--muted">Obligatorio</span></label>
        <label class="pw-toggle" *ngIf="u.status === 'Bloqueado'"><span class="kit-toggle"><input type="checkbox" [(ngModel)]="unlock"><i></i></span> Desbloquear la cuenta al restablecer (pasa a Activo)</label>
      </section>

      <section class="kit-card ur-section" *ngIf="u">
        <h2 class="pw-step"><b>3</b> Notificación y motivo</h2>
        <div class="pw-channels">
          <label><input type="checkbox" [(ngModel)]="ch.email"> Correo a {{ u.email }}</label>
          <label><input type="checkbox" [(ngModel)]="ch.internal"> Mensaje interno en SOGO</label>
          <label [class.off]="!u.phone"><input type="checkbox" [(ngModel)]="ch.sms" [disabled]="!u.phone"> SMS{{ u.phone ? ' al ' + u.phone : ' (sin teléfono)' }}</label>
        </div>
        <p class="kit-error" *ngIf="mode === 'temp' && !ch.email && !ch.sms">La contraseña temporal solo llega por correo o SMS: elige al menos uno.</p>
        <label class="ur-field pw-mt">Motivo *<select class="rsv-input" [(ngModel)]="reason"><option value="">Selecciona…</option><option *ngFor="let r of reasons">{{ r }}</option></select></label>
        <label class="ur-field pw-mt">Observación<input class="rsv-input" [(ngModel)]="note" maxlength="160" placeholder="Ej.: lo solicitó en persona; se verificó con la cédula"></label>
      </section>

      <section class="kit-card pw-confirm" *ngIf="u">
        <div><strong>¿Restablecer la contraseña de {{ name(u) }}?</strong>
          <p class="rp-muted">Su contraseña actual dejará de funcionar de inmediato. Quedará registrado en auditoría.</p></div>
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="clear()">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!!problem || !canEdit" (click)="apply()">Sí, restablecer</button>
      </section>
      <p class="kit-error" *ngIf="u && problem && touched">{{ problem }}</p>
      <p class="kit-banner kit-banner--ok" *ngIf="done">{{ done }}</p>
      <p class="kit-banner kit-banner--warn" *ngIf="shownTemp"><span><strong>Contraseña temporal: <code class="pw-temp">{{ shownTemp }}</code></strong>
        Cópiala y entrégala por un canal seguro: no se volverá a mostrar. Deberá cambiarla al entrar.</span></p>

      <section class="kit-card pw-mt">
        <h2 class="kit-card-title">Restablecimientos recientes</h2>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Método</th><th>Motivo</th><th>Por</th><th>Cambió su clave</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of resets">
                <td>{{ dmyTime(r.at) }}</td><td><code class="ur-mono">{{ r.username }}</code></td><td>{{ r.method }}</td><td>{{ r.reason }}</td><td>{{ r.by }}</td>
                <td><span class="rsv-badge" [ngClass]="changedBadge(r)">{{ changedText(r) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="kit-aside" *ngIf="u">
      <section class="kit-card">
        <h2 class="kit-card-title">Lo que no cambia</h2>
        <p class="pw-keep"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>Roles: {{ roleNames(u) }}</p>
        <p class="pw-keep"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>Permisos y módulos asignados</p>
        <p class="pw-keep"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>Datos personales e historial</p>
      </section>
      <section class="kit-card pw-preview" *ngIf="ch.email">
        <p class="pw-cap">Vista previa del correo</p>
        <strong>SOGO · Tu contraseña fue restablecida</strong>
        <p>Hola {{ u.firstName.split(' ')[0] }}, el administrador restableció tu contraseña el {{ nowText }}.</p>
        <div class="pw-dots" aria-label="Contraseña oculta">• • • • • • • • • • • •</div>
        <small class="rp-muted">{{ mode === 'temp' ? 'La contraseña temporal solo se ve en el correo del usuario. Vence en ' + svc.policy.tempPasswordHours + ' h y deberás cambiarla al entrar.' : 'El administrador te entregará la contraseña por un canal seguro; deberás cambiarla al entrar.' }}</small>
      </section>
      <section class="kit-card pw-preview">
        <p class="pw-cap">Primer inicio de sesión del usuario</p>
        <strong>Crea tu nueva contraseña</strong>
        <div class="pw-fake">Nueva contraseña</div><div class="pw-fake">Confirmar contraseña</div>
        <div class="pw-fake pw-fake--btn">Guardar y entrar</div>
      </section>
    </aside>
  </div>
  `,
  styles: [`
    .pw-temp { font-size: 15px; letter-spacing: .04em; background: #fff; padding: 2px 8px; border-radius: 6px; user-select: all; }
    .pw-step { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 15px; color: #0A2540; }
    .pw-step b { width: 24px; height: 24px; border-radius: 50%; background: #0A2540; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
    .pw-user { display: flex; align-items: center; gap: 14px; border: 1px solid #E6EBF2; border-radius: 12px; padding: 12px 14px; }
    .pw-user .ur-user { flex: 1; }
    .pw-name { font-size: 15px !important; }
    .pw-link { border: none; background: none; color: #0B6FD0; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
    .pw-mt { margin-top: 12px; }
    .pw-toggle { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; color: #1F2937; }
    .pw-channels { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: #1F2937; }
    .pw-channels label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
    .pw-channels input { accent-color: #1565C0; width: 16px; height: 16px; }
    .pw-channels .off { color: #9AA5B4; }
    .pw-confirm { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; border: 2px solid #1565C0; }
    .pw-confirm > div { flex: 1; min-width: 240px; font-size: 13px; }
    .pw-confirm p { margin: 3px 0 0; font-size: 12px; }
    .pw-keep { display: flex; gap: 8px; align-items: center; margin: 7px 0; font-size: 12.5px; color: #1F2937; }
    .pw-keep svg { width: 16px; height: 16px; fill: none; stroke: #1F8A5B; stroke-width: 2; flex-shrink: 0; }
    .pw-preview { font-size: 12.5px; color: #1F2937; }
    .pw-preview p { margin: 6px 0; }
    .pw-cap { margin: -4px 0 10px !important; font-size: 11.5px; color: #6B7280; }
    .pw-dots { background: #EEF5FD; border-radius: 8px; padding: 10px; text-align: center; letter-spacing: 3px; margin: 8px 0; }
    .pw-fake { border: 1px solid #D5DEEA; border-radius: 8px; padding: 9px 10px; margin-top: 8px; color: #9AA5B4; font-size: 12px; }
    .pw-fake--btn { background: #1565C0; color: #fff; text-align: center; font-weight: 700; border: none; }
  `],
})
export class PasswordsComponent implements OnDestroy {
  readonly reasons = REASONS; readonly dmyTime = dmyTime;
  users: AppUser[] = [];
  roles: Role[] = [];
  resets: PasswordReset[] = [];
  uid = '';
  picking = false;
  mode: 'temp' | 'manual' = 'temp';
  pw = ''; pw2 = '';
  unlock = true;
  ch = { email: true, internal: true, sms: false };
  reason = ''; note = '';
  touched = false;
  done = '';
  /** Contraseña temporal recién generada (SOGO no tiene servidor de correo: se muestra una vez). */
  shownTemp = '';
  private sub: Subscription;

  constructor(public svc: UsersService, route: ActivatedRoute) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles()]).subscribe(([u, r]) => { this.users = u; this.roles = r; this.resets = svc.resets; });
    this.uid = route.snapshot.queryParamMap.get('u') ?? this.users.find(x => x.status === 'Bloqueado')?.id ?? '';
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get u(): AppUser | undefined { return this.users.find(x => x.id === this.uid); }
  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get rules() { return passwordRules(this.pw, this.svc.policy, this.u?.username, this.u?.docNumber); }
  get strength() { return passwordStrength(this.pw, this.svc.policy); }
  get nowText(): string { const n = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} a las ${p(n.getHours())}:${p(n.getMinutes())}`; }
  get problem(): string {
    if (!this.u) return 'Selecciona un usuario.';
    if (this.mode === 'manual' && this.rules.some(r => !r.ok)) return 'La contraseña no cumple la política de seguridad.';
    if (this.mode === 'manual' && this.pw !== this.pw2) return 'Las contraseñas no coinciden.';
    if (this.mode === 'temp' && !this.ch.email && !this.ch.sms) return 'Elige cómo le llega la contraseña temporal (correo o SMS).';
    if (!this.reason) return 'Selecciona el motivo.';
    return '';
  }

  name(u: AppUser): string { return fullName(u); }
  ini(u: AppUser): string { return initials(u); }
  color(u: AppUser): string { return avatarColor(u); }
  roleNames(u: AppUser): string { return u.roles.map(id => this.roles.find(r => r.id === id)?.name ?? id).join(', '); }
  changedText(r: PasswordReset): string {
    if (r.changedAt) return `Sí · ${when(r.changedAt)}`;
    if (r.expiresAt && r.expiresAt < stampOf(new Date())) return 'No · temporal vencida';
    return 'Pendiente';
  }
  changedBadge(r: PasswordReset): string { return r.changedAt ? 'rsv-badge--ok' : this.changedText(r).includes('vencida') ? 'rsv-badge--danger' : 'rsv-badge--warn'; }

  pick(id: string): void { this.uid = id; this.picking = false; this.done = ''; this.shownTemp = ''; this.unlock = true; }
  clear(): void { this.pw = this.pw2 = ''; this.reason = ''; this.note = ''; this.touched = false; }

  apply(): void {
    this.touched = true;
    if (this.problem || !this.u) return;
    const u = this.u;
    const channels = [this.ch.email && 'Correo', this.ch.internal && 'Mensaje interno', this.ch.sms && 'SMS'].filter((x): x is string => !!x);
    const r = this.svc.resetPassword(u.id, { mode: this.mode, password: this.pw, unlock: this.unlock, channels, reason: this.reason, note: this.note.trim() });
    this.resets = this.svc.resets;
    this.done = `Contraseña de ${u.username} restablecida${this.unlock && u.status === 'Bloqueado' ? ' y cuenta desbloqueada' : ''}. `
      + (r?.method === 'Temporal generada' ? `La temporal vence en ${this.svc.policy.tempPasswordHours} h.` : 'Entrégala por un canal seguro.');
    this.shownTemp = r?.tempPassword ?? '';
    this.clear();
  }
}
