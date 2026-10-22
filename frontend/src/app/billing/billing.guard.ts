import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BillingAction, BillingConfigService } from './billing-config.service';

/** Protege una ruta de Facturación con la matriz de "Permisos por rol" de la configuración. */
export const billingPermission = (action: BillingAction): CanActivateFn => () => {
  if (inject(BillingConfigService).can(action)) return true;
  inject(Router).navigate(['/dashboard/access-denied']);
  return false;
};
