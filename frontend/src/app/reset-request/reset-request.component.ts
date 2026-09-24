import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-reset-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reset-request.component.css'],
  template: `
  <div class="login-wrap">

    <!-- ═══════════════════════════════════════════
         PANEL IZQUIERDO — igual que el login
    ════════════════════════════════════════════ -->
    <section class="left-panel">
      <div class="left-background"></div>
      <div class="left-content">
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         PANEL DERECHO — Recuperar contraseña
    ════════════════════════════════════════════ -->
    <section class="login-panel">
      <div class="login-panel-inner">

        <!-- Marca -->
        <div class="login-brand">
          <img src="/assets/logo2.png" alt="Hospedaje Sebastián Filandia" class="brand-logo">
        </div>

        <!-- Ícono correo -->
        <div class="recover-icon-wrap">
          <svg class="recover-icon" viewBox="0 0 24 24">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M2 7l10 7 10-7"/>
          </svg>
        </div>

        <!-- Títulos -->
        <h2 class="recover-title">Recuperar contraseña</h2>
        <p class="recover-desc">
          Ingresa tu correo electrónico y te enviaremos<br>
          un enlace para restablecer tu contraseña.
        </p>

        <!-- Formulario -->
        <div class="login-form">

          <!-- Correo -->
          <div class="form-field">
            <label for="rr-email">Correo electrónico</label>
            <div class="input-wrapper">
              <span class="input-icon input-icon--outline">
                <svg class="icon-svg" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M2 7l10 7 10-7"/>
                </svg>
              </span>
              <input
                id="rr-email"
                type="email"
                [(ngModel)]="email"
                placeholder="ejemplo@correo.com"
                autocomplete="email"
              >
            </div>
          </div>

          <!-- Botón enviar -->
          <button class="primary" type="button" (click)="submit()">
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Enviar enlace de recuperación
          </button>

          <!-- Mensaje confirmación / error -->
          <div class="msg msg--success" *ngIf="message && !error" role="status">{{ message }}</div>
          <div class="msg" *ngIf="error" role="alert">{{ error }}</div>

          <!-- Separador -->
          <div class="or-separator"><span>o</span></div>

          <!-- Volver al inicio de sesión -->
          <a routerLink="/" class="btn-back">
            <svg viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Volver al inicio de sesión
          </a>

        </div><!-- /login-form -->

        <!-- Footer -->
        <div class="login-footer">
          <p class="login-footer-promo">
            <svg viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="9" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Tu seguridad es nuestra prioridad.
          </p>
          <p class="login-footer-copy">
            © 2024 Hospedaje Sebastián Filandia.<br>
            Todos los derechos reservados.
          </p>
        </div>

      </div><!-- /login-panel-inner -->
    </section>

  </div>
  `
})
export class ResetRequestComponent {
  email   = '';
  message = '';
  error   = '';

  constructor(private auth: AuthService) {}

  submit(): void {
    this.message = '';
    this.error   = '';
    this.auth.resetRequest(this.email).subscribe({
      next:  (r: any) => { this.message = r.message || 'Si existe una cuenta, se envió el enlace.'; },
      error: ()       => { this.error   = 'No se pudo enviar el correo. Intenta de nuevo.'; }
    });
  }
}
