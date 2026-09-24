import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StayService } from '../stay.service';
import { Stay, StayStatus } from '../stay.model';

type Tab = 'inhouse' | 'arrivals' | 'departures' | 'history';

@Component({
  selector: 'app-lodging-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./lodging-list.component.css'],
  template: `
  <div class="res-page">

    <!-- Breadcrumb -->
    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a>
      <span>›</span>
      <span>Alojamiento</span>
    </div>

    <!-- Header -->
    <div class="res-header">
      <div>
        <h1 class="res-title">Alojamiento</h1>
        <p class="res-subtitle">Listado de huéspedes en hospedaje</p>
      </div>
      <button class="btn-new btn-checkin" (click)="router.navigate(['/dashboard/lodging/checkin'])">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Check-In
      </button>
    </div>

    <!-- Tabs -->
    <div class="lodge-tabs">
      <button class="lodge-tab" [class.active]="tab==='inhouse'"    (click)="setTab('inhouse')">
        En hospedaje <span class="tab-count">{{ inhouse.length }}</span>
      </button>
      <button class="lodge-tab" [class.active]="tab==='arrivals'"   (click)="setTab('arrivals')">
        Llegadas Hoy <span class="tab-count">{{ arrivals.length }}</span>
      </button>
      <button class="lodge-tab" [class.active]="tab==='departures'" (click)="setTab('departures')">
        Salidas Hoy <span class="tab-count">{{ departures.length }}</span>
      </button>
      <button class="lodge-tab" [class.active]="tab==='history'"    (click)="setTab('history')">
        Historial
      </button>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar huésped o reserva..." class="res-search">
      </div>
      <button class="btn-filter">
        <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filtros
      </button>
    </div>

    <!-- Panel lateral llegadas (solo en dashboard) -->
    <div class="lodge-arrivals-panel" *ngIf="tab==='inhouse' && arrivals.length">
      <h3 class="panel-title">Llegadas de Hoy</h3>
      <div class="arrival-card" *ngFor="let a of arrivals">
        <div class="arrival-info">
          <span class="arrival-name">{{ a.guestName }}</span>
          <span class="arrival-room">Hab. {{ a.roomNumber }}</span>
          <span class="arrival-date">{{ a.checkInDate | date:'dd/MM/yyyy' }}</span>
        </div>
        <button class="btn-checkin-sm" (click)="goCheckin(a.id)">Check-In</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Habitación</th>
            <th>Huésped</th>
            <th>Reserva</th>
            <th>Entrada</th>
            <th>Salida Estimada</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let s of filtered">
            <td><strong>{{ s.roomNumber }}</strong></td>
            <td>{{ s.guestName }}</td>
            <td class="res-code">{{ s.reservationCode }}</td>
            <td>{{ s.checkInDate | date:'dd/MM/yyyy' }}</td>
            <td>{{ s.estimatedCheckOut | date:'dd/MM/yyyy' }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(s.status)">{{ s.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle"  (click)="goDetail(s.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Check-In"     (click)="goCheckin(s.id)"  *ngIf="s.status==='Check-In'">✓</button>
                <button class="action-btn action-btn--checkout" title="Check-Out"  (click)="goCheckout(s.id)" *ngIf="s.status==='En hospedaje' || s.status==='Por salir'">↗</button>
                <button class="action-btn action-btn--print"  title="Factura"      *ngIf="s.status==='Finalizado'">🖨</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="filtered.length === 0">
            <td colspan="7" class="res-empty">No hay registros en esta categoría.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Info paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando 1-{{ filtered.length }} de {{ filtered.length }} registros</span>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--inhouse">En hospedaje</span>
      <span class="legend-text">Huésped actualmente alojado.</span>
      <span class="res-badge res-badge--leaving">Por salir</span>
      <span class="legend-text">Salida programada para hoy.</span>
      <span class="res-badge res-badge--checkin">Check-In</span>
      <span class="legend-text">Entrada registrada.</span>
      <span class="res-badge res-badge--checkout">Check-Out</span>
      <span class="legend-text">Salida registrada.</span>
    </div>

  </div>
  `
})
export class LodgingListComponent implements OnInit {

  all:        Stay[] = [];
  inhouse:    Stay[] = [];
  arrivals:   Stay[] = [];
  departures: Stay[] = [];
  history:    Stay[] = [];
  filtered:   Stay[] = [];

  tab:    Tab = 'inhouse';
  search = '';

  constructor(public router: Router, private svc: StayService) {}

  ngOnInit(): void {
    this.svc.getAll().subscribe(data => {
      this.all        = data;
      this.inhouse    = data.filter(s => s.status === 'En hospedaje');
      this.arrivals   = data.filter(s => s.status === 'Check-In');
      this.departures = data.filter(s => s.status === 'Por salir' || s.status === 'Check-Out');
      this.history    = data.filter(s => s.status === 'Finalizado');
      this.applyFilters();
    });
  }

  setTab(t: Tab): void { this.tab = t; this.applyFilters(); }

  applyFilters(): void {
    const src = this.tab === 'inhouse'    ? this.inhouse
              : this.tab === 'arrivals'   ? this.arrivals
              : this.tab === 'departures' ? this.departures
              : this.history;
    const q = this.search.toLowerCase();
    this.filtered = q
      ? src.filter(s => s.guestName.toLowerCase().includes(q) || s.reservationCode.toLowerCase().includes(q) || s.roomNumber.includes(q))
      : src;
  }

  badgeClass(status: StayStatus): string {
    return {
      'En hospedaje': 'res-badge--inhouse',
      'Por salir':    'res-badge--leaving',
      'Check-In':     'res-badge--checkin',
      'Check-Out':    'res-badge--checkout',
      'Finalizado':   'res-badge--done',
    }[status] ?? '';
  }

  goDetail(id: string):   void { this.router.navigate(['/dashboard/lodging', id]); }
  goCheckin(id: string):  void { this.router.navigate(['/dashboard/lodging', id, 'checkin']); }
  goCheckout(id: string): void { this.router.navigate(['/dashboard/lodging', id, 'checkout']); }
}
