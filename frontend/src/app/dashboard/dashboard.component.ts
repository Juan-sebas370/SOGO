import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NotificationService } from '../notifications/notification.service';
import { AppNotification } from '../notifications/notification.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  styleUrls: ['./dashboard.component.css'],
  template: `
  <div class="dash-page">
    <aside class="dash-sidebar">
      <div class="dash-brand">
        <span class="dash-brand-icon">≡</span>
        <span class="dash-brand-text">SOGO</span>
      </div>

      <nav class="dash-nav" aria-label="Navegación principal">
        <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z"/></svg>
          Inicio
        </a>
        <a routerLink="/dashboard/reservations" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M7 11h10M6 15h12"/></svg>
          Reservas
        </a>
        <a routerLink="/dashboard/lodging" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14M7 10h10M7 15h10"/></svg>
          Alojamiento
        </a>
        <a routerLink="/dashboard/tra" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M4 7h16v12H4zM8 3v4M16 3v4M8 12h8"/></svg>
          TRA
        </a>
        <a routerLink="/dashboard/billing" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Facturación
        </a>
        <a routerLink="/dashboard/restaurant" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          Restaurante
        </a>
        <a routerLink="/dashboard/payroll" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0zm-8 8a4 4 0 0 1 8 0v4H8v-4zM18 18v-3m3 3h-6"/></svg>
          Nómina
        </a>
        <a routerLink="/dashboard/accounting" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
          Contabilidad
        </a>
        <a routerLink="/dashboard/inventory" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8"/></svg>
          Inventarios
        </a>
        <a routerLink="/dashboard/reports" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M6 18V8m6 10V4m6 14v-7"/></svg>
          Reportes
        </a>
        <a *ngIf="isAdmin" routerLink="/dashboard/users" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          Usuarios
        </a>
        <a routerLink="/dashboard/settings" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          Configuración
        </a>
      </nav>

      <button class="dash-logout" (click)="logout()">
        <svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>
        Salir
      </button>
    </aside>

    <main class="dash-main">
      <section class="dash-topbar">
        <div class="dash-topbar-left">
          <span class="dash-welcome-label">Bienvenido,</span>
          <h1 class="dash-welcome-name">{{ firstName }} <span class="dash-welcome-emoji" aria-hidden="true">☀️</span></h1>
          <p class="dash-welcome-sub">Aquí tienes el resumen de la operación de tu hospedaje.</p>
        </div>
        <div class="dash-topbar-right">
          <div class="dash-date-pill">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{{ todaySub }}</span>
            <span class="dash-date-chip">Hoy
              <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </span>
          </div>

          <span class="dash-divider"></span>

          <div class="dash-notif-wrap">
            <button class="dash-notif" (click)="showNotifications = !showNotifications" aria-label="Notificaciones" [attr.aria-expanded]="showNotifications">
              <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 5-3 6-3 6h18s-3-1-3-6"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span class="dash-notif-badge" *ngIf="notifications.length">{{ notifications.length }}</span>
            </button>

            <div class="dash-notif-panel" *ngIf="showNotifications">
              <div class="dash-notif-panel-header">
                <span>Notificaciones</span>
                <span class="dash-notif-panel-count" *ngIf="notifications.length">{{ notifications.length }}</span>
              </div>
              <ul class="dash-notif-list" *ngIf="notifications.length; else noNotif">
                <li class="dash-notif-row" *ngFor="let n of notifications" (click)="goToNotification(n)">
                  <span class="dash-notif-icon" [ngClass]="'dash-notif-icon--' + n.icon">
                    <svg *ngIf="n.icon === 'checkout'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <svg *ngIf="n.icon === 'cleaning'" viewBox="0 0 24 24"><path d="M3 21l7-7"/><path d="M12 9l-1.5-4.5a1 1 0 0 1 .5-1.2c1.8-.9 4.5-1 6 .5s1.4 4.2.5 6a1 1 0 0 1-1.2.5L12 9z"/></svg>
                    <svg *ngIf="n.icon === 'maintenance'" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    <svg *ngIf="n.icon === 'billing'" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <svg *ngIf="n.icon === 'review'" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <svg *ngIf="n.icon === 'inventory'" viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8"/></svg>
                  </span>
                  <span class="dash-notif-text">
                    <span class="dash-notif-label">{{ n.label }}</span>
                    <span class="dash-notif-detail">{{ n.detail }}</span>
                  </span>
                  <span class="dash-priority" [ngClass]="'dash-priority--' + n.level">{{ n.level }}</span>
                </li>
              </ul>
              <ng-template #noNotif><p class="dash-notif-empty">No hay notificaciones pendientes.</p></ng-template>
            </div>
          </div>

          <span class="dash-divider"></span>

          <div class="dash-profile" role="button" tabindex="0" [attr.aria-label]="'Perfil de ' + role">
            <span class="dash-avatar">{{ avatarInitial }}</span>
            <div class="dash-profile-info">
              <span class="dash-profile-name">{{ role }}</span>
              <span class="dash-profile-role">{{ email || username }}</span>
            </div>
            <svg class="dash-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </div>
      </section>

      <section class="dash-content">
        <router-outlet></router-outlet>
      </section>
    </main>
  </div>
  `
})
export class DashboardComponent {
  role = localStorage.getItem('sogo_role') || 'Usuario';
  username = localStorage.getItem('sogo_username') || 'Usuario';
  fullName = localStorage.getItem('sogo_fullname') || '';
  email = localStorage.getItem('sogo_email') || '';
  isAdmin = this.role === 'Administrador';
  avatarInitial = (this.fullName || this.username).charAt(0).toUpperCase();
  firstName = (this.fullName || this.username).split(' ')[0];
  todaySub = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  notifications: AppNotification[] = [];
  showNotifications = false;

  constructor(private router: Router, private notificationService: NotificationService, private elementRef: ElementRef) {
    this.notificationService.getAll().subscribe(list => this.notifications = list);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showNotifications && !this.elementRef.nativeElement.querySelector('.dash-notif-wrap')?.contains(event.target)) {
      this.showNotifications = false;
    }
  }

  goToNotification(n: AppNotification): void {
    this.showNotifications = false;
    this.router.navigateByUrl(n.link);
  }

  logout() {
    localStorage.removeItem('sogo_token');
    localStorage.removeItem('sogo_role');
    localStorage.removeItem('sogo_username');
    localStorage.removeItem('sogo_fullname');
    localStorage.removeItem('sogo_email');
    this.router.navigate(['/']);
  }
}
