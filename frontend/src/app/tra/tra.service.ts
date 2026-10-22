import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';
import { HotelService } from '../shared/hotel.service';
import { ROOMS, summaryOf } from '../lodging/house';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isVoid } from '../reservations/reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { TraRecord, TraViewStatus, TraGuest, TraUnit, TraSend, TraEvent, TraSettings, LodgingUnit } from './tra.model';
import { DEFAULT_UNITS } from './tra-catalogs';
import { Validation, validate, draftFor, requiresTra, fullName, principalOf } from './tra-rules';
import { TraGatewayService, GatewayResult } from './tra-gateway.service';

/** Una fila del panel: la reserva con su TRA (las pasadías no tienen). */
export interface TraRow {
  reservation: Reservation;
  record?:     TraRecord;
  status:      TraViewStatus;
}

const clone = <T>(v: T): T => structuredClone(v);
const now = () => { const d = new Date(); return `${isoDateTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`; };

// Estado del módulo TRA. La TRA cuelga de la reserva (Reserva → TRA): cada
// reserva que pernocta tiene su registro desde que se crea (borrador), y se
// envía al MinCIT solo al confirmar el check-in (RN-05). Un fallo nunca borra
// la TRA: queda en ERROR y se reintenta (RN-07).
// Todo se guarda en la base de datos: cada TRA en tra_registros (con huéspedes,
// acompañantes, unidades, envíos e historial) y la configuración en
// configuracion 'tra'. Sin datos de demostración.
@Injectable({ providedIn: 'root' })
export class TraService {

  private records = new Map<string, TraRecord>();
  private reservations: Reservation[] = [];
  private units: LodgingUnit[] = clone(DEFAULT_UNITS);
  private settings: TraSettings;
  private rows$ = new BehaviorSubject<TraRow[]>([]);
  private loading?: Promise<void>;
  private loadedFor = '';
  private writes: Promise<unknown> = Promise.resolve();

