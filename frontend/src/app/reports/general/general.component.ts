import { Component, OnDestroy } from '@angular/core';
import { ReportNavComponent } from '../report-nav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, ReportModule, REPORT_MODULES, MonthSummary } from '../reports.service';
import { Range, Delta, delta, money, pct, num, dmy, dm, monthLabel, monthName, shiftMonth, addDays, rangeLabel } from '../reports.model';
import { CHANNELS } from '../../reservations/reservation.model';
import { productStatus } from '../../inventory/inventory.model';
import { DeltaComponent } from '../delta.component';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';

type Preset = 'Hoy' | 'Semana' | 'Mes actual' | 'Personalizado';
type Status = 'Normal' | 'Revisar' | 'Atención' | string;
interface Row { module: ReportModule; indicator: string; value: string; detail: string; delta: Delta; status: Status; tone: 'ok' | 'warn' | 'danger' | 'muted'; }
interface Kpi { label: string; value: string; delta: Delta; cmp: string; }
const st = (status: Status, tone: Row['tone']) => ({ status, tone });
interface Point { tone: 'warn' | 'danger' | 'info'; text: string; }
interface Report {
  range: Range; compare: string; modules: ReportModule[]; detail: 'Resumen' | 'Detallado';
  kpis: Kpi[]; rows: Row[]; points: Point[]; generatedAt: string; extra: { title: string; head: string[]; rows: string[][] }[];
}

