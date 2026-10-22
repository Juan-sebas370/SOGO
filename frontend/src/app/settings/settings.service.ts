import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { HotelProfile, HotelService } from '../shared/hotel.service';

// =====================================================
// CONFIGURACIÓN — lo que no pertenece a otro módulo
// Datos del hospedaje, temporadas y políticas de reserva, reglas de
// notificación, correo saliente, auditoría y respaldos. Lo demás se edita
// en su fuente: impuestos y resolución (Facturación), política de
// contraseñas (Usuarios), metas (Reportes), parámetros de nómina (Nómina).
// Sin servicio liviano: solo depende de Usuarios (auditoría).
// =====================================================

export type Section = 'hotel' | 'security' | 'taxes' | 'payroll' | 'lodging' | 'goals' | 'notifications' | 'audit';

export type { HotelProfile } from '../shared/hotel.service';

export type SeasonName = 'Baja' | 'Media' | 'Alta' | 'Muy alta';
/** Temporada: meses (1–12) y días (día/mes) a los que aplica; "weekends" = viernes y sábado. */
export interface Season {
  id: string; name: SeasonName; label: string; adjustment: number; minNights: number;
  ranges: { from: string; to: string }[];   // MM-DD
  weekends?: boolean; weekdaysOnly?: boolean; months?: number[];
}

export interface LodgingPolicies {
  checkIn: string; checkOut: string; depositPct: number; freeCancelHours: number;
  latePenalty: 'Primera noche' | '50 % del total' | 'Total' | 'Sin penalidad'; dayPassMax: number; requireTra: boolean;
}

export type AlertKey = 'stock' | 'expiry' | 'reservations' | 'arrivals' | 'tra' | 'invoice-rejected' | 'invoice-range' | 'payroll' | 'accounts' | 'report-failed' | 'backup-failed' | 'daily-occupancy';
export interface AlertRule { key: AlertKey; label: string; module: string; inApp: boolean; email: boolean; recipients: string[]; }


/**
 * Política de datos y respaldos (configuracion 'politica_datos'). logQueries y logExports se
 * guardan aparte (configuracion 'auditoria', los usa el registro de actividad).
 */
export interface AuditPolicy {
  logQueries: boolean; logExports: boolean; retentionYears: number; integrity: boolean;
  maskDocs: boolean; askConsent: boolean; anonymizeAfterYears: number; controller: string;
  /** Diario · 02:00 | Diario · 23:00 | Semanal · domingo 02:00 | Apagado (lo ejecuta el servidor). */
  backupSchedule: string;
  /** Cuántos respaldos se conservan en la carpeta del servidor (los más viejos se borran). */
  backupKeep: number;
}

/** Un respaldo real: archivo .sql.gz en la carpeta del servidor. */
export interface Backup { name: string; kind: 'Automático' | 'Manual'; at: string; bytes: number; }

export interface SectionMeta { at: string; by: string; }

/** Metas por indicador y nivel de alerta (configuracion 'metas'). Solo las definidas. */
export interface SavedGoals {
  goals:  Record<string, number>;
  alerts: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

/** Lo que se guarda de Notificaciones: la elección del usuario por alerta, y quién y cuándo la cambió. */
interface SavedNotifications {
  rules: { key: AlertKey; inApp: boolean; email: boolean; recipients: string[] }[];
  updatedAt?: string;
  updatedBy?: string;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

@Injectable({ providedIn: 'root' })
export class SettingsService {

  /** Datos del hospedaje: se guardan en la base de datos (configuracion 'hospedaje'). */
  get hotel(): HotelProfile { return this.hotels.get(); }

  seasons: Season[] = [
    { id: 's1', name: 'Baja', label: 'Feb – may · ago – nov (entre semana)', adjustment: -10, minNights: 1, ranges: [], months: [2, 3, 4, 5, 8, 9, 10, 11], weekdaysOnly: true },
    { id: 's2', name: 'Media', label: 'Fines de semana todo el año', adjustment: 0, minNights: 1, ranges: [], weekends: true },
    { id: 's3', name: 'Alta', label: '15/06 – 15/07 · Semana Santa · puentes', adjustment: 20, minNights: 2, ranges: [{ from: '06-15', to: '07-15' }] },
    { id: 's4', name: 'Muy alta', label: '15/12 – 15/01', adjustment: 35, minNights: 3, ranges: [{ from: '12-15', to: '12-31' }, { from: '01-01', to: '01-15' }] },
  ];

