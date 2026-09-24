import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Voucher, VoucherStatus } from '../accounting.model';

@Component({
  selector: 'app-voucher-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./voucher-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/accounting">Contabilidad</a><span>›</span>
      <span>Comprobantes</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Listado de Comprobantes</h1>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/accounting/journal">📖 Libro Diario</button>
        <button class="btn-outline-sm" routerLink="/dashboard/accounting/income-statement">📊 Est. Resultados</button>
        <button class="btn-outline-sm" routerLink="/dashboard/accounting/reports">📋 Reportes</button>
        <button class="btn-new" routerLink="/dashboard/accounting/vouchers/new">+ Nuevo Comprobante</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar comprobante, concepto, tercero..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterType" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los tipos</option>
          <option value="ING">ING - Ingreso</option>
          <option value="EGR">EGR - Egreso</option>
          <option value="PAG">PAG - Pago</option>
          <option value="FAC">FAC - Factura</option>
          <option value="NOM">NOM - Nómina</option>
        </select>
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Publicado">Publicado</option>
          <option value="En proceso">En proceso</option>
          <option value="En revisión">En revisión</option>
          <option value="Anulado">Anulado</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Número</th>
            <th>Concepto</th>
            <th>Tercero</th>
            <th class="text-right">Débito</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let v of paged">
            <td>{{ v.date | date:'dd/MM/yyyy' }}</td>
            <td><span class="type-badge type-badge--{{ v.type.toLowerCase() }}">{{ v.type }}</span></td>
            <td class="res-code">{{ v.number }}</td>
            <td>{{ v.concept }}</td>
            <td>{{ v.third }}</td>
            <td class="text-right inv-total">$ {{ (v.debit || v.credit) | number }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(v.status)">{{ v.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle"  (click)="goDetail(v.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"       (click)="goEdit(v.id)" [disabled]="v.status==='Anulado' || v.status==='Publicado'">✏</button>
                <button class="action-btn action-btn--print"  title="Duplicar"     (click)="duplicate(v.id)">📋</button>
                <button class="action-btn action-btn--print"  title="Exportar PDF" (click)="exportPdf()">⬇</button>
                <button class="action-btn action-btn--cancel" title="Anular"       (click)="annul(v.id)" [disabled]="v.status==='Anulado'">🗑</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="8" class="res-empty">No se encontraron comprobantes.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} comprobantes</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--acc-pub">Publicado</span><span class="legend-text">Comprobante publicado y contabilizado.</span>
      <span class="res-badge res-badge--acc-proc">En proceso</span><span class="legend-text">Comprobante en elaboración.</span>
      <span class="res-badge res-badge--acc-rev">En revisión</span><span class="legend-text">Comprobante en revisión.</span>
      <span class="res-badge res-badge--acc-ann">Anulado</span><span class="legend-text">Comprobante anulado.</span>
    </div>
  </div>
  `
})
export class VoucherListComponent implements OnInit {
  all: Voucher[] = []; filtered: Voucher[] = []; paged: Voucher[] = [];
  search = ''; filterType = ''; filterStatus = '';
  page = 1; pageSize = 7; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;

  constructor(private svc: AccountingService, private router: Router) {}

  ngOnInit(): void { this.svc.getAll().subscribe(d => { this.all = d; this.applyFilters(); }); }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(v => {
      const ms  = !q || v.number.toLowerCase().includes(q) || v.concept.toLowerCase().includes(q) || v.third.toLowerCase().includes(q);
      const mt  = !this.filterType   || v.type   === this.filterType;
      const mst = !this.filterStatus || v.status === this.filterStatus;
      return ms && mt && mst;
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

  badgeClass(s: VoucherStatus): string {
    return { 'Publicado':'res-badge--acc-pub','En proceso':'res-badge--acc-proc','En revisión':'res-badge--acc-rev','Anulado':'res-badge--acc-ann' }[s] ?? '';
  }

  goDetail(id: string):   void { this.router.navigate(['/dashboard/accounting/vouchers', id]); }
  goEdit(id: string):     void { this.router.navigate(['/dashboard/accounting/vouchers', id, 'edit']); }
  duplicate(id: string):  void { const v = this.svc.getById(id); if (v) this.svc.create({ ...v, status:'En proceso', date: new Date().toISOString().slice(0,10) }); }
  exportPdf():            void { window.print(); }
  annul(id: string):      void { if (confirm('¿Anular este comprobante?')) this.svc.annul(id); }
}
