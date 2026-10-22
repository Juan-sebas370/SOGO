import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService } from '../reports.service';
import {
  Range, ReservationStats, Delta, delta, reservationStats, money, pct, num, dmy, dm, monthName, monthShort, shiftMonth, lastMonths, rangeLabel, addDays,
  COLORS, CHANNEL_COLORS,
} from '../reports.model';
import { Reservation, ReservationChannel, ReservationStatus, LodgingType, CHANNELS, isVoid, lodgingLabel, paidAmount, totalAmount } from '../../reservations/reservation.model';
import { BarsComponent, DonutComponent, Series, Slice } from '../charts/charts';
import { DeltaComponent } from '../delta.component';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';

type Chip = 'Todas' | 'Finalizada' | 'Confirmada' | 'Pendiente' | 'Canceladas';
interface Filters { from: string; to: string; channel: ReservationChannel | ''; mode: LodgingType | ''; q: string; }

const STATUS_BADGE: Record<ReservationStatus, string> = {
  Finalizada: 'rsv-badge--muted', Confirmada: 'rsv-badge--ok', Pendiente: 'rsv-badge--warn', Cancelada: 'rsv-badge--danger', 'No presentada': 'rsv-badge--danger',
};
const PAGE = 10;

@Component({
  selector: 'app-reports-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BarsComponent, DonutComponent, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Reservas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de reservas</h1>
      <p class="kit-sub">Reservas creadas del {{ dm(f.from) }} al {{ dmy(f.to) }}{{ lastArrival ? ' (con llegadas hasta ' + lastArrival + ')' : '' }} y ocupación proyectada para las próximas semanas.</p>
    </div>
    <div class="kit-actions" *ngIf="svc.canExport()">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">Excel (CSV)</button>
    </div>
  </header>

  <section class="kit-card rp-filters">
    <label class="kit-select"><span>Creadas desde</span><input type="date" [(ngModel)]="f.from" [max]="f.to" (ngModelChange)="compute()"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="f.to" [min]="f.from" (ngModelChange)="compute()"></label>
    <label class="kit-select"><span>Canal</span><select [(ngModel)]="f.channel" (ngModelChange)="compute()"><option value="">Todos</option><option *ngFor="let c of channels">{{ c }}</option></select></label>
    <label class="kit-select"><span>Tipo de unidad</span><select [(ngModel)]="f.mode" (ngModelChange)="compute()"><option value="">Todos</option><option>Habitación</option><option>Piso</option><option>Casa completa</option></select></label>
    <label class="kit-select rr-search"><span>Buscar</span><input type="search" [(ngModel)]="f.q" (ngModelChange)="compute()" placeholder="Código o huésped"></label>
    <div class="rp-filters-row">
      <span>Estado:</span>
      <div class="kit-chips">
        <button type="button" class="kit-chip" *ngFor="let c of chips" [class.active]="chip === c" (click)="chip = c; page = 0; compute()">{{ chipLabel(c) }} · {{ chipCount(c) }}</button>
      </div>
    </div>
  </section>

  <section class="kit-kpis rp-kpis">
    <div class="rp-kpi"><span>Reservas</span><strong>{{ stats.count }}</strong><div><rp-delta [d]="d.count"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ cmpCount }}</small></div></div>
    <div class="rp-kpi"><span>Valor reservado</span><strong>{{ money(stats.value) }}</strong><small>Sin canceladas</small></div>
    <div class="rp-kpi"><span>Tasa de cancelación</span><strong>{{ pct(stats.cancelRate) }}</strong><div><rp-delta [d]="d.cancel"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ pct(cmpCancel) }}</small></div></div>
    <div class="rp-kpi"><span>Anticipación promedio</span><strong>{{ num(stats.leadDays) }} días</strong><small>Entre reserva y llegada</small></div>
    <div class="rp-kpi" [class.rp-kpi--alert]="stats.pendingPay"><span>Pendientes de pago</span><strong>{{ stats.pendingPay }}</strong><small>Saldo {{ money(stats.pendingBalance) }}</small></div>
  </section>

  <div class="rp-grid rp-grid--3">
    <section class="kit-card">
      <h2 class="kit-card-title">Reservas por mes</h2><p class="kit-card-sub">{{ monthsLabel }} · reservas creadas en cada mes</p>
      <rp-bars [labels]="monthLabels" [series]="monthSeries" valuesShown="all" [height]="240" aria="Reservas por mes"></rp-bars>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Canal de reserva</h2>
      <div class="rp-donut-wrap"><rp-donut [slices]="slices" [center]="num(stats.count)" sub="reservas" aria="Reservas por canal"></rp-donut></div>
      <div class="rp-donut-legend">
        <ng-container *ngFor="let s of slices"><i [style.background]="s.color"></i><span>{{ s.label }}</span><strong>{{ s.value }}</strong><small>{{ pct(stats.count ? s.value / stats.count * 100 : 0) }}</small></ng-container>
      </div>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Ocupación proyectada</h2><p class="kit-card-sub">Con reservas confirmadas y pendientes · semanas desde mañana</p>
      <rp-bars [labels]="projLabels" [series]="projSeries" valuesShown="all" [height]="240" [tick]="tickPct" [valueLabel]="valuePct" aria="Ocupación proyectada"></rp-bars>
    </section>
  </div>

  <section class="kit-card">
    <div class="rp-card-head"><h2 class="kit-card-title">Detalle de reservas</h2><span class="rp-muted">Mostrando {{ pageRows.length }} de {{ rows.length }} · ordenadas por fecha de llegada</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table rp-table">
        <thead><tr><th>Código</th><th>Huésped</th><th>Unidad</th><th>Llegada</th><th>Salida</th><th class="r">Noches</th><th>Canal</th><th class="r">Valor</th><th class="r">Abonado</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of pageRows" [class.rp-void]="isVoid(r)">
            <td><a class="rp-code" [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></td>
            <td>{{ r.guestName }}</td><td>{{ lodgingLabel(r) }}</td><td>{{ dm(r.checkIn) }}</td><td>{{ dm(r.checkOut) }}</td>
            <td class="r">{{ r.nights || '—' }}</td><td class="rp-muted">{{ r.channel }}</td>
            <td class="r"><strong class="rp-strike">{{ money(total(r)) }}</strong></td>
            <td class="r">{{ paid(r) ? money(paid(r)) : '—' }}</td>
            <td><span class="rsv-badge" [ngClass]="badge[r.status]">{{ r.status }}</span></td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="10" class="kit-empty">No hay reservas con estos filtros. Quita un filtro o amplía el rango de fechas.</td></tr>
        </tbody>
      </table>
    </div>
    <nav class="rp-pager" *ngIf="pages > 1" aria-label="Páginas">
      <button type="button" [disabled]="page === 0" (click)="page = page - 1">Anterior</button>
      <button type="button" *ngFor="let p of pageList" [class.active]="p === page" (click)="page = p">{{ p + 1 }}</button>
      <button type="button" [disabled]="page >= pages - 1" (click)="page = page + 1">Siguiente</button>
    </nav>
  </section>
  `,
  styles: [`.rr-search { flex: 1.4 !important; } .rr-search input::placeholder { color: #9AA5B4; font-weight: 400; }`],
})
export class ReservationsReportComponent implements OnDestroy {
  readonly channels = CHANNELS;
  readonly chips: Chip[] = ['Todas', 'Finalizada', 'Confirmada', 'Pendiente', 'Canceladas'];
  readonly badge = STATUS_BADGE;
  readonly money = money; readonly pct = pct; readonly num = num; readonly dm = dm; readonly dmy = dmy;
  readonly isVoid = isVoid; readonly lodgingLabel = lodgingLabel;
  readonly tickPct = (v: number) => `${v} %`;
  readonly valuePct = (v: number) => pct(v);

