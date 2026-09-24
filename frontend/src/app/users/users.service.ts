import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppUser, Role, AuditLog, ModulePermission, RolePermissions } from './users.model';

const ALL_MODULES = ['Reservas','Alojamiento','TRA','Facturación','Restaurante y Cafetería','Nómina','Contabilidad','Inventarios','Reportes','Usuarios y Roles','Configuración'];

const fullPerm  = (): ModulePermission => ({ view:true,  create:true,  edit:true,  delete:true,  export:true  });
const viewPerm  = (): ModulePermission => ({ view:true,  create:false, edit:false, delete:false, export:true  });
const recepPerm = (): ModulePermission => ({ view:true,  create:true,  edit:true,  delete:false, export:false });
const noPerms   = (): ModulePermission => ({ view:false, create:false, edit:false, delete:false, export:false });

const buildPerms = (fn: () => ModulePermission, exceptions?: Record<string, ModulePermission>): RolePermissions => {
  const p: RolePermissions = {};
  ALL_MODULES.forEach(m => p[m] = exceptions?.[m] ?? fn());
  return p;
};

@Injectable({ providedIn: 'root' })
export class UsersService {

  private users: AppUser[] = [
    { id:'1', code:'USR-0001', firstName:'Juan',    lastName:'Pérez',    email:'juan.perez@sogo.com',   phone:'300 111-2222', docType:'Cédula de Ciudadanía', docNumber:'1000765432', birthDate:'1990-03-15', role:'Administrador',  username:'jperez',   status:'Activo',    branch:'Hotel Principal', lastAccess:'2024-05-24T09:15', createdAt:'2024-01-10', observations:'', sendCredentials:false },
    { id:'2', code:'USR-0002', firstName:'María',   lastName:'López',    email:'maria.lopez@sogo.com',  phone:'310 222-3333', docType:'Cédula de Ciudadanía', docNumber:'1001234567', birthDate:'1992-07-22', role:'Recepcionista',  username:'mlopez',   status:'Activo',    branch:'Hotel Principal', lastAccess:'2024-05-24T09:48', createdAt:'2024-01-12', observations:'', sendCredentials:false },
    { id:'3', code:'USR-0003', firstName:'Carlos',  lastName:'Ruiz',     email:'carlos.ruiz@sogo.com',  phone:'320 333-4444', docType:'Cédula de Ciudadanía', docNumber:'1002345678', birthDate:'1985-11-08', role:'Contador',       username:'cruiz',    status:'Inactivo',  branch:'Hotel Principal', lastAccess:'2024-05-20T14:30', createdAt:'2024-01-15', observations:'', sendCredentials:false },
    { id:'4', code:'USR-0004', firstName:'Ana',     lastName:'Gómez',    email:'ana.gomez@sogo.com',    phone:'350 444-5555', docType:'Cédula de Ciudadanía', docNumber:'1003456789', birthDate:'1995-04-30', role:'Camarero',       username:'agomez',   status:'Activo',    branch:'Hotel Principal', lastAccess:'2024-05-21T17:20', createdAt:'2024-02-01', observations:'', sendCredentials:false },
    { id:'5', code:'USR-0005', firstName:'Pedro',   lastName:'Ramírez',  email:'pedro.ramirez@sogo.com',phone:'315 555-6666', docType:'Cédula de Ciudadanía', docNumber:'1004567890', birthDate:'1988-09-14', role:'Gerente',        username:'pramirez', status:'Activo',    branch:'Hotel Principal', lastAccess:'2024-05-23T08:00', createdAt:'2024-01-08', observations:'', sendCredentials:false },
    { id:'6', code:'USR-0006', firstName:'Sofía',   lastName:'Herrera',  email:'sofia.herrera@sogo.com',phone:'316 666-7777', docType:'Cédula de Ciudadanía', docNumber:'1005678901', birthDate:'1997-12-01', role:'Invitado',       username:'sherrera', status:'Pendiente', branch:'Hotel Principal', lastAccess:'2024-05-19T11:45', createdAt:'2024-03-10', observations:'', sendCredentials:false },
    { id:'7', code:'USR-0007', firstName:'Diego',   lastName:'Salazar',  email:'diego.salazar@sogo.com',phone:'312 777-8888', docType:'Cédula de Ciudadanía', docNumber:'1006789012', birthDate:'1993-06-20', role:'Recepcionista',  username:'dsalazar', status:'Bloqueado', branch:'Hotel Principal', lastAccess:'2024-05-15T11:22', createdAt:'2024-01-20', observations:'', sendCredentials:false },
    { id:'8', code:'USR-0008', firstName:'David',   lastName:'Alejandro',email:'dav.torres@sogo.com',   phone:'310 555-2345', docType:'Cédula de Ciudadanía', docNumber:'1007890432', birthDate:'1992-10-05', role:'Recepcionista',  username:'dtorres',  status:'Activo',    branch:'Hotel Principal', lastAccess:'2024-05-24T09:00', createdAt:'2024-05-20', observations:'Usuario nuevo del área de recepción.', sendCredentials:true },
  ];

