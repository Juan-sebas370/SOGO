import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReservationService } from '../reservations/reservation.service';
import { isoDate } from '../shared/date-utils';
import { Reservation, lodgingLabel, isInHouse, awaitsCheckIn } from '../reservations/reservation.model';
import { RoomService } from '../lodging/room.service';
import { RoomStatus, RoomWithStatus } from '../lodging/room.model';
import { InvoiceService } from '../billing/invoice.service';
import { NotificationService } from '../notifications/notification.service';
import { AppNotification } from '../notifications/notification.model';
import { UsersService } from '../users/users.service';
import { Module } from '../users/users.model';

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
interface QuickAction { label: string; link: string; module: Module; icon: string; }

const ROOM_STATUS_COLORS: Record<RoomStatus, string> = {
  'Disponible':        '#23B57B',
  'Ocupada':           '#0E5A9C',
  'Reservada':         '#F4B942',
  'En limpieza':       '#06B6D4',
  'En mantenimiento':  '#EA580C',
  'Fuera de servicio': '#DC2626',
};

const FLOOR_STATUS_ABBR: Record<RoomStatus, string> = {
  'Disponible':        'disp.',
  'Ocupada':           'ocup.',
  'Reservada':         'res.',
  'En limpieza':       'limp.',
  'En mantenimiento':  'mant.',
  'Fuera de servicio': 'f. serv.',
};

