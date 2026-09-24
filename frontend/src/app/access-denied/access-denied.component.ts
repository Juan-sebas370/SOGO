import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  styleUrls: ['./access-denied.component.css'],
  template: `
  <div class="denied-wrap">
    <div class="denied-icon">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
    </div>
    <h2 class="denied-title">Acceso denegado</h2>
    <p class="denied-text">No posees los permisos suficientes para acceder a este módulo. Si crees que esto es un error, contacta a un administrador.</p>
    <button class="denied-btn" type="button" (click)="goHome()">Volver al inicio</button>
  </div>
  `
})
export class AccessDeniedComponent {
  constructor(private router: Router) {}

  goHome(): void {
    this.router.navigate(['/dashboard']);
  }
}
