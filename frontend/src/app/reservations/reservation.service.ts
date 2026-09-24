import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Reservation } from './reservation.model';

/** Fecha local en formato YYYY-MM-DD, desplazada `offset` días desde hoy. */
export function isoDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const F1 = ['102', '104', '105', '106'];
const F2 = ['201', '203', '301'];

// Datos de demostración con fechas relativas a hoy: así los indicadores
// (reservas de hoy, próximas, actuales...) siempre muestran algo coherente,
// sin importar el día en que se abra el sistema. Las habitaciones son las del
// catálogo real de RoomService y ninguna queda reservada dos veces a la vez.
function seed(): Reservation[] {
  const year = new Date().getFullYear();
  const base = { docType: 'Cédula de Ciudadanía', plan: 'Desayuno incluido', observations: '' };
  const rows: Omit<Reservation, 'id' | 'code' | 'createdAt' | 'docType' | 'plan' | 'observations'>[] = [
    // Finalizadas
    { guestName: 'Valentina Castro',     docNumber: '1020304050', phone: '+57 322 888 9999', email: 'valentina.castro@email.com', reservationType: 'Grupo familiar',   lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 10, children: 6, infants: 2, checkIn: isoDate(-20), checkOut: isoDate(-18), nights: 2, totalAmount: 3200000, paidAmount: 3200000, status: 'Finalizada', traStatus: 'Completa' },
    { guestName: 'Andrés Villa',         docNumber: '1030405060', phone: '+57 317 444 5566', email: 'andres.villa@email.com',     reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 5,  children: 0, infants: 0, checkIn: isoDate(-15), checkOut: isoDate(-13), nights: 2, totalAmount: 1260000, paidAmount: 1260000, status: 'Finalizada', traStatus: 'Completa' },
    { guestName: 'Jorge Martínez',       docNumber: '1040506070', phone: '+57 314 666 7777', email: 'jorge.martinez@email.com',   reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['105'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(-12), checkOut: isoDate(-10), nights: 2, totalAmount: 320000,  paidAmount: 320000,  status: 'Finalizada', traStatus: 'Completa' },
    { guestName: 'Diana Pérez',          docNumber: '1050607080', phone: '+57 318 333 2222', email: 'diana.perez@email.com',      reservationType: 'Grupo familiar',   lodgingType: 'Piso', floor: 1,   rooms: [...F1],        adults: 3,  children: 2, infants: 0, checkIn: isoDate(-9),  checkOut: isoDate(-7),  nights: 2, totalAmount: 1440000, paidAmount: 1440000, status: 'Finalizada', traStatus: 'Completa' },
    { guestName: 'María José López',     docNumber: '1060708090', phone: '+57 311 222 3333', email: 'mariajose.lopez@email.com',  reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 8,  children: 2, infants: 0, checkIn: isoDate(-5),  checkOut: isoDate(-5),  nights: 0, totalAmount: 900000,  paidAmount: 900000,  status: 'Finalizada', traStatus: 'No aplica' },
    // No se dieron
    { guestName: 'Camilo Herrera',       docNumber: '1070809010', phone: '+57 316 789 0123', email: 'camilo.herrera@email.com',   reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['203'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-3),  checkOut: isoDate(-1),  nights: 2, totalAmount: 560000,  paidAmount: 0,       status: 'No presentada', traStatus: 'No aplica' },
    { guestName: 'Paula Ríos',           docNumber: '1080901020', phone: '+57 315 567 8901', email: 'paula.rios@email.com',       reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['104'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(10),  checkOut: isoDate(12),  nights: 2, totalAmount: 480000,  paidAmount: 0,       status: 'Cancelada', traStatus: 'No aplica', cancelReason: 'Cambio de planes del huésped' },
    { guestName: 'Sergio Molina',        docNumber: '1090102030', phone: '+57 312 678 9012', email: 'sergio.molina@email.com',    reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 6,  children: 0, infants: 0, checkIn: isoDate(14),  checkOut: isoDate(16),  nights: 2, totalAmount: 1260000, paidAmount: 0,       status: 'Cancelada', traStatus: 'No aplica', cancelReason: 'Solicitud del huésped' },
    // Actuales (en curso o llegando hoy)
    { guestName: 'Laura Torres',         docNumber: '1100203040', phone: '+57 315 555 1212', email: 'laura.torres@email.com',     reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['203'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-2),  checkOut: isoDate(1),   nights: 3, totalAmount: 840000,  paidAmount: 840000,  status: 'Confirmada', traStatus: 'Completa' },
    { guestName: 'Diego Ramírez',        docNumber: '1110304050', phone: '+57 318 777 8899', email: 'diego.ramirez@email.com',    reservationType: 'Grupo familiar',   lodgingType: 'Habitación',    rooms: ['301'],        adults: 2,  children: 1, infants: 0, checkIn: isoDate(-1),  checkOut: isoDate(2),   nights: 3, totalAmount: 960000,  paidAmount: 480000,  status: 'Confirmada', traStatus: 'Completa' },
    { guestName: 'Juan Sebastián Pinilla', docNumber: '1120405060', phone: '+57 300 123 4567', email: 'juan.pinilla@email.com',   reservationType: 'Grupo familiar',   lodgingType: 'Habitación',    rooms: ['102', '104'], adults: 2,  children: 2, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(2),   nights: 2, totalAmount: 960000,  paidAmount: 960000,  status: 'Confirmada', traStatus: 'Pendiente' },
    { guestName: 'Ana Gómez',            docNumber: '1130506070', phone: '+57 310 987 6543', email: 'ana.gomez@email.com',        reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['201'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(3),   nights: 3, totalAmount: 720000,  paidAmount: 0,       status: 'Confirmada', traStatus: 'Pendiente' },
    { guestName: 'Mateo Salazar',        docNumber: '1140607080', phone: '+57 313 246 8101', email: 'mateo.salazar@email.com',    reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['105'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(1),   nights: 1, totalAmount: 160000,  paidAmount: 0,       status: 'Pendiente',  traStatus: 'Pendiente' },
    // Próximas
    { guestName: 'Valeria Suárez',       docNumber: '1150708090', phone: '+57 319 135 7911', email: 'valeria.suarez@email.com',   reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['106'],        adults: 1,  children: 0, infants: 1, checkIn: isoDate(2),   checkOut: isoDate(3),   nights: 1, totalAmount: 180000,  paidAmount: 90000,   status: 'Confirmada', traStatus: 'Pendiente' },
    { guestName: 'Carlos Rojas',         docNumber: '1160809010', phone: '+57 320 456 7890', email: 'carlos.rojas@email.com',     reservationType: 'Grupo de trabajo', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 15, children: 0, infants: 0, checkIn: isoDate(4),   checkOut: isoDate(6),   nights: 2, totalAmount: 2700000, paidAmount: 2700000, status: 'Confirmada', traStatus: 'Pendiente' },
    { guestName: 'Natalia Gómez',        docNumber: '1170901020', phone: '+57 301 864 2097', email: 'natalia.gomez@email.com',    reservationType: 'Grupo familiar',   lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 2,  children: 2, infants: 1, checkIn: isoDate(8),   checkOut: isoDate(10),  nights: 2, totalAmount: 1260000, paidAmount: 0,       status: 'Pendiente',  traStatus: 'Pendiente' },
    { guestName: 'Felipe Arango',        docNumber: '1180102030', phone: '+57 304 975 3186', email: 'felipe.arango@email.com',    reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 20, children: 8, infants: 2, checkIn: isoDate(12),  checkOut: isoDate(12),  nights: 0, totalAmount: 1500000, paidAmount: 750000,  status: 'Confirmada', traStatus: 'No aplica' },
    { guestName: 'Isabella Ramírez',     docNumber: '1190203040', phone: '+57 305 112 3581', email: 'isabella.ramirez@email.com', reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['102'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(15),  checkOut: isoDate(17),  nights: 2, totalAmount: 360000,  paidAmount: 360000,  status: 'Confirmada', traStatus: 'Pendiente' },
  ];
  return rows.map((r, i) => ({
    ...base,
    ...r,
    id: String(i + 1),
    code: `RSV-${year}-${String(108 + i).padStart(5, '0')}`,
    createdAt: `${isoDate(-30 + i)}T09:00`,
  }));
}

@Injectable({ providedIn: 'root' })
export class ReservationService {

  private data: Reservation[] = seed();
  private reservations$ = new BehaviorSubject<Reservation[]>(this.data);

  getAll(): Observable<Reservation[]> {
    return this.reservations$.asObservable();
  }

  getSnapshot(): Reservation[] {
    return this.data;
  }

  getById(id: string): Reservation | undefined {
    return this.data.find(r => r.id === id);
  }

  create(r: Omit<Reservation, 'id' | 'code' | 'createdAt'>): Reservation {
    const lastNumber = Math.max(0, ...this.data.map(x => Number(x.code.split('-').pop())));
    const newR: Reservation = {
      ...r,
      id: String(Date.now()),
      code: `RSV-${new Date().getFullYear()}-${String(lastNumber + 1).padStart(5, '0')}`,
      createdAt: new Date().toISOString()
    };
    this.data = [newR, ...this.data];
    this.reservations$.next(this.data);
    return newR;
  }

  update(id: string, changes: Partial<Reservation>): void {
    this.data = this.data.map(r => r.id === id ? { ...r, ...changes } : r);
    this.reservations$.next(this.data);
  }

  cancel(id: string, reason: string): void {
    this.update(id, { status: 'Cancelada', traStatus: 'No aplica', cancelReason: reason });
  }
}
