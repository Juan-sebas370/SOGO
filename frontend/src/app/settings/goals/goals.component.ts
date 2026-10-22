import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService } from '../settings.service';
import { UsersService } from '../../users/users.service';
import { ReportsService, MonthSummary } from '../../reports/reports.service';
import { INDICATORS, IndicatorDef, IndicatorKey, meetsGoal } from '../../reports/indicators';
import { InventoryService } from '../../inventory/inventory.service';
import { AlertConfig } from '../../inventory/inventory.model';
import { monthName } from '../../reports/reports.model';
import { metaText } from '../hotel/hotel.component';

/** Meta y alerta de un indicador: null = sin definir (el indicador no se califica). */
interface Row { def: IndicatorDef; goal: number | null; alert: number | null; }
const has = (v: unknown) => v !== null && v !== undefined && v !== '' && isFinite(+(v as number));
const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));

@Component({
  selector: 'app-settings-goals',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Metas e indicadores</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Metas e indicadores</h1><p class="kit-sub">Metas por indicador y umbrales de alerta para reportes e inventario.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || !canEdit || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error">{{ error }}</p>
  <p class="kit-banner kit-banner--info" *ngIf="!canEdit">Solo el Administrador define las metas.</p>
  <p class="kit-banner kit-banner--warn" *ngIf="!definedCount">Aún no hay metas definidas: escribe la meta de cada indicador que quieras seguir. Un indicador sin meta se muestra, pero no se califica como «Cumple / No cumple».</p>

  <section class="kit-card go-mb">
    <div class="cf-card-head"><h2 class="kit-card-title">Metas del hospedaje</h2><span class="rp-muted">Se usan en <a routerLink="/dashboard/reports/indicators">Reportes › Indicadores</a> para marcar «Cumple / No cumple».</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table cf-table">
        <thead><tr><th>Indicador</th><th>Condición</th><th class="r">Meta</th><th class="r">Alerta si llega a</th><th>Período</th><th class="r">Valor actual ({{ monthShort }})</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows" [class.go-sel]="sel === r" (click)="sel = r">
            <td><strong>{{ r.def.panel }}</strong></td>
            <td class="rp-muted">{{ r.def.higher ? 'Mayor o igual' : 'Menor o igual' }}</td>
            <td class="r"><span class="cf-unit go-in"><span *ngIf="r.def.unit === '$'">$</span><input [class.wide]="r.def.unit === '$'" type="number" min="0" [step]="step(r)" [(ngModel)]="r.goal" [disabled]="!canEdit" placeholder="Sin meta"><span *ngIf="r.def.unit !== '$'">{{ r.def.unit }}</span></span></td>
            <td class="r"><span class="cf-unit go-in go-alert"><span *ngIf="r.def.unit === '$'">$</span><input [class.wide]="r.def.unit === '$'" type="number" min="0" [step]="step(r)" [(ngModel)]="r.alert" [disabled]="!canEdit" placeholder="—"><span *ngIf="r.def.unit !== '$'">{{ r.def.unit }}</span></span></td>
            <td class="rp-muted">Mensual</td>
            <td class="r"><strong>{{ value(r) === null ? '—' : r.def.format(value(r)!) }}</strong></td>
            <td><span class="rsv-badge" [ngClass]="state(r).badge">{{ state(r).text }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="cf-note">«Alerta» marca el indicador como crítico cuando cruza ese valor (por debajo si más es mejor, por encima si menos es mejor). Cambiar una meta no altera los datos, solo cómo se califican.</p>
  </section>

  <div class="cf-grid">
    <section class="kit-card">
      <h2 class="kit-card-title">Umbrales de inventario</h2>
      <div class="cf-row"><div><strong>Aviso de producto próximo a vencer</strong><small>Días antes de la fecha de vencimiento.</small></div><span class="cf-unit"><input type="number" min="1" max="60" [(ngModel)]="inv.expiryDays" [disabled]="!canEdit"><span>días</span></span></div>
      <div class="cf-row"><div><strong>Alerta de stock bajo</strong><small>Cuando la existencia llega al nivel mínimo del producto.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="inv.lowStock" [disabled]="!canEdit"><i></i></label></div>
      <div class="cf-row"><div><strong>Alerta de consumo inusual</strong><small>Salidas del día mayores al promedio en este porcentaje. Hoy: {{ money(check.today) }} frente a {{ money(check.average) }} de promedio{{ check.unusual ? ' · inusual' : '' }}.</small></div>
        <span class="cf-unit"><input type="number" min="10" max="500" [(ngModel)]="inv.unusualPct" [disabled]="!canEdit"><span>%</span></span></div>
      <div class="cf-row"><div><strong>Merma máxima aceptada al mes</strong><small>Ajustes negativos y pérdidas sobre el consumo. {{ shrinkText }}</small></div>
        <span class="cf-unit"><input type="number" min="0" max="50" step="0.5" [(ngModel)]="inv.maxShrinkPct" [disabled]="!canEdit"><span>%</span></span></div>
    </section>

    <aside class="kit-card">
      <h2 class="kit-card-title">Cómo se ve en Indicadores</h2>
      <div class="go-prev">
        <span>{{ sel.def.label }}</span>
        <strong>{{ value(sel) === null ? '—' : sel.def.format(value(sel)!) }}</strong>
        <div class="go-bar"><b [style.width.%]="barPct(sel, value(sel))" [ngClass]="state(sel).cls"></b><i *ngIf="sel.goal !== null" [style.left.%]="barPct(sel, +sel.goal)"></i></div>
        <div class="cf-card-head"><small>{{ sel.goal === null || $any(sel.goal) === '' ? 'Sin meta definida' : 'Meta ' + (sel.def.higher ? '≥ ' : '≤ ') + sel.def.goalFormat(+sel.goal) }}{{ sel.alert === null || $any(sel.alert) === '' ? '' : ' · alerta ' + (sel.def.higher ? 'bajo ' : 'sobre ') + sel.def.goalFormat(+sel.alert) }}</small>
          <span class="rsv-badge" [ngClass]="state(sel).badge">{{ state(sel).text }}</span></div>
      </div>
      <p class="cf-note">Haz clic en un indicador de la tabla para verlo aquí.</p>
    </aside>
  </div>
  `,
  styles: [`
    .go-mb { margin-bottom: 18px; }
    .go-in { height: 32px; }
    .go-alert input { color: #6B7280; }
    tbody tr { cursor: pointer; }
    tr.go-sel td { background: #F2F7FD; }
    .go-prev { border: 1px solid #E6EBF2; border-radius: 12px; padding: 14px; }
    .go-prev > span { font-size: 12.5px; color: #374151; }
    .go-prev > strong { display: block; font-size: 22px; color: #0A2540; margin: 4px 0 10px; }
    .go-prev small { font-size: 11px; color: #6B7280; }
    .go-bar { position: relative; height: 10px; background: #EEF2F7; border-radius: 999px; margin-bottom: 8px; }
    .go-bar b { display: block; height: 100%; border-radius: 999px; background: #1F8A5B; }
    .go-bar b.no { background: #D98A0B; } .go-bar b.crit { background: #C62828; }
    .go-bar i { position: absolute; top: -4px; width: 2px; height: 18px; background: #0A2540; }
  `],
})
export class GoalsComponent {
  readonly money = money;
  rows: Row[];
  sel: Row;
  inv: AlertConfig;
  current: MonthSummary;
  private shrinkShare = 0;
  consumption = { today: 0, average: 0, unusual: false };
  private base = '';
  saved = '';

  constructor(private settings: SettingsService, private users: UsersService, private reports: ReportsService, private inventory: InventoryService) {
    this.rows = this.load();
    this.sel = this.rows[0];
    this.inv = { ...inventory.config };
    this.current = reports.monthSummary(reports.livePeriod);
    this.shrinkShare = reports.inventoryReport(reports.monthRange(reports.livePeriod)).shrinkShare;
    this.consumption = inventory.consumptionCheck();
    this.base = this.snapshot();
  }

  private load(): Row[] { return INDICATORS.map(def => ({ def, goal: this.reports.goal(def.key), alert: this.reports.alertLevel(def.key) })); }
  get definedCount(): number { return this.rows.filter(r => has(r.goal)).length; }
  private snapshot(): string { return JSON.stringify({ g: this.rows.map(r => [r.goal, r.alert]), i: this.inv }); }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit') && this.users.sessionRoles().includes('admin'); }
  get meta(): string { return metaText(this.settings.meta.goals); }
  get dirty(): boolean { return this.snapshot() !== this.base; }
  get monthShort(): string { return monthName(this.reports.livePeriod).slice(0, 3); }
  get check() { return { ...this.consumption, unusual: this.consumption.average > 0 && this.consumption.today > this.consumption.average * (1 + +this.inv.unusualPct / 100) }; }
  get shrinkText(): string {
    const pct = this.shrinkShare;
    return `Este mes: ${pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %${pct > +this.inv.maxShrinkPct ? ' · por encima del máximo' : ''}.`;
  }
  get error(): string {
    for (const r of this.rows) {
      if ((has(r.goal) && +r.goal! < 0) || (has(r.alert) && +r.alert! < 0)) return `La meta y la alerta de ${r.def.panel} no pueden ser negativas.`;
      if (has(r.alert) && !has(r.goal)) return `Define primero la meta de ${r.def.panel} para poder ponerle alerta.`;
      if (has(r.goal) && has(r.alert) && (r.def.higher ? +r.alert! > +r.goal! : +r.alert! < +r.goal!)) return `En ${r.def.panel} la alerta debe estar ${r.def.higher ? 'por debajo' : 'por encima'} de la meta.`;
    }
    if (!(this.inv.expiryDays >= 1)) return 'Los días de aviso de vencimiento deben ser al menos 1.';
    return '';
  }

  value(r: Row): number | null { const v = r.def.value(this.current); return v === null || !isFinite(v) ? null : v; }
  step(r: Row): number { return r.def.unit === '$' ? 1000 : r.def.unit === 'veces' || r.def.unit === 'noches' ? 0.1 : 1; }
  state(r: Row): { text: string; badge: string; cls: string } {
    const v = this.value(r);
    if (!has(r.goal)) return { text: 'Sin meta', badge: 'rsv-badge--muted', cls: '' };
    const ok = meetsGoal(r.def, v, +r.goal!);
    if (ok === null) return { text: 'Sin dato', badge: 'rsv-badge--muted', cls: '' };
    if (ok) return { text: 'Cumple', badge: 'rsv-badge--ok', cls: '' };
    const critical = has(r.alert) && (r.def.higher ? v! < +r.alert! : v! > +r.alert!);
    return critical ? { text: 'Alerta', badge: 'rsv-badge--danger', cls: 'crit' } : { text: 'No cumple', badge: 'rsv-badge--warn', cls: 'no' };
  }
  barPct(r: Row, v: number | null): number {
    if (v === null) return 0;
    const top = Math.max(+(r.goal ?? 0), v ?? 0) * 1.25 || 1;
    return Math.min(100, Math.max(0, v / top * 100));
  }

  discard(): void { this.rows = this.load(); this.sel = this.rows.find(r => r.def.key === this.sel.def.key) ?? this.rows[0]; this.inv = { ...this.inventory.config }; }

  saving = false;

  async save(): Promise<void> {
    if (this.error || !this.canEdit || this.saving) return;
    const changed: string[] = [];
    const goals: Record<string, number> = {}, alerts: Record<string, number> = {};
    this.rows.forEach(r => {
      const key: IndicatorKey = r.def.key;
      const g = has(r.goal) ? +r.goal! : null, a = has(r.alert) ? +r.alert! : null;
      if (g !== null) goals[key] = g;
      if (a !== null) alerts[key] = a;
      if (g !== this.reports.goal(key)) changed.push(`${r.def.panel} meta ${g === null ? 'sin definir' : r.def.goalFormat(g)}`);
      if (a !== this.reports.alertLevel(key)) changed.push(`${r.def.panel} alerta ${a === null ? 'sin definir' : r.def.goalFormat(a)}`);
    });
    this.saving = true;
    try {
      if (changed.length) await this.settings.saveGoals(goals, alerts, changed.join(' · '));
    } catch {
      this.saving = false;
      return;
    }
    this.saving = false;
    const cfg = this.inventory.config;
    if (JSON.stringify(cfg) !== JSON.stringify({ ...cfg, ...this.inv })) {
      this.inventory.setConfig({ expiryDays: Math.round(+this.inv.expiryDays), lowStock: this.inv.lowStock, unusualPct: +this.inv.unusualPct, maxShrinkPct: +this.inv.maxShrinkPct });
      changed.push('umbrales de inventario');
    }
    this.rows = this.load();
    this.sel = this.rows.find(r => r.def.key === this.sel.def.key) ?? this.rows[0];
    this.inv = { ...this.inventory.config };
    this.base = this.snapshot();
    this.saved = 'Metas y umbrales guardados en la base de datos. Indicadores, Reportes e Inventarios ya los usan.';
  }
}
