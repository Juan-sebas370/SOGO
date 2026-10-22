import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';
import { AppUser } from '../users/users.model';
import { SILENT } from '../shared/toast/notify.interceptor';
import { csvText, documentHtml, letterheadLogoDataUrl } from '../shared/documents';
import {
  Schedule, Execution, ReportKind, ReportFormat, SENSITIVE, nextRun, stamp, failed, dayMonth, normalizeFormat,
} from './schedule.model';
import { EMAIL_RE, dmy } from './reports.model';
import { ReportsService } from './reports.service';
import { REPORT_NEEDS, buildReport, coverageRange, csvRows, documentBody, emailHtml, emailText } from './report-mail';

/** Envíos atrasados: si SOGO estuvo cerrado a la hora programada, se envía al abrirlo (hasta 7 días después). */
const CATCH_UP_MS = 7 * 86_400_000;

/**
 * Reportes programados guardados en la base (configuracion 'reportes_programados') y sus envíos
 * (/api/reportes/envios). El reporte se arma en SOGO con los mismos cálculos de Reportes y el
 * servidor lo envía por correo. Los envíos automáticos los hace una sesión abierta de alguien que
 * puede programar reportes; el servidor evita que un mismo envío salga dos veces.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleService implements OnDestroy {

  private schedules: Schedule[] = [];
  private executions: Execution[] = [];
  private schedules$ = new BehaviorSubject<Schedule[]>([]);
  private executions$ = new BehaviorSubject<Execution[]>([]);
  private next = new Map<string, Date>();
  private users: AppUser[] = [];
  private loading?: Promise<void>;
  private loadedFor = '';
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  /** Envíos ya intentados en esta sesión (para no repetir uno que el servidor rechazó). */
  private attempted = new Set<string>();
  /** Por qué no se están enviando los automáticos desde esta sesión ('' = sí se envían). */
  autoStatus = '';

  constructor(private audit: UsersService, private http: HttpClient, private reports: ReportsService) {
    audit.getUsers().subscribe(u => this.users = u);
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  /** Primera carga de la sesión: programaciones e historial de envíos guardados en la base. */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.attempted.clear();
      this.loading = token
        ? Promise.all([
            firstValueFrom(this.http.get<{ schedules: Schedule[] } | null>(`${API_URL}/reportes/programados`)),
            firstValueFrom(this.http.get<Execution[]>(`${API_URL}/reportes/envios`)).catch(() => [] as Execution[]),
          ]).then(([v, ex]) => {
              this.schedules = (v?.schedules ?? []).map(s => ({ ...s, format: normalizeFormat(s.format) }));
              const now = new Date();
              this.schedules.forEach(s => this.next.set(s.id, nextRun(s, now)));
              this.schedules$.next(this.schedules);
              this.setExecutions(ex ?? []);
              this.startAuto();
            })
            .catch(e => { if (e?.status !== 403) console.error('No se pudieron cargar los reportes programados', e); })
        : Promise.resolve();
    }
    return this.loading;
  }

  private persist(): Promise<unknown> {
    return firstValueFrom(this.http.put(`${API_URL}/reportes/programados`, { schedules: this.schedules }));
  }

  private setExecutions(list: Execution[]): void {
    this.executions = [...list].sort((a, b) => b.at.localeCompare(a.at));
    this.executions$.next(this.executions);
  }

  getSchedules(): Observable<Schedule[]> { return this.schedules$.asObservable(); }
  getExecutions(): Observable<Execution[]> { return this.executions$.asObservable(); }
  schedulesSnapshot(): Schedule[] { return this.schedules; }
  executionsSnapshot(): Execution[] { return this.executions; }
  nextAt(id: string): Date | undefined { return this.next.get(id); }

  /** Fallos pendientes: cuenta el último intento de cada envío (un reintento reemplaza al fallo original). */
  openFailures(): Execution[] {
    return this.executions.filter(e => failed(e).length && !e.test && !this.executions.some(x => x.retryOf === e.id));
  }

  // ── Destinatarios ────────────────────────────────────

  /** Roles (ids) del usuario activo dueño de ese correo, o null si no es un usuario activo de SOGO. */
  rolesOf(email: string): string[] | null {
    const e = email.trim().toLowerCase();
    const u = this.users.find(x => x.email.toLowerCase() === e);
    if (u) return u.status === 'Activo' || u.status === 'Pendiente' ? u.roles : null;
    if ((localStorage.getItem('sogo_email') || '').toLowerCase() === e) return this.audit.sessionRoles();
    return null;
  }

  /** Programar envíos requiere crear en Reportes (según Usuarios y Roles). */
  canSchedule(): boolean { return this.audit.can('Reportes', 'create'); }

  /** Esta sesión puede armar el reporte con datos completos (ve todos los módulos que usa). */
  canBuild(kind: ReportKind): boolean { return REPORT_NEEDS[kind].every(m => this.reports.canView(m)); }

  /** Errores de una lista de destinatarios para un tipo de reporte. */
  recipientErrors(report: ReportKind, emails: string[]): string[] {
    const errors: string[] = [];
    if (!emails.length) errors.push('Agrega al menos un destinatario.');
    if (emails.length > 20) errors.push('Máximo 20 destinatarios.');
    emails.filter(e => !EMAIL_RE.test(e)).forEach(e => errors.push(`«${e}» no es un correo válido.`));
    const module = SENSITIVE[report];
    if (module) {
      emails.filter(e => EMAIL_RE.test(e)).forEach(e => {
        const roles = this.rolesOf(e);
        if (!roles) errors.push(`«${e}» no es un usuario activo del sistema: los reportes con información de ${module.toLowerCase()} solo se envían a usuarios con permiso.`);
        else if (!this.audit.permissionsFor(roles)[module].view) errors.push(`«${e}» (${this.audit.roleNames(roles).join(', ')}) no tiene permiso para consultar ${module}.`);
      });
    }
    return errors;
  }

  // ── Programación ─────────────────────────────────────

  async save(data: Omit<Schedule, 'id' | 'createdBy' | 'createdAt'>, id?: string): Promise<Schedule> {
    const before = this.schedules;
    const current = id ? this.schedules.find(s => s.id === id) : undefined;
    const now = stamp(new Date());
    const s: Schedule = current
      ? { ...current, ...data, activeSince: current.active || !data.active ? current.activeSince ?? current.createdAt : now }
      : { ...data, id: `sch${Date.now().toString(36)}`, createdBy: this.audit.actor(), createdAt: now,
          ownerLogin: localStorage.getItem('sogo_username') || undefined, activeSince: now };
    this.schedules = current ? this.schedules.map(x => x.id === s.id ? s : x) : [...this.schedules, s];
    try { await this.persist(); } catch (e) { this.schedules = before; throw e; }
    this.next.set(s.id, nextRun(s, new Date()));
    this.audit.addLog(current ? 'Reportes: programación editada' : 'Reportes: reporte programado',
      `${s.name} · ${s.report} · ${s.recipients.join(', ')}`);
    this.schedules$.next(this.schedules);
    return s;
  }

  setActive(id: string, active: boolean): void {
    const now = new Date();
    // Al reactivar no se envían las horas que pasaron mientras estuvo pausada
    this.schedules = this.schedules.map(s => s.id === id ? { ...s, active, pausedAt: active ? undefined : stamp(now), activeSince: active ? stamp(now) : s.activeSince } : s);
    const s = this.schedules.find(x => x.id === id)!;
    this.next.set(id, nextRun(s, now));
    this.persist().catch(() => { this.loading = undefined; this.ready(); });
    this.audit.addLog(active ? 'Reportes: envío reactivado' : 'Reportes: envío pausado', s.name);
    this.schedules$.next(this.schedules);
  }

  remove(id: string): void {
    const s = this.schedules.find(x => x.id === id);
    if (!s) return;
    this.schedules = this.schedules.filter(x => x.id !== id);
    this.next.delete(id);
    this.persist().catch(() => { this.loading = undefined; this.ready(); });
    this.audit.addLog('Reportes: programación eliminada', s.name);
    this.schedules$.next(this.schedules);
  }

  // ── Envíos ───────────────────────────────────────────

  /** Envío de prueba con el borrador del formulario (cubre el período como si se enviara ahora). */
  sendTest(draft: Pick<Schedule, 'name' | 'report' | 'coverage' | 'format' | 'recipients' | 'subject'>): Promise<Execution> {
    return this.deliver({ ...draft, scheduleId: '', at: new Date(), test: true });
  }

  /** Reintenta un envío fallido solo a los destinatarios que no lo recibieron, con el mismo período. */
  async retry(executionId: string): Promise<Execution> {
    const e = this.executions.find(x => x.id === executionId);
    const s = e && this.schedules.find(x => x.id === e.scheduleId);
    if (!e || !s) throw new Error('La programación de ese envío ya no existe.');
    // A quienes no lo recibieron, según los destinatarios actuales (si se corrigió un correo, va al corregido)
    const received = new Set(e.deliveries.filter(d => d.ok).map(d => d.email.toLowerCase()));
    const recipients = s.recipients.filter(r => !received.has(r.toLowerCase()));
    if (!recipients.length) throw new Error('Todos los destinatarios actuales ya lo recibieron.');
    return this.deliver({ ...s, recipients, scheduleId: s.id, at: parseStamp(e.slot ?? e.at), retryOf: e.id });
  }

  private async deliver(o: {
    name: string; report: ReportKind; coverage: string; format: ReportFormat; recipients: string[]; subject: string;
    scheduleId: string; at: Date; slot?: string; test?: boolean; retryOf?: string; note?: string;
  }): Promise<Execution> {
    const range = coverageRange(o.coverage, o.at, this.reports.goLive);
    const built = buildReport(this.reports, o.report, range);
    const periodText = range.from === range.to ? dmy(range.from) : `${dmy(range.from)} – ${dmy(range.to)}`;
    const generated = `${dmy(stamp(new Date()))} ${stamp(new Date()).slice(11, 16)}`;
    const base = `${o.report.toLowerCase().replace(/\s+/g, '-')}-${range.from}_${range.to}`;
    const attachment = o.format === 'CSV'
      ? { name: `reporte-${base}.csv`, type: 'text/csv; charset=utf-8', base64: toBase64(csvText(csvRows(built))) }
      : { name: `reporte-${base}.html`, type: 'text/html; charset=utf-8',
          base64: toBase64(documentHtml(built.title, documentBody(built, generated), { logo: await letterheadLogoDataUrl() })) };
    const subject = (o.subject || `SOGO · ${o.report} {fecha}`).replace(/\{reporte\}/g, o.report).replace(/\{fecha\}/g, periodText).slice(0, 160);
    const body = {
      scheduleId: o.scheduleId || null, slot: o.slot ?? null, test: !!o.test, retryOf: o.retryOf ?? null, note: o.note ?? null,
      name: o.name || built.title, report: o.report, period: periodText, format: o.format, subject, recipients: o.recipients,
      html: emailHtml(built, { generated, by: this.audit.actor(), format: o.format, attachment: attachment.name }), text: emailText(built), attachment,
    };
    // Sin avisos automáticos: cada pantalla muestra el resultado de cada destinatario
    const opts = { context: new HttpContext().set(SILENT, true) };
    const ex = await firstValueFrom(this.http.post<Execution>(`${API_URL}/reportes/envios`, body, opts));
    this.setExecutions([ex, ...this.executions.filter(x => x.id !== ex.id)]);
    this.audit.addLog(o.test ? 'Reportes: envío de prueba' : o.retryOf ? 'Reportes: envío reintentado' : 'Reportes: reporte enviado',
      `${ex.name} · ${periodText} · ${ex.deliveries.filter(d => d.ok).length} de ${ex.deliveries.length} entregados`);
    return ex;
  }

  // ── Envío automático ─────────────────────────────────

  private startAuto(): void {
    if (this.timer) clearInterval(this.timer);
    this.autoStatus = this.canSchedule() ? '' : 'Esta sesión no puede programar reportes: los envíos automáticos los hace la sesión de quien sí puede.';
    if (!this.canSchedule()) return;
    // Primera revisión cuando ya cargaron los demás módulos; luego cada minuto
    setTimeout(() => this.runDue(), 20_000);
    this.timer = setInterval(() => this.runDue(), 60_000);
  }

  /** Envía las programaciones cuya hora ya pasó y que todavía no tienen envío registrado. */
  private async runDue(): Promise<void> {
    if (this.running || !localStorage.getItem('sogo_token')) return;
    this.running = true;
    try {
      const now = new Date();
      for (const s of this.schedules.filter(x => x.active)) {
        const slotAt = lastRun(s, now);
        if (!slotAt || now.getTime() - slotAt.getTime() > CATCH_UP_MS) continue;
        const slot = stamp(slotAt);
        if (slot < (s.activeSince ?? s.createdAt)) continue;
        const key = `${s.id}|${slot}`;
        if (this.attempted.has(key) || this.executions.some(e => e.scheduleId === s.id && e.slot === slot && !e.retryOf && !e.test)) continue;
        if (!this.canBuild(s.report)) continue;   // otra sesión con permiso sobre esos módulos lo enviará
        this.attempted.add(key);
        const late = now.getTime() - slotAt.getTime() > 15 * 60_000;
        try {
          await this.deliver({ ...s, scheduleId: s.id, at: slotAt, slot,
            note: late ? `Programado ${dayMonth(slot)} ${slot.slice(11, 16)}; se envió al abrir SOGO` : undefined });
          this.autoStatus = '';
        } catch (e: any) {
          if (e?.status === 409) continue;          // ya lo envió otra sesión
          this.autoStatus = e?.status === 503 ? (e?.error?.message || 'El correo del servidor no está configurado.')
            : `No se pudo enviar «${s.name}»: ${e?.error?.message || 'error de conexión con el servidor'}.`;
        }
      }
      // Historial actualizado (envíos hechos desde otros equipos)
      const ex = await firstValueFrom(this.http.get<Execution[]>(`${API_URL}/reportes/envios`)).catch(() => null);
      if (ex) this.setExecutions(ex);
      this.schedules.forEach(s => this.next.set(s.id, nextRun(s, new Date())));
    } finally {
      this.running = false;
    }
  }
}

/** Última hora programada que ya pasó (o null si no hubo en el último mes). */
function lastRun(s: Schedule, now: Date): Date | null {
  let last: Date | null = null;
  for (let d = nextRun(s, new Date(now.getTime() - 33 * 86_400_000)); d <= now; d = nextRun(s, d)) last = d;
  return last;
}

const parseStamp = (v: string) => new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10), +v.slice(11, 13) || 0, +v.slice(14, 16) || 0);

/** Base64 de un texto en UTF-8 (para adjuntos). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export { dayMonth };
