import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { RoomService } from '../room.service';
import { RoomStatus, RoomWithStatus, ManualRoomStatus, RoomGroupSummary, summarizeRooms } from '../room.model';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, isInHouse, awaitsCheckIn, totalGuests } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';

type Tab = 'En hospedaje' | 'Llegadas hoy' | 'Salidas hoy' | 'Todas';
type UnitKind = 'Habitación' | 'Casa completa';
type Bathroom = 'Privado' | 'Compartido' | 'Mixto';
// Qué pasa hoy con la unidad: sale de su reserva actual o próxima; sin reserva, del estado de la habitación
type StayState = 'En hospedaje' | 'Salida hoy' | 'Llegada hoy' | 'Reservada' | RoomStatus;

interface UnitRow {
  key: string;
  kind: UnitKind;
  name: string;
  roomNumber?: string;         // solo habitaciones (la casa completa no tiene estado manual propio)
  floorLabel: string;
  floor?: number;
  typeLabel: string;
  capacity: number;
  beds: string[];
  bathroom: Bathroom;
  sharesBathWith?: string;
  pricePerNight: number;
  description: string;
  services: string[];
  photos: string[];
  roomStatus: RoomStatus;
  manual: boolean;
  reservation?: Reservation;
  state: StayState;
}

const STATE_BADGE: Record<string, string> = {
  'En hospedaje': 'rsv-badge--info', 'Salida hoy': 'rsv-badge--partial', 'Llegada hoy': 'rsv-badge--ok',
  'Reservada': 'rsv-badge--warn', 'Disponible': 'rsv-badge--ok', 'Ocupada': 'rsv-badge--info',
  'En limpieza': 'lod-badge--cleaning', 'En mantenimiento': 'lod-badge--maintenance', 'Fuera de servicio': 'rsv-badge--danger',
};

const ROOM_TONE: Record<RoomStatus, string> = {
  'Disponible': 'green', 'Ocupada': 'blue', 'Reservada': 'amber',
  'En limpieza': 'cyan', 'En mantenimiento': 'orange', 'Fuera de servicio': 'red',
};

const FILTERS_EMPTY = { search: '', floor: '', kind: '', state: '', bathroom: '', minCapacity: 0 };

