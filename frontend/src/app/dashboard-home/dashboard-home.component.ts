import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReservationService, isoDate } from '../reservations/reservation.service';
import { Reservation, lodgingLabel } from '../reservations/reservation.model';
import { StayService } from '../lodging/stay.service';
import { Stay } from '../lodging/stay.model';
import { RoomService } from '../lodging/room.service';
import { RoomStatus, RoomWithStatus } from '../lodging/room.model';
import { InvoiceService } from '../billing/invoice.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { NotificationService } from '../notifications/notification.service';
import { AppNotification } from '../notifications/notification.model';

interface StatusCount { status: string; count: number; color: string; }
interface DonutSegment { color: string; dasharray: string; dashoffset: number; }
interface AgendaItem {
  type: 'Llegada' | 'Salida' | 'Limpieza' | 'Mantenimiento';
  title: string;
  detail: string;
  // Fecha real cuando existe (llegadas/salidas la tienen); limpieza y
  // mantenimiento son estado actual de la habitación, no un evento agendado,
  // así que no se les inventa una fecha ni una hora que no existen en los datos.
  date: string;
  status: string;
  statusClass: string;
}
type AgendaTab = 'Todos' | 'Llegada' | 'Salida' | 'Limpieza' | 'Mantenimiento';

const ROOM_STATUS_COLORS: Record<RoomStatus, string> = {
  'Disponible':    '#23B57B',
  'Ocupada':       '#0E5A9C',
  'Reservada':     '#F4B942',
  'En limpieza':   '#06B6D4',
  'Mantenimiento': '#DC2626',
};

