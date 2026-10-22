import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { ScheduleService } from '../schedule.service';
import { serverMessage } from '../../shared/toast/notify.interceptor';
import {
  Schedule, Execution, ReportKind, Frequency, ReportFormat, REPORT_KINDS, SENSITIVE, COVERAGE, WEEKDAYS, FORMAT_LABEL, nextRun, frequencyLabel, failed, succeeded, stamp, dayMonth,
} from '../schedule.model';
import { MailService } from '../../shared/mail.service';
import { EMAIL_RE } from '../reports.model';

type Draft = Omit<Schedule, 'id' | 'createdBy' | 'createdAt' | 'pausedAt'>;

const HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

@Component({
  selector: 'app-reports-scheduled',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Reportes programados</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reportes automáticos</h1>
      <p class="kit-sub">Programa qué reporte se envía, a quién y cuándo. Las programaciones se guardan en la base de datos.</p>
    </div>
    <div class="kit-actions"><button type="button" class="rsv-btn rsv-btn--primary" *ngIf="canSchedule" (click)="openNew()">+ Programar reporte</button></div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngFor="let f of openFailures">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>
    <div><strong>{{ failedCount(f) }} envío{{ failedCount(f) === 1 ? '' : 's' }} falló {{ when(f.at) }} a las {{ f.at.slice(11, 16) }}: «{{ f.name }}» no llegó a {{ failedList(f) }}.</strong>
      {{ f.deliveries.length > failedCount(f) ? 'Los demás destinatarios sí lo recibieron.' : '' }} Si corriges el correo en la programación, el reintento va al corregido.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="canSchedule" [disabled]="retrying || !!mailMissing" (click)="retry(f)">{{ retrying ? 'Enviando…' : 'Reintentar envío' }}</button>
  </div>
  <p class="kit-banner kit-banner--warn" *ngIf="retryMsg">{{ retryMsg }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="mailMissing">Los reportes no se pueden enviar: {{ mailMissing }} Configúralo en Configuración › Notificaciones.</p>
  <p class="kit-banner kit-banner--warn" *ngIf="!mailMissing && svc.autoStatus">{{ svc.autoStatus }}</p>
  <p class="kit-banner sc-how">Cómo se envían: SOGO arma el reporte con los mismos datos de Reportes y el servidor lo envía por correo a la hora programada,
    mientras SOGO esté abierto en algún equipo con la sesión de alguien que puede programar reportes. Si a esa hora estaba cerrado, se envía apenas se abra (hasta 7 días después) y el historial muestra la hora real.</p>
  <p class="kit-banner kit-banner--danger" *ngIf="saveError">{{ saveError }}</p>

  <div class="sc-layout" [class.with-form]="formOpen">
    <div>
      <section class="kit-kpis rp-kpis">
        <div class="rp-kpi"><span>Programados</span><strong>{{ schedules.length }}</strong><small>{{ activeCount }} activo{{ activeCount === 1 ? '' : 's' }} · {{ schedules.length - activeCount }} pausado{{ schedules.length - activeCount === 1 ? '' : 's' }}</small></div>
        <div class="rp-kpi"><span>Envíos este mes</span><strong>{{ monthRuns.length }}</strong><small>{{ monthOk }} exitosos</small></div>
        <div class="rp-kpi"><span>Próximo envío</span><strong>{{ nextLabel }}</strong><small>{{ nextName }}</small></div>
        <div class="rp-kpi" [class.rp-kpi--alert]="openFailures.length"><span>Fallidos</span><strong>{{ openFailures.length }}</strong><small>{{ openFailures.length ? 'Sin resolver · ' + when(openFailures[0].at) + ' ' + openFailures[0].at.slice(11, 16) : 'Todo entregado' }}</small></div>
      </section>

      <section class="kit-card sc-mb">
        <h2 class="kit-card-title">Reportes programados</h2>
        <div class="kit-table-wrap">
          <table class="kit-table rp-table">
            <thead><tr><th>Reporte</th><th>Frecuencia</th><th>Próximo envío</th><th>Destinatarios</th><th>Formato</th><th>Activo</th></tr></thead>
            <tbody>
              <tr *ngFor="let s of schedules" [class.rp-void]="!s.active" [class.sc-selected]="editingId === s.id">
                <td><button type="button" class="sc-name" (click)="edit(s)" [disabled]="!canSchedule"><strong>{{ s.name }}</strong></button>
                  <small class="sc-kind">{{ s.report }} <span class="rsv-badge rsv-badge--danger sc-sens" *ngIf="sensitive(s.report)">Sensible</span></small></td>
                <td>{{ freq(s) }}</td>
                <td><strong>{{ s.active ? nextOf(s) : '—' }}</strong></td>
                <td class="rp-muted">{{ shortList(s.recipients) }}</td>
                <td>{{ formatLabel(s.format) }}</td>
                <td><label class="kit-toggle"><input type="checkbox" [checked]="s.active" [disabled]="!canSchedule" (change)="toggle(s)" [attr.aria-label]="'Activar ' + s.name"><i></i></label></td>
              </tr>
              <tr *ngIf="!schedules.length"><td colspan="6" class="kit-empty">No hay reportes programados.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="kit-card">
        <div class="rp-card-head"><h2 class="kit-card-title">Historial de ejecuciones</h2><span class="rp-muted">Últimos 7 días · guardado en la base y en auditoría</span></div>
        <div class="kit-table-wrap">
          <table class="kit-table rp-table">
            <thead><tr><th>Fecha</th><th>Reporte</th><th>Período</th><th class="r">Destinatarios</th><th>Resultado</th><th>Detalle</th><th>Enviado por</th></tr></thead>
            <tbody>
              <tr *ngFor="let e of recent">
                <td>{{ dayMonth(e.at) }} {{ e.at.slice(11, 16) }}</td>
                <td>{{ e.name }}</td><td>{{ e.period }}</td><td class="r">{{ e.deliveries.length }}</td>
                <td><span class="rsv-badge" [ngClass]="ok(e) ? (e.test ? 'rsv-badge--info' : 'rsv-badge--ok') : 'rsv-badge--danger'">{{ result(e) }}</span></td>
                <td class="rp-muted">{{ detail(e) }}</td>
                <td class="rp-muted">{{ e.by || '—' }}</td>
              </tr>
              <tr *ngIf="!recent.length"><td colspan="7" class="kit-empty">Sin envíos en los últimos 7 días.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="kit-card sc-form" *ngIf="formOpen" aria-label="Programar reporte">
      <div class="rp-card-head"><h2 class="kit-card-title">{{ editingId ? 'Editar programación' : 'Programar reporte' }}</h2><button type="button" class="sc-x" (click)="close()" aria-label="Cerrar">×</button></div>
      <label class="kit-field">Nombre *<input class="rsv-input" [(ngModel)]="d.name" maxlength="80" [class.invalid]="touched && !d.name.trim()"></label>
      <label class="kit-field">Reporte *<select class="rsv-input" [(ngModel)]="d.report" (ngModelChange)="onReport()"><option *ngFor="let k of kinds">{{ k }}</option></select></label>
      <p class="sc-label">Frecuencia *</p>
      <div class="kit-chips"><button type="button" class="kit-chip" *ngFor="let f of frequencies" [class.active]="d.frequency === f" (click)="setFrequency(f)">{{ f }}</button></div>
      <div class="sc-two">
        <label class="kit-field" *ngIf="d.frequency === 'Semanal'">Día<select class="rsv-input" [(ngModel)]="d.weekday"><option *ngFor="let w of weekdays; let i = index" [ngValue]="i">{{ w }}</option></select></label>
        <label class="kit-field" *ngIf="d.frequency === 'Mensual'">Día del mes<select class="rsv-input" [(ngModel)]="d.monthDay"><option *ngFor="let n of monthDays" [ngValue]="n">{{ n }}</option></select></label>
        <label class="kit-field">Hora<select class="rsv-input" [(ngModel)]="d.time"><option *ngFor="let h of hours">{{ h }}</option></select></label>
      </div>
      <label class="kit-field">Período que cubre<select class="rsv-input" [(ngModel)]="d.coverage"><option *ngFor="let c of coverage[d.frequency]">{{ c }}</option></select></label>
      <p class="sc-label">Formato</p>
      <div class="kit-chips"><button type="button" class="kit-chip" *ngFor="let f of formats" [class.active]="d.format === f" (click)="d.format = f">{{ formatLabel(f) }}</button></div>
      <p class="sc-hint">{{ d.format === 'CSV' ? 'Resumen en el correo y el detalle en un archivo .csv que se abre en Excel.' : 'El reporte completo en el correo y adjunto en un archivo .html con el membrete, para imprimir o guardar como PDF.' }}</p>
      <p class="sc-label">Destinatarios *</p>
      <div class="sc-emails" [class.invalid]="touched && errors.length" (click)="focusEmail()">
        <span class="sc-email" *ngFor="let e of d.recipients" [class.bad]="!valid(e)">{{ e }}<button type="button" (click)="removeEmail(e)" [attr.aria-label]="'Quitar ' + e">×</button></span>
        <input id="sc-email" [(ngModel)]="emailInput" (keydown)="onEmailKey($event)" (blur)="addEmail()" [placeholder]="d.recipients.length ? '' : 'correo@dominio.com'" aria-label="Agregar destinatario">
      </div>
      <p class="kit-error sc-err" *ngFor="let e of (touched ? errors : [])">{{ e }}</p>
      <label class="kit-field">Asunto<input class="rsv-input" [(ngModel)]="d.subject" maxlength="120"></label>
      <label class="sc-notify"><span class="kit-toggle"><input type="checkbox" [(ngModel)]="d.notifyOnFail"><i></i></span> Avisarme si un envío falla</label>
      <p class="sc-info">Primer envío: <strong>{{ firstRun }}</strong>. Los reportes de nómina y contables solo pueden enviarse a usuarios con permiso.
        Variables del asunto: {{ '{' }}reporte{{ '}' }} y {{ '{' }}fecha{{ '}' }} (período que cubre).</p>
      <p class="kit-banner kit-banner--warn" *ngIf="!svc.canBuild(d.report)">Tu rol no ve todos los módulos de este reporte: la prueba no se puede armar desde tu sesión.</p>
      <p class="kit-banner" [ngClass]="testOk ? 'kit-banner--ok' : 'kit-banner--danger'" *ngIf="testMsg">{{ testMsg }}</p>
      <div class="sc-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!d.recipients.length || testing || !!mailMissing || !svc.canBuild(d.report)" (click)="test()">{{ testing ? 'Enviando…' : 'Enviar prueba' }}</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!!errors.length || !d.name.trim()" (click)="save()">Guardar</button>
      </div>
      <button type="button" class="rsv-btn rsv-btn--danger-outline sc-del" *ngIf="editingId" (click)="confirmDelete = true">Eliminar programación</button>
      <div class="sc-confirm" *ngIf="confirmDelete">
        <p>¿Eliminar «{{ d.name }}»? El historial de envíos se conserva.</p>
        <div class="sc-actions"><button type="button" class="rsv-btn rsv-btn--outline" (click)="confirmDelete = false">Cancelar</button><button type="button" class="rsv-btn rsv-btn--danger" (click)="remove()">Eliminar</button></div>
      </div>
    </aside>
  </div>
  `,
  styles: [`
    .kit-banner .rsv-btn { flex-shrink: 0; background: #fff; }
    .sc-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
    .sc-layout.with-form { grid-template-columns: minmax(0, 1fr) 320px; }
    .sc-mb { margin-bottom: 18px; }
    .sc-name { border: none; background: none; padding: 0; font: inherit; text-align: left; cursor: pointer; color: #0A2540; }
    .sc-name:hover:not(:disabled) strong { text-decoration: underline; }
    .sc-name:disabled { cursor: default; }
    .sc-kind { display: block; font-size: 11.5px; color: #6B7280; margin-top: 2px; }
    .sc-sens { font-size: 10px; padding: 1px 6px; margin-left: 4px; }
    tr.sc-selected td { background: #F2F7FD; }
    .sc-form { position: sticky; top: 100px; border: 2px solid #1565C0; display: flex; flex-direction: column; gap: 10px; }
    .sc-form .kit-field { margin: 0; }
    .sc-x { border: none; background: none; font-size: 20px; color: #6B7280; cursor: pointer; line-height: 1; }
    .sc-label { margin: 2px 0 -2px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .sc-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .sc-emails { display: flex; flex-wrap: wrap; gap: 6px; min-height: 46px; padding: 8px; border: 1px solid #D5DEEA; border-radius: 10px; cursor: text; }
    .sc-emails.invalid { border-color: #D9534F; background: #FFF8F7; }
    .sc-emails input { flex: 1; min-width: 120px; border: none; outline: none; background: transparent; font: inherit; font-size: 13px; }
    .sc-email { display: inline-flex; align-items: center; gap: 5px; background: #EEF2F7; border-radius: 999px; padding: 4px 6px 4px 10px; font-size: 12px; color: #1F2937; }
    .sc-email.bad { background: #FDECEA; color: #B42318; border: 1px solid #F3C6C1; }
    .sc-email button { border: none; background: none; cursor: pointer; color: inherit; font-size: 13px; padding: 0 2px; }
    .sc-err { margin: -4px 0 0; font-size: 11.5px; }
    .sc-notify { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #1F2937; }
    .sc-hint { margin: -4px 0 0; font-size: 11.5px; color: #6B7280; }
    .sc-how { background: #F4F7FB; color: #4B5563; font-size: 12.5px; }
    .sc-info { margin: 0; background: #F4F7FB; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: #4B5563; line-height: 1.5; }
    .sc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .sc-actions .rsv-btn { height: 44px; }
    .sc-del { width: 100%; }
    .sc-confirm { background: #FFF8F7; border: 1px solid #F3C6C1; border-radius: 10px; padding: 10px; font-size: 12.5px; }
    .sc-confirm p { margin: 0 0 8px; }
    @media (max-width: 1150px) { .sc-layout.with-form { grid-template-columns: 1fr; } .sc-form { position: static; } }
  `],
})
export class ScheduledComponent implements OnDestroy {
  readonly kinds = REPORT_KINDS;
  readonly frequencies: Frequency[] = ['Diaria', 'Semanal', 'Mensual'];
  readonly formats: ReportFormat[] = ['HTML', 'CSV'];
  readonly weekdays = WEEKDAYS;
  readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly hours = HOURS;
  readonly coverage = COVERAGE;
  readonly dayMonth = dayMonth;
  readonly freq = frequencyLabel;

  schedules: Schedule[] = [];
  executions: Execution[] = [];
  openFailures: Execution[] = [];
  formOpen = false;
  editingId = '';
  d: Draft = this.blank();
  emailInput = '';
  touched = false;
  testMsg = ''; testOk = false; testing = false;
  retryMsg = ''; retrying = false;
  /** Qué le falta al correo del servidor ('' = configurado). */
  mailMissing = '';
  confirmDelete = false;
  private sub: Subscription;

  constructor(public svc: ScheduleService, route: ActivatedRoute, mail: MailService) {
    mail.status().then(st => this.mailMissing = st.configured ? '' : st.missing).catch(() => this.mailMissing = '');
    this.sub = combineLatest([svc.getSchedules(), svc.getExecutions()]).subscribe(([s, e]) => {
      this.schedules = s;
      this.executions = e;
      this.openFailures = svc.openFailures();
    });
    const report = route.snapshot.queryParamMap.get('nuevo');
    if (report && this.canSchedule) {
      this.openNew();
      if (REPORT_KINDS.includes(report as ReportKind)) { this.d.report = report as ReportKind; this.onReport(); }
    }
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canSchedule(): boolean {
    return this.svc.canSchedule();
  }
  get activeCount(): number { return this.schedules.filter(s => s.active).length; }
  get monthRuns(): Execution[] { const m = stamp(new Date()).slice(0, 7); return this.executions.filter(e => !e.test && e.at.startsWith(m)); }
  get monthOk(): number { return this.monthRuns.filter(succeeded).length; }
  get recent(): Execution[] { const from = stamp(new Date(Date.now() - 7 * 86_400_000)); return this.executions.filter(e => e.at >= from); }
  get upcoming(): { s: Schedule; at: Date } | null {
    return this.schedules.filter(s => s.active).map(s => ({ s, at: this.svc.nextAt(s.id) ?? nextRun(s, new Date()) })).sort((a, b) => +a.at - +b.at)[0] ?? null;
  }
  get nextLabel(): string {
    const u = this.upcoming;
    if (!u) return '—';
    const days = Math.round((new Date(u.at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    const t = stamp(u.at).slice(11, 16);
    return days === 0 ? `Hoy ${t}` : days === 1 ? `Mañana ${t}` : `${dayMonth(stamp(u.at))} ${t}`;
  }
  get nextName(): string { return this.upcoming?.s.name ?? 'Nada programado'; }
  get errors(): string[] {
    const e = this.svc.recipientErrors(this.d.report, this.d.recipients);
    if (!this.d.name.trim()) e.unshift('Escribe un nombre.');
    return e;
  }
  get firstRun(): string {
    const at = nextRun(this.d, new Date());
    return `${at.toLocaleDateString('es-CO', { weekday: 'long' })} ${dayMonth(stamp(at))}/${at.getFullYear()} a las ${stamp(at).slice(11, 16)}`;
  }

  sensitive(k: ReportKind): boolean { return !!SENSITIVE[k]; }
  formatLabel(f: ReportFormat): string { return FORMAT_LABEL[f] ?? f; }
  nextOf(s: Schedule): string { const at = this.svc.nextAt(s.id) ?? nextRun(s, new Date()); return `${dayMonth(stamp(at))} ${stamp(at).slice(11, 16)}`; }
  shortList(list: string[]): string { return list.join(', '); }
  valid(e: string): boolean { return EMAIL_RE.test(e); }
  ok(e: Execution): boolean { return succeeded(e); }
  failedCount(e: Execution): number { return failed(e).length; }
  failedList(e: Execution): string { return failed(e).map(d => `${d.email} (${d.reason})`).join(', '); }
  when(at: string): string {
    const today = stamp(new Date()).slice(0, 10), y = stamp(new Date(Date.now() - 86_400_000)).slice(0, 10);
    return at.startsWith(today) ? 'hoy' : at.startsWith(y) ? 'ayer' : `el ${dayMonth(at)}`;
  }
  result(e: Execution): string {
    if (e.test) return succeeded(e) ? 'Prueba enviada' : `Prueba · falló ${failed(e).length}`;
    return succeeded(e) ? (e.retryOf ? 'Reenviado' : 'Enviado') : `Falló · ${failed(e).length} de ${e.deliveries.length}`;
  }
  detail(e: Execution): string {
    if (!succeeded(e)) return failed(e).map(d => `${d.email}: ${d.reason}`).join(' · ');
    return e.note ?? `${this.formatLabel(e.format)}${e.test ? ' · prueba' : ''}`;
  }

  private blank(): Draft {
    return { name: '', report: 'Ocupación', frequency: 'Semanal', weekday: 1, monthDay: 1, time: '07:00', coverage: COVERAGE.Semanal[0],
      format: 'HTML', recipients: [], subject: 'SOGO · {reporte} {fecha}', notifyOnFail: true, active: true };
  }

  openNew(): void {
    this.d = this.blank();
    const email = localStorage.getItem('sogo_email');
    if (email) this.d.recipients = [email];
    this.editingId = ''; this.formOpen = true; this.touched = false; this.testMsg = ''; this.confirmDelete = false;
  }

  edit(s: Schedule): void {
    const { id, createdBy, createdAt, pausedAt, ...rest } = s;
    this.d = { ...rest, recipients: [...s.recipients] };
    this.editingId = id; this.formOpen = true; this.touched = true; this.testMsg = ''; this.confirmDelete = false;
  }

  close(): void { this.formOpen = false; this.editingId = ''; }

  onReport(): void {
    if (!this.d.name.trim() || REPORT_KINDS.some(k => this.d.name === `Reporte ${k.toLowerCase()}`)) this.d.name = `Reporte ${this.d.report.toLowerCase()}`;
    this.d.subject = `SOGO · ${this.d.report} {fecha}`;
  }

  setFrequency(f: Frequency): void {
    this.d.frequency = f;
    this.d.coverage = COVERAGE[f][0];
  }

  focusEmail(): void { document.getElementById('sc-email')?.focus(); }

  onEmailKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ',' || ev.key === ';' || ev.key === ' ') { ev.preventDefault(); this.addEmail(); }
    if (ev.key === 'Backspace' && !this.emailInput && this.d.recipients.length) this.d.recipients = this.d.recipients.slice(0, -1);
  }

  addEmail(): void {
    const parts = this.emailInput.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    parts.forEach(p => { if (!this.d.recipients.includes(p)) this.d.recipients = [...this.d.recipients, p]; });
    this.emailInput = '';
    if (parts.length) this.touched = true;
  }

  removeEmail(e: string): void { this.d.recipients = this.d.recipients.filter(x => x !== e); }

  async test(): Promise<void> {
    this.addEmail();
    this.testOk = false; this.testMsg = '';
    const errs = this.svc.recipientErrors(this.d.report, this.d.recipients);
    if (errs.length) { this.touched = true; return; }
    this.testing = true;
    try {
      const ex = await this.svc.sendTest({ ...this.d, name: this.d.name.trim() || `Reporte ${this.d.report.toLowerCase()}` });
      this.testOk = succeeded(ex);
      this.testMsg = this.testOk ? `Prueba enviada a ${ex.deliveries.map(x => x.email).join(', ')}. Revisa la bandeja de entrada (y la de spam).`
        : `No llegó a: ${failed(ex).map(x => `${x.email} (${x.reason})`).join(', ')}.`;
    } catch (e: any) {
      this.testMsg = `No se pudo enviar la prueba: ${serverMessage(e)}`;
    } finally { this.testing = false; }
  }

  saveError = '';

  async save(): Promise<void> {
    this.addEmail();
    this.touched = true;
    if (this.errors.length) return;
    this.saveError = '';
    try {
      await this.svc.save({ ...this.d, name: this.d.name.trim(), subject: this.d.subject.trim() }, this.editingId || undefined);
      this.close();
    } catch (e) {
      this.saveError = serverMessage(e);
    }
  }

  remove(): void {
    this.svc.remove(this.editingId);
    this.confirmDelete = false;
    this.close();
  }

  toggle(s: Schedule): void { this.svc.setActive(s.id, !s.active); }

  async retry(e: Execution): Promise<void> {
    this.retrying = true; this.retryMsg = '';
    try {
      const r = await this.svc.retry(e.id);
      this.retryMsg = succeeded(r) ? '' : `El reintento tampoco llegó: ${failed(r).map(x => `${x.email} (${x.reason})`).join(', ')}. Corrige el destinatario en la programación («${e.name}»).`;
    } catch (err: any) {
      this.retryMsg = err?.status !== undefined ? `No se pudo reintentar: ${serverMessage(err)}` : String(err?.message ?? err);
    } finally { this.retrying = false; }
  }
}
