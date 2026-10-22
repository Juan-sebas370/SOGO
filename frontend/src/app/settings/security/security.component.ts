import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService } from '../settings.service';
import { UsersService } from '../../users/users.service';
import { SecurityPolicy } from '../../users/users.model';
import { AuthService } from '../../auth.service';
import { metaText } from '../hotel/hotel.component';
import { stampOf } from '../../users/users-seed';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const LABELS: Partial<Record<keyof SecurityPolicy, string>> = {
  minLength: 'longitud mínima', requireCase: 'mayúsculas y minúsculas', requireNumber: 'número', requireSymbol: 'símbolo', expiryDays: 'vencimiento',
  history: 'contraseñas recordadas', maxAttempts: 'intentos', autoUnlockMinutes: 'desbloqueo automático', idleMinutes: 'inactividad',
  twoFactorAdmin: 'dos pasos', notifyNewIp: 'aviso de IP nueva', newAccountStatus: 'estado inicial', activationHours: 'enlace de activación',
  tempPasswordHours: 'contraseña temporal', sso: 'inicio de sesión externo',
};

@Component({
  selector: 'app-settings-security',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Seguridad y acceso</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Seguridad y acceso</h1><p class="kit-sub">Reglas de contraseñas, bloqueo de cuentas, sesiones y activación de usuarios.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || !canEdit" (click)="confirming = true; pw = ''; pwError = ''">Guardar cambios</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error">{{ error }}</p>

  <div class="cf-grid">
    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Política de contraseñas</h2>
        <div class="cf-row"><div><strong>Longitud mínima</strong><small>Número mínimo de caracteres.</small></div>
          <span class="cf-unit"><input type="number" min="8" max="32" [(ngModel)]="p.minLength"><span>caract.</span></span></div>
        <div class="cf-row"><div><strong>Exigir mayúsculas y minúsculas</strong></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.requireCase"><i></i></label></div>
        <div class="cf-row"><div><strong>Exigir al menos un número</strong></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.requireNumber"><i></i></label></div>
        <div class="cf-row"><div><strong>Exigir un símbolo (!&#64;#…)</strong></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.requireSymbol"><i></i></label></div>
        <div class="cf-row"><div><strong>Vencimiento de la contraseña</strong><small>Se pide cambiarla después de este tiempo.</small></div>
          <select class="rsv-input" [(ngModel)]="p.expiryDays"><option [ngValue]="0">Nunca</option><option [ngValue]="30">Cada 30 días</option><option [ngValue]="60">Cada 60 días</option><option [ngValue]="90">Cada 90 días</option><option [ngValue]="180">Cada 180 días</option></select></div>
        <div class="cf-row"><div><strong>No repetir contraseñas anteriores</strong><small>Cantidad de contraseñas recordadas.</small></div>
          <span class="cf-unit"><input type="number" min="0" max="24" [(ngModel)]="p.history"><span>últimas</span></span></div>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Bloqueo y sesiones</h2>
        <div class="cf-row"><div><strong>Intentos fallidos antes de bloquear</strong><small>La cuenta pasa a «Bloqueado» y se avisa al administrador.</small></div>
          <span class="cf-unit"><input type="number" min="3" max="10" [(ngModel)]="p.maxAttempts"><span>intentos</span></span></div>
        <div class="cf-row"><div><strong>Desbloqueo automático</strong><small>Si está apagado, solo el administrador desbloquea.</small></div>
          <select class="rsv-input" [(ngModel)]="p.autoUnlockMinutes"><option [ngValue]="0">Apagado</option><option [ngValue]="15">Después de 15 min</option><option [ngValue]="30">Después de 30 min</option><option [ngValue]="60">Después de 1 hora</option><option [ngValue]="1440">Después de 24 horas</option></select></div>
        <div class="cf-row"><div><strong>Cerrar sesión por inactividad</strong></div>
          <select class="rsv-input" [(ngModel)]="p.idleMinutes"><option [ngValue]="0">Nunca</option><option [ngValue]="5">5 minutos</option><option [ngValue]="15">15 minutos</option><option [ngValue]="30">30 minutos</option><option [ngValue]="60">1 hora</option></select></div>
        <div class="cf-row"><div><strong>Verificación en dos pasos para Administrador</strong><small>Código por correo o app autenticadora. Requiere el servidor de autenticación.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.twoFactorAdmin"><i></i></label></div>
        <div class="cf-row"><div><strong>Avisar inicios de sesión desde una IP nueva</strong></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.notifyNewIp"><i></i></label></div>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Cuentas nuevas</h2>
        <div class="cf-row"><div><strong>Estado inicial de las cuentas nuevas</strong><small>Se aplica en <a routerLink="/dashboard/users/new">«Registrar usuario»</a>.</small></div>
          <select class="rsv-input" [(ngModel)]="p.newAccountStatus"><option value="Pendiente">Pendiente de activación</option><option value="Activo">Activa</option></select></div>
        <div class="cf-row"><div><strong>Vigencia del enlace de activación</strong></div>
          <span class="cf-unit"><input type="number" min="1" max="168" [(ngModel)]="p.activationHours"><span>horas</span></span></div>
        <div class="cf-row"><div><strong>Vigencia de la contraseña temporal</strong><small>Al <a routerLink="/dashboard/users/passwords">restablecer contraseñas</a>.</small></div>
          <span class="cf-unit"><input type="number" min="1" max="72" [(ngModel)]="p.tempPasswordHours"><span>horas</span></span></div>
      </section>
    </div>

    <aside class="cf-col">
      <section class="kit-card">
        <div class="cf-card-head"><h2 class="kit-card-title">Inicio de sesión externo</h2>
          <span class="rsv-badge" [ngClass]="p.sso.provider === 'Ninguno' ? 'rsv-badge--muted' : 'rsv-badge--warn'">{{ p.sso.provider === 'Ninguno' ? 'No configurado' : 'Sin probar' }}</span></div>
        <p class="cf-note">Permite entrar con la cuenta de la empresa (SSO) o un directorio LDAP.</p>
        <label class="cf-field sc-mt">Proveedor<select class="rsv-input" [(ngModel)]="p.sso.provider">
          <option>Ninguno</option><option>Microsoft Entra ID</option><option>Google Workspace</option><option>LDAP</option></select></label>
        <label class="cf-field sc-mt">Servidor / URL<input class="rsv-input" [(ngModel)]="p.sso.url" [disabled]="p.sso.provider === 'Ninguno'" placeholder="ldap:// o https://"></label>
        <button type="button" class="rsv-btn rsv-btn--outline sc-full" [disabled]="p.sso.provider === 'Ninguno' || !p.sso.url.trim()" (click)="testSso()">Probar conexión</button>
        <p class="cf-note" *ngIf="ssoMsg">{{ ssoMsg }}</p>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Vista previa de la política</h2>
        <div class="cf-preview">
          <p class="cf-check" *ngFor="let l of preview"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>{{ l }}</p>
        </div>
      </section>
      <p class="kit-banner kit-banner--warn">Los cambios de seguridad aplican a todos los usuarios desde ya (contraseñas nuevas, bloqueos y sesiones). Se pedirá tu contraseña para confirmarlos y quedarán en auditoría.</p>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="confirming" (click)="confirming = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="sec-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="sec-title">Confirma con tu contraseña</h2>
      <p class="rsv-modal-desc">Cambios: {{ changes.join(', ') }}. Se verifica con el servidor de inicio de sesión.</p>
      <label class="kit-field">Contraseña de {{ username }}<input class="rsv-input" type="password" [(ngModel)]="pw" autocomplete="current-password" (keydown.enter)="confirm()"></label>
      <p class="kit-error" *ngIf="pwError">{{ pwError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirming = false">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!pw || checking" (click)="confirm()">{{ checking ? 'Verificando…' : 'Confirmar y guardar' }}</button>
      </div>
    </div>
  </div>
  `,
  styles: [`.sc-mt { margin-top: 10px; } .sc-full { width: 100%; margin-top: 12px; }`],
})
export class SecurityComponent {
  p: SecurityPolicy;
  private base: SecurityPolicy;
  confirming = false; checking = false;
  pw = ''; pwError = ''; saved = ''; ssoMsg = '';

  constructor(private settings: SettingsService, private users: UsersService, private auth: AuthService) {
    this.base = clone(users.policy);
    this.p = clone(users.policy);
  }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.security); }
  get dirty(): boolean { return JSON.stringify(this.p) !== JSON.stringify(this.base); }
  get username(): string { return localStorage.getItem('sogo_username') || this.users.actor(); }
  get changes(): string[] { return (Object.keys(this.p) as (keyof SecurityPolicy)[]).filter(k => JSON.stringify(this.p[k]) !== JSON.stringify(this.base[k])).map(k => LABELS[k] ?? k); }
  get error(): string {
    const p = this.p, int = (v: number, a: number, b: number) => Number.isInteger(+v) && +v >= a && +v <= b;
    if (!int(p.minLength, 8, 32)) return 'La longitud mínima debe estar entre 8 y 32 caracteres.';
    if (!int(p.history, 0, 24)) return 'Las contraseñas recordadas deben estar entre 0 y 24.';
    if (!int(p.maxAttempts, 3, 10)) return 'Los intentos fallidos deben estar entre 3 y 10.';
    if (!int(p.activationHours, 1, 168)) return 'El enlace de activación debe durar entre 1 y 168 horas.';
    if (!int(p.tempPasswordHours, 1, 72)) return 'La contraseña temporal debe durar entre 1 y 72 horas.';
    return '';
  }
  get preview(): string[] {
    const p = this.p;
    const req = [p.requireCase && 'mayúscula, minúscula', p.requireNumber && 'número', p.requireSymbol && 'símbolo'].filter(Boolean).join(', ');
    return [
      `Mínimo ${p.minLength} caracteres`, req ? `Debe incluir ${req}` : 'Sin requisitos de tipos de caracteres',
      p.expiryDays ? `Vence cada ${p.expiryDays} días` : 'No vence',
      `Bloqueo tras ${p.maxAttempts} intentos${p.autoUnlockMinutes ? ` · se desbloquea a los ${p.autoUnlockMinutes >= 60 ? p.autoUnlockMinutes / 60 + ' h' : p.autoUnlockMinutes + ' min'}` : ' · solo el administrador desbloquea'}`,
      p.idleMinutes ? `La sesión se cierra a los ${p.idleMinutes} min sin uso` : 'La sesión no se cierra por inactividad',
    ];
  }

  discard(): void { this.p = clone(this.base); }

  testSso(): void {
    this.ssoMsg = `No se pudo conectar con ${this.p.sso.provider}: el servidor de SOGO aún no tiene el conector de ${this.p.sso.provider === 'LDAP' ? 'LDAP' : 'SSO'}. La configuración se guarda, pero el inicio de sesión sigue siendo con usuario y contraseña.`;
  }

  /** Verifica la contraseña del administrador contra el servidor antes de aplicar. */
  confirm(): void {
    if (!this.pw || this.checking) return;
    this.checking = true; this.pwError = '';
    this.auth.login(this.username, this.pw).subscribe({
      next: () => { this.checking = false; this.apply(); },
      error: (e) => {
        this.checking = false;
        this.pwError = e.status === 401 ? 'Contraseña incorrecta.' : 'No se pudo verificar la contraseña con el servidor. Revisa la conexión e inténtalo de nuevo.';
        if (e.status === 401) this.users.addLog('Configuración: cambio de seguridad rechazado', 'Contraseña incorrecta', { result: 'Denegado' });
      },
    });
  }

  private apply(): void {
    const changes = this.changes;
    if (this.p.autoUnlockMinutes !== this.base.autoUnlockMinutes) this.users.autoUnlockSince = stampOf(new Date());
    this.users.policy = { ...clone(this.p), minLength: +this.p.minLength, history: +this.p.history, maxAttempts: +this.p.maxAttempts,
      activationHours: +this.p.activationHours, tempPasswordHours: +this.p.tempPasswordHours };
    this.base = clone(this.users.policy);
    this.p = clone(this.users.policy);
    this.settings.touch('security', `Cambios: ${changes.join(', ')}`);
    this.confirming = false;
    this.saved = 'Política de seguridad actualizada. Ya aplica en contraseñas nuevas, bloqueos y cierre de sesión.';
  }
}