const FLOOR_STATUS_ABBR: Record<RoomStatus, string> = {
  'Disponible':    'disp.',
  'Ocupada':       'ocup.',
  'Reservada':     'res.',
  'En limpieza':   'limp.',
  'Mantenimiento': 'mant.',
};

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./dashboard-home.component.css'],
  template: `
  <!-- KPIs: cada valor y desglose viene de un servicio real del sistema (reservas, alojamiento, facturación) -->
  <section class="dash-stats">
    <a routerLink="/dashboard/reservations" class="dash-stat-card dash-stat-card--green">
      <svg class="dash-stat-watermark" viewBox="0 0 100 60"><path d="M0 60 L22 20 L34 38 L50 10 L72 42 L84 26 L100 60 Z"/></svg>
      <div class="dash-stat-icon">
        <svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      </div>
      <span class="dash-stat-label">Llegadas próximas</span>
      <span class="dash-stat-value">{{ arrivalsConfirmed + arrivalsPending }}</span>
      <span class="dash-stat-detail">{{ arrivalsConfirmed }} confirmadas · {{ arrivalsPending }} pendientes</span>
      <svg class="dash-stat-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <a routerLink="/dashboard/lodging" class="dash-stat-card dash-stat-card--blue">
      <svg class="dash-stat-watermark" viewBox="0 0 100 60"><path d="M0 60 L22 20 L34 38 L50 10 L72 42 L84 26 L100 60 Z"/></svg>
      <div class="dash-stat-icon">
        <svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>
      </div>
      <span class="dash-stat-label">Salidas próximas</span>
      <span class="dash-stat-value">{{ departuresCount }}</span>
      <span class="dash-stat-detail">{{ departuresInProgress }} en check-out · {{ departuresPending }} por salir</span>
      <svg class="dash-stat-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <a routerLink="/dashboard/lodging" class="dash-stat-card dash-stat-card--purple">
      <svg class="dash-stat-watermark" viewBox="0 0 100 60"><path d="M0 60 L22 20 L34 38 L50 10 L72 42 L84 26 L100 60 Z"/></svg>
      <div class="dash-stat-icon">
        <svg viewBox="0 0 24 24"><path d="M2 20v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2"/><path d="M12 15v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7"/><path d="M2 17h20"/><path d="M4 20v-3M20 20v-3"/></svg>
      </div>
      <span class="dash-stat-label">Habitaciones ocupadas</span>
      <span class="dash-stat-value">{{ occupiedRooms }} <small>/ {{ rooms.length }}</small></span>
      <span class="dash-stat-detail">{{ occupancyPct }}% de ocupación</span>
      <svg class="dash-stat-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <a routerLink="/dashboard/reservations" class="dash-stat-card dash-stat-card--teal">
      <svg class="dash-stat-watermark" viewBox="0 0 100 60"><path d="M0 60 L22 20 L34 38 L50 10 L72 42 L84 26 L100 60 Z"/></svg>
      <div class="dash-stat-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <span class="dash-stat-label">Reservas activas</span>
      <span class="dash-stat-value">{{ activeReservations }}</span>
      <span class="dash-stat-detail">{{ reservationsConfirmed }} confirmadas · {{ reservationsPending }} pendientes</span>
      <svg class="dash-stat-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <a routerLink="/dashboard/billing" class="dash-stat-card dash-stat-card--amber">
      <svg class="dash-stat-watermark" viewBox="0 0 100 60"><path d="M0 60 L22 20 L34 38 L50 10 L72 42 L84 26 L100 60 Z"/></svg>
      <div class="dash-stat-icon">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </div>
      <span class="dash-stat-label">Ingresos registrados</span>
      <span class="dash-stat-value dash-stat-value--money">{{ formatMoney(invoiceStats.income) }}</span>
      <span class="dash-stat-detail">{{ invoiceStats.paid }} facturas pagadas</span>
      <svg class="dash-stat-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
    </a>
  </section>

  <section class="dash-row dash-row--rooms">
    <article class="dash-card">
      <div class="dash-card-header">
        <h2 class="dash-card-title">
          <span class="dash-card-title-icon">
            <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 5-3 6-3 6h18s-3-1-3-6"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </span>
          Alertas y pendientes
        </h2>
        <span class="dash-card-count" *ngIf="alerts.length">{{ alerts.length }}</span>
      </div>
      <ul class="dash-alert-list" *ngIf="alerts.length; else noAlerts">
        <li class="dash-alert-row" *ngFor="let a of alerts">
          <span class="dash-alert-icon" [ngClass]="'dash-alert-icon--' + a.icon">
            <svg *ngIf="a.icon === 'checkout'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <svg *ngIf="a.icon === 'cleaning'" viewBox="0 0 24 24"><path d="M3 21l7-7"/><path d="M12 9l-1.5-4.5a1 1 0 0 1 .5-1.2c1.8-.9 4.5-1 6 .5s1.4 4.2.5 6a1 1 0 0 1-1.2.5L12 9z"/></svg>
            <svg *ngIf="a.icon === 'maintenance'" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <svg *ngIf="a.icon === 'billing'" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <svg *ngIf="a.icon === 'review'" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <svg *ngIf="a.icon === 'inventory'" viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8"/></svg>
          </span>
          <span class="dash-alert-text">
            <span class="dash-alert-label">{{ a.label }}</span>
            <span class="dash-alert-detail">{{ a.detail }}</span>
          </span>
          <span class="dash-priority" [ngClass]="'dash-priority--' + a.level">{{ a.level }}</span>
          <a [routerLink]="a.link" class="dash-alert-link" aria-label="Ver detalle">›</a>
        </li>
      </ul>
      <ng-template #noAlerts><p class="dash-empty">No hay alertas pendientes por el momento.</p></ng-template>
    </article>

    <article class="dash-card dash-card--rooms">
      <h2 class="dash-card-title">Estado de habitaciones</h2>
      <div class="dash-rooms-grid">
        <!-- Izquierda: la propiedad en general -->
        <div class="dash-rooms-col">
          <div class="dash-occ-wrap" *ngIf="rooms.length; else noRooms">
            <div class="dash-donut-wrap">
              <svg class="dash-donut" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="44" fill="none" stroke="#E9EEF5" stroke-width="18" />
                <circle *ngFor="let seg of roomDonutSegments" cx="60" cy="60" r="44" fill="none"
                        [attr.stroke]="seg.color" stroke-width="18"
                        [attr.stroke-dasharray]="seg.dasharray" [attr.stroke-dashoffset]="seg.dashoffset"
                        transform="rotate(-90 60 60)"/>
                <text x="60" y="58" text-anchor="middle" font-family="Poppins, sans-serif" font-size="22" font-weight="700" fill="#2B2B2B">{{ rooms.length }}</text>
                <text x="60" y="76" text-anchor="middle" font-family="Poppins, sans-serif" font-size="10" fill="#7A7A7A">Habitaciones</text>
              </svg>
            </div>
            <ul class="dash-occ-legend">
              <li *ngFor="let s of roomStatusCounts">
                <span class="dash-legend-dot" [style.background]="s.color"></span>
                <span class="dash-legend-label">{{ s.status }}</span>
                <strong>{{ s.count }}</strong>
                <svg class="dash-legend-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
              </li>
            </ul>
          </div>
          <ng-template #noRooms><p class="dash-empty">No hay habitaciones registradas.</p></ng-template>
        </div>

        <!-- Derecha: desglose por piso -->
        <div class="dash-rooms-col dash-rooms-col--floors">
          <h3 class="dash-subcard-title">Por piso</h3>
          <div class="dash-floor-block" *ngFor="let f of floors">
            <div class="dash-floor-head">
              <span class="dash-floor-name">Piso {{ f.floor }}</span>
              <span class="dash-floor-count">{{ f.rooms.length }} habitaciones</span>
            </div>
            <div class="dash-floor-bar">
              <span *ngFor="let seg of f.segments" [style.width.%]="seg.pct" [style.background]="seg.color"></span>
            </div>
            <p class="dash-floor-caption">{{ f.caption }}</p>
          </div>
        </div>
      </div>
    </article>
  </section>

  <section class="dash-row dash-row--triple">
    <!-- Agenda operativa: línea de tiempo. Limpieza/mantenimiento no tienen fecha real
         (son estado actual de la habitación, no un evento agendado con hora), así que
         muestran "Ahora" en vez de una hora inventada. -->
    <article class="dash-card">
      <div class="dash-card-header">
        <h2 class="dash-card-title">
          <span class="dash-card-title-icon dash-card-title-icon--blue">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          Agenda operativa
        </h2>
        <a routerLink="/dashboard/lodging" class="dash-card-link">Ver alojamiento →</a>
      </div>
      <div class="dash-tabs">
        <button *ngFor="let t of tabs" class="dash-tab" [class.active]="activeTab === t" (click)="activeTab = t">{{ t }}</button>
      </div>
      <ul class="dash-timeline" *ngIf="filteredAgenda.length; else noAgenda">
        <li class="dash-timeline-row" *ngFor="let item of filteredAgenda">
          <div class="dash-timeline-when">
            <span class="dash-timeline-dot" [ngClass]="'dash-timeline-dot--' + item.type"></span>
            <span class="dash-timeline-date">{{ formatShortDate(item.date) }}</span>
          </div>
          <span class="dash-agenda-type" [ngClass]="'dash-agenda-type--' + item.type">{{ item.type }}</span>
          <span class="dash-agenda-body">
            <span class="dash-agenda-name">{{ item.title }}</span>
            <span class="dash-agenda-detail">{{ item.detail }}</span>
          </span>
          <span class="dash-badge" [ngClass]="item.statusClass">{{ item.status }}</span>
        </li>
      </ul>
      <ng-template #noAgenda><p class="dash-empty">No hay actividad para este filtro.</p></ng-template>
    </article>

    <article class="dash-card">
      <div class="dash-card-header">
        <h2 class="dash-card-title">
          <span class="dash-card-title-icon dash-card-title-icon--blue">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          Reservas recientes
        </h2>
        <a routerLink="/dashboard/reservations" class="dash-card-link">Ver todas →</a>
      </div>
      <ul class="dash-reservation-list" *ngIf="recentReservations.length; else noRecent">
        <li class="dash-reservation" *ngFor="let r of recentReservations">
          <div class="dash-res-info">
            <span class="dash-res-name">{{ r.guestName }}</span>
            <span class="dash-res-room">{{ r.code }} · {{ lodging(r) }}</span>
            <span class="dash-res-room">{{ formatShortDate(r.checkIn) }} → {{ formatShortDate(r.checkOut) }}</span>
          </div>
          <span class="dash-badge" [ngClass]="badgeClass(r.status)">{{ r.status }}</span>
          <a [routerLink]="['/dashboard/reservations', r.id]" class="dash-alert-link" aria-label="Ver detalle">›</a>
        </li>
      </ul>
      <ng-template #noRecent><p class="dash-empty">No se encontraron reservas.</p></ng-template>
    </article>

    <article class="dash-card">
      <div class="dash-card-header">
        <h2 class="dash-card-title">
          <span class="dash-card-title-icon dash-card-title-icon--teal">
            <svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          </span>
          Resumen financiero
        </h2>
        <a routerLink="/dashboard/billing" class="dash-card-link">Ver facturación →</a>
      </div>

      <div class="dash-finance-headline">
        <span class="dash-finance-amount">{{ formatMoney(invoiceStats.income) }}</span>
        <span class="dash-finance-label">Ingresos registrados</span>
      </div>

      <div class="dash-chart" *ngIf="incomeByDate.length; else noIncome">
        <div class="dash-chart-bars">
          <div class="dash-chart-col" *ngFor="let d of incomeByDate">
            <div class="dash-chart-bar" [style.height.%]="chartHeight(d.amount)" [title]="formatMoney(d.amount)"></div>
            <span class="dash-chart-label">{{ d.date | slice:8:10 }}/{{ d.date | slice:5:7 }}</span>
          </div>
        </div>
        <p class="dash-chart-caption">Ingresos por fecha de emisión de factura</p>
      </div>
      <ng-template #noIncome><p class="dash-empty">No hay facturas pagadas registradas.</p></ng-template>

      <div class="dash-mini-stats">
        <div class="dash-mini-stat">
          <span class="dash-mini-icon dash-mini-icon--purple">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
          <span class="dash-mini-text">
            <span class="dash-mini-label">Facturas emitidas</span>
            <span class="dash-mini-value">{{ invoiceStats.total }}</span>
          </span>
        </div>
        <div class="dash-mini-stat">
          <span class="dash-mini-icon dash-mini-icon--green">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
          <span class="dash-mini-text">
            <span class="dash-mini-label">Facturas pagadas</span>
            <span class="dash-mini-value">{{ invoiceStats.paid }}</span>
          </span>
        </div>
        <div class="dash-mini-stat">
          <span class="dash-mini-icon dash-mini-icon--amber">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
          <span class="dash-mini-text">
            <span class="dash-mini-label">Pagos pendientes</span>
            <span class="dash-mini-value">{{ formatMoney(invoiceStats.pendingAmount) }}</span>
          </span>
        </div>
        <div class="dash-mini-stat">
          <span class="dash-mini-icon dash-mini-icon--red">
            <svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
          </span>
          <span class="dash-mini-text">
            <span class="dash-mini-label">Ventas restaurante</span>
            <span class="dash-mini-value">{{ formatMoney(restaurantStats.sales) }}</span>
          </span>
        </div>
      </div>
    </article>
  </section>

  <!-- Acciones rápidas: enlazan a rutas reales ya existentes en el sistema -->
  <section class="dash-card">
    <h2 class="dash-card-title">Acciones rápidas</h2>
    <div class="dash-quick-actions">
      <a routerLink="/dashboard/reservations/new" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
        Nueva reserva
      </a>
      <a routerLink="/dashboard/lodging/checkin" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        Registrar check-in
      </a>
      <a routerLink="/dashboard/lodging" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><path d="M2 20v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2"/><path d="M12 15v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7"/><path d="M2 17h20"/></svg>
        Consultar habitaciones
      </a>
      <a routerLink="/dashboard/restaurant/orders/new" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
        Registrar consumo
      </a>
      <a routerLink="/dashboard/billing/new" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Generar factura
      </a>
      <a routerLink="/dashboard/inventory" class="dash-quick-action">
        <svg viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8"/></svg>
        Consultar inventario
      </a>
    </div>
  </section>
  `
})
export class DashboardHomeComponent {
  reservations: Reservation[] = [];
  rooms: RoomWithStatus[] = [];

