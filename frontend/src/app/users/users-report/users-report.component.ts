import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, AuditEvent, UserStatus, USER_STATUSES, MODULES, fullName } from '../users.model';
import { STATUS_BADGE, when, dmy, dayOffset } from '../users-ui';
import { BarsComponent, DonutComponent, Series, Slice } from '../../reports/charts/charts';
import { svgMarkup } from '../../reports/charts/chart-export';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';

interface Row { u: AppUser; sessions: number; actions: number; modules: number; }
const ROLE_COLORS: Record<string, string> = { admin: '#1565C0', recep: '#0F7A5A', rest: '#9A4B00', aloj: '#B4235A', cont: '#92600A', aux: '#6D3FC8', cons: '#475569', custom: '#0E7490' };
const STATE_COLORS: Record<UserStatus, string> = { Activo: '#2E9D5B', Pendiente: '#D98A0B', Bloqueado: '#C62828', Inactivo: '#9AA5B4' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-users-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BarsComponent, DonutComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Reportes</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de usuarios</h1>
      <p class="kit-sub">Vista previa · cuentas, roles, estados y actividad del {{ dm(a.from) }} al {{ dmy(a.to) }}.</p>
    </div>
    <div class="kit-actions" *ngIf="canExport">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf(false)">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv()" title="Archivo CSV que Excel abre en columnas">Excel (CSV)</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf(true)">Imprimir</button>
    </div>
  </header>

  <section class="kit-card ur-filters">
    <div class="ur-quick" role="group" aria-label="Período rápido">
      <span>Período</span>
      <button type="button" *ngFor="let q of quick" [class.active]="isQuick(q.key)" (click)="setQuick(q.key)">{{ q.label }}</button>
    </div>
    <div class="ur-fields">
      <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="d.from" [max]="d.to"></label>
      <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="d.to" [min]="d.from" [max]="today"></label>
      <label class="kit-select"><span>Rol</span><select [(ngModel)]="d.role"><option value="">Todos</option><option *ngFor="let r of roles" [value]="r.id">{{ r.name }}</option></select></label>
      <label class="kit-select"><span>Estado</span><select [(ngModel)]="d.status"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
      <label class="kit-select"><span>Actividad en</span><select [(ngModel)]="d.module"><option value="">Todos los módulos</option><option *ngFor="let m of modules">{{ m }}</option></select></label>
      <label class="kit-select"><span>Incluir</span><select [(ngModel)]="d.include"><option value="full">Permisos y actividad</option><option value="accounts">Solo cuentas</option></select></label>
    </div>
    <div class="ur-actions">
      <span class="ur-pending" *ngIf="pending">Cambiaste los filtros: pulsa «Generar» para actualizar.</span>
      <span class="rp-muted" *ngIf="!pending">{{ summary }}</span>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="clear()">Limpiar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!d.from || !d.to || d.from > d.to" (click)="generate()">Generar</button>
    </div>
  </section>

  <section class="kit-kpis ur-kpis">
    <div class="ur-kpi"><div><span>Usuarios</span><strong>{{ list.length }}</strong><small>{{ newOnes }} nuevo{{ newOnes === 1 ? '' : 's' }} en el período</small></div></div>
    <div class="ur-kpi"><div><span>Activos</span><strong>{{ countStatus('Activo') }}</strong><small>{{ pct(countStatus('Activo'), list.length) }} del total</small></div></div>
    <div class="ur-kpi"><div><span>Inicios de sesión</span><strong>{{ logins }}</strong><small>Promedio {{ (logins / days) | number:'1.1-1' }} por día</small></div></div>
    <div class="ur-kpi"><div><span>Intentos fallidos</span><strong>{{ failed.length + unknownFailed }}</strong><small>{{ failedNote }}</small></div></div>
    <div class="ur-kpi"><div><span>Cambios de permisos</span><strong>{{ permChanges.length }}</strong><small>{{ rolesTouched }} rol{{ rolesTouched === 1 ? '' : 'es' }} modificado{{ rolesTouched === 1 ? '' : 's' }}</small></div></div>
  </section>

  <div class="ur-charts">
    <section class="kit-card">
      <h2 class="kit-card-title">Usuarios por rol</h2>
      <div class="ur-hbar" *ngFor="let r of byRole"><span class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span>
        <div class="ur-track"><b [style.width.%]="r.count / maxRole * 100" [style.background]="r.hex"></b></div><strong>{{ r.count }}</strong></div>
      <p class="rp-muted ur-note2" *ngIf="multiRole.length">{{ multiRoleNote }}</p>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Estado de las cuentas</h2>
      <div class="ur-donut"><rp-donut [slices]="stateSlices" [center]="'' + list.length" sub="cuentas" aria="Estado de las cuentas"></rp-donut></div>
      <div class="ur-legend"><ng-container *ngFor="let s of stateSlices"><i [style.background]="s.color"></i><span>{{ s.label }}</span><strong>{{ s.value }}</strong><small>{{ pct(s.value, list.length) }}</small></ng-container></div>
    </section>
    <section class="kit-card" id="ur-logins">
      <div class="rp-card-head"><div><h2 class="kit-card-title">Inicios de sesión por día</h2><p class="kit-card-sub">Exitosos y fallidos</p></div>
        <div class="ur-leg2"><span><i style="background:#1565C0"></i>Exitosos</span><span><i style="background:#D98A0B"></i>Fallidos</span></div></div>
      <rp-bars [labels]="dayLabels" [series]="daySeries" valuesShown="none" [tooltip]="dayTip" aria="Inicios de sesión por día"></rp-bars>
    </section>
  </div>

  <section class="kit-card ur-mb" *ngIf="a.include === 'full'">
    <div class="rp-card-head"><h2 class="kit-card-title">Actividad por módulo</h2><span class="rp-muted">Acciones registradas en auditoría en el período</span></div>
    <div class="ur-hbar" *ngFor="let m of byModule"><span>{{ m.module }}</span>
      <div class="ur-track"><b [style.width.%]="m.count / maxModule * 100" style="background:#1565C0"></b></div><strong>{{ m.count }}</strong></div>
    <p class="kit-empty" *ngIf="!byModule.length">Sin actividad registrada en el período.</p>
  </section>

  <section class="kit-card">
    <div class="rp-card-head"><h2 class="kit-card-title">Detalle por usuario</h2><span class="rp-muted">Generado {{ generated }} por {{ svc.actor() }} · registrado en auditoría</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Usuario</th><th>Correo</th><th>Roles</th><th>Estado</th><th>Creado</th><th>Último acceso</th>
          <ng-container *ngIf="a.include === 'full'"><th class="r">Sesiones</th><th class="r">Acciones{{ a.module ? ' · ' + a.module : '' }}</th><th class="r">Módulos con acceso</th></ng-container></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows">
            <td><strong>{{ name(r.u) }}</strong><br><code class="ur-mono">{{ r.u.username }}</code></td><td>{{ r.u.email }}</td>
            <td><div class="ur-roles"><span *ngFor="let x of rolesOf(r.u)" class="ur-role" [ngClass]="'ur-role--' + x.color">{{ x.name }}</span></div></td>
            <td><span class="rsv-badge" [ngClass]="badge[r.u.status]">{{ r.u.status }}</span></td>
            <td>{{ dmy(r.u.createdAt) }}</td><td>{{ when(r.u.lastAccess) }}</td>
            <ng-container *ngIf="a.include === 'full'"><td class="r">{{ r.sessions }}</td><td class="r">{{ r.actions }}</td><td class="r">{{ r.modules }} de {{ modules.length }}</td></ng-container>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="9" class="kit-empty">No hay usuarios con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  `,
  styles: [`
    .ur-filters { margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
    .ur-quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
    .ur-quick > span { font-weight: 600; color: #374151; margin-right: 4px; }
    .ur-quick button { height: 32px; padding: 0 14px; border: 1px solid #D5DEEA; border-radius: 999px; background: #fff; font: inherit; font-size: 12.5px; color: #1F2937; cursor: pointer; }
    .ur-quick button.active { background: #0A3D6D; border-color: #0A3D6D; color: #fff; }
    .ur-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .ur-fields .kit-select { min-width: 0; }
    .ur-actions { display: flex; align-items: center; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .ur-actions > span { margin-right: auto; font-size: 12.5px; }
    .ur-actions .rsv-btn { height: 40px; }
    .ur-pending { color: #B45309; font-weight: 600; }
    .ur-mb { margin-bottom: 16px; }
    .ur-kpis { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .ur-charts { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 16px; margin-bottom: 16px; }
    .ur-hbar { display: grid; grid-template-columns: 150px 1fr 24px; gap: 10px; align-items: center; padding: 6px 0; }
    .ur-hbar .ur-role { width: fit-content; }
    .ur-hbar strong { text-align: right; font-size: 13px; color: #0A2540; }
    .ur-track { height: 9px; background: #EEF2F7; border-radius: 999px; overflow: hidden; }
    .ur-track b { display: block; height: 100%; border-radius: 999px; }
    .ur-note2 { font-size: 11.5px; margin: 8px 0 0; }
    .ur-donut { max-width: 180px; margin: 0 auto 10px; }
    .ur-legend { display: grid; grid-template-columns: auto 1fr auto auto; gap: 6px 10px; align-items: center; font-size: 12.5px; }
    .ur-legend i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
    .ur-legend small { color: #6B7280; text-align: right; }
    .ur-leg2 { display: flex; gap: 12px; font-size: 12px; }
    .ur-leg2 i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; }
    th.r, td.r { text-align: right; }
    @media (max-width: 1150px) { .ur-charts { grid-template-columns: 1fr; } }
  `],
})
export class UsersReportComponent implements OnDestroy {
  readonly statuses = USER_STATUSES;
  /** Módulos activos de SOGO (el restaurante se retiró: el hospedaje no vende comidas). */
  readonly modules = MODULES.filter(m => m !== 'Restaurante');
  readonly today = dayOffset(0);
  readonly quick = [
    { key: 'today', label: 'Hoy' }, { key: '7', label: 'Últimos 7 días' }, { key: '30', label: 'Últimos 30 días' },
    { key: 'month', label: 'Este mes' }, { key: 'prev', label: 'Mes anterior' },
  ];
  readonly badge = STATUS_BADGE; readonly when = when; readonly dmy = dmy;
  readonly dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

  users: AppUser[] = []; roles: Role[] = []; events: AuditEvent[] = [];
  d = { from: dayOffset(-6), to: dayOffset(0), role: '', status: '', module: '', include: 'full' };
  a = { ...this.d };
  generated = '';
  private sub: Subscription;

  constructor(public svc: UsersService) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles(), svc.getEvents()]).subscribe(([u, r, e]) => { this.users = u; this.roles = r; this.events = e; });
    this.stamp();
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canExport(): boolean { return this.svc.can('Usuarios', 'export'); }
  get list(): AppUser[] { return this.users.filter(u => (!this.a.role || u.roles.includes(this.a.role)) && (!this.a.status || u.status === this.a.status)); }
  private get inRange(): AuditEvent[] { return this.events.filter(e => e.at.slice(0, 10) >= this.a.from && e.at.slice(0, 10) <= this.a.to); }
  private get names(): Set<string> { return new Set(this.list.map(u => u.username)); }
  get days(): number { return Math.round((new Date(`${this.a.to}T12:00`).getTime() - new Date(`${this.a.from}T12:00`).getTime()) / 86_400_000) + 1; }
  get logins(): number { return this.inRange.filter(e => this.names.has(e.user) && e.module === 'Sesión' && e.result === 'Exitoso' && e.action.startsWith('Inici')).length; }
  get failed(): AuditEvent[] { return this.inRange.filter(e => this.names.has(e.user) && e.module === 'Sesión' && e.result === 'Fallido'); }
  /** Intentos con usuarios que no existen en SOGO (posibles accesos indebidos). */
  get unknownFailed(): number {
    const known = new Set(this.users.map(u => u.username));
    return this.a.role || this.a.status ? 0 : this.inRange.filter(e => e.module === 'Sesión' && e.result === 'Fallido' && !known.has(e.user)).length;
  }
  get failedNote(): string {
    const by = new Map<string, number>(); this.failed.forEach(e => by.set(e.user, (by.get(e.user) ?? 0) + 1));
    const top = [...by].sort((x, y) => y[1] - x[1])[0];
    const unknown = this.unknownFailed ? ` · ${this.unknownFailed} con usuario inexistente` : '';
    return (top ? `${top[1]} de ${top[0]}` : this.unknownFailed ? 'Ninguno de usuarios registrados' : 'Ninguno') + unknown;
  }

  /** Acciones por módulo (sin las de sesión) de los usuarios filtrados. */
  get byModule(): { module: string; count: number }[] {
    const names = this.names;
    const by = new Map<string, number>();
    this.inRange.filter(e => names.has(e.user) && e.module !== 'Sesión' && (!this.a.module || e.module === this.a.module))
      .forEach(e => by.set(e.module, (by.get(e.module) ?? 0) + 1));
    return [...by].map(([module, count]) => ({ module, count })).sort((x, y) => y.count - x.count);
  }
  get maxModule(): number { return Math.max(1, ...this.byModule.map(m => m.count)); }

  // ── Filtros ──
  get pending(): boolean { return JSON.stringify(this.d) !== JSON.stringify(this.a); }
  get summary(): string {
    const parts = [`${dmy(this.a.from)} – ${dmy(this.a.to)}`, `${this.list.length} usuario${this.list.length === 1 ? '' : 's'}`];
    if (this.a.role) parts.push(this.roles.find(r => r.id === this.a.role)?.name ?? '');
    if (this.a.status) parts.push(this.a.status);
    if (this.a.module) parts.push(`actividad en ${this.a.module}`);
    return parts.join(' · ');
  }
  private range(key: string): { from: string; to: string } {
    const today = dayOffset(0);
    if (key === 'today') return { from: today, to: today };
    if (key === '7') return { from: dayOffset(-6), to: today };
    if (key === '30') return { from: dayOffset(-29), to: today };
    const n = new Date(), pad = (x: number) => String(x).padStart(2, '0');
    if (key === 'month') return { from: `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`, to: today };
    const first = new Date(n.getFullYear(), n.getMonth() - 1, 1), last = new Date(n.getFullYear(), n.getMonth(), 0);
    return { from: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`, to: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}` };
  }
  isQuick(key: string): boolean { const r = this.range(key); return r.from === this.d.from && r.to === this.d.to; }
  setQuick(key: string): void { this.d = { ...this.d, ...this.range(key) }; this.generate(); }
  clear(): void { this.d = { from: dayOffset(-6), to: dayOffset(0), role: '', status: '', module: '', include: 'full' }; this.generate(); }
  get permChanges(): AuditEvent[] { return this.inRange.filter(e => e.module === 'Usuarios' && e.action.startsWith('Modificó permisos')); }
  get rolesTouched(): number { return new Set(this.permChanges.map(e => e.object)).size; }
  get newOnes(): number { return this.list.filter(u => u.createdAt.slice(0, 10) >= this.a.from && u.createdAt.slice(0, 10) <= this.a.to).length; }
  countStatus(s: UserStatus): number { return this.list.filter(u => u.status === s).length; }
  pct(n: number, total: number): string { return total ? `${(n / total * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %` : '0 %'; }

  get byRole() {
    return this.roles.map(r => ({ name: r.name, color: r.color, hex: ROLE_COLORS[r.color] ?? '#0E7490', count: this.list.filter(u => u.roles.includes(r.id)).length }))
      .filter(r => r.count || !this.a.role).sort((x, y) => y.count - x.count);
  }
  get maxRole(): number { return Math.max(1, ...this.byRole.map(r => r.count)); }
  get multiRole(): AppUser[] { return this.list.filter(u => u.roles.length > 1); }
  get multiRoleNote(): string {
    const total = this.byRole.reduce((s, r) => s + r.count, 0);
    return `${this.multiRole.map(u => u.firstName.split(' ')[0]).join(', ')} tiene${this.multiRole.length > 1 ? 'n' : ''} más de un rol, por eso la suma es ${total}.`;
  }
  get stateSlices(): Slice[] { return USER_STATUSES.map(s => ({ label: s, value: this.countStatus(s), color: STATE_COLORS[s] })); }

  private get dayList(): string[] { return Array.from({ length: this.days }, (_, i) => { const d = new Date(`${this.a.from}T12:00`); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }); }
  get dayLabels(): string[] { return this.dayList.map(d => this.days <= 10 ? `${DAYS[new Date(`${d}T12:00`).getDay()]} ${+d.slice(8)}` : d.slice(8)); }
  get daySeries(): Series[] {
    const count = (d: string, ok: boolean) => this.inRange.filter(e => this.names.has(e.user) && e.module === 'Sesión' && e.at.startsWith(d)
      && (ok ? e.result === 'Exitoso' && e.action.startsWith('Inici') : e.result === 'Fallido')).length;
    return [{ name: 'Exitosos', color: '#1565C0', values: this.dayList.map(d => count(d, true)) }, { name: 'Fallidos', color: '#D98A0B', values: this.dayList.map(d => count(d, false)) }];
  }
  readonly dayTip = (i: number) => { const s = this.daySeries; return [dmy(this.dayList[i]), `${s[0].values[i]} exitosos · ${s[1].values[i]} fallidos`]; };

  get rows(): Row[] {
    const range = this.inRange;
    return this.list.map(u => ({
      u, modules: this.svc.modulesWithAccess(u).length,
      sessions: range.filter(e => e.user === u.username && e.module === 'Sesión' && e.result === 'Exitoso' && e.action.startsWith('Inici')).length,
      actions: range.filter(e => e.user === u.username && e.module !== 'Sesión' && (!this.a.module || e.module === this.a.module)).length,
    }));
  }

  name(u: AppUser): string { return fullName(u); }
  rolesOf(u: AppUser): Role[] { return u.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }

  private stamp(): void { const n = new Date(), p = (x: number) => String(x).padStart(2, '0'); this.generated = `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`; }

  generate(): void {
    this.a = { ...this.d };
    this.stamp();
    this.svc.addLog('Usuarios: generó reporte de usuarios', `${dmy(this.a.from)} – ${dmy(this.a.to)} · ${this.list.length} usuarios`);
  }

  private table(): unknown[][] {
    const full = this.a.include === 'full';
    return [
      ['Usuario', 'Nombre', 'Correo', 'Roles', 'Estado', 'Creado', 'Último acceso', ...(full ? ['Sesiones', 'Acciones', 'Módulos con acceso'] : [])],
      ...this.rows.map(r => [r.u.username, fullName(r.u), r.u.email, this.rolesOf(r.u).map(x => x.name).join(', '), r.u.status, dmy(r.u.createdAt), when(r.u.lastAccess),
        ...(full ? [r.sessions, r.actions, `${r.modules} de ${MODULES.length}`] : [])]),
    ];
  }

  csv(): void {
    downloadCsvFile([[`Reporte de usuarios · ${dmy(this.a.from)} – ${dmy(this.a.to)}`], [this.summary], [], ['Usuarios', this.list.length], ['Activos', this.countStatus('Activo')],
      ['Inicios de sesión', this.logins], ['Intentos fallidos', this.failed.length + this.unknownFailed], ['Cambios de permisos', this.permChanges.length], [], ...this.table()],
      `reporte-usuarios-${this.a.from}_${this.a.to}.csv`);
    this.svc.logExport('Reporte de usuarios.csv', `${this.list.length} usuarios · ${dmy(this.a.from)} – ${dmy(this.a.to)}`);
  }

  pdf(print: boolean): void {
    const host = document.querySelector('#ur-logins');
    const t = this.table();
    openDocument('Reporte de usuarios', `
      <header><div><h1>Reporte de usuarios</h1><div class="muted">${esc(this.summary)} · generado ${this.generated} por ${esc(this.svc.actor())}</div></div></header>
      <table><tbody><tr><td>Usuarios</td><td class="r">${this.list.length}</td><td>Activos</td><td class="r">${this.countStatus('Activo')}</td></tr>
      <tr><td>Inicios de sesión</td><td class="r">${this.logins}</td><td>Intentos fallidos</td><td class="r">${this.failed.length + this.unknownFailed}</td></tr>
      <tr><td>Cambios de permisos</td><td class="r">${this.permChanges.length}</td><td>Pendientes / bloqueados / inactivos</td><td class="r">${this.countStatus('Pendiente')} / ${this.countStatus('Bloqueado')} / ${this.countStatus('Inactivo')}</td></tr></tbody></table>
      ${host ? `<h2>Inicios de sesión por día</h2>${svgMarkup(host, 700)}` : ''}
      <h2>Detalle por usuario</h2><table><thead><tr>${(t[0] as string[]).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${t.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`, print);
    this.svc.logExport('Reporte de usuarios.pdf', `${this.list.length} usuarios · ${dmy(this.a.from)} – ${dmy(this.a.to)}`);
  }
}
