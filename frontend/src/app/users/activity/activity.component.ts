import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { UsersService } from '../users.service';
import { AuditEvent, AuditResult } from '../users.model';
import { RESULT_BADGE, dmy, dayOffset } from '../users-ui';
import { downloadCsvFile } from '../../shared/documents';

export const ACTION_TYPES = ['Sesión', 'Consulta', 'Registro', 'Modificación', 'Eliminación / anulación', 'Exportación'] as const;
export type ActionType = typeof ACTION_TYPES[number];

/** Tipo de acción según el módulo y el verbo del evento. */
export function actionType(e: Pick<AuditEvent, 'module' | 'action'>): ActionType {
  if (e.module === 'Sesión') return 'Sesión';
  if (/export|descarg/i.test(e.action)) return 'Exportación';
  if (/elimin|anul|desactiv|baja/i.test(e.action)) return 'Eliminación / anulación';
  if (/modific|actualiz|edit|cambi|restablec|asign|desbloq|reactiv|activ|program|confirm|contabiliz|cerr|reabr/i.test(e.action)) return 'Modificación';
  if (/consult|gener|revis/i.test(e.action)) return 'Consulta';
  return 'Registro';
}

interface Unusual { user: string; count: number; from: string; to: string; ip: string; blocked: boolean; }
const PAGE = 20;

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Historial de actividad</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Historial de actividad</h1>
      <p class="kit-sub">Registro de auditoría de todo el sistema · solo lectura: nadie puede editar ni borrar eventos.</p>
    </div>
    <div class="kit-actions"><button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!rows.length || !canExport" (click)="export()">Exportar</button></div>
  </header>

  <section class="kit-card rp-filters ac-filters">
    <label class="kit-select"><span>Usuario</span><select [(ngModel)]="f.user" (ngModelChange)="page = 0"><option value="">Todos</option><option *ngFor="let u of userOptions">{{ u }}</option></select></label>
    <label class="kit-select"><span>Módulo</span><select [(ngModel)]="f.module" (ngModelChange)="page = 0"><option value="">Todos</option><option *ngFor="let m of moduleOptions">{{ m }}</option></select></label>
    <label class="kit-select"><span>Tipo de acción</span><select [(ngModel)]="f.type" (ngModelChange)="page = 0"><option value="">Todas</option><option *ngFor="let t of types">{{ t }}</option></select></label>
    <label class="kit-select"><span>Resultado</span><select [(ngModel)]="f.result" (ngModelChange)="page = 0"><option value="">Todos</option><option>Exitoso</option><option>Denegado</option><option>Fallido</option></select></label>
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="f.from" [max]="f.to" (ngModelChange)="page = 0"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="f.to" [min]="f.from" (ngModelChange)="page = 0"></label>
  </section>

  <div class="kit-banner kit-banner--warn" *ngFor="let x of unusual">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>
    <div><strong>Actividad inusual:</strong> {{ x.count }} intentos fallidos de inicio de sesión de <code class="ur-mono">{{ x.user }}</code> entre {{ x.from.slice(11, 16) }} y {{ x.to.slice(11, 16) }} del {{ x.from.slice(8, 10) }}/{{ x.from.slice(5, 7) }} desde la IP {{ x.ip }}.{{ x.blocked ? ' La cuenta se bloqueó automáticamente.' : '' }}</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="focus(x)">Ver eventos</button>
  </div>

  <div class="ac-layout">
    <section class="kit-card">
      <div class="rp-card-head"><h2 class="kit-card-title">Eventos</h2><span class="rp-muted">{{ rows.length | number }} eventos · ordenados por fecha · página {{ page + 1 }} de {{ pages }}</span></div>
      <div class="kit-table-wrap">
        <table class="kit-table ac-table">
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>IP</th><th>Módulo</th><th>Acción</th><th>Resultado</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of pageRows" [class.sel]="sel?.id === e.id" (click)="sel = e" tabindex="0" (keydown.enter)="sel = e">
              <td>{{ e.at.slice(8, 10) }}/{{ e.at.slice(5, 7) }} {{ e.at.slice(11, 19) }}</td><td><code class="ac-user">{{ e.user }}</code></td><td class="rp-muted">{{ e.ip }}</td>
              <td>{{ e.module }}</td><td>{{ e.action }}</td><td><span class="rsv-badge" [ngClass]="badge[e.result]">{{ e.result }}</span></td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="6" class="kit-empty">No hay eventos con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
      <nav class="ac-pager" *ngIf="pages > 1" aria-label="Páginas">
        <button type="button" [disabled]="page === 0" (click)="page = page - 1">Anterior</button>
        <span>Página {{ page + 1 }} de {{ pages }}</span>
        <button type="button" [disabled]="page >= pages - 1" (click)="page = page + 1">Siguiente</button>
      </nav>
    </section>

    <aside class="kit-card ac-detail" *ngIf="sel as e">
      <div class="rp-card-head"><h2 class="kit-card-title">Detalle del evento</h2><span class="rsv-badge rsv-badge--muted">🔒 Solo lectura</span></div>
      <code class="ur-mono">{{ e.id }}</code>
      <div class="ur-kv"><span>Fecha</span><strong>{{ dmy(e.at) }} {{ e.at.slice(11, 19) }}</strong></div>
      <div class="ur-kv"><span>Usuario</span><strong>{{ e.user }}</strong></div>
      <div class="ur-kv"><span>IP · dispositivo</span><strong>{{ e.ip }} · {{ e.device }}</strong></div>
      <div class="ur-kv"><span>Módulo</span><strong>{{ e.module }}</strong></div>
      <div class="ur-kv"><span>Acción</span><strong>{{ e.action }}</strong></div>
      <div class="ur-kv" *ngIf="e.detail"><span>Detalle</span><strong>{{ e.detail }}</strong></div>
      <div class="ur-kv" *ngIf="e.object"><span>Objeto</span><strong>{{ e.object }}</strong></div>
      <div class="ur-kv"><span>Resultado</span><strong [class.ac-ok]="e.result === 'Exitoso'" [class.ac-bad]="e.result !== 'Exitoso'">{{ e.result }}</strong></div>
      <ng-container *ngIf="e.changes?.length">
        <p class="ac-sub">Cambios</p>
        <div class="ac-changes"><div *ngFor="let c of e.changes"><span>{{ c.label }}</span><span><s>{{ c.before }}</s> → <strong>{{ c.after }}</strong></span></div></div>
      </ng-container>
      <div class="ur-kv" *ngIf="e.reason"><span>Motivo</span><strong>{{ e.reason }}</strong></div>
      <p class="ac-hash">Integridad: hash encadenado {{ e.hash.slice(0, 4) }}…{{ e.hash.slice(-4) }}
        <span [class.ac-ok]="chain.ok" [class.ac-bad]="!chain.ok">{{ chain.ok ? '✓ verificado' : '✗ cadena alterada desde ' + chain.brokenAt }}</span></p>
    </aside>
  </div>
  `,
  styles: [`
    .ac-filters .kit-select { min-width: 120px; }
    .kit-banner .rsv-btn { flex-shrink: 0; background: #fff; }
    .ac-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .ac-table tbody tr { cursor: pointer; }
    .ac-table tbody tr.sel td { background: #F2F7FD; }
    .ac-table tbody tr.sel td:first-child { box-shadow: inset 3px 0 0 #1565C0; }
    .ac-user { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 700; color: #0A2540; }
    .ac-pager { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; font-size: 12.5px; color: #6B7280; }
    .ac-pager button { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid #D5DEEA; background: #fff; font: inherit; font-size: 12.5px; cursor: pointer; }
    .ac-pager button:disabled { opacity: .45; cursor: not-allowed; }
    .ac-detail { position: sticky; top: 100px; border: 1.5px solid #1565C0; }
    .ac-ok { color: #1F8A5B !important; } .ac-bad { color: #C62828 !important; }
    .ac-sub { margin: 12px 0 6px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .ac-changes { background: #F6F8FB; border-radius: 10px; padding: 8px 12px; }
    .ac-changes div { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: 12px; }
    .ac-changes s { color: #C62828; }
    .ac-hash { margin: 12px 0 0; font-size: 11px; color: #6B7280; }
    @media (max-width: 1100px) { .ac-layout { grid-template-columns: 1fr; } .ac-detail { position: static; } }
  `],
})
export class ActivityComponent implements OnDestroy {
  readonly types = ACTION_TYPES;
  readonly badge = RESULT_BADGE;
  readonly dmy = dmy;
  events: AuditEvent[] = [];
  f = { user: '', module: '', type: '', result: '', from: dayOffset(-6), to: dayOffset(0) };
  page = 0;
  sel: AuditEvent | null = null;
  chain: { ok: boolean; brokenAt?: string } = { ok: true };
  userOptions: string[] = [];
  moduleOptions: string[] = [];
  private sub: Subscription;

  constructor(private svc: UsersService, route: ActivatedRoute) {
    const u = route.snapshot.queryParamMap.get('usuario');
    if (u) { this.f.user = u; this.f.from = dayOffset(-30); }
    this.sub = svc.getEvents().subscribe(e => {
      this.events = e;
      this.userOptions = [...new Set(e.map(x => x.user))].sort();
      this.moduleOptions = [...new Set(e.map(x => x.module))].sort();
      this.chain = svc.verifyChain();
      if (!this.sel) this.sel = this.rows[0] ?? null;
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canExport(): boolean { return this.svc.can('Usuarios', 'export'); }
  get rows(): AuditEvent[] {
    const f = this.f;
    return this.events.filter(e => (!f.user || e.user === f.user) && (!f.module || e.module === f.module) && (!f.type || actionType(e) === f.type)
      && (!f.result || e.result === (f.result as AuditResult)) && e.at.slice(0, 10) >= f.from && e.at.slice(0, 10) <= f.to).reverse();
  }
  get pages(): number { return Math.max(1, Math.ceil(this.rows.length / PAGE)); }
  get pageRows(): AuditEvent[] { return this.rows.slice(this.page * PAGE, this.page * PAGE + PAGE); }

  /** Rachas de 3 o más inicios de sesión fallidos de un mismo usuario en 10 minutos, dentro del rango. */
  get unusual(): Unusual[] {
    const fails = this.events.filter(e => e.module === 'Sesión' && e.result === 'Fallido' && e.at.slice(0, 10) >= this.f.from && e.at.slice(0, 10) <= this.f.to);
    const out: Unusual[] = [];
    const byUser = new Map<string, AuditEvent[]>();
    fails.forEach(e => byUser.set(e.user, [...(byUser.get(e.user) ?? []), e]));
    byUser.forEach((list, user) => {
      let start = 0;
      for (let i = 0; i < list.length; i++) {
        while (new Date(list[i].at).getTime() - new Date(list[start].at).getTime() > 10 * 60_000) start++;
        const run = list.slice(start, i + 1);
        const next = list[i + 1];
        const ends = !next || new Date(next.at).getTime() - new Date(list[start].at).getTime() > 10 * 60_000;
        if (run.length >= 3 && ends) {
          out.push({ user, count: run.length, from: run[0].at, to: run[run.length - 1].at, ip: run[run.length - 1].ip, blocked: run.some(x => /bloquead/.test(x.action)) });
          start = i + 1;
        }
      }
    });
    return out;
  }

  focus(x: Unusual): void {
    this.f = { ...this.f, user: x.user, module: 'Sesión', result: '', type: '', from: x.from.slice(0, 10), to: x.to.slice(0, 10) };
    this.page = 0;
    this.sel = this.rows[0] ?? null;
  }

  export(): void {
    const rows = this.rows;
    downloadCsvFile([
      ['Evento', 'Fecha y hora', 'Usuario', 'IP', 'Dispositivo', 'Módulo', 'Acción', 'Detalle', 'Objeto', 'Resultado', 'Motivo', 'Hash'],
      ...rows.map(e => [e.id, e.at.replace('T', ' '), e.user, e.ip, e.device, e.module, e.action, e.detail, e.object ?? '', e.result, e.reason ?? '', e.hash]),
    ], `auditoria-${this.f.from}_${this.f.to}.csv`);
    this.svc.logExport(`Auditoría ${this.f.from} a ${this.f.to}.csv`, `${rows.length} eventos`);
  }
}
