import { Injectable } from '@angular/core';
import { ConceptCategory } from './invoice.model';
import { ReservationService } from '../reservations/reservation.service';
import { isoDate } from '../shared/date-utils';

/** Consumo cargado a la cuenta de una estadía (restaurante, minibar, lavandería...). */
export interface Charge {
  id:            string;
  reservationId: string;
  category:      ConceptCategory;
  description:   string;       // "Restaurante · Desayunos"
  detail:        string;       // "Comanda R-2291", "Inventario · 3 bebidas"
  date:          string;       // YYYY-MM-DD
  quantity:      number;
  unitValue:     number;
}

// Consumos de demostración. Suman exactamente los "servicios adicionales"
// (extrasAmount) de cada reserva, para que Reservas y Facturación cuadren.
function seed(): Charge[] {
  return [
    { id: 'c1', reservationId: '1',  category: 'Restaurante', description: 'Restaurante · Asado de bienvenida', detail: 'Comanda R-2231', date: isoDate(-20), quantity: 1,  unitValue: 200000 },
    { id: 'c2', reservationId: '9',  category: 'Restaurante', description: 'Restaurante · Desayunos',           detail: '2 huéspedes × 2 días', date: isoDate(-1), quantity: 4, unitValue: 15000 },
    { id: 'c3', reservationId: '9',  category: 'Minibar',     description: 'Minibar',                           detail: 'Inventario · 3 bebidas', date: isoDate(-1), quantity: 3, unitValue: 15000 },
    { id: 'c4', reservationId: '9',  category: 'Lavandería',  description: 'Lavandería',                        detail: '1 carga', date: isoDate(-1), quantity: 1, unitValue: 15000 },
    { id: 'c5', reservationId: '17', category: 'Restaurante', description: 'Restaurante · Almuerzo del evento', detail: 'Menú de 30 personas', date: isoDate(12), quantity: 30, unitValue: 10000 },
  ];
}

/**
 * Cuenta de consumos por estadía. Restaurante e Inventarios deben cargar aquí
 * lo que consume el huésped; mientras se integran, los consumos también pueden
 * agregarse desde "Nueva factura → Agregar concepto".
 */
@Injectable({ providedIn: 'root' })
export class ChargeService {

  private data: Charge[] = seed();

  constructor(private reservations: ReservationService) {}

  forReservation(reservationId: string): Charge[] {
    return this.data.filter(c => c.reservationId === reservationId).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Registra un consumo y lo suma a los servicios adicionales de la reserva. */
  add(charge: Omit<Charge, 'id'>): Charge {
    const created: Charge = { ...charge, id: `c${Date.now()}` };
    this.data = [...this.data, created];
    const r = this.reservations.getById(charge.reservationId);
    if (r) this.reservations.update(r.id, { extrasAmount: r.extrasAmount + charge.quantity * charge.unitValue });
    return created;
  }
}