  /**
   * Políticas de reserva (configuracion 'politicas_reserva', script 25). Mientras cargan, o si aún no
   * se han guardado, quedan vacías: no se exige abono ni máximo de pasadía que nadie haya definido.
   */
  policies: LodgingPolicies = { checkIn: '', checkOut: '', depositPct: 0, freeCancelHours: 0, latePenalty: 'Sin penalidad', dayPassMax: 0, requireTra: false };
  policiesSaved = false;
  /** Metas e indicadores definidos por el Administrador (vacío: aún sin metas). */
  goals: SavedGoals = { goals: {}, alerts: {} };
  private loading?: Promise<void>;
  private loadedFor = '';

  /**
   * Alertas del sistema. Las claves, nombres y módulos son el catálogo de SOGO; lo que elige el
   * usuario (en SOGO, correo, destinatarios) se guarda en la base (configuracion 'notificaciones')
   * y reemplaza estos valores iniciales al cargar.
   */
  alertRules: AlertRule[] = [
    { key: 'stock', label: 'Stock bajo o agotado', module: 'Inventarios', inApp: true, email: true, recipients: ['Aux. Nómina e Inventario'] },
    { key: 'expiry', label: 'Producto próximo a vencer', module: 'Inventarios', inApp: true, email: true, recipients: ['Aux. Nómina e Inventario'] },
    { key: 'reservations', label: 'Nueva reserva o cancelación', module: 'Reservas', inApp: true, email: false, recipients: ['Recepcionista'] },
    { key: 'arrivals', label: 'Llegadas y salidas del día', module: 'Alojamiento', inApp: true, email: true, recipients: ['Recepcionista'] },
    { key: 'tra', label: 'TRA pendiente de envío', module: 'TRA', inApp: true, email: true, recipients: ['Recepcionista', 'Administrador'] },
    { key: 'invoice-rejected', label: 'Factura rechazada por la DIAN', module: 'Facturación', inApp: true, email: true, recipients: ['Administrador', 'Contador'] },
    { key: 'invoice-range', label: 'Rango de facturación al 80 %', module: 'Facturación', inApp: true, email: true, recipients: ['Administrador'] },
    { key: 'payroll', label: 'Nómina lista para aprobar', module: 'Nómina', inApp: true, email: true, recipients: ['Administrador'] },
    { key: 'accounts', label: 'Cuenta bloqueada o IP nueva', module: 'Usuarios', inApp: true, email: true, recipients: ['Administrador'] },
    { key: 'report-failed', label: 'Reporte programado fallido', module: 'Reportes', inApp: true, email: true, recipients: ['Administrador'] },
    { key: 'backup-failed', label: 'Respaldo fallido', module: 'Auditoría', inApp: true, email: true, recipients: ['Administrador'] },
    { key: 'daily-occupancy', label: 'Resumen diario de ocupación', module: 'Reportes', inApp: false, email: false, recipients: [] },
  ];


  /**
   * Política de datos y respaldos. Mientras no se guarde: sin respaldo automático, sin anonimizar,
   * y se piden autorización de datos y se ocultan documentos (lo que SOGO ya hacía).
   */
  audit: AuditPolicy = {
    logQueries: true, logExports: true, retentionYears: 5, integrity: true,
    maskDocs: true, askConsent: true, anonymizeAfterYears: 0, controller: '',
    backupSchedule: 'Apagado', backupKeep: 30,
  };
  /** ¿Ya se guardó la política en la base? */
  auditSaved = false;

  /** Última modificación de cada sección (vacía si no se ha guardado desde que se registra). */
  meta: Record<Section, SectionMeta> = {
    hotel: { at: '', by: '' }, security: { at: '', by: '' }, taxes: { at: '', by: '' }, payroll: { at: '', by: '' },
    lodging: { at: '', by: '' }, goals: { at: '', by: '' }, notifications: { at: '', by: '' }, audit: { at: '', by: '' },
  };

