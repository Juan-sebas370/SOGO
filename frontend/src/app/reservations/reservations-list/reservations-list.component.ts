import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReservationService, isoDate } from '../reservation.service';
import {
  Reservation, ReservationStatus, ReservationType, LodgingType, PaymentStatus, ReservationTraStatus,
  paymentStatus, totalGuests, lodgingLabel, roomsLabel, isVoid
} from '../reservation.model';
import { fmtDate, fmtShortDate, fmtMoney, typeBadge, statusBadge, paymentBadge, traBadge } from '../reservation-format';

type Tab = 'Todas' | 'Próximas' | 'Actuales' | 'Finalizadas' | 'Canceladas' | 'Pendientes de pago';

interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  type: ReservationType | '';
  lodging: LodgingType | '';
  status: ReservationStatus | '';
  payment: PaymentStatus | '';
  tra: ReservationTraStatus | '';
}

const EMPTY_FILTERS: Filters = { search: '', dateFrom: '', dateTo: '', type: '', lodging: '', status: '', payment: '', tra: '' };
const PAGE_SIZE = 10;

@Component({
  selector: 'app-reservations-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reservations-list.component.css'],
  template: `
  <!-- Encabezado -->
  <header class="rsv-header">
    <div class="rsv-header-main">
      <span class="rsv-header-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>
      </span>
      <div>
        <span class="rsv-eyebrow">Reservas</span>
        <h1 class="rsv-title">Gestión de Reservas</h1>
        <p class="rsv-subtitle">Consulta, administra y controla todas las reservas del hospedaje.</p>
      </div>
    </div>
    <div class="rsv-header-actions">
      <a routerLink="/dashboard/reservations/new" class="rsv-btn rsv-btn--primary">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva reserva
      </a>
      <a routerLink="/dashboard/reports/generator" class="rsv-btn rsv-btn--outline">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Generar reporte
      </a>
      <div class="rsv-export" data-popover>
        <button type="button" class="rsv-btn rsv-btn--outline rsv-export-btn" (click)="toggleExport()" [attr.aria-expanded]="exportOpen">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar
          <span class="rsv-export-sep"></span>
          <svg class="rsv-export-caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="rsv-popover rsv-export-menu" *ngIf="exportOpen">
          <button type="button" (click)="exportCsv(filtered)">Reservas filtradas ({{ filtered.length }})</button>
          <button type="button" (click)="exportCsv(selectedRows)" [disabled]="!selected.size">Seleccionadas ({{ selected.size }})</button>
        </div>
      </div>
    </div>
  </header>

  <!-- Indicadores -->
  <section class="rsv-kpis">
    <button type="button" class="rsv-kpi" (click)="quickToday()">
      <span class="rsv-kpi-icon rsv-kpi-icon--green">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 15l2 2 4-4"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Reservas de hoy</span>
        <span class="rsv-kpi-value">{{ kpi.today }} <svg class="rsv-kpi-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        <span class="rsv-kpi-detail">{{ kpi.todayConfirmed }} confirmadas · {{ kpi.todayPending }} pendiente{{ kpi.todayPending === 1 ? '' : 's' }}</span>
      </span>
    </button>

    <button type="button" class="rsv-kpi" (click)="setTab('Próximas')">
      <span class="rsv-kpi-icon rsv-kpi-icon--blue">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Próximas reservas</span>
        <span class="rsv-kpi-value">{{ kpi.upcoming }}</span>
        <span class="rsv-kpi-detail">{{ kpi.upcomingRange }}</span>
      </span>
    </button>

    <button type="button" class="rsv-kpi" (click)="setTab('Próximas')">
      <span class="rsv-kpi-icon rsv-kpi-icon--purple">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Huéspedes próximos</span>
        <span class="rsv-kpi-value">{{ kpi.guests }}</span>
        <span class="rsv-kpi-detail">{{ kpi.adults }} adultos · {{ kpi.children }} niños · {{ kpi.infants }} bebés</span>
      </span>
    </button>

    <button type="button" class="rsv-kpi" (click)="setTab('Pendientes de pago')">
      <span class="rsv-kpi-icon rsv-kpi-icon--amber">
        <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Pendientes de pago</span>
        <span class="rsv-kpi-value">{{ kpi.pendingPay }}</span>
        <span class="rsv-kpi-detail">{{ money(kpi.pendingAmount) }}</span>
      </span>
    </button>

    <button type="button" class="rsv-kpi" (click)="quickStatus('Confirmada')">
      <span class="rsv-kpi-icon rsv-kpi-icon--emerald">
        <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Confirmadas</span>
        <span class="rsv-kpi-value">{{ kpi.confirmed }}</span>
        <span class="rsv-kpi-detail">{{ kpi.confirmedPct }}% del total</span>
      </span>
    </button>

    <button type="button" class="rsv-kpi" (click)="quickCheckins()">
      <span class="rsv-kpi-icon rsv-kpi-icon--sky">
        <svg viewBox="0 0 24 24"><path d="M2 20v-7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v7"/><path d="M2 17h20"/><path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/></svg>
      </span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Check-In próximos</span>
        <span class="rsv-kpi-value">{{ kpi.checkins }}</span>
        <span class="rsv-kpi-detail">desde hoy al {{ short(checkinLimit) }}</span>
      </span>
    </button>
  </section>

  <!-- Tabs + filtros + tabla -->
  <section class="rsv-panel rsv-board">
    <nav class="rsv-tabs" aria-label="Filtrar por grupo">
      <button type="button" *ngFor="let t of tabs" class="rsv-tab" [class.active]="activeTab === t" (click)="setTab(t)">
        {{ t }} <span class="rsv-tab-count">{{ tabCounts[t] }}</span>
      </button>
    </nav>

    <div class="rsv-filters">
      <div class="rsv-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="f.search" (ngModelChange)="apply()" placeholder="Buscar por código, huésped, teléfono, documento...">
      </div>

      <div class="rsv-date" data-popover>
        <button type="button" class="rsv-select rsv-select--date" (click)="dateOpen = !dateOpen; exportOpen = false" [attr.aria-expanded]="dateOpen">
          <svg class="rsv-select-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="rsv-select-text">
            <span class="rsv-select-label">Fecha</span>
            <span class="rsv-select-value">{{ dateLabel }}</span>
          </span>
          <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="rsv-popover rsv-date-menu" *ngIf="dateOpen">
          <p class="rsv-date-hint">Reservas con estadía dentro del rango</p>
          <label>Desde<input type="date" class="rsv-input" [(ngModel)]="f.dateFrom" (ngModelChange)="apply()"></label>
          <label>Hasta<input type="date" class="rsv-input" [(ngModel)]="f.dateTo" [min]="f.dateFrom" (ngModelChange)="apply()"></label>
          <button type="button" class="rsv-date-clear" (click)="f.dateFrom = ''; f.dateTo = ''; apply()">Todas las fechas</button>
        </div>
      </div>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Tipo de reserva</span>
          <select [(ngModel)]="f.type" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let o of typeOptions" [value]="o">{{ o }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Tipo de alojamiento</span>
          <select [(ngModel)]="f.lodging" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let o of lodgingOptions" [value]="o">{{ o }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Estado</span>
          <select [(ngModel)]="f.status" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let o of statusOptions" [value]="o">{{ o }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Pago</span>
          <select [(ngModel)]="f.payment" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let o of paymentOptions" [value]="o">{{ o }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">TRA</span>
          <select [(ngModel)]="f.tra" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let o of traOptions" [value]="o">{{ o }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <button type="button" class="rsv-clear" (click)="clearFilters()">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        Limpiar filtros
      </button>
    </div>

    <div class="rsv-table-wrap">
      <table class="rsv-table">
        <thead>
          <tr>
            <th class="rsv-col-check">
              <input type="checkbox" [checked]="pageAllSelected" [indeterminate]="pageSomeSelected" (change)="togglePage()" aria-label="Seleccionar página">
            </th>
            <th>Código</th>
            <th>Huésped principal</th>
            <th>Tipo de reserva</th>
            <th>Alojamiento</th>
            <th>Habitaciones</th>
            <th>Huéspedes</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Pago</th>
            <th>Estado</th>
            <th>TRA</th>
            <th class="rsv-col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of paged" [class.selected]="selected.has(r.id)">
            <td class="rsv-col-check">
              <input type="checkbox" [checked]="selected.has(r.id)" (change)="toggleRow(r.id)" [attr.aria-label]="'Seleccionar ' + r.code">
            </td>
            <td><a class="rsv-code" [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></td>
            <td>
              <span class="rsv-guest">{{ r.guestName }}</span>
              <span class="rsv-guest-phone">
                <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {{ r.phone }}
              </span>
            </td>
            <td><span class="rsv-badge" [ngClass]="typeBadge(r.reservationType)">{{ r.reservationType }}</span></td>
            <td>
              <span class="rsv-cell-icon">
                <svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>
                {{ lodging(r) }}
              </span>
            </td>
            <td>
              <span class="rsv-cell-icon">
                <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
                {{ roomsText(r) }}
              </span>
            </td>
            <td>
              <span class="rsv-cell-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                {{ guests(r) }}
              </span>
            </td>
            <td class="rsv-date-cell">{{ date(r.checkIn) }}</td>
            <td class="rsv-date-cell">{{ date(r.checkOut) }}</td>
            <td><span class="rsv-badge" [ngClass]="paymentBadge(pay(r))">{{ pay(r) }}</span></td>
            <td><span class="rsv-badge" [ngClass]="statusBadge(r.status)">{{ r.status }}</span></td>
            <td><span class="rsv-badge" [ngClass]="traBadge(r.traStatus)">{{ r.traStatus }}</span></td>
            <td class="rsv-col-actions">
              <div class="rsv-actions">
                <a class="rsv-icon-btn rsv-icon-btn--view" [routerLink]="['/dashboard/reservations', r.id]" title="Ver detalle" aria-label="Ver detalle">
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </a>
                <button type="button" class="rsv-icon-btn" data-popover (click)="openMenu(r, $event)" title="Más acciones" aria-label="Más acciones">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
                </button>
              </div>
            </td>
          </tr>
          <tr *ngIf="!paged.length">
            <td colspan="13" class="rsv-empty">No se encontraron reservas con los filtros aplicados.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="rsv-pagination">
      <span class="rsv-pag-info">Mostrando {{ paged.length }} de {{ filtered.length }} reservas</span>
      <div class="rsv-pag-btns">
        <button type="button" class="rsv-pag-btn" [disabled]="page === 1" (click)="setPage(page - 1)" aria-label="Página anterior">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button type="button" *ngFor="let p of pages" class="rsv-pag-btn" [class.active]="p === page" (click)="setPage(p)">{{ p }}</button>
        <button type="button" class="rsv-pag-btn" [disabled]="page === totalPages" (click)="setPage(page + 1)" aria-label="Página siguiente">
          <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </footer>
  </section>

  <!-- Menú de acciones por fila: posición fija para que la tabla con scroll no lo recorte -->
  <div class="rsv-popover rsv-row-menu" data-popover *ngIf="menu" [style.top.px]="menu.top" [style.left.px]="menu.left">
    <a [routerLink]="['/dashboard/reservations', menu.r.id]">Ver detalle</a>
    <a [routerLink]="['/dashboard/reservations', menu.r.id, 'edit']" *ngIf="canEdit(menu.r)">Editar</a>
    <a routerLink="/dashboard/lodging/checkin" *ngIf="canCheckIn(menu.r)">Registrar check-in</a>
    <button type="button" class="danger" *ngIf="canCancel(menu.r)" (click)="openCancel(menu.r)">Cancelar reserva</button>
  </div>

  <!-- Modal de cancelación -->
  <div class="rsv-modal-overlay" *ngIf="cancelTarget" (click)="cancelTarget = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <div class="rsv-modal-icon">
        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <h3 class="rsv-modal-title">Cancelar reserva</h3>
      <p class="rsv-modal-desc">¿Seguro que deseas cancelar la reserva <strong>{{ cancelTarget.code }}</strong> de {{ cancelTarget.guestName }}?</p>
      <div class="rsv-field">
        <label for="cancel-reason">Motivo de cancelación</label>
        <select id="cancel-reason" class="rsv-input" [(ngModel)]="cancelReason">
          <option value="">Seleccionar motivo...</option>
          <option *ngFor="let m of cancelReasons">{{ m }}</option>
        </select>
      </div>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="cancelTarget = undefined">No, volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="!cancelReason" (click)="confirmCancel()">Sí, cancelar</button>
      </div>
    </div>
  </div>
  `
})
export class ReservationsListComponent {

