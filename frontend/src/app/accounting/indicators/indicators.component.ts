import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Entry, GROUPS, accountByCode, balanceSheet, balances, counts, isClosing, pnl, monthStart, monthEnd, monthAbbr, periodName, shiftMonth } from '../accounting.model';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile } from '../../shared/documents';
import { isoDateTime } from '../../shared/date-utils';
import { dmy } from '../accounting-format';

interface Snapshot {
  income: number; expenses: number; profit: number; margin: number; payroll: number; cashFlow: number;
  currentAssets: number; currentLiabilities: number; current: number; debt: number; cash: number;
}
type Tone = 'good' | 'warn' | 'bad' | 'na';
interface Delta { text: string; tone: Tone; arrow: '▲' | '▼' | ''; }
interface Health { name: string; value: string; tone: Tone; status: string; explain: string; pct: number; zones: { from: number; to: number; tone: Tone }[]; mark?: number; scale: string[]; }
interface Insight { tone: Tone; text: string; }
interface Row { name: string; formula: string; cur: string; prev: string; delta: Delta; reading: string; }

/** Margen y pesos sobre ingresos solo tienen sentido si hay ingresos de verdad: si no, se dispara (−2.443 %). */
const meaningful = (s: Snapshot) => s.income > 0 && Math.abs(s.margin) <= 100;

/** Paso "redondo" para los ejes: 1, 2, 2,5 o 5 × 10ⁿ (5 líneas de guía, nunca cientos). */
function niceStep(range: number, ticks = 4): number {
  const raw = Math.max(range, 1) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) ?? 10) * mag;
}

