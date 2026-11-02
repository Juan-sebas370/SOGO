import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

const ESPERA_REENVIO = 30;

@Component({
  selector: 'app-reset-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuthShellComponent],
  styleUrls: ['./reset-request.component.css'],
  template: `
  <app-auth-shell promo="Tu seguridad es nuestra prioridad.">

    <!-- Recuperar contraseña -->
    <div class="auth-vista" *ngIf="!sent">
      <a routerLink="/" class="auth-volver">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        Volver
      </a>
      <div class="auth-icono-grande">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/><circle cx="12" cy="16" r="1.3" fill="#fff"/></svg>
      </div>
      <h1 class="auth-titulo">¿Olvidaste tu contraseña?</h1>
      <p class="auth-texto">No te preocupes. Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.</p>

      <form (ngSubmit)="submit()">
        <div class="auth-campo" [class.auth-campo--error]="emailError">
          <input
            id="rr-email"
            name="email"
            type="email"
            [(ngModel)]="email"
            (ngModelChange)="emailError = ''"
            placeholder="tucorreo@ejemplo.com"
            aria-label="Correo electrónico"
            autocomplete="email"
          >
          <span class="auth-ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          </span>
        </div>
        <div class="auth-ayuda">{{ emailError }}</div>

        <button class="auth-btn" [class.auth-btn--cargando]="loading" type="submit" [disabled]="loading">
          <span class="auth-btn-contenido">
            Enviar enlace
            <span class="auth-flecha">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
            </span>
          </span>
          <span class="auth-spinner"></span>
        </button>
      </form>

      <div class="auth-msg" *ngIf="error" role="alert">{{ error }}</div>
    </div>

    <!-- Correo enviado -->
    <div class="auth-vista" *ngIf="sent">
      <div class="auth-icono-grande">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#e6ad5c" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
      </div>
      <h1 class="auth-titulo">¡Revisa tu correo!</h1>
      <!-- El servidor no revela si el correo existe: el mensaje no puede afirmar que el enlace se envió -->
      <p class="auth-texto" role="status">Si <b>{{ email.trim() }}</b> pertenece a una cuenta de SOGO, te enviamos un enlace que dura 1 hora. Si no lo ves, revisa la carpeta de spam.</p>
      <a routerLink="/" class="auth-btn">
        <span class="auth-btn-contenido">Volver a iniciar sesión</span>
      </a>
      <p class="auth-reenvio">
        ¿No te llegó?
        <button class="auth-reenviar" type="button" (click)="resend()" [disabled]="loading || cooldown > 0">
          {{ cooldown > 0 ? 'Reenviado ✓ (' + cooldown + 's)' : loading ? 'Enviando…' : 'Reenviar' }}
        </button>
      </p>
      <div class="auth-msg" *ngIf="error" role="alert">{{ error }}</div>
    </div>

  </app-auth-shell>
  `
})
export class ResetRequestComponent implements OnDestroy {
  email      = (history.state?.email as string) || '';
  emailError = '';
  error      = '';
  loading    = false;
  sent       = false;
  cooldown   = 0;

  private timer?: ReturnType<typeof setInterval>;

  constructor(private auth: AuthService) {}

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  submit(): void {
    this.error = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.emailError = 'Escribe un correo válido';
      return;
    }
    this.send(() => { this.sent = true; });
  }

  resend(): void {
    this.error = '';
    this.send(() => this.startCooldown());
  }

  private send(onSent: () => void): void {
    this.loading = true;
    this.auth.resetRequest(this.email.trim()).subscribe({
      next: () => { this.loading = false; onSent(); },
      error: (e: any) => {
        this.loading = false;
        this.error = e?.status === 0 ? 'No hay conexión con el servidor de SOGO.' : e?.error?.message || 'No se pudo enviar el correo. Intenta de nuevo.';
      }
    });
  }

  private startCooldown(): void {
    this.cooldown = ESPERA_REENVIO;
    this.timer = setInterval(() => {
      this.cooldown--;
      if (this.cooldown <= 0) clearInterval(this.timer);
    }, 1000);
  }
}
