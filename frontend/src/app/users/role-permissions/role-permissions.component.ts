import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { Role, ModulePermission } from '../users.model';

@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./role-permissions.component.css'],
  template: `
  <div class="res-page" *ngIf="role">
    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/users">Usuarios y Roles</a><span>›</span>
      <a routerLink="/dashboard/users/roles">Roles</a><span>›</span>
      <span>Permisos</span>
    </div>

    <h1 class="res-title">Permisos del Rol: {{ role.name }}</h1>

    <div class="perms-table-wrap">
      <table class="res-table perms-table">
        <thead>
          <tr>
            <th class="col-module">Módulos del Sistema</th>
            <th class="col-perm text-center">Ver</th>
            <th class="col-perm text-center">Crear</th>
            <th class="col-perm text-center">Editar</th>
            <th class="col-perm text-center">Eliminar</th>
            <th class="col-perm text-center">Exportar</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of modules">
            <td class="module-name">
              <span class="module-icon">{{ moduleIcon(m) }}</span>
              {{ m }}
            </td>
            <td class="text-center"><input type="checkbox" [(ngModel)]="perms[m].view"   class="perm-check" [attr.aria-label]="'Ver ' + m"></td>
            <td class="text-center"><input type="checkbox" [(ngModel)]="perms[m].create" class="perm-check" [attr.aria-label]="'Crear ' + m"></td>
            <td class="text-center"><input type="checkbox" [(ngModel)]="perms[m].edit"   class="perm-check" [attr.aria-label]="'Editar ' + m"></td>
            <td class="text-center"><input type="checkbox" [(ngModel)]="perms[m].delete" class="perm-check" [attr.aria-label]="'Eliminar ' + m"></td>
            <td class="text-center"><input type="checkbox" [(ngModel)]="perms[m].export" class="perm-check" [attr.aria-label]="'Exportar ' + m"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/users/roles">Cancelar</button>
      <button class="btn-secondary" (click)="resetPerms()">Restablecer</button>
      <button class="btn-primary" (click)="save()">Guardar Permisos</button>
    </div>

    <!-- Toast confirmación -->
    <div class="toast-success" *ngIf="saved">✔ Permisos guardados correctamente.</div>
  </div>
  `
})
export class RolePermissionsComponent implements OnInit {
  role?: Role;
  modules: string[] = [];
  perms: Record<string, ModulePermission> = {};
  originalPerms: Record<string, ModulePermission> = {};
  saved = false;

  constructor(private svc: UsersService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.role    = this.svc.getRoleById(id);
    this.modules = this.svc.getModules();
    if (this.role) {
      // Clonar permisos
      this.modules.forEach(m => {
        const p = this.role!.permissions[m] ?? { view:false, create:false, edit:false, delete:false, export:false };
        this.perms[m]         = { ...p };
        this.originalPerms[m] = { ...p };
      });
    }
  }

  moduleIcon(m: string): string {
    const icons: Record<string,string> = {
      'Reservas':'📅','Alojamiento':'🏨','TRA':'📋','Facturación':'🧾',
      'Restaurante y Cafetería':'🍽','Nómina':'👥','Contabilidad':'📒',
      'Inventarios':'📦','Reportes':'📊','Usuarios y Roles':'👤','Configuración':'⚙'
    };
    return icons[m] ?? '📄';
  }

  resetPerms(): void {
    this.modules.forEach(m => this.perms[m] = { ...this.originalPerms[m] });
  }

  save(): void {
    this.svc.updateRolePermissions(this.role!.id, this.perms);
    this.saved = true;
    setTimeout(() => this.saved = false, 3000);
  }
}
