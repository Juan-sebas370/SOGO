import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice, InvoiceStatus } from '../invoice.model';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <span>Facturación</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Facturación Electrónica</h1>
        <p class="res-subtitle">Listado de facturas</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/billing/reports">📊 Reportes</button>
        <button class="btn-outline-sm" (click)="search=''">🔍 Buscar Factura</button>
        <button class="btn-new" routerLink="/dashboard/billing/new">+ Nueva Factura</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar por número, cliente o documento..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Pagada">Pagada</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Anulada">Anulada</option>
          <option value="Rechazada">Rechazada</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let inv of paged">
            <td class="res-code">{{ inv.number }}</td>
            <td>{{ inv.clientName }}</td>
            <td>{{ inv.issueDate | date:'dd/MM/yyyy' }}</td>
            <td class="inv-total">$ {{ inv.total | number }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(inv.status)">{{ inv.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle"   (click)="goDetail(inv.id)">👁</button>
                <button class="action-btn action-btn--print"  title="Descargar PDF" (click)="download(inv.id)">⬇</button>
                <button class="action-btn action-btn--edit"   title="Enviar Email"  (click)="goSend(inv.id)" [disabled]="inv.status==='Anulada'">📧</button>
                <button class="action-btn action-btn--cancel" title="Anular"        (click)="annul(inv.id)"  [disabled]="inv.status==='Anulada'">🗑</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length === 0">
            <td colspan="6" class="res-empty">No se encontraron facturas.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} facturas</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--inv-paid">Pagada</span>
      <span class="legend-text">La factura ha sido cancelada por el cliente.</span>
      <span class="res-badge res-badge--inv-pend">Pendiente</span>
      <span class="legend-text">La factura está pendiente de pago.</span>
      <span class="res-badge res-badge--inv-rej">Rechazada</span>
      <span class="legend-text">La factura fue rechazada por la DIAN.</span>
      <span class="res-badge res-badge--inv-ann">Anulada</span>
      <span class="legend-text">La factura ha sido anulada.</span>
    </div>

  </div>
  `
})
export class InvoiceListComponent implements OnInit {
  all: Invoice[] = [];
  filtered: Invoice[] = [];
  paged: Invoice[] = [];
  search = '';
  filterStatus = '';
  page = 1; pageSize = 6; totalPages = 1;
  pages: number[] = [];
  pageStart = 0; pageEnd = 0;

  constructor(private svc: InvoiceService, private router: Router) {}

  ngOnInit(): void {
    this.svc.getAll().subscribe(d => { this.all = d; this.applyFilters(); });
  }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(i => {
      const ms = !q || i.number.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q) || i.docNumber.includes(q);
      const mst = !this.filterStatus || i.status === this.filterStatus;
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

  badgeClass(s: InvoiceStatus): string {
    return { 'Pagada':'res-badge--inv-paid','Pendiente':'res-badge--inv-pend','Anulada':'res-badge--inv-ann','Rechazada':'res-badge--inv-rej' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/billing', id]); }
  goSend(id: string):   void { this.router.navigate(['/dashboard/billing', id, 'send']); }
  download(_: string):  void { window.print(); }
  annul(id: string):    void { if (confirm('¿Anular esta factura?')) this.svc.annul(id); }
}