  occupiedRooms = 0;
  occupancyPct = 0;
  departuresCount = 0;
  departuresPending = 0;
  departuresInProgress = 0;
  activeReservations = 0;
  arrivalsConfirmed = 0;
  arrivalsPending = 0;
  reservationsConfirmed = 0;
  reservationsPending = 0;
  readonly lodging = lodgingLabel;

  invoiceStats: ReturnType<InvoiceService['getStats']> = { total: 0, paid: 0, pending: 0, annulled: 0, rejected: 0, income: 0, pendingAmount: 0 };
  restaurantStats: ReturnType<RestaurantService['getStats']> = { sales: 0, total: 0, active: 0, products: 0, avgTicket: 0, byCategory: { Alimentos: 0, Bebidas: 0, Postres: 0, Otros: 0 } };
  incomeByDate: { date: string; amount: number }[] = [];

  recentReservations: Reservation[] = [];
  upcomingArrivals: Reservation[] = [];
  upcomingDepartures: Stay[] = [];
  alerts: AppNotification[] = [];

  roomStatusCounts: StatusCount[] = [];
  roomDonutSegments: DonutSegment[] = [];
  floors: { floor: number; rooms: RoomWithStatus[]; segments: { pct: number; color: string }[]; caption: string }[] = [];

  agendaItems: AgendaItem[] = [];
  tabs: AgendaTab[] = ['Todos', 'Llegada', 'Salida', 'Limpieza', 'Mantenimiento'];
  activeTab: AgendaTab = 'Todos';