/** Accesos rápidos: rutas reales; cada uno se muestra solo si el rol puede ver su módulo. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Nueva reserva',     link: '/dashboard/reservations/new', module: 'Reservas',     icon: 'M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM12 13v5M9.5 15.5h5' },
  { label: 'Llegadas y salidas', link: '/dashboard/lodging/recepcion', module: 'Alojamiento',  icon: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3' },
  { label: 'Habitaciones',      link: '/dashboard/lodging',          module: 'Alojamiento',  icon: 'M2 20v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2M12 15v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7M2 17h20' },
  { label: 'Nueva factura',     link: '/dashboard/billing/new',      module: 'Facturación',  icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8' },
  { label: 'Registrar ingreso', link: '/dashboard/accounting/income',  module: 'Contabilidad', icon: 'M12 19V5M5 12l7-7 7 7' },
  { label: 'Registrar egreso',  link: '/dashboard/accounting/expense', module: 'Contabilidad', icon: 'M12 5v14M19 12l-7 7-7-7' },
  { label: 'Inventario',        link: '/dashboard/inventory',        module: 'Inventarios',  icon: 'M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8' },
];

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./dashboard-home.component.css'],
  template: `
  <!-- Accesos rápidos -->
  <nav class="dh-quick" aria-label="Accesos rápidos" *ngIf="quickActions.length">
    <a *ngFor="let q of quickActions" [routerLink]="q.link" class="dh-quick-btn">
      <svg viewBox="0 0 24 24"><path [attr.d]="q.icon"/></svg>{{ q.label }}
    </a>
  </nav>

  <!-- Indicadores: cada valor viene de un servicio real (reservas, alojamiento, facturación) -->
  <section class="dh-kpis">
    <a routerLink="/dashboard/lodging" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--blue"><svg viewBox="0 0 24 24"><path d="M2 20v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2M12 15v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7M2 17h20"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Ocupación</span>
        <span class="dh-kpi-value">{{ occupancyPct }}%</span>
        <span class="dh-kpi-bar"><span [style.width.%]="occupancyPct"></span></span>
        <span class="dh-kpi-detail">{{ occupiedRooms }} de {{ rooms.length }} habitaciones</span>
      </span>
    </a>
    <a routerLink="/dashboard/reservations" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Llegadas</span>
        <span class="dh-kpi-value">{{ arrivalsToday }} <small>hoy</small></span>
        <span class="dh-kpi-detail">{{ arrivalsConfirmed + arrivalsPending }} próximas · {{ arrivalsPending }} sin confirmar</span>
      </span>
    </a>
    <a routerLink="/dashboard/lodging" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--indigo"><svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Salidas</span>
        <span class="dh-kpi-value">{{ departuresToday }} <small>hoy</small></span>
        <span class="dh-kpi-detail">{{ departuresCount }} huéspedes alojados</span>
      </span>
    </a>
    <a routerLink="/dashboard/reservations" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--teal"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Reservas activas</span>
        <span class="dh-kpi-value">{{ activeReservations }}</span>
        <span class="dh-kpi-detail">{{ reservationsConfirmed }} confirmadas · {{ reservationsPending }} pendientes</span>
      </span>
    </a>
    <a routerLink="/dashboard/billing" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Ingresos recibidos</span>
        <span class="dh-kpi-value dh-kpi-value--money">{{ formatMoney(invoiceStats.income) }}</span>
        <span class="dh-kpi-detail">{{ invoiceStats.paid }} facturas pagadas</span>
      </span>
    </a>
    <a routerLink="/dashboard/billing" class="dh-kpi">
      <span class="dh-kpi-icon dh-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
      <span class="dh-kpi-body">
        <span class="dh-kpi-label">Por cobrar</span>
        <span class="dh-kpi-value dh-kpi-value--money">{{ formatMoney(invoiceStats.pendingAmount) }}</span>
        <span class="dh-kpi-detail">{{ invoiceStats.pending }} facturas con saldo</span>
      </span>
    </a>
  </section>

  <!-- Operación del día -->
  <section class="dh-row dh-row--ops">
    <!-- Limpieza/mantenimiento no tienen fecha real (son estado actual de la habitación),
         así que muestran "Ahora" en vez de una hora inventada. -->
    <article class="dh-card">
      <header class="dh-card-head">
        <h2 class="dh-card-title">Agenda operativa</h2>
        <a routerLink="/dashboard/lodging" class="dh-card-link">Ver alojamiento</a>
      </header>
      <div class="dh-tabs" role="tablist">
        <button *ngFor="let t of tabs" type="button" role="tab" class="dh-tab" [class.active]="activeTab === t" [attr.aria-selected]="activeTab === t" (click)="activeTab = t">
          {{ t === 'Todos' ? 'Todos' : t === 'Mantenimiento' ? 'Mant.' : t + 's' }}<span class="dh-tab-n">{{ countOf(t) }}</span>
        </button>
      </div>
      <ul class="dh-list dh-scroll" *ngIf="filteredAgenda.length; else noAgenda">
        <li class="dh-agenda" *ngFor="let item of filteredAgenda">
          <span class="dh-date" [class.dh-date--now]="!item.date">{{ formatShortDate(item.date) }}</span>
          <span class="dh-type" [ngClass]="'dh-type--' + item.type">{{ item.type }}</span>
          <span class="dh-item-text">
            <span class="dh-item-title">{{ item.title }}</span>
            <span class="dh-item-sub">{{ item.detail }}</span>
          </span>
          <span class="dh-badge" [ngClass]="item.statusClass">{{ item.status }}</span>
        </li>
      </ul>
      <ng-template #noAgenda><p class="dh-empty">No hay actividad para este filtro.</p></ng-template>
    </article>

    <article class="dh-card">
      <header class="dh-card-head">
        <h2 class="dh-card-title">Alertas y pendientes <span class="dh-count" *ngIf="alerts.length">{{ alerts.length }}</span></h2>
      </header>
      <ul class="dh-list dh-scroll" *ngIf="alerts.length; else noAlerts">
        <li *ngFor="let a of alerts">
          <a [routerLink]="a.link" class="dh-alert" [ngClass]="'dh-alert--' + a.level">
            <span class="dh-item-text">
              <span class="dh-item-title">{{ a.label }}</span>
              <span class="dh-item-sub">{{ a.detail }}</span>
            </span>
            <span class="dh-priority" [ngClass]="'dh-priority--' + a.level">{{ a.level }}</span>
            <svg class="dh-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
          </a>
        </li>
      </ul>
      <ng-template #noAlerts>
        <div class="dh-ok"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>Todo al día: no hay alertas pendientes.</div>
      </ng-template>
    </article>
  </section>

  <!-- Habitaciones · reservas · finanzas -->
  <section class="dh-row dh-row--triple">
    <article class="dh-card">
      <header class="dh-card-head">
        <h2 class="dh-card-title">Estado de habitaciones</h2>
        <a routerLink="/dashboard/lodging" class="dh-card-link">Ver todas</a>
      </header>
      <ng-container *ngIf="rooms.length; else noRooms">
        <div class="dh-occ">
          <svg class="dh-donut" viewBox="0 0 120 120" role="img" [attr.aria-label]="occupiedRooms + ' de ' + rooms.length + ' habitaciones ocupadas'">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#EEF2F7" stroke-width="14" />
            <circle *ngFor="let seg of roomDonutSegments" cx="60" cy="60" r="46" fill="none"
                    [attr.stroke]="seg.color" stroke-width="14"
                    [attr.stroke-dasharray]="seg.dasharray" [attr.stroke-dashoffset]="seg.dashoffset"
                    transform="rotate(-90 60 60)"/>
            <text x="60" y="60" text-anchor="middle" font-family="Poppins, sans-serif" font-size="24" font-weight="700" fill="#2B2B2B">{{ rooms.length }}</text>
            <text x="60" y="77" text-anchor="middle" font-family="Poppins, sans-serif" font-size="10" fill="#7A7A7A">habitaciones</text>
          </svg>
          <ul class="dh-legend">
            <li *ngFor="let s of roomStatusCounts">
              <span class="dh-dot" [style.background]="s.color"></span>{{ s.status }}<strong>{{ s.count }}</strong>
            </li>
          </ul>
        </div>
        <div class="dh-floors">
          <div class="dh-floor" *ngFor="let f of floors">
            <div class="dh-floor-head"><strong>Piso {{ f.floor }}</strong><span>{{ f.caption }}</span></div>
            <div class="dh-floor-bar"><span *ngFor="let seg of f.segments" [style.width.%]="seg.pct" [style.background]="seg.color"></span></div>
          </div>
        </div>
      </ng-container>
      <ng-template #noRooms><p class="dh-empty">No hay habitaciones registradas.</p></ng-template>
    </article>

    <article class="dh-card">
      <header class="dh-card-head">
        <h2 class="dh-card-title">Reservas recientes</h2>
        <a routerLink="/dashboard/reservations" class="dh-card-link">Ver todas</a>
      </header>
      <ul class="dh-list" *ngIf="recentReservations.length; else noRecent">
        <li *ngFor="let r of recentReservations">
          <a [routerLink]="['/dashboard/reservations', r.id]" class="dh-res">
            <span class="dh-avatar">{{ initials(r.guestName) }}</span>
            <span class="dh-item-text">
              <span class="dh-item-title">{{ r.guestName }}</span>
              <span class="dh-item-sub">{{ formatShortDate(r.checkIn) }} → {{ formatShortDate(r.checkOut) }} · {{ lodging(r) }}</span>
            </span>
            <span class="dh-badge" [ngClass]="badgeClass(r.status)">{{ r.status }}</span>
          </a>
        </li>
      </ul>
      <ng-template #noRecent><p class="dh-empty">No se encontraron reservas.</p></ng-template>
    </article>

    <article class="dh-card">
      <header class="dh-card-head">
        <h2 class="dh-card-title">Resumen financiero</h2>
        <a routerLink="/dashboard/billing" class="dh-card-link">Ver facturación</a>
      </header>
      <div class="dh-fin-stats">
        <div><span>Facturado</span><strong>{{ formatMoney(invoiceStats.income + invoiceStats.pendingAmount) }}</strong></div>
        <div><span>Recibido</span><strong class="dh-pos">{{ formatMoney(invoiceStats.income) }}</strong></div>
        <div><span>Por cobrar</span><strong [class.dh-neg]="invoiceStats.pendingAmount > 0">{{ formatMoney(invoiceStats.pendingAmount) }}</strong></div>
      </div>
      <div class="dh-chart" *ngIf="recentIncome.length; else noIncome">
        <div class="dh-chart-bars">
          <div class="dh-chart-col" *ngFor="let d of recentIncome" [title]="formatShortDate(d.date) + ': ' + formatMoney(d.amount)">
            <div class="dh-chart-bar" [style.height.%]="chartHeight(d.amount)"></div>
            <span class="dh-chart-label">{{ d.date | slice:8:10 }}/{{ d.date | slice:5:7 }}</span>
          </div>
        </div>
        <p class="dh-chart-caption">Facturado por fecha de emisión · últimos {{ recentIncome.length }} días con facturas</p>
      </div>
      <ng-template #noIncome><p class="dh-empty">Aún no hay facturas emitidas.</p></ng-template>
    </article>
  </section>
  `
})
export class DashboardHomeComponent implements OnDestroy {
  reservations: Reservation[] = [];
  rooms: RoomWithStatus[] = [];

  occupiedRooms = 0;
  occupancyPct = 0;
  departuresCount = 0;
  departuresToday = 0;
  activeReservations = 0;
  arrivalsToday = 0;
  arrivalsConfirmed = 0;
  arrivalsPending = 0;
  reservationsConfirmed = 0;
  reservationsPending = 0;
  readonly lodging = lodgingLabel;

  invoiceStats: ReturnType<InvoiceService['getStats']> = { total: 0, paid: 0, pending: 0, annulled: 0, rejected: 0, income: 0, pendingAmount: 0 };
  recentIncome: { date: string; amount: number }[] = [];

  recentReservations: Reservation[] = [];
  upcomingArrivals: Reservation[] = [];
  upcomingDepartures: Reservation[] = [];
  alerts: AppNotification[] = [];
  readonly quickActions: QuickAction[];

  roomStatusCounts: StatusCount[] = [];
  roomDonutSegments: DonutSegment[] = [];
  floors: { floor: number; rooms: RoomWithStatus[]; segments: { pct: number; color: string }[]; caption: string }[] = [];

  agendaItems: AgendaItem[] = [];
  tabs: AgendaTab[] = ['Todos', 'Llegada', 'Salida', 'Limpieza', 'Mantenimiento'];
  activeTab: AgendaTab = 'Todos';

  private currencyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  private subs: Subscription[] = [];

  constructor(
    private reservationService: ReservationService,
    private roomService: RoomService,
    private invoiceService: InvoiceService,
    private notificationService: NotificationService,
    users: UsersService,
  ) {
    this.quickActions = QUICK_ACTIONS.filter(q => users.can(q.module));

    this.subs.push(this.reservationService.getAll().subscribe(list => {
      this.reservations = list;
      this.computeReservationDerived();
      this.computeAgenda();
    }));

    this.subs.push(this.roomService.getAll().subscribe(list => {
      this.rooms = list;
      this.occupiedRooms = list.filter(r => r.status === 'Ocupada').length;
      this.occupancyPct = list.length ? Math.round((this.occupiedRooms / list.length) * 100) : 0;
      this.computeRoomDerived();
      this.computeAgenda();
    }));

    this.subs.push(this.notificationService.getAll().subscribe(list => this.alerts = list));

    // Las facturas llegan del servidor después de abrir la página: se recalcula al cargar
    this.subs.push(this.invoiceService.getAll().subscribe(() => {
      this.invoiceStats = this.invoiceService.getStats();
      this.recentIncome = this.invoiceService.getIncomeByDate().slice(-10);
    }));
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  formatMoney(value: number): string {
    return this.currencyFmt.format(value);
  }

  chartHeight(amount: number): number {
    const max = Math.max(...this.recentIncome.map(d => d.amount), 1);
    return Math.max(4, (amount / max) * 100);
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'Confirmada':    return 'dh-badge--confirmed';
      case 'Pendiente':     return 'dh-badge--waiting';
      case 'Finalizada':    return 'dh-badge--finished';
      case 'Cancelada':
      case 'No presentada': return 'dh-badge--cancelled';
      default:              return 'dh-badge--pending';
    }
  }

  countOf(tab: AgendaTab): number {
    return tab === 'Todos' ? this.agendaItems.length : this.agendaItems.filter(a => a.type === tab).length;
  }

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
    // Salidas: huéspedes alojados, las más próximas primero
    const inHouse = this.reservations.filter(isInHouse).sort((a, b) => a.checkOut.localeCompare(b.checkOut));
    this.departuresCount = inHouse.length;
    this.departuresToday = inHouse.filter(r => r.checkOut <= today).length;
    this.upcomingDepartures = inHouse.slice(0, 6);

    const allUpcomingArrivals = this.reservations.filter(r => awaitsCheckIn(r) && r.checkIn >= today);
    this.arrivalsToday = allUpcomingArrivals.filter(r => r.checkIn === today).length;
    this.arrivalsConfirmed = allUpcomingArrivals.filter(r => r.status === 'Confirmada').length;
    this.arrivalsPending = allUpcomingArrivals.filter(r => r.status === 'Pendiente').length;
    this.upcomingArrivals = [...allUpcomingArrivals]
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 6);
  }

  private computeRoomDerived(): void {
    const counts: Record<string, number> = {};
    this.rooms.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
    this.roomStatusCounts = (Object.keys(ROOM_STATUS_COLORS) as RoomStatus[])
      .map(status => ({ status, count: counts[status] || 0, color: ROOM_STATUS_COLORS[status] }))
      .filter(s => s.count > 0 || s.status === 'Disponible' || s.status === 'Ocupada');

    const total = this.rooms.length || 1;
    const circumference = 2 * Math.PI * 46;
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
    const today = isoDate(0);
    this.upcomingDepartures.forEach(r => {
      const floor = r.lodgingType === 'Habitación' ? this.floorFor(r.rooms[0]) : undefined;
      items.push({
        type: 'Salida', title: r.guestName,
        detail: `${lodgingLabel(r)}${floor ? ' · Piso ' + floor : ''}`,
        date: r.checkOut, status: r.checkOut <= today ? 'Sale hoy' : 'En hospedaje', statusClass: 'dh-badge--checkout'
      });
    });
    this.rooms.filter(r => r.status === 'En limpieza').forEach(r => {
      items.push({
        type: 'Limpieza', title: `Habitación ${r.number}`, detail: `Piso ${r.floor} · ${r.type}`,
        date: '', status: 'En limpieza', statusClass: 'dh-badge--cleaning'
      });
    });
    this.rooms.filter(r => r.status === 'En mantenimiento' || r.status === 'Fuera de servicio').forEach(r => {
      items.push({
        type: 'Mantenimiento', title: `Habitación ${r.number}`, detail: `Piso ${r.floor} · ${r.type}`,
        date: '', status: r.status, statusClass: 'dh-badge--maintenance'
      });
    });

    // Lo de ahora primero (limpieza/mantenimiento), luego por fecha
    this.agendaItems = items.sort((a, b) => (a.date || '0').localeCompare(b.date || '0'));
  }

  formatShortDate(date: string): string {
    if (!date) return 'Ahora';
    if (date === isoDate(0)) return 'Hoy';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '');
  }
}
