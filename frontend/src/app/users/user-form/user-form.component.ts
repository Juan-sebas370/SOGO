import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersService } from '../users.service';
import { AppUser } from '../users.model';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./user-form.component.css'],
  template: `
  <div class="res-page">
    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/users">Usuarios y Roles</a><span>›</span>
      <a routerLink="/dashboard/users/list">Usuarios</a><span>›</span>
      <span>{{ isEdit ? 'Editar' : 'Nuevo' }}</span>
    </div>
    <h1 class="res-title">{{ isEdit ? 'Editar Usuario' : 'Registro de Nuevo Usuario' }}</h1>

    <div class="user-form-grid">

      <!-- COLUMNA 1: Información Personal -->
      <div class="form-section">
        <h2 class="form-section-title">Información Personal</h2>
        <div class="form-field"><label>Nombres *</label><input type="text" [(ngModel)]="f.firstName" placeholder="David Alejandro" class="form-input"></div>
        <div class="form-field"><label>Apellidos *</label><input type="text" [(ngModel)]="f.lastName" placeholder="Torres García" class="form-input"></div>
        <div class="form-field"><label>Correo Electrónico *</label><input type="email" [(ngModel)]="f.email" placeholder="dav.torres@sogo.com" class="form-input"></div>
        <div class="form-field"><label>Teléfono</label><input type="text" [(ngModel)]="f.phone" placeholder="310 555-2345" class="form-input"></div>
        <div class="form-field"><label>Tipo de Documento</label>
          <select [(ngModel)]="f.docType" class="form-select">
            <option>Cédula de Ciudadanía</option><option>Pasaporte</option><option>Cédula Extranjera</option>
          </select>
        </div>
        <div class="form-field"><label>Documento de Identidad</label><input type="text" [(ngModel)]="f.docNumber" placeholder="1007890432" class="form-input"></div>
        <div class="form-field"><label>Fecha de Nacimiento</label><input type="date" [(ngModel)]="f.birthDate" class="form-input"></div>
        <div class="form-field"><label>Observaciones</label><textarea [(ngModel)]="f.observations" rows="3" placeholder="Usuario nuevo del área de recepción." class="form-textarea"></textarea></div>
      </div>

      <!-- COLUMNA 2: Información de Acceso -->
      <div class="form-section">
        <h2 class="form-section-title">Información de Acceso</h2>
        <div class="form-field"><label>Nombre de Usuario *</label><input type="text" [(ngModel)]="f.username" placeholder="dtorres" class="form-input"></div>
        <div class="form-field">
          <label>Contraseña *</label>
          <div class="input-wrapper">
            <input [type]="showPass ? 'text' : 'password'" [(ngModel)]="f.password" placeholder="••••••••" class="form-input" style="padding-left:16px">
            <button class="icon-button" type="button" (click)="showPass=!showPass">{{ showPass ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div class="form-field">
          <label>Confirmar Contraseña *</label>
          <div class="input-wrapper">
            <input [type]="showConfirm ? 'text' : 'password'" [(ngModel)]="confirmPass" placeholder="••••••••" class="form-input" style="padding-left:16px">
            <button class="icon-button" type="button" (click)="showConfirm=!showConfirm">{{ showConfirm ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div class="form-field">
          <label>Estado *</label>
          <select [(ngModel)]="f.status" class="form-select">
            <option>Activo</option><option>Inactivo</option><option>Pendiente</option>
          </select>
        </div>
        <div class="form-field">
          <label>Sucursal / Centro de Costo</label>
          <select [(ngModel)]="f.branch" class="form-select">
            <option>Hotel Principal</option><option>Restaurante</option><option>Administración</option>
          </select>
        </div>
        <div class="form-field">
          <label class="checkbox-label">
            <input type="checkbox" [(ngModel)]="f.sendCredentials"> Enviar credenciales por correo
          </label>
        </div>
      </div>

      <!-- COLUMNA 3: Asignación de Rol -->
      <div class="form-section">
        <h2 class="form-section-title">Asignación de Rol</h2>
        <div class="form-field">
          <label>Rol *</label>
          <select [(ngModel)]="f.role" class="form-select">
            <option *ngFor="let r of roleNames" [value]="r">{{ r }}</option>
          </select>
        </div>
        <!-- Preview de permisos del rol -->
        <div class="role-preview" *ngIf="f.role">
          <h3 class="role-preview-title">Permisos del rol</h3>
          <p class="role-preview-desc">{{ getRoleDesc(f.role) }}</p>
          <a [routerLink]="['/dashboard/users/roles']" class="link-view-all">Ver permisos detallados →</a>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/users/list">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Guardar Usuario' }}
      </button>
    </div>
  </div>
  `
})
export class UserFormComponent implements OnInit {
  isEdit = false; existingId = ''; errorMsg = '';
  showPass = false; showConfirm = false; confirmPass = '';
  roleNames: string[] = [];

  f: Partial<AppUser> = {
    firstName:'', lastName:'', email:'', phone:'',
    docType:'Cédula de Ciudadanía', docNumber:'', birthDate:'',
    username:'', password:'', status:'Activo',
    branch:'Hotel Principal', role:'Recepcionista',
    observations:'', sendCredentials: false
  };

  constructor(private svc: UsersService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.roleNames = this.svc.getRoleNames();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getUserById(id);
      if (found) { this.f = { ...found }; this.isEdit = true; this.existingId = id; }
    }
  }

  getRoleDesc(role: string): string {
    const r = this.svc.getRoleNames();
    const descs: Record<string,string> = {
      'Administrador':'Acceso total al sistema y configuración general.',
      'Recepcionista':'Gestión de reservas, check-in y check-out.',
      'Contador':'Acceso contable y financiero.',
      'Camarero':'Atención en restaurante y cafetería.',
      'Gerente':'Reportes, estadísticas y toma de decisiones.',
      'Almacén':'Gestión de inventarios y almacén.',
      'Invitado':'Acceso limitado a información pública.',
    };
    return descs[role] ?? '';
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.firstName || !this.f.email || !this.f.username) { this.errorMsg = 'Completa los campos obligatorios.'; return; }
    if (!this.isEdit && this.f.password !== this.confirmPass) { this.errorMsg = 'Las contraseñas no coinciden.'; return; }
    if (this.isEdit) { this.svc.updateUser(this.existingId, this.f as AppUser); }
    else { this.svc.createUser(this.f as Omit<AppUser,'id'|'code'|'lastAccess'|'createdAt'>); }
    this.router.navigate(['/dashboard/users/list']);
  }
}
