import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice, InvoiceState, ConceptCategory, InvoiceTotals, computeTotals, lineNet, BILLABLE_CATEGORIES } from '../invoice.model';
import { STATE_BADGE } from '../billing-format';
import { UsersService } from '../../users/users.service';
import { fmtDate, fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';

type StateFilter = 'Todos excepto anuladas' | 'Todos' | InvoiceState;
interface Filters { from: string; to: string; state: StateFilter; client: string; service: ConceptCategory | ''; }
interface Row { inv: Invoice; state: InvoiceState; t: InvoiceTotals; paid: number; balance: number; }
interface Bucket { key: string; label: string; title: string; amount: number; count: number; }
type Range = 'month' | 'lastMonth' | '30' | 'year';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Colores de la cartera por estado (los mismos tonos de los badges). */
const STATE_COLOR: Partial<Record<InvoiceState, string>> = {
  'Pagada': '#16A34A', 'Pendiente': '#F59E0B', 'Vencida': '#DC2626', 'Emitida': '#2563EB',
};

@Component({
  selector: 'app-invoice-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-reports.component.css'],
  template: `
  <nav class="bil-crumb no-print" aria-label="Ruta">
    <a routerLink="/dashboard/billing">Facturación</a><span>/</span><span>Reportes</span>
  </nav>
  <header class="bil-head rep-head">
    <div>
      <h1 class="bil-title">Reportes de facturación</h1>
      <p class="bil-subtitle">{{ periodLabel }} · {{ rows.length }} factura{{ rows.length === 1 ? '' : 's' }}{{ f.client ? ' · ' + f.client : '' }}{{ f.service ? ' · ' + f.service : '' }}</p>
    </div>
    <div class="rep-export no-print" role="group" aria-label="Exportar">
      <button type="button" (click)="exportExcel()" [disabled]="!rows.length">
        <svg viewBox="0 0 24 24" class="rep-green"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>Excel
      </button>
      <button type="button" (click)="exportCsv()" [disabled]="!rows.length">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>CSV
      </button>
      <button type="button" (click)="print()">
        <svg viewBox="0 0 24 24" class="rep-red"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>PDF / Imprimir
      </button>
    </div>
  </header>

  <!-- Filtros: se aplican al instante -->
  <section class="bil-card rep-filters no-print">
    <div class="rep-filters-top">
      <div class="rep-ranges" role="group" aria-label="Período rápido">
        <button type="button" *ngFor="let r of ranges" [class.active]="isRange(r.key)" (click)="setRange(r.key)">{{ r.label }}</button>
      </div>
      <button type="button" class="rep-clear" (click)="reset()" [disabled]="isDefault">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>Restablecer
      </button>
    </div>
    <div class="rep-filters-grid">
      <label class="bil-select rep-date"><span class="bil-select-label">Desde</span>
        <input type="date" [(ngModel)]="f.from" [max]="f.to" (ngModelChange)="compute()"></label>
      <label class="bil-select rep-date"><span class="bil-select-label">Hasta</span>
        <input type="date" [(ngModel)]="f.to" [min]="f.from" (ngModelChange)="compute()"></label>
      <label class="bil-select">
        <span class="bil-select-label">Estado</span>
        <select [(ngModel)]="f.state" (ngModelChange)="compute()"><option *ngFor="let s of stateOptions" [value]="s">{{ s }}</option></select>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>
      <label class="bil-select">
        <span class="bil-select-label">Huésped / cliente</span>
        <select [(ngModel)]="f.client" (ngModelChange)="compute()"><option value="">Todos</option><option *ngFor="let c of clients" [value]="c">{{ c }}</option></select>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>
      <label class="bil-select">
        <span class="bil-select-label">Tipo de servicio</span>
        <select [(ngModel)]="f.service" (ngModelChange)="compute()"><option value="">Todos</option><option *ngFor="let s of services" [value]="s">{{ s }}</option></select>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>
    </div>
  </section>

  <p class="rep-print-range">Período: {{ periodLabel }} · {{ f.state }}{{ f.client ? ' · ' + f.client : '' }}{{ f.service ? ' · ' + f.service : '' }}</p>

  <!-- Indicadores -->
  <section class="rep-kpis">
    <div class="rep-kpi rep-kpi--main">
      <span>Total facturado</span>
      <strong>{{ money(sum.total) }}</strong>
      <small>{{ valid.length }} factura{{ valid.length === 1 ? '' : 's' }}{{ excludedAnnulled ? ' · ' + excludedAnnulled + ' anulada' + (excludedAnnulled === 1 ? '' : 's') + ' fuera' : '' }}</small>
    </div>
    <div class="rep-kpi">
      <span>Base gravable</span>
      <strong>{{ money(sum.base) }}</strong>
      <small>{{ sum.discounts ? 'Descuentos ' + money(sum.discounts) : 'Sin descuentos' }}</small>
    </div>
    <div class="rep-kpi">
      <span>Impuestos</span>
      <strong>{{ money(sum.iva + sum.inc) }}</strong>
      <small>IVA {{ money(sum.iva) }}{{ sum.inc ? ' · INC ' + money(sum.inc) : '' }}</small>
    </div>
    <div class="rep-kpi rep-kpi--ok">
      <span>Recaudado</span>
      <strong>{{ money(paid) }}</strong>
      <small>{{ pct(paid, sum.total) }}% de lo facturado</small>
    </div>
    <div class="rep-kpi" [class.rep-kpi--warn]="balance > 0">
      <span>Por cobrar</span>
      <strong>{{ money(balance) }}</strong>
      <small>{{ overdueCount ? overdueCount + ' vencida' + (overdueCount === 1 ? '' : 's') + ' · ' + money(overdueAmount) : 'Nada vencido' }}</small>
    </div>
  </section>

  <div class="rep-charts">
    <!-- Serie en el tiempo -->
    <section class="bil-card rep-chart-card">
      <div class="rep-card-head">
        <div>
          <h2 class="bil-card-title">Facturación {{ monthly ? 'mensual' : 'diaria' }}</h2>
          <span class="bil-card-sub">Total por fecha de emisión, sin anuladas</span>
        </div>
        <div class="rep-toggle no-print" role="group" aria-label="Vista">
          <button type="button" [class.active]="!showTable" (click)="showTable = false">Gráfico</button>
          <button type="button" [class.active]="showTable" (click)="showTable = true">Tabla</button>
        </div>
      </div>

      <ng-container *ngIf="!showTable">
        <div class="rep-plot" *ngIf="series.length; else noData" role="img" [attr.aria-label]="'Facturación por ' + (monthly ? 'mes' : 'día') + ', máximo ' + money(maxValue)">
          <div class="rep-axis"><span>{{ short(maxValue) }}</span><span>{{ short(maxValue / 2) }}</span><span>0</span></div>
          <div class="rep-bars">
            <div class="rep-bar" *ngFor="let b of series; let i = index" [title]="b.title + ' · ' + money(b.amount) + ' · ' + b.count + ' factura' + (b.count === 1 ? '' : 's')">
              <span class="rep-bar-fill" [style.height.%]="b.amount ? max(3, b.amount / maxValue * 100) : 0">
                <em *ngIf="b.amount && series.length <= 16">{{ short(b.amount) }}</em>
              </span>
              <small [class.rep-tick-hidden]="!showTick(i)">{{ b.label }}</small>
            </div>
          </div>
        </div>
      </ng-container>
      <div class="bil-table-wrap rep-mini-table" *ngIf="showTable">
        <table class="bil-table">
          <thead><tr><th>{{ monthly ? 'Mes' : 'Fecha' }}</th><th class="num">Facturas</th><th class="num">Total</th></tr></thead>
          <tbody>
            <tr *ngFor="let b of seriesWithValues"><td>{{ b.title }}</td><td class="num">{{ b.count }}</td><td class="num strong">{{ money(b.amount) }}</td></tr>
            <tr *ngIf="!seriesWithValues.length"><td colspan="3" class="bil-empty">Sin facturación en el período.</td></tr>
          </tbody>
        </table>
      </div>
      <ng-template #noData><p class="rep-empty">Sin facturación en el período.</p></ng-template>
    </section>

    <!-- Composición -->
    <section class="bil-card rep-side">
      <h2 class="bil-card-title">Por tipo de servicio</h2>
      <span class="bil-card-sub">Valor antes de impuestos</span>
      <ul class="rep-services">
        <li *ngFor="let s of byService">
          <div><span>{{ s.name }}</span><span><strong>{{ money(s.amount) }}</strong> · {{ s.pct }}%</span></div>
          <span class="rep-track"><span [style.width.%]="s.pct"></span></span>
        </li>
        <li *ngIf="!byService.length" class="rep-muted">Sin datos en el período.</li>
      </ul>

      <h2 class="bil-card-title rep-side-sep">Cartera por estado</h2>
      <span class="bil-card-sub">Facturas válidas del período</span>
      <div class="rep-stack" *ngIf="byState.length" aria-hidden="true">
        <span *ngFor="let s of byState" [style.width.%]="s.pct" [style.background]="s.color" [title]="s.state + ' · ' + money(s.amount)"></span>
      </div>
      <ul class="rep-states">
        <li *ngFor="let s of byState">
          <span class="rep-dot" [style.background]="s.color"></span>
          <span>{{ s.state }} <small>· {{ s.count }}</small></span>
          <strong>{{ money(s.amount) }}</strong>
        </li>
        <li *ngIf="!byState.length" class="rep-muted">Sin facturas válidas.</li>
      </ul>
    </section>
  </div>

  <!-- Detalle -->
  <section class="bil-card rep-detail">
    <div class="rep-card-head">
      <div>
        <h2 class="bil-card-title">Detalle del período</h2>
        <span class="bil-card-sub">{{ rows.length }} factura{{ rows.length === 1 ? '' : 's' }} · la más reciente primero</span>
      </div>
    </div>
    <div class="bil-table-wrap">
      <table class="bil-table rep-table">
        <thead>
          <tr>
            <th>N.º factura</th><th>Emisión</th><th>Huésped / cliente</th><th>Reserva</th><th>Estado</th>
            <th class="num">Base</th><th class="num">Impuestos</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows" [class.rep-annulled]="row.state === 'Anulada'">
            <td><a class="bil-code" [routerLink]="['/dashboard/billing', row.inv.id]">{{ row.inv.number }}</a></td>
            <td class="nowrap">{{ date(row.inv.issuedAt!) }}</td>
            <td>{{ row.inv.buyer.name }}<small>{{ row.inv.buyer.docType }} {{ row.inv.buyer.docNumber }}</small></td>
            <td><a class="bil-link nowrap" [routerLink]="['/dashboard/reservations', row.inv.reservationId]">{{ row.inv.reservationCode }}</a></td>
            <td><span class="rsv-badge" [ngClass]="stateBadge[row.state]">{{ row.state }}</span></td>
            <td class="num">{{ money(row.t.base) }}</td>
            <td class="num">{{ money(row.t.iva + row.t.inc) }}</td>
            <td class="num strong">{{ money(row.t.total) }}</td>
            <td class="num">{{ row.state === 'Anulada' ? '—' : money(row.paid) }}</td>
            <td class="num" [class.rep-due]="row.balance > 0 && row.state !== 'Anulada'">{{ row.state === 'Anulada' ? '—' : money(row.balance) }}</td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="10" class="bil-empty">No hay facturas con estos filtros.</td></tr>
        </tbody>
        <tfoot *ngIf="valid.length">
          <tr>
            <td colspan="5">Totales (sin anuladas)</td>
            <td class="num">{{ money(sum.base) }}</td>
            <td class="num">{{ money(sum.iva + sum.inc) }}</td>
            <td class="num">{{ money(sum.total) }}</td>
            <td class="num">{{ money(paid) }}</td>
            <td class="num">{{ money(balance) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
  `
})
export class InvoiceReportsComponent {

