import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { API_ROOT } from '../api';
import { UsersService } from '../users/users.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

const RECORDAR_KEY = 'sogo_remember_user';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuthShellComponent],
  styleUrls: ['./login.component.css'],
  template: `
  <app-auth-shell>
    <div class="auth-vista">
      <h1 class="auth-titulo">¡Bienvenido!</h1>
      <p class="auth-script">tu hogar en el corazón de Filandia</p>

      <form (ngSubmit)="submit()">
        <!-- Usuario -->
        <div class="auth-campo" [class.auth-campo--error]="userError">
          <input
            id="lf-user"
            name="username"
            type="text"
            [(ngModel)]="username"
            (ngModelChange)="userError = ''"
            placeholder="Correo o usuario"
            aria-label="Correo o usuario"
            autocomplete="username"
          >
          <span class="auth-ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c0-4.5 4-7 8.5-7s8.5 2.5 8.5 7z"/></svg>
          </span>
        </div>
        <div class="auth-ayuda">{{ userError }}</div>

        <!-- Contraseña -->
        <div class="auth-campo" [class.auth-campo--error]="passError">
          <input
            id="lf-pass"
            name="password"
            [type]="showPassword ? 'text' : 'password'"
            [(ngModel)]="password"
            (ngModelChange)="passError = ''"
            placeholder="Contraseña"
            aria-label="Contraseña"
            autocomplete="current-password"
          >
          <button
            class="auth-ico"
            type="button"
            (click)="showPassword = !showPassword"
            [attr.aria-label]="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          >
            <svg *ngIf="!showPassword" width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>
            <svg *ngIf="showPassword" width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>
          </button>
        </div>
        <div class="auth-ayuda">{{ passError }}</div>

        <!-- Recordarme / Olvidaste -->
        <div class="auth-fila">
          <label class="auth-check">
            <input type="checkbox" name="remember" [(ngModel)]="remember">
            <span class="auth-caja">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><path d="M4 12l5 5L20 6"/></svg>
            </span>
            Recordarme
          </label>
          <a routerLink="/reset-request" [state]="username.includes('@') ? { email: username.trim() } : {}">¿Olvidaste tu contraseña?</a>
        </div>

        <!-- Ingresar -->
        <button class="auth-btn" [class.auth-btn--cargando]="loading" type="submit" [disabled]="loading">
          <span class="auth-btn-contenido">
            Ingresar
            <span class="auth-flecha">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </span>
          <span class="auth-spinner"></span>
        </button>
      </form>

      <!-- Error -->
      <div class="auth-msg" *ngIf="error" role="alert">{{ error }}</div>

      <div class="auth-divisor">o continúa con</div>

      <button class="auth-google" type="button" (click)="loginWithGoogle()" [disabled]="!oauthReady || !oauthProviders.google"
              [title]="oauthReady && !oauthProviders.google ? 'No disponible: falta configurar Google en el servidor' : ''">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Google
      </button>
    </div>
  </app-auth-shell>
  `
})
export class LoginComponent implements OnInit {
  username     = '';
  password     = '';
  error        = '';
  userError    = '';
  passError    = '';
  showPassword = false;
  remember     = false;
  loading      = false;

  oauthReady = false;
  oauthProviders = { google: false };

  constructor(private auth: AuthService, private router: Router, private users: UsersService) {}

  ngOnInit(): void {
    const token = localStorage.getItem('sogo_token');
    if (token) {
      this.router.navigate(['/dashboard']);
      return;
    }
    const recordado = localStorage.getItem(RECORDAR_KEY);
    if (recordado) {
      this.username = recordado;
      this.remember = true;
    }
    const oauthError = new URLSearchParams(window.location.search).get('oauthError');
    const oauthMotivos: Record<string, string> = {
      'not-registered': 'Ese correo de Google no tiene una cuenta del personal en SOGO. Pide al administrador que la cree con ese mismo correo.',
      bloqueada: 'Tu cuenta está bloqueada. Pide al administrador que la desbloquee.',
      desactivada: 'Tu cuenta está desactivada. Comunícate con el administrador.',
      'con activación vencida': 'El plazo para activar tu cuenta venció. Pide al administrador que reenvíe la activación.',
      'sin acceso a SOGO': 'Tu cuenta no tiene un rol de SOGO asignado. Pide al administrador que te asigne uno.',
    };
    if (oauthError && oauthMotivos[oauthError]) this.error = oauthMotivos[oauthError];
    else if (oauthError === 'no-email') this.error = 'El proveedor no compartió tu correo. Inicia sesión con usuario y contraseña.';
    this.auth.getOAuthProviders().subscribe({
      next: (p) => { this.oauthProviders = p; this.oauthReady = true; },
      error: () => { this.oauthReady = true; }
    });
  }

  loginWithGoogle(): void {
    window.location.href = `${API_ROOT}/oauth2/authorization/google`;
  }

  submit(): void {
    this.error = '';
    this.userError = this.username.trim() ? '' : 'Escribe tu correo o usuario';
    this.passError = this.password ? '' : 'Escribe tu contraseña';
    if (this.userError || this.passError) return;

    this.loading = true;
    this.auth.login(this.username, this.password).subscribe({
      next: (r: any) => {
        this.loading = false;
        // El servidor validó la contraseña; la cuenta además debe estar activa en Usuarios y Roles
        const check = this.users.recordLogin({ username: r.username || this.username, email: r.email || '' });
        if (!check.ok) { this.error = check.message; return; }
        if (this.remember) localStorage.setItem(RECORDAR_KEY, this.username.trim());
        else localStorage.removeItem(RECORDAR_KEY);
        localStorage.setItem('sogo_token', r.token);
        localStorage.setItem('sogo_role', r.role || '');
        localStorage.setItem('sogo_username', r.username || this.username);
        localStorage.setItem('sogo_fullname', r.fullName || '');
        localStorage.setItem('sogo_email', r.email || '');
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.loading = false;
        if (e.status === 401) this.users.recordFailedLogin(this.username.trim());
        const motivos: Record<string, string> = {
          bloqueada: 'Tu cuenta está bloqueada por intentos fallidos. Pide al administrador que la desbloquee o restablezca tu contraseña.',
          desactivada: 'Tu cuenta está desactivada. Comunícate con el administrador.',
          'con activación vencida': 'El plazo para activar tu cuenta venció. Pide al administrador que reenvíe la activación.',
          'sin acceso a SOGO': 'Tu cuenta no tiene un rol de SOGO asignado. Pide al administrador que te asigne uno.',
        };
        this.error = e.status === 401
          ? motivos[e.error?.error] ?? 'Usuario o contraseña incorrectos.'
          : e.status === 0 ? 'No hay conexión con el servidor de SOGO.' : 'Error de autenticación';
      }
    });
  }
}
