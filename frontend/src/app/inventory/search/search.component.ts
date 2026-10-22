import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { Product, ProductStatus, STATUS_BADGE, productStatus, fmtQty } from '../inventory.model';
import { StockMeterComponent } from '../stock-meter.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { esc } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';

type Facet = 'status' | 'category' | 'supplier' | 'unit';

@Component({
  selector: 'app-inventory-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StockMeterComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Buscar productos</span></nav>
  <header class="kit-head"><h1 class="kit-title">Buscar productos</h1></header>

  <div class="sr-box">
    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="search" [(ngModel)]="q" (ngModelChange)="run()" placeholder="Escribe un código, nombre, categoría, proveedor o unidad" aria-label="Buscar productos" autofocus>
    <span class="kit-muted">{{ q.trim() ? results.length + ' resultado' + (results.length === 1 ? '' : 's') + ' en ' + ms + ' ms' : 'Busca por código, nombre, categoría, proveedor o unidad' }}</span>
  </div>

  <div class="sr-layout">
    <aside class="kit-card sr-filters">
      <h2 class="kit-card-title">Filtros</h2>
      <ng-container *ngFor="let f of facets">
        <h3>{{ f.label }}</h3>
        <label *ngFor="let o of options(f.key)" class="sr-opt"><input type="checkbox" [checked]="picked[f.key].has(o.value)" (change)="toggle(f.key, o.value)"> {{ o.value }} <small>({{ o.count }})</small></label>
      </ng-container>
      <button type="button" class="rsv-btn rsv-btn--outline" style="width:100%" (click)="clear()">Limpiar filtros</button>
    </aside>

    <section class="sr-results">
      <article *ngFor="let p of results" class="kit-card sr-card" [class.active]="p.id === selected?.id" (click)="selected = p" tabindex="0" (keydown.enter)="selected = p">
        <div class="sr-card-main">
          <span class="kit-mono">{{ p.code }}</span> <span class="inv-cat" [ngClass]="'inv-cat--' + p.category.toLowerCase()">{{ p.category }}</span>
          <h3 [innerHTML]="hl(p.name)"></h3>
          <small class="kit-muted">{{ p.location }} · {{ p.supplier }} · {{ p.unit }}</small>
        </div>
        <app-stock-meter [stock]="p.stock" [min]="p.minStock"></app-stock-meter>
        <span class="rsv-badge" [ngClass]="badge[st(p)]">{{ st(p) }}</span>
      </article>
      <div class="kit-card sr-empty" *ngIf="q.trim() && !results.length">
        <strong>No se encontraron productos para «{{ q.trim() }}».</strong>
        <span>Revisa el texto o los filtros.</span>
        <a routerLink="/dashboard/inventory/products/new" class="rsv-btn rsv-btn--outline">Registrar producto</a>
      </div>
      <p class="kit-muted sr-hint" *ngIf="!q.trim() && !results.length">Escribe al menos una letra o usa los filtros.</p>
    </section>

    <aside class="kit-card sr-detail" *ngIf="selected as p">
      <span class="kit-mono">{{ p.code }}</span>
      <h2>{{ p.name }}</h2>
      <span class="inv-cat" [ngClass]="'inv-cat--' + p.category.toLowerCase()">{{ p.category }}</span>
      <div class="kit-sum"><span>Existencias</span><strong>{{ qty(p.stock) }} {{ p.unit }}</strong></div>
      <div class="kit-sum"><span>Nivel mínimo</span><strong>{{ qty(p.minStock) }} {{ p.unit }}</strong></div>
      <div class="kit-sum"><span>Ubicación</span><strong>{{ p.location }}</strong></div>
      <div class="kit-sum"><span>Proveedor</span><strong>{{ p.supplier }}</strong></div>
      <div class="kit-sum"><span>Costo unitario</span><strong>{{ money(p.unitCost) }}</strong></div>
      <div class="kit-sum"><span>Último movimiento</span><strong>{{ last(p) }}</strong></div>
      <div class="sr-actions">
        <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/inventory/products', p.id]">Ver detalle completo</a>
        <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/inventory/exits" [queryParams]="{ producto: p.id }">Registrar salida</a>
      </div>
    </aside>
  </div>
  `,
  styles: [`
    .sr-box { display: flex; align-items: center; gap: 12px; padding: 0 18px; height: 56px; background: #fff; border: 2px solid #0B6FD0; border-radius: 14px; margin-bottom: 18px; }
    .sr-box svg { width: 20px; height: 20px; stroke: #0B6FD0; fill: none; stroke-width: 2; flex-shrink: 0; }
    .sr-box input { flex: 1; border: none; outline: none; font: inherit; font-size: 16px; font-weight: 600; background: transparent; min-width: 120px; }
    .sr-box .kit-muted { font-size: 12px; text-align: right; }
    .sr-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
    .sr-filters h3 { margin: 12px 0 6px; font-size: 12.5px; color: #374151; }
    .sr-opt { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; cursor: pointer; }
    .sr-opt input { accent-color: #0B6FD0; }
    .sr-opt small { color: #6B7280; }
    .sr-filters .rsv-btn { margin-top: 14px; }
    .sr-results { display: flex; flex-direction: column; gap: 12px; }
    .sr-card { display: flex; align-items: center; gap: 14px; cursor: pointer; flex-wrap: wrap; }
    .sr-card.active { border-color: #0B6FD0; background: #F5F9FE; }
    .sr-card-main { flex: 1; min-width: 180px; }
    .sr-card h3 { margin: 4px 0 2px; font-size: 15px; color: #0A2540; }
    .sr-card ::ng-deep mark { background: #FEF08A; color: inherit; padding: 0 1px; border-radius: 2px; }
    .sr-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 30px; }
    .sr-hint { text-align: center; }
    .sr-detail { border-color: #0B6FD0; position: sticky; top: 110px; }
    .sr-detail h2 { margin: 2px 0 6px; font-size: 18px; color: #0A2540; }
    .sr-detail .kit-sum { font-size: 12.5px; }
    .sr-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .sr-actions .rsv-btn { height: 38px; padding: 0 8px; font-size: 12px; }
    @media (max-width: 1150px) { .sr-layout { grid-template-columns: 200px minmax(0, 1fr); } .sr-detail { grid-column: 1 / -1; position: static; } }
    @media (max-width: 700px) { .sr-layout { grid-template-columns: 1fr; } }
  `],
})
export class SearchComponent {
  readonly facets: { key: Facet; label: string }[] = [
    { key: 'status', label: 'Disponibilidad' }, { key: 'category', label: 'Categoría' }, { key: 'supplier', label: 'Proveedor' }, { key: 'unit', label: 'Unidad de medida' },
  ];
  readonly badge = STATUS_BADGE;
  readonly money = fmtMoney;
  readonly qty = fmtQty;

  q = '';
  ms = 0;
  matched: Product[] = [];
  results: Product[] = [];
  selected?: Product;
  picked: Record<Facet, Set<string>> = { status: new Set(), category: new Set(), supplier: new Set(), unit: new Set() };

  constructor(private svc: InventoryService) {
    svc.getProducts().subscribe(() => this.run());
  }

  st(p: Product): ProductStatus { return productStatus(p, isoDate(0), this.svc.config.expiryDays); }

  private value(p: Product, f: Facet): string {
    return f === 'status' ? this.st(p) : f === 'category' ? p.category : f === 'supplier' ? p.supplier : p.unit;
  }

  /** Opciones de cada filtro con el conteo sobre los resultados de la búsqueda. */
  options(f: Facet): { value: string; count: number }[] {
    const counts = new Map<string, number>();
    this.matched.forEach(p => counts.set(this.value(p, f), (counts.get(this.value(p, f)) ?? 0) + 1));
    this.picked[f].forEach(v => counts.has(v) || counts.set(v, 0));
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
  }

  run(): void {
    const t0 = performance.now();
    const q = this.normalize(this.q.trim());
    const anyFilter = Object.values(this.picked).some(s => s.size);
    this.matched = !q && !anyFilter ? [] : this.svc.productsSnapshot().filter(p => !q
      || [p.code, p.name, p.category, p.supplier, p.unit].some(v => this.normalize(v).includes(q)));
    this.results = this.matched.filter(p => this.facets.every(f => !this.picked[f.key].size || this.picked[f.key].has(this.value(p, f.key))));
    this.ms = Math.max(1, Math.round(performance.now() - t0));
    this.selected = this.results.find(p => p.id === this.selected?.id) ?? this.results[0];
  }

  toggle(f: Facet, v: string): void {
    this.picked[f].has(v) ? this.picked[f].delete(v) : this.picked[f].add(v);
    this.run();
  }

  clear(): void {
    this.facets.forEach(f => this.picked[f.key].clear());
    this.run();
  }

  /** Resalta la coincidencia sin distinguir tildes ni mayúsculas (el texto se escapa antes). */
  hl(text: string): string {
    const q = this.normalize(this.q.trim());
    const i = q ? this.normalize(text).indexOf(q) : -1;
    if (i < 0) return esc(text);
    return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
  }

  last(p: Product): string {
    const x = this.svc.movementsFor(p.id)[0];
    return x ? `${x.m.number} · ${x.m.date.slice(8, 10)}/${x.m.date.slice(5, 7)}` : 'Sin movimientos';
  }

  private normalize(s: string): string { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
}
