import { Component, OnDestroy } from '@angular/core';
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
  imports: [CommonModule, FormsModule, RouterLink, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Reporte general</span></nav>
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

  <div class="gr-layout">
    <aside class="gr-side">
      <section class="kit-card">
        <h2 class="kit-card-title">1. Período</h2>
        <div class="kit-chips">
          <button type="button" class="kit-chip" *ngFor="let p of presets" [class.active]="preset === p" (click)="setPreset(p)">{{ p }}</button>
        </div>
        <div class="gr-dates">
          <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" [min]="svc.goLive" [max]="to" (ngModelChange)="preset = 'Personalizado'"></label>
          <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" [min]="from" [max]="svc.today" (ngModelChange)="preset = 'Personalizado'"></label>
        </div>
        <label class="kit-select"><span>Comparar con</span>
          <select [(ngModel)]="compare"><option value="">Sin comparación</option><option *ngFor="let p of compareOptions" [value]="p">{{ monthLabel(p) }}</option></select>
        </label>
        <p class="gr-hint">Los reportes usan los datos registrados en SOGO desde el {{ dmy(svc.goLive) }} (inicio en Contabilidad › Integración). La comparación es contra un mes completo.</p>
      </section>

      <section class="kit-card">
        <div class="gr-row"><h2 class="kit-card-title">2. Módulos a incluir</h2><span class="rp-muted">{{ selected.size }} de {{ allowed.length }}</span></div>
        <label class="gr-check" *ngFor="let m of modules" [class.off]="!svc.canView(m)">
          <input type="checkbox" [checked]="selected.has(m)" [disabled]="!svc.canView(m)" (change)="toggle(m)">
          {{ label(m) }}<small *ngIf="!svc.canView(m)">sin permiso</small>
        </label>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">3. Nivel de detalle</h2>
        <div class="kit-chips">
          <button type="button" class="kit-chip" [class.active]="detail === 'Resumen'" (click)="detail = 'Resumen'">Resumen</button>
          <button type="button" class="kit-chip" [class.active]="detail === 'Detallado'" (click)="detail = 'Detallado'">Detallado</button>
        </div>
        <p class="kit-error" *ngIf="error">{{ error }}</p>
        <button type="button" class="rsv-btn rsv-btn--primary gr-generate" (click)="generate()">Generar reporte</button>
      </section>
    </aside>

    <section class="gr-preview" *ngIf="report as r">
      <header class="gr-banner">
        <div>
          <span>SOGO · REPORTE GENERAL</span>
          <h2>{{ svc.company }}</h2>
          <p>Período {{ dmy(r.range.from) }} – {{ dmy(r.range.to) }}<ng-container *ngIf="r.compare"> · comparado con {{ monthName(r.compare) }} {{ r.compare.slice(0, 4) }}</ng-container></p>
        </div>
        <span class="gr-tag">Vista previa</span>
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
        <div class="kit-table-wrap">
          <table class="kit-table rp-table">
            <thead><tr><th>Módulo</th><th>Indicador principal</th><th class="r">Valor</th><th>Detalle</th><th class="r">{{ r.compare ? 'vs ' + monthName(r.compare) : 'Comparación' }}</th><th>Estado</th></tr></thead>
            <tbody>
              <tr *ngFor="let row of r.rows">
                <td><a class="rp-module" [ngClass]="'rp-module--' + slug(row.module)" [routerLink]="link(row.module)">{{ row.module }}</a></td>
                <td>{{ row.indicator }}</td>
                <td class="r"><strong>{{ row.value }}</strong></td>
                <td class="rp-muted">{{ row.detail }}</td>
                <td class="r"><rp-delta [d]="row.delta"></rp-delta></td>
                <td><span class="rsv-badge" [ngClass]="'rsv-badge--' + row.tone">{{ row.status }}</span></td>
              </tr>
              <tr *ngIf="!r.rows.length"><td colspan="6" class="kit-empty">Selecciona al menos un módulo.</td></tr>
            </tbody>
          </table>
        </div>

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
          <span>{{ r.detail }}</span>
        </footer>
      </div>
    </section>
  </div>
  `,
  styles: [`
    .gr-layout { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 18px; align-items: start; }
    .gr-side { display: flex; flex-direction: column; gap: 14px; }
    .gr-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 8px; }
    .gr-dates .kit-select { min-width: 0; }
    .gr-hint { margin: 8px 0 0; font-size: 11.5px; color: #6B7280; line-height: 1.45; }
    .gr-row { display: flex; justify-content: space-between; align-items: baseline; }
    .gr-check { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; color: #1F2937; cursor: pointer; }
    .gr-check input { width: 17px; height: 17px; accent-color: #1565C0; }
    .gr-check.off { color: #9AA5B4; cursor: not-allowed; }
    .gr-check small { margin-left: auto; font-size: 11px; }
    .gr-generate { width: 100%; margin-top: 14px; height: 46px; }
    .gr-preview { background: #fff; border: 1px solid #E6EBF2; border-radius: 16px; overflow: hidden; }
    .gr-banner { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; background: #0E3A66; color: #fff; padding: 20px 22px; }
    .gr-banner span { font-size: 10.5px; letter-spacing: .08em; color: rgba(255,255,255,.75); }
    .gr-banner h2 { margin: 4px 0 2px; font-size: 19px; }
    .gr-banner p { margin: 0; font-size: 12.5px; color: rgba(255,255,255,.85); }
    .gr-tag { background: rgba(255,255,255,.16); padding: 4px 9px; border-radius: 6px; font-size: 11.5px !important; letter-spacing: 0 !important; color: #fff !important; white-space: nowrap; }
    .gr-body { padding: 20px 22px; }
    .gr-h3 { margin: 6px 0 10px; font-size: 14px; color: #0A2540; }
    .gr-extra { margin-top: 18px; }
    .gr-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-top: 1px solid #EEF1F5; margin-top: 18px; padding-top: 12px; font-size: 11.5px; color: #6B7280; }
    a.rp-module { text-decoration: none; }
    .kit-banner .rsv-btn { margin-left: auto; height: 32px; }
    @media (max-width: 1000px) { .gr-layout { grid-template-columns: 1fr; } }
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
  private sub: Subscription;
  private version = 0;

  constructor(public svc: ReportsService, private router: Router) {
    this.from = svc.goLive;
    this.to = svc.today;
    this.compare = shiftMonth(svc.livePeriod, -1);
    REPORT_MODULES.filter(m => svc.canView(m)).forEach(m => this.selected.add(m));
    this.sub = svc.changes$.subscribe(v => {
      if (!this.report) this.build();
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
