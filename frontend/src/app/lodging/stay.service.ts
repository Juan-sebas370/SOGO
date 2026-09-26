import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Stay } from './stay.model';

@Injectable({ providedIn: 'root' })
export class StayService {

  private data: Stay[] = [
    { id:'1', reservationCode:'RES-00078', guestName:'María López',    roomNumber:'102', roomType:'102 - Doble', checkInDate:'2024-05-24', checkInTime:'14:30', checkOutDate:'2024-05-26', estimatedCheckOut:'2024-05-26', nights:2, guests:2, plan:'Desayuno incluido', docNumber:'1234567890', status:'En hospedaje', observations:'Llegada en la tarde.',  totalAmount:520000 },
    { id:'2', reservationCode:'RES-00077', guestName:'Juan Pérez',     roomNumber:'203', roomType:'203 - Doble',          checkInDate:'2024-05-24', checkInTime:'11:00', checkOutDate:'2024-05-25', estimatedCheckOut:'2024-05-25', nights:1, guests:1, plan:'Solo alojamiento',   docNumber:'9876543210', status:'En hospedaje', observations:'',                    totalAmount:280000 },
    { id:'3', reservationCode:'RES-00076', guestName:'Ana Gómez',      roomNumber:'101', roomType:'101 - Familiar',         checkInDate:'2024-05-25', checkInTime:'15:00', checkOutDate:'2024-05-27', estimatedCheckOut:'2024-05-27', nights:2, guests:1, plan:'Desayuno incluido', docNumber:'1122334455', status:'En hospedaje', observations:'Solicita piso alto.', totalAmount:320000 },
    { id:'4', reservationCode:'RES-00075', guestName:'Carlos Ruiz',    roomNumber:'201', roomType:'201 - Familiar', checkInDate:'2024-05-26', checkInTime:'13:00', checkOutDate:'2024-05-28', estimatedCheckOut:'2024-05-28', nights:2, guests:2, plan:'Todo incluido',     docNumber:'AB123456',   status:'En hospedaje', observations:'',                    totalAmount:680000 },
    { id:'5', reservationCode:'RES-00074', guestName:'Luisa Martínez', roomNumber:'103', roomType:'103 - Doble', checkInDate:'2024-05-27', checkInTime:'16:00', checkOutDate:'2024-05-29', estimatedCheckOut:'2024-05-29', nights:2, guests:2, plan:'Desayuno incluido', docNumber:'5566778899', status:'En hospedaje', observations:'',                    totalAmount:480000 },
    { id:'6', reservationCode:'RES-00073', guestName:'Pedro Castro',   roomNumber:'204', roomType:'204 - Familiar',          checkInDate:'2024-05-28', checkInTime:'10:00', checkOutDate:'2024-06-01', estimatedCheckOut:'2024-06-01', nights:4, guests:3, plan:'Todo incluido',     docNumber:'6677889900', status:'Check-Out',   observations:'Cama extra.',        totalAmount:1200000 },
    { id:'7', reservationCode:'RES-00072', guestName:'Sofía Herrera',  roomNumber:'202', roomType:'202 - Doble',         checkInDate:'2024-05-29', checkInTime:'12:00', checkOutDate:'2024-05-30', estimatedCheckOut:'2024-05-30', nights:1, guests:1, plan:'Solo alojamiento',  docNumber:'7788990011', status:'Finalizado',  observations:'',                    totalAmount:180000 },
  ];

  private stays$ = new BehaviorSubject<Stay[]>(this.data);

  getAll(): Observable<Stay[]> { return this.stays$.asObservable(); }

  getById(id: string): Stay | undefined { return this.data.find(s => s.id === id); }

  getInHouse():   Stay[] { return this.data.filter(s => s.status === 'En hospedaje'); }
  getArrivals():  Stay[] { return this.data.filter(s => s.status === 'Check-In'); }
  getDepartures():Stay[] { return this.data.filter(s => s.status === 'Por salir' || s.status === 'Check-Out'); }
  getHistory():   Stay[] { return this.data.filter(s => s.status === 'Finalizado'); }

  checkIn(id: string, checkInDate: string, checkInTime: string, docNumber: string, guests: number): void {
    this.data = this.data.map(s =>
      s.id === id ? { ...s, status: 'En hospedaje', checkInDate, checkInTime, docNumber, guests } : s
    );
    this.stays$.next(this.data);
  }

  checkOut(id: string, checkOutDate: string, checkOutTime: string, paymentMethod: string, additionalCharges: number): void {
    const stay = this.data.find(s => s.id === id);
    const total = (stay?.totalAmount ?? 0) + additionalCharges;
    this.data = this.data.map(s =>
      s.id === id ? { ...s, status: 'Finalizado', checkOutDate, checkOutTime, paymentMethod, additionalCharges, totalAmount: total } : s
    );
    this.stays$.next(this.data);
  }

  addFromReservation(r: {
    reservationCode: string; guestName: string; roomNumber: string; roomType: string;
    checkInDate: string; checkOutDate: string; nights: number; guests: number;
    plan: string; docNumber: string; observations: string;
  }): Stay {
    const s: Stay = {
      ...r,
      id: String(Date.now()),
      checkInTime: '', estimatedCheckOut: r.checkOutDate,
      status: 'Check-In', totalAmount: 0
    };
    this.data = [s, ...this.data];
    this.stays$.next(this.data);
    return s;
  }
}
