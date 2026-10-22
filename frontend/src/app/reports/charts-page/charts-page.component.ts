import { Component, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, MonthSummary } from '../reports.service';
import { pct, num, money, millions, dm, dmy, monthLabel, monthName, monthShort, lastMonths, linearTrend, addDays, COLORS, CHANNEL_COLORS } from '../reports.model';
import { CHANNELS } from '../../reservations/reservation.model';
import { BarsComponent, LinesComponent, DonutComponent, Series, Slice } from '../charts/charts';
import { downloadPng, chartsPdf } from '../charts/chart-export';

type ChartType = 'Barras' | 'Líneas' | 'Circular' | 'Tendencia';
type Source = 'Financiero · ingresos' | 'Financiero · egresos' | 'Ocupación' | 'Reservas' | 'Inventario · consumo';
interface SourceDef { unit: string; tick: (v: number) => string; value: (v: number) => string; monthly: (m: MonthSummary) => number; breakdown: () => Slice[]; breakdownLabel: string; }

const PALETTE = [COLORS.blue, COLORS.amber, COLORS.purple, COLORS.gray, COLORS.green, COLORS.red, '#0E7490', '#9D174D'];

@Component({
  selector: 'app-reports-charts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BarsComponent, LinesComponent, DonutComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Gráficos estadísticos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Gráficos estadísticos</h1>
      <p class="kit-sub">Visualiza la información en barras, líneas, gráfico circular o tendencia · pasa el cursor para ver el detalle.</p>
    </div>
    <div class="kit-actions"><button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport()" (click)="allPdf()">Descargar todos (PDF)</button></div>
  </header>

  <section class="kit-card rp-filters ch-bar">
    <label class="kit-select"><span>Fuente de datos</span><select [(ngModel)]="source" (ngModelChange)="compute()"><option *ngFor="let s of sources" [value]="s">{{ s }}</option></select></label>
    <label class="kit-select"><span>Período</span><select [(ngModel)]="span" (ngModelChange)="compute()"><option *ngFor="let n of spans" [ngValue]="n">{{ spanLabel(n) }}</option></select></label>
    <div class="ch-types" role="radiogroup" aria-label="Tipo de gráfico">
      <button type="button" *ngFor="let t of types" role="radio" [attr.aria-checked]="type === t" [class.active]="type === t" (click)="type = t; compute()">{{ t }}</button>
    </div>
  </section>

  <div class="rp-grid rp-grid--2">
    <section class="kit-card" data-chart="custom">
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">{{ customTitle }} <span class="ch-tag">{{ type }}</span></h2><p class="kit-card-sub">{{ customSub }}</p></div>
        <div class="ch-dl" *ngIf="svc.canExport()"><button type="button" (click)="png('custom', customTitle, customSub)">PNG</button><button type="button" (click)="pdf('custom', customTitle, customSub)">PDF</button></div>
      </div>
      <div class="ch-host" id="ch-custom">
        <rp-bars *ngIf="type === 'Barras'" [labels]="labels" [series]="[{ name: source, color: C.blue, values: values, colors: barColors }]" valuesShown="last"
                 [tick]="def.tick" [valueLabel]="def.value" [tooltip]="tip" [aria]="customTitle"></rp-bars>
        <rp-lines *ngIf="type === 'Líneas'" [labels]="labels" [series]="[{ name: source, color: C.blue, values: values, area: true }]" valuesShown="maxlast"
                  [tick]="def.tick" [valueLabel]="def.value" [tooltip]="tip" [aria]="customTitle"></rp-lines>
        <rp-lines *ngIf="type === 'Tendencia'" [labels]="trendLabels" [series]="trendSeries" valuesShown="last" [tick]="def.tick" [valueLabel]="def.value" [tooltip]="tip" [aria]="customTitle"></rp-lines>
        <div class="ch-donut" *ngIf="type === 'Circular'">
          <div class="ch-donut-svg"><rp-donut [slices]="slices" [center]="sliceTotal" [sub]="def.unit" [aria]="customTitle"></rp-donut></div>
          <div class="rp-donut-legend"><ng-container *ngFor="let s of slices"><i [style.background]="s.color"></i><span>{{ s.label }}</span><strong>{{ def.value(s.value) }}</strong><small>{{ share(s.value) }}</small></ng-container></div>
        </div>
      </div>
      <p class="rp-note" *ngIf="type === 'Tendencia'">{{ trendNote }}</p>
    </section>

    <section class="kit-card">
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">Ocupación mensual <span class="ch-tag ch-tag--green">Líneas</span></h2><p class="kit-card-sub">% de noches ocupadas · {{ spanText }}</p></div>
        <div class="ch-dl" *ngIf="svc.canExport()"><button type="button" (click)="png('occ', 'Ocupación mensual', spanText)">PNG</button><button type="button" (click)="pdf('occ', 'Ocupación mensual', spanText)">PDF</button></div>
      </div>
      <div class="ch-host" id="ch-occ">
        <rp-lines [labels]="labels" [series]="[{ name: 'Ocupación', color: C.blue, values: occValues, area: true }]" [yMax]="100" valuesShown="maxlast"
                  [tick]="tickPct" [valueLabel]="valuePct" [tooltip]="occTip" aria="Ocupación mensual"></rp-lines>
      </div>
    </section>

    <section class="kit-card">
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">Ingresos por fuente · {{ monthName(svc.livePeriod) }} <span class="ch-tag ch-tag--purple">Circular</span></h2><p class="kit-card-sub">Participación en el total · mes en curso</p></div>
        <div class="ch-dl" *ngIf="svc.canExport()"><button type="button" (click)="png('src', 'Ingresos por fuente', monthLabel(svc.livePeriod))">PNG</button><button type="button" (click)="pdf('src', 'Ingresos por fuente', monthLabel(svc.livePeriod))">PDF</button></div>
      </div>
      <div class="ch-host ch-donut" id="ch-src">
        <div class="ch-donut-svg"><rp-donut [slices]="incomeSlices" [center]="'$ ' + millions(incomeTotal)" sub="ingresos" aria="Ingresos por fuente"></rp-donut></div>
        <div class="rp-donut-legend"><ng-container *ngFor="let s of incomeSlices"><i [style.background]="s.color"></i><span>{{ s.label }}</span><strong>{{ millions(s.value) }}</strong><small>{{ pct(incomeTotal ? s.value / incomeTotal * 100 : 0) }}</small></ng-container></div>
      </div>
    </section>

    <section class="kit-card">
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">Ingresos por semana <span class="ch-tag ch-tag--amber">Tendencia</span></h2><p class="kit-card-sub">Millones de COP contabilizados por semana (inicio de semana) · mes en curso · con proyección</p></div>
        <div class="ch-dl" *ngIf="svc.canExport()"><button type="button" (click)="png('week', 'Ingresos por semana', 'Mes en curso con proyección')">PNG</button><button type="button" (click)="pdf('week', 'Ingresos por semana', 'Mes en curso con proyección')">PDF</button></div>
      </div>
      <div class="rp-legend"><span><i [style.background]="C.amber"></i>Ingresos reales</span><span><i class="line" [style.background]="C.blue"></i>Tendencia y proyección</span></div>
      <div class="ch-host" id="ch-week">
        <rp-lines [labels]="weekLabels" [series]="weekSeries" valuesShown="last" [tick]="tickM" [valueLabel]="valueM" [tooltip]="weekTip" aria="Ingresos por semana"></rp-lines>
      </div>
      <p class="rp-note">{{ weekNote }}</p>
    </section>
  </div>

  <section class="kit-card ch-foot">
    <span class="ch-foot-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></svg></span>
    <div><strong>Descargar gráfico</strong><p>Cada gráfico se puede descargar como imagen (PNG) o documento (PDF) con título, período y fecha de generación.</p></div>
  </section>
  `,
  styles: [`
    .ch-bar { align-items: center; }
    .ch-types { display: inline-flex; background: #EEF2F7; border-radius: 11px; padding: 4px; gap: 2px; margin-left: auto; }
    .ch-types button { border: none; background: transparent; padding: 8px 14px; border-radius: 8px; font: inherit; font-size: 12.5px; font-weight: 600; color: #4B5563; cursor: pointer; }
    .ch-types button.active { background: #fff; color: #0A2540; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
    .ch-tag { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 6px; background: #E3EEFB; color: #1565C0; font-size: 11px; font-weight: 700; vertical-align: 2px; }
    .ch-tag--green { background: #E2F5EC; color: #1F7A52; } .ch-tag--purple { background: #EFE7FC; color: #6D3FC8; } .ch-tag--amber { background: #FDEBD8; color: #B45309; }
    .ch-dl { display: flex; gap: 6px; }
    .ch-dl button { border: 1px solid #D5DEEA; background: #fff; border-radius: 8px; padding: 5px 9px; font: inherit; font-size: 11.5px; font-weight: 600; color: #0A2540; cursor: pointer; }
    .ch-dl button:hover { border-color: #0B6FD0; }
    .ch-donut { display: grid; grid-template-columns: minmax(150px, 210px) 1fr; gap: 20px; align-items: center; }
    .ch-foot { display: flex; align-items: center; gap: 14px; }
    .ch-foot-icon { width: 38px; height: 38px; border-radius: 50%; background: #1565C0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .ch-foot-icon svg { width: 18px; height: 18px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .ch-foot p { margin: 2px 0 0; font-size: 12.5px; color: #6B7280; }
    @media (max-width: 600px) { .ch-donut { grid-template-columns: 1fr; } .ch-types { margin-left: 0; } }
  `],
})
export class ChartsPageComponent implements OnDestroy {
  readonly C = COLORS;
  readonly sources: Source[] = ['Financiero · ingresos', 'Financiero · egresos', 'Ocupación', 'Reservas', 'Inventario · consumo'];
  readonly types: ChartType[] = ['Barras', 'Líneas', 'Circular', 'Tendencia'];
  readonly spans = [3, 6, 9];
  readonly pct = pct; readonly millions = millions; readonly monthName = monthName; readonly monthLabel = monthLabel;
  readonly tickPct = (v: number) => `${v} %`;
  readonly valuePct = (v: number) => pct(v);
  readonly tickM = (v: number) => num(v / 1e6, 1);
  readonly valueM = (v: number) => num(v / 1e6, 2);

  source: Source = 'Financiero · ingresos';
  span = 6;
  type: ChartType = 'Barras';
  months: MonthSummary[] = [];
  labels: string[] = []; values: number[] = []; barColors: string[] = [];
  trendLabels: string[] = []; trendSeries: Series[] = []; trendNote = '';
  slices: Slice[] = [];
  occValues: number[] = [];
  incomeSlices: Slice[] = []; incomeTotal = 0;
  weekLabels: string[] = []; weekSeries: Series[] = []; weekNote = '';
  private weeks: { from: string; total: number; expenses: number }[] = [];
  private sub: Subscription;

  constructor(public svc: ReportsService, private el: ElementRef<HTMLElement>) {
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  spanLabel(n: number): string {
    const m = this.monthsFor(n);
    return `${monthShort(m[0])} – ${monthShort(m[m.length - 1])} ${m[m.length - 1].slice(0, 4)}`;
  }
  private monthsFor(n: number): string[] { return this.svc.monthsUpTo(this.svc.livePeriod, n); }
  get spanText(): string { return this.spanLabel(this.span); }

  get def(): SourceDef {
    const s = this.svc, range = s.monthRange(s.livePeriod);
    const moneyDef = { unit: 'millones', tick: this.tickM, value: (v: number) => millions(v) };
    switch (this.source) {
      case 'Financiero · egresos': return { ...moneyDef, monthly: m => m.expenses, breakdownLabel: 'Egresos por categoría',
        breakdown: () => s.financial(range).categories.filter(c => c.value > 0).map((c, i) => ({ label: c.label, value: c.value, color: PALETTE[i % PALETTE.length] })) };
      case 'Ocupación': return { unit: 'noches', tick: this.tickPct, value: this.valuePct, monthly: m => m.occupancy, breakdownLabel: 'Noches por modalidad',
        breakdown: () => s.occupancy(range).byMode.map((b, i) => ({ label: b.mode, value: b.nights, color: PALETTE[i] })) };
      case 'Reservas': return { unit: 'reservas', tick: v => num(v), value: v => num(v), monthly: m => m.reservations, breakdownLabel: 'Reservas por canal',
        breakdown: () => { const st = s.reservationStats(range); return CHANNELS.map(c => ({ label: c, value: st.byChannel[c], color: CHANNEL_COLORS[c] })); } };
      case 'Inventario · consumo': return { ...moneyDef, monthly: m => m.consumption, breakdownLabel: 'Consumo por área',
        breakdown: () => s.inventoryReport(range).byArea.map((a, i) => ({ label: a.area, value: a.value, color: PALETTE[i % PALETTE.length] })) };
      default: return { ...moneyDef, monthly: m => m.income, breakdownLabel: 'Ingresos por fuente',
        breakdown: () => s.financial(range).sources.map((x, i) => ({ label: x.label, value: x.value, color: PALETTE[i] })) };
    }
  }

  get customTitle(): string {
    if (this.type === 'Circular') return `${this.def.breakdownLabel} · ${monthName(this.svc.livePeriod)}`;
    const titles: Record<Source, string> = {
      'Financiero · ingresos': 'Ingresos por mes', 'Financiero · egresos': 'Egresos por mes', Ocupación: 'Ocupación por mes',
      Reservas: 'Reservas por mes', 'Inventario · consumo': 'Consumo de inventario por mes',
    };
    return titles[this.source];
  }
  get customSub(): string {
    if (this.type === 'Circular') return 'Participación en el total · mes en curso';
    return `${this.def.unit === 'millones' ? 'Millones de COP' : this.source === 'Ocupación' ? '% de noches ocupadas' : 'Cantidad'} · ${this.spanText}${this.type === 'Tendencia' ? ' · con proyección de un mes' : ''}`;
  }
  get sliceTotal(): string { const t = this.slices.reduce((a, x) => a + x.value, 0); return this.def.unit === 'millones' ? millions(t) : num(t); }
  share(v: number): string { const t = this.slices.reduce((a, x) => a + x.value, 0); return pct(t ? v / t * 100 : 0); }

  readonly tip = (i: number) => {
    const m = this.months[i];
    if (!m) return [`${this.trendLabels[i] ?? ''} (proyección)`, this.def.value(this.trendSeries[1]?.values[i] ?? 0)];
    const lines = [monthLabel(m.period) + (m.live ? ' (en curso)' : ''), `${this.source.split(' · ')[0]}: ${this.def.value(this.def.monthly(m))}`];
    if (this.source.startsWith('Financiero')) lines.push(`Utilidad ${millions(m.profit)} · margen ${pct(m.margin)}`);
    return lines;
  };
  readonly occTip = (i: number) => { const m = this.months[i]; return m ? [monthLabel(m.period), `${pct(m.occupancy)} · ${m.occupied} de ${m.available} noches`] : []; };
  readonly weekTip = (i: number) => {
    const w = this.weeks[i];
    return w ? [`Semana del ${this.weekLabels[i]}`, `Ingresos ${money(w.total)} · egresos ${money(w.expenses)}`] : [`Semana del ${this.weekLabels[i]}`, `Proyección ${millions(this.weekSeries[1]?.values[i] ?? 0, 2)}`];
  };

  compute(): void {
    const s = this.svc;
    this.months = this.monthsFor(this.span).map(p => s.monthSummary(p));
    const d = this.def;
    this.labels = this.months.map(m => monthShort(m.period));
    this.values = this.months.map(m => d.monthly(m));
    this.barColors = this.months.map(m => m.live ? COLORS.navy : COLORS.blue);
    this.slices = d.breakdown().filter(x => x.value > 0);
    // Tendencia: recta sobre los meses cerrados y proyección al mes siguiente
    const closed = this.months.filter(m => !m.live).map(m => d.monthly(m));
    const t = linearTrend(closed.length >= 2 ? closed : this.values);
    const next = addMonth(this.months[this.months.length - 1].period);
    this.trendLabels = [...this.labels, `${monthShort(next)} (p)`];
    this.trendSeries = [
      { name: 'Real', color: COLORS.amber, values: [...this.values, null] },
      { name: 'Tendencia', color: COLORS.blue, values: [...this.values.map((_, i) => Math.max(0, t.at(i))), Math.max(0, t.at(this.values.length))], dashed: true },
    ];
    const live = this.months.find(m => m.live);
    this.trendNote = `La tendencia usa los meses cerrados (${closed.length}); ${live ? `${monthName(live.period)} va hasta hoy, por eso su valor todavía es parcial. ` : ''}`
      + `Proyección para ${monthName(next)}: ${d.value(Math.max(0, t.at(this.values.length)))}.`;

    this.occValues = this.months.map(m => m.occupancy);
    const fin = s.financial(s.monthRange(s.livePeriod));
    this.incomeSlices = fin.sources.filter(x => x.value > 0).map((x, i) => ({ label: x.label, value: x.value, color: PALETTE[i] }));
    this.incomeTotal = fin.income;

    // Ingresos contabilizados por semana (lunes a domingo) del mes en curso, más 2 semanas de proyección
    const range = s.monthRange(s.livePeriod);
    const firstMonday = addDays(range.from, -((new Date(`${range.from}T12:00`).getDay() + 6) % 7));
    this.weeks = [];
    for (let w = firstMonday; w <= range.to; w = addDays(w, 7)) {
      const r = s.financial({ from: w < range.from ? range.from : w, to: addDays(w, 6) > range.to ? range.to : addDays(w, 6) });
      this.weeks.push({ from: w, total: r.income, expenses: r.expenses });
    }
    // La semana en curso está incompleta: la tendencia se calcula con las completas
    const complete = this.weeks.filter(w => addDays(w.from, 6) <= s.today && w.from >= range.from);
    const wt = linearTrend((complete.length >= 2 ? complete : this.weeks).map(w => w.total));
    const offset = complete.length >= 2 ? this.weeks.indexOf(complete[0]) : 0;
    const total = this.weeks.length + 2;
    this.weekLabels = Array.from({ length: total }, (_, i) => { const w = addDays(firstMonday, i * 7); return dm(w < range.from ? range.from : w); });
    this.weekSeries = [
      { name: 'Ingresos reales', color: COLORS.amber, values: [...this.weeks.map(w => w.total), null, null] },
      { name: 'Tendencia', color: COLORS.blue, dashed: true, values: Array.from({ length: total }, (_, i) => Math.max(0, wt.at(i - offset))) },
    ];
    const lastComplete = complete[complete.length - 1];
    this.weekNote = `${this.weeks.length} semanas del mes (la primera y la actual, incompletas)${lastComplete ? `; la última completa (${dm(lastComplete.from)}) registró ${money(lastComplete.total)} de ingresos` : ''}. `
      + `La tendencia ${wt.slope >= 0 ? 'sube' : 'baja'} ${millions(Math.abs(wt.slope), 2)} por semana; proyección para la semana del ${this.weekLabels[total - 1]}: ${millions(Math.max(0, wt.at(total - 1 - offset)), 2)}.`;
  }

  private host(id: string): Element | null { return this.el.nativeElement.querySelector(`#ch-${id}`); }
  private stamp(): string { const g = this.svc.generatedStamp(); return `${dmy(g)} ${g.slice(11, 16)}`; }

  png(id: string, title: string, sub: string): void {
    const h = this.host(id);
    if (!h) return;
    downloadPng(h, `grafico-${id}-${this.svc.today}.png`, title, `${sub} · generado ${this.stamp()}`);
    this.svc.log('gráfico descargado', `${title}.png`);
  }

  pdf(id: string, title: string, sub: string): void {
    const h = this.host(id);
    if (!h) return;
    chartsPdf(title, this.svc.company, this.stamp(), [{ title, sub, host: h }]);
    this.svc.log('gráfico descargado', `${title}.pdf`);
  }

  allPdf(): void {
    const items = [
      { id: 'custom', title: this.customTitle, sub: this.customSub }, { id: 'occ', title: 'Ocupación mensual', sub: this.spanText },
      { id: 'src', title: 'Ingresos por fuente', sub: monthLabel(this.svc.livePeriod) }, { id: 'week', title: 'Ingresos por semana', sub: 'Mes en curso con proyección' },
    ].map(i => ({ ...i, host: this.host(i.id)! })).filter(i => i.host);
    chartsPdf('Gráficos estadísticos', this.svc.company, this.stamp(), items);
    this.svc.log('gráficos descargados', `${items.length} gráficos en PDF`);
  }
}

function addMonth(p: string): string {
  const d = new Date(+p.slice(0, 4), +p.slice(5, 7), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