@Component({
  selector: 'app-lodging-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./lodging-list.component.css'],
  template: `
  <nav class="lod-breadcrumb" aria-label="Ruta">
    <a routerLink="/dashboard">Dashboard</a><span aria-hidden="true">›</span><span>Alojamiento</span>
  </nav>

  <header class="lod-header">
    <span class="lod-header-icon">
      <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M2 20v-2M22 20v-2"/></svg>
    </span>
    <div>
      <h1 class="lod-title">Alojamiento</h1>
      <p class="lod-subtitle">Gestiona el estado de las habitaciones y el control de huéspedes en el hospedaje.</p>
    </div>
  </header>

  <!-- Indicadores -->
  <section class="lod-kpis">
    <div class="lod-kpi">
      <span class="lod-kpi-icon lod-kpi-icon--blue">
        <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
      </span>
      <div><span class="lod-kpi-label">Habitaciones totales</span><strong>{{ rooms.length }}</strong><small>en {{ floors.length }} pisos · también como casa completa</small></div>
    </div>
    <div class="lod-kpi">
      <span class="lod-kpi-icon lod-kpi-icon--green">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </span>
      <div><span class="lod-kpi-label">Ocupación actual</span><strong>{{ occupancyPct }}%</strong><small>{{ occupiedCount }} de {{ rooms.length }} habitaciones</small></div>
    </div>
    <div class="lod-kpi">
      <span class="lod-kpi-icon lod-kpi-icon--sky">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </span>
      <div><span class="lod-kpi-label">Huéspedes alojados</span><strong>{{ guestsInHouse }}</strong><small>de {{ totalCapacity }} capacidad total</small></div>
    </div>
    <div class="lod-kpi">
      <span class="lod-kpi-icon lod-kpi-icon--purple">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>
      </span>
      <div><span class="lod-kpi-label">Check-In hoy</span><strong>{{ checkInsDone }}</strong><small>de {{ checkInsDue }} reservas</small></div>
    </div>
    <div class="lod-kpi">
      <span class="lod-kpi-icon lod-kpi-icon--amber">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
      </span>
      <div><span class="lod-kpi-label">Check-Out hoy</span><strong>{{ checkOutsDone }}</strong><small>de {{ checkOutsDue }} reservas</small></div>
    </div>
  </section>

  <!-- Tabs + acción principal -->
  <div class="lod-toolbar">
    <nav class="lod-tabs" aria-label="Filtrar unidades">
      <button type="button" *ngFor="let t of tabs" class="lod-tab" [class.active]="tab === t" (click)="setTab(t)">
        {{ t }} <span class="lod-tab-count">{{ tabCounts[t] }}</span>
      </button>
    </nav>
    <a routerLink="/dashboard/reservations/new" class="rsv-btn rsv-btn--primary lod-new">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nueva reserva
    </a>
  </div>

  <!-- Filtros -->
  <div class="lod-filters">
    <div class="lod-search">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" [(ngModel)]="f.search" (ngModelChange)="apply()" placeholder="Buscar por habitación, huésped o reserva...">
    </div>

    <label class="lod-select">
      <span class="lod-select-label">Piso</span>
      <select [(ngModel)]="f.floor" (ngModelChange)="apply()">
        <option value="">Todos</option>
        <option *ngFor="let fl of floors" [value]="fl">Piso {{ fl }}</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>

    <label class="lod-select">
      <span class="lod-select-label">Tipo de alojamiento</span>
      <select [(ngModel)]="f.kind" (ngModelChange)="apply()">
        <option value="">Todos</option>
        <option value="Habitación">Habitación</option>
        <option value="Casa completa">Casa completa</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>

    <label class="lod-select">
      <span class="lod-select-label">Estado</span>
      <select [(ngModel)]="f.state" (ngModelChange)="apply()">
        <option value="">Todos</option>
        <option *ngFor="let s of stateOptions" [value]="s">{{ s }}</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>

    <div class="lod-more" data-popover>
      <button type="button" class="lod-more-btn" (click)="moreOpen = !moreOpen" [attr.aria-expanded]="moreOpen">
        <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filtros
        <span class="lod-more-count" *ngIf="extraFilters">{{ extraFilters }}</span>
      </button>
      <div class="lod-popover lod-more-menu" *ngIf="moreOpen">
        <label>Tipo de baño
          <select class="rsv-input" [(ngModel)]="f.bathroom" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option>Privado</option><option>Compartido</option><option>Mixto</option>
          </select>
        </label>
        <label>Capacidad mínima
          <input type="number" min="0" class="rsv-input" [(ngModel)]="f.minCapacity" (ngModelChange)="apply()">
        </label>
        <button type="button" class="lod-more-clear" (click)="clearFilters()">Limpiar todos los filtros</button>
      </div>
    </div>
  </div>

  <!-- Tabla -->
  <div class="lod-table-wrap">
    <table class="lod-table">
      <thead>
        <tr>
          <th>Habitación</th><th>Piso</th><th>Tipo</th><th>Capacidad</th><th>Camas</th><th>Baño</th>
          <th>Estado</th><th>Huéspedes</th><th>Reserva</th><th>Entrada</th><th>Salida</th><th class="lod-col-actions">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let u of filtered">
          <td>
            <button type="button" class="lod-unit" (click)="open(u)" [attr.aria-label]="'Ver ficha de ' + u.name">
              <img [src]="u.photos[0]" [alt]="'Foto de ' + u.name" class="lod-thumb" loading="lazy">
              <div>
                <strong>{{ u.name }}</strong>
                <span class="lod-room-status" [ngClass]="'lod-tone--' + tone(u.roomStatus)">{{ u.roomStatus }}</span>
              </div>
            </button>
          </td>
          <td>{{ u.floorLabel }}</td>
          <td>{{ u.kind }}<small class="lod-sub" *ngIf="u.kind === 'Habitación'">{{ u.typeLabel }}</small></td>
          <td>{{ u.capacity }}</td>
          <td>
            <span class="lod-bed" *ngFor="let b of u.beds">
              <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
              {{ b }}
            </span>
          </td>
          <td>
            <span class="lod-bath" [ngClass]="'lod-bath--' + u.bathroom.toLowerCase()">
              <svg viewBox="0 0 24 24"><path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M6 12V5a2 2 0 0 1 4 0"/><path d="M8 20l-1 2M16 20l1 2"/></svg>
              {{ u.bathroom }}
            </span>
            <small class="lod-sub lod-sub--bath" *ngIf="u.sharesBathWith">con la {{ u.sharesBathWith }}</small>
          </td>
          <td><span class="rsv-badge" [ngClass]="badge(u.state)">{{ u.state }}</span></td>
          <td>
            <span class="lod-guests" *ngIf="u.reservation; else dash">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              {{ guests(u.reservation) }}
            </span>
          </td>
          <td>
            <a *ngIf="u.reservation; else dash" class="lod-code" [routerLink]="['/dashboard/reservations', u.reservation.id]">{{ u.reservation.code }}</a>
          </td>
          <td class="lod-nowrap">{{ u.reservation ? date(u.reservation.checkIn) : '—' }}</td>
          <td class="lod-nowrap">{{ u.reservation ? date(u.reservation.checkOut) : '—' }}</td>
          <td class="lod-col-actions">
            <div class="lod-actions">
              <a class="lod-icon-btn lod-icon-btn--view" [class.disabled]="!u.reservation"
                 [routerLink]="u.reservation ? ['/dashboard/reservations', u.reservation.id] : null"
                 [title]="u.reservation ? 'Ver reserva' : 'Sin reserva asociada'" aria-label="Ver reserva">
                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </a>
              <button type="button" class="lod-icon-btn" data-popover (click)="openMenu(u, $event)" aria-label="Más acciones">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
              </button>
            </div>
          </td>
        </tr>
        <tr *ngIf="!filtered.length">
          <td colspan="12" class="lod-empty">No hay unidades que coincidan con los filtros.</td>
        </tr>
      </tbody>
    </table>
  </div>
  <ng-template #dash><span class="lod-muted">—</span></ng-template>

  <!-- Distribución: pisos y casa completa -->
  <section class="lod-groups">
    <h2 class="lod-section-title">Distribución del hospedaje</h2>
    <div class="lod-groups-grid">
      <article class="lod-group" *ngFor="let g of groups" [class.lod-group--house]="g.house">
        <header>
          <div>
            <h3>{{ g.title }}</h3>
            <span class="lod-group-cap">Hasta {{ g.s.capacity }} personas</span>
          </div>
          <span class="lod-group-price">Desde <strong>{{ money(g.s.pricePerNight) }}</strong> / noche</span>
        </header>
        <p>{{ g.text }}</p>
        <div class="lod-group-photos" [class.lod-group-photos--house]="g.house">
          <button type="button" *ngFor="let u of g.units" (click)="open(u)" [attr.aria-label]="'Ver ficha de ' + u.name">
            <img [src]="u.photos[0]" alt="" loading="lazy">
            <span>{{ g.house ? 'Ver las ' + u.photos.length + ' habitaciones' : 'Hab. ' + u.name }}</span>
          </button>
        </div>
        <dl class="lod-group-stats">
          <div><dt>Habitaciones</dt><dd>{{ g.s.rooms }}</dd></div>
          <div><dt>Personas</dt><dd>{{ g.s.capacity }}</dd></div>
          <div><dt>Camas dobles</dt><dd>{{ g.s.doubleBeds }}</dd></div>
          <div><dt>Camarotes</dt><dd>{{ g.s.bunkBeds }}</dd></div>
        </dl>
      </article>
    </div>
  </section>

  <!-- Leyenda -->
  <footer class="lod-legend">
    <div class="lod-legend-card">
      <h3>Estados de habitación</h3>
      <div class="lod-legend-items">
        <span *ngFor="let s of roomStatuses"><i class="lod-dot" [ngClass]="'lod-dot--' + tone(s)"></i>{{ s }}</span>
      </div>
    </div>
    <div class="lod-legend-card">
      <h3>Tipos de baño</h3>
      <div class="lod-legend-items">
        <span *ngFor="let b of bathrooms" class="lod-bath lod-bath--plain" [ngClass]="'lod-bath--' + b.toLowerCase()">
          <svg viewBox="0 0 24 24"><path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M6 12V5a2 2 0 0 1 4 0"/><path d="M8 20l-1 2M16 20l1 2"/></svg>
          {{ b }}
        </span>
      </div>
    </div>
    <p class="lod-legend-note">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      La disponibilidad de habitaciones se actualiza automáticamente según las reservas y el estado de la estadía.
    </p>
  </footer>

  <!-- Menú de acciones (posición fija para que la tabla con scroll no lo recorte) -->
  <div class="lod-popover lod-row-menu" data-popover *ngIf="menu" [style.top.px]="menu.top" [style.left.px]="menu.left">
    <button type="button" (click)="open(menu.u)">Ver ficha</button>
    <ng-container *ngIf="menu.u.reservation as r">
      <a *ngIf="canCheckIn(r)" [routerLink]="['/dashboard/lodging', r.id, 'checkin']">Registrar check-in</a>
      <a *ngIf="inHouse(r)" [routerLink]="['/dashboard/lodging', r.id, 'checkout']">Registrar check-out</a>
      <a [routerLink]="['/dashboard/reservations', r.id]">Ver reserva</a>
    </ng-container>
    <a routerLink="/dashboard/reservations/new" [queryParams]="menu.u.roomNumber ? { habitacion: menu.u.roomNumber } : { casa: 1 }">Nueva reserva aquí</a>
    <ng-container *ngIf="menu.u.roomNumber">
      <hr>
      <button type="button" *ngFor="let s of manualStatuses" [disabled]="menu.u.roomStatus === s || menu.u.roomStatus === 'Ocupada'"
              (click)="setManual(menu.u, s)">Marcar {{ s.toLowerCase() }}</button>
      <button type="button" *ngIf="menu.u.manual" (click)="setManual(menu.u, null)">Marcar disponible</button>
    </ng-container>
  </div>

  <!-- Ficha de la habitación / casa completa -->
  <div class="lod-drawer-overlay" *ngIf="selected as u" (click)="selected = undefined">
    <aside class="lod-drawer" role="dialog" aria-modal="true" [attr.aria-label]="'Ficha de ' + u.name" (click)="$event.stopPropagation()">
      <button type="button" class="lod-drawer-close" (click)="selected = undefined" aria-label="Cerrar">
        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="lod-gallery">
        <img [src]="u.photos[photoIndex]" [alt]="'Foto ' + (photoIndex + 1) + ' de ' + u.name" class="lod-drawer-img">
        <ng-container *ngIf="u.photos.length > 1">
          <button type="button" class="lod-gallery-nav lod-gallery-nav--prev" (click)="step(-1)" aria-label="Foto anterior">
            <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button type="button" class="lod-gallery-nav lod-gallery-nav--next" (click)="step(1)" aria-label="Foto siguiente">
            <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span class="lod-gallery-count">{{ photoIndex + 1 }} / {{ u.photos.length }}</span>
        </ng-container>
      </div>
      <div class="lod-gallery-thumbs" *ngIf="u.photos.length > 1">
        <button type="button" *ngFor="let p of u.photos; let i = index" [class.active]="i === photoIndex"
                (click)="photoIndex = i" [attr.aria-label]="'Ver foto ' + (i + 1)">
          <img [src]="p" alt="" loading="lazy">
        </button>
      </div>
      <div class="lod-drawer-body">
        <div class="lod-drawer-head">
          <div>
            <h2>{{ u.kind === 'Habitación' ? 'Habitación ' + u.name : u.name }}</h2>
            <span class="lod-room-status" [ngClass]="'lod-tone--' + tone(u.roomStatus)">{{ u.roomStatus }}</span>
          </div>
          <div class="lod-drawer-price">
            <span>Desde</span>
            <strong>{{ money(u.pricePerNight) }}</strong>
            <span>/ noche</span>
          </div>
        </div>
        <p class="lod-drawer-desc">{{ u.description }}</p>

        <dl class="lod-drawer-facts">
          <div><dt>Capacidad</dt><dd>{{ u.capacity }} personas</dd></div>
          <div><dt>{{ u.beds.length > 1 ? 'Camas' : 'Cama' }}</dt><dd>{{ u.beds.join(' · ') }}</dd></div>
          <div><dt>Baño</dt><dd>{{ u.sharesBathWith ? 'Compartido con la habitación ' + u.sharesBathWith : (u.bathroom === 'Mixto' ? 'Privados y compartidos' : u.bathroom) }}</dd></div>
          <div><dt>Piso</dt><dd>{{ u.floorLabel }}</dd></div>
          <div><dt>Precio</dt><dd>{{ money(u.pricePerNight) }} / noche{{ u.kind === 'Casa completa' ? ' (suma de las habitaciones)' : '' }}</dd></div>
        </dl>

        <h3 class="lod-drawer-subtitle">Servicios incluidos</h3>
        <ul class="lod-services">
          <li *ngFor="let s of u.services">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>{{ s }}
          </li>
        </ul>

        <h3 class="lod-drawer-subtitle">{{ u.reservation && inHouse(u.reservation) ? 'Estadía actual' : 'Próxima reserva' }}</h3>
        <a *ngIf="u.reservation as r; else noNext" class="lod-drawer-res" [routerLink]="['/dashboard/reservations', r.id]">
          <strong>{{ r.guestName }}</strong>
          <span>{{ r.code }} · {{ date(r.checkIn) }} - {{ date(r.checkOut) }} · {{ guests(r) }} huéspedes</span>
        </a>
        <ng-template #noNext><p class="lod-muted lod-drawer-empty">Sin reservas próximas.</p></ng-template>

        <a class="rsv-btn rsv-btn--primary lod-drawer-cta" routerLink="/dashboard/reservations/new"
           [queryParams]="u.roomNumber ? { habitacion: u.roomNumber } : { casa: 1 }">Nueva reserva aquí</a>
      </div>
    </aside>
  </div>
  `
})
export class LodgingListComponent {