@Component({
  selector: 'app-accounting-indicators',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Indicadores financieros</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Indicadores financieros</h1>
      <p class="kit-sub">Cómo le fue al hospedaje en <b>{{ name(period).toLowerCase() }}</b>, comparado con {{ name(compare).toLowerCase() }}. Sale de los comprobantes contabilizados.</p>
    </div>
    <div class="kit-actions">
      <label class="kit-select"><span>Período</span><select [(ngModel)]="period" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
      <label class="kit-select"><span>Comparar con</span><select [(ngModel)]="compare" (ngModelChange)="compute()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
      <label class="kit-select ind-goal"><span>Meta de margen (%)</span><input type="number" min="0" max="100" [(ngModel)]="goal" (ngModelChange)="compute()"></label>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="export()">Exportar</button>
    </div>
  </header>

  <!-- 1 · Lectura en palabras -->
  <section class="kit-card ind-story">
    <h2 class="kit-card-title">Lectura de {{ name(period).toLowerCase() }}</h2>
    <ul>
      <li *ngFor="let s of insights" [ngClass]="'ind-t--' + s.tone">
        <span class="ind-icon" aria-hidden="true">{{ icon(s.tone) }}</span><span>{{ s.text }}</span>
      </li>
    </ul>
  </section>

  <!-- 2 · Los cuatro números del mes -->
  <section class="ind-kpis">
    <article class="ind-kpi" *ngFor="let k of kpis">
      <div class="ind-kpi-top">
        <span class="ind-kpi-label">{{ k.label }}</span>
        <span class="ind-badge" *ngIf="k.badge" [ngClass]="'ind-t--' + k.badgeTone">{{ k.badge }}</span>
      </div>
      <strong class="ind-kpi-value" [class.ind-neg]="k.value < 0">{{ money(k.value) }}</strong>
      <span class="ind-delta" [ngClass]="'ind-t--' + k.delta.tone">{{ k.delta.arrow }} {{ k.delta.text }}</span>
      <svg class="ind-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="120" [attr.y1]="k.zeroY" [attr.y2]="k.zeroY" class="ind-spark-zero" *ngIf="k.zeroY !== null"/>
        <polyline [attr.points]="k.points" class="ind-spark-line" [style.stroke]="k.color"/>
        <circle [attr.cx]="120" [attr.cy]="k.lastY" r="2.5" [style.fill]="k.color"/>
      </svg>
      <small class="ind-spark-cap">Últimos 6 meses</small>
    </article>
  </section>

  <!-- 3 · Gráficas de los últimos 6 meses -->
  <div class="ind-grid">
    <section class="kit-card ind-chart">
      <div class="ind-chart-head">
        <div>
          <h2 class="kit-card-title">Ingresos y egresos por mes</h2>
          <p class="kit-card-sub">{{ name(months[0].p) }} a {{ name(period) }} · pasa el cursor sobre un mes para ver los valores</p>
        </div>
        <div class="ind-legend"><span><i class="ind-sw ind-sw--in"></i>Ingresos</span><span><i class="ind-sw ind-sw--out"></i>Egresos</span></div>
      </div>
      <div class="ind-plot" (mouseleave)="hoverBars = -1">
        <svg viewBox="0 0 600 250" role="img" [attr.aria-label]="barsLabel">
          <g *ngFor="let t of barTicks">
            <line x1="62" x2="592" [attr.y1]="by(t)" [attr.y2]="by(t)" class="ind-grid-line"/>
            <text x="56" [attr.y]="by(t) + 4" class="ind-tick">{{ short(t) }}</text>
          </g>
          <g *ngFor="let m of months; let i = index">
            <rect [attr.x]="colX(i) - 36" y="10" width="72" height="200" class="ind-hit" [class.on]="hoverBars === i"
                  (mouseenter)="hoverBars = i" (focus)="hoverBars = i" tabindex="0" [attr.aria-label]="name(m.p) + ': ingresos ' + money(m.income) + ', egresos ' + money(m.expenses)"/>
            <path [attr.d]="bar(colX(i) - 25, m.income)" class="ind-bar-in"/>
            <path [attr.d]="bar(colX(i) + 2, m.expenses)" class="ind-bar-out"/>
            <text [attr.x]="colX(i)" y="232" class="ind-x" [class.cur]="m.p === period">{{ abbr(m.p) }}</text>
          </g>
          <!-- Rótulo directo solo del mes elegido -->
          <ng-container *ngIf="months[months.length - 1] as m">
            <text [attr.x]="colX(5) - 13" [attr.y]="Math.min(by(m.income), 200) - 6" class="ind-val">{{ short(m.income) }}</text>
            <text [attr.x]="colX(5) + 14" [attr.y]="Math.min(by(m.expenses), 200) - 6" class="ind-val">{{ short(m.expenses) }}</text>
          </ng-container>
        </svg>
        <div class="ind-tip" *ngIf="hoverBars >= 0 && months[hoverBars] as m" [style.left.%]="colX(hoverBars) / 6">
          <strong>{{ name(m.p) }}</strong>
          <span><i class="ind-sw ind-sw--in"></i>Ingresos <b>{{ money(m.income) }}</b></span>
          <span><i class="ind-sw ind-sw--out"></i>Egresos <b>{{ money(m.expenses) }}</b></span>
          <span class="ind-tip-sep">{{ m.profit >= 0 ? 'Ganancia' : 'Pérdida' }} <b [class.ind-neg]="m.profit < 0">{{ money(m.profit) }}</b></span>
        </div>
      </div>
    </section>

    <section class="kit-card ind-chart">
      <div class="ind-chart-head">
        <div>
          <h2 class="kit-card-title">Resultado de cada mes</h2>
          <p class="kit-card-sub">Ingresos menos egresos · arriba de la línea gana, abajo pierde</p>
        </div>
        <div class="ind-legend"><span><i class="ind-sw ind-sw--gain"></i>Ganancia</span><span><i class="ind-sw ind-sw--loss"></i>Pérdida</span></div>
      </div>
      <div class="ind-plot" (mouseleave)="hoverResult = -1">
        <svg viewBox="0 0 400 250" role="img" [attr.aria-label]="resultLabel">
          <g *ngFor="let t of resultTicks">
            <line x1="62" x2="392" [attr.y1]="ry(t)" [attr.y2]="ry(t)" [class]="t === 0 ? 'ind-zero' : 'ind-grid-line'"/>
            <text x="56" [attr.y]="ry(t) + 4" class="ind-tick">{{ short(t) }}</text>
          </g>
          <g *ngFor="let m of months; let i = index">
            <rect [attr.x]="rx(i) - 24" y="10" width="48" height="200" class="ind-hit" [class.on]="hoverResult === i"
                  (mouseenter)="hoverResult = i" (focus)="hoverResult = i" tabindex="0" [attr.aria-label]="name(m.p) + ': ' + (m.profit >= 0 ? 'ganancia ' : 'pérdida ') + money(m.profit)"/>
            <path [attr.d]="resultBar(rx(i) - 14, m.profit)" [class]="m.profit >= 0 ? 'ind-bar-gain' : 'ind-bar-loss'"/>
            <text [attr.x]="rx(i)" y="232" class="ind-x" [class.cur]="m.p === period">{{ abbr(m.p) }}</text>
          </g>
          <text *ngIf="months[months.length - 1] as m" [attr.x]="rx(5)" [attr.y]="m.profit >= 0 ? ry(m.profit) - 6 : ry(m.profit) + 14" class="ind-val" style="text-anchor: end" [attr.dx]="14">{{ short(m.profit) }}</text>
        </svg>
        <div class="ind-tip" *ngIf="hoverResult >= 0 && months[hoverResult] as m" [style.left.%]="rx(hoverResult) / 4">
          <strong>{{ name(m.p) }}</strong>
          <span>{{ m.profit >= 0 ? 'Ganancia' : 'Pérdida' }} <b [class.ind-neg]="m.profit < 0">{{ money(m.profit) }}</b></span>
          <span>Margen <b>{{ meaningfulMonth(m) ? fmtPct(m.margin) : 'no aplica' }}</b></span>
        </div>
      </div>
    </section>
  </div>

  <!-- 4 · Gastos y salud -->
  <div class="ind-grid ind-grid--even">
    <section class="kit-card">
      <h2 class="kit-card-title">¿En qué se fue el dinero?</h2>
      <p class="kit-card-sub">Egresos de {{ name(period).toLowerCase() }} por concepto · {{ money(c.expenses) }} en total</p>
      <ul class="ind-spend" *ngIf="spend.length; else noSpend">
        <li *ngFor="let s of spend">
          <div class="ind-spend-row"><span>{{ s.name }}</span><span><b>{{ money(s.amount) }}</b> · {{ s.pct | number:'1.0-0' }}%</span></div>
          <span class="ind-track"><span [style.width.%]="s.pct"></span></span>
        </li>
      </ul>
      <ng-template #noSpend><p class="ind-empty">No hay egresos contabilizados en el período.</p></ng-template>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Salud financiera</h2>
      <p class="kit-card-sub">Al cierre de {{ name(period).toLowerCase() }} · el color dice si está bien, para revisar o en riesgo</p>
      <ul class="ind-health">
        <li *ngFor="let h of health">
          <div class="ind-health-head">
            <span class="ind-health-name">{{ h.name }}</span>
            <span class="ind-badge" [ngClass]="'ind-t--' + h.tone">{{ icon(h.tone) }} {{ h.status }}</span>
            <strong>{{ h.value }}</strong>
          </div>
          <div class="ind-meter" *ngIf="h.tone !== 'na'">
            <span *ngFor="let z of h.zones" class="ind-zone" [ngClass]="'ind-z--' + z.tone" [style.left.%]="z.from" [style.width.%]="z.to - z.from"></span>
            <span class="ind-needle" [style.left.%]="h.pct"></span>
            <span class="ind-goal-mark" *ngIf="h.mark !== undefined" [style.left.%]="h.mark" title="Meta"></span>
          </div>
          <div class="ind-scale" *ngIf="h.tone !== 'na'"><span *ngFor="let s of h.scale">{{ s }}</span></div>
          <p class="ind-explain">{{ h.explain }}</p>
        </li>
      </ul>
    </section>
  </div>

  <!-- 5 · Tabla -->
  <section class="kit-card">
    <div class="acc-head-row">
      <h2 class="kit-card-title">Comparación detallada</h2>
      <span class="kit-muted">Generado {{ dmy(generatedAt) }} {{ generatedAt.slice(11, 16) }} por {{ user }} · registrado en auditoría</span>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table ind-table">
        <thead><tr><th>Indicador</th><th class="r">{{ name(period) }}</th><th class="r">{{ name(compare) }}</th><th class="r">Cambio</th><th>Qué significa</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows">
            <td><strong>{{ r.name }}</strong><small>{{ r.formula }}</small></td>
            <td class="r"><strong>{{ r.cur }}</strong></td>
            <td class="r kit-muted">{{ r.prev }}</td>
            <td class="r"><span class="ind-delta" [ngClass]="'ind-t--' + r.delta.tone">{{ r.delta.arrow }} {{ r.delta.text }}</span></td>
            <td class="kit-muted">{{ r.reading }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="acc-note">Margen y pesos se calculan antes del impuesto de renta. Con ingresos muy bajos frente a los egresos un porcentaje se dispara y no dice nada; en ese caso se muestra «no aplica». Datos desde el inicio de la contabilidad en SOGO ({{ dmy(svc.goLive) }}).</p>
  </section>
  `,
  styles: [`
    /* Colores validados para daltonismo (ver skill dataviz): ingresos/ganancia azul, egresos naranja, pérdida rojo */
    :host { --in: #1565C0; --out: #C2710A; --gain: #1565C0; --loss: #C62828; --good: #15803D; --warn: #B45309; --bad: #B91C1C; }
    .ind-goal { max-width: 140px; }

    /* Lectura */
    .ind-story { margin-bottom: 14px; }
    .ind-story ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; }
    .ind-story li { display: flex; gap: 9px; align-items: flex-start; font-size: 13px; line-height: 1.45; color: #1F2937; }
    .ind-icon { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #fff; }
    .ind-t--good .ind-icon { background: var(--good); } .ind-t--warn .ind-icon { background: var(--warn); }
    .ind-t--bad .ind-icon { background: var(--bad); } .ind-t--na .ind-icon { background: #6B7280; }

    /* Tarjetas de indicador */
    .ind-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .ind-kpi { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 14px 16px 10px; background: #fff; border: 1px solid #E5EAF1; border-radius: 12px; }
    .ind-kpi-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ind-kpi-label { font-size: 12.5px; font-weight: 600; color: #4B5563; }
    .ind-kpi-value { font-size: 24px; font-weight: 700; color: #0A2540; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ind-neg { color: var(--loss) !important; }
    .ind-delta { font-size: 12px; font-weight: 600; white-space: nowrap; }
    .ind-delta.ind-t--good { color: var(--good); } .ind-delta.ind-t--bad { color: var(--bad); }
    .ind-delta.ind-t--warn { color: var(--warn); } .ind-delta.ind-t--na { color: #6B7280; font-weight: 500; }
    .ind-spark { width: 100%; height: 28px; margin-top: 6px; overflow: visible; }
    .ind-spark-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .ind-spark-zero { stroke: #D5DEEA; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .ind-spark-cap { font-size: 10.5px; color: #9CA3AF; }

    .ind-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .ind-badge.ind-t--good { background: #DCF5E6; color: var(--good); }
    .ind-badge.ind-t--warn { background: #FEF1D6; color: var(--warn); }
    .ind-badge.ind-t--bad { background: #FDE2E2; color: var(--bad); }
    .ind-badge.ind-t--na { background: #F1F4F9; color: #4B5563; }

    /* Gráficas */
    .ind-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; }
    .ind-grid--even { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ind-grid .kit-card { margin: 0; }
    .ind-chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
    .ind-chart-head .kit-card-title { margin: 0; }
    .ind-chart-head .kit-card-sub { margin: 3px 0 0; }   /* el kit trae margen negativo: aquí montaba el subtítulo sobre el título */
    .ind-legend { display: flex; gap: 12px; font-size: 12px; color: #374151; flex-shrink: 0; }
    .ind-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .ind-sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
    .ind-sw--in, .ind-sw--gain { background: var(--in); } .ind-sw--out { background: var(--out); } .ind-sw--loss { background: var(--loss); }

    .ind-plot { position: relative; }
    .ind-plot svg { width: 100%; height: auto; display: block; }
    .ind-grid-line { stroke: #EEF1F5; stroke-width: 1; }
    .ind-zero { stroke: #9CA3AF; stroke-width: 1.2; }
    .ind-tick { font-size: 10px; fill: #6B7280; text-anchor: end; font-variant-numeric: tabular-nums; }
    .ind-x { font-size: 11.5px; fill: #6B7280; text-anchor: middle; }
    .ind-x.cur { fill: #0A2540; font-weight: 700; }
    .ind-val { font-size: 10.5px; font-weight: 700; fill: #0A2540; text-anchor: middle; }
    .ind-bar-in, .ind-bar-gain { fill: var(--in); } .ind-bar-out { fill: var(--out); } .ind-bar-loss { fill: var(--loss); }
    .ind-hit { fill: transparent; cursor: pointer; outline: none; }
    .ind-hit.on { fill: #F2F7FE; }

    .ind-tip { position: absolute; top: 0; transform: translateX(-50%); z-index: 2; display: flex; flex-direction: column; gap: 3px; min-width: 170px;
      padding: 8px 10px; border-radius: 8px; background: #0A2540; color: #fff; font-size: 11.5px; pointer-events: none; box-shadow: 0 6px 18px rgba(10, 37, 64, .25); }
    .ind-tip strong { font-size: 12px; margin-bottom: 2px; }
    .ind-tip span { display: flex; align-items: center; gap: 6px; }
    .ind-tip b { margin-left: auto; font-weight: 700; }
    .ind-tip .ind-neg { color: #FCA5A5 !important; }
    .ind-tip-sep { padding-top: 4px; margin-top: 2px; border-top: 1px solid rgba(255, 255, 255, .18); }

    /* Gastos */
    .ind-spend { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
    .ind-spend-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; font-size: 12.5px; color: #1F2937; }
    .ind-track { display: block; height: 8px; border-radius: 999px; background: #F3EEE6; overflow: hidden; }
    .ind-track span { display: block; height: 100%; border-radius: 999px; background: var(--out); }
    .ind-empty { margin: 30px 0; text-align: center; font-size: 12.5px; color: #9CA3AF; }

    /* Salud */
    .ind-health { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .ind-health-head { display: flex; align-items: center; gap: 8px; }
    .ind-health-name { font-size: 13px; font-weight: 600; color: #1F2937; }
    .ind-health-head strong { margin-left: auto; font-size: 14px; color: #0A2540; }
    .ind-meter { position: relative; height: 8px; margin: 8px 0 3px; border-radius: 999px; background: #EEF1F5; }
    .ind-zone { position: absolute; top: 0; height: 100%; }
    .ind-zone:first-child { border-radius: 999px 0 0 999px; } .ind-zone:last-of-type { border-radius: 0 999px 999px 0; }
    .ind-z--good { background: #BFE9CF; } .ind-z--warn { background: #FBE2B0; } .ind-z--bad { background: #F8C9C9; }
    .ind-needle { position: absolute; top: -4px; width: 4px; height: 16px; margin-left: -2px; border-radius: 2px; background: #0A2540; box-shadow: 0 0 0 2px #fff; }
    .ind-goal-mark { position: absolute; top: -3px; width: 2px; height: 14px; margin-left: -1px; background: var(--good); }
    .ind-scale { display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF; }
    .ind-explain { margin: 4px 0 0; font-size: 12px; line-height: 1.45; color: #4B5563; }

    /* Tabla */
    .ind-table td small { display: block; font-size: 11px; color: #9CA3AF; margin-top: 1px; }

    @media (max-width: 1200px) { .ind-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 1100px) { .ind-grid, .ind-grid--even { grid-template-columns: 1fr; } .ind-story ul { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .ind-kpis { grid-template-columns: 1fr; } .ind-chart-head { flex-direction: column; } }
  `],
})
export class IndicatorsComponent {
  readonly money = fmtMoney;
  readonly name = periodName;
  readonly abbr = monthAbbr;
  readonly dmy = dmy;
  readonly Math = Math;
  get user(): string { return this.svc.actor; }

  periods: string[] = [];
  period: string;
  compare: string;
  goal = 15;
  c!: Snapshot;
  p!: Snapshot;
  months: ({ p: string } & Snapshot)[] = [];
  kpis: { label: string; value: number; delta: Delta; badge?: string; badgeTone?: Tone; points: string; lastY: number; zeroY: number | null; color: string }[] = [];
  insights: Insight[] = [];
  spend: { name: string; amount: number; pct: number }[] = [];
  health: Health[] = [];
  rows: Row[] = [];
  barTicks: number[] = [];
  barMax = 1;
  resultTicks: number[] = [];
  resultMin = 0;
  resultMax = 1;
  hoverBars = -1;
  hoverResult = -1;
  generatedAt = isoDateTime();

  constructor(public svc: AccountingService, private audit: UsersService) {
    this.period = svc.openPeriod;
    this.compare = shiftMonth(svc.openPeriod, -1);
    svc.getEntries().subscribe(() => {
      this.periods = svc.periods();
      this.compute();
    });
    this.audit.addLog('Contabilidad: indicadores consultados', periodName(this.period));
  }

  short(v: number): string {
    const a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
    if (a >= 1_000) return `${sign}$${Math.round(a / 1_000).toLocaleString('es-CO')} mil`;
    return `${sign}$${Math.round(a)}`;
  }
  fmtPct(v: number): string { return `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`; }
  icon(t: Tone): string { return t === 'good' ? '✓' : t === 'bad' ? '!' : t === 'warn' ? '!' : 'i'; }
  meaningfulMonth = meaningful;
  private lc(p: string): string { return periodName(p).split(' ')[0].toLowerCase(); }

  // ── Datos ──
  private snapshot(all: Entry[], period: string): Snapshot {
    const from = monthStart(period), to = monthEnd(period);
    const r = pnl(all, from, to);
    const b = balances(all.filter(e => !isClosing(e)), from, to);
    // Gastos y costos de personal: 5105 administración, 5205 ventas, 7205 mano de obra
    const payroll = [...b].filter(([k]) => ['5105', '5205', '7205'].some(p => k.startsWith(p))).reduce((s, [, v]) => s + v, 0);
    const sheet = balanceSheet(all, to);
    const isCash = (k: string) => k.startsWith('1105') || k.startsWith('1110');
    // Flujo operativo: movimiento de caja y bancos sin traslados, créditos ni inversiones
    const cashFlow = all.filter(e => counts(e) && e.date >= from && e.date <= to && e.kind !== 'Apertura').reduce((s, e) => {
      const cash = e.lines.filter(l => isCash(l.account)).reduce((a, l) => a + l.debit - l.credit, 0);
      const other = e.lines.find(l => !isCash(l.account))?.account ?? '';
      return other.startsWith('21') || other.startsWith('15') ? s : s + cash;
    }, 0);
    const expenses = r.expenses + r.tax;
    return {
      income: r.income, expenses, profit: r.net, margin: r.income ? r.profit / r.income * 100 : 0, payroll, cashFlow,
      currentAssets: sheet.currentAssets, currentLiabilities: sheet.currentLiabilities,
      current: sheet.currentLiabilities ? sheet.currentAssets / sheet.currentLiabilities : 0,
      debt: sheet.assets ? sheet.liabilities / sheet.assets * 100 : 0,
      cash: sheet.lines.filter(l => l.code.startsWith('11')).reduce((s, l) => s + l.value, 0),
    };
  }

  compute(): void {
    const all = this.svc.snapshot();
    this.c = this.snapshot(all, this.period);
    this.p = this.snapshot(all, this.compare);
    this.months = Array.from({ length: 6 }, (_, i) => shiftMonth(this.period, i - 5)).map(p => ({ p, ...this.snapshot(all, p) }));

    const top = Math.max(1, ...this.months.flatMap(m => [m.income, m.expenses]));
    const step = niceStep(Math.max(top, 100_000));
    this.barMax = Math.ceil(top / step) * step;
    this.barTicks = Array.from({ length: Math.round(this.barMax / step) + 1 }, (_, i) => i * step);

    const lo = Math.min(0, ...this.months.map(m => m.profit)), hi = Math.max(0, ...this.months.map(m => m.profit));
    const rStep = niceStep(Math.max(hi - lo, 100_000));
    this.resultMin = Math.floor(lo / rStep) * rStep;
    this.resultMax = Math.max(Math.ceil(hi / rStep) * rStep, this.resultMin === 0 ? rStep : 0);
    this.resultTicks = [];
    for (let t = this.resultMin; t <= this.resultMax + 1; t += rStep) this.resultTicks.push(Math.round(t));

    this.kpis = this.buildKpis();
    this.spend = this.buildSpend(all);
    this.health = this.buildHealth();
    this.insights = this.buildInsights();
    this.rows = this.buildRows();
    this.generatedAt = isoDateTime();
  }

  // ── Geometría (barras con extremo redondeado y anclado a la base) ──
  colX(i: number): number { return 106 + i * 88; }
  by(v: number): number { return 210 - Math.max(0, v) / this.barMax * 195; }
  rx(i: number): number { return 92 + i * 58; }
  ry(v: number): number { return 210 - (v - this.resultMin) / (this.resultMax - this.resultMin || 1) * 195; }

  /** Barra hacia arriba desde la base, con 4 px redondeados solo arriba. */
  bar(x: number, v: number, w = 23): string {
    const y = this.by(v), base = 210, h = base - y;
    if (h <= 0.5) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
  }

  /** Barra desde el cero: hacia arriba si gana, hacia abajo si pierde (extremo redondeado en la punta). */
  resultBar(x: number, v: number, w = 28): string {
    const z = this.ry(0), y = this.ry(v), h = Math.abs(z - y);
    if (h <= 0.5) return '';
    const r = Math.min(4, h, w / 2);
    return v >= 0
      ? `M${x},${z}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${z}Z`
      : `M${x},${z}V${y - r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y - r}V${z}Z`;
  }

  get barsLabel(): string { return this.months.map(m => `${periodName(m.p)}: ingresos ${this.money(m.income)}, egresos ${this.money(m.expenses)}`).join('; '); }
  get resultLabel(): string { return this.months.map(m => `${periodName(m.p)}: ${m.profit >= 0 ? 'ganancia' : 'pérdida'} ${this.money(m.profit)}`).join('; '); }

  // ── Comparaciones en palabras ──
  /** "$1,4 M menos que septiembre": la diferencia en pesos, que siempre se entiende (el % de dos pérdidas confunde). */
  private moneyDelta(cur: number, prev: number, higherIsBetter: boolean): Delta {
    const d = cur - prev;
    if (Math.abs(d) < 1) return { text: `igual que ${this.lc(this.compare)}`, tone: 'na', arrow: '' };
    const better = higherIsBetter ? d > 0 : d < 0;
    return { text: `${this.short(Math.abs(d))} ${d > 0 ? 'más' : 'menos'} que ${this.lc(this.compare)}`, tone: better ? 'good' : 'bad', arrow: d > 0 ? '▲' : '▼' };
  }

  private sparkFor(values: number[]): { points: string; lastY: number; zeroY: number | null } {
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const y = (v: number) => 25 - (v - lo) / span * 22;
    return {
      points: values.map((v, i) => `${i * 24},${y(v).toFixed(1)}`).join(' '),
      lastY: y(values[values.length - 1]),
      zeroY: lo < 0 && hi > 0 ? y(0) : null,
    };
  }

  private buildKpis() {
    const c = this.c, p = this.p, ms = this.months;
    return [
      { label: 'Ingresos', value: c.income, delta: this.moneyDelta(c.income, p.income, true), color: '#1565C0', ...this.sparkFor(ms.map(m => m.income)) },
      { label: 'Egresos', value: c.expenses, delta: this.moneyDelta(c.expenses, p.expenses, false), color: '#C2710A', ...this.sparkFor(ms.map(m => m.expenses)) },
      { label: 'Resultado del mes', value: c.profit, badge: c.profit >= 0 ? 'Ganancia' : 'Pérdida', badgeTone: (c.profit >= 0 ? 'good' : 'bad') as Tone,
        delta: this.moneyDelta(c.profit, p.profit, true), color: c.profit >= 0 ? '#1565C0' : '#C62828', ...this.sparkFor(ms.map(m => m.profit)) },
      { label: 'Efectivo disponible', value: c.cash, badge: c.cash < 0 ? 'Revisar' : undefined, badgeTone: 'warn' as Tone,
        delta: this.moneyDelta(c.cash, p.cash, true), color: '#0A2540', ...this.sparkFor(ms.map(m => m.cash)) },
    ];
  }

  /** Egresos del período agrupados por cuenta de 4 dígitos (Gastos de personal, Servicios…), los 6 mayores + Otros. */
  private buildSpend(all: Entry[]) {
    const b = balances(all.filter(e => !isClosing(e)), monthStart(this.period), monthEnd(this.period));
    const groups = new Map<string, number>();
    b.forEach((v, code) => {
      if (!['5', '6', '7'].includes(code[0]) || v <= 0) return;
      const g = code.slice(0, 4);
      groups.set(g, (groups.get(g) ?? 0) + v);
    });
    const total = [...groups.values()].reduce((a, v) => a + v, 0);
    if (!total) return [];
    const sorted = [...groups].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6).map(([g, amount]) => ({ name: GROUPS[g] ?? accountByCode(g)?.name ?? `Cuenta ${g}`, amount }));
    const rest = sorted.slice(6).reduce((a, [, v]) => a + v, 0);
    if (rest > 0) top.push({ name: 'Otros', amount: rest });
    return top.map(s => ({ ...s, pct: s.amount / total * 100 }));
  }

  private buildHealth(): Health[] {
    const c = this.c, goal = this.goal;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const out: Health[] = [];

    // Margen: barra de −50 % a +50 %
    if (meaningful(c)) {
      const tone: Tone = c.margin >= goal ? 'good' : c.margin >= 0 ? 'warn' : 'bad';
      out.push({ name: 'Margen de rentabilidad', value: this.fmtPct(c.margin), tone,
        status: tone === 'good' ? 'Cumple la meta' : tone === 'warn' ? 'Bajo la meta' : 'Con pérdida',
        explain: `De cada $100 que entraron quedaron $${Math.round(c.margin)} de ${c.margin >= 0 ? 'ganancia' : 'pérdida'} (antes de impuestos). La meta es ${goal}%.`,
        pct: clamp((c.margin + 50), 0, 100), mark: clamp(goal + 50, 0, 100),
        zones: [{ from: 0, to: 50, tone: 'bad' }, { from: 50, to: clamp(goal + 50, 50, 100), tone: 'warn' }, { from: clamp(goal + 50, 50, 100), to: 100, tone: 'good' }],
        scale: ['−50%', '0%', '+50%'] });
    } else {
      out.push({ name: 'Margen de rentabilidad', value: 'No aplica', tone: 'na', status: 'Sin base', pct: 0, zones: [], scale: [],
        explain: c.income <= 0
          ? 'No hubo ingresos en el mes, así que no se puede calcular qué porcentaje quedó de ganancia.'
          : `Los ingresos (${this.short(c.income)}) son muy bajos frente a los egresos (${this.short(c.expenses)}); el porcentaje sería engañoso. Mira el resultado en pesos.` });
    }

    // Razón corriente: cuántos pesos de activo corriente hay por cada peso de deuda de corto plazo (0 a 3)
    if (c.currentLiabilities > 0 && c.currentAssets >= 0) {
      const tone: Tone = c.current >= 1.5 ? 'good' : c.current >= 1 ? 'warn' : 'bad';
      out.push({ name: 'Liquidez (razón corriente)', value: c.current.toFixed(2).replace('.', ','), tone,
        status: tone === 'good' ? 'Holgada' : tone === 'warn' ? 'Justa' : 'Insuficiente',
        explain: `Por cada $1 que se debe a corto plazo hay $${c.current.toFixed(2).replace('.', ',')} en caja, bancos y cuentas por cobrar. Lo sano es más de $1,50.`,
        pct: clamp(c.current / 3 * 100, 0, 100),
        zones: [{ from: 0, to: 33.3, tone: 'bad' }, { from: 33.3, to: 50, tone: 'warn' }, { from: 50, to: 100, tone: 'good' }], scale: ['0', '1', '1,5', '3'] });
    } else {
      out.push({ name: 'Liquidez (razón corriente)', value: c.currentAssets < 0 ? 'Revisar' : 'Sin deudas', tone: c.currentAssets < 0 ? 'bad' : 'good',
        status: c.currentAssets < 0 ? 'Saldos negativos' : 'Sin deudas de corto plazo', pct: 0, zones: [], scale: [],
        explain: c.currentAssets < 0
          ? `El activo corriente da negativo (${this.short(c.currentAssets)}): caja o bancos tienen salidas registradas sin su entrada. Revisa el libro auxiliar de 1105 y 1110 en Contabilidad › Libro mayor.`
          : 'No hay obligaciones de corto plazo registradas al cierre del período.' });
    }

    // Endeudamiento: % de los activos financiado con deuda (0 a 100)
    const dTone: Tone = c.debt < 40 ? 'good' : c.debt < 60 ? 'warn' : 'bad';
    out.push({ name: 'Endeudamiento', value: this.fmtPct(c.debt), tone: dTone, status: dTone === 'good' ? 'Bajo' : dTone === 'warn' ? 'Moderado' : 'Alto',
      explain: `De cada $100 en bienes y dinero del hospedaje, $${Math.round(c.debt)} se deben a terceros. Por debajo de 40% es un nivel tranquilo.`,
      pct: clamp(c.debt, 0, 100), zones: [{ from: 0, to: 40, tone: 'good' }, { from: 40, to: 60, tone: 'warn' }, { from: 60, to: 100, tone: 'bad' }], scale: ['0%', '40%', '60%', '100%'] });

    // Nómina como parte de los egresos (siempre entre 0 y 100, a diferencia de nómina / ingresos)
    const share = c.expenses > 0 ? c.payroll / c.expenses * 100 : 0;
    const pTone: Tone = share <= 50 ? 'good' : share <= 70 ? 'warn' : 'bad';
    out.push({ name: 'Peso de la nómina en los egresos', value: this.fmtPct(share), tone: c.expenses > 0 ? pTone : 'na',
      status: c.expenses <= 0 ? 'Sin egresos' : pTone === 'good' ? 'Normal' : pTone === 'warn' ? 'Alto' : 'Muy alto',
      explain: `De cada $100 que salieron, $${Math.round(share)} fueron salarios y prestaciones del personal.`,
      pct: clamp(share, 0, 100), zones: [{ from: 0, to: 50, tone: 'good' }, { from: 50, to: 70, tone: 'warn' }, { from: 70, to: 100, tone: 'bad' }], scale: ['0%', '50%', '70%', '100%'] });
    return out;
  }

  /** Frases cortas que explican el mes sin tecnicismos. */
  private buildInsights(): Insight[] {
    const c = this.c, p = this.p, mes = this.lc(this.period), comp = this.lc(this.compare);
    const out: Insight[] = [];
    out.push({ tone: c.profit >= 0 ? 'good' : 'bad',
      text: `En ${mes} entraron ${this.short(c.income)} y salieron ${this.short(c.expenses)}: el mes cerró con ${c.profit >= 0 ? 'ganancia' : 'pérdida'} de ${this.short(Math.abs(c.profit))}.` });
    if (Math.abs(c.profit - p.profit) >= 1) {
      const better = c.profit > p.profit;
      out.push({ tone: better ? 'good' : 'bad',
        text: `Frente a ${comp} el resultado ${better ? 'mejoró' : 'empeoró'} en ${this.short(Math.abs(c.profit - p.profit))}${p.profit < 0 && c.profit < 0 && better ? ' (sigue en pérdida, pero menor)' : ''}.` });
    }
    if (this.spend[0]) out.push({ tone: 'na', text: `El mayor gasto fue ${this.spend[0].name.toLowerCase()}: ${this.short(this.spend[0].amount)}, el ${Math.round(this.spend[0].pct)}% de los egresos.` });
    if (c.income > 0 && c.income < c.expenses * 0.25) out.push({ tone: 'warn', text: `Los ingresos solo cubren el ${Math.round(c.income / c.expenses * 100)}% de los egresos. Revisa si faltan facturas o ingresos por contabilizar.` });
    else if (c.income <= 0) out.push({ tone: 'warn', text: `No hay ingresos contabilizados en ${mes}. Revisa en Contabilidad › Integración si faltan las facturas o los pagos de reservas.` });
    if (c.cash < 0) out.push({ tone: 'bad', text: `El efectivo en caja y bancos da negativo (${this.short(c.cash)}): faltan entradas por registrar o hay salidas duplicadas.` });
    else out.push({ tone: c.cashFlow >= 0 ? 'good' : 'warn', text: `En caja y bancos ${c.cashFlow >= 0 ? 'entró' : 'salió'} más de lo que ${c.cashFlow >= 0 ? 'salió' : 'entró'}: ${this.short(Math.abs(c.cashFlow))}. Hay ${this.short(c.cash)} disponibles.` });
    return out;
  }

  private buildRows(): Row[] {
    const c = this.c, p = this.p, money = (v: number) => this.money(v);
    const pctTxt = (s: Snapshot, v: number) => meaningful(s) ? this.fmtPct(v).replace('.', ',') : 'no aplica';
    const pp = (a: number, b: number, higherIsBetter: boolean, ok = true): Delta => {
      if (!ok) return { text: '—', tone: 'na', arrow: '' };
      const d = a - b;
      if (Math.abs(d) < 0.05) return { text: 'igual', tone: 'na', arrow: '' };
      return { text: `${Math.abs(d).toLocaleString('es-CO', { maximumFractionDigits: 1 })} pp`, tone: (higherIsBetter ? d > 0 : d < 0) ? 'good' : 'bad', arrow: d > 0 ? '▲' : '▼' };
    };
    const share = (s: Snapshot) => s.expenses > 0 ? s.payroll / s.expenses * 100 : 0;
    return [
      { name: 'Ingresos', formula: 'Operacionales + no operacionales', cur: money(c.income), prev: money(p.income), delta: this.moneyDelta(c.income, p.income, true),
        reading: c.income < p.income ? 'Entró menos dinero que en el período de comparación' : c.income > p.income ? 'Entró más dinero' : 'Sin cambio' },
      { name: 'Egresos', formula: 'Costos + gastos + impuestos', cur: money(c.expenses), prev: money(p.expenses), delta: this.moneyDelta(c.expenses, p.expenses, false),
        reading: c.expenses > p.expenses ? 'Se gastó más' : c.expenses < p.expenses ? 'Se gastó menos' : 'Sin cambio' },
      { name: 'Resultado del mes', formula: 'Ingresos − egresos', cur: money(c.profit), prev: money(p.profit), delta: this.moneyDelta(c.profit, p.profit, true),
        reading: c.profit < 0 ? (c.profit > p.profit ? 'Pérdida, pero menor que antes' : 'El mes cierra con pérdida') : 'El mes cierra con ganancia' },
      { name: 'Margen de rentabilidad', formula: 'Resultado antes de impuestos / ingresos', cur: pctTxt(c, c.margin), prev: pctTxt(p, p.margin),
        delta: pp(c.margin, p.margin, true, meaningful(c) && meaningful(p)),
        reading: !meaningful(c) ? 'Ingresos muy bajos para medirlo en porcentaje' : c.margin >= this.goal ? `Cumple la meta del ${this.goal}%` : `Por debajo de la meta del ${this.goal}%` },
      { name: 'Peso de la nómina', formula: 'Gastos de personal / egresos', cur: this.fmtPct(share(c)), prev: this.fmtPct(share(p)), delta: pp(share(c), share(p), false),
        reading: share(c) > 50 ? 'La nómina es el gasto principal' : 'Dentro de lo esperado' },
      { name: 'Flujo de caja operativo', formula: 'Entradas − salidas de caja y bancos', cur: money(c.cashFlow), prev: money(p.cashFlow), delta: this.moneyDelta(c.cashFlow, p.cashFlow, true),
        reading: `${c.cashFlow >= 0 ? 'Entró más de lo que salió' : 'Salió más de lo que entró'} · disponible ${money(c.cash)}` },
      { name: 'Liquidez (razón corriente)', formula: 'Activo corriente / pasivo corriente', cur: c.currentAssets < 0 ? 'revisar' : c.current.toFixed(2).replace('.', ','), prev: p.currentAssets < 0 ? 'revisar' : p.current.toFixed(2).replace('.', ','),
        delta: c.currentAssets < 0 || p.currentAssets < 0 ? { text: '—', tone: 'na', arrow: '' } : pp(c.current * 100, p.current * 100, true),
        reading: c.currentAssets < 0 ? 'Activo corriente negativo: revisar saldos de caja y bancos' : c.current < 1 ? 'Las deudas de corto plazo superan lo disponible' : 'Cubre las deudas de corto plazo' },
      { name: 'Endeudamiento', formula: 'Pasivo total / activo total', cur: this.fmtPct(c.debt), prev: this.fmtPct(p.debt), delta: pp(c.debt, p.debt, false),
        reading: c.debt < 40 ? 'Nivel bajo' : c.debt < 60 ? 'Nivel moderado' : 'Nivel alto' },
    ];
  }

  export(): void {
    downloadCsvFile([['Indicador', 'Fórmula', periodName(this.period), periodName(this.compare), 'Cambio', 'Qué significa'],
      ...this.rows.map(r => [r.name, r.formula, r.cur, r.prev, `${r.delta.arrow} ${r.delta.text}`.trim(), r.reading])], `indicadores-${this.period}.csv`);
    this.svc.logExport('Indicadores financieros.csv', periodName(this.period));
  }
}
