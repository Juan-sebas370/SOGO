import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const roleGuard = (allowedRoles: string[]): CanActivateFn => () => {
  const role = localStorage.getItem('sogo_role');
  if (role && allowedRoles.includes(role)) {
    return true;
  }
  inject(Router).navigate(['/dashboard/access-denied']);
  return false;
};