  private changes$ = new BehaviorSubject<number>(0);

  constructor(private users: UsersService, private hotels: HotelService, private http: HttpClient) {}

  changes(): Observable<number> { return this.changes$.asObservable(); }

  /** Marca la sección como modificada, deja el detalle en auditoría y avisa a quien escuche. */
  touch(section: Section, detail: string): void {
    this.meta[section] = { at: isoDateTime(), by: this.users.actor() };
    this.users.addLog(`Configuración: ${SECTION_LABEL[section].toLowerCase()}`, detail);
    this.changes$.next(this.changes$.value + 1);
  }

  async saveHotel(h: HotelProfile, detail: string): Promise<void> { await this.hotels.save(clone(h)); this.touch('hotel', detail); }
  /** Primera carga de la sesión: políticas de reserva guardadas en la base. */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token
        ? Promise.all([
            firstValueFrom(this.http.get<LodgingPolicies | null>(`${API_URL}/configuracion/politicas_reserva`))
              .then(v => { if (v) { this.policies = { ...this.policies, ...v }; this.policiesSaved = true; } })
              .catch(e => console.error('No se pudieron cargar las políticas de reserva', e)),
            firstValueFrom(this.http.get<SavedNotifications | null>(`${API_URL}/configuracion/notificaciones`))
              .then(v => { if (v) this.applyNotifications(v); })
              .catch(e => console.error('No se pudieron cargar las notificaciones', e)),
            firstValueFrom(this.http.get<(AuditPolicy & { updatedAt?: string; updatedBy?: string }) | null>(`${API_URL}/configuracion/politica_datos`))
              .then(v => {
                if (!v) return;
                const { updatedAt, updatedBy, ...policy } = v;
                this.audit = { ...this.audit, ...policy };
                this.auditSaved = true;
                if (updatedAt) this.meta.audit = { at: updatedAt, by: updatedBy ?? '' };
              })
              .catch(e => console.error('No se pudo cargar la política de datos', e)),
            firstValueFrom(this.http.get<SavedGoals | null>(`${API_URL}/configuracion/metas`))
              .then(v => {
                if (!v) return;
                this.goals = { goals: v.goals ?? {}, alerts: v.alerts ?? {}, updatedAt: v.updatedAt, updatedBy: v.updatedBy };
                if (v.updatedAt) this.meta.goals = { at: v.updatedAt, by: v.updatedBy ?? '' };
              })
              .catch(e => console.error('No se pudieron cargar las metas', e)),
          ]).then(() => undefined)
        : Promise.resolve();
    }
    return this.loading;
  }

  /** Lo guardado reemplaza los valores iniciales de cada alerta del catálogo (las nuevas conservan los suyos). */
  private applyNotifications(v: SavedNotifications): void {
    const saved = new Map((v.rules ?? []).map(r => [r.key, r]));
    this.alertRules = this.alertRules.map(r => {
      const s = saved.get(r.key);
      return s ? { ...r, inApp: !!s.inApp, email: !!s.email, recipients: [...(s.recipients ?? [])] } : r;
    });
    if (v.updatedAt) this.meta.notifications = { at: v.updatedAt, by: v.updatedBy ?? '' };
  }

  async saveLodging(seasons: Season[], policies: LodgingPolicies, detail: string): Promise<void> {
    await firstValueFrom(this.http.put(`${API_URL}/configuracion/politicas_reserva`, policies));
    this.seasons = clone(seasons);
    this.policies = clone(policies);
    this.policiesSaved = true;
    this.touch('lodging', detail);
  }
  /** Guarda en la base las metas y niveles de alerta (los vacíos quedan sin meta). */
  async saveGoals(goals: Record<string, number>, alerts: Record<string, number>, detail: string): Promise<void> {
    const body: SavedGoals = { goals, alerts, updatedAt: isoDateTime(), updatedBy: this.users.actor() };
    await firstValueFrom(this.http.put(`${API_URL}/configuracion/metas`, body));
    this.goals = clone(body);
    this.touch('goals', detail);
    this.meta.goals = { at: body.updatedAt!, by: body.updatedBy! };
  }