  constructor(reservationService: ReservationService, private gateway: TraGatewayService, private http: HttpClient,
              private users: UsersService, private hotel: HotelService) {
    this.settings = this.defaults();
    reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.syncWithReservations();
      this.emit();
    });
    // Reintentos automáticos con espera fija (en producción, un job del backend)
    setInterval(() => this.runAutoRetries(), 60_000);
  }

  /** Primera carga de la sesión: las TRA y la configuración guardadas en la base de datos. */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token ? this.load() : Promise.resolve();
    }
    return this.loading;
  }

  private async load(): Promise<void> {
    await this.hotel.ready();   // los datos del establecimiento salen de Datos del hospedaje
    const [records, config] = await Promise.all([
      firstValueFrom(this.http.get<TraRecord[]>(`${API_URL}/tra/registros`)).catch(e => { if (e?.status !== 403) console.error('No se pudieron cargar las TRA', e); return [] as TraRecord[]; }),
      firstValueFrom(this.http.get<(TraSettings & { units?: LodgingUnit[] }) | null>(`${API_URL}/configuracion/tra`)).catch(() => null),
    ]);
    this.records.clear();
    records.forEach(rec => this.records.set(rec.reservationId, { ...rec, sends: rec.sends ?? [], history: rec.history ?? [] }));
    const { units, ...saved } = config ?? {} as TraSettings & { units?: LodgingUnit[] };
    this.settings = { ...this.defaults(), ...saved };
    if (units?.length) this.units = units;
    this.syncWithReservations();
    this.emit();
  }

  /**
   * Configuración inicial cuando aún no se ha guardado: los datos del establecimiento salen de
   * Configuración › Datos del hospedaje; la integración arranca inactiva (no hay token).
   */
  private defaults(): TraSettings {
    const h = this.hotel.get();
    const [municipality = '', department = ''] = this.hotel.city.split(',').map(x => x.trim());
    return {
      rnt: h.rnt, rntEmail: h.email, tokenLast4: '', integrationActive: false, lastSync: '',
      provider: this.hotel.name, providerType: h.establishment, ciiu: '',
      department, municipality, address: h.address, phone: this.hotel.phones, email: h.email, website: h.website,
      capacity: summaryOf(ROOMS.map(r => r.number)).capacity,
      autoRetry: true, maxAttempts: 3, retryMinutes: 15, notifyErrors: true,
    };
  }

  private actor(): string { return this.users.actor(); }

  // ── Lectura ──────────────────────────────────────────
  getRows(): Observable<TraRow[]> { return this.rows$.asObservable(); }

  row(reservationId: string): TraRow | undefined {
    return this.rows$.value.find(r => r.reservation.id === reservationId);
  }

  /** Copia editable del registro. */
  draft(reservationId: string): TraRecord | undefined {
    const rec = this.records.get(reservationId);
    return rec && clone(rec);
  }

  /** Estado TRA de una reserva, para el módulo de Reservas. */
  statusOf(r: Reservation): TraViewStatus {
    return this.viewStatus(r, this.records.get(r.id));
  }

  getUnits(): LodgingUnit[] { return this.units; }
  getSettings(): TraSettings { return this.settings; }

  validation(reservationId: string, rec = this.records.get(reservationId)): Validation | undefined {
    const r = this.reservations.find(x => x.id === reservationId);
    return rec && r ? validate(rec, r, this.settings, this.units) : undefined;
  }

  /** El registro se edita hasta el primer envío; después solo se reenvía. */
  isEditable(rec: TraRecord): boolean { return !rec.sends.length; }

  /** RN-05: se envía en el check-in, nunca antes. */
  checkInReached(r: Reservation): boolean { return r.checkIn <= isoDate(0); }

  /** Próximo reintento automático de una TRA en error, si aún quedan intentos. */
  nextRetry(rec: TraRecord): string | undefined {
    const failedSends = rec.sends.filter(s => s.status === 'ERROR');
    if (rec.status !== 'ERROR' || !this.settings.autoRetry || !this.settings.integrationActive || !failedSends.length) return undefined;
    if (Math.max(...failedSends.map(s => s.attempts)) >= this.settings.maxAttempts) return undefined;
    const last = failedSends.map(s => s.attemptAt ?? '').sort().pop()!;
    const d = new Date(last);
    d.setMinutes(d.getMinutes() + this.settings.retryMinutes);
    return `${isoDateTime(d)}:00`;
  }

  // ── Registro de huéspedes ────────────────────────────
  /** Guarda el registro de huéspedes. `auto`: guardado automático, sin evento en el historial. */
  saveRegistration(reservationId: string, units: TraUnit[], guests: TraGuest[], auto = false): void {
    const rec = this.records.get(reservationId);
    if (!rec || !this.isEditable(rec)) return;
    this.put({ ...rec, units: clone(units), guests: clone(guests), status: 'BORRADOR' }, auto ? undefined
      : this.event('Registro de huéspedes actualizado', `${guests.length} huésped${guests.length === 1 ? '' : 'es'} · ${this.actor()}`, 'muted'));
  }

  /** Nombre de quien está en la sesión (para verificaciones y registros). */
  get actorName(): string { return this.actor(); }

  /** Validación previa (sección 6): deja la TRA lista para envío o en corrección. */
  markValidated(reservationId: string): Validation | undefined {
    const rec = this.records.get(reservationId);
    const v = this.validation(reservationId);
    if (!rec || !v || !this.isEditable(rec)) return v;
    this.put({ ...rec, status: v.ok ? 'LISTA_PARA_ENVIO' : 'REQUIERE_CORRECCION' },
      this.event(`Validación previa: ${v.passed} de ${v.checks.length}`, v.ok ? 'Lista para enviar en el check-in' : v.issues[0].message, v.ok ? 'info' : 'danger'));
    return v;
  }

  // ── Envío al MinCIT ──────────────────────────────────
  /** Confirma el check-in y envía: /one/ para el principal y /two/ por cada acompañante. */
  async send(reservationId: string): Promise<void> {
    const rec = this.records.get(reservationId);
    const r = this.reservations.find(x => x.id === reservationId);
    const v = this.markValidated(reservationId);
    if (!rec || !r || !this.isEditable(rec) || !v?.ok || !this.checkInReached(r)) return;

    const sends: TraSend[] = rec.guests.map((g, i) => ({ guestId: g.id, endpoint: i === 0 ? 'ONE' : 'TWO', status: 'PENDIENTE', attempts: 0 }));
    this.put({ ...this.records.get(reservationId)!, sends, status: 'ENVIANDO', checkInAt: now(), sentBy: this.actor() },
      this.event('Check-in confirmado', this.actor(), 'info'));
    await this.transmit(reservationId, false);
  }

  /** Reenvía solo lo que no quedó EXITOSO (manual con "Reenviar" o automático). */
  async retry(reservationId: string, auto = false): Promise<void> {
    const rec = this.records.get(reservationId);
    if (!rec || rec.status !== 'ERROR') return;
    this.put({ ...rec, status: 'ENVIANDO' });
    await this.transmit(reservationId, auto);
  }

  private async transmit(reservationId: string, auto: boolean): Promise<void> {
    const label = auto ? 'Reintento automático · ' : '';
    const guest = (id: string) => this.records.get(reservationId)!.guests.find(g => g.id === id)!;

    const attempt = async (index: number, call: () => Promise<GatewayResult>): Promise<GatewayResult | undefined> => {
      this.patchSend(reservationId, index, s => ({ ...s, status: s.attempts ? 'REINTENTO' : 'ENVIANDO' }));
      let res: GatewayResult | undefined;
      try { res = await call(); } catch { res = undefined; }
      const ok = res?.httpStatus === 200;
      const send = this.records.get(reservationId)!.sends[index];
      const path = send.endpoint === 'ONE' ? '/one/' : '/two/';
      this.patchSend(reservationId, index, s => ({
        ...s, status: ok ? 'EXITOSO' : 'ERROR', attempts: s.attempts + 1, attemptAt: now(),
        httpStatus: res?.httpStatus ?? 0, requestId: res?.requestId, message: res?.message ?? 'Sin respuesta del servidor',
        durationMs: res?.durationMs, mincitId: res?.mincitId ?? s.mincitId,
      }), this.event(`${label}POST ${path} · ${fullName(guest(send.guestId))} · ${res?.httpStatus ?? 'sin respuesta'}`,
        ok ? (res?.mincitId ? `ID ${res.mincitId}` : 'Con ID del principal') : (res?.message ?? 'Sin respuesta del servidor'), ok ? 'ok' : 'danger'));
      return ok ? res : undefined;
    };

    // 1. /one/: si falla, no se envía ningún /two/
    let rec = this.records.get(reservationId)!;
    if (rec.sends[0].status !== 'EXITOSO') {
      const res = await attempt(0, () => this.gateway.sendPrincipal());
      if (res) rec.sends.slice(1).forEach((_, i) => this.patchSend(reservationId, i + 1, s => ({ ...s, mincitId: res.mincitId })));
    }
    rec = this.records.get(reservationId)!;
    const mincitId = rec.sends[0].mincitId;

    // 2. /two/ por acompañante: un fallo solo deja en ERROR a ese acompañante
    if (rec.sends[0].status === 'EXITOSO' && mincitId) {
      for (let i = 1; i < rec.sends.length; i++) {
        if (this.records.get(reservationId)!.sends[i].status !== 'EXITOSO') await attempt(i, () => this.gateway.sendCompanion(mincitId));
      }
    }

    rec = this.records.get(reservationId)!;
    const ok = rec.sends.filter(s => s.status === 'EXITOSO').length;
    const all = rec.sends.length;
    this.put({ ...rec, status: ok === all ? 'REPORTADA' : 'ERROR' }, ok === all
      ? this.event('TRA reportada', `${ok} de ${all} exitosos`, 'ok')
      : this.event('Error de envío', `${ok} de ${all} exitosos · la TRA local queda guardada`, 'danger'));
  }

  /**
   * La TRA se reportó directamente en la plataforma del MinCIT (mientras SOGO no tenga el envío
   * automático): se registra el número que asignó el MinCIT y la TRA queda REPORTADA.
   */
  reportManually(reservationId: string, mincitId: string): void {
    const rec = this.records.get(reservationId);
    if (!rec || rec.status === 'REPORTADA' || !mincitId.trim()) return;
    const at = now();
    const sends: TraSend[] = rec.guests.map((g, i) => {
      const prev = rec.sends.find(s => s.guestId === g.id);
      return { guestId: g.id, endpoint: i === 0 ? 'ONE' : 'TWO', status: 'EXITOSO', attempts: prev?.attempts ?? 0, attemptAt: at,
        mincitId: mincitId.trim(), message: 'Reportada en la plataforma del MinCIT' };
    });
    this.put({ ...rec, sends, status: 'REPORTADA', checkInAt: rec.checkInAt ?? at, sentBy: this.actor() },
      this.event('TRA reportada en la plataforma del MinCIT', `N.º ${mincitId.trim()} · ${this.actor()}`, 'ok'));
  }

  private runAutoRetries(): void {
    const stamp = now();
    this.records.forEach(rec => {
      const next = this.nextRetry(rec);
      if (next && next <= stamp) this.retry(rec.reservationId, true);
    });
  }

  // ── Configuración ────────────────────────────────────
  updateSettings(changes: Partial<TraSettings>): void {
    this.settings = { ...this.settings, ...changes };
    this.persistConfig();
    this.emit();
  }

  async testConnection(): Promise<GatewayResult> {
    const res = await this.gateway.testConnection();
    this.updateSettings({ lastSync: isoDateTime(), integrationActive: res.httpStatus === 200 });
    return res;
  }

  saveUnit(unit: LodgingUnit): void {
    const exists = this.units.some(u => u.id === unit.id);
    this.units = exists ? this.units.map(u => u.id === unit.id ? clone(unit) : u) : [...this.units, clone(unit)];
    this.persistConfig();
    this.emit();
  }

  // ── Interno ──────────────────────────────────────────
  /** Cada reserva que pernocta tiene su TRA; mientras no se envíe, sigue las fechas de la reserva. */
  private syncWithReservations(): void {
    this.reservations.forEach(r => {
      const rec = this.records.get(r.id);
      if (!rec) {
        if (!isVoid(r) && requiresTra(r)) this.records.set(r.id, draftFor(r, this.units, isoDateTime()));
        return;
      }
      const p = principalOf(rec);
      if (this.isEditable(rec) && (p.travel.checkIn !== r.checkIn || p.travel.checkOut !== r.checkOut)) {
        p.travel = { ...p.travel, checkIn: r.checkIn, checkOut: r.checkOut };
      }
    });
  }

  /** Filas del panel: reservas vigentes, y las anuladas que ya alcanzaron a reportarse. */
  private emit(): void {
    const rows = this.reservations
      .map((reservation): TraRow => {
        const record = this.records.get(reservation.id);
        return { reservation, record, status: this.viewStatus(reservation, record) };
      })
      .filter(row => !isVoid(row.reservation) || !!row.record?.sends.length)
      .sort((a, b) => b.reservation.code.localeCompare(a.reservation.code));
    this.rows$.next(rows);
  }

  /** Una reserva anulada antes de enviar su TRA ya no tiene nada que reportar. */
  private viewStatus(r: Reservation, rec?: TraRecord): TraViewStatus {
    return rec && (!isVoid(r) || rec.sends.length) ? rec.status : 'NO_APLICA';
  }

  private put(rec: TraRecord, event?: TraEvent): void {
    const saved = event ? { ...rec, history: [event, ...rec.history], updatedAt: event.at } : rec;
    this.records.set(rec.reservationId, saved);
    this.emit();
    this.persist(saved.reservationId);
  }

  /** Guarda la TRA tal como quedó (en fila: los cambios de un envío se escriben en orden). */
  private persist(reservationId: string): void {
    this.writes = this.writes.then(() => {
      const rec = this.records.get(reservationId);
      return rec ? firstValueFrom(this.http.put(`${API_URL}/tra/registros/${reservationId}`, rec)) : undefined;
    }).catch(e => console.error('No se pudo guardar la TRA', e));
  }

  private persistConfig(): void {
    if (!this.users.can('Configuración', 'edit')) return;
    firstValueFrom(this.http.put(`${API_URL}/configuracion/tra`, { ...this.settings, units: this.units }))
      .catch(e => console.error('No se pudo guardar la configuración de la TRA', e));
  }

  private patchSend(reservationId: string, index: number, fn: (s: TraSend) => TraSend, event?: TraEvent): void {
    const rec = this.records.get(reservationId)!;
    this.put({ ...rec, sends: rec.sends.map((s, i) => i === index ? fn(s) : s) }, event);
  }

  private event(title: string, detail: string, tone: TraEvent['tone']): TraEvent {
    return { at: now(), title, detail, tone };
  }
}