  readonly tabs: Tab[] = ['Todas', 'Próximas', 'Actuales', 'Finalizadas', 'Canceladas', 'Pendientes de pago'];
  readonly typeOptions: ReservationType[] = ['Individual', 'Grupo familiar', 'Grupo de trabajo', 'Evento / Pasadía'];
  readonly lodgingOptions: LodgingType[] = ['Habitación', 'Piso', 'Casa completa'];
  readonly statusOptions: ReservationStatus[] = ['Confirmada', 'Pendiente', 'Finalizada', 'Cancelada', 'No presentada'];
  readonly paymentOptions: PaymentStatus[] = ['Pagado', 'Parcial', 'Pendiente'];
  readonly traOptions: ReservationTraStatus[] = ['Completa', 'Pendiente', 'No aplica'];
  readonly cancelReasons = ['Cambio de planes del huésped', 'Solicitud del huésped', 'Error en la reserva', 'Otro'];

  // Plantilla: formateo compartido del módulo
  readonly date = fmtDate;
  readonly short = fmtShortDate;
  readonly money = fmtMoney;
  readonly typeBadge = typeBadge;
  readonly statusBadge = statusBadge;
  readonly paymentBadge = paymentBadge;
  readonly traBadge = traBadge;
  readonly pay = paymentStatus;
  readonly guests = totalGuests;
  readonly lodging = lodgingLabel;
  readonly roomsText = roomsLabel;

