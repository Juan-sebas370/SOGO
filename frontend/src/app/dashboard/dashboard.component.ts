import { Component, ElementRef, HostListener, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { AppNotification } from '../notifications/notification.model';
import { UsersService } from '../users/users.service';
import { Module } from '../users/users.model';
import { MessagesService } from '../messages/messages.service';
import { BillingAction, BillingConfigService } from '../billing/billing-config.service';
import { AuthService } from '../auth.service';

/** Última actividad en cualquier pestaña de SOGO (para el cierre por inactividad). */
const ACTIVITY_KEY = 'sogo_last_activity';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  styleUrls: ['./dashboard.component.css'],
  template: `
  <div class="dash-page">
    <aside class="dash-sidebar" id="dash-sidebar" [class.open]="menuOpen" aria-label="Menú">
      <a class="dash-brand" routerLink="/dashboard" aria-label="SOGO · Inicio">
        <img src="/assets/brand/sogo-fondo-oscuro.png" alt="SOGO" class="dash-brand-logo">
      </a>

      <nav class="dash-nav" aria-label="Navegación principal">
        <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z"/></svg>
          Inicio
        </a>
        <div *ngIf="canSee('Reservas')" class="dash-nav-group" [class.open]="openModule === 'reservations'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/reservations" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M4 7h16M7 11h10M6 15h12"/></svg>
              Reservas
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'reservations', label: 'Reservas' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'reservations' }"></ng-container>
        </div>
        <div *ngIf="canSee('Alojamiento')" class="dash-nav-group" [class.open]="openModule === 'lodging'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/lodging" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14M7 10h10M7 15h10"/></svg>
              Alojamiento
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'lodging', label: 'Alojamiento' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'lodging' }"></ng-container>
        </div>
        <div *ngIf="canSee('TRA')" class="dash-nav-group" [class.open]="openModule === 'tra'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/tra" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M4 7h16v12H4zM8 3v4M16 3v4M8 12h8"/></svg>
              TRA
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'tra', label: 'TRA' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'tra' }"></ng-container>
        </div>
        <div *ngIf="canSee('Facturación')" class="dash-nav-group" [class.open]="openModule === 'billing'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/billing" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Facturación
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'billing', label: 'Facturación' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'billing' }"></ng-container>
        </div>
        <div *ngIf="canSee('Nómina')" class="dash-nav-group" [class.open]="openModule === 'payroll'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/payroll" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0zm-8 8a4 4 0 0 1 8 0v4H8v-4zM18 18v-3m3 3h-6"/></svg>
              Nómina
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'payroll', label: 'Nómina' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'payroll' }"></ng-container>
        </div>
        <a *ngIf="canSee('Mensajes')" routerLink="/dashboard/messages" routerLinkActive="active" class="dash-nav-item">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Mensajes
          <span class="dash-nav-count" *ngIf="unread > 0" [attr.aria-label]="unread + ' mensajes nuevos'">{{ unread > 99 ? '99+' : unread }}</span>
        </a>
        <div *ngIf="canSee('Contabilidad')" class="dash-nav-group" [class.open]="openModule === 'accounting'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/accounting" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
              Contabilidad
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'accounting', label: 'Contabilidad' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'accounting' }"></ng-container>
        </div>
        <div *ngIf="canSee('Inventarios')" class="dash-nav-group" [class.open]="openModule === 'inventory'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/inventory" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8"/></svg>
              Inventarios
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'inventory', label: 'Inventarios' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'inventory' }"></ng-container>
        </div>
        <div *ngIf="canSee('Reportes')" class="dash-nav-group" [class.open]="openModule === 'reports'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/reports" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><path d="M6 18V8m6 10V4m6 14v-7"/></svg>
              Reportes
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'reports', label: 'Reportes' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'reports' }"></ng-container>
        </div>
        <div *ngIf="canSee('Usuarios')" class="dash-nav-group" [class.open]="openModule === 'users'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/users" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              Usuarios
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'users', label: 'Usuarios' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'users' }"></ng-container>
        </div>
        <div *ngIf="canSee('Configuración')" class="dash-nav-group" [class.open]="openModule === 'settings'">
          <div class="dash-nav-row">
            <a routerLink="/dashboard/settings" routerLinkActive="active" class="dash-nav-item">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              Configuración
            </a>
            <ng-container *ngTemplateOutlet="toggle; context: { module: 'settings', label: 'Configuración' }"></ng-container>
          </div>
          <ng-container *ngTemplateOutlet="subnav; context: { module: 'settings' }"></ng-container>
        </div>

        <!-- Flecha que despliega / pliega el submenú de un módulo -->
        <ng-template #toggle let-module="module" let-label="label">
          <button type="button" class="dash-nav-toggle" (click)="toggleModule(module)"
                  [attr.aria-expanded]="openModule === module" [attr.aria-controls]="'subnav-' + module"
                  [attr.aria-label]="(openModule === module ? 'Ocultar' : 'Mostrar') + ' opciones de ' + label">
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </ng-template>
        <!-- Siempre en el DOM para animar la altura; plegado queda oculto (visibility) y fuera del Tab -->
        <ng-template #subnav let-module="module">
          <div class="dash-subnav-wrap" [id]="'subnav-' + module">
            <div class="dash-subnav-clip">
              <div class="dash-subnav">
                <ng-container *ngFor="let s of submenus[module]">
                  <a *ngIf="!s.billing || billingConfig.can(s.billing)" [routerLink]="s.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: s.exact }" class="dash-subnav-item">{{ s.label }}</a>
                </ng-container>
              </div>
            </div>
          </div>
        </ng-template>
      </nav>

      <button class="dash-logout" (click)="logout()">
        <svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>
        Salir
      </button>
    </aside>
    <div class="dash-backdrop" *ngIf="menuOpen" (click)="menuOpen = false" aria-hidden="true"></div>

    <main class="dash-main">
      <section class="dash-topbar">
        <button type="button" class="dash-menu-btn" (click)="menuOpen = !menuOpen"
                [attr.aria-expanded]="menuOpen" aria-controls="dash-sidebar" [attr.aria-label]="menuOpen ? 'Cerrar menú' : 'Abrir menú'">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
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
export class DashboardComponent implements OnDestroy {
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

  // Submenús de los módulos (visibles mientras se navega dentro del módulo).
  // "billing" oculta la opción si el rol no tiene ese permiso de Facturación.
  readonly submenus: Record<string, { label: string; link: string; exact: boolean; billing?: BillingAction }[]> = {
    reservations: [
      { label: 'Reservas',              link: '/dashboard/reservations',           exact: true },
      { label: 'Nueva reserva',         link: '/dashboard/reservations/new',       exact: false },
    ],
    lodging: [
      { label: 'Habitaciones',          link: '/dashboard/lodging',                exact: true },
      { label: 'Llegadas y salidas',    link: '/dashboard/lodging/recepcion',      exact: false },
      { label: 'Tarifas y temporadas',  link: '/dashboard/lodging/rates',          exact: false },
    ],
    tra: [
      { label: 'Panel TRA',             link: '/dashboard/tra',                    exact: true },
      { label: 'Configuración TRA',     link: '/dashboard/tra/config',             exact: false },
    ],
    billing: [
      { label: 'Facturas',              link: '/dashboard/billing',          exact: true,  billing: 'Consultar facturas' },
      { label: 'Nueva factura',         link: '/dashboard/billing/new',      exact: false, billing: 'Generar factura' },
      { label: 'Reportes',              link: '/dashboard/billing/reports',  exact: false, billing: 'Generar reportes' },
      { label: 'Impuestos y DIAN',      link: '/dashboard/billing/settings', exact: false, billing: 'Configurar integración' },
    ],
    payroll: [
      { label: 'Empleados',          link: '/dashboard/payroll/employees',   exact: false },
      { label: 'Liquidar nómina',    link: '/dashboard/payroll/liquidation', exact: false },
      { label: 'Comprobantes',       link: '/dashboard/payroll/payslips',    exact: false },
      { label: 'Consultar nómina',   link: '/dashboard/payroll/runs',        exact: false },
      { label: 'Historial de pagos', link: '/dashboard/payroll/history',     exact: false },
      { label: 'Reportes de nómina', link: '/dashboard/payroll/reports',     exact: false },
      { label: 'Informe de costos',  link: '/dashboard/payroll/costs',       exact: false },
    ],
    accounting: [
      { label: 'Registrar ingresos',    link: '/dashboard/accounting/income',      exact: false },
      { label: 'Registrar egresos',     link: '/dashboard/accounting/expense',     exact: false },
      { label: 'Nuevo comprobante',     link: '/dashboard/accounting/movement',    exact: false },
      { label: 'Comprobantes',          link: '/dashboard/accounting/movements',   exact: false },
      { label: 'Libros contables',      link: '/dashboard/accounting/books',       exact: false },
      { label: 'Libro mayor',           link: '/dashboard/accounting/ledger',      exact: false },
      { label: 'Balance financiero',    link: '/dashboard/accounting/balance',     exact: false },
      { label: 'Estados financieros',   link: '/dashboard/accounting/statements',  exact: false },
      { label: 'Indicadores',           link: '/dashboard/accounting/indicators',  exact: false },
      { label: 'Integración',           link: '/dashboard/accounting/integration', exact: false },
      { label: 'Plan de cuentas',       link: '/dashboard/accounting/accounts',    exact: false },
      { label: 'Exportar',              link: '/dashboard/accounting/export',      exact: false },
    ],
    // "Inventario" es exacto: si no, quedaría activo en todas las subpáginas
    inventory: [
      { label: 'Inventario',             link: '/dashboard/inventory',              exact: true },
      { label: 'Dotación de la casa',    link: '/dashboard/inventory/dotacion',     exact: false },
      { label: 'Buscar productos',       link: '/dashboard/inventory/search',       exact: false },
      { label: 'Nuevo producto',         link: '/dashboard/inventory/products/new', exact: false },
      { label: 'Entradas',               link: '/dashboard/inventory/entries',      exact: false },
      { label: 'Salidas',                link: '/dashboard/inventory/exits',        exact: false },
      { label: 'Ajustes de existencias', link: '/dashboard/inventory/adjustments',  exact: false },
      { label: 'Alertas',                link: '/dashboard/inventory/alerts',       exact: false },
      { label: 'Reportes',               link: '/dashboard/inventory/reports',      exact: false },
      { label: 'Exportar',               link: '/dashboard/inventory/export',       exact: false },
    ],
    // "Usuarios" es exacto: si no, quedaría activo en todas las subpáginas
    users: [
      { label: 'Usuarios',              link: '/dashboard/users',           exact: true },
      { label: 'Buscar',                link: '/dashboard/users/search',    exact: false },
      { label: 'Nuevo usuario',         link: '/dashboard/users/new',       exact: false },
      { label: 'Roles y permisos',      link: '/dashboard/users/roles',     exact: false },
      { label: 'Activar / desactivar',  link: '/dashboard/users/status',    exact: false },
      { label: 'Contraseñas',           link: '/dashboard/users/passwords', exact: false },
      { label: 'Historial de actividad', link: '/dashboard/users/activity', exact: false },
      { label: 'Reportes',              link: '/dashboard/users/reports',   exact: false },
      { label: 'Exportar',              link: '/dashboard/users/export',    exact: false },
    ],
    settings: [
      { label: 'Datos del hospedaje',   link: '/dashboard/settings',               exact: true },
      { label: 'Seguridad y acceso',    link: '/dashboard/settings/security',      exact: false },
      { label: 'Impuestos y DIAN',      link: '/dashboard/billing/settings',       exact: false },
      { label: 'Parámetros de nómina',  link: '/dashboard/settings/payroll',       exact: false },
      { label: 'Alojamiento',           link: '/dashboard/settings/lodging',       exact: false },
      { label: 'Metas e indicadores',   link: '/dashboard/settings/goals',         exact: false },
      { label: 'Notificaciones',        link: '/dashboard/settings/notifications', exact: false },
      { label: 'Auditoría y respaldos', link: '/dashboard/settings/audit',         exact: false },
    ],
    reports: [
      { label: 'Reporte general',     link: '/dashboard/reports',              exact: true },
      { label: 'Ocupación',           link: '/dashboard/reports/occupancy',    exact: false },
      { label: 'Reservas',            link: '/dashboard/reports/reservations', exact: false },
      { label: 'Financieros',         link: '/dashboard/reports/financial',    exact: false },
      { label: 'Inventario',          link: '/dashboard/reports/inventory',    exact: false },
      { label: 'Indicadores',         link: '/dashboard/reports/indicators',   exact: false },
      { label: 'Filtrar información', link: '/dashboard/reports/filter',       exact: false },
      { label: 'Gráficos',            link: '/dashboard/reports/charts',       exact: false },
      { label: 'Programados',         link: '/dashboard/reports/scheduled',    exact: false },
    ],
  };
  /** Submenú desplegado (acordeón: solo uno a la vez). */
  openModule = '';
  /** Menú lateral abierto en pantallas pequeñas (en escritorio siempre se ve). */
  menuOpen = false;

  toggleModule(module: string): void {
    this.openModule = this.openModule === module ? '' : module;
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void { this.menuOpen = false; }

  /** Mensajes nuevos de la página web (se consulta cada 2 minutos). */
  unread = 0;
  private unreadTimer?: ReturnType<typeof setInterval>;

  constructor(private router: Router, private notificationService: NotificationService, private elementRef: ElementRef, private users: UsersService,
              private messages: MessagesService, readonly billingConfig: BillingConfigService, private auth: AuthService, private zone: NgZone) {
    // Fuera de Angular: mover el ratón no debe redibujar la pantalla. Solo el cierre vuelve a entrar.
    this.zone.runOutsideAngular(() => {
      this.activityEvents.forEach(e => window.addEventListener(e, this.onActivity, { capture: true, passive: true }));
      document.addEventListener('visibilitychange', this.onVisible);
    });
    this.messages.unread$.subscribe(n => this.unread = n);
    this.messages.refreshUnread();
    this.unreadTimer = setInterval(() => this.messages.refreshUnread(), 120_000);
    this.notificationService.getAll().subscribe(list => this.notifications = list);
    this.openModule = this.moduleOf(this.router.url);
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.openModule = this.moduleOf(e.urlAfterRedirects);
        this.menuOpen = false;
      });
  }

  private moduleOf(url: string): string {
    const segment = url.split(/[/?#]/)[2] ?? '';
    return segment in this.submenus ? segment : '';
  }

  // ── Inactividad ──
  // Cuenta como uso cualquier interacción (también desplazarse o mover el ratón al leer) en
  // cualquier pestaña de SOGO: la última actividad se comparte por localStorage.
  private lastActivity = Date.now();
  private lastShared = 0;
  private refreshing = false;
  private idleTimer = setInterval(() => this.checkIdle(), 30_000);
  private readonly activityEvents = ['keydown', 'mousemove', 'mousedown', 'wheel', 'scroll', 'touchstart', 'pointerdown', 'input'];
  private readonly onActivity = () => this.markActivity();
  private readonly onVisible = () => { if (document.visibilityState === 'visible') this.checkIdle(); };

  private markActivity(): void {
    // Al volver después de mucho tiempo (equipo suspendido, pestaña olvidada) primero se revisa
    // si ya se pasó el tiempo: mover el ratón al regresar no debe revivir la sesión.
    if (this.idleExpired()) { this.closeIdle(); return; }
    const now = Date.now();
    this.lastActivity = now;
    if (now - this.lastShared > 5_000) {
      this.lastShared = now;
      try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* sin almacenamiento: solo esta pestaña */ }
    }
  }

  private lastSeen(): number {
    const shared = Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
    return Math.max(this.lastActivity, shared);
  }

  private idleExpired(): boolean {
    const minutes = this.users.policy.idleMinutes;
    return !!minutes && Date.now() - this.lastSeen() >= minutes * 60_000;
  }

  /** Cierra la sesión si no hubo actividad durante el tiempo configurado en Seguridad y acceso. */
  private checkIdle(): void {
    if (!localStorage.getItem('sogo_token')) return;
    if (this.idleExpired()) { this.closeIdle(); return; }
    this.renewToken();
  }

  private closeIdle(): void {
    const minutes = this.users.policy.idleMinutes;
    this.zone.run(() => {
      this.users.addLog('Sesión: sesión cerrada por inactividad', `${minutes} min sin uso`);
      this.logout();
    });
  }

  /** Mientras la sesión sigue en uso, pide un token nuevo antes de que venza el actual (dura una hora). */
  private renewToken(): void {
    const token = localStorage.getItem('sogo_token');
    if (!token || this.refreshing) return;
    let exp = 0;
    try { exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return; }
    if (exp - Date.now() > 30 * 60_000) return;
    this.refreshing = true;
    this.auth.refresh().subscribe({
      next: r => { if (localStorage.getItem('sogo_token')) localStorage.setItem('sogo_token', r.token); this.refreshing = false; },
      error: () => { this.refreshing = false; },
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.idleTimer); clearInterval(this.unreadTimer);
    this.activityEvents.forEach(e => window.removeEventListener(e, this.onActivity, true));
    document.removeEventListener('visibilitychange', this.onVisible);
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

  /** Menú según los permisos de los roles de la sesión (Usuarios y Roles). */
  canSee(m: Module): boolean { return this.users.can(m, 'view'); }

  logout() {
    this.users.recordLogout();
    localStorage.removeItem('sogo_token');
    localStorage.removeItem('sogo_role');
    localStorage.removeItem('sogo_username');
    localStorage.removeItem('sogo_fullname');
    localStorage.removeItem('sogo_email');
    this.router.navigate(['/']);
  }
}
