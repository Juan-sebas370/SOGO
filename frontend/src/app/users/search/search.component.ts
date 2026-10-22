import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, AuditEvent, UserStatus, fullName, initials, docLabel } from '../users.model';
import { STATUS_BADGE, avatarColor, when, dmy, fold, dayOffset } from '../users-ui';

interface Hit { u: AppUser; fields: string[]; }
interface Part { pre: string; hit: string; post: string; }

@Component({
  selector: 'app-user-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Buscar usuarios</span></nav>
  <header class="kit-head"><h1 class="kit-title">Buscar usuarios</h1></header>

  <label class="us-box">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input type="search" [(ngModel)]="q" (ngModelChange)="run()" placeholder="Escribe un nombre, usuario, documento, correo o rol" aria-label="Buscar usuarios" autofocus>
    <span>Busca por nombre, apellido, usuario, documento, correo o rol · {{ hits.length }} resultado{{ hits.length === 1 ? '' : 's' }} en {{ ms }} ms</span>
  </label>

  <div class="us-layout">
    <aside class="kit-card us-filters" aria-label="Filtros">
      <h2 class="kit-card-title">Filtros</h2>
      <p class="us-label">Rol</p>
      <label class="us-check" *ngFor="let r of roles"><input type="checkbox" [checked]="roleSel.has(r.id)" (change)="toggle(roleSel, r.id)"> {{ r.name }} ({{ roleCount(r.id) }})</label>
      <div class="us-sep"></div>
      <p class="us-label">Estado</p>
      <label class="us-check" *ngFor="let s of statusGroups"><input type="checkbox" [checked]="statusSel.has(s.key)" (change)="toggle(statusSel, s.key)"> {{ s.label }} ({{ statusCount(s.states) }})</label>
      <div class="us-sep"></div>
      <label class="kit-select"><span>Fecha de creación</span><select [(ngModel)]="created" (ngModelChange)="run()">
        <option value="">Cualquiera</option><option value="30">Últimos 30 días</option><option value="365">Último año</option><option value="old">Hace más de un año</option></select></label>
      <label class="kit-select us-mt"><span>Último acceso</span><select [(ngModel)]="access" (ngModelChange)="run()">
        <option value="">Cualquiera</option><option value="today">Hoy</option><option value="7">Últimos 7 días</option><option value="30+">Hace más de 30 días</option><option value="never">Nunca</option></select></label>
      <button type="button" class="rsv-btn rsv-btn--outline us-clear" (click)="clear()">Limpiar filtros</button>
    </aside>

    <section class="us-results">
      <button type="button" class="us-card" *ngFor="let h of hits" [class.active]="selected?.id === h.u.id" (click)="select(h.u)">
        <span class="ur-avatar ur-avatar--lg" [style.background]="color(h.u)">{{ ini(h.u) }}</span>
        <div class="us-main">
          <div><strong>{{ name(h.u) }}</strong> <code class="ur-mono">{{ h.u.username }}</code></div>
          <p><ng-container *ngIf="mark(h.u.email) as m">{{ m.pre }}<mark>{{ m.hit }}</mark>{{ m.post }}</ng-container> · {{ doc(h.u) }}</p>
          <div class="ur-roles"><span *ngFor="let r of rolesOf(h.u)" class="ur-role" [ngClass]="'ur-role--' + r.color"><ng-container *ngIf="mark(r.name) as m">{{ m.pre }}<mark>{{ m.hit }}</mark>{{ m.post }}</ng-container></span>
            <small *ngIf="q.trim()">· Coincide en {{ h.fields.join(' y ') }}</small></div>
        </div>
        <div class="us-side"><span class="rsv-badge" [ngClass]="badge[h.u.status]">{{ h.u.status }}</span><small>Último acceso: {{ when(h.u.lastAccess) }}</small></div>
      </button>
      <div class="ur-empty" *ngIf="!hits.length">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/></svg>
        <div><strong>Sin resultados</strong>«No se encontraron usuarios para "{{ q.trim() || 'los filtros' }}". Revisa el texto o los filtros aplicados.»</div>
      </div>
    </section>

    <aside class="kit-card us-preview" *ngIf="selected as u">
      <div class="ur-user"><span class="ur-avatar ur-avatar--lg" [style.background]="color(u)">{{ ini(u) }}</span><div><strong class="us-name">{{ name(u) }}</strong><code>{{ u.username }}</code></div></div>
      <div class="ur-roles us-mt"><span *ngFor="let r of rolesOf(u)" class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span></div>
      <div class="us-mt">
        <div class="ur-kv"><span>Estado</span><strong [class.us-ok]="u.status === 'Activo'">{{ u.status }}</strong></div>
        <div class="ur-kv"><span>Correo</span><strong>{{ u.email }}</strong></div>
        <div class="ur-kv"><span>Documento</span><strong>{{ doc(u) }}</strong></div>
        <div class="ur-kv"><span>Cargo</span><strong>{{ u.position || '—' }}</strong></div>
        <div class="ur-kv"><span>Creado</span><strong>{{ dmy(u.createdAt) }}</strong></div>
        <div class="ur-kv"><span>Último acceso</span><strong>{{ when(u.lastAccess) }}{{ u.lastIp ? ' · ' + u.lastIp : '' }}</strong></div>
      </div>
      <p class="us-label">Actividad reciente</p>
      <div class="us-act" *ngFor="let e of recent"><span>{{ e.at.slice(11, 16) }}</span><span>{{ e.action }}</span></div>
      <p class="rp-muted" *ngIf="!recent.length">Sin actividad registrada.</p>
      <div class="us-btns">
        <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/users', u.id]">Ver detalle</a>
        <a class="rsv-btn rsv-btn--primary" [routerLink]="['/dashboard/users', u.id]" [queryParams]="{ tab: 'editar' }" *ngIf="canEdit">Editar</a>
      </div>
    </aside>
  </div>
  `,
  styles: [`
    .us-box { display: flex; align-items: center; gap: 12px; background: #fff; border: 2px solid #1565C0; border-radius: 14px; padding: 0 18px; height: 58px; margin-bottom: 18px; }
    .us-box svg { width: 20px; height: 20px; fill: none; stroke: #0A2540; stroke-width: 2; flex-shrink: 0; }
    .us-box input { flex: 1; border: none; outline: none; font: inherit; font-size: 16px; font-weight: 600; color: #0A2540; background: transparent; min-width: 0; }
    .us-box span { font-size: 12px; color: #6B7280; text-align: right; }
    .us-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .us-label { margin: 10px 0 6px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .us-check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12.5px; color: #1F2937; cursor: pointer; }
    .us-check input { accent-color: #1565C0; width: 16px; height: 16px; }
    .us-sep { border-top: 1px solid #EEF1F5; margin: 10px 0; }
    .us-filters .kit-select { min-width: 0; }
    .us-mt { margin-top: 10px; }
    .us-clear { width: 100%; margin-top: 12px; }
    .us-results { display: flex; flex-direction: column; gap: 10px; }
    .us-card { display: flex; gap: 14px; align-items: center; text-align: left; width: 100%; background: #fff; border: 1px solid #E6EBF2; border-radius: 14px; padding: 14px 16px; font: inherit; cursor: pointer; }
    .us-card.active { border: 2px solid #1565C0; background: #F7FAFE; padding: 13px 15px; }
    .us-main { flex: 1; min-width: 0; font-size: 12.5px; color: #4B5563; }
    .us-main strong { font-size: 14px; color: #0A2540; }
    .us-main p { margin: 3px 0 6px; }
    .us-main small { font-size: 11.5px; color: #6B7280; margin-left: 4px; }
    .us-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 11px; color: #6B7280; text-align: right; }
    mark { background: #FDE68A; color: inherit; border-radius: 2px; padding: 0 1px; }
    .us-preview { position: sticky; top: 100px; border: 1.5px solid #1565C0; }
    .us-name { font-size: 16px !important; }
    .us-ok { color: #1F8A5B !important; }
    .us-act { display: grid; grid-template-columns: 50px 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid #EEF1F5; font-size: 12px; color: #374151; }
    .us-act span:first-child { color: #6B7280; }
    .us-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
    .us-btns .rsv-btn { justify-content: center; }
    @media (max-width: 1200px) { .us-layout { grid-template-columns: 220px minmax(0, 1fr); } .us-preview { grid-column: 1 / -1; position: static; } }
    @media (max-width: 760px) { .us-layout { grid-template-columns: 1fr; } .us-box span { display: none; } }
  `],
})
export class UserSearchComponent implements OnDestroy {
  readonly badge = STATUS_BADGE;
  readonly when = when; readonly dmy = dmy;
  readonly statusGroups: { key: string; label: string; states: UserStatus[] }[] = [
    { key: 'a', label: 'Activo', states: ['Activo'] }, { key: 'p', label: 'Pendiente', states: ['Pendiente'] },
    { key: 'i', label: 'Inactivo / Bloqueado', states: ['Inactivo', 'Bloqueado'] },
  ];

  users: AppUser[] = [];
  roles: Role[] = [];
  events: AuditEvent[] = [];
  q = '';
  roleSel = new Set<string>();
  statusSel = new Set<string>();
  created = ''; access = '';
  hits: Hit[] = [];
  base: Hit[] = [];
  selected: AppUser | null = null;
  ms = '0';
  private sub: Subscription;

  constructor(private svc: UsersService) {
    this.sub = combineLatest([svc.getUsers(), svc.getRoles(), svc.getEvents()]).subscribe(([u, r, e]) => {
      this.users = u; this.roles = r; this.events = e;
      if (this.selected) this.selected = u.find(x => x.id === this.selected!.id) ?? null;
      this.run();
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get recent(): AuditEvent[] { return this.selected ? this.events.filter(e => e.user === this.selected!.username).slice(-3).reverse() : []; }
  name(u: AppUser): string { return fullName(u); }
  ini(u: AppUser): string { return initials(u); }
  color(u: AppUser): string { return avatarColor(u); }
  doc(u: AppUser): string { return docLabel(u); }
  rolesOf(u: AppUser): Role[] { return u.roles.map(id => this.roles.find(r => r.id === id)).filter((r): r is Role => !!r); }
  /** Conteos de los filtros sobre los resultados del texto (sin los demás filtros). */
  roleCount(id: string): number { return this.base.filter(h => h.u.roles.includes(id)).length; }
  statusCount(states: UserStatus[]): number { return this.base.filter(h => states.includes(h.u.status)).length; }

  toggle(set: Set<string>, key: string): void { set.has(key) ? set.delete(key) : set.add(key); this.run(); }
  clear(): void { this.roleSel.clear(); this.statusSel.clear(); this.created = ''; this.access = ''; this.run(); }
  select(u: AppUser): void { this.selected = u; }

  /** Parte el texto alrededor de la coincidencia (sin tildes ni mayúsculas). */
  mark(text: string): Part {
    const q = fold(this.q.trim());
    const folded = [...text].map(c => fold(c)).join('');
    const i = q ? folded.indexOf(q) : -1;
    return i < 0 ? { pre: text, hit: '', post: '' } : { pre: text.slice(0, i), hit: text.slice(i, i + q.length), post: text.slice(i + q.length) };
  }

  run(): void {
    const t0 = performance.now();
    const q = fold(this.q.trim());
    const qDigits = this.q.replace(/\D/g, '');
    this.base = this.users.map(u => {
      const fields: string[] = [];
      if (!q) return { u, fields };
      if (fold(fullName(u)).includes(q)) fields.push('nombre');
      if (fold(u.username).includes(q)) fields.push('usuario');
      if (qDigits.length >= 3 && u.docNumber.includes(qDigits)) fields.push('documento');
      if (fold(u.email).includes(q)) fields.push('correo');
      if (this.rolesOf(u).some(r => fold(r.name).includes(q))) fields.push('rol');
      return { u, fields };
    }).filter(h => !q || h.fields.length);
    const states = this.statusGroups.filter(g => this.statusSel.has(g.key)).flatMap(g => g.states);
    const today = dayOffset(0);
    this.hits = this.base.filter(({ u }) => (!this.roleSel.size || u.roles.some(r => this.roleSel.has(r))) && (!states.length || states.includes(u.status))
      && (!this.created || (this.created === 'old' ? u.createdAt < dayOffset(-365) : u.createdAt.slice(0, 10) >= dayOffset(-+this.created)))
      && (!this.access || (this.access === 'never' ? !u.lastAccess : !u.lastAccess ? false
        : this.access === 'today' ? u.lastAccess.startsWith(today) : this.access === '7' ? u.lastAccess >= dayOffset(-7) : u.lastAccess < dayOffset(-30))));
    if (!this.selected || !this.hits.some(h => h.u.id === this.selected!.id)) this.selected = this.hits[0]?.u ?? null;
    this.ms = (performance.now() - t0).toFixed(1).replace('.', ',');
  }
}
