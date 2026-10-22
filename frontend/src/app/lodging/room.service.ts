import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Room, RoomStatus, RoomWithStatus, ManualRoomStatus } from './room.model';
import { ROOMS, FLOORS } from './house';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isInHouse, awaitsCheckIn } from '../reservations/reservation.model';
import { isoDate } from '../shared/date-utils';
import { API_URL } from '../api';

/** Habitación tal como la entrega el backend (tabla `habitaciones`). */
interface RoomDto extends Room {
  dbId: number;
  manualStatus: ManualRoomStatus | null;
}

// Estado en vivo de cada habitación. El catálogo (ROOMS, house.ts) se actualiza con la
// tabla `habitaciones` de la base de datos compartida con la web; las fotos se conservan
// de house.ts. El estado se deriva de las reservas (check-in / llegada del día); solo
// limpieza, mantenimiento y fuera de servicio se asignan a mano y se guardan en la tabla.
@Injectable({ providedIn: 'root' })
export class RoomService {

  private readonly base = `${API_URL}/habitaciones`;
  private rooms: Room[] = ROOMS;
  private manualStatus = new Map<string, ManualRoomStatus>();
  private reservations: Reservation[] = [];
  private roomsWithStatus$ = new BehaviorSubject<RoomWithStatus[]>([]);
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient, private reservationService: ReservationService) {
    this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.refresh();
    });
  }

  /** Primera carga de la sesión actual (el dashboard la espera antes de abrir cualquier módulo). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load();
    }
    return this.loading;
  }

  getAll(): Observable<RoomWithStatus[]> {
    return this.roomsWithStatus$.asObservable();
  }

  getSnapshot(): RoomWithStatus[] {
    return this.roomsWithStatus$.value;
  }

  setManualStatus(roomNumber: string, status: ManualRoomStatus | null): void {
    const room = this.rooms.find(r => r.number === roomNumber);
    if (!room) return;
    status ? this.manualStatus.set(room.id, status) : this.manualStatus.delete(room.id);
    this.refresh();
    this.http.put(`${this.base}/${roomNumber}/estado`, { status }).subscribe({
      error: e => this.fail(`No se pudo guardar el estado de la habitación ${roomNumber}`, e),
    });
  }

  /** El catálogo de la casa cambió (Configuración › Alojamiento): se guarda y se recalculan los estados. */
  catalogChanged(): void {
    this.refresh();
    Promise.all(this.rooms.map(r => firstValueFrom(this.http.put(`${this.base}/${r.number}`, r))))
      .catch(e => this.fail('No se pudo guardar el catálogo de habitaciones', e));
  }

  private statusFor(room: Room): RoomStatus {
    const manual = this.manualStatus.get(room.id);
    if (manual) return manual;

    const uses = (r: Reservation) => r.rooms.includes(room.number);
    if (this.reservations.some(r => uses(r) && isInHouse(r))) return 'Ocupada';

    const today = isoDate(0);
    const arrivingNow = this.reservations.some(r => uses(r) && awaitsCheckIn(r) && r.checkIn <= today && r.checkOut >= today);
    return arrivingNow ? 'Reservada' : 'Disponible';
  }

  private load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return Promise.resolve();
    return firstValueFrom(this.http.get<RoomDto[]>(this.base))
      .then(list => this.merge(list))
      .catch(e => this.fail('No se pudieron cargar las habitaciones', e));
  }

  /**
   * Pasa los datos de la tabla al catálogo en memoria (mismo arreglo ROOMS que leen
   * Reservas, TRA y Reportes). Las fotos y textos de house.ts se conservan si la tabla
   * no trae los suyos; las habitaciones que ya no están en la tabla salen del catálogo.
   */
  private merge(list: RoomDto[]): void {
    const numbers = new Set(list.map(d => d.number));
    for (let i = ROOMS.length - 1; i >= 0; i--) if (!numbers.has(ROOMS[i].number)) ROOMS.splice(i, 1);
    list.forEach(({ dbId, manualStatus, photos, ...d }) => {
      const local = ROOMS.find(r => r.number === d.number);
      const room: Room = {
        ...d,
        description: d.description || local?.description || '',
        services: d.services.length ? d.services : local?.services ?? [],
        beds: d.beds.length ? d.beds : local?.beds ?? [],
        photos: local?.photos.length ? local.photos : [],
      };
      if (local) Object.assign(local, room); else ROOMS.push(room);
      manualStatus ? this.manualStatus.set(room.id, manualStatus) : this.manualStatus.delete(room.id);
    });
    ROOMS.sort((a, b) => a.number.localeCompare(b.number));
    FLOORS.splice(0, FLOORS.length, ...[...new Set(ROOMS.map(r => r.floor))].sort());
    this.refresh();
  }

  private refresh(): void {
    this.roomsWithStatus$.next(this.rooms.map(room => ({ ...room, status: this.statusFor(room) })));
  }

  private fail(message: string, e: any): void {
    console.error(message, e);
    if (e?.status !== 401) toast.error(message, serverMessage(e));
  }
}
