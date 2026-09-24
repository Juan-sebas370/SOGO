import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-reset',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reset.component.css'],
  template: `
  <div class="login-wrap">

    <!-- ═══════════════════════════════════════════
         PANEL IZQUIERDO — igual que login y recuperación
    ════════════════════════════════════════════ -->
    <section class="left-panel">
      <div class="left-background"></div>
      <div class="left-content">
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         PANEL DERECHO — Restablecer contraseña
    ════════════════════════════════════════════ -->
    <section class="login-panel">
      <div class="login-panel-inner">

        <!-- Logo -->
        <div class="login-brand">
          <img src="/assets/logo2.png" alt="Hospedaje Sebastián Filandia" class="brand-logo">
        </div>

        <!-- Ícono candado -->
        <div class="recover-icon-wrap">
          <svg class="recover-icon" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="9" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <!-- Título -->
        <h2 class="recover-title">Restablecer contraseña</h2>
        <p class="recover-desc">
          Introduce tu nueva contraseña siguiendo<br>
          los requisitos de seguridad.
        </p>

        <!-- Formulario -->
        <div class="login-form">

          <!-- Nueva contraseña -->
          <div class="form-field">
            <label for="rs-pass">Nueva contraseña</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg class="icon-svg" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="9" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="rs-pass"
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                (ngModelChange)="onPasswordChange($event)"
                placeholder="Nueva contraseña"
                autocomplete="new-password"
              >
              <button
                class="icon-button"
                type="button"
                (click)="showPassword = !showPassword"
                [attr.aria-label]="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              >
                <svg *ngIf="!showPassword" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg *ngIf="showPassword" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.07 18.07 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Confirmar contraseña -->
          <div class="form-field">
            <label for="rs-confirm">Confirmar nueva contraseña</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg class="icon-svg" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="9" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="rs-confirm"
                [type]="showConfirm ? 'text' : 'password'"
                [(ngModel)]="confirm"
                placeholder="Confirmar contraseña"
                autocomplete="new-password"
              >
              <button
                class="icon-button"
                type="button"
                (click)="showConfirm = !showConfirm"
                [attr.aria-label]="showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'"
              >
                <svg *ngIf="!showConfirm" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg *ngIf="showConfirm" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.07 18.07 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Requisitos de contraseña -->
          <div class="rules">
            <p class="rules-title">La contraseña debe contener</p>
            <div class="rule" [class.valid]="rules.length">
              <span class="rule-dot"></span>Mínimo 8 caracteres
            </div>
            <div class="rule" [class.valid]="rules.upper">
              <span class="rule-dot"></span>Una letra mayúscula
            </div>
            <div class="rule" [class.valid]="rules.lower">
              <span class="rule-dot"></span>Una letra minúscula
            </div>
            <div class="rule" [class.valid]="rules.number">
              <span class="rule-dot"></span>Un número
            </div>
          </div>

          <!-- Botón guardar -->
          <button class="primary" type="button" (click)="submit()">
            <svg viewBox="0 0 24 24">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Guardar nueva contraseña
          </button>

          <!-- Mensajes -->
          <div class="msg msg--success" *ngIf="message && !error" role="status">{{ message }}</div>
          <div class="msg" *ngIf="error" role="alert">{{ error }}</div>

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
export class ResetComponent {
  password     = '';
  confirm      = '';
  message      = '';
  error        = '';
  token        = '';
  showPassword = false;
  showConfirm  = false;

  rules = { length: false, upper: false, lower: false, number: false };

  constructor(private auth: AuthService, private router: Router) {
    this.token = new URLSearchParams(window.location.search).get('token') || '';
  }

  onPasswordChange(v: string): void {
    this.rules.length = v.length >= 8;
    this.rules.upper  = /[A-Z]/.test(v);
    this.rules.lower  = /[a-z]/.test(v);
    this.rules.number = /[0-9]/.test(v);
  }

  submit(): void {
    this.message = '';
    this.error   = '';

    if (this.password !== this.confirm) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }
    if (!this.rules.length || !this.rules.upper || !this.rules.lower || !this.rules.number) {
      this.error = 'La contraseña no cumple todos los requisitos.';
      return;
    }

    this.auth.doReset(this.token, this.password).subscribe({
      next:  (r: any) => {
        this.message = r.message || 'Contraseña actualizada correctamente.';
        setTimeout(() => this.router.navigate(['/']), 1500);
      },
      error: (e) => {
        this.error = e.error?.error || 'No se pudo actualizar la contraseña.';
      }
    });
  }
}
