import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Tra } from './tra.model';
import { isoDate } from '../shared/date-utils';

type TraSeed = Pick<Tra, 'fullName' | 'docNumber' | 'firstName' | 'lastName' | 'cityOfResidence' | 'travelReason' | 'transport'
  | 'roomNumber' | 'roomType' | 'nights' | 'guests' | 'age' | 'status' | 'observations'> & { res: number; inOffset: number };

// Cada TRA apunta a una reserva real de ReservationService (RSV-<año>-00108…),
// con el mismo huésped, habitaciones y fechas relativas a hoy. De aquí sale el
// estado "TRA" que muestran el listado y el detalle de reservas.
function seed(): Tra[] {
  const year = new Date().getFullYear();
  const rows: TraSeed[] = [
    { res: 118, inOffset: 0,   fullName: 'Juan Sebastián Pinilla', docNumber: '1120405060', firstName: 'Juan Sebastián', lastName: 'Pinilla',  cityOfResidence: 'Armenia',     travelReason: 'Turismo',  transport: 'Terrestre', roomNumber: '102, 104', roomType: '2 habitaciones', nights: 2, guests: 4,  age: '31', status: 'Pendiente', observations: 'Falta registrar acompañantes.' },
    { res: 117, inOffset: -1,  fullName: 'Diego Ramírez',          docNumber: '1110304050', firstName: 'Diego',          lastName: 'Ramírez',  cityOfResidence: 'Pereira',     travelReason: 'Turismo',  transport: 'Terrestre', roomNumber: '301',      roomType: 'Hab. 301',       nights: 3, guests: 3,  age: '38', status: 'Generada',  observations: '' },
    { res: 116, inOffset: -2,  fullName: 'Laura Torres',           docNumber: '1100203040', firstName: 'Laura',          lastName: 'Torres',   cityOfResidence: 'Bucaramanga', travelReason: 'Negocios', transport: 'Aéreo',     roomNumber: '203',      roomType: 'Hab. 203',       nights: 3, guests: 2,  age: '29', status: 'Generada',  observations: '' },
    { res: 111, inOffset: -9,  fullName: 'Diana Pérez',            docNumber: '1050607080', firstName: 'Diana',          lastName: 'Pérez',    cityOfResidence: 'Medellín',    travelReason: 'Turismo',  transport: 'Terrestre', roomNumber: '102, 104, 105, 106', roomType: 'Piso 1', nights: 2, guests: 5,  age: '42', status: 'Generada',  observations: '' },
    { res: 110, inOffset: -12, fullName: 'Jorge Martínez',         docNumber: '1040506070', firstName: 'Jorge',          lastName: 'Martínez', cityOfResidence: 'Cali',        travelReason: 'Negocios', transport: 'Aéreo',     roomNumber: '105',      roomType: 'Hab. 105',       nights: 2, guests: 1,  age: '35', status: 'Generada',  observations: '' },
    { res: 109, inOffset: -15, fullName: 'Andrés Villa',           docNumber: '1030405060', firstName: 'Andrés',         lastName: 'Villa',    cityOfResidence: 'Bogotá',      travelReason: 'Negocios', transport: 'Terrestre', roomNumber: '201, 203, 301', roomType: 'Piso 2',   nights: 2, guests: 5,  age: '45', status: 'Generada',  observations: '' },
    { res: 108, inOffset: -20, fullName: 'Valentina Castro',       docNumber: '1020304050', firstName: 'Valentina',      lastName: 'Castro',   cityOfResidence: 'Pereira',     travelReason: 'Turismo',  transport: 'Terrestre', roomNumber: 'P1 + P2',  roomType: 'Casa completa',  nights: 2, guests: 18, age: '40', status: 'Generada',  observations: 'Grupo familiar.' },
  ];
  return rows.map(({ res, inOffset, ...t }, i) => ({
    ...t,
    id: String(i + 1),
    code: `TRA-${String(851 - i).padStart(5, '0')}`,
    reservationCode: `RSV-${year}-${String(res).padStart(5, '0')}`,
    docType: 'Cédula de Ciudadanía',
    nationality: 'Colombiana',
    birthDate: `${year - Number(t.age)}-03-15`,
    countryOfResidence: 'Colombia',
    company: '',
    checkInDate: isoDate(inOffset),
    checkInTime: '15:00',
    checkOutDate: isoDate(inOffset + t.nights),
    checkOutTime: '11:00',
    plan: 'Desayuno incluido',
    travelPurpose: t.travelReason,
    residenceCountry: 'Colombia',
    generatedAt: `${isoDate(inOffset)}T15:20`,
    generatedBy: 'Administrador',
  }));
}

@Injectable({ providedIn: 'root' })
export class TraService {

  private data: Tra[] = seed();


  private tras$ = new BehaviorSubject<Tra[]>(this.data);

  getAll(): Observable<Tra[]> { return this.tras$.asObservable(); }
  getById(id: string): Tra | undefined { return this.data.find(t => t.id === id); }

  create(t: Omit<Tra, 'id' | 'code' | 'generatedAt'>): Tra {
    const next = Math.max(0, ...this.data.map(x => Number(x.code.split('-').pop()))) + 1;
    const newT: Tra = {
      ...t,
      id: String(Date.now()),
      code: `TRA-${String(next).padStart(5, '0')}`,
      generatedAt: new Date().toISOString()
    };
    this.data = [newT, ...this.data];
    this.tras$.next(this.data);
    return newT;
  }

  update(id: string, changes: Partial<Tra>): void {
    this.data = this.data.map(t => t.id === id ? { ...t, ...changes } : t);
    this.tras$.next(this.data);
  }

  annul(id: string): void { this.update(id, { status: 'Anulada' }); }

  getStats() {
    const total    = this.data.length;
    const generated= this.data.filter(t => t.status === 'Generada').length;
    const annulled = this.data.filter(t => t.status === 'Anulada').length;
    const pending  = this.data.filter(t => t.status === 'Pendiente').length;
    const guests   = this.data.reduce((a, t) => a + t.guests, 0);
    const nights   = this.data.reduce((a, t) => a + t.nights, 0);
    const avgNights= total > 0 ? (nights / total).toFixed(2) : '0';
    return { total, generated, annulled, pending, guests, nights, avgNights };
  }
}
