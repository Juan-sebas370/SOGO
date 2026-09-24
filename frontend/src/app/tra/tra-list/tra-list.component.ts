import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TraService } from '../tra.service';
import { Tra, TraStatus } from '../tra.model';

@Component({
  selector: 'app-tra-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tra-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <span>TRA</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Tarjetas de Registro de Alojamiento (TRA)</h1>
        <p class="res-subtitle">Listado de tarjetas TRA generadas</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/tra/reports">
          📊 Reportes TRA
        </button>
        <button class="btn-new" routerLink="/dashboard/tra/new">
          + Nueva TRA
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar por huésped, reserva o documento..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Generada">Generada</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Anulada">Anulada</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Código TRA</th>
            <th>Huésped</th>
            <th>Reserva</th>
            <th>Habitación</th>
            <th>Fecha Entrada</th>
            <th>Fecha Salida</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of paged">
            <td class="res-code">{{ t.code }}</td>
            <td>{{ t.fullName }}</td>
            <td class="res-code">{{ t.reservationCode }}</td>
            <td>{{ t.roomNumber }}</td>
            <td>{{ t.checkInDate | date:'dd/MM/yyyy' }}</td>
            <td>{{ t.checkOutDate | date:'dd/MM/yyyy' }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(t.status)">{{ t.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle"   (click)="goDetail(t.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"        (click)="goEdit(t.id)" [disabled]="t.status==='Anulada'">✏</button>
                <button class="action-btn action-btn--print"  title="Imprimir"      (click)="goPrint(t.id)">🖨</button>
                <button class="action-btn action-btn--cancel" title="Descargar PDF" (click)="download(t.id)">⬇</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length === 0">
            <td colspan="8" class="res-empty">No se encontraron TRAs.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} registros</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--tra-gen">Generada</span>
      <span class="legend-text">Tarjeta generada correctamente.</span>
      <span class="res-badge res-badge--tra-ann">Anulada</span>
      <span class="legend-text">Tarjeta anulada o cancelada.</span>
      <span class="res-badge res-badge--tra-pen">Pendiente</span>
      <span class="legend-text">Tarjeta pendiente de generación.</span>
    </div>

  </div>
  `
})
export class TraListComponent implements OnInit {

  all: Tra[] = [];
  filtered: Tra[] = [];
  paged: Tra[] = [];

  search = '';
  filterStatus = '';
  page = 1;
  pageSize = 5;
  totalPages = 1;
  pages: number[] = [];
  pageStart = 0;
  pageEnd = 0;

  constructor(private svc: TraService, private router: Router) {}

  ngOnInit(): void {
    this.svc.getAll().subscribe(data => {
      this.all = data;
      this.applyFilters();
    });
  }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(t => {
      const matchSearch = !q || t.fullName.toLowerCase().includes(q) ||
        t.reservationCode.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.docNumber.includes(q);
      const matchStatus = !this.filterStatus || t.status === this.filterStatus;
      return matchSearch && matchStatus;
    });
    this.page = 1;
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    this.pageStart = (this.page - 1) * this.pageSize + 1;
    this.pageEnd = Math.min(this.page * this.pageSize, this.filtered.length);
    this.paged = this.filtered.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.updatePagination();
  }

  badgeClass(s: TraStatus): string {
    return { 'Generada': 'res-badge--tra-gen', 'Anulada': 'res-badge--tra-ann', 'Pendiente': 'res-badge--tra-pen' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/tra', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/tra', id, 'edit']); }
  goPrint(id: string):  void { this.router.navigate(['/dashboard/tra', id, 'print']); }
  download(id: string): void { window.print(); }
}
