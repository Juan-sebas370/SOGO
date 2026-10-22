import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConceptCategory } from './invoice.model';
import { ReservationService } from '../reservations/reservation.service';
import { DamageReason } from '../inventory/dotacion.model';
import { API_URL } from '../api';

/** Consumo cargado a la cuenta de una estadía (p. ej. una toalla que el huésped no entregó). */
export interface Charge {
  id:            string;
  reservationId: string;
  category:      ConceptCategory;
  description:   string;       // "Toalla de baño · Faltante"
  detail:        string;       // "Piso 2 · registrado en el check-out"
  date:          string;       // YYYY-MM-DD
  quantity:      number;
  unitValue:     number;
  itemId?:       number;       // artículo de la dotación (pérdidas y daños)
  floor?:        number;
  reason?:       DamageReason;
}

/**
 * Cuenta de consumos por estadía (tabla `consumos`). Cada consumo suma a los servicios
 * adicionales de la reserva. add() responde de inmediato con un id provisional y lo
 * cambia por el de la base de datos cuando el servidor confirma.
 */
@Injectable({ providedIn: 'root' })
export class ChargeService {

  private readonly base = `${API_URL}/consumos`;
  private data: Charge[] = [];
  private seq = 0;
  private realIds = new Map<string, string>();   // id provisional → id de la base de datos
  private writes: Promise<unknown> = Promise.resolve();
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient, private reservations: ReservationService) {}

  /** Primera carga de la sesión actual (el dashboard la espera antes de abrir los módulos). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token
        ? firstValueFrom(this.http.get<(Charge & { invoiced: boolean })[]>(this.base))
            .then(list => { this.data = list.map(({ invoiced, ...c }) => clean(c)); })
            .catch(e => console.error('No se pudieron cargar los consumos', e))
        : Promise.resolve();
    }
    return this.loading;
  }

  /** Todos los consumos (Contabilidad los integra por fecha). */
  all(): Charge[] { return this.data; }

  forReservation(reservationId: string): Charge[] {
    return this.data.filter(c => c.reservationId === reservationId).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Registra un consumo y lo suma a los servicios adicionales de la reserva. */
  add(charge: Omit<Charge, 'id'>): Charge {
    const tempId = `tmp-${Date.now()}-${++this.seq}`;
    const created: Charge = { ...charge, id: tempId };
    this.data = [...this.data, created];
    const r = this.reservations.getById(charge.reservationId);
    if (r) this.reservations.update(r.id, { extrasAmount: r.extrasAmount + charge.quantity * charge.unitValue });
    this.enqueue(async () => {
      const saved = await firstValueFrom(this.http.post<Charge>(this.base, created));
      this.realIds.set(tempId, saved.id);
      this.data = this.data.map(c => c.id === tempId ? { ...c, id: saved.id } : c);
    }, () => this.undo(tempId));
    return created;
  }

  /** Retira un consumo de la cuenta (p. ej. se anuló o se cobró aparte) y lo resta de los servicios adicionales. */
  remove(id: string): void {
    const charge = this.data.find(c => c.id === id);
    if (!charge) return;
    this.data = this.data.filter(c => c.id !== id);
    const r = this.reservations.getById(charge.reservationId);
    if (r) this.reservations.update(r.id, { extrasAmount: Math.max(0, r.extrasAmount - charge.quantity * charge.unitValue) });
    // Se resuelve en la fila: si se agregó hace un instante, para entonces ya tiene su id real
    this.enqueue(async () => {
      const realId = this.realIds.get(id) ?? id;
      if (!realId.startsWith('tmp-')) await firstValueFrom(this.http.delete(`${this.base}/${realId}`));
    });
  }

  /** El servidor rechazó el consumo: se retira de la cuenta para no cobrar algo que no quedó guardado. */
  private undo(tempId: string): void {
    const charge = this.data.find(c => c.id === tempId);
    if (!charge) return;
    this.data = this.data.filter(c => c.id !== tempId);
    const r = this.reservations.getById(charge.reservationId);
    if (r) this.reservations.update(r.id, { extrasAmount: Math.max(0, r.extrasAmount - charge.quantity * charge.unitValue) });
  }

  private enqueue(job: () => Promise<void>, onError?: () => void): void {
    this.writes = this.writes.then(job).catch(e => {
      console.error('No se pudo guardar el consumo', e);
      onError?.();
      if (e?.status !== 401) toast.error('No se pudo guardar el consumo', serverMessage(e));
    });
  }
}

/** El servidor envía null en los campos vacíos; el modelo los espera ausentes. */
function clean(c: Charge): Charge {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null)) as unknown as Charge;
}
