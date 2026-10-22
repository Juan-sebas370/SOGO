import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';
import { ROOMS } from './house';
import { Rate, RATE_TYPES, SeasonCalendar, defaultCalendar, quote, rateTypeOf, Quote } from './rates.model';

/** Precio por noche de una habitación en cada temporada (lo que muestra la web en Habitaciones). */
export interface RoomPrice { number: string; floor: number; type: string; low: number; mid: number; high: number; }

/**
 * Tarifas por tipo de reserva, calendario de temporadas y precios por habitación, todo en la
 * base de datos compartida con la página web: lo que se guarda aquí es lo que cobra la web.
 */
@Injectable({ providedIn: 'root' })
export class RatesService {
  private readonly base = `${API_URL}/tarifas`;
  readonly rates$ = new BehaviorSubject<Rate[]>([]);
  readonly calendar$ = new BehaviorSubject<SeasonCalendar>(defaultCalendar());
  /** true si el calendario viene de la base de datos (false = el de fábrica, aún sin guardar). */
  calendarSaved = false;
  loadError = '';
  private loading?: Promise<void>;

  constructor(private http: HttpClient, private users: UsersService) {}

  get canEdit(): boolean { return this.users.can('Alojamiento', 'edit'); }

  /** Carga una vez por sesión (Reservas la usa para sugerir el valor). */
  ready(): Promise<void> { return this.loading ??= this.load(); }

  async load(): Promise<void> {
    try {
      const [rates, calendar] = await Promise.all([
        firstValueFrom(this.http.get<Rate[]>(this.base)),
        firstValueFrom(this.http.get<SeasonCalendar | null>(`${this.base}/temporadas`)),
      ]);
      this.rates$.next(RATE_TYPES.map(t => {
        const db = rates.find(r => r.type === t.type);
        return { type: t.type, name: db?.name || t.name, low: db?.low ?? 0, mid: db?.mid ?? 0, high: db?.high ?? 0 };
      }));
      this.calendarSaved = !!calendar;
      this.calendar$.next(calendar ? { ...defaultCalendar(), ...calendar } : defaultCalendar());
      this.loadError = '';
    } catch (e: any) {
      this.loading = undefined;
      this.loadError = e?.status === 403 ? 'Tu rol no tiene permiso para consultar las tarifas.'
        : 'No se pudieron cargar las tarifas. Verifica que se ejecutó el script 19_tarifas.sql y que el backend de SOGO está encendido.';
    }
  }

  roomPrices(): RoomPrice[] {
    return ROOMS.map(r => ({ number: r.number, floor: r.floor, type: r.type, low: r.pricePerNight,
      mid: r.pricePerNightMid ?? r.pricePerNight, high: r.pricePerNightHigh ?? r.pricePerNight }))
      .sort((a, b) => a.number.localeCompare(b.number));
  }

  async saveRates(rates: Rate[]): Promise<void> {
    const saved = await firstValueFrom(this.http.put<Rate[]>(this.base, rates));
    this.rates$.next(RATE_TYPES.map(t => saved.find(r => r.type === t.type) ?? rates.find(r => r.type === t.type)!));
  }

  async saveCalendar(c: SeasonCalendar): Promise<void> {
    const saved = await firstValueFrom(this.http.put<SeasonCalendar>(`${this.base}/temporadas`, c));
    this.calendarSaved = true;
    this.calendar$.next({ ...defaultCalendar(), ...saved });
  }

  /** Guarda los precios por noche de las habitaciones que cambiaron. */
  async saveRoomPrices(prices: RoomPrice[]): Promise<number> {
    let changed = 0;
    for (const p of prices) {
      const room = ROOMS.find(r => r.number === p.number);
      if (!room || (room.pricePerNight === p.low && room.pricePerNightMid === p.mid && room.pricePerNightHigh === p.high)) continue;
      const body = { ...room, pricePerNight: p.low, pricePerNightMid: p.mid, pricePerNightHigh: p.high };
      await firstValueFrom(this.http.put(`${API_URL}/habitaciones/${room.number}`, body));
      Object.assign(room, { pricePerNight: p.low, pricePerNightMid: p.mid, pricePerNightHigh: p.high });
      changed++;
    }
    return changed;
  }

  /** Valor sugerido de una reserva de SOGO con la misma regla que cobra la web. */
  quoteFor(reservationType: string, checkIn: string, nights: number, adults: number, children: number): Quote {
    const rate = this.rates$.value.find(r => r.type === rateTypeOf(reservationType));
    return quote(rate, checkIn, nights, adults, children, this.calendar$.value);
  }
}
