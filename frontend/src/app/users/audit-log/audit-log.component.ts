import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { AuditLog } from '../users.model';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./audit-log.component.css'],
  template: `
  <div class="res-page">
    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/users">Usuarios y Roles</a><span>›</span>
      <span>Auditoría</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Historial de Accesos y Cambios</h1>
      <button class="btn-outline-sm" (click)="exportLog()">⬇ Exportar</button>
    </div>

    <!-- Filtros -->
    <div class="report-filters">
      <div class="form-field">
        <label>Usuario</label>
        <select [(ngModel)]="filterUser" (ngModelChange)="applyFilters()" class="form-select">
          <option value="Todos">Todos</option>
          <option *ngFor="let u of userNames" [value]="u">{{ u }}</option>
        </select>
      </div>
      <div class="form-field">
        <label>Acción</label>
        <select [(ngModel)]="filterAction" (ngModelChange)="applyFilters()" class="form-select">
          <option value="Todos">Todos</option>
          <option>Inicio de sesión</option>
          <option>Cierre de sesión</option>
          <option>Creación de usuario</option>
          <option>Actualización de rol</option>
          <option>Cambio de permisos</option>
          <option>Bloqueo de usuario</option>
          <option>Restablecimiento de contraseña</option>
        </select>
      </div>
      <div class="form-field"><label>Fecha Desde</label><input type="date" [(ngModel)]="dateFrom" class="form-input"></div>
      <div class="form-field"><label>Fecha Hasta</label><input type="date" [(ngModel)]="dateTo" class="form-input"></div>
      <div class="form-field" style="align-self:flex-end">
        <button class="btn-primary" (click)="applyFilters()">🔍 Buscar</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Fecha y Hora</th>
            <th>Usuario</th>
            <th>Acción</th>
            <th>Detalle</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let log of paged">
            <td class="text-muted">{{ log.dateTime | date:'dd/MM/yyyy HH:mm' }}</td>
            <td class="font-bold">{{ log.user }}</td>
            <td>
              <span class="audit-action-badge" [ngClass]="actionClass(log.action)">
                {{ log.action }}
              </span>
            </td>
            <td class="text-muted">{{ log.detail }}</td>
            <td class="res-code">{{ log.ip }}</td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="5" class="res-empty">No se encontraron registros.</td>
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
  </div>
  `
})
export class AuditLogComponent implements OnInit {
  all: AuditLog[] = []; filtered: AuditLog[] = []; paged: AuditLog[] = [];
  filterUser = 'Todos'; filterAction = 'Todos';
  dateFrom = '2024-05-01'; dateTo = '2024-05-31';
  page = 1; pageSize = 8; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;
  userNames: string[] = [];

  constructor(private svc: UsersService) {}

  ngOnInit(): void {
    this.all = this.svc.getLogs();
    this.userNames = [...new Set(this.all.map(l => l.user))];
    this.applyFilters();
  }

  applyFilters(): void {
    this.filtered = this.all.filter(l => {
      const mu = this.filterUser   === 'Todos' || l.user   === this.filterUser;
      const ma = this.filterAction === 'Todos' || l.action === this.filterAction;
      return mu && ma;
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

  actionClass(action: string): string {
    if (action.includes('Inicio')) return 'audit-badge--login';
    if (action.includes('Cierre')) return 'audit-badge--logout';
    if (action.includes('Creación')) return 'audit-badge--create';
    if (action.includes('Bloqueo')) return 'audit-badge--block';
    if (action.includes('Restablecimiento')) return 'audit-badge--reset';
    return 'audit-badge--change';
  }

  exportLog(): void { window.print(); }
}