  f: Filters;
  chip: Chip = 'Todas';
  page = 0;
  base: Reservation[] = [];
  rows: Reservation[] = [];
  stats!: ReservationStats;
  d!: { count: Delta; cancel: Delta };
  cmpName = ''; cmpCount = 0; cmpCancel = 0;
  lastArrival = '';
  monthLabels: string[] = []; monthSeries: Series[] = []; monthsLabel = '';
  slices: Slice[] = [];
  projLabels: string[] = []; projSeries: Series[] = [];
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.f = { from: svc.goLive, to: svc.today, channel: '', mode: '', q: '' };
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get pages(): number { return Math.ceil(this.rows.length / PAGE); }
  get pageList(): number[] { return Array.from({ length: this.pages }, (_, i) => i); }
  get pageRows(): Reservation[] { return this.rows.slice(this.page * PAGE, this.page * PAGE + PAGE); }
  total(r: Reservation): number { return totalAmount(r); }
  paid(r: Reservation): number { return paidAmount(r); }
  chipLabel(c: Chip): string { return c === 'Todas' || c === 'Canceladas' ? c : `${c}s`; }
  chipCount(c: Chip): number { return this.base.filter(r => this.matches(r, c)).length; }

  private matches(r: Reservation, c: Chip): boolean {
    return c === 'Todas' || (c === 'Canceladas' ? isVoid(r) : r.status === c);
  }

  compute(): void {
    const s = this.svc, f = this.f;
    if (!f.from || !f.to || f.from > f.to) return;
    const range: Range = { from: f.from, to: f.to };
    const q = f.q.trim().toLowerCase();
    this.base = s.createdIn(range).filter(r => (!f.channel || r.channel === f.channel) && (!f.mode || r.lodgingType === f.mode)
      && (!q || r.code.toLowerCase().includes(q) || r.guestName.toLowerCase().includes(q)));
    this.rows = this.base.filter(r => this.matches(r, this.chip)).sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.code.localeCompare(b.code));
    this.page = Math.min(this.page, Math.max(0, this.pages - 1));
    this.stats = reservationStats(this.base);
    const last = this.base.filter(r => !isVoid(r)).map(r => r.checkIn).sort().pop();
    this.lastArrival = last && last > f.to ? `${dmy(last)}` : '';

