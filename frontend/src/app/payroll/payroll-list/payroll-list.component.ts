import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { Payroll, PayrollStatus } from '../payroll.model';

@Component({
  selector: 'app-payroll-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./payroll-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <span>Nómina</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Listado de Nóminas</h1>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" (click)="goPlanning()">📋 Planilla Integrada de Liquidación</button>
        <button class="btn-outline-sm" routerLink="/dashboard/payroll/reports">📊 Reportes de Nómina</button>
        <button class="btn-new" routerLink="/dashboard/payroll/new">+ Nueva Nómina</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar nómina..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="En proceso">En proceso</option>
          <option value="Preparando">Preparando</option>
          <option value="En validación">En validación</option>
          <option value="Completada">Completada</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Período</th>
            <th>Fecha Inicial</th>
            <th>Fecha Final</th>
            <th>Empleados</th>
            <th>Devengos</th>
            <th>Deducciones</th>
            <th>Neta</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of paged">
            <td class="payroll-period">{{ p.period }}</td>
            <td>{{ p.startDate | date:'dd/MM/yyyy' }}</td>
            <td>{{ p.endDate | date:'dd/MM/yyyy' }}</td>
            <td class="text-center">{{ p.employees }}</td>
            <td class="inv-total">$ {{ p.totalEarnings | number }}</td>
            <td class="text-danger">$ {{ p.totalDeductions | number }}</td>
            <td class="inv-total">$ {{ p.netPayroll | number }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(p.status)">{{ p.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle" (click)="goDetail(p.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"      (click)="goEdit(p.id)" [disabled]="p.status==='Completada'">✏</button>
                <button class="action-btn action-btn--cancel" title="Eliminar"    (click)="remove(p.id)" [disabled]="p.status==='Completada'">🗑</button>
                <button class="action-btn action-btn--print"  title="Exportar"    (click)="export()">⬇</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="9" class="res-empty">No se encontraron nóminas.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} nóminas</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--pay-process">En proceso</span><span class="legend-text">La nómina está en elaboración.</span>
      <span class="res-badge res-badge--pay-prep">Preparando</span><span class="legend-text">La nómina se está calculando.</span>
      <span class="res-badge res-badge--pay-valid">En validación</span><span class="legend-text">La nómina está siendo validada.</span>
      <span class="res-badge res-badge--pay-done">Completada</span><span class="legend-text">La nómina fue generada correctamente.</span>
    </div>

  </div>
  `
})
export class PayrollListComponent implements OnInit {
  all: Payroll[] = []; filtered: Payroll[] = []; paged: Payroll[] = [];
  search = ''; filterStatus = '';
  page = 1; pageSize = 6; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;

  constructor(private svc: PayrollService, private router: Router) {}

  ngOnInit(): void { this.svc.getAll().subscribe(d => { this.all = d; this.applyFilters(); }); }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(p => {
      const ms  = !q || p.period.toLowerCase().includes(q);
      const mst = !this.filterStatus || p.status === this.filterStatus;
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

  badgeClass(s: PayrollStatus): string {
    return { 'En proceso':'res-badge--pay-process','Preparando':'res-badge--pay-prep','En validación':'res-badge--pay-valid','Completada':'res-badge--pay-done' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/payroll', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/payroll', id, 'liquidation']); }
  goPlanning():         void { alert('Planilla Integrada de Liquidación (próximamente)'); }
  export():             void { window.print(); }
  remove(id: string):   void { if (confirm('¿Eliminar esta nómina?')) { /* soft delete */ } }
}
