import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ReservationService } from './reservations/reservation.service';
import { RoomService } from './lodging/room.service';
import { ChargeService } from './billing/charge.service';
import { UsersService } from './users/users.service';
import { PayrollService } from './payroll/payroll.service';
import { InventoryService } from './inventory/inventory.service';
import { DemoImportService } from './shared/demo-import.service';
import { HotelService } from './shared/hotel.service';
import { BillingConfigService } from './billing/billing-config.service';
import { InvoiceService } from './billing/invoice.service';
import { SettingsService } from './settings/settings.service';
import { TraService } from './tra/tra.service';
import { ScheduleService } from './reports/schedule.service';

/**
 * Exige sesión y espera la primera carga de los datos de la base de datos (reservas,
 * habitaciones, consumos, usuarios y roles, empleados y nóminas, inventario, datos del hospedaje,
 * configuración de facturación y facturas): así cualquier
 * pantalla, incluso al recargar en /dashboard/reservations/123, los encuentra al abrirse.
 */
export const authGuard: CanActivateFn = () => {
  const token = localStorage.getItem('sogo_token');
  if (!token) {
    inject(Router).navigate(['/']);
    return false;
  }
  const loads = [inject(ReservationService), inject(RoomService), inject(ChargeService), inject(UsersService), inject(PayrollService), inject(InventoryService),
    inject(HotelService), inject(BillingConfigService), inject(InvoiceService), inject(SettingsService), inject(TraService), inject(ScheduleService)]
    .map(s => s.ready());
  const demo = inject(DemoImportService);
  return Promise.all(loads).then(() => demo.ensure()).then(() => true);
};