  all: Reservation[] = [];
  filtered: Reservation[] = [];
  paged: Reservation[] = [];

  activeTab: Tab = 'Todas';
  tabCounts = {} as Record<Tab, number>;
  f: Filters = { ...EMPTY_FILTERS };

  page = 1;
  totalPages = 1;
  pages: number[] = [];

  selected = new Set<string>();

  exportOpen = false;
  dateOpen = false;
  menu?: { r: Reservation; top: number; left: number };

  cancelTarget?: Reservation;
  cancelReason = '';

  today = isoDate(0);
  checkinLimit = isoDate(3);

  kpi = {
    today: 0, todayConfirmed: 0, todayPending: 0,
    upcoming: 0, upcomingRange: '',
    guests: 0, adults: 0, children: 0, infants: 0,
    pendingPay: 0, pendingAmount: 0,
    confirmed: 0, confirmedPct: 0,
    checkins: 0,
  };

  constructor(private svc: ReservationService, private host: ElementRef<HTMLElement>) {
    this.svc.getAll().subscribe(list => {
      this.all = [...list].sort((a, b) => b.code.localeCompare(a.code));
      this.selected.forEach(id => { if (!list.some(r => r.id === id)) this.selected.delete(id); });
      this.computeKpis();
      this.apply(false);
    });
  }