  readonly tabs: Tab[] = ['En hospedaje', 'Llegadas hoy', 'Salidas hoy', 'Todas'];
  readonly stateOptions: StayState[] = ['En hospedaje', 'Llegada hoy', 'Salida hoy', 'Reservada', 'Disponible', 'En limpieza', 'En mantenimiento', 'Fuera de servicio'];
  readonly roomStatuses: RoomStatus[] = ['Disponible', 'Ocupada', 'Reservada', 'En limpieza', 'En mantenimiento', 'Fuera de servicio'];
  readonly manualStatuses: ManualRoomStatus[] = ['En limpieza', 'En mantenimiento', 'Fuera de servicio'];
  readonly bathrooms: Bathroom[] = ['Privado', 'Compartido', 'Mixto'];

  readonly date = fmtDate;
  readonly guests = totalGuests;
  readonly inHouse = isInHouse;
  readonly money = fmtMoney;

  rooms: RoomWithStatus[] = [];
  reservations: Reservation[] = [];
  floors: number[] = [];

  rows: UnitRow[] = [];
  groups: { title: string; text: string; house: boolean; s: RoomGroupSummary; units: UnitRow[] }[] = [];
  selected?: UnitRow;
  photoIndex = 0;
  filtered: UnitRow[] = [];
  tab: Tab = 'En hospedaje';
  tabCounts = {} as Record<Tab, number>;
  f = { ...FILTERS_EMPTY };

