import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Reservation, Payment, PaymentMethod, ReservationTraStatus, isVoid } from './reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { TraService } from '../tra/tra.service';
import { Tra } from '../tra/tra.model';

const F1 = ['102', '104', '105', '106'];
const F2 = ['201', '203', '301'];

type SeedRow = Omit<Reservation, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'docType' | 'plan' | 'observations' | 'extrasAmount' | 'payments'>
  & { paid: number; method?: PaymentMethod; extras?: number; observations?: string };

// Datos de demostración con fechas relativas a hoy: así los indicadores
// (reservas de hoy, próximas, actuales...) siempre muestran algo coherente,
// sin importar el día en que se abra el sistema. Las habitaciones son las del
// catálogo real de RoomService y ninguna queda reservada dos veces a la vez.
// Los códigos RSV-<año>-00108… son los que referencia el seed de TraService.
function seed(): Reservation[] {
  const year = new Date().getFullYear();
  const rows: SeedRow[] = [
    // Finalizadas
    { guestName: 'Valentina Castro',       docNumber: '1020304050', phone: '+57 322 888 9999', email: 'valentina.castro@email.com', city: 'Colombia - Pereira, Risaralda',  reservationType: 'Grupo familiar',   lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 10, children: 6, infants: 2, checkIn: isoDate(-20), checkOut: isoDate(-18), nights: 2, lodgingAmount: 3000000, extras: 200000, paid: 3200000, method: 'Transferencia', status: 'Finalizada' },
    { guestName: 'Andrés Villa',           docNumber: '1030405060', phone: '+57 317 444 5566', email: 'andres.villa@email.com',     city: 'Colombia - Bogotá, Cundinamarca', reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 5,  children: 0, infants: 0, checkIn: isoDate(-15), checkOut: isoDate(-13), nights: 2, lodgingAmount: 1260000, paid: 1260000, method: 'Transferencia', status: 'Finalizada' },
    { guestName: 'Jorge Martínez',         docNumber: '1040506070', phone: '+57 314 666 7777', email: 'jorge.martinez@email.com',   city: 'Colombia - Cali, Valle del Cauca', reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['105'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(-12), checkOut: isoDate(-10), nights: 2, lodgingAmount: 320000,  paid: 320000,  method: 'Efectivo',      status: 'Finalizada' },
    { guestName: 'Diana Pérez',            docNumber: '1050607080', phone: '+57 318 333 2222', email: 'diana.perez@email.com',      city: 'Colombia - Medellín, Antioquia',  reservationType: 'Grupo familiar',   lodgingType: 'Piso', floor: 1,   rooms: [...F1],        adults: 3,  children: 2, infants: 0, checkIn: isoDate(-9),  checkOut: isoDate(-7),  nights: 2, lodgingAmount: 1440000, paid: 1440000, method: 'Nequi',         status: 'Finalizada' },
    { guestName: 'María José López',       docNumber: '1060708090', phone: '+57 311 222 3333', email: 'mariajose.lopez@email.com',  city: 'Colombia - Armenia, Quindío',     reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 8,  children: 2, infants: 0, checkIn: isoDate(-5),  checkOut: isoDate(-5),  nights: 0, lodgingAmount: 900000,  paid: 900000,  method: 'Daviplata',     status: 'Finalizada' },
    // No se dieron
    { guestName: 'Camilo Herrera',         docNumber: '1070809010', phone: '+57 316 789 0123', email: 'camilo.herrera@email.com',   city: 'Colombia - Manizales, Caldas',    reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['203'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-3),  checkOut: isoDate(-1),  nights: 2, lodgingAmount: 560000,  paid: 0, status: 'No presentada' },
    { guestName: 'Paula Ríos',             docNumber: '1080901020', phone: '+57 315 567 8901', email: 'paula.rios@email.com',       city: 'Colombia - Ibagué, Tolima',       reservationType: 'Individual',       lodgingType: 'Habitación',    rooms: ['104'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(10),  checkOut: isoDate(12),  nights: 2, lodgingAmount: 480000,  paid: 0, status: 'Cancelada', cancelReason: 'Cambio de planes del huésped' },
    { guestName: 'Sergio Molina',          docNumber: '1090102030', phone: '+57 312 678 9012', email: 'sergio.molina@email.com',    city: 'Colombia - Bogotá, Cundinamarca', reservationType: 'Grupo de trabajo', lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 6,  children: 0, infants: 0, checkIn: isoDate(14),  checkOut: isoDate(16),  nights: 2, lodgingAmount: 1260000, paid: 0, status: 'Cancelada', cancelReason: 'Solicitud del huésped' },
    // Actuales (en curso o llegando hoy)
    { guestName: 'Laura Torres',           docNumber: '1100203040', phone: '+57 315 555 1212', email: 'laura.torres@email.com',     city: 'Colombia - Bucaramanga, Santander', reservationType: 'Individual',     lodgingType: 'Habitación',    rooms: ['203'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(-2),  checkOut: isoDate(1),   nights: 3, lodgingAmount: 840000,  extras: 120000, paid: 960000, method: 'Tarjeta', status: 'Confirmada' },
    { guestName: 'Diego Ramírez',          docNumber: '1110304050', phone: '+57 318 777 8899', email: 'diego.ramirez@email.com',    city: 'Colombia - Pereira, Risaralda',    reservationType: 'Grupo familiar',  lodgingType: 'Habitación',    rooms: ['301'],        adults: 2,  children: 1, infants: 0, checkIn: isoDate(-1),  checkOut: isoDate(2),   nights: 3, lodgingAmount: 960000,  paid: 480000,  method: 'Nequi',  status: 'Confirmada' },
    { guestName: 'Juan Sebastián Pinilla', docNumber: '1120405060', phone: '+57 300 123 4567', email: 'juan.pinilla@email.com',     city: 'Colombia - Armenia, Quindío',      reservationType: 'Grupo familiar',  lodgingType: 'Habitación',    rooms: ['102', '104'], adults: 2,  children: 2, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(2),   nights: 2, lodgingAmount: 800000,  paid: 800000,  method: 'Nequi',  status: 'Confirmada', observations: 'El cliente solicitó una cama adicional.' },
    { guestName: 'Ana Gómez',              docNumber: '1130506070', phone: '+57 310 987 6543', email: 'ana.gomez@email.com',        city: 'Colombia - Medellín, Antioquia',   reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['201'],        adults: 2,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(3),   nights: 3, lodgingAmount: 720000,  paid: 0, status: 'Confirmada' },
    { guestName: 'Mateo Salazar',          docNumber: '1140607080', phone: '+57 313 246 8101', email: 'mateo.salazar@email.com',    city: 'Colombia - Cartagena, Bolívar',    reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['105'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(0),   checkOut: isoDate(1),   nights: 1, lodgingAmount: 160000,  paid: 0, status: 'Pendiente' },
    // Próximas
    { guestName: 'Valeria Suárez',         docNumber: '1150708090', phone: '+57 319 135 7911', email: 'valeria.suarez@email.com',   city: 'Colombia - Cali, Valle del Cauca', reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['106'],        adults: 1,  children: 0, infants: 1, checkIn: isoDate(2),   checkOut: isoDate(3),   nights: 1, lodgingAmount: 180000,  paid: 90000,   method: 'Daviplata', status: 'Confirmada' },
    { guestName: 'Carlos Rojas',           docNumber: '1160809010', phone: '+57 320 456 7890', email: 'carlos.rojas@email.com',     city: 'Colombia - Bogotá, Cundinamarca',  reservationType: 'Grupo de trabajo', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 15, children: 0, infants: 0, checkIn: isoDate(4),   checkOut: isoDate(6),   nights: 2, lodgingAmount: 2700000, paid: 2700000, method: 'Transferencia', status: 'Confirmada' },
    { guestName: 'Natalia Gómez',          docNumber: '1170901020', phone: '+57 301 864 2097', email: 'natalia.gomez@email.com',    city: 'Colombia - Neiva, Huila',          reservationType: 'Grupo familiar',  lodgingType: 'Piso', floor: 2,   rooms: [...F2],        adults: 2,  children: 2, infants: 1, checkIn: isoDate(8),   checkOut: isoDate(10),  nights: 2, lodgingAmount: 1260000, paid: 0, status: 'Pendiente' },
    { guestName: 'Felipe Arango',          docNumber: '1180102030', phone: '+57 304 975 3186', email: 'felipe.arango@email.com',    city: 'Colombia - Armenia, Quindío',      reservationType: 'Evento / Pasadía', lodgingType: 'Casa completa', rooms: [...F1, ...F2], adults: 20, children: 8, infants: 2, checkIn: isoDate(12),  checkOut: isoDate(12),  nights: 0, lodgingAmount: 1200000, extras: 300000, paid: 750000, method: 'Transferencia', status: 'Confirmada' },
    { guestName: 'Isabella Ramírez',       docNumber: '1190203040', phone: '+57 305 112 3581', email: 'isabella.ramirez@email.com', city: 'Colombia - Pasto, Nariño',         reservationType: 'Individual',      lodgingType: 'Habitación',    rooms: ['102'],        adults: 1,  children: 0, infants: 0, checkIn: isoDate(15),  checkOut: isoDate(17),  nights: 2, lodgingAmount: 360000,  paid: 360000,  method: 'Tarjeta', status: 'Confirmada' },
  ];

  return rows.map(({ paid, method, extras, observations, ...r }, i) => {
    const createdAt = `${isoDate(-30 + i)}T10:32`;
    const payments: Payment[] = paid
      ? [{ date: `${isoDate(-29 + i)}T11:02`, method: method ?? 'Efectivo', amount: paid, receipt: String(1200 + i * 7) }]
      : [];
    return {
      ...r,
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
  private tras: Tra[] = [];
  private reservations$ = new BehaviorSubject<Reservation[]>(this.data);

  constructor(private traService: TraService) {
    // El estado TRA de cada reserva sale del módulo TRA: si allí se registra o
    // anula un TRA, las pantallas de reservas deben enterarse.
    this.traService.getAll().subscribe(list => {
      this.tras = list;
      this.reservations$.next(this.data);
    });
  }

  getAll(): Observable<Reservation[]> {
    return this.reservations$.asObservable();
  }

  getSnapshot(): Reservation[] {
    return this.data;
  }

  getById(id: string): Reservation | undefined {
    return this.data.find(r => r.id === id);
  }

  // ── TRA ──
  /** TRA vigente de la reserva (el más reciente que no esté anulado). */
  traFor(r: Reservation): Tra | undefined {
    return this.tras.find(t => t.reservationCode === r.code && t.status !== 'Anulada');
  }

  traStatus(r: Reservation): ReservationTraStatus {
    if (isVoid(r) || r.reservationType === 'Evento / Pasadía') return 'No aplica';
    return this.traFor(r)?.status === 'Generada' ? 'Completa' : 'Pendiente';
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

  addPayment(id: string, payment: Omit<Payment, 'date'>): void {
    const r = this.getById(id);
    if (!r) return;
    this.update(id, { payments: [...r.payments, { ...payment, date: isoDateTime() }] });
  }

  cancel(id: string, reason: string): void {
    this.update(id, { status: 'Cancelada', cancelReason: reason });
  }
}
