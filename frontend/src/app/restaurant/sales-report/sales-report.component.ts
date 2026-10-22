import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import {
  RestaurantOrder, OrderStatus, SaleType, MenuCategory, MENU_CATEGORIES, orderTotals, saleType, shortNumber, sumTotals,
} from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dayMonth, stamp } from '../restaurant-format';

type StateFilter = 'Todas excepto anuladas' | 'Todas' | OrderStatus;
interface Filters { from: string; to: string; type: SaleType | ''; state: StateFilter; category: MenuCategory | ''; }
interface Row { o: RestaurantOrder; subtotal: number; tax: number; total: number; }

/** Valor de una línea con impuesto (para repartir ingresos por categoría y producto). */
const withTax = (o: RestaurantOrder, value: number) => Math.round(value * (1 + o.taxRate));

@Component({
  selector: 'app-sales-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './sales-report.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Reportes de ventas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de ventas</h1>
      <p class="kit-sub">Vista previa del reporte antes de exportarlo o imprimirlo.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf(true)"><svg viewBox="0 0 24 24" class="rep-red"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('xls')"><svg viewBox="0 0 24 24" class="rep-green"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('csv')"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>CSV</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf(true)"><svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button>
    </div>
  </header>

  <section class="kit-card rep-filters">
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="draft.from" [max]="draft.to"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="draft.to" [min]="draft.from"></label>
    <label class="kit-select"><span>Tipo de venta</span>
      <select [(ngModel)]="draft.type"><option value="">Todas</option><option>Venta directa</option><option>Cargo a habitación</option></select>
    </label>
    <label class="kit-select"><span>Estado</span>
      <select [(ngModel)]="draft.state"><option *ngFor="let s of states">{{ s }}</option></select>
    </label>
    <label class="kit-select"><span>Categoría</span>
      <select [(ngModel)]="draft.category"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select>
    </label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!draft.from || !draft.to || draft.from > draft.to" (click)="generate()">Generar reporte</button>
  </section>

  <section class="kit-kpis rep-kpis">
    <div class="kit-kpi"><div><span>Ventas realizadas</span><strong>{{ rows.length }}</strong><small>Pedidos {{ applied.state === 'Todas excepto anuladas' ? 'no anulados' : 'del filtro' }}</small></div></div>
    <div class="kit-kpi"><div><span>Ingresos generados</span><strong class="rep-blue">{{ money(sum.total) }}</strong><small>Base {{ money(sum.subtotal) }} · INC {{ money(sum.tax) }}</small></div></div>
    <div class="kit-kpi"><div><span>Promedio por venta</span><strong>{{ money(avgTicket) }}</strong><small>Ticket promedio</small></div></div>
    <div class="kit-kpi"><div><span>Promedio por día</span><strong>{{ money(avgDay) }}</strong><small>{{ days }} día{{ days === 1 ? '' : 's' }}</small></div></div>
    <div class="kit-kpi"><div><span>Cargos a habitación</span><strong>{{ roomPct }}%</strong><small>{{ 100 - roomPct }}% venta directa</small></div></div>
  </section>

  <div class="rep-grid">
    <section class="kit-card">
      <h2 class="kit-card-title">Ingresos por semana</h2>
      <p class="kit-card-sub">Total con INC, COP · {{ dm(applied.from) }} a {{ dm(applied.to) }}</p>
      <div class="rep-chart" role="img" [attr.aria-label]="chartLabel">
        <div class="rep-axis"><span *ngFor="let t of ticks">{{ short(t) }}</span></div>
        <div class="rep-bars">
          <div class="rep-bar" *ngFor="let w of weeks">
            <strong>{{ short(w.amount) }}</strong>
            <i [style.height.%]="max ? (w.amount / max) * 100 : 0"></i>
            <span>{{ w.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Por categoría</h2>
      <p class="kit-card-sub">Ingresos con INC</p>
      <div class="rep-cat" *ngFor="let c of byCategory">
        <div><span>{{ c.category }}</span><strong>{{ money(c.amount) }} <small>· {{ c.pct }}%</small></strong></div>
        <i><b [style.width.%]="c.pct"></b></i>
      </div>
      <p class="kit-empty" *ngIf="!byCategory.length">Sin ventas en el período.</p>
    </section>

    <section class="kit-card">
      <div class="rep-detail-head">
        <h2 class="kit-card-title">Detalle de ventas</h2>
        <span class="kit-muted">Mostrando {{ shown.length }} de {{ rows.length }} · se exporta completo</span>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Factura / pedido</th><th>Fecha</th><th>Cliente / huésped</th><th>Productos</th><th class="r">Subtotal</th><th class="r">INC</th><th class="r">Total</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of shown">
              <td class="kit-mono"><strong>{{ invoice(r.o) || '—' }}</strong><br>{{ shortN(r.o.number) }}</td>
              <td>{{ dm(r.o.createdAt) }}</td>
              <td>{{ r.o.clientName }}<small class="rep-sub">{{ r.o.table || r.o.unitLabel }}</small></td>
              <td class="rep-products">{{ products(r.o) }}</td>
              <td class="r">{{ money(r.subtotal) }}</td>
              <td class="r">{{ money(r.tax) }}</td>
              <td class="r"><strong>{{ money(r.total) }}</strong></td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="7" class="kit-empty">No hay ventas con estos filtros.</td></tr>
            <tr class="rep-total" *ngIf="rows.length">
              <td colspan="4">Totales del período ({{ rows.length }} ventas)</td>
              <td class="r">{{ money(sum.subtotal) }}</td><td class="r">{{ money(sum.tax) }}</td><td class="r">{{ money(sum.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="rsv-btn rsv-btn--outline rep-more" *ngIf="rows.length > shown.length" (click)="showAll = true">Ver las {{ rows.length }} ventas</button>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Productos más vendidos</h2>
      <table class="kit-table">
        <thead><tr><th>Producto</th><th class="r">Unid.</th><th class="r">Ingresos</th></tr></thead>
        <tbody>
          <tr *ngFor="let p of top; let i = index">
            <td><div class="kit-prod"><span class="kit-muted">{{ i + 1 }}</span><app-product-icon [category]="p.category" size="sm"></app-product-icon>{{ p.name }}</div></td>
            <td class="r">{{ p.units }}</td>
            <td class="r"><strong>{{ money(p.amount) }}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="kit-muted rep-note">Generado el {{ stamp(generatedAt) }} por {{ user }} · registrado en auditoría.</p>
    </section>
  </div>
  `,
})
export class SalesReportComponent {
  readonly categories = MENU_CATEGORIES;
  readonly states: StateFilter[] = ['Todas excepto anuladas', 'Todas', 'Pendiente', 'Facturada', 'Pagada', 'Anulada'];
  readonly money = fmtMoney;
  readonly dm = dayMonth;
  readonly stamp = stamp;
  readonly shortN = shortNumber;
  readonly user = localStorage.getItem('sogo_role') || 'Usuario';

  draft: Filters = { from: isoDate(-27), to: isoDate(0), type: '', state: 'Todas excepto anuladas', category: '' };
  applied: Filters = { ...this.draft };
  rows: Row[] = [];
  sum = { units: 0, subtotal: 0, tax: 0, total: 0 };
  days = 1;
  avgTicket = 0;
  avgDay = 0;
  roomPct = 0;
  weeks: { label: string; amount: number }[] = [];
  max = 0;
  ticks: number[] = [];
  byCategory: { category: MenuCategory; amount: number; pct: number }[] = [];
  top: { name: string; category: MenuCategory; units: number; amount: number }[] = [];
  showAll = false;
  generatedAt = isoDateTime();

  constructor(private svc: RestaurantService, private audit: UsersService) {
    svc.getOrders().subscribe(() => this.compute());
  }

  get shown(): Row[] { return this.showAll ? this.rows : this.rows.slice(0, 6); }
  get chartLabel(): string { return 'Ingresos por semana: ' + this.weeks.map(w => `${w.label} ${this.money(w.amount)}`).join(', '); }

  generate(): void {
    this.applied = { ...this.draft };
    this.showAll = false;
    this.generatedAt = isoDateTime();
    this.compute();
    this.audit.addLog('Restaurante: reporte de ventas', `${this.applied.from} a ${this.applied.to} · ${this.rows.length} ventas · ${this.money(this.sum.total)}`);
  }

  /** Con filtro de categoría, cada pedido cuenta solo con sus líneas de esa categoría. */
  private scoped(o: RestaurantOrder): RestaurantOrder {
    return this.applied.category ? { ...o, items: o.items.filter(i => i.category === this.applied.category) } : o;
  }

  private compute(): void {
    const f = this.applied;
    const orders = this.svc.ordersSnapshot()
      .filter(o => {
        const day = o.createdAt.slice(0, 10);
        return day >= f.from && day <= f.to && (!f.type || saleType(o) === f.type)
          && (f.state === 'Todas' || (f.state === 'Todas excepto anuladas' ? o.status !== 'Anulada' : o.status === f.state));
      })
      .map(o => this.scoped(o)).filter(o => o.items.length)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    this.rows = orders.map(o => ({ o, ...orderTotals(o) }));
    this.sum = sumTotals(orders);
    this.days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
    this.avgTicket = orders.length ? Math.round(this.sum.total / orders.length) : 0;
    this.avgDay = Math.round(this.sum.total / this.days);
    const roomTotal = sumTotals(orders.filter(o => o.reservationId)).total;
    this.roomPct = this.sum.total ? Math.round((roomTotal / this.sum.total) * 100) : 0;

    // Semanas de 7 días desde el inicio del rango
    this.weeks = [];
    for (let start = f.from; start <= f.to;) {
      const endDate = new Date(`${start}T12:00`);
      endDate.setDate(endDate.getDate() + 6);
      const end = [isoOf(endDate), f.to].sort()[0];
      const amount = sumTotals(orders.filter(o => o.createdAt.slice(0, 10) >= start && o.createdAt.slice(0, 10) <= end)).total;
      this.weeks.push({ label: `${dayMonth(start)}–${dayMonth(end)}`, amount });
      const next = new Date(`${end}T12:00`);
      next.setDate(next.getDate() + 1);
      start = isoOf(next);
    }
    this.max = Math.max(0, ...this.weeks.map(w => w.amount));
    const step = niceStep(this.max / 4);
    this.max = step * 4 || 0;
    this.ticks = [4, 3, 2, 1, 0].map(i => i * step);

    const cats = new Map<MenuCategory, number>();
    const prods = new Map<string, { name: string; category: MenuCategory; units: number; amount: number }>();
    orders.forEach(o => o.items.forEach(i => {
      const value = withTax(o, i.unitPrice * i.quantity);
      cats.set(i.category, (cats.get(i.category) ?? 0) + value);
      const p = prods.get(i.productId) ?? { name: i.name, category: i.category, units: 0, amount: 0 };
      p.units += i.quantity;
      p.amount += value;
      prods.set(i.productId, p);
    }));
    const catTotal = [...cats.values()].reduce((s, v) => s + v, 0);
    this.byCategory = [...cats].map(([category, amount]) => ({ category, amount, pct: catTotal ? Math.round((amount / catTotal) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
    this.top = [...prods.values()].sort((a, b) => b.units - a.units || b.amount - a.amount).slice(0, 6);
  }

  invoice(o: RestaurantOrder): string { return this.svc.invoiceNumber(o); }
  products(o: RestaurantOrder): string { return o.items.map(i => `${i.name} ×${i.quantity}`).join(', '); }

  /** 2.130.000 → "$ 2,13 M" · 450.000 → "$ 450 mil" */
  short(v: number): string {
    if (v >= 1_000_000) return `$ ${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} M`;
    if (v >= 1000) return `$ ${Math.round(v / 1000)} mil`;
    return `$ ${v}`;
  }

  private exportRows(): unknown[][] {
    return [
      ['Factura', 'Pedido', 'Fecha', 'Tipo', 'Cliente / huésped', 'Origen', 'Productos', 'Estado', 'Subtotal', 'INC', 'Total'],
      ...this.rows.map(r => [this.invoice(r.o), r.o.number, stamp(r.o.createdAt), saleType(r.o), r.o.clientName,
        r.o.table || r.o.unitLabel, this.products(r.o), r.o.status, r.subtotal, r.tax, r.total]),
      ['', '', '', '', '', '', `Totales (${this.rows.length} ventas)`, '', this.sum.subtotal, this.sum.tax, this.sum.total],
    ];
  }

  csv(kind: 'csv' | 'xls'): void {
    // Excel abre el CSV con punto y coma y BOM en columnas; se nombra según el botón usado
    downloadCsvFile(this.exportRows(), `ventas-restaurante-${this.applied.from}_${this.applied.to}${kind === 'xls' ? '-excel' : ''}.csv`);
    this.audit.addLog('Restaurante: reporte exportado', `${kind === 'xls' ? 'Excel' : 'CSV'} · ${this.applied.from} a ${this.applied.to}`);
  }

  pdf(print: boolean): void {
    const f = this.applied;
    const body = `
      <header><div><h1>Reporte de ventas · Restaurante</h1><div class="muted">${esc(dayMonth(f.from))} a ${esc(dayMonth(f.to))}/${f.to.slice(0, 4)} · ${esc(f.type || 'Todos los tipos')} · ${esc(f.state)}${f.category ? ' · ' + esc(f.category) : ''}</div></div>
      <div class="brand">SOGO</div></header>
      <table><tbody>
        <tr><td>Ventas realizadas</td><td class="r">${this.rows.length}</td></tr>
        <tr><td>Base</td><td class="r">${this.money(this.sum.subtotal)}</td></tr>
        <tr><td>INC</td><td class="r">${this.money(this.sum.tax)}</td></tr>
        <tr class="total"><td>Ingresos generados</td><td class="r">${this.money(this.sum.total)}</td></tr>
      </tbody></table>
      <h2>Por categoría</h2>
      <table><tbody>${this.byCategory.map(c => `<tr><td>${esc(c.category)}</td><td class="r">${this.money(c.amount)}</td><td class="r">${c.pct}%</td></tr>`).join('')}</tbody></table>
      <h2>Detalle</h2>
      <table><thead><tr><th>Factura / pedido</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th class="r">Total</th></tr></thead><tbody>
      ${this.rows.map(r => `<tr><td>${esc(this.invoice(r.o) || '—')}<br>${esc(r.o.number)}</td><td>${esc(stamp(r.o.createdAt))}</td><td>${esc(r.o.clientName)}</td><td>${esc(this.products(r.o))}</td><td class="r">${this.money(r.total)}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Generado el ${esc(stamp(this.generatedAt))} por ${esc(this.user)}.</p>`;
    openDocument('Reporte de ventas del restaurante', body, print);
  }
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Paso "redondo" del eje (1, 2, 2.5 o 5 × 10ⁿ) para que las marcas se lean fácil. */
function niceStep(raw: number): number {
  if (raw <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find(m => m * pow >= raw) ?? 10) * pow;
}
