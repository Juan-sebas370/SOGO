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

/** Tiempo máximo para la primera carga (el plan gratis de Render puede tardar ~1 min en despertar). */
const LOAD_TIMEOUT_MS = 60_000;

/** Claves de la sesión en localStorage: si la carga falla se borran para volver a un ingreso limpio. */
const SESSION_KEYS = ['sogo_token', 'sogo_role', 'sogo_username', 'sogo_fullname', 'sogo_email'];

/** Motivo de la última carga fallida; lo muestra la pantalla de ingreso. */
export const LOAD_ERROR_KEY = 'sogo_load_error';

/** Explica en pocas palabras por qué falló una carga (estado HTTP o sin conexión). */
function reason(e: any): string {
  if (e?.message === 'timeout') return 'el servidor tardó demasiado en responder';
  const status = e?.status;
  if (status === 0) return 'sin conexión con el servidor';
  if (status === 401 || status === 403) return 'la sesión venció';
  if (typeof status === 'number') return `error ${status} del servidor`;
  return 'error inesperado';
}

/**
 * Exige sesión y espera la primera carga de los datos de la base de datos (reservas,
 * habitaciones, consumos, usuarios y roles, empleados y nóminas, inventario, datos del hospedaje,
 * configuración de facturación y facturas): así cualquier
 * pantalla, incluso al recargar en /dashboard/reservations/123, los encuentra al abrirse.
 *
 * Si alguna carga falla o no responde a tiempo, no se queda esperando: cierra la sesión local y
 * vuelve al ingreso con el motivo (qué datos fallaron y por qué), para poder intentarlo de nuevo.
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('sogo_token');
  if (!token) {
    router.navigate(['/']);
    return false;
  }
  const sources: [string, { ready(): Promise<void> }][] = [
    ['reservas', inject(ReservationService)], ['habitaciones', inject(RoomService)], ['consumos', inject(ChargeService)],
    ['usuarios y roles', inject(UsersService)], ['nómina', inject(PayrollService)], ['inventario', inject(InventoryService)],
    ['datos del hospedaje', inject(HotelService)], ['configuración de facturación', inject(BillingConfigService)],
    ['facturas', inject(InvoiceService)], ['configuración', inject(SettingsService)], ['TRA', inject(TraService)],
    ['reportes programados', inject(ScheduleService)],
  ];
  const demo = inject(DemoImportService);

  const pending = new Set(sources.map(([name]) => name));
  const loads = Promise.all(sources.map(([name, s]) =>
    s.ready().then(() => { pending.delete(name); }, e => { throw { source: name, error: e }; })));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject({
      source: pending.size ? [...pending].join(', ') : 'la configuración inicial',
      error: new Error('timeout'),
    }), LOAD_TIMEOUT_MS);
  });

  return Promise.race([loads.then(() => demo.ensure()), timeout])
    .then(() => true)
    .catch((f: { source?: string; error?: any }) => {
      console.error(`SOGO: no se pudieron cargar ${f?.source ?? 'los datos'}`, f?.error ?? f);
      const msg = `No se pudieron cargar ${f?.source ?? 'los datos'} (${reason(f?.error)}). Vuelve a iniciar sesión.`;
      try { sessionStorage.setItem(LOAD_ERROR_KEY, msg); } catch { /* sin almacenamiento: solo se pierde el mensaje */ }
      SESSION_KEYS.forEach(k => localStorage.removeItem(k));
      return router.createUrlTree(['/']);
    })
    .finally(() => clearTimeout(timer));
};
