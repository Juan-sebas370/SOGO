import { Component, OnDestroy } from '@angular/core';
import { ReportNavComponent } from '../report-nav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, InventoryReport } from '../reports.service';
import { Range, money, pct, num, dmy, rangeLabel, millions, COLORS } from '../reports.model';
import { AREAS, STATUS_BADGE, ProductStatus, fmtQty } from '../../inventory/inventory.model';
import { DonutComponent, Slice } from '../charts/charts';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';

interface Filters { from: string; to: string; category: string; area: string; status: string; }
const AREA_COLORS = [COLORS.blue, COLORS.purple, COLORS.amber, COLORS.gray, COLORS.green, COLORS.red];

@Component({
  selector: 'app-reports-inventory',
  standalone: true,
  imports: [ReportNavComponent, CommonModule, FormsModule, RouterLink, DonutComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../../inventory/inventory.css', '../reports.css'],
  template: `
  <rp-nav></rp-nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de inventario</h1>
      <p class="kit-sub">Existencias, consumo y rotación de productos · tomado del módulo de Inventarios en tiempo real.</p>
    </div>
    <div class="kit-actions" *ngIf="svc.canExport()">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">Excel (CSV)</button>
    </div>
  </header>

  <p class="kit-banner kit-banner--danger" *ngIf="!svc.canView('Inventario')">Tu rol no tiene permiso para consultar Inventarios.</p>
  <ng-container *ngIf="svc.canView('Inventario')">
  <section class="kit-card rp-filters">
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="draft.from" [max]="draft.to"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="draft.to" [min]="draft.from" [max]="svc.today"></label>
    <label class="kit-select"><span>Categoría</span><select [(ngModel)]="draft.category"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select></label>
    <label class="kit-select"><span>Área de consumo</span><select [(ngModel)]="draft.area"><option value="">Todas</option><option *ngFor="let a of areas">{{ a }}</option></select></label>
    <label class="kit-select"><span>Estado de existencias</span><select [(ngModel)]="draft.status"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!draft.from || !draft.to || draft.from > draft.to" (click)="apply()">Generar</button>
  </section>

  <section class="kit-kpis rp-kpis">
    <div class="rp-kpi"><span>Valor en existencias</span><strong>{{ money(r.stockValue) }}</strong><small>{{ r.products.length }} productos · {{ r.categories }} categorías</small></div>
    <div class="rp-kpi"><span>Entradas</span><strong>{{ money(r.entries) }}</strong><small>{{ r.entryCount }} movimientos</small></div>
    <div class="rp-kpi"><span>Salidas (consumo)</span><strong>{{ money(r.consumption) }}</strong><small>{{ r.exitCount }} movimientos</small></div>
    <div class="rp-kpi"><span>Mermas y ajustes</span><strong [class.rp-neg]="r.shrinkage">{{ r.shrinkage ? '- ' : '' }}{{ money(r.shrinkage) }}</strong><small>{{ r.shrinkCount }} registros · {{ pct(r.shrinkShare) }} del consumo</small></div>
    <div class="rp-kpi"><span>Rotación del período</span><strong>{{ num(r.rotation, 2) }} veces</strong><small>≈ {{ isFinite(r.coverDays) ? num(r.coverDays) : '—' }} días de inventario</small></div>
  </section>

  <div class="rp-grid rp-grid--3">
    <section class="kit-card">
      <h2 class="kit-card-title">Valor en existencias por categoría</h2><p class="kit-card-sub">Al costo · {{ dmy(svc.today) }}</p>
      <div class="ir-cat" *ngFor="let c of r.byCategory">
        <span class="inv-cat" [ngClass]="'inv-cat--' + c.category.toLowerCase()">{{ c.category }}</span>
        <div class="rp-hbar-track"><b [style.width.%]="c.value / maxCat * 100" [style.background]="C.blue"></b></div>
        <strong>{{ money(c.value) }}</strong>
      </div>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Consumo por área</h2><p class="kit-card-sub">Salidas del período al costo</p>
      <div class="rp-donut-wrap"><rp-donut [slices]="areaSlices" [center]="millions(r.consumption)" sub="consumo" aria="Consumo por área"></rp-donut></div>
      <div class="rp-donut-legend">
        <ng-container *ngFor="let a of r.byArea; let i = index"><i [style.background]="areaColor(i)"></i><span>{{ areaLabel(a.area) }}</span><strong>{{ money(a.value) }}</strong><small>{{ pct(a.share) }}</small></ng-container>
      </div>
    </section>
    <section class="kit-card">
      <h2 class="kit-card-title">Productos más consumidos</h2><p class="kit-card-sub">Por valor de las salidas</p>
      <div class="ir-top" *ngFor="let t of r.top; let i = index"><b>{{ i + 1 }}</b><span>{{ t.name }}</span><small>{{ qty(t.qty) }} {{ t.unit }}</small><strong>{{ money(t.value) }}</strong></div>
      <p class="rp-muted" *ngIf="!r.top.length">Sin salidas en el período.</p>
    </section>
  </div>

  <section class="kit-card">
    <div class="rp-card-head"><h2 class="kit-card-title">Productos con alerta</h2><span class="rp-muted">Agotados, bajo el mínimo o próximos a vencer · la cobertura usa el consumo diario del período</span></div>
    <div class="kit-table-wrap">
      <table class="kit-table rp-table">
        <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="r">Existencias</th><th class="r">Mínimo</th><th class="r">Consumo diario</th><th class="r">Días de cobertura</th><th>Vence</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let a of r.alerts">
            <td><a class="kit-mono" [routerLink]="['/dashboard/inventory/products', a.product.id]">{{ a.product.code }}</a></td>
            <td><strong>{{ a.product.name }}</strong></td>
            <td><span class="inv-cat" [ngClass]="'inv-cat--' + a.product.category.toLowerCase()">{{ a.product.category }}</span></td>
            <td class="r"><strong>{{ qty(a.product.stock) }} {{ a.product.unit }}</strong></td><td class="r">{{ qty(a.product.minStock) }}</td>
            <td class="r">{{ a.daily ? num(a.daily, 2) : '—' }}</td>
            <td class="r" [class.rp-neg]="isFinite(a.cover) && a.cover < 2" [class.rp-warn]="isFinite(a.cover) && a.cover >= 2 && a.cover < 7">{{ isFinite(a.cover) ? num(a.cover, 1) : '—' }}</td>
            <td>{{ a.expiry ? dmy(a.expiry) : '—' }}</td>
            <td><span class="rsv-badge" [ngClass]="badge[a.status]">{{ a.status }}</span></td>
          </tr>
          <tr *ngIf="!r.alerts.length"><td colspan="9" class="kit-empty">Ningún producto con alerta para estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  </ng-container>
  `,
  styles: [`
    .ir-cat { display: grid; grid-template-columns: 118px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; font-size: 12.5px; }
    .ir-cat strong { color: #0A2540; }
    .ir-top { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #EEF1F5; font-size: 12.5px; }
    .ir-top b { width: 22px; height: 22px; border-radius: 6px; background: #E3EEFB; color: #1565C0; font-size: 11px; display: flex; align-items: center; justify-content: center; }
    .ir-top small { color: #6B7280; } .ir-top strong { color: #0A2540; }
  `],
})
export class InventoryReportComponent implements OnDestroy {
  readonly C = COLORS;
  readonly money = money; readonly pct = pct; readonly num = num; readonly dmy = dmy; readonly millions = millions; readonly isFinite = isFinite;
  readonly qty = fmtQty;
  readonly areas = AREAS;
  readonly badge = STATUS_BADGE;
  readonly statuses: ProductStatus[] = ['Agotado', 'Stock bajo', 'Por vencer', 'Disponible'];

  draft: Filters;
  applied: Filters;
  r!: InventoryReport;
  categories: string[] = [];
  areaSlices: Slice[] = [];
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.draft = { from: svc.goLive, to: svc.today, category: '', area: '', status: '' };
    this.applied = { ...this.draft };
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get maxCat(): number { return Math.max(1, ...this.r.byCategory.map(c => c.value)); }
  areaColor(i: number): string { return AREA_COLORS[i % AREA_COLORS.length]; }
  areaLabel(a: string): string { return a.split(' · ')[0] === 'Alojamiento' ? 'Habitaciones' : a.split(' · ')[0]; }

  apply(): void {
    this.applied = { ...this.draft };
    this.compute();
    this.svc.log('reporte de inventario generado', rangeLabel(this.applied));
  }

  private compute(): void {
    this.categories = [...new Set(this.svc.productList().map(p => p.category))];
    const f = this.applied;
    this.r = this.svc.inventoryReport({ from: f.from, to: f.to } as Range, { category: f.category, area: f.area, status: f.status });
    this.areaSlices = this.r.byArea.map((a, i) => ({ label: this.areaLabel(a.area), value: a.value, color: this.areaColor(i) }));
  }

  private rows(): unknown[][] {
    const r = this.r;
    return [
      [`Reporte de inventario · ${this.svc.company}`, rangeLabel(this.applied)], [],
      ['Valor en existencias', Math.round(r.stockValue)], ['Entradas', r.entries, `${r.entryCount} movimientos`], ['Salidas (consumo)', r.consumption, `${r.exitCount} movimientos`],
      ['Mermas y ajustes', -r.shrinkage], ['Rotación (veces)', num(r.rotation, 2)], [],
      ['Categoría', 'Valor en existencias'], ...r.byCategory.map(c => [c.category, Math.round(c.value)]), [],
      ['Área', 'Consumo', '%'], ...r.byArea.map(a => [a.area, a.value, num(a.share, 1)]), [],
      ['Producto', 'Cantidad', 'Unidad', 'Valor'], ...r.top.map(t => [t.name, t.qty, t.unit, t.value]), [],
      ['Código', 'Producto', 'Categoría', 'Existencias', 'Unidad', 'Mínimo', 'Consumo diario', 'Días de cobertura', 'Vence', 'Estado'],
      ...r.alerts.map(a => [a.product.code, a.product.name, a.product.category, a.product.stock, a.product.unit, a.product.minStock, num(a.daily, 2), isFinite(a.cover) ? num(a.cover, 1) : '', a.expiry ? dmy(a.expiry) : '', a.status]),
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.rows(), `reporte-inventario-${this.applied.from}_${this.applied.to}.csv`);
    this.svc.log('exportación', `Reporte de inventario.csv · ${rangeLabel(this.applied)}`);
  }

  pdf(): void {
    const r = this.r;
    openDocument('Reporte de inventario', `
      <header><div><h1>Reporte de inventario</h1><div class="muted">${esc(this.svc.company)} · ${rangeLabel(this.applied)}</div></div><div class="brand">SOGO</div></header>
      <table><tbody><tr><td>Valor en existencias</td><td class="r"><strong>${money(r.stockValue)}</strong></td><td>Rotación</td><td class="r">${num(r.rotation, 2)} veces</td></tr>
      <tr><td>Entradas</td><td class="r">${money(r.entries)}</td><td>Salidas (consumo)</td><td class="r">${money(r.consumption)}</td></tr>
      <tr><td>Mermas y ajustes</td><td class="r">- ${money(r.shrinkage)}</td><td></td><td></td></tr></tbody></table>
      <h2>Consumo por área</h2><table><tbody>${r.byArea.map(a => `<tr><td>${esc(a.area)}</td><td class="r">${money(a.value)}</td><td class="r">${pct(a.share)}</td></tr>`).join('')}</tbody></table>
      <h2>Productos con alerta</h2><table><thead><tr><th>Código</th><th>Producto</th><th class="r">Existencias</th><th class="r">Cobertura</th><th>Estado</th></tr></thead><tbody>
      ${r.alerts.map(a => `<tr><td>${esc(a.product.code)}</td><td>${esc(a.product.name)}</td><td class="r">${fmtQty(a.product.stock)} ${esc(a.product.unit)}</td><td class="r">${isFinite(a.cover) ? num(a.cover, 1) + ' días' : '—'}</td><td>${esc(a.status)}</td></tr>`).join('')}
      </tbody></table>`, true);
    this.svc.log('exportación', `Reporte de inventario.pdf · ${rangeLabel(this.applied)}`);
  }
}

