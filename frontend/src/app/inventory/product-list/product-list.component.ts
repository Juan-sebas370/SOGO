import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { Product, StockStatus } from '../inventory.model';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./product-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/inventory">Inventarios</a><span>›</span>
      <span>Productos</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Listado de Productos</h1>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/inventory/entry">+ Nueva Entrada</button>
        <button class="btn-outline-sm" routerLink="/dashboard/inventory/reports">📊 Reporte Valorizado</button>
        <button class="btn-outline-sm" routerLink="/dashboard/inventory/alerts">🔔 Alertas</button>
        <button class="btn-new" routerLink="/dashboard/inventory/products/new">+ Nuevo Producto</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar producto por nombre o código..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterCategory" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todas las categorías</option>
          <option value="Alimentos">Alimentos</option>
          <option value="Bebidas">Bebidas</option>
          <option value="Limpieza">Limpieza</option>
          <option value="Aseo">Aseo</option>
          <option value="Otros">Otros</option>
        </select>
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Óptimo">Óptimo</option>
          <option value="Bajo">Bajo</option>
          <option value="Crítico">Crítico</option>
          <option value="Vencido">Vencido</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Unidad</th>
            <th class="text-center">Stock Actual</th>
            <th class="text-center">Stock Mín.</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of paged">
            <td class="res-code">{{ p.code }}</td>
            <td class="font-bold">{{ p.name }}</td>
            <td><span class="cat-badge cat-badge--{{ p.category.toLowerCase() }}">{{ p.category }}</span></td>
            <td>{{ p.unit }}</td>
            <td class="text-center" [class.text-danger]="p.stockActual < p.stockMin">{{ p.stockActual }}</td>
            <td class="text-center text-muted">{{ p.stockMin }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(p.status)">{{ p.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle" (click)="goDetail(p.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"      (click)="goEdit(p.id)">✏</button>
                <button class="action-btn action-btn--print"  title="Agregar"     (click)="goEntry(p.id)">+</button>
                <button class="action-btn action-btn--cancel" title="Eliminar"    (click)="remove(p.id)">🗑</button>
                <button class="action-btn action-btn--print"  title="Exportar"    (click)="exportPdf()">⬇</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="8" class="res-empty">No se encontraron productos.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} productos</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--inv-opt">Óptimo</span><span class="legend-text">Stock dentro del nivel adecuado.</span>
      <span class="res-badge res-badge--inv-low">Bajo</span><span class="legend-text">Stock por debajo del nivel mínimo.</span>
      <span class="res-badge res-badge--inv-crit">Crítico</span><span class="legend-text">Stock muy por debajo del mínimo.</span>
      <span class="res-badge res-badge--inv-exp">Vencido</span><span class="legend-text">Producto con fecha de vencimiento pasada.</span>
    </div>

  </div>
  `
})
export class ProductListComponent implements OnInit {
  all: Product[] = []; filtered: Product[] = []; paged: Product[] = [];
  search = ''; filterCategory = ''; filterStatus = '';
  page = 1; pageSize = 7; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;

  constructor(private svc: InventoryService, private router: Router) {}

  ngOnInit(): void { this.svc.getAll().subscribe(d => { this.all = d; this.applyFilters(); }); }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(p => {
      const ms  = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const mc  = !this.filterCategory || p.category === this.filterCategory;
      const mst = !this.filterStatus   || p.status   === this.filterStatus;
      return ms && mc && mst;
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

  badgeClass(s: StockStatus): string {
    return { 'Óptimo':'res-badge--inv-opt','Bajo':'res-badge--inv-low','Crítico':'res-badge--inv-crit','Vencido':'res-badge--inv-exp' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/inventory/products', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/inventory/products', id, 'edit']); }
  goEntry(id: string):  void { this.router.navigate(['/dashboard/inventory/entry'], { queryParams: { product: id } }); }
  exportPdf():          void { window.print(); }
  remove(id: string):   void { if (confirm('¿Eliminar este producto?')) {} }
}
