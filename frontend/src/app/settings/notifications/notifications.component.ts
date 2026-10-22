import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService, AlertRule } from '../settings.service';
import { MailService, MailStatus, AlertMailLog } from '../../shared/mail.service';
import { serverMessage } from '../../shared/toast/notify.interceptor';
import { UsersService } from '../../users/users.service';
import { ScheduleService } from '../../reports/schedule.service';
import { failed } from '../../reports/schedule.model';
import { EMAIL_RE } from '../../billing/invoice.model';
import { metaText } from '../hotel/hotel.component';
import { stampOf } from '../../users/users-seed';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Notificaciones y correo</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Notificaciones y correo</h1><p class="kit-sub">Qué alertas se envían, por qué canal y a quién · estado del correo de SOGO.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || !canEdit || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error">{{ error }}</p>

  <div class="cf-grid">
    <section class="kit-card">
      <h2 class="kit-card-title">Alertas del sistema</h2>
      <div class="kit-table-wrap">
        <table class="kit-table cf-table">
          <thead><tr><th>Alerta</th><th>Módulo</th><th class="c">En SOGO</th><th class="c">Correo</th><th>Destinatarios</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rules" [class.off]="!r.inApp && !r.email">
              <td><strong>{{ r.label }}</strong></td><td class="rp-muted">{{ r.module }}</td>
              <td class="c"><label class="kit-toggle"><input type="checkbox" [(ngModel)]="r.inApp" [attr.aria-label]="r.label + ' en SOGO'"><i></i></label></td>
              <td class="c"><label class="kit-toggle"><input type="checkbox" [(ngModel)]="r.email" [attr.aria-label]="r.label + ' por correo'"><i></i></label></td>
              <td>
                <span class="nt-chip" *ngFor="let d of r.recipients" [class.bad]="!validRecipient(d)">{{ short(d) }}<button type="button" (click)="remove(r, d)" [attr.aria-label]="'Quitar ' + d">×</button></span>
                <select class="rsv-input nt-add" (change)="addRole(r, $any($event.target).value); $any($event.target).value = ''" [attr.aria-label]="'Agregar destinatario a ' + r.label">
                  <option value="">+ Agregar</option><option *ngFor="let n of roleNames" [value]="n" [disabled]="r.recipients.includes(n)">{{ n }}</option><option value="__email">Otro correo…</option></select>
                <span class="nt-mail" *ngIf="emailFor === r.key"><input class="rsv-input" [(ngModel)]="emailText" placeholder="correo@dominio.com" (keydown.enter)="addEmail(r)"><button type="button" class="rsv-btn rsv-btn--outline" (click)="addEmail(r)">Agregar</button></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cf-note">«En SOGO» controla qué avisos aparecen en la campana. Un rol como destinatario llega a todos los usuarios activos con ese rol que tengan correo.</p>
      <p class="cf-note">«Correo»: el servidor revisa las alertas cada 5 minutos (aunque nadie tenga SOGO abierto) y avisa una sola vez cada novedad.
        Llegadas y salidas, TRA pendientes y el resumen de ocupación se envían una vez al día desde las {{ dailyAt }}. Nuevas reservas, cuentas, reportes y respaldos fallidos
        cuentan desde que se activa su correo.</p>
      <p class="kit-banner kit-banner--warn nt-note" *ngIf="mail && !mail.configured">Las alertas por correo no salen mientras el correo de SOGO no esté configurado (ver a la derecha).</p>
    </section>

    <section class="kit-card nt-history">
      <div class="cf-card-head"><h2 class="kit-card-title">Avisos enviados por correo</h2>
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="checking || !mail?.configured || !canEdit || dirty" (click)="checkNow()"
          [title]="dirty ? 'Guarda los cambios antes de revisar' : ''">{{ checking ? 'Revisando…' : 'Revisar ahora' }}</button></div>
      <div class="kit-table-wrap">
        <table class="kit-table cf-table">
          <thead><tr><th>Fecha</th><th>Alerta</th><th>Detalle</th><th>Enviado a</th></tr></thead>
          <tbody>
            <tr *ngFor="let h of history">
              <td class="nt-when">{{ when(h.at) }}</td>
              <td><strong>{{ h.label }}</strong><small class="rp-muted" *ngIf="h.count > 1"> · {{ h.count }} novedades</small></td>
              <td class="rp-muted">{{ h.summary }}</td>
              <td><span class="nt-to" *ngFor="let t of h.sentTo">{{ t }}</span>
                <span class="nt-to bad" *ngFor="let f of h.failed" [title]="f">{{ f.split(':')[0] }} · no llegó</span></td>
            </tr>
            <tr *ngIf="!history.length"><td colspan="4" class="kit-empty">{{ historyError || 'Todavía no se ha enviado ninguna alerta por correo.' }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="cf-col">
      <section class="kit-card">
        <div class="cf-card-head"><h2 class="kit-card-title">Correo de SOGO</h2>
          <span class="rsv-badge" [ngClass]="mail?.configured ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ !mail ? 'Consultando…' : mail.configured ? 'Listo para enviar' : 'Sin configurar' }}</span></div>
        <ng-container *ngIf="mail">
          <dl class="nt-mail-info">
            <div><dt>Cuenta</dt><dd>{{ mail.account || '—' }}</dd></div>
            <div><dt>Servidor</dt><dd>{{ mail.host || '—' }}</dd></div>
            <div><dt>Remitente</dt><dd>{{ mail.sender }}</dd></div>
          </dl>
          <p class="kit-banner kit-banner--warn" *ngIf="mail.missing">{{ mail.missing }}.</p>
          <p class="kit-banner kit-banner--danger" *ngIf="mail.lastError && !mail.missing">Último envío fallido: {{ mail.lastError }}.</p>
        </ng-container>
        <label class="cf-field nt-mt">Enviar prueba a<input class="rsv-input" type="email" [(ngModel)]="testTo" maxlength="120"></label>
        <button type="button" class="rsv-btn rsv-btn--outline nt-full" [disabled]="testing || !mail?.configured || !canEdit || !validEmail(testTo)" (click)="test()">
          {{ testing ? 'Enviando…' : 'Enviar correo de prueba' }}</button>
        <p class="kit-banner" [ngClass]="testOk ? 'kit-banner--ok' : 'kit-banner--danger'" *ngIf="testMsg">{{ testMsg }}</p>
        <p class="cf-note">SOGO envía con la cuenta de Gmail del hospedaje (facturas, recuperación de contraseña y avisos). La cuenta y su contraseña de aplicación están en el servidor, en <code>backend/correo.local.properties</code>; el nombre del remitente sale de Datos del hospedaje.</p>
      </section>
      <p class="kit-banner kit-banner--danger" *ngFor="let b of bounces">
        <span><strong>{{ b.count }} correo{{ b.count === 1 ? '' : 's' }} rebotado{{ b.count === 1 ? '' : 's' }} {{ b.when }}:</strong> {{ b.text }}. Revisa la dirección en <a routerLink="/dashboard/reports/scheduled">Reportes programados</a>.</span></p>
    </aside>
  </div>
  `,
  styles: [`
    .nt-chip { display: inline-flex; align-items: center; gap: 4px; background: #EEF2F7; color: #374151; border-radius: 999px; padding: 3px 4px 3px 9px; font-size: 11px; font-weight: 600; margin: 2px 4px 2px 0; }
    .nt-chip.bad { background: #FDECEA; color: #B42318; }
    .nt-chip button { border: none; background: none; cursor: pointer; color: inherit; font-size: 12px; padding: 0 3px; }
    .nt-add { width: auto; height: 26px; font-size: 11px; padding: 0 6px; }
    .nt-mail { display: inline-flex; gap: 4px; margin-top: 4px; }
    .nt-mail input { height: 30px; width: 170px; }
    .nt-mail .rsv-btn { height: 30px; padding: 0 10px; font-size: 12px; }
    .nt-mt { margin-top: 10px; }
    .nt-note { margin: 10px 0 0; font-size: 12px; }
    .nt-full { width: 100%; margin: 12px 0 8px; }
    .nt-mail-info { margin: 0 0 10px; }
    .nt-mail-info div { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid #EEF1F5; font-size: 12.5px; }
    .nt-mail-info dt { color: #6B7280; }
    .nt-history { grid-column: 1; }
    @media (min-width: 1101px) { .cf-col { grid-column: 2; grid-row: 1 / span 2; } }
    .nt-when { white-space: nowrap; }
    .nt-to { display: inline-block; background: #EEF2F7; border-radius: 999px; padding: 2px 8px; font-size: 11px; margin: 2px 4px 2px 0; }
    .nt-to.bad { background: #FDECEA; color: #B42318; }
    .nt-mail-info dd { margin: 0; font-weight: 600; color: #0A2540; overflow-wrap: anywhere; text-align: right; }
  `],
})
export class NotificationsComponent {
  rules: AlertRule[];
  private base = '';
  emailFor = ''; emailText = '';
  testMsg = ''; testOk = false; saved = '';
  mail?: MailStatus;
  saving = false;
  testTo = '';
  testing = false;
  history: AlertMailLog[] = [];
  historyError = '';
  dailyAt = '07:00';
  checking = false;

  constructor(private settings: SettingsService, private users: UsersService, private schedules: ScheduleService, private mailer: MailService) {
    this.rules = clone(settings.alertRules);
    this.base = this.snapshot();
    this.testTo = this.users.sessionUser()?.email || localStorage.getItem('sogo_email') || '';
    this.refreshMail();
    this.loadHistory();
  }

  private loadHistory(): void {
    this.mailer.alertHistory()
      .then(h => { this.history = h.log ?? []; this.dailyAt = h.dailyAt || this.dailyAt; this.historyError = ''; })
      .catch(() => this.historyError = 'No se pudo consultar el historial de avisos.');
  }

  when(at: string): string { return `${at.slice(8, 10)}/${at.slice(5, 7)} ${at.slice(11, 16)}`; }

  /** Revisa ya en el servidor y envía lo pendiente (sin esperar los 5 minutos). */
  async checkNow(): Promise<void> {
    this.checking = true;
    const before = this.history[0]?.at + '|' + this.history.length;
    try {
      const h = await this.mailer.checkAlerts();
      this.history = h.log ?? [];
      const now = this.history[0]?.at + '|' + this.history.length;
      this.saved = now === before ? 'Revisión hecha: no había alertas nuevas por avisar.' : 'Revisión hecha: se enviaron las alertas nuevas (ver «Avisos enviados por correo»).';
    } catch { /* el aviso de error lo muestra el interceptor */ } finally { this.checking = false; this.refreshMail(); }
  }

  private refreshMail(): void {
    this.mailer.status().then(m => this.mail = m).catch(() => this.mail = { configured: false, account: '', host: '', sender: '', missing: 'No se pudo consultar el estado del correo en el servidor', lastError: '' });
  }

  private snapshot(): string { return JSON.stringify({ r: this.rules }); }
  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.notifications); }
  get dirty(): boolean { return this.snapshot() !== this.base; }
  get roleNames(): string[] { return this.users.rolesSnapshot().map(r => r.name); }
  get error(): string {
    const bad = this.rules.flatMap(r => r.recipients.filter(d => !this.validRecipient(d)).map(d => `${d} (${r.label})`));
    if (bad.length) return `Destinatarios no válidos: ${bad.join(', ')}.`;
    const noOne = this.rules.find(r => r.email && !r.recipients.length);
    if (noOne) return `«${noOne.label}» se envía por correo pero no tiene destinatarios.`;
    return '';
  }
  get bounces(): { count: number; when: string; text: string }[] {
    const today = stampOf(new Date()).slice(0, 10);
    const open = this.schedules.openFailures();
    if (!open.length) return [];
    const items = open.flatMap(e => failed(e).map(d => `${d.email} (${d.reason}) · reporte «${e.name}»`));
    return [{ count: items.length, when: open.every(e => e.at.startsWith(today)) ? 'hoy' : 'sin resolver', text: items.join('; ') }];
  }

  validRecipient(d: string): boolean { return this.roleNames.includes(d) || EMAIL_RE.test(d); }
  short(d: string): string { return d.endsWith('@sogo.com') ? d.split('@')[0] + '@' : d; }
  remove(r: AlertRule, d: string): void { r.recipients = r.recipients.filter(x => x !== d); }
  addRole(r: AlertRule, v: string): void {
    if (!v) return;
    if (v === '__email') { this.emailFor = r.key; this.emailText = ''; return; }
    if (!r.recipients.includes(v)) r.recipients = [...r.recipients, v];
  }
  addEmail(r: AlertRule): void {
    const e = this.emailText.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return;
    if (!r.recipients.includes(e)) r.recipients = [...r.recipients, e];
    this.emailFor = ''; this.emailText = '';
  }

  discard(): void { const b = JSON.parse(this.base); this.rules = b.r; this.testMsg = ''; }

  validEmail(e: string): boolean { return EMAIL_RE.test(e.trim()); }

  /** Correo real de prueba: lo envía el servidor con la cuenta de Gmail del hospedaje. */
  async test(): Promise<void> {
    const to = this.testTo.trim();
    this.testing = true;
    this.testMsg = '';
    try {
      await this.mailer.test(to);
      this.testOk = true;
      this.testMsg = `Correo de prueba enviado a ${to}. Revisa la bandeja de entrada (y la carpeta de spam).`;
      this.users.addLog('Configuración: correo de prueba', `Enviado a ${to}`);
    } catch (e) {
      this.testOk = false;
      this.testMsg = serverMessage(e);
    } finally {
      this.testing = false;
      this.refreshMail();
    }
  }

  save(): void {
    if (this.error || !this.canEdit) return;
    const before: AlertRule[] = JSON.parse(this.base).r;
    const changed = this.rules.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i])).map(r => r.label);
    this.saving = true;
    this.settings.saveNotifications(this.rules, changed.length ? `alertas: ${changed.join(', ')}` : 'Sin cambios')
      .then(() => {
        this.base = this.snapshot();
        this.saved = 'Notificaciones guardadas. La campana muestra solo las alertas activas «En SOGO» y el servidor envía por correo las que tienen «Correo» activo.';
      })
      .catch(() => this.saved = '')
      .finally(() => this.saving = false);
  }
}