@Component({
  selector: 'app-reports-general',
  standalone: true,
  imports: [ReportNavComponent, CommonModule, FormsModule, RouterLink, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <rp-nav></rp-nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte general del hospedaje</h1>
      <p class="kit-sub">Consolida la información de todos los módulos en un solo reporte, con datos en tiempo real.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!report || !canExport" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!report || !canExport" (click)="csv('CSV')">Excel (CSV)</button>
      <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="canSchedule" (click)="schedule()">Programar envío</button>
    </div>
  </header>
  <p class="kit-banner kit-banner--info" *ngIf="!canExport">Tu rol puede consultar los reportes pero no exportarlos.</p>

  <!-- Configuración: una barra arriba en lugar de una columna lateral -->
  <section class="kit-card gr-config">
    <div class="gr-config-row">
      <div class="gr-field">
        <span class="gr-label">Período</span>
        <div class="gr-seg" role="group" aria-label="Período">
          <button type="button" *ngFor="let p of presets" [class.on]="preset === p" (click)="setPreset(p)">{{ p }}</button>
        </div>
      </div>
      <label class="kit-select gr-date"><span>Desde</span><input type="date" [(ngModel)]="from" [min]="svc.goLive" [max]="to" (ngModelChange)="preset = 'Personalizado'"></label>
      <label class="kit-select gr-date"><span>Hasta</span><input type="date" [(ngModel)]="to" [min]="from" [max]="svc.today" (ngModelChange)="preset = 'Personalizado'"></label>
      <label class="kit-select gr-cmp"><span>Comparar con</span>
        <select [(ngModel)]="compare"><option value="">Sin comparación</option><option *ngFor="let p of compareOptions" [value]="p">{{ monthLabel(p) }}</option></select>
      </label>
      <div class="gr-field">
        <span class="gr-label">Detalle</span>
        <div class="gr-seg" role="group" aria-label="Nivel de detalle">
          <button type="button" [class.on]="detail === 'Resumen'" (click)="detail = 'Resumen'">Resumen</button>
          <button type="button" [class.on]="detail === 'Detallado'" (click)="detail = 'Detallado'">Detallado</button>
        </div>
      </div>
      <button type="button" class="rsv-btn rsv-btn--primary gr-generate" (click)="generate()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>Generar
      </button>
    </div>
    <div class="gr-modules">
      <span class="gr-label">Módulos <small>{{ selected.size }} de {{ allowed.length }}</small></span>
      <button type="button" *ngFor="let m of modules" class="gr-mod" [ngClass]="'gr-mod--' + slug(m)" [class.on]="selected.has(m)"
              [disabled]="!svc.canView(m)" (click)="toggle(m)" [attr.aria-pressed]="selected.has(m)" [title]="svc.canView(m) ? '' : 'Tu rol no tiene permiso'">
        <i aria-hidden="true"></i>{{ m }}
      </button>
    </div>
    <p class="kit-error" *ngIf="error">{{ error }}</p>
    <p class="gr-hint">Datos registrados en SOGO desde el {{ dmy(svc.goLive) }}. La comparación es contra un mes completo.</p>
  </section>

  <section class="gr-preview" *ngIf="report as r">
    <header class="gr-banner">
      <div>
        <span>SOGO · REPORTE GENERAL</span>
        <h2>{{ svc.company }}</h2>
        <p>{{ dmy(r.range.from) }} – {{ dmy(r.range.to) }}<ng-container *ngIf="r.compare"> · comparado con {{ monthName(r.compare) }} {{ r.compare.slice(0, 4) }}</ng-container> · {{ r.detail }}</p>
      </div>
      <div class="gr-banner-stats">
        <div><strong>{{ okCount(r) }}</strong><span>en orden</span></div>
        <div><strong>{{ r.rows.length - okCount(r) }}</strong><span>para revisar</span></div>
      </div>
    </header>
    <div class="gr-body">
      <p class="kit-banner kit-banner--warn" *ngIf="stale">Los datos cambiaron desde que se generó el reporte. <button type="button" class="rsv-btn rsv-btn--outline" (click)="generate()">Actualizar</button></p>

      <div class="kit-kpis rp-kpis">
        <div class="rp-kpi" *ngFor="let k of r.kpis">
          <span>{{ k.label }}</span><strong>{{ k.value }}</strong>
          <div><rp-delta [d]="k.delta"></rp-delta><small class="rp-cmp">{{ k.cmp }}</small></div>
        </div>
      </div>

      <h3 class="gr-h3">Resumen por módulo</h3>
      <div class="gr-cards" *ngIf="r.rows.length; else noRows">
        <a class="gr-card" *ngFor="let row of r.rows" [routerLink]="link(row.module)" [ngClass]="'gr-card--' + slug(row.module)">
          <div class="gr-card-top">
            <span class="rp-module" [ngClass]="'rp-module--' + slug(row.module)">{{ row.module }}</span>
            <span class="rsv-badge" [ngClass]="'rsv-badge--' + row.tone">{{ row.status }}</span>
          </div>
          <span class="gr-card-ind">{{ row.indicator }}</span>
          <strong class="gr-card-val">{{ row.value }}</strong>
          <span class="gr-card-detail">{{ row.detail }}</span>
          <div class="gr-card-foot">
            <span><rp-delta [d]="row.delta"></rp-delta><small *ngIf="!row.delta.none && r.compare">vs {{ monthName(r.compare) }}</small></span>
            <span class="gr-card-go">Ver reporte →</span>
          </div>
        </a>
      </div>
      <ng-template #noRows><div class="rp-empty-box"><strong>Ningún módulo seleccionado</strong>Activa al menos un módulo en la barra de arriba y pulsa «Generar».</div></ng-template>

      <div class="rp-points" *ngIf="r.points.length">
        <h3>Puntos a revisar</h3>
        <div class="rp-point" *ngFor="let p of r.points" [ngClass]="p.tone">
          <svg viewBox="0 0 24 24" aria-hidden="true" *ngIf="p.tone === 'danger'"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>
          <svg viewBox="0 0 24 24" aria-hidden="true" *ngIf="p.tone !== 'danger'"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>
          <span>{{ p.text }}</span>
        </div>
      </div>

      <ng-container *ngIf="r.detail === 'Detallado'">
        <section *ngFor="let x of r.extra" class="gr-extra">
          <h3 class="gr-h3">{{ x.title }}</h3>
          <div class="kit-table-wrap">
            <table class="kit-table rp-table">
              <thead><tr><th *ngFor="let h of x.head">{{ h }}</th></tr></thead>
              <tbody><tr *ngFor="let row of x.rows"><td *ngFor="let c of row">{{ c }}</td></tr>
                <tr *ngIf="!x.rows.length"><td [attr.colspan]="x.head.length" class="kit-empty">Sin registros en el período.</td></tr></tbody>
            </table>
          </div>
        </section>
      </ng-container>

      <footer class="gr-foot">
        <span>Generado {{ dmy(r.generatedAt) }} {{ r.generatedAt.slice(11, 16) }} por <strong>{{ svc.user }}</strong> · la exportación queda registrada en auditoría.</span>
      </footer>
    </div>
  </section>
  `,
  styles: [`
    /* Barra de configuración */
    .gr-config { margin-bottom: 16px; padding: 14px 16px; background: linear-gradient(180deg, #F8FAFD, #F2F6FB); border-color: #E3E9F2; box-shadow: none; }
    .gr-config-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
    .gr-field { display: flex; flex-direction: column; gap: 4px; }
    .gr-label { font-size: 11px; font-weight: 600; color: #4B5563; }
    .gr-label small { margin-left: 4px; font-weight: 500; color: #9CA3AF; }
    .gr-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: #E7EDF5; }
    .gr-seg button { height: 34px; padding: 0 12px; border: none; border-radius: 8px; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; color: #4B5563; cursor: pointer; }
    .gr-seg button.on { background: #fff; color: #0A3D6D; box-shadow: 0 1px 3px rgba(10, 37, 64, .14); }
    .gr-date { min-width: 140px; height: 40px; }
    .gr-cmp { min-width: 170px; height: 40px; }
    .gr-generate { height: 40px; margin-left: auto; display: inline-flex; align-items: center; gap: 7px; }
    .gr-generate svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .gr-modules { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #DCE4EE; }
    .gr-modules .gr-label { margin-right: 4px; }
    .gr-mod { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid #D5DEEA; background: #fff;
      font: inherit; font-size: 12px; font-weight: 600; color: #6B7280; cursor: pointer; transition: all .15s; }
    .gr-mod i { width: 8px; height: 8px; border-radius: 50%; background: #CBD5E1; }
    .gr-mod.on { color: #0A2540; border-color: #9DB7D6; box-shadow: 0 1px 2px rgba(15, 23, 42, .06); }
    .gr-mod.on i { background: var(--mod, #1565C0); }
    .gr-mod:disabled { opacity: .45; cursor: not-allowed; }
    .gr-mod--reservas, .gr-card--reservas { --mod: #1565C0; } .gr-mod--alojamiento, .gr-card--alojamiento { --mod: #1F7A52; }
    .gr-mod--tra, .gr-card--tra { --mod: #6D3FC8; } .gr-mod--facturacion, .gr-card--facturacion { --mod: #B7791F; }
    .gr-mod--nomina, .gr-card--nomina { --mod: #4B5563; } .gr-mod--contable, .gr-card--contable { --mod: #0B4A8B; }
    .gr-mod--inventario, .gr-card--inventario { --mod: #166534; }
    .gr-hint { margin: 8px 0 0; font-size: 11.5px; color: #9CA3AF; }

    /* Vista previa */
    .gr-preview { background: #fff; border: 1px solid #E6EBF2; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(15, 23, 42, .04); }
    .gr-banner { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px;
      background: linear-gradient(120deg, #0A2540 0%, #0E3A66 60%, #1565C0 100%); color: #fff; }
    .gr-banner span { font-size: 10.5px; letter-spacing: .08em; color: rgba(255,255,255,.75); }
    .gr-banner h2 { margin: 4px 0 2px; font-size: 20px; }
    .gr-banner p { margin: 0; font-size: 12.5px; color: rgba(255,255,255,.85); }
    .gr-banner-stats { display: flex; gap: 10px; }
    .gr-banner-stats div { min-width: 92px; padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,.12); text-align: center; }
    .gr-banner-stats strong { display: block; font-size: 20px; }
    .gr-banner-stats span { font-size: 11px; letter-spacing: 0; color: rgba(255,255,255,.8); }
    .gr-body { padding: 18px 22px 20px; }
    .gr-h3 { display: flex; align-items: center; gap: 8px; margin: 4px 0 12px; font-size: 14px; color: #0A2540; }
    .gr-h3::before { content: ''; width: 4px; height: 15px; border-radius: 2px; background: #1565C0; }

    /* Tarjetas por módulo */
    .gr-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .gr-card { --mod: #1565C0; position: relative; display: flex; flex-direction: column; gap: 3px; padding: 14px 16px 12px 18px;
      border: 1px solid #E6EBF2; border-radius: 14px; background: #fff; text-decoration: none; color: inherit; overflow: hidden;
      transition: box-shadow .15s, transform .15s, border-color .15s; }
    .gr-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--mod); }
    .gr-card:hover { border-color: #C9D8EA; box-shadow: 0 8px 20px rgba(15, 23, 42, .08); transform: translateY(-1px); }
    .gr-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
    .gr-card-ind { font-size: 12px; color: #6B7280; }
    .gr-card-val { font-size: 21px; font-weight: 700; color: #0A2540; letter-spacing: -.01em; }
    .gr-card-detail { font-size: 12px; color: #4B5563; line-height: 1.4; min-height: 34px; }
    .gr-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #EEF1F5; font-size: 11px; color: #9CA3AF; }
    .gr-card-go { font-weight: 600; color: #0B6FD0; opacity: 0; transition: opacity .15s; }
    .gr-card:hover .gr-card-go, .gr-card:focus-visible .gr-card-go { opacity: 1; }

    .gr-extra { margin-top: 18px; }
    .gr-foot { border-top: 1px solid #EEF1F5; margin-top: 18px; padding-top: 12px; font-size: 11.5px; color: #6B7280; }
    .kit-banner .rsv-btn { margin-left: auto; height: 32px; }
    @media (max-width: 900px) { .gr-generate { margin-left: 0; } .gr-banner { flex-direction: column; align-items: flex-start; } }
  `],
})
export class GeneralComponent implements OnDestroy {
  readonly presets: Preset[] = ['Hoy', 'Semana', 'Mes actual', 'Personalizado'];
  readonly modules = REPORT_MODULES;
  readonly dmy = dmy;
  readonly monthLabel = monthLabel;
  readonly monthName = monthName;

  preset: Preset = 'Mes actual';
  from: string;
  to: string;
  compare: string;
  detail: 'Resumen' | 'Detallado' = 'Resumen';
  selected = new Set<ReportModule>();
  report: Report | null = null;
  error = '';
  stale = false;
  /** true cuando el usuario pulsó «Generar»: desde ahí un cambio de datos solo se avisa, no se rehace. */
  private userGenerated = false;
  private sub: Subscription;
  private version = 0;

  constructor(public svc: ReportsService, private router: Router) {
    this.from = svc.goLive;
    this.to = svc.today;
    this.compare = shiftMonth(svc.livePeriod, -1);
    REPORT_MODULES.filter(m => svc.canView(m)).forEach(m => this.selected.add(m));
    this.sub = svc.changes$.subscribe(v => {
      // Mientras nadie haya pulsado «Generar», el reporte automático se rehace solo al terminar de cargar los datos
      if (!this.report || !this.userGenerated) this.build();
      else if (v !== this.version) this.stale = true;
      this.version = v;
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get allowed(): ReportModule[] { return REPORT_MODULES.filter(m => this.svc.canView(m)); }
  get canExport(): boolean { return this.svc.canExport(); }
  get canSchedule(): boolean { return this.svc.canSchedule(); }
  get compareOptions(): string[] { return this.svc.periods().filter(p => p < this.from.slice(0, 7)).reverse(); }

  label(m: ReportModule): string { return m === 'Alojamiento' ? 'Alojamiento (check-in / check-out)' : m; }
  slug(m: string): string { return m.toLowerCase().replace('ó', 'o'); }
  link(m: ReportModule): string {
    const links: Record<ReportModule, string> = {
      Reservas: '/dashboard/reports/reservations', Alojamiento: '/dashboard/reports/occupancy', TRA: '/dashboard/tra', Facturación: '/dashboard/billing',
      Nómina: '/dashboard/payroll/reports', Contable: '/dashboard/reports/financial', Inventario: '/dashboard/reports/inventory',
    };
    return links[m];
  }

  toggle(m: ReportModule): void { this.selected.has(m) ? this.selected.delete(m) : this.selected.add(m); }

  setPreset(p: Preset): void {
    this.preset = p;
    const today = this.svc.today;
    if (p === 'Hoy') { this.from = today; this.to = today; }
    if (p === 'Semana') {
      const monday = addDays(today, -((new Date(`${today}T12:00`).getDay() + 6) % 7));
      this.from = monday < this.svc.goLive ? this.svc.goLive : monday; this.to = today;
    }
    if (p === 'Mes actual') { const first = `${today.slice(0, 7)}-01`; this.from = first < this.svc.goLive ? this.svc.goLive : first; this.to = today; }
    if (!this.compareOptions.includes(this.compare)) this.compare = this.compareOptions[0] ?? '';
  }

  generate(): void {
    this.error = !this.from || !this.to || this.from > this.to ? 'Revisa el rango de fechas.'
      : this.from < this.svc.goLive ? `El rango debe empezar desde el ${dmy(this.svc.goLive)}.` : '';
    if (this.error) return;
    this.build();
    this.userGenerated = true;
    this.svc.log('reporte general generado', `${rangeLabel(this.report!.range)} · ${this.report!.modules.length} módulos · ${this.detail}`);
  }

  private build(): void {
    const range: Range = { from: this.from, to: this.to };
    const s = this.svc;
    const cmp: MonthSummary | null = this.compare ? s.monthSummary(this.compare) : null;
    const cmpName = this.compare ? monthName(this.compare).replace(/^./, c => c.toUpperCase()) : '';
    const occ = s.occupancy(range);
    const res = s.reservationStats(range);
    const fin = s.financial(range);
    const tra = s.traSummary(range);
    const bill = s.billingSummary(range);
    const period = range.to.slice(0, 7);
    const pay = s.payrollSummary(period);
    const inv = s.inventoryReport(range);
    const payrollPosted = pay.run && pay.run.status !== 'Borrador';
    const occGoal = s.goal('occupancy'), marginGoal = s.goal('margin');
    const agotados = inv.alerts.filter(a => a.status === 'Agotado');
    const low = inv.alerts.filter(a => a.status === 'Stock bajo');

    const kpis: Kpi[] = [
      { label: 'Ocupación', value: pct(occ.pct), delta: delta(occ.pct, cmp?.occupancy ?? null, 'pp'), cmp: cmp ? `${cmpName} ${pct(cmp.occupancy)}` : occGoal !== null ? `Meta ${num(occGoal)} %` : 'Sin meta definida' },
      { label: 'Ingresos totales', value: money(fin.income), delta: delta(fin.income, cmp?.income ?? null), cmp: cmp ? `${cmpName} ${money(cmp.income)}` : '' },
      { label: 'Utilidad antes de imp.', value: money(fin.profit), delta: delta(fin.profit, cmp?.profit ?? null), cmp: `Margen ${pct(fin.margin)}${pay.run && pay.status === 'Borrador' ? ' · sin nómina' : ''}` },
      { label: 'Reservas', value: num(res.count), delta: delta(res.count, cmp?.reservations ?? null), cmp: `${res.voided} canceladas` },
    ];

    const rows: Row[] = [];
    const add = (module: ReportModule, row: Omit<Row, 'module'>) => { if (this.selected.has(module) && s.canView(module)) rows.push({ module, ...row }); };
    add('Reservas', {
      indicator: 'Reservas del período', value: num(res.count),
      detail: CHANNELS.map(c => `${c} ${res.byChannel[c]}`).join(' · '),
      delta: delta(res.count, cmp?.reservations ?? null),
      ...((s.goal('cancelRate') ?? Infinity) < res.cancelRate ? st('Revisar', 'warn') : st('Normal', 'ok')),
    });
    add('Alojamiento', {
      indicator: 'Noches ocupadas', value: `${occ.occupied} de ${occ.available}`,
      detail: `Estancia promedio ${num(occ.avgStay, 1)} noches · ${occ.stays} estadías`,
      delta: delta(occ.pct, cmp?.occupancy ?? null, 'pp'),
      // Sin meta de ocupación definida no se califica
      ...(occGoal === null || occ.pct >= occGoal ? st('Normal', 'ok') : occ.pct >= occGoal - 15 ? st('Revisar', 'warn') : st('Atención', 'danger')),
    });
    add('TRA', {
      indicator: 'Registros reportados', value: `${tra.reported} de ${tra.due}`,
      detail: tra.errors ? `${tra.errors} con error de envío al MinCIT` : tra.pending ? 'Estadías con huéspedes aún sin reportar' : 'Todo reportado',
      delta: delta(tra.due ? tra.reported / tra.due * 100 : 100, cmp?.traOnTime ?? null, 'pp'),
      ...(tra.errors ? st('Atención', 'danger') : tra.pending ? st(`${tra.pending} pendiente${tra.pending === 1 ? '' : 's'}`, 'warn') : st('Normal', 'ok')),
    });
    add('Facturación', {
      indicator: 'Cartera por cobrar', value: money(bill.receivables),
      detail: [bill.annulled.length ? `${bill.annulled.length} anulada${bill.annulled.length === 1 ? '' : 's'} · ${bill.annulled.join(', ')}` : '',
        bill.overdue ? `${bill.overdue} vencida${bill.overdue === 1 ? '' : 's'}` : '', bill.rejected ? `${bill.rejected} rechazada${bill.rejected === 1 ? '' : 's'} DIAN` : '']
        .filter(Boolean).join(' · ') || 'Sin novedades',
      delta: delta(0, null),
      ...(bill.overdue || bill.rejected ? st('Revisar', 'warn') : st('Normal', 'ok')),
    });
    add('Nómina', {
      indicator: pay.status === 'Pagada' ? 'Neto pagado' : 'Neto liquidado', value: money(pay.net),
      detail: pay.run ? `${pay.employees} empleados · costo total ${money(pay.cost)} · ${pay.status.toLowerCase()}` : `Sin liquidación de ${monthName(period)}`,
      delta: delta(pay.net, cmp ? s.payrollSummary(cmp.period).net : null, 'rel', false),
      ...(pay.status === 'Borrador' || !pay.run ? st('Por confirmar', 'warn') : st('Normal', 'ok')),
    });
    add('Contable', {
      indicator: 'Utilidad antes de imp.', value: money(fin.profit),
      detail: `Razón corriente ${num(fin.currentRatio, 2)}${payrollPosted ? '' : ' · nómina sin contabilizar'}`,
      delta: delta(fin.profit, cmp?.profit ?? null),
      ...(fin.margin < 0 ? st('Atención', 'danger') : (marginGoal !== null && fin.margin < marginGoal) || !payrollPosted ? st('Revisar', 'warn') : st('Normal', 'ok')),
    });
    add('Inventario', {
      indicator: 'Valor en existencias', value: money(inv.stockValue),
      detail: `${inv.products.length} productos · ${agotados.length} agotado${agotados.length === 1 ? '' : 's'} · ${low.length} bajo mínimo`,
      delta: delta(inv.stockValue, cmp?.stockValue ?? null),
      ...(agotados.length ? st('Revisar', 'warn') : st('Normal', 'ok')),
    });

    // Puntos a revisar: reglas sobre los mismos datos (solo de los módulos incluidos)
    const points: Point[] = [];
    const inc = (m: ReportModule) => this.selected.has(m) && s.canView(m);
    if (inc('Alojamiento') && occGoal !== null && occ.pct < occGoal) {
      const weeks: { from: string; pct: number }[] = [];
      for (let i = 0; i < occ.days.length; i += 7) {
        const w = occ.days.slice(i, i + 7);
        weeks.push({ from: w[0].date, pct: w.reduce((a, d) => a + d.occupied, 0) / w.reduce((a, d) => a + d.available, 0) * 100 });
      }
      const best = weeks.reduce((a, b) => b.pct > a.pct ? b : a, weeks[0]);
      points.push({ tone: 'warn', text: `La ocupación va en ${pct(occ.pct)} (meta ${num(occGoal)} %).${weeks.length > 1 && best ? ` La mejor semana fue la del ${dm(best.from)}, con ${pct(best.pct)}.` : ''}` });
    }
    if (inc('Contable') && inc('Nómina') && pay.run && !payrollPosted) {
      points.push({ tone: 'danger', text: `La nómina de ${monthName(period)} sigue en borrador: la utilidad todavía no incluye ${money(pay.cost)} de costo de personal.` });
    } else if (inc('Contable') && marginGoal !== null && fin.margin < marginGoal) {
      points.push({ tone: 'danger', text: `El margen cayó a ${pct(fin.margin)} (meta ${num(marginGoal)} %): el costo de personal equivale al ${pct(fin.income ? s.monthSummary(period).staffRatio : 0)} de los ingresos.` });
    }
    if (inc('Inventario') && agotados.length) {
      const blocked = s.roomList().filter(r => r.status === 'En mantenimiento' || r.status === 'Fuera de servicio');
      points.push({ tone: 'warn', text: `Hay ${agotados.length} producto${agotados.length === 1 ? '' : 's'} agotado${agotados.length === 1 ? '' : 's'} (${agotados.map(a => a.product.name).join(', ')})`
        + (blocked.length ? `; ${blocked.map(r => `la Hab. ${r.number}`).join(' y ')} está en mantenimiento.` : '.') });
    }
    if (inc('TRA') && tra.errors) points.push({ tone: 'danger', text: `${tra.errors} TRA con error de envío: el MinCIT no la${tra.errors === 1 ? '' : 's'} ha recibido.` });
    if (inc('Facturación') && (bill.overdue || bill.rejected)) {
      points.push({ tone: 'warn', text: [bill.overdue ? `${bill.overdue} factura${bill.overdue === 1 ? '' : 's'} vencida${bill.overdue === 1 ? '' : 's'}` : '', bill.rejected ? `${bill.rejected} rechazada${bill.rejected === 1 ? '' : 's'} por la DIAN` : ''].filter(Boolean).join(' y ') + `; cartera por cobrar ${money(bill.receivables)}.` });
    }

    // Detalle (nivel "Detallado")
    const extra: Report['extra'] = [];
    if (inc('Reservas')) extra.push({ title: 'Reservas del período', head: ['Código', 'Huésped', 'Canal', 'Llegada', 'Noches', 'Valor', 'Estado'],
      rows: s.createdIn(range).map(r => [r.code, r.guestName, r.channel, dmy(r.checkIn), String(r.nights), money(r.lodgingAmount + r.extrasAmount), r.status]) });
    if (inc('Alojamiento')) extra.push({ title: 'Ocupación por habitación', head: ['Habitación', 'Noches ocupadas', '% ocupación', 'Estadías'],
      rows: occ.rooms.map(r => [`Hab. ${r.room.number}`, `${r.occupied} / ${r.available}`, pct(r.pct), String(r.stays)]) });
    if (inc('Contable')) extra.push({ title: 'Resultado por centro de costo', head: ['Centro de costo', 'Ingresos', 'Egresos', 'Utilidad'],
      rows: fin.centers.map(c => [c.center, money(c.income), money(c.expenses), money(c.profit)]) });
    if (inc('Inventario')) extra.push({ title: 'Productos con alerta', head: ['Código', 'Producto', 'Existencias', 'Mínimo', 'Estado'],
      rows: inv.alerts.map(a => [a.product.code, a.product.name, `${num(a.product.stock, 1)} ${a.product.unit}`, num(a.product.minStock, 1), productStatus(a.product, s.today, s.expiryDays)]) });

    this.report = { range, compare: this.compare, modules: rows.map(r => r.module), detail: this.detail, kpis, rows, points: points.slice(0, 5), generatedAt: s.generatedStamp(), extra };
    this.stale = false;
  }

  /** Módulos sin novedad (estado Normal). */
  okCount(r: Report): number { return r.rows.filter(x => x.tone === 'ok').length; }

  schedule(): void { this.router.navigate(['/dashboard/reports/scheduled'], { queryParams: { nuevo: 'General' } }); }

  private fileBase(): string { return `reporte-general-${this.report!.range.from}_${this.report!.range.to}`; }

  csv(kind: 'Excel' | 'CSV'): void {
    const r = this.report!;
    const rows: unknown[][] = [
      [`Reporte general · ${this.svc.company}`], [`Período ${dmy(r.range.from)} – ${dmy(r.range.to)}${r.compare ? ` · comparado con ${monthLabel(r.compare)}` : ''}`], [],
      ['Indicador', 'Valor', 'Cambio', 'Referencia'], ...r.kpis.map(k => [k.label, k.value, k.delta.none ? '' : `${k.delta.up ? '+' : '-'}${k.delta.text}`, k.cmp]), [],
      ['Módulo', 'Indicador principal', 'Valor', 'Detalle', 'Cambio', 'Estado'],
      ...r.rows.map(x => [x.module, x.indicator, x.value, x.detail, x.delta.none ? '' : `${x.delta.up ? '+' : '-'}${x.delta.text}`, x.status]), [],
      ['Puntos a revisar'], ...r.points.map(p => [p.text]),
      ...(r.detail === 'Detallado' ? r.extra.flatMap(x => [[], [x.title], x.head, ...x.rows]) : []),
    ];
    downloadCsvFile(rows, `${this.fileBase()}.csv`);
    this.svc.log('exportación', `Reporte general.csv · ${rangeLabel(r.range)}`);
  }

  pdf(): void {
    const r = this.report!;
    openDocument('Reporte general', `
      <header><div><h1>Reporte general del hospedaje</h1><div class="muted">${esc(this.svc.company)} · ${dmy(r.range.from)} – ${dmy(r.range.to)}${r.compare ? ` · comparado con ${esc(monthLabel(r.compare))}` : ''}</div></div><div class="brand">SOGO</div></header>
      <table><tbody>${r.kpis.map(k => `<tr><td>${esc(k.label)}</td><td class="r"><strong>${esc(k.value)}</strong></td><td class="r">${k.delta.none ? '—' : `${k.delta.up ? '▲' : '▼'} ${esc(k.delta.text)}`}</td><td class="muted">${esc(k.cmp)}</td></tr>`).join('')}</tbody></table>
      <h2>Resumen por módulo</h2>
      <table><thead><tr><th>Módulo</th><th>Indicador</th><th class="r">Valor</th><th>Detalle</th><th>Estado</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr><td>${esc(x.module)}</td><td>${esc(x.indicator)}</td><td class="r">${esc(x.value)}</td><td class="muted">${esc(x.detail)}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table>
      ${r.points.length ? `<h2>Puntos a revisar</h2><ul>${r.points.map(p => `<li>${esc(p.text)}</li>`).join('')}</ul>` : ''}
      ${r.detail === 'Detallado' ? r.extra.map(x => `<h2>${esc(x.title)}</h2><table><thead><tr>${x.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${x.rows.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('') : ''}
      <p class="muted">Generado ${dmy(r.generatedAt)} ${r.generatedAt.slice(11, 16)} por ${esc(this.svc.user)} · exportación registrada en auditoría.</p>`, true);
    this.svc.log('exportación', `Reporte general.pdf · ${rangeLabel(r.range)}`);
  }
}
