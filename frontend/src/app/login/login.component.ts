import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./login.component.css'],
  template: `
  <div class="login-wrap">

    <!-- ═══════════════════════════════════════════
         PANEL IZQUIERDO — Foto + frase
    ════════════════════════════════════════════ -->
    <section class="left-panel">
      <div class="left-background"></div>
      <div class="left-content">
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         PANEL DERECHO — Formulario
    ════════════════════════════════════════════ -->
    <section class="login-panel">
      <div class="login-panel-inner">

        <!-- Marca -->
        <div class="login-brand">
          <img src="/assets/logo2.png" alt="Hospedaje Sebastián Filandia" class="brand-logo">
        </div>

        <!-- Títulos -->
        <h2>¡Bienvenido!</h2>
        <p class="subtitle">Inicia sesión para continuar</p>

        <!-- Formulario -->
        <div class="login-form">

          <!-- Usuario -->
          <div class="form-field">
            <label for="lf-user">Usuario</label>
            <div  class="input-wrapper">
              <span class="input-icon">
                <!-- ícono persona -->
                <svg class="icon-svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </span>
              <input
                id="lf-user"
                type="text"
                [(ngModel)]="username"
                placeholder="usuario@hospedaje.com"
                autocomplete="username"
              >
            </div>
          </div>

          <!-- Contraseña -->
          <div class="form-field">
            <label for="lf-pass">Contraseña</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <!-- ícono candado -->
                <svg class="icon-svg" viewBox="0 0 24 24">
                  <rect x="5" y="11" width="14" height="9" rx="2"/>
                  <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                </svg>
              </span>
              <input
                id="lf-pass"
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                placeholder="••••••••"
                autocomplete="current-password"
              >
              <!-- toggle ojo -->
              <button
                class="icon-button"
                type="button"
                (click)="showPassword = !showPassword"
                [attr.aria-label]="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              >
                <!-- ojo abierto -->
                <svg *ngIf="!showPassword" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <!-- ojo tachado -->
                <svg *ngIf="showPassword" class="icon-svg" viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.07 18.07 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Recordarme / Olvidaste -->
          <div class="form-field input-inline">
            <label class="checkbox">
              <input type="checkbox" [(ngModel)]="remember">
              Recordarme
            </label>
            <a routerLink="/reset-request" class="link-small">¿Olvidaste tu contraseña?</a>
          </div>

          <!-- Botón Iniciar sesión -->
          <button class="primary" type="button" (click)="submit()">
            <!-- ícono casa -->
            <svg viewBox="0 0 24 24">
              <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>
              <path d="M9 21V12h6v9"/>
            </svg>
            Iniciar sesión
            <span class="btn-arrow">→</span>
          </button>

          <!-- Separador -->
          <div class="or-separator"><span>o continúa con</span></div>

          <!-- Sociales -->
          <div class="socials">
            <button class="social" type="button" (click)="loginWithGoogle()" [disabled]="!oauthReady || !oauthProviders.google"
                    [title]="oauthReady && !oauthProviders.google ? 'No disponible: falta configurar Google en el servidor' : ''">
              <img src="/assets/google.jpg" alt="Google">
              Google
            </button>
            <button class="social" type="button" (click)="loginWithMicrosoft()" [disabled]="!oauthReady || !oauthProviders.azure"
                    [title]="oauthReady && !oauthProviders.azure ? 'No disponible: falta configurar Microsoft en el servidor' : ''">
              <img src="/assets/microsoft.svg" alt="Microsoft">
              Microsoft
            </button>
          </div>

          <!-- Error -->
          <div class="msg" *ngIf="error" role="alert">{{ error }}</div>

        </div><!-- /login-form -->

        <!-- Footer del panel -->
        <div class="login-footer">
          <p class="login-footer-promo">
            <!-- ícono casa pequeño -->
            <svg viewBox="0 0 24 24">
              <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>
              <path d="M9 21V12h6v9"/>
            </svg>
            ¡Reserva fácil, rápida y segura!
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
export class LoginComponent implements OnInit {
  username     = '';
  password     = '';
  error        = '';
  showPassword = false;
  remember     = false;

  oauthReady = false;
  oauthProviders = { google: false, azure: false };

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    const token = localStorage.getItem('sogo_token');
    if (token) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.auth.getOAuthProviders().subscribe({
      next: (p) => { this.oauthProviders = p; this.oauthReady = true; },
      error: () => { this.oauthReady = true; }
    });
  }

  loginWithGoogle(): void {
    window.location.href = 'http://localhost:8080/oauth2/authorization/google';
  }

  loginWithMicrosoft(): void {
    window.location.href = 'http://localhost:8080/oauth2/authorization/azure';
  }

  submit(): void {
    this.error = '';
    this.auth.login(this.username, this.password).subscribe({
      next: (r: any) => {
        localStorage.setItem('sogo_token', r.token);
        localStorage.setItem('sogo_role', r.role || '');
        localStorage.setItem('sogo_username', r.username || this.username);
        localStorage.setItem('sogo_fullname', r.fullName || '');
        localStorage.setItem('sogo_email', r.email || '');
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.error = e.error?.error || 'Error de autenticación';
      }
    });
  }
}
