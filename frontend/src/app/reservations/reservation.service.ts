import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Reservation, Payment, PaymentMethod } from './reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { roomsOnFloor } from '../lodging/house';

const F1 = roomsOnFloor(1);
const F2 = roomsOnFloor(2);

type SeedRow = Omit<Reservation, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'docType' | 'plan' | 'observations' | 'extrasAmount' | 'payments'>
  & { paid: number; method?: PaymentMethod; extras?: number; observations?: string; inHouse?: boolean };

// Datos de demostración con fechas relativas a hoy: así los indicadores
// (reservas de hoy, próximas, actuales...) siempre muestran algo coherente,
// sin importar el día en que se abra el sistema. Las habitaciones son las del
// catálogo de la casa (lodging/house.ts), ninguna queda reservada dos veces a
// la vez y los huéspedes caben en su capacidad.
// Los códigos RSV-<año>-00108… son los que referencia el seed del módulo TRA.
function seed(): Reservation[] {
  const year = new Date().getFullYear();
  const rows: SeedRow[] = [
    // Finalizadas
    { guestName: 'Valentina Castro',       docNumber: '1020304050', phone: '+57 322 888 9999', email: 'valentina.castro@email.com', city: 'Colombia - Pereira, Risaralda',  reservationType: 'Grupo familiar',   lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 10, children: 6, infants: 2, checkIn: isoDate(-20), checkOut: isoDate(-18), nights: 2, lodgingAmount: 1360000, extras: 200000, paid: 1560000, method: 'Transferencia', status: 'Finalizada' },
    { guestName: 'Andrés Villa',           docNumber: '1030405060', phone: '+57 317 444 5566', email: 'andres.villa@email.com',     city: 'Colombia - Bogotá, Cundinamarca', reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 5,  children: 0, infants: 0, checkIn: isoDate(-15), checkOut: isoDate(-13), nights: 2, lodgingAmount: 770000,  paid: 770000,  method: 'Transferencia', status: 'Finalizada' },
    { guestName: 'Jorge Martínez',         docNumber: '1040506070', phone: '+57 314 666 7777', email: 'jorge.martinez@email.com',   city: 'Colombia - Cali, Valle del Cauca', reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['103'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(-12), checkOut: isoDate(-10), nights: 2, lodgingAmount: 200000,  paid: 200000,  method: 'Efectivo',      status: 'Finalizada' },
    { guestName: 'Diana Pérez',            docNumber: '1050607080', phone: '+57 318 333 2222', email: 'diana.perez@email.com',      city: 'Colombia - Medellín, Antioquia',  reservationType: 'Grupo familiar',   lodgingType: 'Piso', floor: 1,   rooms: [...F1],        adults: 3,  children: 2, infants: 0, checkIn: isoDate(-9),  checkOut: isoDate(-7),  nights: 2, lodgingAmount: 590000,  paid: 590000,  method: 'Nequi',         status: 'Finalizada' },
    { guestName: 'María José López',       docNumber: '1060708090', phone: '+57 311 222 3333', email: 'mariajose.lopez@email.com',  city: 'Colombia - Armenia, Quindío',     reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 8,  children: 2, infants: 0, checkIn: isoDate(-5),  checkOut: isoDate(-5),  nights: 0, lodgingAmount: 900000,  paid: 900000,  method: 'Daviplata',     status: 'Finalizada' },
    // No se dieron
    { guestName: 'Camilo Herrera',         docNumber: '1070809010', phone: '+57 316 789 0123', email: 'camilo.herrera@email.com',   city: 'Colombia - Manizales, Caldas',    reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['202'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-3),  checkOut: isoDate(-1),  nights: 2, lodgingAmount: 220000,  paid: 0, status: 'No presentada' },
    { guestName: 'Paula Ríos',             docNumber: '1080901020', phone: '+57 315 567 8901', email: 'paula.rios@email.com',       city: 'Colombia - Ibagué, Tolima',       reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['102'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(10),  checkOut: isoDate(12),  nights: 2, lodgingAmount: 150000,  paid: 0, status: 'Cancelada', cancelReason: 'Cambio de planes del huésped' },
    { guestName: 'Sergio Molina',          docNumber: '1090102030', phone: '+57 312 678 9012', email: 'sergio.molina@email.com',    city: 'Colombia - Bogotá, Cundinamarca', reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 6,  children: 0, infants: 0, checkIn: isoDate(14),  checkOut: isoDate(16),  nights: 2, lodgingAmount: 770000,  paid: 0, status: 'Cancelada', cancelReason: 'Solicitud del huésped' },
    // Actuales (en curso o llegando hoy)
    { guestName: 'Laura Torres',           docNumber: '1100203040', phone: '+57 315 555 1212', email: 'laura.torres@email.com',     city: 'Colombia - Bucaramanga, Santander', reservationType: 'Individual',     lodgingType: 'Habitación',    rooms: ['203'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-2),  checkOut: isoDate(0),   nights: 2, lodgingAmount: 230000,  extras: 120000, paid: 350000, method: 'Tarjeta', status: 'Confirmada', inHouse: true },
    { guestName: 'Diego Ramírez',          docNumber: '1110304050', phone: '+57 318 777 8899', email: 'diego.ramirez@email.com',    city: 'Colombia - Pereira, Risaralda',    reservationType: 'Grupo familiar',  lodgingType: 'Habitación',    rooms: ['204'],        adults: 2,  children: 1, infants: 0, checkIn: isoDate(-1),  checkOut: isoDate(2),   nights: 3, lodgingAmount: 240000,  paid: 120000,  method: 'Nequi',  status: 'Confirmada', inHouse: true },
    { guestName: 'Juan Sebastián Pinilla', docNumber: '1120405060', phone: '+57 300 123 4567', email: 'juan.pinilla@email.com',     city: 'Colombia - Armenia, Quindío',      reservationType: 'Grupo familiar',  lodgingType: 'Habitación',    rooms: ['101'],        adults: 2,  children: 2, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(2),   nights: 2, lodgingAmount: 240000,  paid: 240000,  method: 'Nequi',  status: 'Confirmada', inHouse: true, observations: 'El cliente solicitó una cama adicional.' },
    { guestName: 'Ana Gómez',              docNumber: '1130506070', phone: '+57 310 987 6543', email: 'ana.gomez@email.com',        city: 'Colombia - Medellín, Antioquia',   reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['201'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(3),   nights: 3, lodgingAmount: 240000,  paid: 0, status: 'Confirmada' },
    { guestName: 'Mateo Salazar',          docNumber: '1140607080', phone: '+57 313 246 8101', email: 'mateo.salazar@email.com',    city: 'Colombia - Cartagena, Bolívar',    reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['103'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(1),   nights: 1, lodgingAmount: 100000,  paid: 0, status: 'Pendiente' },
    // Próximas
    { guestName: 'Valeria Suárez',         docNumber: '1150708090', phone: '+57 319 135 7911', email: 'valeria.suarez@email.com',   city: 'Colombia - Cali, Valle del Cauca', reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['102'],        adults: 1,  children: 0, infants: 1, checkIn: isoDate(2),   checkOut: isoDate(3),   nights: 1, lodgingAmount: 75000,   paid: 40000,   method: 'Daviplata', status: 'Confirmada' },
    { guestName: 'Carlos Rojas',           docNumber: '1160809010', phone: '+57 320 456 7890', email: 'carlos.rojas@email.com',     city: 'Colombia - Bogotá, Cundinamarca',  reservationType: 'Grupo de trabajo', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 15, children: 0, infants: 0, checkIn: isoDate(4),   checkOut: isoDate(6),   nights: 2, lodgingAmount: 1360000, paid: 1360000, method: 'Transferencia', status: 'Confirmada' },
    { guestName: 'Natalia Gómez',          docNumber: '1170901020', phone: '+57 301 864 2097', email: 'natalia.gomez@email.com',    city: 'Colombia - Neiva, Huila',          reservationType: 'Grupo familiar',  lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 2,  children: 2, infants: 1, checkIn: isoDate(8),   checkOut: isoDate(10),  nights: 2, lodgingAmount: 770000,  paid: 0, status: 'Pendiente' },
    { guestName: 'Felipe Arango',          docNumber: '1180102030', phone: '+57 304 975 3186', email: 'felipe.arango@email.com',    city: 'Colombia - Armenia, Quindío',      reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 14, children: 4, infants: 2, checkIn: isoDate(12),  checkOut: isoDate(12),  nights: 0, lodgingAmount: 1200000, extras: 300000, paid: 750000, method: 'Transferencia', status: 'Confirmada' },
    { guestName: 'Isabella Ramírez',       docNumber: '1190203040', phone: '+57 305 112 3581', email: 'isabella.ramirez@email.com', city: 'Colombia - Pasto, Nariño',         reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['102'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(15),  checkOut: isoDate(17),  nights: 2, lodgingAmount: 150000,  paid: 150000,  method: 'Tarjeta', status: 'Confirmada' },
  ];

  return rows.map(({ paid, method, extras, observations, inHouse, ...r }, i) => {
    const createdAt = `${isoDate(-30 + i)}T10:32`;
    const payments: Payment[] = paid
      ? [{ date: `${isoDate(-29 + i)}T11:02`, method: method ?? 'Efectivo', amount: paid, receipt: String(1200 + i * 7) }]
      : [];
    // Las finalizadas ya entraron y salieron; las marcadas inHouse siguen alojadas
    const finished = r.status === 'Finalizada';
    return {
      ...r,
      checkedInAt: finished || inHouse ? `${r.checkIn}T${r.nights ? '15:00' : '09:00'}` : undefined,
      checkedOutAt: finished ? `${r.checkOut}T${r.nights ? '11:00' : '18:00'}` : undefined,
      id: String(i + 1),
      code: `RSV-${year}-${String(108 + i).padStart(5, '0')}`,
      docType: 'Cédula de Ciudadanía',
      plan: 'Desayuno incluido',
      extrasAmount: extras ?? 0,
      payments,
      observations: observations ?? '',
      createdAt,
      updatedAt: payments[0]?.date ?? createdAt,
    };
  });
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

  // ── Escritura ──
  create(r: Omit<Reservation, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Reservation {
    const lastNumber = Math.max(0, ...this.data.map(x => Number(x.code.split('-').pop())));
    const now = isoDateTime();
    const newR: Reservation = {
      ...r,
      id: String(Date.now()),
      code: `RSV-${new Date().getFullYear()}-${String(lastNumber + 1).padStart(5, '0')}`,
      createdAt: now,
      updatedAt: now,
    };
    this.data = [newR, ...this.data];
    this.reservations$.next(this.data);
    return newR;
  }

  update(id: string, changes: Partial<Reservation>): void {
    this.data = this.data.map(r => r.id === id ? { ...r, ...changes, updatedAt: isoDateTime() } : r);
    this.reservations$.next(this.data);
  }

  addPayment(id: string, payment: Omit<Payment, 'date'>, date = isoDateTime()): void {
    const r = this.getById(id);
    if (!r) return;
    this.update(id, { payments: [...r.payments, { ...payment, date }] });
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
}
