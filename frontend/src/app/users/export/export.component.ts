import { Component, inject, OnDestroy } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, AuditEvent, USER_STATUSES, MODULES, ACTIONS, ACTION_LABEL, fullName, maskedDoc, docLabel } from '../users.model';
import { SettingsService } from '../../settings/settings.service';
import { when, dmy, dmyTime, dayOffset } from '../users-ui';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';

type Tab = 'users' | 'roles' | 'audit';
type Format = 'PDF' | 'CSV';
const SECURITY = /sesión|bloque|contraseña|permiso|desactiv|desbloq|reactiv|activ|rol/i;

@Component({
  selector: 'app-users-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Exportar</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Exportar usuarios y auditoría</h1>
      <p class="kit-sub">Para respaldos, auditorías internas o externas e informes. La exportación no modifica la base de datos.</p>
    </div>
  </header>
  <p class="kit-banner kit-banner--danger" *ngIf="!canExport">Tu rol no tiene permiso para exportar información de usuarios.</p>

  <div class="ex-layout">
    <aside class="ex-side">
      <section class="kit-card">
        <h2 class="kit-card-title">1. Período y filtros</h2>
        <div class="ur-grid-2">
          <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="f.from" [max]="f.to"></label>
          <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="f.to" [min]="f.from"></label>
          <label class="kit-select"><span>Rol</span><select [(ngModel)]="f.role"><option value="">Todos</option><option *ngFor="let r of roles" [value]="r.id">{{ r.name }}</option></select></label>
          <label class="kit-select"><span>Estado</span><select [(ngModel)]="f.status"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
        </div>
        <label class="kit-select ex-mt"><span>Módulo (para auditoría)</span><select [(ngModel)]="f.module">
          <option value="">Todos</option><option value="sec">Usuarios y Sesión</option><option *ngFor="let m of auditModules" [value]="m">{{ m }}</option></select></label>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">2. Información a incluir</h2>
        <label class="ex-check"><input type="checkbox" [(ngModel)]="inc.users"> Datos de usuarios y estado</label>
        <label class="ex-check"><input type="checkbox" [(ngModel)]="inc.roles"> Roles asignados</label>
        <label class="ex-check"><input type="checkbox" [(ngModel)]="inc.perms"> Permisos por rol y módulo</label>
        <label class="ex-check"><input type="checkbox" [(ngModel)]="inc.audit"> Historial de actividad</label>
        <label class="ex-check" [class.off]="!inc.audit"><input type="checkbox" [(ngModel)]="inc.security" [disabled]="!inc.audit"> Solo eventos de seguridad (sesiones, bloqueos, contraseñas)</label>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">3. Formato</h2>
        <div class="ex-formats"><button type="button" *ngFor="let x of formats" [class.active]="format === x" (click)="format = x">{{ x === 'CSV' ? 'Excel (CSV)' : 'PDF' }}</button></div>
        <p class="rp-muted ex-small">{{ format === 'PDF' ? 'Hoja horizontal con tablas alineadas, membrete del hospedaje y encabezados en cada página.' : 'Archivo CSV que Excel abre en columnas, con tildes.' }}</p>
        <label class="ex-check off" title="Requiere el servidor"><input type="checkbox" disabled> Proteger archivo con contraseña</label>
        <p class="rp-muted ex-small">El cifrado del archivo lo hace el servidor; desde el navegador el archivo sale sin contraseña.</p>
        <button type="button" class="rsv-btn rsv-btn--primary ex-go" [disabled]="!canExport || empty" (click)="run()">Exportar {{ users.length }} usuario{{ users.length === 1 ? '' : 's' }} · {{ inc.audit ? audit.length + ' eventos' : 'sin auditoría' }}</button>
        <p class="kit-banner kit-banner--ok ex-mt" *ngIf="done">{{ done }}</p>
      </section>
    </aside>

    <div>
      <section class="kit-card ex-mb">
        <div class="rp-card-head"><h2 class="kit-card-title">Vista previa</h2><span class="rsv-badge rsv-badge--info">{{ fileName }}</span></div>
        <div class="ex-meta">
          <span>Empresa: <strong>{{ company }}</strong></span><span>Período: <strong>{{ dmy(f.from) }} – {{ dmy(f.to) }}</strong></span>
          <span>Generado: <strong>{{ now }}</strong></span><span>Usuario: <strong>{{ svc.actor() }}</strong></span>
        </div>
        <div class="ur-tabs ex-tabs" role="tablist">
          <button type="button" class="ur-tab" [class.active]="tab === 'users'" (click)="tab = 'users'" [disabled]="!inc.users">Usuarios <small>{{ users.length }}</small></button>
          <button type="button" class="ur-tab" [class.active]="tab === 'roles'" (click)="tab = 'roles'" [disabled]="!inc.perms">Roles y permisos <small>{{ roles.length }}</small></button>
          <button type="button" class="ur-tab" [class.active]="tab === 'audit'" (click)="tab = 'audit'" [disabled]="!inc.audit">Auditoría <small>{{ audit.length }}</small></button>
        </div>
        <ng-container *ngIf="!empty; else noData">
          <div class="kit-table-wrap" *ngIf="tab === 'users'">
            <table class="kit-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Documento</th><th *ngIf="inc.roles">Rol</th><th>Estado</th><th>Último acceso</th><th class="r">Eventos</th></tr></thead>
              <tbody><tr *ngFor="let u of users"><td><strong>{{ name(u) }}</strong></td><td><code class="ur-mono">{{ u.username }}</code></td><td>{{ masked(u) }}</td>
                <td *ngIf="inc.roles">{{ roleNames(u) }}</td><td>{{ u.status }}</td><td>{{ when(u.lastAccess) }}</td><td class="r">{{ eventsOf(u) }}</td></tr></tbody></table>
          </div>
          <div class="kit-table-wrap" *ngIf="tab === 'roles'">
            <table class="kit-table"><thead><tr><th>Rol</th><th>Hereda de</th><th>Módulo</th><th>Permisos efectivos</th></tr></thead>
              <tbody><ng-container *ngFor="let r of roles"><tr *ngFor="let p of permRows(r); let first = first"><td><strong *ngIf="first">{{ r.name }}</strong></td><td>{{ first ? parentName(r) : '' }}</td><td>{{ p.module }}</td><td>{{ p.actions }}</td></tr></ng-container></tbody></table>
          </div>
          <div class="kit-table-wrap" *ngIf="tab === 'audit'">
            <table class="kit-table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Resultado</th></tr></thead>
              <tbody><tr *ngFor="let e of audit.slice(0, 50)"><td>{{ dmyTime(e.at) }}</td><td><code class="ur-mono">{{ e.user }}</code></td><td>{{ e.module }}</td><td>{{ e.action }}</td><td>{{ e.result }}</td></tr></tbody></table>
            <p class="rp-muted" *ngIf="audit.length > 50">Vista previa de los 50 más recientes; el archivo incluye los {{ audit.length }}.</p>
          </div>
          <p class="rp-muted ex-small">{{ settings.audit.maskDocs ? 'Documentos enmascarados: solo se exportan los últimos 3 dígitos (Ley 1581 de 2012 · protección de datos personales).' : 'Los documentos se exportan completos (Configuración › Auditoría: ocultar documentos está apagado).' }}</p>
        </ng-container>
        <ng-template #noData><div class="ur-empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <div><strong>Sin datos</strong>«No hay información disponible para exportar con los criterios seleccionados.»</div></div></ng-template>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Exportaciones recientes</h2>
        <div class="kit-table-wrap"><table class="kit-table"><thead><tr><th>Archivo</th><th>Contenido</th><th>Usuario</th><th>Fecha</th></tr></thead>
          <tbody><tr *ngFor="let x of svc.exportsLog.slice(0, 8)"><td>{{ x.file }}</td><td>{{ x.content }}</td><td>{{ x.user }}</td><td>{{ dmyTime(x.at) }}</td></tr></tbody></table></div>
      </section>
    </div>
  </div>
  `,
  styles: [`
    .ex-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
    .ex-side { display: flex; flex-direction: column; gap: 14px; }
    .ex-side .kit-select { min-width: 0; }
    .ex-mt { margin-top: 10px; }
    .ex-mb { margin-bottom: 16px; }
    .ex-check { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; font-size: 13px; color: #1F2937; cursor: pointer; }
    .ex-check input { accent-color: #1565C0; width: 16px; height: 16px; margin-top: 1px; }
    .ex-check.off { color: #9AA5B4; cursor: not-allowed; }
    .ex-formats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 6px; }
    .ex-formats button { height: 42px; border: 1px solid #D5DEEA; border-radius: 10px; background: #fff; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
    .ex-formats button.active { border: 2px solid #1565C0; background: #F2F7FD; }
    .ex-small { font-size: 11.5px; margin: 6px 0 0; }
    .ex-go { width: 100%; height: 46px; margin-top: 12px; }
    .ex-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; background: #F6F8FB; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; color: #6B7280; margin-bottom: 12px; }
    .ex-meta strong { color: #0A2540; }
    .ex-tabs { border: none; padding: 0 0 10px; }
    .ur-tab:disabled { opacity: .45; cursor: not-allowed; }
    th.r, td.r { text-align: right; }
    @media (max-width: 1000px) { .ex-layout { grid-template-columns: 1fr; } }
  `],
})
export class UsersExportComponent implements OnDestroy {
  private hotel = inject(HotelService);
  get company(): string { return this.hotel.name; }
  readonly statuses = USER_STATUSES;
  readonly formats: Format[] = ['PDF', 'CSV'];
  readonly when = when; readonly dmy = dmy; readonly dmyTime = dmyTime;
  allUsers: AppUser[] = []; roles: Role[] = []; events: AuditEvent[] = [];
  f = { from: `${dayOffset(0).slice(0, 8)}01`, to: dayOffset(0), role: '', status: '', module: 'sec' };
  inc = { users: true, roles: true, perms: true, audit: true, security: false };
  format: Format = 'PDF';
  tab: Tab = 'users';
  done = '';
  private sub: Subscription;

  constructor(public svc: UsersService, public settings: SettingsService) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles(), svc.getEvents()]).subscribe(([u, r, e]) => { this.allUsers = u; this.roles = r; this.events = e; });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canExport(): boolean { return this.svc.can('Usuarios', 'export'); }
  get auditModules(): string[] { return [...new Set(this.events.map(e => e.module))].sort(); }
  get users(): AppUser[] { return this.inc.users ? this.allUsers.filter(u => (!this.f.role || u.roles.includes(this.f.role)) && (!this.f.status || u.status === this.f.status)) : []; }
  get audit(): AuditEvent[] {
    if (!this.inc.audit) return [];
    const names = new Set(this.allUsers.filter(u => (!this.f.role || u.roles.includes(this.f.role)) && (!this.f.status || u.status === this.f.status)).map(u => u.username));
    const filtered = !!this.f.role || !!this.f.status;
    return this.events.filter(e => e.at.slice(0, 10) >= this.f.from && e.at.slice(0, 10) <= this.f.to
      && (!filtered || names.has(e.user))
      && (!this.f.module || (this.f.module === 'sec' ? e.module === 'Usuarios' || e.module === 'Sesión' : e.module === this.f.module))
      && (!this.inc.security || e.module === 'Sesión' || SECURITY.test(e.action))).reverse();
  }
  get empty(): boolean { return !this.users.length && !this.audit.length && !this.inc.perms; }
  get now(): string { const n = new Date(), p = (x: number) => String(x).padStart(2, '0'); return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`; }
  get fileName(): string {
    const month = new Date(`${this.f.to}T12:00`).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', ' ');
    return `Usuarios y auditoría · ${month}.${this.format.toLowerCase()}`;
  }

  name(u: AppUser): string { return fullName(u); }
  // Configuración › Auditoría: «Ocultar documentos en exportaciones»
  masked(u: AppUser): string { return this.settings.audit.maskDocs ? maskedDoc(u) : docLabel(u); }
  roleNames(u: AppUser): string { return u.roles.map(id => this.roles.find(r => r.id === id)?.name ?? id).join(', '); }
  parentName(r: Role): string { return r.parent ? this.roles.find(x => x.id === r.parent)?.name ?? '' : '—'; }
  eventsOf(u: AppUser): number { return this.events.filter(e => e.user === u.username && e.at.slice(0, 10) >= this.f.from && e.at.slice(0, 10) <= this.f.to).length; }
  permRows(r: Role): { module: string; actions: string }[] {
    const p = this.svc.effective(r.id);
    const rows = MODULES.filter(m => p[m].view).map(m => ({ module: m, actions: ACTIONS.filter(a => p[m][a]).map(a => ACTION_LABEL[a]).join(', ') }));
    return rows.length ? rows : [{ module: '—', actions: 'Sin permisos' }];
  }

  /**
   * PDF: cada sección es una sola tabla (columnas alineadas, encabezado repetido en cada página),
   * en hoja horizontal. El hash de auditoría se acorta (el CSV lo trae completo).
   */
  private pdfHtml(users: AppUser[], audit: AuditEvent[]): string {
    const table = (head: string[], rows: unknown[][], widths: string[], cls = '') =>
      `<table class="${cls}"><colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>
        <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td${typeof c === 'number' ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const parts: string[] = [];
    const filters = [this.f.role ? `rol ${this.roles.find(r => r.id === this.f.role)?.name ?? ''}` : '', this.f.status ? `estado ${this.f.status}` : '',
      this.f.module ? `auditoría de ${this.f.module === 'sec' ? 'Usuarios y Sesión' : this.f.module}` : '', this.inc.security ? 'solo eventos de seguridad' : ''].filter(Boolean);
    parts.push(`<header><div><h1>Usuarios y auditoría</h1><div class="muted">Período ${dmy(this.f.from)} – ${dmy(this.f.to)}${filters.length ? ' · ' + esc(filters.join(' · ')) : ''} · generado ${this.now} por ${esc(this.svc.actor())}</div></div></header>`);
    parts.push(`<table class="small"><tbody><tr><td>Usuarios</td><td class="num">${users.length}</td><td>Roles</td><td class="num">${this.roles.length}</td><td>Eventos de auditoría</td><td class="num">${audit.length}</td></tr></tbody></table>`);
    if (users.length) {
      const head = ['Nombre', 'Usuario', 'Documento', ...(this.inc.roles ? ['Roles'] : []), 'Estado', 'Creado', 'Último acceso', 'Eventos'];
      const widths = this.inc.roles ? ['19%', '12%', '11%', '18%', '9%', '9%', '14%', '8%'] : ['24%', '15%', '13%', '10%', '11%', '17%', '10%'];
      parts.push('<h2>Usuarios</h2>' + table(head, users.map(u => [fullName(u), u.username, this.masked(u), ...(this.inc.roles ? [this.roleNames(u)] : []),
        u.status, dmy(u.createdAt), when(u.lastAccess), this.eventsOf(u)]), widths, 'wrap'));
    }
    if (this.inc.perms) {
      parts.push('<h2>Roles y permisos</h2>' + table(['Rol', 'Hereda de', 'Módulo', 'Permisos efectivos'],
        this.roles.flatMap(r => this.permRows(r).map((p, i) => [i === 0 ? r.name : '', i === 0 ? this.parentName(r) : '', p.module, p.actions])),
        ['22%', '18%', '20%', '40%'], 'wrap'));
    }
    if (audit.length) {
      parts.push('<h2>Auditoría</h2>' + table(['Fecha y hora', 'Usuario', 'Módulo', 'Acción', 'Detalle', 'Resultado', 'IP', 'Hash'],
        audit.map(e => [dmyTime(e.at), e.user, e.module, e.action, e.detail ?? '', e.result, e.ip ?? '', e.hash ? e.hash.slice(0, 10) : '']),
        ['11%', '10%', '9%', '21%', '25%', '8%', '8%', '8%'], 'wrap small'));
    }
    parts.push(`<p class="muted small">${this.settings.audit.maskDocs ? 'Documentos enmascarados: solo los últimos 3 dígitos (Ley 1581 de 2012).' : 'Los documentos se muestran completos (Configuración › Auditoría y respaldos).'}
      El hash completo de cada evento está en la exportación CSV y en Usuarios › Auditoría.</p>`);
    return parts.join('\n');
  }

  run(): void {
    const users = this.users, audit = this.audit;
    const sections: unknown[][] = [[`Usuarios y auditoría · ${this.company}`], [`Período ${dmy(this.f.from)} – ${dmy(this.f.to)} · generado ${this.now} por ${this.svc.actor()}`], []];
    if (users.length) sections.push(['USUARIOS'], ['Nombre', 'Usuario', 'Documento', ...(this.inc.roles ? ['Roles'] : []), 'Estado', 'Creado', 'Último acceso', 'Eventos'],
      ...users.map(u => [fullName(u), u.username, this.masked(u), ...(this.inc.roles ? [this.roleNames(u)] : []), u.status, dmy(u.createdAt), when(u.lastAccess), this.eventsOf(u)]), []);
    if (this.inc.perms) sections.push(['ROLES Y PERMISOS'], ['Rol', 'Hereda de', 'Módulo', 'Permisos efectivos'],
      ...this.roles.flatMap(r => this.permRows(r).map(p => [r.name, this.parentName(r), p.module, p.actions])), []);
    if (audit.length) sections.push(['AUDITORÍA'], ['Evento', 'Fecha y hora', 'Usuario', 'IP', 'Módulo', 'Acción', 'Detalle', 'Resultado', 'Hash'],
      ...audit.map(e => [e.id, e.at.replace('T', ' '), e.user, e.ip, e.module, e.action, e.detail, e.result, e.hash]));
    const content = [users.length && 'Usuarios', this.inc.roles && users.length && 'roles', this.inc.perms && 'permisos', audit.length && `${audit.length} eventos`].filter(Boolean).join(', ');
    if (this.format === 'PDF') openDocument(this.fileName, this.pdfHtml(users, audit), true, { landscape: true });
    else downloadCsvFile(sections, `usuarios-auditoria-${this.f.from}_${this.f.to}.csv`);
    this.svc.logExport(this.fileName, content);
    this.done = `Exportado ${this.fileName}: ${content}. Quedó registrado en auditoría.`;
  }
}