  moreOpen = false;
  menu?: { u: UnitRow; top: number; left: number };

  today = isoDate(0);
  occupiedCount = 0;
  occupancyPct = 0;
  totalCapacity = 0;
  guestsInHouse = 0;
  checkInsDone = 0;
  checkInsDue = 0;
  checkOutsDone = 0;
  checkOutsDue = 0;

  constructor(private roomSvc: RoomService, reservationSvc: ReservationService, private host: ElementRef<HTMLElement>) {
    combineLatest([this.roomSvc.getAll(), reservationSvc.getAll()]).subscribe(([rooms, reservations]) => {
      this.rooms = rooms;
      this.reservations = reservations;
      this.floors = [...new Set(rooms.map(r => r.floor))].sort();
      this.buildRows();
      this.computeKpis();
      this.apply();
    });
  }

  // ── Popovers ──
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-popover]') || !this.host.nativeElement.contains(target)) {
      this.moreOpen = false;
      this.menu = undefined;
    }
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void { this.selected = undefined; }

  @HostListener('document:keydown.arrowleft')
  prevPhoto(): void { if (this.selected) this.step(-1); }

  @HostListener('document:keydown.arrowright')
  nextPhoto(): void { if (this.selected) this.step(1); }

  open(u: UnitRow): void {
    this.selected = u;
    this.photoIndex = 0;
    this.menu = undefined;
  }

  step(delta: number): void {
    const n = this.selected?.photos.length ?? 0;
    if (n) this.photoIndex = (this.photoIndex + delta + n) % n;
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('window:wheel')
  closeMenu(): void { this.menu = undefined; }

  openMenu(u: UnitRow, e: MouseEvent): void {
    if (this.menu?.u.key === u.key) { this.menu = undefined; return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuHeight = 290;
    const top = rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight) : rect.bottom + 6;
    this.menu = { u, top, left: Math.max(8, rect.right - 220) };
  }

  // ── Filas ──
  /** Reserva que define la fila: la alojada ahora o, si no hay, la próxima por llegar. */
  private currentFor(match: (r: Reservation) => boolean): Reservation | undefined {
    const candidates = this.reservations.filter(match);
    return candidates.find(isInHouse)
      ?? candidates.filter(r => awaitsCheckIn(r) && r.checkOut >= this.today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  }

  private stateFor(r: Reservation | undefined, roomStatus: RoomStatus): StayState {
    if (!r) return roomStatus;
    if (isInHouse(r)) return r.checkOut <= this.today ? 'Salida hoy' : 'En hospedaje';
    return r.checkIn <= this.today ? 'Llegada hoy' : 'Reservada';
  }

  private buildRows(): void {
    const roomRows: UnitRow[] = this.rooms.map(room => {
      const reservation = this.currentFor(r => r.rooms.includes(room.number));
      const manual = this.manualStatuses.includes(room.status as ManualRoomStatus);
      // En mantenimiento / fuera de servicio pesa más que una reserva futura (no que un huésped ya alojado)
      const blocked = (room.status === 'En mantenimiento' || room.status === 'Fuera de servicio')
        && !(reservation && isInHouse(reservation));
      return {
        key: room.id, kind: 'Habitación', name: room.number, roomNumber: room.number,
        floorLabel: String(room.floor), floor: room.floor, typeLabel: room.type,
        capacity: room.capacity, beds: room.beds, bathroom: room.bathroom, sharesBathWith: room.sharesBathWith,
        pricePerNight: room.pricePerNight, description: room.description, services: room.services, photos: room.photos,
        roomStatus: room.status, manual, reservation,
        state: blocked ? room.status : this.stateFor(reservation, room.status),
      };
    });

    // Casa completa: está disponible solo si todas sus habitaciones lo están
    const houseReservation = this.currentFor(r => r.lodgingType === 'Casa completa');
    const houseStatus: RoomStatus =
      this.rooms.some(r => r.status === 'Ocupada') ? 'Ocupada'
      : this.rooms.some(r => r.status === 'Reservada') ? 'Reservada'
      : this.rooms.find(r => r.status !== 'Disponible')?.status ?? 'Disponible';
    const bedTotals = new Map<string, number>();
    this.rooms.flatMap(r => r.beds).forEach(b => {
      const [n, ...rest] = b.split(' ');
      const kind = rest.join(' ');
      bedTotals.set(kind, (bedTotals.get(kind) ?? 0) + Number(n));
    });
    const baths = new Set(this.rooms.map(r => r.bathroom));
    const house = summarizeRooms(this.rooms);
    const houseText = 'Reserva ambos pisos y disfruta de toda la casa. Ideal para grupos grandes, eventos familiares o retiros.';

    this.rows = [...roomRows, {
      key: 'house', kind: 'Casa completa', name: 'Casa completa',
      floorLabel: this.floors.join(' + '), typeLabel: 'Casa completa',
      capacity: house.capacity,
      beds: [...bedTotals].map(([kind, n]) => `${n} ${n === 1 ? kind : this.plural(kind)}`),
      bathroom: baths.size > 1 ? 'Mixto' : [...baths][0] ?? 'Privado',
      pricePerNight: house.pricePerNight, description: houseText,
      services: [...new Set(this.rooms.flatMap(r => r.services))],
      photos: this.rooms.map(r => r.photos[0]),
      roomStatus: houseStatus, manual: false, reservation: houseReservation,
      state: houseReservation ? this.stateFor(houseReservation, houseStatus) : houseStatus,
    }];

    // Resumen por piso + casa completa (se calcula del catálogo, no se escribe a mano)
    this.groups = [
      ...this.floors.map(floor => {
        const numbers = this.rooms.filter(r => r.floor === floor).map(r => r.number);
        const list = numbers.length > 1 ? `${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}` : numbers[0];
        const s = summarizeRooms(this.rooms.filter(r => r.floor === floor));
        return {
          title: `Piso ${floor}`, house: false, s, units: roomRows.filter(u => u.floor === floor),
          text: `En el piso ${floor} se encuentran ${s.rooms} habitaciones: ${list}. Tiene capacidad para ${s.capacity} personas, `
            + `${s.doubleBeds} camas dobles y ${s.bunkBeds} ${s.bunkBeds === 1 ? 'camarote' : 'camarotes'}.`,
        };
      }),
      { title: 'Casa completa', house: true, s: house, text: houseText, units: this.rows.filter(u => u.kind === 'Casa completa') },
    ];
  }

  private plural(kind: string): string {
    const plurals: Record<string, string> = { 'cama doble': 'camas dobles', 'cama sencilla': 'camas sencillas', 'camarote': 'camarotes' };
    return plurals[kind] ?? `${kind}s`;
  }

  private inTab(u: UnitRow, t: Tab): boolean {
    switch (t) {
      case 'En hospedaje': return !!u.reservation && isInHouse(u.reservation);
      case 'Llegadas hoy': return u.state === 'Llegada hoy';
      case 'Salidas hoy':  return u.state === 'Salida hoy';
      case 'Todas':        return true;
    }
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.apply();
  }

  get extraFilters(): number {
    return (this.f.bathroom ? 1 : 0) + (+this.f.minCapacity > 0 ? 1 : 0);
  }

  apply(): void {
    const q = this.f.search.trim().toLowerCase();
    const base = this.rows.filter(u =>
      (!q || [u.name, u.reservation?.guestName ?? '', u.reservation?.code ?? ''].some(v => v.toLowerCase().includes(q))) &&
      (!this.f.floor || u.floor === +this.f.floor) &&
      (!this.f.kind || u.kind === this.f.kind) &&
      (!this.f.state || u.state === this.f.state) &&
      (!this.f.bathroom || u.bathroom === this.f.bathroom) &&
      (u.capacity >= (+this.f.minCapacity || 0))
    );
    this.tabs.forEach(t => this.tabCounts[t] = base.filter(u => this.inTab(u, t)).length);
    this.filtered = base.filter(u => this.inTab(u, this.tab));
  }

  clearFilters(): void {
    this.f = { ...FILTERS_EMPTY };
    this.moreOpen = false;
    this.apply();
  }

  // ── Indicadores ──
  private computeKpis(): void {
    const t = this.today;
    this.occupiedCount = this.rooms.filter(r => r.status === 'Ocupada').length;
    this.occupancyPct = this.rooms.length ? Math.round((this.occupiedCount / this.rooms.length) * 100) : 0;
    this.totalCapacity = this.rooms.reduce((s, r) => s + r.capacity, 0);
    this.guestsInHouse = this.reservations.filter(isInHouse).reduce((s, r) => s + totalGuests(r), 0);

    const arrivalsToday = this.reservations.filter(r => r.checkIn === t && (awaitsCheckIn(r) || r.checkedInAt));
    this.checkInsDue = arrivalsToday.length;
    this.checkInsDone = arrivalsToday.filter(r => r.checkedInAt).length;

    const departuresToday = this.reservations.filter(r => r.checkOut === t && r.checkedInAt);
    this.checkOutsDue = departuresToday.length;
    this.checkOutsDone = departuresToday.filter(r => r.checkedOutAt).length;
  }

  // ── Acciones ──
  canCheckIn(r: Reservation): boolean {
    return awaitsCheckIn(r) && r.checkIn <= this.today && r.checkOut >= this.today;
  }

  setManual(u: UnitRow, status: ManualRoomStatus | null): void {
    if (u.roomNumber) this.roomSvc.setManualStatus(u.roomNumber, status);
    this.menu = undefined;
  }

  tone(s: RoomStatus): string { return ROOM_TONE[s]; }
  badge(s: StayState): string { return STATE_BADGE[s]; }
}
