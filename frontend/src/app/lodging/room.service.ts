import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Room, RoomStatus, RoomWithStatus, ManualRoomStatus } from './room.model';
import { ROOMS } from './house';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isInHouse, awaitsCheckIn } from '../reservations/reservation.model';
import { isoDate } from '../shared/date-utils';

// Estado en vivo de cada habitación del catálogo de la casa (house.ts). El estado
// se deriva de las reservas (check-in / llegada del día); solo limpieza,
// mantenimiento y fuera de servicio se asignan a mano desde Alojamiento.
@Injectable({ providedIn: 'root' })
export class RoomService {

  private rooms: Room[] = ROOMS;

  // 202 arranca en limpieza: es la que dejó libre la última estadía de la demo
  private manualStatus = new Map<string, ManualRoomStatus>([['r202', 'En limpieza']]);
  private reservations: Reservation[] = [];
  private roomsWithStatus$ = new BehaviorSubject<RoomWithStatus[]>([]);

  constructor(private reservationService: ReservationService) {
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

  setManualStatus(roomNumber: string, status: ManualRoomStatus | null): void {
    const room = this.rooms.find(r => r.number === roomNumber);
    if (!room) return;
    status ? this.manualStatus.set(room.id, status) : this.manualStatus.delete(room.id);
    this.refresh();
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

  private refresh(): void {
    this.roomsWithStatus$.next(this.rooms.map(room => ({ ...room, status: this.statusFor(room) })));
  }
}