  // ── Popovers: se cierran al hacer clic fuera o al hacer scroll ──
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-popover]') || !this.host.nativeElement.contains(target)) {
      this.exportOpen = false;
      this.dateOpen = false;
      this.menu = undefined;
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('window:wheel')
  closeMenu(): void { this.menu = undefined; }

  toggleExport(): void {
    this.exportOpen = !this.exportOpen;
    this.dateOpen = false;
  }

  openMenu(r: Reservation, e: MouseEvent): void {
    if (this.menu?.r.id === r.id) { this.menu = undefined; return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 190;
    this.menu = { r, top: rect.bottom + 6, left: Math.max(8, rect.right - menuWidth) };
  }

  // ── Grupos (tabs) ──
  private inTab(r: Reservation, tab: Tab): boolean {
    const active = r.status === 'Confirmada' || r.status === 'Pendiente';
    switch (tab) {
      case 'Todas':              return true;
      case 'Próximas':           return active && r.checkIn > this.today;
      case 'Actuales':           return active && r.checkIn <= this.today && r.checkOut >= this.today;
      case 'Finalizadas':        return r.status === 'Finalizada';
      case 'Canceladas':         return isVoid(r);
      case 'Pendientes de pago': return !isVoid(r) && paymentStatus(r) !== 'Pagado';
    }
  }

  setTab(t: Tab): void {
    this.activeTab = t;
    this.apply();
  }

  // ── Filtros ──
  get dateLabel(): string {
    const { dateFrom, dateTo } = this.f;
    if (!dateFrom && !dateTo) return 'Todas las fechas';
    return `${dateFrom ? fmtDate(dateFrom) : '…'} - ${dateTo ? fmtDate(dateTo) : '…'}`;
  }

  apply(resetPage = true): void {
    const q = this.f.search.trim().toLowerCase();
    const { dateFrom, dateTo } = this.f;

    const base = this.all.filter(r =>
      (!q || [r.code, r.guestName, r.phone, r.docNumber, r.email].some(v => v.toLowerCase().includes(q))) &&
      (!dateFrom || r.checkOut >= dateFrom) &&
      (!dateTo || r.checkIn <= dateTo) &&
      (!this.f.type || r.reservationType === this.f.type) &&
      (!this.f.lodging || r.lodgingType === this.f.lodging) &&
      (!this.f.status || r.status === this.f.status) &&
      (!this.f.payment || paymentStatus(r) === this.f.payment) &&
      (!this.f.tra || r.traStatus === this.f.tra)
    );

    // Los contadores de cada tab reflejan los filtros activos
    this.tabs.forEach(t => this.tabCounts[t] = base.filter(r => this.inTab(r, t)).length);
    this.filtered = base.filter(r => this.inTab(r, this.activeTab));

    if (resetPage) this.page = 1;
    this.paginate();
  }

  clearFilters(): void {
    this.f = { ...EMPTY_FILTERS };
    this.activeTab = 'Todas';
    this.apply();
  }

  quickToday(): void {
    this.f = { ...EMPTY_FILTERS, dateFrom: this.today, dateTo: this.today };
    this.activeTab = 'Actuales';
    this.apply();
  }

  quickCheckins(): void {
    this.f = { ...EMPTY_FILTERS, dateFrom: this.today, dateTo: this.checkinLimit };
    this.activeTab = 'Todas';
    this.apply();
  }

  quickStatus(s: ReservationStatus): void {
    this.f = { ...EMPTY_FILTERS, status: s };
    this.activeTab = 'Todas';
    this.apply();
  }

  // ── Paginación ──
  private paginate(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
    this.page = Math.min(this.page, this.totalPages);
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    this.paged = this.filtered.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE);
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.paginate();
  }

  // ── Selección (alimenta "Exportar → Seleccionadas") ──
  get pageAllSelected(): boolean {
    return this.paged.length > 0 && this.paged.every(r => this.selected.has(r.id));
  }

  get pageSomeSelected(): boolean {
    return !this.pageAllSelected && this.paged.some(r => this.selected.has(r.id));
  }

  get selectedRows(): Reservation[] {
    return this.all.filter(r => this.selected.has(r.id));
  }

  toggleRow(id: string): void {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  togglePage(): void {
    const selectAll = !this.pageAllSelected;
    this.paged.forEach(r => selectAll ? this.selected.add(r.id) : this.selected.delete(r.id));
  }

  // ── Acciones ──
  canEdit(r: Reservation): boolean { return r.status === 'Confirmada' || r.status === 'Pendiente'; }
  canCancel(r: Reservation): boolean { return this.canEdit(r); }
  canCheckIn(r: Reservation): boolean {
    return this.canEdit(r) && r.checkIn <= this.checkinLimit && r.checkOut >= this.today;
  }

  openCancel(r: Reservation): void {
    this.menu = undefined;
    this.cancelTarget = r;
    this.cancelReason = '';
  }

  confirmCancel(): void {
    if (!this.cancelTarget || !this.cancelReason) return;
    this.svc.cancel(this.cancelTarget.id, this.cancelReason);
    this.cancelTarget = undefined;
  }

  exportCsv(rows: Reservation[]): void {
    this.exportOpen = false;
    if (!rows.length) return;
    const header = ['Código', 'Huésped principal', 'Documento', 'Teléfono', 'Correo', 'Tipo de reserva', 'Alojamiento',
      'Habitaciones', 'Adultos', 'Niños', 'Bebés', 'Entrada', 'Salida', 'Noches', 'Total', 'Abonado', 'Pago', 'Estado', 'TRA'];
    const lines = rows.map(r => [
      r.code, r.guestName, `${r.docType} ${r.docNumber}`, r.phone, r.email, r.reservationType, lodgingLabel(r),
      roomsLabel(r), r.adults, r.children, r.infants, fmtDate(r.checkIn), fmtDate(r.checkOut), r.nights,
      r.totalAmount, r.paidAmount, paymentStatus(r), r.status, r.traStatus
    ]);
    // Punto y coma + BOM: Excel en español lo abre en columnas y con tildes correctas
    const csv = '﻿' + [header, ...lines]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reservas-${this.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Indicadores ──
  private computeKpis(): void {
    const k = this.kpi;
    const active = this.all.filter(r => r.status === 'Confirmada' || r.status === 'Pendiente');

    const todays = active.filter(r => r.checkIn === this.today);
    k.today = todays.length;
    k.todayConfirmed = todays.filter(r => r.status === 'Confirmada').length;
    k.todayPending = todays.filter(r => r.status === 'Pendiente').length;

    const upcoming = active.filter(r => r.checkIn > this.today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    k.upcoming = upcoming.length;
    k.upcomingRange = upcoming.length
      ? `desde el ${fmtShortDate(upcoming[0].checkIn)} al ${fmtShortDate(upcoming[upcoming.length - 1].checkIn)}`
      : 'sin reservas próximas';
    k.adults = upcoming.reduce((s, r) => s + r.adults, 0);
    k.children = upcoming.reduce((s, r) => s + r.children, 0);
    k.infants = upcoming.reduce((s, r) => s + r.infants, 0);
    k.guests = k.adults + k.children + k.infants;

    const unpaid = this.all.filter(r => this.inTab(r, 'Pendientes de pago'));
    k.pendingPay = unpaid.length;
    k.pendingAmount = unpaid.reduce((s, r) => s + (r.totalAmount - r.paidAmount), 0);

    k.confirmed = this.all.filter(r => r.status === 'Confirmada').length;
    k.confirmedPct = this.all.length ? Math.round((k.confirmed / this.all.length) * 100) : 0;

    k.checkins = active.filter(r => r.checkIn >= this.today && r.checkIn <= this.checkinLimit).length;
  }
}
