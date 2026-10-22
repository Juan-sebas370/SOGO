import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { UsersService } from './users/users.service';
import { Module } from './users/users.model';

// Primer segmento de la ruta del dashboard → módulo de Usuarios y Roles
const MODULE_OF: Record<string, Module> = {
  reservations: 'Reservas', lodging: 'Alojamiento', tra: 'TRA', billing: 'Facturación', restaurant: 'Restaurante',
  payroll: 'Nómina', accounting: 'Contabilidad', inventory: 'Inventarios', reports: 'Reportes', users: 'Usuarios', settings: 'Configuración',
};

/** Entrar a un módulo exige el permiso «Ver» en alguno de los roles de la sesión; el intento denegado queda en auditoría. */
export const moduleGuard: CanActivateChildFn = (_route, state) => {
  const segment = state.url.split('?')[0].split('/')[2] ?? '';
  const module = MODULE_OF[segment];
  const users = inject(UsersService);
  if (!module || users.can(module, 'view')) return true;
  users.addLog(`Sesión: acceso denegado a ${module}`, state.url, { result: 'Denegado' });
  return inject(Router).createUrlTree(['/dashboard/access-denied']);
};