  readonly stateOptions: StateFilter[] = ['Todos excepto anuladas', 'Todos', 'Emitida', 'Pendiente', 'Pagada', 'Vencida', 'Anulada'];
  readonly ranges: { key: Range; label: string }[] = [
    { key: 'month', label: 'Este mes' }, { key: 'lastMonth', label: 'Mes anterior' }, { key: '30', label: 'Últimos 30 días' }, { key: 'year', label: 'Este año' },
  ];
  readonly stateBadge = STATE_BADGE;
  readonly money = fmtMoney;
  readonly date = fmtDate;
  readonly max = Math.max;

  f: Filters = this.defaults();
  showTable = false;

  clients: string[] = [];
  services: ConceptCategory[] = [...BILLABLE_CATEGORIES];
  rows: Row[] = [];
  valid: Row[] = [];
  excludedAnnulled = 0;
  sum: InvoiceTotals = computeTotals([]);
  paid = 0;
  balance = 0;
  overdueCount = 0;
  overdueAmount = 0;
  series: Bucket[] = [];
  monthly = false;
  maxValue = 1;
  byService: { name: string; amount: number; pct: number }[] = [];
  byState: { state: InvoiceState; amount: number; count: number; pct: number; color: string }[] = [];

  constructor(private svc: InvoiceService, private audit: UsersService) {
    this.svc.getAll().subscribe(list => {
      const issued = list.filter(i => i.dianStatus !== 'Borrador');
      this.clients = [...new Set(issued.map(i => i.buyer.name))].sort();
      // Los servicios actuales, más los antiguos (p. ej. Restaurante) solo si hay facturas con ellos
      const used = new Set(issued.flatMap(i => i.lines.map(l => l.category)));
      this.services = [...BILLABLE_CATEGORIES, ...[...used].filter(c => !BILLABLE_CATEGORIES.includes(c))];
      this.compute();
    });
  }

