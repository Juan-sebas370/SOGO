import { Component, inject } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { InventoryService } from '../inventory.service';
import { Movement, Product, ProductStatus, STATUS_BADGE, STATUS_ORDER, productStatus, lineValue, fmtQty } from '../inventory.model';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dmy } from '../inventory-format';

interface Filters { from: string; to: string; category: string; supplier: string; kind: string; level: string; }
interface CatRow { category: string; products: number; value: number; entries: number; exits: number; adjust: number; out: number; low: number; }

@Component({
  selector: 'app-inventory-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Reportes</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de inventario</h1>
      <p class="kit-sub">Vista previa · {{ dmy(applied.from).slice(0, 5) }} – {{ dmy(applied.to) }} · datos en tiempo real.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('Excel')">Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">CSV</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">Imprimir</button>
    </div>
  </header>

  <section class="kit-card rp-filters">
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="draft.from" [max]="draft.to"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="draft.to" [min]="draft.from"></label>
    <label class="kit-select"><span>Categoría</span><select [(ngModel)]="draft.category"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select></label>
    <label class="kit-select"><span>Proveedor</span><select [(ngModel)]="draft.supplier"><option value="">Todos</option><option *ngFor="let s of suppliers">{{ s }}</option></select></label>
    <label class="kit-select"><span>Tipo de movimiento</span><select [(ngModel)]="draft.kind"><option value="">Todos</option><option>Entrada</option><option>Salida</option><option>Ajuste</option></select></label>
    <label class="kit-select"><span>Nivel de existencias</span><select [(ngModel)]="draft.level"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!draft.from || !draft.to || draft.from > draft.to" (click)="generate()">Generar</button>
  </section>

  <section class="kit-kpis rp-kpis">
    <div class="kit-kpi"><div><span>Productos</span><strong>{{ products.length }}</strong><small>{{ catRows.length }} categorías</small></div></div>
    <div class="kit-kpi"><div><span>Valor en existencias</span><strong>{{ money(stockValue) }}</strong><small>Al costo</small></div></div>
    <div class="kit-kpi"><div><span>Entradas</span><strong>{{ money(tot.entries) }}</strong><small>{{ countOf('Entrada') }} movimientos</small></div></div>
    <div class="kit-kpi"><div><span>Salidas</span><strong>{{ money(tot.exits) }}</strong><small>{{ countOf('Salida') }} movimientos</small></div></div>
    <div class="kit-kpi"><div><span>Ajustes</span><strong [class.inv-red]="tot.adjust < 0">{{ money(tot.adjust) }}</strong><small>{{ countOf('Ajuste') }} movimientos</small></div></div>
  </section>

  <div class="rp-grid">
    <section class="kit-card">
      <div class="inv-head-row">
        <div><h2 class="kit-card-title">Entradas y salidas por semana</h2><p class="kit-card-sub">Valor al costo, millones de COP</p></div>
        <div class="rp-legend"><span><i class="in"></i>Entradas</span><span><i class="out"></i>Salidas</span></div>
      </div>
      <svg class="rp-svg" viewBox="0 0 600 230" role="img" [attr.aria-label]="chartLabel">
        <g *ngFor="let t of ticks"><line x1="40" x2="590" [attr.y1]="y(t)" [attr.y2]="y(t)" class="grid"/><text x="34" [attr.y]="y(t) + 4" class="tick">{{ (t / 1e6) | number:'1.0-2' }}</text></g>
        <g *ngFor="let w of weeks; let i = index">
          <rect [attr.x]="bx(i)" [attr.y]="y(w.entries)" [attr.width]="bw" [attr.height]="195 - y(w.entries)" class="in" rx="3"><title>Entradas {{ w.label }}: {{ money(w.entries) }}</title></rect>
          <rect [attr.x]="bx(i) + bw + 4" [attr.y]="y(w.exits)" [attr.width]="bw" [attr.height]="195 - y(w.exits)" class="out" rx="3"><title>Salidas {{ w.label }}: {{ money(w.exits) }}</title></rect>
          <text [attr.x]="bx(i) + bw / 2" [attr.y]="y(w.entries) - 5" class="val">{{ (w.entries / 1e6) | number:'1.2-2' }}</text>
          <text [attr.x]="bx(i) + bw * 1.5 + 4" [attr.y]="y(w.exits) - 5" class="val">{{ (w.exits / 1e6) | number:'1.2-2' }}</text>
          <text [attr.x]="bx(i) + bw + 2" y="215" class="lbl">{{ w.label }}</text>
        </g>
      </svg>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Productos que requieren atención</h2>
      <div class="rp-att" *ngFor="let p of attention">
        <span class="rsv-badge" [ngClass]="badge[st(p)]">{{ st(p) }}</span><span class="rp-att-name">{{ p.name }}</span><span class="kit-muted">{{ qty(p.stock) }} / {{ qty(p.minStock) }} {{ p.unit }}</span>
      </div>
      <p class="kit-muted" *ngIf="!attention.length">Todo en orden.</p>
    </section>
  </div>

  <section class="kit-card">
    <div class="inv-head-row">
      <h2 class="kit-card-title">Resumen por categoría</h2>
      <span class="kit-muted" style="font-size:12px">Generado {{ dmy(generatedAt) }} {{ generatedAt.slice(11, 16) }} por {{ user }} · registrado en auditoría</span>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Categoría</th><th class="r">Productos</th><th class="r">Valor en existencias</th><th class="r">Entradas</th><th class="r">Salidas</th><th class="r">Ajustes</th><th>Bajo mínimo / agotados</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of catRows">
            <td><span class="inv-cat" [ngClass]="'inv-cat--' + c.category.toLowerCase()">{{ c.category }}</span></td>
            <td class="r">{{ c.products }}</td><td class="r"><strong>{{ money(c.value) }}</strong></td>
            <td class="r inv-green">{{ money(c.entries) }}</td><td class="r rp-out">{{ money(c.exits) }}</td>
            <td class="r">{{ c.adjust ? money(c.adjust) : '—' }}</td>
            <td>
              <span class="rsv-badge rsv-badge--danger" *ngIf="c.out">{{ c.out }} agotado{{ c.out === 1 ? '' : 's' }}</span>
              <span class="rsv-badge rsv-badge--warn" *ngIf="c.low">{{ c.low }} bajo mínimo</span>
              <span class="rsv-badge rsv-badge--ok" *ngIf="!c.out && !c.low">Sin alertas</span>
            </td>
          </tr>
          <tr class="rp-total"><td>Totales</td><td class="r">{{ tot.products }}</td><td class="r">{{ money(stockValue) }}</td><td class="r">{{ money(tot.entries) }}</td>
            <td class="r">{{ money(tot.exits) }}</td><td class="r">{{ money(tot.adjust) }}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="inv-hint">Entradas y salidas al costo del movimiento. Los ajustes muestran el valor neto (negativo = faltante).</p>
  </section>
  `,
  styles: [`
    .rp-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
    .rp-filters .kit-select { flex: 1; min-width: 130px; }
    .rp-filters .rsv-btn { height: 46px; }
    .rp-kpis { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .rp-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 18px; margin-bottom: 18px; align-items: start; }
    .rp-legend { display: flex; gap: 12px; font-size: 12px; }
    .rp-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; }
    .rp-legend .in, .rp-svg .in { background: #1565C0; fill: #1565C0; }
    .rp-legend .out, .rp-svg .out { background: #D98A0B; fill: #D98A0B; }
    .rp-svg { width: 100%; height: auto; }
    .rp-svg .grid { stroke: #E6EBF2; }
    .rp-svg .tick { font-size: 10px; fill: #6B7280; text-anchor: end; }
    .rp-svg .lbl { font-size: 11px; fill: #6B7280; text-anchor: middle; }
    .rp-svg .val { font-size: 10px; font-weight: 700; fill: #0A2540; text-anchor: middle; }
    .rp-att { display: grid; grid-template-columns: 105px 1fr auto; gap: 8px; align-items: center; padding: 5px 0; font-size: 12.5px; }
    .rp-att-name { color: #0A2540; }
    .rp-out { color: #B45309; }
    .rp-total td { background: #EEF5FD; font-weight: 700; color: #0A2540; }
    @media (max-width: 1100px) { .rp-grid { grid-template-columns: 1fr; } }
  `],
})
export class ReportsComponent {
  private hotel = inject(HotelService);
  readonly statuses: ProductStatus[] = ['Agotado', 'Stock bajo', 'Por vencer', 'Disponible'];
  readonly badge = STATUS_BADGE;
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly dmy = dmy;
  readonly user = localStorage.getItem('sogo_role') || 'Usuario';

  draft: Filters;
  applied: Filters;
  categories: string[] = [];
  suppliers: string[] = [];
  products: Product[] = [];
  movements: Movement[] = [];
  catRows: CatRow[] = [];
  attention: Product[] = [];
  stockValue = 0;
  tot = { products: 0, entries: 0, exits: 0, adjust: 0 };
  weeks: { label: string; entries: number; exits: number }[] = [];
  ticks: number[] = [];
  max = 1;
  generatedAt = isoDateTime();

  constructor(private svc: InventoryService, private audit: UsersService) {
    const month = isoDate(0).slice(0, 7);
    this.draft = { from: `${month}-01`, to: isoDate(0), category: '', supplier: '', kind: '', level: '' };
    this.applied = { ...this.draft };
    combineLatest([svc.getProducts(), svc.getMovements()]).subscribe(() => this.compute());
  }

  get bw(): number { return Math.min(44, 520 / Math.max(1, this.weeks.length) / 2 - 10); }
  bx(i: number): number { return 50 + i * (540 / Math.max(1, this.weeks.length)) + 10; }
  y(v: number): number { return 195 - v / this.max * 175; }
  get chartLabel(): string { return this.weeks.map(w => `${w.label}: entradas ${this.money(w.entries)}, salidas ${this.money(w.exits)}`).join('; '); }

  st(p: Product): ProductStatus { return productStatus(p, isoDate(0), this.svc.config.expiryDays); }
  countOf(kind: string): number { return this.movements.filter(m => m.kind === kind).length; }

  generate(): void {
    this.applied = { ...this.draft };
    this.generatedAt = isoDateTime();
    this.compute();
    this.audit.addLog('Inventarios: reporte generado', `${this.applied.from} a ${this.applied.to} · valor ${this.money(this.stockValue)}`);
  }

  private compute(): void {
    const f = this.applied;
    const all = this.svc.productsSnapshot();
    this.categories = [...new Set(all.map(p => p.category))];
    this.suppliers = [...new Set(all.map(p => p.supplier))].sort();
    this.products = all.filter(p => (!f.category || p.category === f.category) && (!f.supplier || p.supplier === f.supplier) && (!f.level || this.st(p) === f.level));
    const ids = new Set(this.products.map(p => p.id));
    // Solo las líneas de los productos del filtro; un movimiento cuenta si tiene alguna
    this.movements = this.svc.movementsSnapshot()
      .filter(m => m.date >= f.from && m.date <= f.to && m.kind !== 'Inicial' && (!f.kind || m.kind === f.kind))
      .map(m => ({ ...m, lines: m.lines.filter(l => ids.has(l.productId)) })).filter(m => m.lines.length);
    const sumBy = (kind: string, pid?: (id: string) => boolean) => this.movements.filter(m => m.kind === kind)
      .reduce((s, m) => s + m.lines.filter(l => !pid || pid(l.productId)).reduce((a, l) => a + lineValue(l), 0), 0);

    this.stockValue = this.products.reduce((s, p) => s + p.stock * p.unitCost, 0);
    this.catRows = [...new Set(this.products.map(p => p.category))].map(category => {
      const ps = this.products.filter(p => p.category === category);
      const inCat = (id: string) => ps.some(p => p.id === id);
      return {
        category, products: ps.length, value: ps.reduce((s, p) => s + p.stock * p.unitCost, 0),
        entries: sumBy('Entrada', inCat), exits: -sumBy('Salida', inCat), adjust: sumBy('Ajuste', inCat),
        out: ps.filter(p => this.st(p) === 'Agotado').length, low: ps.filter(p => this.st(p) === 'Stock bajo').length,
      };
    });
    this.tot = { products: this.products.length, entries: sumBy('Entrada'), exits: -sumBy('Salida'), adjust: sumBy('Ajuste') };
    this.attention = this.products.filter(p => this.st(p) !== 'Disponible').sort((a, b) => STATUS_ORDER[this.st(a)] - STATUS_ORDER[this.st(b)]);

    // Semanas de 7 días desde el inicio del rango
    this.weeks = [];
    for (let start = f.from; start <= f.to;) {
      const d = new Date(`${start}T12:00`); d.setDate(d.getDate() + 6);
      const endIso = [iso(d), f.to].sort()[0];
      const inWeek = this.movements.filter(m => m.date >= start && m.date <= endIso);
      const val = (k: string) => Math.abs(inWeek.filter(m => m.kind === k).reduce((s, m) => s + m.lines.reduce((a, l) => a + lineValue(l), 0), 0));
      this.weeks.push({ label: `${start.slice(8)}–${endIso.slice(8)} ${monthAbbr(endIso)}`, entries: val('Entrada'), exits: val('Salida') });
      const n = new Date(`${endIso}T12:00`); n.setDate(n.getDate() + 1);
      start = iso(n);
    }
    const top = Math.max(1, ...this.weeks.flatMap(w => [w.entries, w.exits]));
    const step = niceStep(top / 4);
    this.max = step * 4 || 1;
    this.ticks = [0, 1, 2, 3, 4].map(i => i * step);
  }

  private rows(): unknown[][] {
    return [
      ['Categoría', 'Productos', 'Valor en existencias', 'Entradas', 'Salidas', 'Ajustes', 'Agotados', 'Bajo mínimo'],
      ...this.catRows.map(c => [c.category, c.products, c.value, c.entries, c.exits, c.adjust, c.out, c.low]),
      ['Totales', this.tot.products, this.stockValue, this.tot.entries, this.tot.exits, this.tot.adjust, '', ''],
      [], ['Código', 'Producto', 'Categoría', 'Existencias', 'Unidad', 'Mínimo', 'Costo unitario', 'Valor', 'Estado'],
      ...this.products.map(p => [p.code, p.name, p.category, p.stock, p.unit, p.minStock, p.unitCost, p.stock * p.unitCost, this.st(p)]),
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.rows(), `reporte-inventario-${this.applied.from}_${this.applied.to}${kind === 'Excel' ? '-excel' : ''}.csv`);
    this.svc.logExport(`Reporte de inventario.${kind === 'Excel' ? 'xlsx' : 'csv'}`, `${dmy(this.applied.from)} – ${dmy(this.applied.to)}`);
  }

  pdf(): void {
    openDocument('Reporte de inventario', `
      <header><div><h1>Reporte de inventario</h1><div class="muted">${esc(this.hotel.name)} · ${dmy(this.applied.from)} – ${dmy(this.applied.to)}</div></div><div class="brand">SOGO</div></header>
      <table><tbody><tr><td>Valor en existencias</td><td class="r">${this.money(this.stockValue)}</td></tr><tr><td>Entradas</td><td class="r">${this.money(this.tot.entries)}</td></tr>
      <tr><td>Salidas</td><td class="r">${this.money(this.tot.exits)}</td></tr><tr><td>Ajustes</td><td class="r">${this.money(this.tot.adjust)}</td></tr></tbody></table>
      <h2>Por categoría</h2><table><thead><tr><th>Categoría</th><th class="r">Productos</th><th class="r">Valor</th><th class="r">Entradas</th><th class="r">Salidas</th></tr></thead><tbody>
      ${this.catRows.map(c => `<tr><td>${esc(c.category)}</td><td class="r">${c.products}</td><td class="r">${this.money(c.value)}</td><td class="r">${this.money(c.entries)}</td><td class="r">${this.money(c.exits)}</td></tr>`).join('')}
      </tbody></table>
      <h2>Requieren atención</h2><table><tbody>${this.attention.map(p => `<tr><td>${esc(this.st(p))}</td><td>${esc(p.name)}</td><td class="r">${fmtQty(p.stock)} / ${fmtQty(p.minStock)} ${esc(p.unit)}</td></tr>`).join('')}</tbody></table>
      <p class="muted">Generado por ${esc(this.user)}.</p>`, true);
    this.svc.logExport('Reporte de inventario.pdf', `${dmy(this.applied.from)} – ${dmy(this.applied.to)}`);
  }
}

function iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function monthAbbr(isoDate: string): string { return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+isoDate.slice(5, 7) - 1]; }
function niceStep(raw: number): number {
  if (raw <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find(m => m * pow >= raw) ?? 10) * pow;
}
