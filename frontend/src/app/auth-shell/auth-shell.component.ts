import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Marco común de las pantallas de acceso: foto de la fachada, luciérnagas, tarjeta de vidrio, logo y pie.
// Los estilos .auth-* están en styles.css, como los demás del login.
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="auth-page">
    <div class="auth-fondo"></div>
    <div class="auth-velo"></div>
    <div class="auth-luces" aria-hidden="true">
      <div class="auth-luz" *ngFor="let l of luces"
           [style.width.px]="l.size" [style.height.px]="l.size"
           [style.left.%]="l.left" [style.top.%]="l.top"
           [style.animation-duration.s]="l.duration" [style.animation-delay.s]="l.delay"></div>
    </div>

    <main class="auth-tarjeta">
      <div class="auth-logo">
        <div class="auth-logo-fondo">
          <svg viewBox="0 0 200 105" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SOGO">
            <circle class="auth-logo-sol" cx="132" cy="18" r="9" fill="#a9c9f0"/>
            <path d="M58 52 L97 14 L122 38 L106 38 Z" fill="#a9c9f0" opacity=".75"/>
            <path class="auth-logo-trazo" d="M18 56 L54 31 L79 47 L104 11 L148 46 L190 59" fill="none" stroke="#1e5bd6" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
            <text x="100" y="100" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="42" fill="#1e5bd6" letter-spacing="2">SOGO</text>
          </svg>
        </div>
      </div>

      <ng-content></ng-content>

      <div class="auth-pie">
        <b>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>
          {{ promo }}
        </b><br>
        © 2026 Hospedaje Sebastián Filandia. Todos los derechos reservados.
      </div>
    </main>
  </div>
  `
})
export class AuthShellComponent {
  @Input() promo = '¡Reserva fácil, rápida y segura!';

  luces = Array.from({ length: 28 }, () => ({
    size: Math.random() * 3 + 2,
    left: Math.random() * 100,
    top: 40 + Math.random() * 60,
    duration: 6 + Math.random() * 8,
    delay: Math.random() * 8,
  }));
}