  // ── Período ──
  private defaults(): Filters {
    const [from, to] = this.rangeDates('month');
    return { from, to, state: 'Todos excepto anuladas', client: '', service: '' };
  }

  private rangeDates(r: Range): [string, string] {
    const now = new Date();
    switch (r) {
      case 'month':     return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(0)];
      case 'lastMonth': return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
      case '30':        return [isoDate(-29), isoDate(0)];
      case 'year':      return [`${now.getFullYear()}-01-01`, isoDate(0)];
    }
  }

  isRange(r: Range): boolean { const [a, b] = this.rangeDates(r); return this.f.from === a && this.f.to === b; }
  setRange(r: Range): void { [this.f.from, this.f.to] = this.rangeDates(r); this.compute(); }
  get isDefault(): boolean { return JSON.stringify(this.f) === JSON.stringify(this.defaults()); }
  reset(): void { this.f = this.defaults(); this.compute(); }

  get periodLabel(): string {
    const r = this.ranges.find(x => this.isRange(x.key));
    return `${r ? r.label + ' · ' : ''}${fmtDate(this.f.from)} – ${fmtDate(this.f.to)}`;
  }

  // ── Cálculo ──
  compute(): void {
    const f = this.f;
    if (!f.from || !f.to || f.to < f.from) return;
    const inRange = this.svc.getSnapshot().filter(i => {
      if (i.dianStatus === 'Borrador') return false;
      const day = i.issuedAt!.slice(0, 10);
      return day >= f.from && day <= f.to && (!f.client || i.buyer.name === f.client);
    });
    // Con "Tipo de servicio" solo cuentan las líneas de ese servicio
    const rowsAll: Row[] = inRange
      .map(inv => {
        const state = this.svc.state(inv);
        const t = computeTotals(f.service ? inv.lines.filter(l => l.category === f.service) : inv.lines);
        // Lo pagado se reparte en proporción si se filtra por servicio
        const whole = this.svc.total(inv);
        const paid = state === 'Anulada' || !whole ? 0 : Math.round(this.svc.paid(inv) * t.total / whole);
        return { inv, state, t, paid, balance: state === 'Anulada' ? 0 : Math.max(0, t.total - paid) };
      })
      .filter(r => !f.service || r.t.count > 0)
      .sort((a, b) => b.inv.issuedAt!.localeCompare(a.inv.issuedAt!));

    this.rows = rowsAll.filter(r => f.state === 'Todos' ? true : f.state === 'Todos excepto anuladas' ? r.state !== 'Anulada' : r.state === f.state);
    this.valid = this.rows.filter(r => r.state !== 'Anulada');
    this.excludedAnnulled = rowsAll.filter(r => r.state === 'Anulada').length;

    const add = (k: (r: Row) => number) => this.valid.reduce((s, r) => s + k(r), 0);
    this.sum = {
      count: this.valid.length, subtotal: add(r => r.t.subtotal), discounts: add(r => r.t.discounts), base: add(r => r.t.base),
      taxes: [], iva: add(r => r.t.iva), inc: add(r => r.t.inc), total: add(r => r.t.total),
    };
    this.paid = add(r => r.paid);
    this.balance = add(r => r.balance);
    const overdue = this.valid.filter(r => r.state === 'Vencida');
    this.overdueCount = overdue.length;
    this.overdueAmount = overdue.reduce((s, r) => s + r.balance, 0);

    this.buildSeries();
    this.buildBreakdowns();
  }

  /** Por día si el período cabe en ~2 meses; si es más largo, por mes (para que el gráfico se lea). */
  private buildSeries(): void {
    const from = new Date(this.f.from + 'T00:00'), to = new Date(this.f.to + 'T00:00');
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    this.monthly = days > 62;
    const buckets: Bucket[] = [];
    if (this.monthly) {
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        buckets.push({ key, label: MONTHS[d.getMonth()], title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, amount: 0, count: 0 });
      }
    } else {
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const key = iso(d);
        buckets.push({ key, label: pad(d.getDate()), title: fmtDate(key), amount: 0, count: 0 });
      }
    }
    const index = new Map(buckets.map(b => [b.key, b]));
    this.valid.forEach(r => {
      const b = index.get(r.inv.issuedAt!.slice(0, this.monthly ? 7 : 10));
      if (b) { b.amount += r.t.total; b.count++; }
    });
    this.series = this.valid.length ? buckets : [];
    this.maxValue = Math.max(1, ...buckets.map(b => b.amount));
  }

  private buildBreakdowns(): void {
    const byCat = new Map<string, number>();
    this.valid.forEach(r => r.inv.lines
      .filter(l => l.included && (!this.f.service || l.category === this.f.service))
      .forEach(l => byCat.set(l.category, (byCat.get(l.category) ?? 0) + lineNet(l))));
    const totalBase = [...byCat.values()].reduce((a, b) => a + b, 0) || 1;
    this.byService = [...byCat].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, pct: Math.round(amount / totalBase * 100) }));

    const byState = new Map<InvoiceState, { amount: number; count: number }>();
    this.valid.forEach(r => {
      const s = byState.get(r.state) ?? { amount: 0, count: 0 };
      s.amount += r.t.total; s.count++;
      byState.set(r.state, s);
    });
    const total = this.sum.total || 1;
    this.byState = (['Pagada', 'Pendiente', 'Vencida', 'Emitida'] as InvoiceState[])
      .filter(s => byState.has(s))
      .map(s => ({ state: s, ...byState.get(s)!, pct: byState.get(s)!.amount / total * 100, color: STATE_COLOR[s]! }));
  }

  get seriesWithValues(): Bucket[] { return this.series.filter(b => b.count); }

  /** Con muchos días solo se rotulan algunos, para que las fechas no se encimen. */
  showTick(i: number): boolean {
    const n = this.series.length;
    const every = n <= 16 ? 1 : n <= 35 ? 3 : 7;
    return i % every === 0 || i === n - 1;
  }

  /** $ 1,2 M · $ 450 mil — para ejes y etiquetas de barra. */
  short(v: number): string {
    if (v >= 1_000_000) return `$ ${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
    if (v >= 1_000) return `$ ${Math.round(v / 1_000).toLocaleString('es-CO')} mil`;
    return `$ ${Math.round(v)}`;
  }

  pct(a: number, b: number): number { return b ? Math.round(a / b * 100) : 0; }

  // ── Exportación (queda en auditoría) ──
  print(): void {
    this.log('PDF / impresión');
    window.print();
  }

  private log(what: string): void {
    this.audit.addLog('Reporte de facturación', `${what} · ${fmtDate(this.f.from)} – ${fmtDate(this.f.to)} · ${this.f.state} · ${this.rows.length} facturas`);
  }

  private table(): string[][] {
    const head = ['N.º factura', 'Emisión', 'Huésped / cliente', 'Documento', 'Reserva', 'Estado', 'DIAN', 'Base', 'Descuentos', 'IVA', 'INC', 'Total', 'Pagado', 'Saldo'];
    const body = this.rows.map(r => [
      r.inv.number, fmtDate(r.inv.issuedAt!), r.inv.buyer.name, `${r.inv.buyer.docType} ${r.inv.buyer.docNumber}`, r.inv.reservationCode,
      r.state, r.inv.dianStatus, String(r.t.base), String(r.t.discounts), String(r.t.iva), String(r.t.inc), String(r.t.total), String(r.paid), String(r.balance),
    ]);
    const foot = ['Totales (sin anuladas)', '', '', '', '', '', '', String(this.sum.base), String(this.sum.discounts), String(this.sum.iva), String(this.sum.inc), String(this.sum.total), String(this.paid), String(this.balance)];
    return [head, ...body, foot];
  }

  private download(content: string, type: string, ext: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-facturacion-${this.f.from}_${this.f.to}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** CSV con punto y coma + BOM: Excel en español lo abre en columnas y con tildes. */
  exportCsv(): void {
    const csv = '﻿' + this.table().map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    this.download(csv, 'text/csv;charset=utf-8', 'csv');
    this.log('CSV');
  }

  /** Hoja de Excel (tabla HTML que Excel abre directamente como .xls). */
  exportExcel(): void {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = this.table().map((r, i) => `<tr>${r.map(v => i === 0 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${rows}</table></body></html>`;
    this.download(html, 'application/vnd.ms-excel', 'xls');
    this.log('Excel');
  }
}
