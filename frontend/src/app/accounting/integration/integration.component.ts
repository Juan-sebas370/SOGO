import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService, IntegrationRun } from '../accounting.service';
import { ReviewItem } from '../integration';
import { activeAccounts, periodName, COST_CENTERS, CostCenter } from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { dmy } from '../accounting-format';

interface ModuleCard { name: string; desc: string; count: number; state: string; tone: 'ok' | 'warn' | 'muted'; }

/** Categorías de consumo que llegan de Reservas y Alojamiento (cuenta de ingreso de cada una). */
const CATEGORIES = ['Alojamiento', 'Eventos y pasadías', 'Lavandería', 'Minibar', 'Daños y faltantes', 'Otro'];

@Component({
  selector: 'app-accounting-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Integración financiera</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Integración de información financiera</h1>
      <p class="kit-sub">Cada movimiento de los módulos genera su asiento y se guarda en la base de datos.
        {{ svc.lastSync ? 'Última sincronización: ' + dmy(svc.lastSync) + ' ' + svc.lastSync.slice(11, 16) + '.' : '' }}</p>
    </div>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="running || !svc.canEdit || !!svc.loadError" (click)="run()">
      <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>{{ running ? 'Integrando…' : 'Integrar ahora' }}
    </button>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="svc.loadError" role="alert"><div>{{ svc.loadError }}</div></div>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert"><div>{{ error }}</div></div>
  <div class="kit-banner kit-banner--ok" *ngIf="done" role="status"><div>{{ done }}</div></div>

  <section class="kit-card int-setup">
    <div class="acc-head-row"><h2 class="kit-card-title">Contabilidad en SOGO</h2>
      <span class="rsv-badge" [ngClass]="svc.hasOpening ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ svc.hasOpening ? 'Saldos iniciales registrados' : 'Faltan saldos iniciales' }}</span></div>
    <div class="int-setup-grid">
      <label class="kit-field">Inicio de la contabilidad
        <input class="rsv-input" type="date" [(ngModel)]="start" [max]="today" [disabled]="!svc.canEdit">
        <small class="kit-muted">Desde esta fecha se integran los módulos; lo anterior entra con los saldos iniciales.</small></label>
      <label class="kit-field">Meses cerrados hasta
        <select class="rsv-input" [(ngModel)]="closed" [disabled]="!svc.canEdit">
          <option value="">Ninguno (todo abierto)</option>
          <option *ngFor="let p of closable" [value]="p">{{ name(p) }}</option>
        </select>
        <small class="kit-muted">En un mes cerrado no se registra, cambia ni anula nada (tampoco por integración).</small></label>
      <div class="int-setup-actions">
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!svc.canEdit || saving || !setupDirty" (click)="saveSetup()">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/accounting/movement" [queryParams]="{ tipo: 'apertura' }" *ngIf="!svc.hasOpening && svc.canCreate">Registrar saldos iniciales</a>
      </div>
    </div>
  </section>

  <section class="int-cards">
    <article class="kit-card int-card" *ngFor="let m of cards">
      <div class="int-card-top">
        <span class="int-icon" [ngSwitch]="m.name">
          <svg *ngSwitchCase="'Reservas'" viewBox="0 0 24 24"><path d="M4 7h16M7 11h10M6 15h12"/></svg>
          <svg *ngSwitchCase="'Alojamiento'" viewBox="0 0 24 24"><path d="M3 21V7l9-4 9 4v14M7 10h10M7 15h10"/></svg>
          <svg *ngSwitchCase="'Facturación'" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <svg *ngSwitchCase="'Nómina'" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <svg *ngSwitchDefault viewBox="0 0 24 24"><path d="M21 16V8l-9-5-9 5v8l9 5z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>
        </span>
        <span class="rsv-badge" [ngClass]="m.tone === 'ok' ? 'rsv-badge--ok' : m.tone === 'warn' ? 'rsv-badge--warn' : 'rsv-badge--muted'">{{ m.state }}</span>
      </div>
      <h3>{{ m.name }}</h3>
      <p>{{ m.desc }}</p>
      <div><strong>{{ m.count }}</strong> <span>asientos en {{ monthShort }}</span></div>
    </article>
  </section>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="acc-head-row">
      <h2 class="kit-card-title">Observaciones de la integración</h2>
      <div class="int-badges">
        <span class="rsv-badge rsv-badge--ok">{{ integratedCount }} asientos integrados vigentes</span>
        <span class="rsv-badge rsv-badge--muted" *ngIf="svc.duplicates.length">{{ svc.duplicates.length }} duplicados omitidos</span>
        <span class="rsv-badge rsv-badge--warn">{{ svc.review.length + svc.integrationErrors.length }} por revisar</span>
      </div>
    </div>

    <div class="kit-banner kit-banner--warn" *ngFor="let r of svc.review">
      <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div><strong>{{ r.title }}</strong>{{ r.detail }}</div>
      <ng-container *ngIf="r.action === 'map' && svc.canEdit">
        <select class="rsv-input int-map" [(ngModel)]="choice[r.category!]" [attr.aria-label]="'Cuenta para ' + r.category">
          <option value="">Elige la cuenta…</option><option *ngFor="let a of incomeAccounts" [value]="a.code">{{ a.code }} · {{ a.name }}</option></select>
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!choice[r.category!] || saving" (click)="assign(r)">Asignar cuenta</button>
      </ng-container>
      <a *ngIf="r.action === 'payroll'" class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/liquidation">Ir a Nómina</a>
    </div>
    <div class="kit-banner kit-banner--danger" *ngIf="svc.integrationErrors.length">
      <div><strong>{{ svc.integrationErrors.length }} asiento(s) que el servidor no pudo guardar</strong>
        <ul class="int-dups"><li *ngFor="let e of svc.integrationErrors">{{ e }}</li></ul></div>
    </div>
    <div class="kit-banner kit-banner--info" *ngIf="svc.duplicates.length">
      <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <div><strong>{{ svc.duplicates.length }} registros duplicados omitidos</strong>
        Consumos incluidos en facturas que ya estaban contabilizados desde Alojamiento. No se registraron dos veces.
        <ul *ngIf="showDup" class="int-dups"><li *ngFor="let d of svc.duplicates">{{ d }}</li></ul></div>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="showDup = !showDup">{{ showDup ? 'Ocultar' : 'Ver detalle' }}</button>
    </div>
    <p class="kit-muted" *ngIf="!svc.review.length && !svc.duplicates.length && !svc.integrationErrors.length">Todo al día: no hay observaciones.</p>
  </section>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="acc-head-row"><h2 class="kit-card-title">Cuenta de ingreso por categoría</h2><span class="kit-muted">Estadías y consumos de Reservas y Alojamiento</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Categoría</th><th>Cuenta contable</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of categories">
            <td><strong>{{ c }}</strong></td>
            <td><select class="rsv-input int-map-wide" [(ngModel)]="mapping[c]" [disabled]="!svc.canEdit" [attr.aria-label]="'Cuenta de ' + c">
              <option value="">Sin asignar (queda por revisar)</option><option *ngFor="let a of incomeAccounts" [value]="a.code">{{ a.code }} · {{ a.name }}</option></select></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="int-setup-actions" style="margin-top: 12px">
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!svc.canEdit || saving || !mappingDirty" (click)="saveMapping()">Guardar cuentas</button>
    </div>
  </section>

  <div class="int-two">
    <section class="kit-card">
      <h2 class="kit-card-title">Datos del hospedaje en los comprobantes</h2>
      <p class="kit-card-sub">Salen en el encabezado de cada recibo de caja, egreso y nota, con el logo del hospedaje. Se editan en un solo lugar para todo SOGO.</p>
      <dl class="int-issuer-view">
        <div><dt>Nombre</dt><dd>{{ svc.issuer.nombre || '—' }}</dd></div>
        <div><dt>Propietario / razón social</dt><dd>{{ svc.issuer.propietario || '—' }}</dd></div>
        <div><dt>NIT</dt><dd [class.int-missing]="!svc.issuer.nit">{{ svc.issuer.nit || 'Pendiente' }}</dd></div>
        <div><dt>Dirección</dt><dd>{{ svc.issuer.direccion || '—' }}</dd></div>
        <div><dt>Teléfono</dt><dd>{{ svc.issuer.telefono || '—' }}</dd></div>
      </dl>
      <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/settings">Editar en Datos del hospedaje</a>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Centros de costo</h2>
      <p class="kit-card-sub">Cada línea de un comprobante lleva su centro de costo. No se eliminan: se desactivan.</p>
      <table class="kit-table">
        <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of centers">
            <td class="kit-mono">{{ c.code }}</td>
            <td><input class="rsv-input int-cc-name" [(ngModel)]="c.name" maxlength="80" [disabled]="!svc.canEdit" (change)="saveCenter(c)" [attr.aria-label]="'Nombre de ' + c.code"></td>
            <td><label class="int-cc-active"><input type="checkbox" [(ngModel)]="c.active" [disabled]="!svc.canEdit" (change)="saveCenter(c)"> Activo</label></td>
          </tr>
        </tbody>
      </table>
      <div class="int-cc-add" *ngIf="svc.canEdit">
        <input class="rsv-input" [(ngModel)]="newCenter" placeholder="Nombre del nuevo centro (ej.: Eventos)" maxlength="80" aria-label="Nuevo centro de costo">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="newCenter.trim().length < 3 || saving" (click)="addCenter()">+ {{ nextCenterCode }}</button>
      </div>
    </section>
  </div>

  <section class="kit-card">
    <div class="acc-head-row"><h2 class="kit-card-title">Historial de integraciones</h2><span class="kit-muted">Las automáticas se guardan cuando crean, actualizan o anulan algo</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Usuario</th><th class="r">Vigentes</th><th class="r">Nuevos</th><th class="r">Actualizados</th><th class="r">Anulados</th><th class="r">Mes cerrado</th><th>Resultado</th></tr></thead>
        <tbody>
          <tr *ngFor="let h of svc.integrationLog.slice(0, 30)">
            <td>{{ dmy(h.at) }} {{ h.at.slice(11, 16) }}</td><td>{{ h.type }}</td><td>{{ h.user }}</td>
            <td class="r"><strong>{{ h.integrated }}</strong></td><td class="r">{{ h.created }}</td><td class="r">{{ h.updated }}</td><td class="r">{{ h.annulled }}</td><td class="r">{{ h.omitted }}</td>
            <td><span class="rsv-badge" [ngClass]="h.errors ? 'rsv-badge--warn' : 'rsv-badge--ok'">{{ h.errors ? h.errors + ' por revisar' : 'Exitosa' }}</span></td>
          </tr>
          <tr *ngIf="!svc.integrationLog.length"><td colspan="9" class="kit-empty">Aún no hay integraciones registradas.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  `,
  styles: [`
    .int-setup { margin-bottom: 18px; }
    .int-setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: end; }
    .int-setup-grid small { display: block; font-weight: 400; font-size: 11px; margin-top: 4px; }
    .int-setup-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .int-setup-actions .rsv-btn { height: 42px; }
    .int-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .int-card { padding: 16px; }
    .int-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 6px; }
    .int-icon { width: 38px; height: 38px; border-radius: 10px; background: #E3EEFF; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .int-icon svg { width: 18px; height: 18px; fill: none; stroke: #1D4ED8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .int-card h3 { margin: 0; font-size: 14px; color: #0A2540; }
    .int-card p { margin: 2px 0 10px; font-size: 11.5px; color: #6B7280; min-height: 30px; }
    .int-card strong { font-size: 22px; color: #0A2540; }
    .int-card div span { font-size: 11.5px; color: #6B7280; }
    .int-badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .int-map { width: 240px; height: 34px; }
    .int-map-wide { width: 100%; max-width: 380px; height: 36px; }
    .int-dups { margin: 8px 0 0; padding-left: 18px; font-size: 12px; }
    .int-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-bottom: 18px; align-items: start; }
    .int-issuer-view { margin: 0 0 14px; }
    .int-issuer-view div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #EEF1F5; font-size: 12.5px; }
    .int-issuer-view dt { color: #6B7280; }
    .int-issuer-view dd { margin: 0; font-weight: 600; color: #0A2540; text-align: right; }
    .int-missing { color: #B45309 !important; }
    .int-wide { grid-column: 1 / -1; }
    .int-cc-name { height: 34px; }
    .int-cc-active { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; }
    .int-cc-add { display: flex; gap: 8px; margin-top: 10px; }
    .int-cc-add .rsv-input, .int-cc-add .rsv-btn { height: 38px; }
    @media (max-width: 1000px) { .int-two { grid-template-columns: 1fr; } }
  `],
})
export class IntegrationComponent {
  readonly dmy = dmy;
  readonly money = fmtMoney;
  readonly name = periodName;
  readonly categories = CATEGORIES;
  get incomeAccounts() { return activeAccounts().filter(a => a.cls === 'Ingreso'); }

  cards: ModuleCard[] = [];
  choice: Record<string, string> = {};
  showDup = false;
  running = false;
  saving = false;
  error = '';
  done = '';
  integratedCount = 0;
  start: string;
  closed: string;
  mapping: Record<string, string>;
  readonly today = new Date().toISOString().slice(0, 10);

  constructor(public svc: AccountingService) {
    const s = svc.getSettings();
    this.start = s.inicio;
    this.closed = s.cerradoHasta ?? '';
    this.mapping = { ...s.mapping };
    svc.getEntries().subscribe(() => this.refresh());
  }

  get monthShort(): string { return periodName(this.svc.openPeriod).slice(0, 3).toLowerCase(); }
  /** Meses que se pueden cerrar: los terminados desde el inicio de la contabilidad. */
  get closable(): string[] { return this.svc.periods().filter(p => p < this.svc.openPeriod); }
  get setupDirty(): boolean { const s = this.svc.getSettings(); return this.start !== s.inicio || this.closed !== (s.cerradoHasta ?? ''); }
  get mappingDirty(): boolean { return JSON.stringify(this.clean(this.mapping)) !== JSON.stringify(this.clean(this.svc.getMapping())); }

  async run(): Promise<void> {
    this.error = this.done = '';
    this.running = true;
    try {
      const r: IntegrationRun | undefined = await this.svc.integrate('Manual');
      if (r) this.done = `Integración guardada: ${r.created} nuevos, ${r.updated} actualizados, ${r.annulled} anulados · ${r.integrated} asientos integrados vigentes.`;
    } catch (e: any) {
      this.error = `No se pudo integrar${e?.error?.message ? ': ' + e.error.message : '.'}`;
    } finally {
      this.running = false;
    }
  }

  async saveSetup(): Promise<void> {
    const s = this.svc.getSettings();
    const detail = [this.start !== s.inicio ? `inicio ${dmy(s.inicio)} → ${dmy(this.start)}` : '',
      this.closed !== (s.cerradoHasta ?? '') ? (this.closed ? `cerrado hasta ${periodName(this.closed)}` : 'meses reabiertos') : ''].filter(Boolean).join(' · ');
    await this.save(() => this.svc.saveSettings({ inicio: this.start, cerradoHasta: this.closed || null }, detail), 'Ajustes guardados y módulos integrados de nuevo.');
  }

  // ── Datos del emisor y centros de costo ──
  centers: CostCenter[] = COST_CENTERS.map(c => ({ ...c }));
  newCenter = '';
  get nextCenterCode(): string {
    const n = Math.max(0, ...this.centers.map(c => +c.code.slice(3) || 0)) + 1;
    return `CC-${String(n).padStart(2, '0')}`;
  }

  async saveCenter(c: CostCenter): Promise<void> {
    if (c.name.trim().length < 3) return;
    try { await this.svc.saveCostCenter({ ...c, name: c.name.trim() }); this.centers = COST_CENTERS.map(x => ({ ...x })); }
    catch (e: any) { this.error = e?.error?.message ?? 'No se pudo guardar el centro de costo.'; }
  }

  async addCenter(): Promise<void> {
    await this.saveCenter({ code: this.nextCenterCode, name: this.newCenter.trim(), active: true });
    this.newCenter = '';
  }

  async saveMapping(): Promise<void> {
    await this.save(() => this.svc.saveSettings({ mapping: this.clean(this.mapping) }, 'Cuentas de ingreso por categoría actualizadas'), 'Cuentas guardadas y módulos integrados de nuevo.');
  }

  async assign(r: ReviewItem): Promise<void> {
    await this.save(() => this.svc.assignAccount(r.category!, this.choice[r.category!]), `Cuenta asignada a «${r.category}».`);
  }

  private async save(job: () => Promise<void>, ok: string): Promise<void> {
    this.error = this.done = '';
    this.saving = true;
    try {
      await job();
      const s = this.svc.getSettings();
      this.start = s.inicio;
      this.closed = s.cerradoHasta ?? '';
      this.mapping = { ...s.mapping };
      this.done = ok;
    } catch (e: any) {
      this.error = `No se pudo guardar${e?.error?.message ? ': ' + e.error.message : '.'}`;
    } finally {
      this.saving = false;
    }
  }

  private clean(m: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(m).filter(([, v]) => !!v).sort(([a], [b]) => a.localeCompare(b)));
  }

  private refresh(): void {
    const counts = this.svc.moduleCounts();
    this.integratedCount = this.svc.snapshot().filter(e => e.sourceKey && e.status !== 'Anulado').length;
    const review = (m: string) => this.svc.review.filter(r => r.module === m).length;
    const card = (name: string, desc: string): ModuleCard => {
      const n = review(name);
      return { name, desc, count: counts[name] ?? 0, state: n ? `${n} por revisar` : 'Al día', tone: n ? 'warn' : 'ok' };
    };
    this.cards = [
      card('Reservas', 'Anticipos y pagos de las reservas'),
      card('Alojamiento', 'Estadías al check-out y consumos (lavandería, daños...)'),
      card('Nómina', 'Causación de la nómina y pagos por Nequi'),
      card('Inventarios', 'Compras, consumos, bajas y ajustes'),
      { name: 'Facturación', desc: 'Se integra cuando las facturas se guarden en la base de datos', count: counts['Facturación'] ?? 0, state: 'Pendiente', tone: 'muted' },
    ];
  }
}

