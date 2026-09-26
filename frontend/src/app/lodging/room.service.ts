import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Room, RoomStatus, RoomWithStatus } from './room.model';
import { StayService } from './stay.service';
import { ROOMS } from './house';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation } from '../reservations/reservation.model';

// Estado en vivo de cada habitación del catálogo de la casa (house.ts).
@Injectable({ providedIn: 'root' })
export class RoomService {

  private rooms: Room[] = ROOMS;

  // Estado manual (limpieza/mantenimiento): lo único que este servicio necesita
  // "recordar" por sí mismo. Ocupada/Reservada/Disponible se derivan en vivo de
  // StayService y ReservationService para que nunca queden desincronizados.
  // La 202 arranca "En limpieza": hoy no tiene huésped y su próxima reserva es en 2 días.
  private manualStatus = new Map<string, 'En limpieza' | 'Mantenimiento'>([['r202', 'En limpieza']]);
  private reservations: Reservation[] = [];

  private roomsWithStatus$ = new BehaviorSubject<RoomWithStatus[]>([]);

  constructor(private stayService: StayService, private reservationService: ReservationService) {
    this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.refresh();
    });
  }

  getAll(): Observable<RoomWithStatus[]> {
    return this.roomsWithStatus$.asObservable();
  }

  getSnapshot(): RoomWithStatus[] {
    return this.roomsWithStatus$.value;
  }

  markCleaning(roomId: string): void {
    this.manualStatus.set(roomId, 'En limpieza');
    this.refresh();
  }

  markMaintenance(roomId: string): void {
    this.manualStatus.set(roomId, 'Mantenimiento');
    this.refresh();
  }

  clearManualStatus(roomId: string): void {
    this.manualStatus.delete(roomId);
    this.refresh();
  }

  private statusFor(room: Room): RoomStatus {
    const manual = this.manualStatus.get(room.id);
    if (manual) return manual;

    const occupied = this.stayService.getInHouse().some(s => s.roomNumber === room.number);
    if (occupied) return 'Ocupada';

    const reserved = this.reservations.some(r =>
      r.rooms.includes(room.number) && (r.status === 'Confirmada' || r.status === 'Pendiente')
    );
    if (reserved) return 'Reservada';

    return 'Disponible';
  }

  private refresh(): void {
    const list: RoomWithStatus[] = this.rooms.map(room => ({ ...room, status: this.statusFor(room) }));
    this.roomsWithStatus$.next(list);
  }
}
