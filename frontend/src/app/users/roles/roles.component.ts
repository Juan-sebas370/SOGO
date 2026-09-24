import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { Role } from '../users.model';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./roles.component.css'],
  template: `
  <div class="res-page">
    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/users">Usuarios y Roles</a><span>›</span>
      <span>Roles</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Gestión de Roles</h1>
      <button class="btn-new">+ Nuevo Rol</button>
    </div>

    <div class="res-toolbar">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="applyFilters()"
          placeholder="Buscar rol..." class="res-search">
      </div>
    </div>

    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Descripción</th>
            <th class="text-center">Usuarios</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of filtered">
            <td class="font-bold">{{ r.name }}</td>
            <td class="text-muted">{{ r.description }}</td>
            <td class="text-center">{{ r.users }}</td>
            <td>
              <span class="res-badge" [ngClass]="r.status==='Activo' ? 'res-badge--usr-active' : 'res-badge--usr-inactive'">
                {{ r.status }}
              </span>
            </td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"   title="Ver permisos"     (click)="goPerms(r.id)">👁</button>
                <button class="action-btn action-btn--edit"   title="Editar"           (click)="goPerms(r.id)">✏</button>
                <button class="action-btn action-btn--cancel" title="Eliminar" [disabled]="r.name==='Administrador'">🗑</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación info -->
    <div class="res-pagination">
      <span class="res-pag-info">Mostrando 1-{{ filtered.length }} de {{ filtered.length }} roles</span>
    </div>

    <!-- Leyenda -->
    <div class="res-legend">
      <span class="res-badge res-badge--usr-active">Activo</span><span class="legend-text">Rol habilitado.</span>
      <span class="res-badge res-badge--usr-inactive">Inactivo</span><span class="legend-text">Rol deshabilitado.</span>
    </div>
  </div>
  `
})
export class RolesComponent implements OnInit {
  all: Role[] = []; filtered: Role[] = [];
  search = '';

  constructor(private svc: UsersService, private router: Router) {}

  ngOnInit(): void {
    this.svc.getRoles().subscribe(d => { this.all = d; this.applyFilters(); });
  }

  applyFilters(): void {
    const q = this.search.toLowerCase();
    this.filtered = this.all.filter(r => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }

  goPerms(id: string): void { this.router.navigate(['/dashboard/users/roles', id, 'permissions']); }
}
