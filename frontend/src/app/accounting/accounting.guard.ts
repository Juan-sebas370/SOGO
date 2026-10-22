import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AccountingService } from './accounting.service';

/** Las pantallas de Contabilidad se abren con el plan de cuentas, los ajustes y los comprobantes ya cargados. */
export const accountingReady: CanActivateFn = () => inject(AccountingService).ready().then(() => true);
