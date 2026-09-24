import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppNotification } from './notification.model';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation } from '../reservations/reservation.model';
import { StayService } from '../lodging/stay.service';
import { RoomService } from '../lodging/room.service';
import { RoomWithStatus } from '../lodging/room.model';
import { InvoiceService } from '../billing/invoice.service';
import { InventoryService } from '../inventory/inventory.service';

// Única fuente de verdad para "qué necesita atención": antes esta lógica vivía
// solo dentro de dashboard-home.component.ts, así que la campana de
// notificaciones del topbar (visible en todas las rutas, no solo en Inicio)
// no tenía datos reales. Ambos consumen este servicio ahora.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private reservations: Reservation[] = [];
  private rooms: RoomWithStatus[] = [];
  private notifications$ = new BehaviorSubject<AppNotification[]>([]);

  constructor(
    private reservationService: ReservationService,
    private stayService: StayService,
    private roomService: RoomService,
    private invoiceService: InvoiceService,
    private inventoryService: InventoryService,
  ) {
    this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.refresh();
    });
    this.roomService.getAll().subscribe(list => {
      this.rooms = list;
      this.refresh();
    });
  }

  getAll(): Observable<AppNotification[]> {
    return this.notifications$.asObservable();
  }

  private refresh(): void {
    const inv = this.inventoryService.getAlerts();
    const invoiceStats = this.invoiceService.getStats();
    const departuresCount = this.stayService.getDepartures().length;
    const pendingReservations = this.reservations.filter(r => r.status === 'Pendiente').length;
    const traPending = this.reservations.filter(r => r.status === 'Confirmada' && this.reservationService.traStatus(r) === 'Pendiente').length;
    const cleaningRooms = this.rooms.filter(r => r.status === 'En limpieza');
    const maintenanceRooms = this.rooms.filter(r => r.status === 'Mantenimiento');

    const list: AppNotification[] = [];

    if (departuresCount > 0) {
      list.push({ icon: 'checkout', level: 'Alta', label: 'Check-out pendiente', detail: `${departuresCount} salida(s) por gestionar`, link: '/dashboard/lodging' });
    }
    cleaningRooms.forEach(r => {
      list.push({ icon: 'cleaning', level: 'Media', label: 'Habitación en limpieza', detail: `Habitación ${r.number} · Piso ${r.floor}`, link: '/dashboard/lodging' });
    });
    maintenanceRooms.forEach(r => {
      list.push({ icon: 'maintenance', level: 'Alta', label: 'Habitación en mantenimiento', detail: `Habitación ${r.number} · Piso ${r.floor}`, link: '/dashboard/lodging' });
    });
    if (traPending > 0) {
      list.push({ icon: 'review', level: 'Media', label: 'TRA pendientes', detail: `${traPending} reserva(s) confirmada(s) sin TRA`, link: '/dashboard/reservations' });
    }
    if (pendingReservations > 0) {
      list.push({ icon: 'review', level: 'Baja', label: 'Reservas por confirmar', detail: `${pendingReservations} reserva(s) pendientes`, link: '/dashboard/reservations' });
    }
    if (inv.critical > 0) {
      list.push({ icon: 'inventory', level: 'Alta', label: 'Productos en estado crítico', detail: `${inv.critical} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    if (inv.low > 0) {
      list.push({ icon: 'inventory', level: 'Media', label: 'Productos con stock bajo', detail: `${inv.low} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    if (inv.expiring > 0) {
      list.push({ icon: 'inventory', level: 'Media', label: 'Productos próximos a vencer', detail: `${inv.expiring} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    if (invoiceStats.pending > 0) {
      list.push({ icon: 'billing', level: 'Media', label: 'Facturas pendientes de pago', detail: `${invoiceStats.pending} factura(s)`, link: '/dashboard/billing' });
    }

    this.notifications$.next(list);
  }
}
