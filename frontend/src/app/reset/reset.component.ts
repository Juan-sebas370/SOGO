import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

@Component({
  selector: 'app-reset',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuthShellComponent],
  styleUrls: ['./reset.component.css'],
  template: `
  <app-auth-shell promo="Tu seguridad es nuestra prioridad.">
    <div class="auth-vista">
      <a routerLink="/" class="auth-volver">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        Volver
      </a>
      <div class="auth-icono-grande">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1.3" fill="#fff"/></svg>
      </div>
      <h1 class="auth-titulo">Restablecer contraseña</h1>
      <p class="auth-texto">Crea tu nueva contraseña siguiendo los requisitos de seguridad.</p>

      <form (ngSubmit)="submit()">
        <!-- Nueva contraseña -->
        <div class="auth-campo auth-campo--espaciado">
          <input
            id="rs-pass"
            name="password"
            [type]="showPassword ? 'text' : 'password'"
            [(ngModel)]="password"
            (ngModelChange)="onPasswordChange($event)"
            placeholder="Nueva contraseña"
            aria-label="Nueva contraseña"
            autocomplete="new-password"
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

        <!-- Confirmar contraseña -->
        <div class="auth-campo auth-campo--espaciado">
          <input
            id="rs-confirm"
            name="confirm"
            [type]="showConfirm ? 'text' : 'password'"
            [(ngModel)]="confirm"
            placeholder="Confirmar contraseña"
            aria-label="Confirmar nueva contraseña"
            autocomplete="new-password"
          >
          <button
            class="auth-ico"
            type="button"
            (click)="showConfirm = !showConfirm"
            [attr.aria-label]="showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'"
          >
            <svg *ngIf="!showConfirm" width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>
            <svg *ngIf="showConfirm" width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 5C5 5 1 12 1 12s4 7 11 7 11-7 11-7-4-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>
          </button>
        </div>

        <!-- Requisitos de contraseña -->
        <div class="auth-reglas">
          <p class="auth-reglas-titulo">La contraseña debe contener</p>
          <div class="auth-regla" [class.auth-regla--ok]="rules.length"><span class="auth-regla-punto"></span>Mínimo 8 caracteres</div>
          <div class="auth-regla" [class.auth-regla--ok]="rules.upper"><span class="auth-regla-punto"></span>Una letra mayúscula</div>
          <div class="auth-regla" [class.auth-regla--ok]="rules.lower"><span class="auth-regla-punto"></span>Una letra minúscula</div>
          <div class="auth-regla" [class.auth-regla--ok]="rules.number"><span class="auth-regla-punto"></span>Un número</div>
        </div>

        <button class="auth-btn" [class.auth-btn--cargando]="loading" type="submit" [disabled]="loading">
          <span class="auth-btn-contenido">Guardar nueva contraseña</span>
          <span class="auth-spinner"></span>
        </button>
      </form>

      <!-- Mensajes -->
      <div class="auth-msg auth-msg--ok" *ngIf="message && !error" role="status">{{ message }}</div>
      <div class="auth-msg" *ngIf="error" role="alert">{{ error }}</div>
    </div>
  </app-auth-shell>
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
  loading      = false;

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

    this.loading = true;
    this.auth.doReset(this.token, this.password).subscribe({
      next:  (r: any) => {
        this.message = r.message || 'Contraseña actualizada correctamente.';
        setTimeout(() => this.router.navigate(['/']), 1500);
      },
      error: (e) => {
        this.loading = false;
        this.error = e.error?.error === 'invalid or expired token'
          ? 'El enlace ya se usó o venció (dura 1 hora). Pide uno nuevo en «¿Olvidaste tu contraseña?».'
          : 'No se pudo actualizar la contraseña.';
      }
    });
  }
}
