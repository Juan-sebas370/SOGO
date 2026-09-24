import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { Order, OrderStatus } from '../restaurant.model';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./order-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/restaurant">Restaurante y Cafetería</a><span>›</span>
      <span>Pedidos</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Listado de Pedidos</h1>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/restaurant/tables">🗺 Ver Mesas</button>
        <button class="btn-outline-sm" routerLink="/dashboard/restaurant/reports">📊 Reportes</button>
        <button class="btn-new" routerLink="/dashboard/restaurant/orders/new">+ Nuevo Pedido</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar pedido, mesa o cliente..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Preparando">Preparando</option>
          <option value="En cocina">En cocina</option>
          <option value="En camino">En camino</option>
          <option value="Servido">Servido</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>N° Pedido</th>
            <th>Mesa / Tipo</th>
            <th>Cliente</th>
            <th>Fecha y Hora</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let o of paged">
            <td class="res-code">{{ o.number }}</td>
            <td>{{ o.tableNumber }}</td>
            <td>{{ o.clientName }}</td>
            <td>{{ o.dateTime | date:'dd/MM/yyyy HH:mm' }}</td>
            <td class="inv-total">$ {{ o.total | number }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(o.status)">{{ o.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle" (click)="goDetail(o.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"      (click)="goEdit(o.id)" [disabled]="o.status==='Cancelado'">✏</button>
                <button class="action-btn action-btn--print"  title="Imprimir"    (click)="print()">🖨</button>
                <button class="action-btn action-btn--cancel" title="Cancelar"    (click)="cancel(o.id)" [disabled]="o.status==='Cancelado' || o.status==='Servido'">🗑</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="7" class="res-empty">No se encontraron pedidos.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} pedidos</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--ord-prep">Preparando</span><span class="legend-text">Pedido en preparación.</span>
      <span class="res-badge res-badge--ord-way">En camino</span><span class="legend-text">En proceso de entrega.</span>
      <span class="res-badge res-badge--ord-served">Servido</span><span class="legend-text">Pedido entregado.</span>
      <span class="res-badge res-badge--ord-cancel">Cancelado</span><span class="legend-text">Pedido cancelado.</span>
    </div>

  </div>
  `
})
export class OrderListComponent implements OnInit {
  all: Order[] = [];
  filtered: Order[] = [];
  paged: Order[] = [];
  search = ''; filterStatus = '';
  page = 1; pageSize = 6; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;

  constructor(private svc: RestaurantService, private router: Router) {}

  ngOnInit(): void {
    this.svc.getOrders().subscribe(d => { this.all = d; this.applyFilters(); });
  }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(o => {
      const ms = !q || o.number.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || o.tableNumber.toLowerCase().includes(q);
      const mst = !this.filterStatus || o.status === this.filterStatus;
      return ms && mst;
    });
    this.page = 1; this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    this.pageStart = (this.page - 1) * this.pageSize + 1;
    this.pageEnd = Math.min(this.page * this.pageSize, this.filtered.length);
    this.paged = this.filtered.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }

  setPage(p: number): void { if (p < 1 || p > this.totalPages) return; this.page = p; this.updatePagination(); }

  badgeClass(s: OrderStatus): string {
    return {
      'Preparando':'res-badge--ord-prep', 'En cocina':'res-badge--ord-kitchen',
      'En camino':'res-badge--ord-way',   'Servido':'res-badge--ord-served',
      'Cancelado':'res-badge--ord-cancel'
    }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/restaurant/orders', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/restaurant/orders', id, 'edit']); }
  print():              void { window.print(); }
  cancel(id: string):   void { if (confirm('¿Cancelar este pedido?')) this.svc.updateOrder(id, { status: 'Cancelado' }); }
}
