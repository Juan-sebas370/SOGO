import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Room, RoomStatus, RoomWithStatus } from './room.model';
import { StayService } from './stay.service';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation } from '../reservations/reservation.model';

// El catálogo de habitaciones no existe todavía como entidad propia en el resto del
// proyecto (Reservation/Stay solo guardan roomNumber como texto libre). Este servicio
// lo modela por primera vez, usando los mismos números de habitación que ya aparecen
// en los datos mock de reservas/estadías para que ambos lados coincidan.
@Injectable({ providedIn: 'root' })
export class RoomService {

  private rooms: Room[] = [
    { id:'r1', number:'102', floor:1, type:'Doble Estándar', capacity:2 },
    { id:'r2', number:'104', floor:1, type:'Doble Estándar', capacity:2 },
    { id:'r3', number:'105', floor:1, type:'Simple',         capacity:1 },
    { id:'r4', number:'106', floor:1, type:'Simple',         capacity:1 },
    { id:'r5', number:'201', floor:2, type:'Doble Estándar', capacity:2 },
    { id:'r6', number:'203', floor:2, type:'Suite',          capacity:2 },
    { id:'r7', number:'301', floor:2, type:'Suite',          capacity:3 },
  ];

  // Estado manual (limpieza/mantenimiento): lo único que este servicio necesita
  // "recordar" por sí mismo. Ocupada/Reservada/Disponible se derivan en vivo de
  // StayService y ReservationService para que nunca queden desincronizados.
  // r4 (106) arranca "En limpieza": su estadía mock ya está 'Finalizado' (el huésped
  // se fue), así que es el caso real más plausible para la demo, a diferencia de
  // marcar una habitación que todavía tiene un huésped alojado.
  private manualStatus = new Map<string, 'En limpieza' | 'Mantenimiento'>([['r4', 'En limpieza']]);
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