  /** Guarda en la base las alertas elegidas (en SOGO, correo y destinatarios). */
  async saveNotifications(rules: AlertRule[], detail: string): Promise<void> {
    const body: SavedNotifications = {
      rules: rules.map(r => ({ key: r.key, inApp: r.inApp, email: r.email, recipients: r.recipients })),
      updatedAt: isoDateTime(), updatedBy: this.users.actor(),
    };
    await firstValueFrom(this.http.put(`${API_URL}/configuracion/notificaciones`, body));
    this.alertRules = clone(rules);
    this.touch('notifications', detail);
  }
  /** Guarda la política de datos y respaldos (el servidor programa los respaldos con ella). */
  async saveAudit(a: AuditPolicy, detail: string): Promise<void> {
    const { logQueries, logExports, ...policy } = a;
    const body = { ...policy, updatedAt: isoDateTime(), updatedBy: this.users.actor() };
    await firstValueFrom(this.http.put(`${API_URL}/configuracion/politica_datos`, body));
    this.audit = clone(a);
    this.auditSaved = true;
    this.touch('audit', detail);
  }

  /** ¿Se muestra esta alerta en la campana de SOGO? */
  inApp(key: AlertKey): boolean { return this.alertRules.find(r => r.key === key)?.inApp ?? true; }

  // ── Temporadas ───────────────────────────────────────

  /** Temporada que aplica a una noche: la de mayor ajuste entre las que coinciden. */
  seasonFor(date: string): Season | undefined {
    const md = date.slice(5), month = +date.slice(5, 7), dow = new Date(`${date}T12:00`).getDay();
    const weekend = dow === 5 || dow === 6;
    const matches = this.seasons.filter(s =>
      s.ranges.some(r => r.from <= md && md <= r.to)
      || (s.weekends && weekend)
      || (s.months?.includes(month) && (!s.weekdaysOnly || !weekend)));
    return matches.sort((a, b) => b.adjustment - a.adjustment)[0];
  }

  /** Valor sugerido del alojamiento: tarifa base de cada noche con el ajuste de su temporada. */
  quote(checkIn: string, nights: number, ratePerNight: number): { total: number; minNights: number; seasons: string[] } {
    let total = 0, minNights = 1;
    const names = new Set<string>();
    for (let i = 0; i < nights; i++) {
      const d = new Date(`${checkIn}T12:00`); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const s = this.seasonFor(iso);
      total += Math.round(ratePerNight * (1 + (s?.adjustment ?? 0) / 100) / 1000) * 1000;
      if (s) { names.add(`${s.name} ${s.adjustment > 0 ? '+' : ''}${s.adjustment} %`); minNights = Math.max(minNights, s.minNights); }
    }
    return { total, minNights, seasons: [...names] };
  }

  // ── Respaldos (archivos reales en el servidor) ─────

  listBackups(): Promise<{ folder: string; backups: Backup[]; last: { at?: string; kind?: string; ok?: boolean; detail?: string; by?: string } }> {
    return firstValueFrom(this.http.get<any>(`${API_URL}/respaldos`));
  }

  async backupNow(): Promise<Backup> {
    const b = await firstValueFrom(this.http.post<Backup>(`${API_URL}/respaldos`, {}));
    this.users.addLog('Configuración: respaldo', `Manual · ${b.name}`);
    return b;
  }

  async downloadBackup(b: Backup): Promise<void> {
    const blob = await firstValueFrom(this.http.get(`${API_URL}/respaldos/${b.name}`, { responseType: 'blob' }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = b.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    this.users.addLog('Configuración: descarga de respaldo', b.name);
  }
}

export const SECTION_LABEL: Record<Section, string> = {
  hotel: 'Datos del hospedaje', security: 'Seguridad y acceso', taxes: 'Impuestos y DIAN', payroll: 'Parámetros de nómina',
  lodging: 'Alojamiento y reservas', goals: 'Metas e indicadores', notifications: 'Notificaciones y correo', audit: 'Auditoría y respaldos',
};