  private roles: Role[] = [
    { id:'1', name:'Administrador', description:'Acceso total al sistema y configuración general', users:18, status:'Activo',   permissions: buildPerms(fullPerm)  },
    { id:'2', name:'Recepcionista', description:'Gestión de reservas, check-in y check-out',       users:34, status:'Activo',   permissions: buildPerms(recepPerm, { 'Configuración':noPerms(), 'Nómina':noPerms(), 'Contabilidad':noPerms(), 'Usuarios y Roles':noPerms() }) },
    { id:'3', name:'Contador',      description:'Acceso contable y financiero',                    users:12, status:'Activo',   permissions: buildPerms(viewPerm,  { 'Contabilidad':fullPerm(), 'Facturación':fullPerm() }) },
    { id:'4', name:'Camarero',      description:'Atención en restaurante y cafetería',              users:25, status:'Activo',   permissions: buildPerms(noPerms,   { 'Restaurante y Cafetería':recepPerm() }) },
    { id:'5', name:'Gerente',       description:'Reportes, estadísticas y toma de decisiones',     users:18, status:'Activo',   permissions: buildPerms(viewPerm,  { 'Reportes':fullPerm() }) },
    { id:'6', name:'Almacén',       description:'Gestión de inventarios y almacén',                users:15, status:'Activo',   permissions: buildPerms(noPerms,   { 'Inventarios':fullPerm() }) },
    { id:'7', name:'Invitado',      description:'Acceso limitado a información pública',            users:8,  status:'Inactivo', permissions: buildPerms(noPerms)  },
  ];

  private logs: AuditLog[] = [
    { id:'1',  dateTime:'2024-05-24T10:15', user:'Laura Martínez', action:'Cambio de permisos',  detail:'Rol: Recepcionista',       ip:'192.168.1.10' },
    { id:'2',  dateTime:'2024-05-24T10:18', user:'Ana Gómez',      action:'Bloqueo de usuario',  detail:'Usuario: Diego Salazar',   ip:'192.168.1.18' },
    { id:'3',  dateTime:'2024-05-24T10:18', user:'Carlos Ruiz',    action:'Actualización de rol',detail:'Usuario: Juan Pérez',      ip:'192.168.1.32' },
    { id:'4',  dateTime:'2024-05-24T09:42', user:'María López',    action:'Creación de usuario', detail:'Usuario: David Torres',    ip:'192.168.1.23' },
    { id:'5',  dateTime:'2024-05-24T09:27', user:'Juan Pérez',     action:'Inicio de sesión',    detail:'Sistema',                  ip:'192.168.1.32' },
    { id:'6',  dateTime:'2024-05-24T09:05', user:'Sistema',        action:'Cambio de configuración', detail:'Parámetros generales', ip:'192.168.1.1'  },
    { id:'7',  dateTime:'2024-05-23T17:30', user:'María López',    action:'Cierre de sesión',    detail:'Sistema',                  ip:'192.168.1.23' },
    { id:'8',  dateTime:'2024-05-23T14:22', user:'Carlos Ruiz',    action:'Restablecimiento de contraseña', detail:'Usuario: Ana Gómez', ip:'192.168.1.32' },
  ];

  private users$  = new BehaviorSubject<AppUser[]>(this.users);
  private roles$  = new BehaviorSubject<Role[]>(this.roles);

  getUsers():  Observable<AppUser[]> { return this.users$.asObservable(); }
  getRoles():  Observable<Role[]>    { return this.roles$.asObservable(); }
  getUserById(id: string): AppUser | undefined { return this.users.find(u => u.id === id); }
  getRoleById(id: string): Role | undefined    { return this.roles.find(r => r.id === id); }
  getRoleNames(): string[]                     { return this.roles.map(r => r.name); }
  getModules():   string[]                     { return ALL_MODULES; }
  getLogs():      AuditLog[]                   { return this.logs; }

  createUser(u: Omit<AppUser,'id'|'code'|'lastAccess'|'createdAt'>): AppUser {
    const n = this.users.length + 1;
    const newU: AppUser = { ...u, id: String(Date.now()), code: `USR-${String(n).padStart(4,'0')}`, lastAccess: '', createdAt: new Date().toISOString().slice(0,10) };
    this.users = [newU, ...this.users];
    this.users$.next(this.users);
    this.logs.unshift({ id: String(Date.now()), dateTime: new Date().toISOString(), user:'Administrador', action:'Creación de usuario', detail:`Usuario: ${u.firstName} ${u.lastName}`, ip:'192.168.1.1' });
    return newU;
  }

  updateUser(id: string, changes: Partial<AppUser>): void {
    this.users = this.users.map(u => u.id === id ? { ...u, ...changes } : u);
    this.users$.next(this.users);
  }

  toggleBlock(id: string): void {
    const u = this.users.find(x => x.id === id);
    if (!u) return;
    const newStatus = u.status === 'Bloqueado' ? 'Activo' : 'Bloqueado';
    this.updateUser(id, { status: newStatus });
    this.logs.unshift({ id: String(Date.now()), dateTime: new Date().toISOString(), user:'Administrador', action: newStatus === 'Bloqueado' ? 'Bloqueo de usuario' : 'Desbloqueo de usuario', detail:`Usuario: ${u.firstName} ${u.lastName}`, ip:'192.168.1.1' });
  }

  updateRolePermissions(roleId: string, permissions: any): void {
    this.roles = this.roles.map(r => r.id === roleId ? { ...r, permissions } : r);
    this.roles$.next(this.roles);
  }

  getStats() {
    const active   = this.users.filter(u => u.status === 'Activo').length;
    const inactive = this.users.filter(u => u.status === 'Inactivo').length;
    const blocked  = this.users.filter(u => u.status === 'Bloqueado').length;
    const pending  = this.users.filter(u => u.status === 'Pendiente').length;
    const roles    = this.roles.length;
    return { active, inactive, blocked, pending, roles, total: this.users.length };
  }
}