  private currencyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  constructor(
    private reservationService: ReservationService,
    private stayService: StayService,
    private roomService: RoomService,
    private invoiceService: InvoiceService,
    private restaurantService: RestaurantService,
    private notificationService: NotificationService,
  ) {
    this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.computeReservationDerived();
      this.computeAgenda();
    });

    this.roomService.getAll().subscribe(list => {
      this.rooms = list;
      this.occupiedRooms = list.filter(r => r.status === 'Ocupada').length;
      this.occupancyPct = list.length ? Math.round((this.occupiedRooms / list.length) * 100) : 0;
      this.computeRoomDerived();
      this.computeAgenda();
    });

    this.notificationService.getAll().subscribe(list => this.alerts = list);

    const departures = this.stayService.getDepartures();
    this.departuresCount = departures.length;
    this.departuresPending = departures.filter(s => s.status === 'Por salir').length;
    this.departuresInProgress = departures.filter(s => s.status === 'Check-Out').length;
    this.upcomingDepartures = [...this.stayService.getInHouse(), ...this.stayService.getDepartures()]
      .sort((a, b) => a.estimatedCheckOut.localeCompare(b.estimatedCheckOut))
      .slice(0, 4);

    this.invoiceStats = this.invoiceService.getStats();
    this.incomeByDate = this.invoiceService.getIncomeByDate();
    this.restaurantStats = this.restaurantService.getStats();
  }

  formatMoney(value: number): string {
    return this.currencyFmt.format(value);
  }

  chartHeight(amount: number): number {
    const max = Math.max(...this.incomeByDate.map(d => d.amount), 1);
    return Math.max(6, (amount / max) * 100);
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'Confirmada':    return 'dash-badge--confirmed';
      case 'Pendiente':     return 'dash-badge--waiting';
      case 'Finalizada':    return 'dash-badge--finished';
      case 'Cancelada':
      case 'No presentada': return 'dash-badge--cancelled';
      default:              return 'dash-badge--pending';
    }
  }

  // La tarjeta tiene altura fija (igual a sus vecinas) y la lista hace scroll
  // por dentro, así que "Todos" puede mostrar todo sin descuadrar la fila.
  get filteredAgenda(): AgendaItem[] {
    if (this.activeTab === 'Todos') return this.agendaItems;
    return this.agendaItems.filter(a => a.type === this.activeTab);
  }

  private computeReservationDerived(): void {
    const active = this.reservations.filter(r => r.status === 'Confirmada' || r.status === 'Pendiente');
    this.activeReservations = active.length;
    this.reservationsConfirmed = active.filter(r => r.status === 'Confirmada').length;
    this.reservationsPending = active.filter(r => r.status === 'Pendiente').length;

    this.recentReservations = [...this.reservations]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    const today = isoDate(0);
    const allUpcomingArrivals = active.filter(r => r.checkIn >= today);
    this.arrivalsConfirmed = allUpcomingArrivals.filter(r => r.status === 'Confirmada').length;
    this.arrivalsPending = allUpcomingArrivals.filter(r => r.status === 'Pendiente').length;
    this.upcomingArrivals = [...allUpcomingArrivals]
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 4);
  }

  private computeRoomDerived(): void {
    const counts: Record<string, number> = {};
    this.rooms.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
    this.roomStatusCounts = (Object.keys(ROOM_STATUS_COLORS) as RoomStatus[])
      .map(status => ({ status, count: counts[status] || 0, color: ROOM_STATUS_COLORS[status] }))
      .filter(s => s.count > 0 || s.status === 'Disponible' || s.status === 'Ocupada');

    const total = this.rooms.length || 1;
    const circumference = 2 * Math.PI * 44;
    let cumulative = 0;
    this.roomDonutSegments = this.roomStatusCounts.filter(s => s.count > 0).map(s => {
      const dash = (s.count / total) * circumference;
      const seg: DonutSegment = { color: s.color, dasharray: `${dash} ${circumference - dash}`, dashoffset: -cumulative };
      cumulative += dash;
      return seg;
    });

    const floorNumbers = [...new Set(this.rooms.map(r => r.floor))].sort();
    this.floors = floorNumbers.map(floor => {
      const floorRooms = this.rooms.filter(r => r.floor === floor);
      const byStatus: Record<string, number> = {};
      floorRooms.forEach(r => byStatus[r.status] = (byStatus[r.status] || 0) + 1);
      const segments = Object.entries(byStatus).map(([status, count]) => ({
        pct: (count / floorRooms.length) * 100,
        color: ROOM_STATUS_COLORS[status as RoomStatus]
      }));
      const caption = Object.entries(byStatus)
        .map(([status, count]) => `${count} ${FLOOR_STATUS_ABBR[status as RoomStatus] || status.toLowerCase()}`)
        .join(' · ');
      return { floor, rooms: floorRooms, segments, caption };
    });
  }

  private floorFor(roomNumber: string): number | undefined {
    return this.rooms.find(r => r.number === roomNumber)?.floor;
  }

  private computeAgenda(): void {
    const items: AgendaItem[] = [];

    this.upcomingArrivals.forEach(r => {
      const floor = r.lodgingType === 'Habitación' ? this.floorFor(r.rooms[0]) : undefined;
      items.push({
        type: 'Llegada', title: r.guestName,
        detail: `${lodgingLabel(r)}${floor ? ' · Piso ' + floor : ''}`,
        date: r.checkIn, status: r.status, statusClass: this.badgeClass(r.status)
      });
    });
    this.upcomingDepartures.forEach(s => {
      const floor = this.floorFor(s.roomNumber);
      items.push({
        type: 'Salida', title: s.guestName,
        detail: `Habitación ${s.roomNumber}${floor ? ' · Piso ' + floor : ''}`,
        date: s.estimatedCheckOut, status: s.status, statusClass: 'dash-badge--checkout'
      });
    });
    this.rooms.filter(r => r.status === 'En limpieza').forEach(r => {
      items.push({
        type: 'Limpieza', title: `Habitación ${r.number}`, detail: `Piso ${r.floor} · ${r.type}`,
        date: '', status: 'En limpieza', statusClass: 'dash-badge--cleaning'
      });
    });
    this.rooms.filter(r => r.status === 'Mantenimiento').forEach(r => {
      items.push({
        type: 'Mantenimiento', title: `Habitación ${r.number}`, detail: `Piso ${r.floor} · ${r.type}`,
        date: '', status: 'En mantenimiento', statusClass: 'dash-badge--maintenance'
      });
    });

    this.agendaItems = items;
  }

  formatShortDate(date: string): string {
    if (!date) return 'Ahora';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '');
  }
}
