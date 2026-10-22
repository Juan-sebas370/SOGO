import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Reservation, Payment } from './reservation.model';
import { isoDateTime } from '../shared/date-utils';
import { API_URL } from '../api';

type Draft = Omit<Reservation, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

/** El servidor envía null en los campos vacíos; el modelo los espera ausentes (undefined). */
function clean(r: Reservation): Reservation {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as unknown as Reservation;
}

// Reservas de la base de datos compartida con la página web (tabla `reservas`).
// Las pantallas leen una copia en memoria (getSnapshot / getById / getAll) y cada
// cambio se ve de inmediato y se guarda en el servidor. Las escrituras van en fila,
// una tras otra, para que, p. ej., el pago y el check-out de una salida no se crucen;
// la respuesta del servidor reemplaza la copia local.
@Injectable({ providedIn: 'root' })
export class ReservationService {

  private readonly base = `${API_URL}/reservas`;
  private data: Reservation[] = [];
  private reservations$ = new BehaviorSubject<Reservation[]>([]);
  private writes: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, number>();   // escrituras en fila por reserva
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient) {}

  /** Primera carga de la sesión actual (el dashboard la espera antes de abrir cualquier módulo). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load();
    }
    return this.loading;
  }

  getAll(): Observable<Reservation[]> {
    return this.reservations$.asObservable();
  }

  getSnapshot(): Reservation[] {
    return this.data;
  }

  getById(id: string): Reservation | undefined {
    return this.data.find(r => r.id === id);
  }

  /** Vuelve a traer las reservas (p. ej. para ver las que llegaron por la página web). */
  reload(): Promise<void> {
    this.loading = this.load();
    return this.loading;
  }

  private load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return Promise.resolve();
    return firstValueFrom(this.http.get<Reservation[]>(this.base))
      .then(list => this.set(list.map(clean)))
      .catch(e => this.fail('No se pudieron cargar las reservas', e, false));
  }

  // ── Escritura ──
  /**
   * Crea la reserva en el servidor (el código RSV-… lo asigna la base de datos) con su abono
   * inicial en la misma operación. El servidor confirma la reserva si el abono cubre el exigido.
   */
  create(r: Draft, firstPayment?: Omit<Payment, 'date'>): Promise<Reservation> {
    const payments = firstPayment && firstPayment.amount > 0 ? [{ ...firstPayment, date: isoDateTime() }] : [];
    return this.enqueue(async () => {
      const created = clean(await firstValueFrom(this.http.post<Reservation>(this.base, { ...r, payments })));
      this.set([created, ...this.data]);
      return created;
    });
  }

  update(id: string, changes: Partial<Reservation>): void {
    this.patchLocal(id, { ...changes, updatedAt: isoDateTime() });
    // Se envía la reserva tal como quedó con ESTE cambio (no la que haya cuando le llegue el turno)
    const body = this.getById(id);
    if (body) this.save(id, () => firstValueFrom(this.http.put<Reservation>(`${this.base}/${id}`, body)));
  }

  addPayment(id: string, payment: Omit<Payment, 'date'>, date = isoDateTime()): Promise<void> {
    const r = this.getById(id);
    if (!r) return Promise.resolve();
    const full: Payment = { ...payment, date };
    this.patchLocal(id, { payments: [...r.payments, full] });
    return this.save(id, () => firstValueFrom(this.http.post<Reservation>(`${this.base}/${id}/pagos`, full)));
  }

  // ── Estadía (Alojamiento) ──
  checkIn(id: string, at: string, changes: Partial<Reservation> = {}): void {
    this.update(id, { ...changes, checkedInAt: at, status: 'Confirmada' });
  }

  checkOut(id: string, at: string): void {
    this.update(id, { checkedOutAt: at, status: 'Finalizada' });
  }

  cancel(id: string, reason: string): void {
    this.update(id, { status: 'Cancelada', cancelReason: reason });
  }

  // ── Interno ──
  /**
   * Guarda un cambio de la reserva `id` en la fila de escrituras. La respuesta del
   * servidor reemplaza la copia local solo si es la del último cambio pendiente de esa
   * reserva: si no, borraría cambios locales que todavía no se han enviado (p. ej. el
   * check-out que sigue al pago del saldo).
   */
  private save(id: string, request: () => Promise<Reservation>): Promise<void> {
    this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
    return this.enqueue(async () => {
      try {
        const saved = clean(await request());
        if (this.pending.get(id) === 1) this.replace(saved);
      } finally {
        this.pending.set(id, this.pending.get(id)! - 1);
      }
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.writes.then(job);
    this.writes = run.catch(e => this.fail('No se pudo guardar el cambio en la reserva', e, true));
    return run;
  }

  private patchLocal(id: string, changes: Partial<Reservation>): void {
    this.set(this.data.map(r => r.id === id ? { ...r, ...changes } : r));
  }

  private replace(saved: Reservation): void {
    this.set(this.data.map(r => r.id === saved.id ? saved : r));
  }

  private set(list: Reservation[]): void {
    this.data = list;
    this.reservations$.next(list);
  }

  private fail(message: string, e: any, reload: boolean): void {
    console.error(message, e);
    if (e?.status !== 401) toast.error(message, serverMessage(e));
    if (reload) this.reload();
  }
}