    const cmpPeriod = shiftMonth(f.from.slice(0, 7), -1);
    const cmp = s.monthSummary(cmpPeriod);
    this.cmpName = monthName(cmpPeriod).replace(/^./, c => c.toUpperCase());
    // Con canal filtrado se compara contra ese canal del mes anterior
    this.cmpCount = f.channel ? cmp.byChannel[f.channel] : cmp.reservations;
    this.cmpCancel = cmp.cancelRate;
    this.d = { count: delta(this.stats.count, this.cmpCount), cancel: delta(this.stats.cancelRate, this.cmpCancel, 'pp', false) };

    // Reservas por mes: hasta 6 meses hasta el mes del rango (desde el inicio de SOGO), con los mismos filtros
    const months = s.monthsUpTo(f.to.slice(0, 7), 6);
    const counts = months.map(p => s.createdIn(s.monthRange(p)).filter(r => (!f.channel || r.channel === f.channel) && (!f.mode || r.lodgingType === f.mode)).length);
    const lastI = months.length - 1;
    this.monthLabels = months.map(monthShort);
    this.monthsLabel = `${monthName(months[0]).replace(/^./, c => c.toUpperCase())} – ${monthName(months[lastI])} ${months[lastI].slice(0, 4)}`;
    this.monthSeries = [{ name: 'Reservas', color: COLORS.light, values: counts, colors: months.map((_, i) => i === lastI ? COLORS.blue : COLORS.light) }];

    this.slices = CHANNELS.map(c => ({ label: c, value: this.stats.byChannel[c], color: CHANNEL_COLORS[c] }));

    // Proyección: 4 bloques de 7 noches desde mañana con las reservas vigentes
    const start = addDays(s.today, 1);
    const weeks = [0, 1, 2, 3].map(i => ({ from: addDays(start, i * 7), to: addDays(start, i * 7 + 6) }));
    this.projLabels = weeks.map(w => dm(w.from));
    this.projSeries = [{ name: 'Ocupación proyectada', color: COLORS.amber, values: weeks.map(w => s.occupancy(w, { lodgingType: f.mode }).pct) }];
  }

  private exportRows(): unknown[][] {
    return [
      [`Reporte de reservas · ${this.svc.company}`, `Creadas ${rangeLabel(this.f)}`], [],
      ['Reservas', this.stats.count], ['Valor reservado', this.stats.value], ['Tasa de cancelación', num(this.stats.cancelRate, 1)],
      ['Anticipación promedio (días)', num(this.stats.leadDays, 1)], ['Pendientes de pago', this.stats.pendingPay, 'Saldo', this.stats.pendingBalance], [],
      ['Canal', 'Reservas'], ...CHANNELS.map(c => [c, this.stats.byChannel[c]]), [],
      ['Código', 'Huésped', 'Unidad', 'Llegada', 'Salida', 'Noches', 'Canal', 'Valor', 'Abonado', 'Estado', 'Creada'],
      ...this.rows.map(r => [r.code, r.guestName, lodgingLabel(r), dmy(r.checkIn), dmy(r.checkOut), r.nights, r.channel, totalAmount(r), paidAmount(r), r.status, dmy(r.createdAt.slice(0, 10))]),
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.exportRows(), `reporte-reservas-${this.f.from}_${this.f.to}.csv`);
    this.svc.log('exportación', `Reporte de reservas.csv · ${rangeLabel(this.f)} · ${this.rows.length} reservas`);
  }

  pdf(): void {
    openDocument('Reporte de reservas', `
      <header><div><h1>Reporte de reservas</h1><div class="muted">${esc(this.svc.company)} · creadas ${rangeLabel(this.f)}</div></div><div class="brand">SOGO</div></header>
      <table><tbody><tr><td>Reservas</td><td class="r"><strong>${this.stats.count}</strong></td><td>Valor reservado</td><td class="r">${money(this.stats.value)}</td></tr>
      <tr><td>Tasa de cancelación</td><td class="r">${pct(this.stats.cancelRate)}</td><td>Pendientes de pago</td><td class="r">${this.stats.pendingPay} · ${money(this.stats.pendingBalance)}</td></tr>
      <tr><td>Canales</td><td colspan="3">${CHANNELS.map(c => `${c} ${this.stats.byChannel[c]}`).join(' · ')}</td></tr></tbody></table>
      <h2>Detalle</h2><table><thead><tr><th>Código</th><th>Huésped</th><th>Unidad</th><th>Llegada</th><th>Canal</th><th class="r">Valor</th><th>Estado</th></tr></thead><tbody>
      ${this.rows.map(r => `<tr><td>${esc(r.code)}</td><td>${esc(r.guestName)}</td><td>${esc(lodgingLabel(r))}</td><td>${dmy(r.checkIn)}</td><td>${esc(r.channel)}</td><td class="r">${money(totalAmount(r))}</td><td>${esc(r.status)}</td></tr>`).join('')}
      </tbody></table>`, true);
    this.svc.log('exportación', `Reporte de reservas.pdf · ${rangeLabel(this.f)}`);
  }
}
