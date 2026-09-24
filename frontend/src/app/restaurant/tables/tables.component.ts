import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { RestaurantTable, TableZone, TableStatus } from '../restaurant.model';

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tables.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/restaurant">Restaurante y Cafetería</a><span>›</span>
      <span>Mesas</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Plano de Mesas</h1>
      <div class="header-actions">
        <button class="btn-outline-sm" (click)="updateAll()">🔄 Actualizar Estado</button>
        <button class="btn-new" routerLink="/dashboard/restaurant/orders/new">+ Nueva Reserva</button>
      </div>
    </div>

    <!-- Tabs de zona -->
    <div class="lodge-tabs">
      <button class="lodge-tab" *ngFor="let z of zones"
        [class.active]="activeZone===z"
        (click)="setZone(z)">
        {{ z }}
        <span class="tab-count">{{ countByZone(z) }}</span>
      </button>
    </div>

    <!-- Leyenda de estados -->
    <div class="table-legend">
      <span class="legend-item"><span class="table-dot table-dot--available"></span>Disponible</span>
      <span class="legend-item"><span class="table-dot table-dot--occupied"></span>Ocupada</span>
      <span class="legend-item"><span class="table-dot table-dot--reserved"></span>Reservada</span>
      <span class="legend-item"><span class="table-dot table-dot--dirty"></span>Sin limpiar</span>
    </div>

    <!-- Grid de mesas -->
    <div class="tables-grid">
      <div
        *ngFor="let t of filteredTables"
        class="table-card"
        [ngClass]="tableCardClass(t.status)"
        (click)="openTableMenu(t)"
      >
        <span class="table-number">{{ t.number < 10 ? '0' + t.number : t.number }}</span>
        <span class="table-capacity">{{ t.capacity }} pers.</span>
        <span class="table-total" *ngIf="t.total">$ {{ t.total | number }}</span>
        <span class="table-status-label">{{ t.status }}</span>
      </div>
    </div>

    <!-- Modal cambio de estado -->
    <div class="modal-overlay" *ngIf="selectedTable" (click)="closeMenu()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title">Mesa {{ selectedTable.number }}</h3>
        <p class="modal-desc">Estado actual: <span class="res-badge" [ngClass]="tableCardClass(selectedTable.status)">{{ selectedTable.status }}</span></p>
        <div class="modal-field">
          <label>Cambiar estado</label>
          <select [(ngModel)]="newStatus" class="res-select" style="width:100%">
            <option value="Disponible">Disponible</option>
            <option value="Ocupada">Ocupada</option>
            <option value="Reservada">Reservada</option>
            <option value="Sin limpiar">Sin limpiar</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" (click)="closeMenu()">Cancelar</button>
          <button class="btn-primary"   (click)="applyStatus()">Aplicar</button>
        </div>
      </div>
    </div>

  </div>
  `
})
export class TablesComponent implements OnInit {
  zones: TableZone[] = ['Salón Principal','Terraza','Bar','VIP'];
  activeZone: TableZone = 'Salón Principal';
  allTables: RestaurantTable[] = [];
  filteredTables: RestaurantTable[] = [];
  selectedTable?: RestaurantTable;
  newStatus: TableStatus = 'Disponible';

  constructor(private svc: RestaurantService, private router: Router) {}

  ngOnInit(): void {
    this.svc.getTables().subscribe(t => { this.allTables = t; this.filterByZone(); });
  }

  setZone(z: TableZone): void { this.activeZone = z; this.filterByZone(); }

  filterByZone(): void { this.filteredTables = this.allTables.filter(t => t.zone === this.activeZone); }

  countByZone(z: TableZone): number { return this.allTables.filter(t => t.zone === z).length; }

  tableCardClass(s: TableStatus): string {
    return { 'Disponible':'table-card--available','Ocupada':'table-card--occupied','Reservada':'table-card--reserved','Sin limpiar':'table-card--dirty' }[s] ?? '';
  }

  openTableMenu(t: RestaurantTable): void { this.selectedTable = t; this.newStatus = t.status; }
  closeMenu():    void { this.selectedTable = undefined; }

  applyStatus(): void {
    if (this.selectedTable) {
      this.svc.updateTableStatus(this.selectedTable.id, this.newStatus);
      this.closeMenu();
    }
  }

  updateAll(): void { /* refresh */ }
}
