import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppNotification } from './notification.model';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isInHouse } from '../reservations/reservation.model';
import { RoomService } from '../lodging/room.service';
import { isoDate } from '../shared/date-utils';
import { RoomWithStatus } from '../lodging/room.model';
import { InvoiceService } from '../billing/invoice.service';
import { InventoryService } from '../inventory/inventory.service';
import { TraService, TraRow } from '../tra/tra.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { ScheduleService } from '../reports/schedule.service';
import { failed } from '../reports/schedule.model';
import { SettingsService, AlertKey } from '../settings/settings.service';
import { UsersService } from '../users/users.service';

// Única fuente de verdad para "qué necesita atención": antes esta lógica vivía
// solo dentro de dashboard-home.component.ts, así que la campana de
// notificaciones del topbar (visible en todas las rutas, no solo en Inicio)
// no tenía datos reales. Ambos consumen este servicio ahora.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private reservations: Reservation[] = [];
  private rooms: RoomWithStatus[] = [];
  private traRows: TraRow[] = [];
  private notifications$ = new BehaviorSubject<AppNotification[]>([]);

  constructor(
    private reservationService: ReservationService,
    private roomService: RoomService,
    private invoiceService: InvoiceService,
    private inventoryService: InventoryService,
    private traService: TraService,
    private restaurantService: RestaurantService,
    private scheduleService: ScheduleService,
    private settings: SettingsService,
    private users: UsersService,
  ) {
    this.settings.changes().subscribe(() => this.refresh());
    this.users.getUsers().subscribe(() => this.refresh());
    this.scheduleService.getExecutions().subscribe(() => this.refresh());
    this.restaurantService.getProducts().subscribe(() => this.refresh());
    this.inventoryService.getAlerts().subscribe(() => this.refresh());
    this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.refresh();
    });
    this.roomService.getAll().subscribe(list => {
      this.rooms = list;
      this.refresh();
    });
    this.traService.getRows().subscribe(rows => {
      this.traRows = rows;
      this.refresh();
    });
  }

  getAll(): Observable<AppNotification[]> {
    return this.notifications$.asObservable();
  }

  private refresh(): void {
    const inv = this.inventoryService.getAlertSummary();
    const invoiceStats = this.invoiceService.getStats();
    // Huéspedes alojados cuya salida prevista ya llegó (hoy o antes)
    const departuresCount = this.reservations.filter(r => isInHouse(r) && r.checkOut <= isoDate(0)).length;
    const pendingReservations = this.reservations.filter(r => r.status === 'Pendiente').length;
    const traErrors = this.traRows.filter(t => t.status === 'ERROR').length;
    const traToFix = this.traRows.filter(t => t.status === 'REQUIERE_CORRECCION').length;
    const cleaningRooms = this.rooms.filter(r => r.status === 'En limpieza');
    const maintenanceRooms = this.rooms.filter(r => r.status === 'En mantenimiento' || r.status === 'Fuera de servicio');

    const list: AppNotification[] = [];
    // Cada alerta se muestra solo si está activa «En SOGO» (Configuración › Notificaciones)
    const on = (key: AlertKey) => this.settings.inApp(key);

    if (on('arrivals') && departuresCount > 0) {
      list.push({ icon: 'checkout', level: 'Alta', label: 'Check-out pendiente', detail: `${departuresCount} salida(s) por gestionar`, link: '/dashboard/lodging/recepcion' });
    }
    cleaningRooms.forEach(r => {
      list.push({ icon: 'cleaning', level: 'Media', label: 'Habitación en limpieza', detail: `Habitación ${r.number} · Piso ${r.floor}`, link: '/dashboard/lodging' });
    });
    maintenanceRooms.forEach(r => {
      list.push({ icon: 'maintenance', level: 'Alta', label: `Habitación ${r.status.toLowerCase()}`, detail: `Habitación ${r.number} · Piso ${r.floor}`, link: '/dashboard/lodging' });
    });
    if (on('tra') && traErrors > 0) {
      list.push({ icon: 'review', level: 'Alta', label: 'TRA con error de envío', detail: `${traErrors} TRA sin reportar al MinCIT`, link: '/dashboard/tra' });
    }
    if (on('tra') && traToFix > 0) {
      list.push({ icon: 'review', level: 'Media', label: 'TRA por corregir', detail: `${traToFix} TRA con datos faltantes`, link: '/dashboard/tra' });
    }
    if (on('reservations') && pendingReservations > 0) {
      list.push({ icon: 'review', level: 'Baja', label: 'Reservas por confirmar', detail: `${pendingReservations} reserva(s) pendientes`, link: '/dashboard/reservations' });
    }
    if (on('stock') && inv.critical > 0) {
      list.push({ icon: 'inventory', level: 'Alta', label: 'Productos agotados', detail: `${inv.critical} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    if (on('stock') && inv.low > 0) {
      list.push({ icon: 'inventory', level: 'Media', label: 'Productos con stock bajo', detail: `${inv.low} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    if (on('expiry') && inv.expiring > 0) {
      list.push({ icon: 'inventory', level: 'Media', label: 'Productos próximos a vencer', detail: `${inv.expiring} producto(s)`, link: '/dashboard/inventory/alerts' });
    }
    const menu = this.restaurantService.getStats();
    if (on('stock') && menu.outOfStock > 0) {
      list.push({ icon: 'inventory', level: 'Alta', label: 'Productos del menú agotados', detail: `${menu.outOfStock} producto(s) bloqueados en pedidos`, link: '/dashboard/restaurant/availability' });
    }
    if (on('stock') && menu.lowStock > 0) {
      list.push({ icon: 'inventory', level: 'Media', label: 'Menú con existencias bajas', detail: `${menu.lowStock} producto(s) bajo el mínimo`, link: '/dashboard/restaurant/availability' });
    }
    // Envíos automáticos de reportes que fallaron y no se han reintentado con éxito
    if (on('report-failed')) this.scheduleService.openFailures().forEach(e => {
      list.push({ icon: 'review', level: 'Alta', label: 'Envío de reporte fallido', detail: `«${e.name}» no llegó a ${failed(e).map(d => d.email).join(', ')}`, link: '/dashboard/reports/scheduled' });
    });
    if (on('invoice-rejected') && invoiceStats.rejected > 0) {
      list.push({ icon: 'billing', level: 'Alta', label: 'Factura rechazada por la DIAN', detail: `${invoiceStats.rejected} factura(s) por corregir`, link: '/dashboard/billing' });
    }
    const validating = this.invoiceService.getSnapshot().filter(i => i.dianStatus === 'En validación' && !i.annulment).length;
    if (on('invoice-rejected') && validating > 0) {
      list.push({ icon: 'billing', level: 'Media', label: 'Facturas sin respuesta de la DIAN', detail: `${validating} factura(s): registra el CUFE o el rechazo`, link: '/dashboard/billing' });
    }
    const range = this.invoiceService.rangeUsage();
    if (on('invoice-range') && range.used / Math.max(1, range.used + range.left) >= 0.8) {
      list.push({ icon: 'billing', level: 'Alta', label: 'Rango de facturación al 80 %', detail: `Quedan ${range.left} consecutivos`, link: '/dashboard/billing/settings' });
    }
    const blocked = this.users.usersSnapshot().filter(u => u.status === 'Bloqueado');
    if (on('accounts') && blocked.length) {
      list.push({ icon: 'review', level: 'Alta', label: 'Cuenta bloqueada', detail: blocked.map(u => u.username).join(', '), link: '/dashboard/users/status' });
    }
    if (invoiceStats.pending > 0) {
      list.push({ icon: 'billing', level: 'Media', label: 'Facturas pendientes de pago', detail: `${invoiceStats.pending} factura(s)`, link: '/dashboard/billing' });
    }

    this.notifications$.next(list);
  }
}
