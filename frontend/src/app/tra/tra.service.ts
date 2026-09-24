import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Tra, TraStatus } from './tra.model';

@Injectable({ providedIn: 'root' })
export class TraService {

  private data: Tra[] = [
    { id:'1', code:'TRA-00845', reservationCode:'RES-00078', fullName:'María López García',  docType:'Cédula de Ciudadanía', docNumber:'1234567890', firstName:'María',    lastName:'López García', nationality:'Colombiana', birthDate:'1990-03-15', countryOfResidence:'Colombia', cityOfResidence:'Armenia',  travelReason:'Turismo',  transport:'Aéreo', company:'AV123', roomNumber:'102', roomType:'102 - Doble Estándar', checkInDate:'2024-05-24', checkInTime:'14:30', checkOutDate:'2024-05-26', checkOutTime:'11:15', nights:2, guests:2, plan:'Desayuno incluido', travelPurpose:'Turismo', residenceCountry:'Colombia', age:'34', status:'Generada',  observations:'Llegada en la tarde. Prefiere habitación tranquila.', generatedAt:'2024-05-24T14:30', generatedBy:'Administrador' },
    { id:'2', code:'TRA-00844', reservationCode:'RES-00077', fullName:'Juan Pérez',           docType:'Cédula de Ciudadanía', docNumber:'9876543210', firstName:'Juan',      lastName:'Pérez',        nationality:'Colombiana', birthDate:'1985-07-22', countryOfResidence:'Colombia', cityOfResidence:'Bogotá',   travelReason:'Negocios', transport:'Terrestre', company:'',    roomNumber:'203', roomType:'203 - Suite',          checkInDate:'2024-05-24', checkInTime:'11:00', checkOutDate:'2024-05-25', checkOutTime:'10:00', nights:1, guests:1, plan:'Solo alojamiento', travelPurpose:'Negocios', residenceCountry:'Colombia', age:'39', status:'Generada',  observations:'',                                                    generatedAt:'2024-05-24T11:00', generatedBy:'Administrador' },
    { id:'3', code:'TRA-00843', reservationCode:'RES-00076', fullName:'Ana Gómez',            docType:'Cédula de Ciudadanía', docNumber:'1122334455', firstName:'Ana',       lastName:'Gómez',        nationality:'Colombiana', birthDate:'1995-11-08', countryOfResidence:'Colombia', cityOfResidence:'Medellín', travelReason:'Turismo',  transport:'Terrestre', company:'',    roomNumber:'105', roomType:'105 - Simple',         checkInDate:'2024-05-25', checkInTime:'15:00', checkOutDate:'2024-05-27', checkOutTime:'11:00', nights:2, guests:1, plan:'Desayuno incluido', travelPurpose:'Turismo', residenceCountry:'Colombia', age:'29', status:'Generada',  observations:'Solicita piso alto.',                                 generatedAt:'2024-05-25T15:00', generatedBy:'Administrador' },
    { id:'4', code:'TRA-00842', reservationCode:'RES-00075', fullName:'Carlos Ruiz',          docType:'Pasaporte',            docNumber:'AB123456',   firstName:'Carlos',    lastName:'Ruiz',         nationality:'Mexicana',   birthDate:'1980-04-30', countryOfResidence:'México',   cityOfResidence:'CDMX',     travelReason:'Turismo',  transport:'Aéreo', company:'AM456', roomNumber:'201', roomType:'201 - Doble Estándar', checkInDate:'2024-05-26', checkInTime:'13:00', checkOutDate:'2024-05-28', checkOutTime:'12:00', nights:2, guests:2, plan:'Todo incluido',     travelPurpose:'Turismo', residenceCountry:'México',   age:'44', status:'Generada',  observations:'',                                                    generatedAt:'2024-05-26T13:00', generatedBy:'Administrador' },
    { id:'5', code:'TRA-00841', reservationCode:'RES-00074', fullName:'Luisa Martínez',       docType:'Cédula de Ciudadanía', docNumber:'5566778899', firstName:'Luisa',     lastName:'Martínez',     nationality:'Colombiana', birthDate:'1992-09-14', countryOfResidence:'Colombia', cityOfResidence:'Cali',     travelReason:'Turismo',  transport:'Terrestre', company:'',    roomNumber:'104', roomType:'104 - Doble Estándar', checkInDate:'2024-05-27', checkInTime:'16:00', checkOutDate:'2024-05-29', checkOutTime:'11:00', nights:2, guests:2, plan:'Desayuno incluido', travelPurpose:'Turismo', residenceCountry:'Colombia', age:'32', status:'Pendiente', observations:'',                                                    generatedAt:'2024-05-27T16:00', generatedBy:'Administrador' },
  ];

  private tras$ = new BehaviorSubject<Tra[]>(this.data);

  getAll(): Observable<Tra[]> { return this.tras$.asObservable(); }
  getById(id: string): Tra | undefined { return this.data.find(t => t.id === id); }

  create(t: Omit<Tra, 'id' | 'code' | 'generatedAt'>): Tra {
    const next = this.data.length + 841;
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
