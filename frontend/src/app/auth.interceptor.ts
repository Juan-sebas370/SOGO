import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const SESSION_KEYS = ['sogo_token', 'sogo_role', 'sogo_username', 'sogo_fullname', 'sogo_email'];

@Injectable({ providedIn: 'root' })
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = localStorage.getItem('sogo_token');
    const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
    return next.handle(request).pipe(catchError((e: HttpErrorResponse) => {
      // Sesión vencida (el JWT dura una hora): de vuelta al inicio de sesión.
      // En /auth/login un 401 es solo una contraseña equivocada.
      if (e.status === 401 && token && !req.url.includes('/auth/')) {
        SESSION_KEYS.forEach(k => localStorage.removeItem(k));
        window.location.href = '/';
      }
      return throwError(() => e);
    }));
  }
}
