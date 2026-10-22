import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, MonthSummary } from '../reports.service';
import { Delta, delta, pct, num, monthLabel, monthName, monthShort, shiftMonth, lastMonths, COLORS } from '../reports.model';
import { INDICATORS, IndicatorDef, IndicatorKey, DEFAULT_VIEW, indicator, meetsGoal } from '../indicators';
import { LinesComponent, SparkComponent, Series } from '../charts/charts';
import { DeltaComponent } from '../delta.component';

interface Card { def: IndicatorDef; value: number | null; delta: Delta; prev: number | null; spark: number[]; goal: number | null; meets: boolean | null; }

@Component({
  selector: 'app-reports-indicators',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LinesComponent, SparkComponent, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Indicadores de desempeño</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Indicadores de desempeño</h1>
      <p class="kit-sub">Compara cada indicador con el período anterior y con su meta.</p>
    </div>
    <div class="kit-actions">
      <label class="kit-select"><span>Período</span><select [(ngModel)]="period" (ngModelChange)="onPeriod()"><option *ngFor="let p of periods" [value]="p">{{ monthLabel(p) }}</option></select></label>
      <label class="kit-select"><span>Comparar con</span><select [(ngModel)]="compare" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p" [disabled]="p >= period">{{ monthLabel(p) }}</option></select></label>
      <button type="button" class="rsv-btn rsv-btn--primary" (click)="panelOpen = !panelOpen" [attr.aria-expanded]="panelOpen">Personalizar panel</button>
    </div>
  </header>

  <div class="in-layout" [class.with-panel]="panelOpen">
    <div>
      <div class="in-summary">
        <span class="rsv-badge rsv-badge--ok">{{ meetCount }} cumple{{ meetCount === 1 ? '' : 'n' }} la meta</span>
        <span class="rsv-badge rsv-badge--danger">{{ missCount }} por debajo de la meta</span>
        <span class="rp-muted">Metas definidas por el Administrador · {{ period === svc.livePeriod ? 'mes en curso hasta hoy' : 'mes cerrado' }}.</span>
      </div>

      <div class="in-grid">
        <article class="in-card" *ngFor="let c of cards" draggable="true" (dragstart)="drag = c.def.key" (dragover)="$event.preventDefault()" (drop)="dropOn(c.def.key)">
          <div class="in-card-head"><span>{{ c.def.label }}</span><i class="in-grip" title="Arrastra para reordenar" aria-hidden="true">⠿</i></div>
          <strong class="in-value">{{ c.value === null ? '—' : c.def.format(c.value) }}</strong>
          <div class="in-cmp"><rp-delta [d]="c.delta"></rp-delta><small>{{ cmpShort }} {{ c.prev === null ? '—' : c.def.format(c.prev) }}</small></div>
          <rp-spark [values]="c.spark" [color]="c.meets === false ? C.amber : C.blue"></rp-spark>
          <div class="in-foot">
            <span>{{ c.goal === null ? 'Sin meta definida' : 'Meta ' + (c.def.higher ? '≥' : '≤') + ' ' + c.def.goalFormat(c.goal) }}</span>
            <span class="rsv-badge" [ngClass]="c.meets === null ? 'rsv-badge--muted' : c.meets ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ c.meets === null ? 'Sin dato' : c.meets ? 'Cumple' : 'No cumple' }}</span>
          </div>
        </article>
        <p class="kit-empty" *ngIf="!cards.length">Activa al menos un indicador en «Personalizar panel».</p>
      </div>

      <section class="kit-card">
        <h2 class="kit-card-title">Ocupación y margen frente a la meta</h2>
        <p class="kit-card-sub">{{ trendRange }} · %</p>
        <div class="rp-legend">
          <span><i [style.background]="C.blue"></i>Ocupación</span><span><i [style.background]="C.amber"></i>Margen</span>
          <span *ngIf="goalOf('occupancy') !== null"><i class="line" [style.background]="C.blue"></i>Meta ocupación {{ num(goalOf('occupancy')!) }} %</span>
          <span *ngIf="goalOf('margin') !== null"><i class="line" [style.background]="C.amber"></i>Meta margen {{ num(goalOf('margin')!) }} %</span>
        </div>
        <rp-lines [labels]="trendLabels" [series]="trendSeries" [yMax]="100" valuesShown="last" [tick]="tickPct" [valueLabel]="valuePct" [tooltip]="tip"
                  [goals]="trendGoals" aria="Ocupación y margen por mes"></rp-lines>
        <p class="rp-note" *ngIf="payrollNote">{{ payrollNote }}</p>
      </section>
    </div>

    <aside class="kit-card in-panel" *ngIf="panelOpen" aria-label="Personalizar panel">
      <div class="rp-card-head"><h2 class="kit-card-title">Personalizar panel</h2><span class="rp-muted">{{ view.active.length }} de {{ all.length }}</span></div>
      <p class="rp-muted">Activa los indicadores que quieres ver y arrástralos para cambiar el orden.</p>
      <div class="in-item" *ngFor="let key of view.order; let i = index" draggable="true" [class.off]="!isActive(key)"
           (dragstart)="drag = key" (dragover)="$event.preventDefault()" (drop)="dropOn(key)">
        <i class="in-grip" aria-hidden="true">⠿</i><span>{{ def(key).panel }}</span>
        <button type="button" class="in-move" [disabled]="i === 0" (click)="move(key, -1)" [attr.aria-label]="'Subir ' + def(key).panel">↑</button>
        <label class="kit-toggle"><input type="checkbox" [checked]="isActive(key)" (change)="toggle(key)" [attr.aria-label]="def(key).panel"><i></i></label>
      </div>
      <div class="in-goal">
        <label class="kit-select"><span>Meta de</span><select [(ngModel)]="goalKey" (ngModelChange)="goalValue = goalOf(goalKey)"><option *ngFor="let d of all" [value]="d.key">{{ d.panel }}</option></select></label>
        <label class="kit-select"><span>{{ def(goalKey).higher ? 'Mínimo' : 'Máximo' }} ({{ def(goalKey).unit }})</span>
          <input type="number" min="0" [step]="def(goalKey).unit === '$' ? 1000 : 0.1" [(ngModel)]="goalValue" [disabled]="!isAdmin"></label>
        <p class="rp-muted" *ngIf="!isAdmin">Solo el Administrador puede cambiar las metas.</p>
      </div>
      <p class="kit-banner kit-banner--ok" *ngIf="savedMsg">{{ savedMsg }}</p>
      <div class="in-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Restablecer</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="save()">Guardar vista</button>
      </div>
    </aside>
  </div>
  `,
  styles: [`
    .kit-head .kit-select { min-width: 170px; }
    .kit-head .rsv-btn { height: 46px; }
    .in-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
    .in-layout.with-panel { grid-template-columns: minmax(0, 1fr) 300px; }
    .in-summary { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .in-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .in-card { background: #fff; border: 1px solid #E6EBF2; border-radius: 14px; padding: 14px 15px 12px; cursor: grab; }
    .in-card-head { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; color: #1F2937; }
    .in-grip { font-style: normal; color: #9AA5B4; cursor: grab; user-select: none; }
    .in-value { display: block; font-size: 22px; color: #0A2540; margin: 4px 0 2px; }
    .in-cmp { display: flex; align-items: center; font-size: 11px; color: #6B7280; margin-bottom: 4px; }
    .in-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; border-top: 1px solid #EEF1F5; margin-top: 6px; padding-top: 8px; font-size: 11px; color: #6B7280; }
    .in-panel { position: sticky; top: 100px; border: 2px solid #1565C0; }
    .in-item { display: flex; align-items: center; gap: 8px; border: 1px solid #E6EBF2; border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; font-size: 12.5px; color: #0A2540; background: #fff; cursor: grab; }
    .in-item span { flex: 1; }
    .in-item.off { background: #F4F6F9; color: #9AA5B4; }
    .in-move { border: none; background: transparent; color: #6B7280; cursor: pointer; font-size: 13px; padding: 0 2px; }
    .in-move:disabled { visibility: hidden; }
    .in-goal { display: grid; gap: 8px; margin: 12px 0; }
    .in-goal .kit-select { min-width: 0; }
    .in-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    @media (max-width: 1100px) { .in-layout.with-panel { grid-template-columns: 1fr; } .in-panel { position: static; } }
  `],
})
export class IndicatorsComponent implements OnDestroy {
  readonly C = COLORS;
  readonly all = INDICATORS;
  readonly num = num; readonly monthLabel = monthLabel;
  readonly def = indicator;
  readonly tickPct = (v: number) => `${v} %`;
  readonly valuePct = (v: number) => pct(v);

  periods: string[];
  period: string;
  compare: string;
  panelOpen = false;
  view: { order: IndicatorKey[]; active: IndicatorKey[] };
  cards: Card[] = [];
  drag: IndicatorKey | null = null;
  goalKey: IndicatorKey = 'occupancy';
  goalValue: number | null = null;
  savedMsg = '';
  trendLabels: string[] = []; trendSeries: Series[] = []; trendRange = ''; payrollNote = '';
  private months: MonthSummary[] = [];
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.periods = svc.periods();
    this.period = svc.livePeriod;
    this.compare = shiftMonth(svc.livePeriod, -1);
    this.view = svc.panelView();
    this.goalValue = svc.goal('occupancy');
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get isAdmin(): boolean { return this.svc.isAdmin; }
  get meetCount(): number { return this.cards.filter(c => c.meets === true).length; }
  get missCount(): number { return this.cards.filter(c => c.meets === false).length; }
  get cmpShort(): string { return monthShort(this.compare); }
  goalOf(key: IndicatorKey): number | null { return this.svc.goal(key); }
  get trendGoals(): { value: number; color: string; label: string }[] {
    const o = this.goalOf('occupancy'), m = this.goalOf('margin');
    return [...(o !== null ? [{ value: o, color: this.C.blue, label: 'Meta ocupación' }] : []), ...(m !== null ? [{ value: m, color: this.C.amber, label: 'Meta margen' }] : [])];
  }
  isActive(key: IndicatorKey): boolean { return this.view.active.includes(key); }

  readonly tip = (i: number) => {
    const m = this.months[i];
    return m ? [monthLabel(m.period), `Ocupación ${pct(m.occupancy)} · margen ${pct(m.margin)}`] : [];
  };

  onPeriod(): void {
    if (this.compare >= this.period) this.compare = shiftMonth(this.period, -1);
    this.compute();
  }

  toggle(key: IndicatorKey): void {
    this.view.active = this.isActive(key) ? this.view.active.filter(k => k !== key) : [...this.view.active, key];
    this.savedMsg = '';
    this.compute();
  }

  move(key: IndicatorKey, dir: -1 | 1): void {
    const o = [...this.view.order];
    const i = o.indexOf(key), j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    this.view.order = o;
    this.savedMsg = '';
    this.compute();
  }

  dropOn(target: IndicatorKey): void {
    if (!this.drag || this.drag === target) return;
    const o = this.view.order.filter(k => k !== this.drag);
    o.splice(o.indexOf(target), 0, this.drag);
    this.view.order = o;
    this.drag = null;
    this.savedMsg = '';
    this.compute();
  }

  reset(): void {
    this.view = { order: [...DEFAULT_VIEW.order], active: [...DEFAULT_VIEW.active] };
    this.savedMsg = '';
    this.compute();
  }

  save(): void {
    if (this.isAdmin && this.goalValue !== null && +this.goalValue >= 0 && +this.goalValue !== this.svc.goal(this.goalKey)) {
      this.svc.setGoal(this.goalKey, +this.goalValue).then(() => this.compute()).catch(() => undefined);
    }
    const ok = this.svc.savePanelView(this.view);
    this.svc.log('vista de indicadores guardada', `${this.view.active.length} indicadores · ${this.view.active.map(k => indicator(k).panel).join(', ')}`);
    this.savedMsg = ok ? 'Vista guardada para tu rol en este navegador.' : 'Vista aplicada; este navegador no permite guardarla.';
    this.compute();
  }

  compute(): void {
    const s = this.svc;
    const cur = s.monthSummary(this.period), prev = s.monthSummary(this.compare);
    const spanMonths = s.monthsUpTo(this.period, 6);
    this.months = spanMonths.map(p => s.monthSummary(p));
    this.cards = this.view.order.filter(k => this.isActive(k)).map(key => {
      const def = indicator(key);
      const value = def.value(cur), before = def.value(prev), goal = s.goal(key);
      return {
        def, value, prev: before, goal, meets: meetsGoal(def, value, goal),
        delta: value === null ? delta(0, null) : delta(value, before, def.kind, def.higher),
        spark: this.months.map(m => def.value(m)).filter((v): v is number => v !== null && isFinite(v)),
      };
    });
    this.trendLabels = spanMonths.map(monthShort);
    this.trendRange = `${monthName(spanMonths[0]).replace(/^./, c => c.toUpperCase())} – ${monthName(this.period)} ${this.period.slice(0, 4)}`;
    this.trendSeries = [
      { name: 'Ocupación', color: COLORS.blue, values: this.months.map(m => m.occupancy) },
      { name: 'Margen', color: COLORS.amber, values: this.months.map(m => Math.max(0, m.margin)) },
    ];
    const pay = s.payrollSummary(this.period);
    this.payrollNote = pay.run && pay.status === 'Borrador'
      ? `El margen de ${monthName(this.period)} aún no descuenta la nómina (en borrador): cuando se confirme, bajará.` : '';
  }
}
