import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const token = localStorage.getItem('sogo_token');
  if (!token) {
    inject(Router).navigate(['/']);
    return false;
  }
  return true;
};
