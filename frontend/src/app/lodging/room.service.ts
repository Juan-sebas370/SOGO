import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Room, RoomStatus, RoomWithStatus, ManualRoomStatus } from './room.model';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isInHouse, awaitsCheckIn } from '../reservations/reservation.model';
import { isoDate } from '../shared/date-utils';

// Catálogo de habitaciones del hospedaje. El estado de cada una se deriva en vivo
// de las reservas (check-in / llegada del día); solo limpieza, mantenimiento y
// fuera de servicio se asignan a mano desde Alojamiento.
@Injectable({ providedIn: 'root' })
export class RoomService {

  // Piso 1: 3 habitaciones · 8 personas · 3 camas dobles · 1 camarote
  // Piso 2: 4 habitaciones · 12 personas · 4 camas dobles · 2 camarotes
  // Casa completa: 7 habitaciones · 20 personas · 7 camas dobles · 3 camarotes
  private rooms: Room[] = [
    { id: 'r101', number: '101', floor: 1, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
      photos: ['assets/piso1/hab101.jpg'],
      pricePerNight: 120000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
      description: 'Habitación principal del piso 1 con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor.' },
    { id: 'r102', number: '102', floor: 1, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '103',
      photos: ['assets/piso1/hab102.jpg'],
      pricePerNight: 75000, services: ['WiFi gratis'],
      description: 'Habitación simple con vista a la calle.' },
    { id: 'r103', number: '103', floor: 1, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '102',
      photos: ['assets/piso1/hab103.jpg'],
      pricePerNight: 100000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
      description: 'Habitación doble con cama matrimonial. Comparte baño con la habitación 102. Ambiente tranquilo y acogedor.' },
    { id: 'r201', number: '201', floor: 2, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
      photos: ['assets/piso2/hab201.jpeg', 'assets/piso2/hab201-2.jpeg', 'assets/piso2/hab201-3.jpeg'],
      pricePerNight: 80000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
      description: 'Habitación con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor y tranquilo.' },
    { id: 'r202', number: '202', floor: 2, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '203',
      photos: ['assets/piso2/hab202.jpeg', 'assets/piso2/hab202-2.jpeg', 'assets/piso2/hab202-3.jpeg'],
      pricePerNight: 110000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada'],
      description: 'Habitación doble acogedora con cama matrimonial. Comparte baño con la habitación 203. Perfecta para parejas.' },
    { id: 'r203', number: '203', floor: 2, type: 'Doble', capacity: 2, beds: ['1 cama doble'], bathroom: 'Compartido', sharesBathWith: '202',
      photos: ['assets/piso2/hab203.jpg'],
      pricePerNight: 115000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
      description: 'Habitación doble con cama matrimonial y ambiente tranquilo. Comparte baño con la habitación 202. Vistas al entorno cafetero.' },
    { id: 'r204', number: '204', floor: 2, type: 'Familiar', capacity: 4, beds: ['1 cama doble', '1 camarote'], bathroom: 'Privado',
      photos: ['assets/piso2/hab204.jpg'],
      pricePerNight: 80000, services: ['WiFi gratis', 'Agua caliente', 'Cocina equipada', 'Lavandería'],
      description: 'Habitación con cama doble y camarote. Baño privado, ideal para 4 personas en un ambiente acogedor y tranquilo.' },
  ];

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
