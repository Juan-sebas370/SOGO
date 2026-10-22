import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isVoid } from '../reservations/reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { TraRecord, TraViewStatus, TraGuest, TraUnit, TraSend, TraEvent, TraSettings, LodgingUnit } from './tra.model';
import { DEFAULT_UNITS } from './tra-catalogs';
import { Validation, validate, draftFor, requiresTra, fullName, principalOf } from './tra-rules';
import { TraGatewayService, GatewayResult } from './tra-gateway.service';
import { seedRecords, defaultSettings } from './tra-seed';

/** Una fila del panel: la reserva con su TRA (las pasadías no tienen). */
export interface TraRow {
  reservation: Reservation;
  record?:     TraRecord;
  status:      TraViewStatus;
}

const clone = <T>(v: T): T => structuredClone(v);
const now = () => { const d = new Date(); return `${isoDateTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`; };
const actor = () => localStorage.getItem('sogo_role') || 'Administrador';

// Estado del módulo TRA. La TRA cuelga de la reserva (Reserva → TRA): cada
// reserva que pernocta tiene su registro desde que se crea (borrador), y se
// envía al MinCIT solo al confirmar el check-in (RN-05). Un fallo nunca borra
// la TRA: queda en ERROR y se reintenta (RN-07).
@Injectable({ providedIn: 'root' })
export class TraService {

  private records = new Map<string, TraRecord>();
  private reservations: Reservation[] = [];
  private units: LodgingUnit[] = clone(DEFAULT_UNITS);
  private settings: TraSettings = defaultSettings();
  private catalogsSyncedAt = `${isoDate(0)}T07:35`;
  private rows$ = new BehaviorSubject<TraRow[]>([]);

  constructor(reservationService: ReservationService, private gateway: TraGatewayService) {
    let seeded = false;
    reservationService.getAll().subscribe(list => {
      this.reservations = list;
      if (!seeded) {
        seedRecords(list, this.units).forEach(rec => this.records.set(rec.reservationId, rec));
        seeded = true;
      }
      this.syncWithReservations();
      this.emit();
    });
    // Reintentos automáticos con espera fija (en producción, un job del backend)
    setInterval(() => this.runAutoRetries(), 60_000);
  }

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
  get catalogsSynced(): string { return this.catalogsSyncedAt; }

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
    if (rec.status !== 'ERROR' || !this.settings.autoRetry || !failedSends.length) return undefined;
    if (Math.max(...failedSends.map(s => s.attempts)) >= this.settings.maxAttempts) return undefined;
    const last = failedSends.map(s => s.attemptAt ?? '').sort().pop()!;
    const d = new Date(last);
    d.setMinutes(d.getMinutes() + this.settings.retryMinutes);
    return `${isoDateTime(d)}:00`;
  }

  // ── Registro de huéspedes ────────────────────────────
  saveRegistration(reservationId: string, units: TraUnit[], guests: TraGuest[]): void {
    const rec = this.records.get(reservationId);
    if (!rec || !this.isEditable(rec)) return;
    this.put({ ...rec, units: clone(units), guests: clone(guests), status: 'BORRADOR' },
      this.event('Registro de huéspedes actualizado', `${guests.length} huésped${guests.length === 1 ? '' : 'es'} · ${actor()}`, 'muted'));
  }

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
    this.put({ ...this.records.get(reservationId)!, sends, status: 'ENVIANDO', checkInAt: now(), sentBy: actor() },
      this.event('Check-in confirmado', actor(), 'info'));
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
    this.emit();
  }

  async testConnection(): Promise<GatewayResult> {
    const res = await this.gateway.testConnection();
    this.updateSettings({ lastSync: isoDateTime(), integrationActive: res.httpStatus === 200 });
    return res;
  }

  syncCatalogs(): void {
    this.catalogsSyncedAt = isoDateTime();
    this.emit();
  }

  saveUnit(unit: LodgingUnit): void {
    const exists = this.units.some(u => u.id === unit.id);
    this.units = exists ? this.units.map(u => u.id === unit.id ? clone(unit) : u) : [...this.units, clone(unit)];
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
    this.records.set(rec.reservationId, event ? { ...rec, history: [event, ...rec.history], updatedAt: event.at } : rec);
    this.emit();
  }

  private patchSend(reservationId: string, index: number, fn: (s: TraSend) => TraSend, event?: TraEvent): void {
    const rec = this.records.get(reservationId)!;
    this.put({ ...rec, sends: rec.sends.map((s, i) => i === index ? fn(s) : s) }, event);
  }

  private event(title: string, detail: string, tone: TraEvent['tone']): TraEvent {
    return { at: now(), title, detail, tone };
  }
}
