import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, UserStatus, fullName, initials, docLabel } from '../users.model';
import { STATUS_BADGE, avatarColor, when, dmy, fold, dayOffset } from '../users-ui';

// Vigentes = cuentas en uso (todas menos las inactivas: personal retirado o dado de baja)
type Tab = 'Vigentes' | 'Todos' | UserStatus;
const PAGE = 15;

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Consultar usuarios</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Usuarios del sistema</h1>
      <p class="kit-sub">Cuentas, roles y estado en tiempo real · actualizado {{ updated }}.</p>
    </div>
    <div class="kit-actions">
      <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/users/roles">Roles y permisos</a>
      <a class="rsv-btn rsv-btn--primary" routerLink="/dashboard/users/new" *ngIf="canCreate">+ Nuevo usuario</a>
    </div>
  </header>

  <section class="kit-kpis ul-kpis">
    <div class="ur-kpi"><i style="background:#1565C0"></i><div><span>Usuarios</span><strong>{{ users.length }}</strong><small>{{ rolesInUse }} roles en uso</small></div></div>
    <div class="ur-kpi"><i style="background:#1F8A5B"></i><div><span>Activos</span><strong>{{ count('Activo') }}</strong><small>Con acceso al sistema</small></div></div>
    <div class="ur-kpi"><i style="background:#D98A0B"></i><div><span>Pendientes</span><strong>{{ count('Pendiente') }}</strong><small>Esperando activación</small></div></div>
    <div class="ur-kpi"><i style="background:#C62828"></i><div><span>Bloqueados</span><strong>{{ count('Bloqueado') }}</strong><small>Por intentos fallidos</small></div></div>
    <div class="ur-kpi"><i style="background:#64748B"></i><div><span>Inactivos</span><strong>{{ count('Inactivo') }}</strong><small>Historial conservado</small></div></div>
  </section>

  <section class="kit-card ul-card">
    <div class="ur-tabs ul-tabs" role="tablist">
      <button type="button" class="ur-tab" *ngFor="let t of tabs" role="tab" [attr.aria-selected]="tab === t" [class.active]="tab === t" (click)="tab = t; page = 0">
        {{ t === 'Todos' || t === 'Vigentes' ? t : t === 'Inactivo' ? 'Inactivos (historial)' : t + 's' }} <small>{{ tabCount(t) }}</small></button>
    </div>
    <div class="rp-filters ul-filters">
      <label class="kit-search ul-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" [(ngModel)]="q" (ngModelChange)="page = 0" placeholder="Nombre, usuario, documento, correo o rol" aria-label="Buscar usuario"></label>
      <label class="kit-select"><span>Rol</span><select [(ngModel)]="roleId" (ngModelChange)="page = 0"><option value="">Todos</option><option *ngFor="let r of roles" [value]="r.id">{{ r.name }}</option></select></label>
      <label class="kit-select"><span>Estado</span><select [(ngModel)]="tabSelect" (ngModelChange)="tab = $event; page = 0"><option value="Vigentes">Vigentes</option><option value="Todos">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
      <label class="kit-select"><span>Fecha de registro</span><select [(ngModel)]="created" (ngModelChange)="page = 0">
        <option value="">Cualquiera</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="year">Este año</option></select></label>
    </div>

    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Usuario</th><th>Correo</th><th>Documento</th><th>Roles</th><th>Estado</th><th>Creado</th><th>Último acceso</th><th class="r">Acciones</th></tr></thead>
        <tbody>
          <tr *ngFor="let u of pageRows" [class.ur-muted-row]="u.status === 'Inactivo'">
            <td><div class="ur-user"><span class="ur-avatar" [style.background]="color(u)">{{ ini(u) }}</span><div><strong>{{ name(u) }}</strong><code>{{ u.username }}</code></div></div></td>
            <td>{{ u.email }}</td>
            <td>{{ doc(u) }}</td>
            <td><div class="ur-roles"><span *ngFor="let r of rolesOf(u)" class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span></div></td>
            <td><span class="rsv-badge" [ngClass]="badge[u.status]">{{ u.status }}</span>
              <small class="ul-sched" *ngIf="u.scheduledDeactivation">Se desactiva {{ when(u.scheduledDeactivation.at) }}</small></td>
            <td>{{ dmy(u.createdAt) }}</td>
            <td [class.ul-never]="!u.lastAccess">{{ when(u.lastAccess) }}</td>
            <td>
              <div class="ur-actions">
                <a class="ur-icon-btn" [routerLink]="['/dashboard/users', u.id]" [attr.aria-label]="'Ver ' + name(u)" title="Ver detalle"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></a>
                <a class="ur-icon-btn" [routerLink]="['/dashboard/users', u.id]" [queryParams]="{ tab: 'editar' }" *ngIf="canEdit" [attr.aria-label]="'Editar ' + name(u)" title="Editar"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg></a>
                <div class="ur-menu">
                  <button type="button" class="ur-icon-btn" (click)="toggleMenu(u.id, $event)" [attr.aria-expanded]="menu === u.id" [attr.aria-label]="'Más acciones para ' + name(u)"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button>
                  <div class="ur-menu-list" *ngIf="menu === u.id">
                    <a [routerLink]="['/dashboard/users', u.id]" [queryParams]="{ tab: 'permisos' }">Ver permisos</a>
                    <a routerLink="/dashboard/users/activity" [queryParams]="{ usuario: u.username }">Ver actividad</a>
                    <a routerLink="/dashboard/users/passwords" [queryParams]="{ u: u.id }" *ngIf="canEdit">Restablecer contraseña</a>
                    <a routerLink="/dashboard/users/status" [queryParams]="{ u: u.id }" *ngIf="canEdit">{{ u.status === 'Activo' || u.status === 'Pendiente' ? 'Desactivar cuenta' : u.status === 'Bloqueado' ? 'Desbloquear' : 'Reactivar cuenta' }}</a>
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="8" class="kit-empty">No hay usuarios con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
    <footer class="ul-foot">
      <span>{{ rows.length }} usuario{{ rows.length === 1 ? '' : 's' }} · {{ pages }} página{{ pages === 1 ? '' : 's' }}</span>
      <nav class="rp-pager" *ngIf="pages > 1"><button type="button" *ngFor="let p of pageList" [class.active]="p === page" (click)="page = p">{{ p + 1 }}</button></nav>
      <span>La consulta queda registrada en auditoría según la política configurada.</span>
    </footer>
  </section>
  `,
  styles: [`
    .ul-kpis { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .ul-card { padding: 12px 0 8px; }
    .ul-tabs { border: none; padding: 0 14px 12px; }
    .ul-filters { padding: 12px 14px 0; border-top: 1px solid #EEF1F5; margin-bottom: 12px; }
    .ul-search { flex: 2; min-width: 220px; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 12px; border: 1px solid #D5DEEA; border-radius: 10px; }
    .ul-search svg { width: 17px; height: 17px; fill: none; stroke: #6B7280; stroke-width: 2; }
    .ul-search input { border: none; outline: none; flex: 1; font: inherit; font-size: 13px; background: transparent; }
    .kit-table-wrap { padding: 0 14px; }
    th.r { text-align: right; }
    .ul-never { color: #B45309; }
    .ul-sched { display: block; font-size: 10.5px; color: #B45309; margin-top: 3px; }
    .ul-foot { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; padding: 12px 18px 4px; border-top: 1px solid #EEF1F5; margin-top: 8px; font-size: 12px; color: #6B7280; }
    .rp-pager { display: flex; gap: 6px; }
    .rp-pager button { min-width: 32px; height: 30px; border-radius: 8px; border: 1px solid #D5DEEA; background: #fff; cursor: pointer; }
    .rp-pager button.active { background: #0A2540; color: #fff; }
  `],
})
export class UserListComponent implements OnDestroy {
  readonly tabs: Tab[] = ['Vigentes', 'Activo', 'Pendiente', 'Bloqueado', 'Inactivo', 'Todos'];
  readonly statuses: UserStatus[] = ['Activo', 'Pendiente', 'Bloqueado', 'Inactivo'];
  readonly badge = STATUS_BADGE;
  readonly when = when; readonly dmy = dmy;

  users: AppUser[] = [];
  roles: Role[] = [];
  tab: Tab = 'Vigentes';
  tabSelect: Tab = 'Vigentes';
  q = ''; roleId = ''; created = '';
  page = 0;
  menu = '';
  updated = '';
  private sub: Subscription;

  constructor(private svc: UsersService) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles()]).subscribe(([u, r]) => {
      this.users = u; this.roles = r;
      const n = new Date();
      this.updated = `${dmy(dayOffset(0))} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    });
    svc.addLog('Usuarios: consultó usuarios', 'Listado de cuentas');
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  @HostListener('document:click') closeMenu(): void { this.menu = ''; }
  toggleMenu(id: string, ev: Event): void { ev.stopPropagation(); this.menu = this.menu === id ? '' : id; }

  get canCreate(): boolean { return this.svc.can('Usuarios', 'create'); }
  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get rolesInUse(): number { return new Set(this.users.flatMap(u => u.roles)).size; }
  count(s: UserStatus): number { return this.users.filter(u => u.status === s).length; }
  private inTab(u: AppUser, t: Tab): boolean { return t === 'Todos' || (t === 'Vigentes' ? u.status !== 'Inactivo' : u.status === t); }
  tabCount(t: Tab): number { return this.users.filter(u => this.inTab(u, t)).length; }
  name(u: AppUser): string { return fullName(u); }
  ini(u: AppUser): string { return initials(u); }
  color(u: AppUser): string { return avatarColor(u); }
  doc(u: AppUser): string { return docLabel(u); }
  rolesOf(u: AppUser): Role[] { return u.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }

  get rows(): AppUser[] {
    const q = fold(this.q.trim());
    const from = this.created === '7' ? dayOffset(-7) : this.created === '30' ? dayOffset(-30) : this.created === 'year' ? `${dayOffset(0).slice(0, 4)}-01-01` : '';
    return this.users.filter(u => this.inTab(u, this.tab) && (!this.roleId || u.roles.includes(this.roleId))
      && (!from || u.createdAt.slice(0, 10) >= from)
      && (!q || fold([fullName(u), u.username, u.docNumber, u.email, ...this.rolesOf(u).map(r => r.name)].join(' ')).includes(q)));
  }
  get pages(): number { return Math.max(1, Math.ceil(this.rows.length / PAGE)); }
  get pageList(): number[] { return Array.from({ length: this.pages }, (_, i) => i); }
  get pageRows(): AppUser[] { return this.rows.slice(this.page * PAGE, this.page * PAGE + PAGE); }
}
