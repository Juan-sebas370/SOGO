import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { AppUser, UserStatus } from '../users.model';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./user-list.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/users">Usuarios y Roles</a><span>›</span>
      <span>Usuarios</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Listado de Usuarios</h1>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/users/roles">👥 Roles</button>
        <button class="btn-outline-sm" routerLink="/dashboard/users/audit">📋 Historial</button>
        <button class="btn-new" routerLink="/dashboard/users/new">+ Nuevo Usuario</button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar usuario por nombre, correo o rol..." class="res-search">
      </div>
      <div class="res-filters">
        <select [(ngModel)]="filterRole" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los roles</option>
          <option *ngFor="let r of roleNames" [value]="r">{{ r }}</option>
        </select>
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="res-select">
          <option value="">Todos los estados</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Bloqueado">Bloqueado</option>
        </select>
        <button class="btn-filter">🔽 Filtros</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Último Acceso</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let u of paged">
            <td class="res-code">{{ u.code }}</td>
            <td class="font-bold">{{ u.firstName }} {{ u.lastName }}</td>
            <td class="text-muted">{{ u.email }}</td>
            <td><span class="role-badge">{{ u.role }}</span></td>
            <td><span class="res-badge" [ngClass]="badgeClass(u.status)">{{ u.status }}</span></td>
            <td class="text-muted">{{ u.lastAccess | date:'dd/MM/yyyy HH:mm' }}</td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver detalle"        (click)="goDetail(u.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"             (click)="goEdit(u.id)">✏</button>
                <button class="action-btn action-btn--print"  title="Bloquear/Desbloquear" (click)="toggleBlock(u)">
                  {{ u.status === 'Bloqueado' ? '🔓' : '🔒' }}
                </button>
                <button class="action-btn action-btn--cancel" title="Eliminar"           (click)="remove(u.id)">🗑</button>
                <button class="action-btn action-btn--print"  title="Exportar"           (click)="exportUser()">⬇</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="paged.length===0">
            <td colspan="7" class="res-empty">No se encontraron usuarios.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando {{ pageStart }}-{{ pageEnd }} de {{ filtered.length }} usuarios</span>
      <div class="res-pag-btns">
        <button class="pag-btn" [disabled]="page===1" (click)="setPage(page-1)">‹</button>
        <button *ngFor="let p of pages" class="pag-btn" [class.active]="p===page" (click)="setPage(p)">{{ p }}</button>
        <button class="pag-btn" [disabled]="page===totalPages" (click)="setPage(page+1)">›</button>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--usr-active">Activo</span><span class="legend-text">Usuario o rol habilitado.</span>
      <span class="res-badge res-badge--usr-inactive">Inactivo</span><span class="legend-text">Usuario deshabilitado temporalmente.</span>
      <span class="res-badge res-badge--usr-pending">Pendiente</span><span class="legend-text">Usuario pendiente de activación.</span>
      <span class="res-badge res-badge--usr-blocked">Bloqueado</span><span class="legend-text">Usuario bloqueado por seguridad.</span>
    </div>
  </div>
  `
})
export class UserListComponent implements OnInit {
  all: AppUser[] = []; filtered: AppUser[] = []; paged: AppUser[] = [];
  search = ''; filterRole = ''; filterStatus = '';
  page = 1; pageSize = 8; totalPages = 1;
  pages: number[] = []; pageStart = 0; pageEnd = 0;
  roleNames: string[] = [];

  constructor(private svc: UsersService, private router: Router) {}

  ngOnInit(): void {
    this.roleNames = this.svc.getRoleNames();
    this.svc.getUsers().subscribe(d => { this.all = d; this.applyFilters(); });
  }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(u => {
      const ms  = !q || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
      const mr  = !this.filterRole   || u.role   === this.filterRole;
      const mst = !this.filterStatus || u.status === this.filterStatus;
      return ms && mr && mst;
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

  badgeClass(s: UserStatus): string {
    return { 'Activo':'res-badge--usr-active','Inactivo':'res-badge--usr-inactive','Pendiente':'res-badge--usr-pending','Bloqueado':'res-badge--usr-blocked' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/users', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/users', id, 'edit']); }
  toggleBlock(u: AppUser): void { this.svc.toggleBlock(u.id); }
  exportUser(): void { window.print(); }
  remove(id: string): void { if (confirm('¿Eliminar este usuario?')) {} }
}
