import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { InventoryService, serverError } from '../inventory.service';
import {
  Product, ProductStatus, STATUS_BADGE, STATUS_ORDER, Alert, Category, productStatus, daysToExpiry, fmtQty, Movement, MovementLine,
} from '../inventory.model';
import { StockMeterComponent } from '../stock-meter.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';

@Component({
  selector: 'app-inventory-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StockMeterComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Consultar inventario</h1>
      <p class="kit-sub">Existencias de aseo, amenities, lencería, papelería y mantenimiento. Alimentos y bebidas están en pausa: el hospedaje no los ofrece por ahora.</p>
    </div>
    <div class="kit-actions">
      <a routerLink="/dashboard/inventory/exits" class="rsv-btn rsv-btn--outline">Registrar salida</a>
      <a routerLink="/dashboard/inventory/entries" class="rsv-btn rsv-btn--outline">Registrar entrada</a>
      <a routerLink="/dashboard/inventory/products/new" class="rsv-btn rsv-btn--primary" *ngIf="svc.canCreate">+ Nuevo producto</a>
    </div>
  </header>

  <div class="kit-banner kit-banner--info" *ngIf="toCount" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <div><strong>{{ toCount }} producto{{ toCount === 1 ? '' : 's' }} por contar.</strong> Están en el catálogo pero aún sin existencias registradas.
      Haz el primer conteo físico (por bodega) para cargar las cantidades reales; también puedes registrar una compra.</div>
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/inventory/adjustments" *ngIf="svc.canEdit">Hacer conteo físico</a>
  </div>

  <section class="kit-card il-cats">
    <div class="il-cats-head"><h2 class="kit-card-title">Categorías</h2>
      <span class="kit-muted">Una categoría en pausa no recibe productos ni entradas y no genera alertas (se conserva para usarla más adelante).</span></div>
    <div class="il-cat-list">
      <div class="il-cat" *ngFor="let c of cats" [class.off]="!c.inUse">
        <div><strong>{{ c.name }}</strong><small>{{ c.prefix }} · {{ c.products ?? 0 }} producto{{ c.products === 1 ? '' : 's' }}</small></div>
        <span class="rsv-badge" [ngClass]="c.inUse ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ c.inUse ? 'En uso' : 'En pausa' }}</span>
        <button type="button" class="il-cat-btn" *ngIf="svc.canEdit" (click)="toggle(c)">{{ c.inUse ? 'Pausar' : 'Usar' }}</button>
      </div>
    </div>
    <p class="kit-error" *ngIf="catError">{{ catError }}</p>
  </section>

  <section class="kit-kpis inv-kpis">
    <div class="kit-kpi"><div><span>Productos</span><strong>{{ products.length }}</strong><small>{{ categories.length }} categorías</small></div></div>
    <div class="kit-kpi"><div><span>Valor del inventario</span><strong>{{ money(totalValue) }}</strong><small>Al costo</small></div></div>
    <div class="kit-kpi"><div><span>Bajo el mínimo</span><strong>{{ count['Stock bajo'] }}</strong><small>Igual o menor al mínimo</small></div></div>
    <div class="kit-kpi"><div><span>Agotados</span><strong>{{ count['Agotado'] }}</strong><small>Sin existencias</small></div></div>
    <div class="kit-kpi"><div><span>Por vencer ({{ svc.config.expiryDays }} días)</span><strong>{{ expiring.length }}</strong><small>{{ expiringNames || 'Ninguno' }}</small></div></div>
  </section>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="inv-tabs" role="tablist">
      <button type="button" role="tab" [class.active]="!category" (click)="category = ''; apply()">Todos <span>{{ products.length }}</span></button>
      <button type="button" role="tab" *ngFor="let c of categories" [class.active]="category === c" (click)="category = c; apply()">{{ c }} <span>{{ catCount(c) }}</span></button>
    </div>
    <div class="inv-filters">
      <div class="kit-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Código, nombre, proveedor o ubicación..." aria-label="Buscar"></div>
      <label class="kit-select"><span>Disponibilidad</span>
        <select [(ngModel)]="status" (ngModelChange)="apply()"><option value="">Todas</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
      <label class="kit-select"><span>Proveedor</span>
        <select [(ngModel)]="supplier" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let s of suppliers">{{ s }}</option></select></label>
      <label class="kit-select"><span>Ubicación</span>
        <select [(ngModel)]="location" (ngModelChange)="apply()"><option value="">Todas</option><option *ngFor="let l of locations">{{ l }}</option></select></label>
    </div>
  </section>

  <div class="kit-layout il-layout">
    <section class="kit-card">
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Código</th><th>Producto</th><th>Ubicación</th><th>Existencias</th><th>Unidad</th><th class="r">Costo unit.</th><th>Estado</th></tr></thead>
          <tbody>
            <tr *ngFor="let p of shown" class="clickable" [class.selected]="p.id === selected?.id" (click)="select(p)" tabindex="0" (keydown.enter)="select(p)"
                [class.inv-row-danger]="st(p) === 'Agotado'" [class.inv-row-warn]="st(p) === 'Stock bajo'">
              <td class="kit-mono">{{ p.code }}</td>
              <td><strong>{{ p.name }}</strong><br><span class="inv-cat" [ngClass]="'inv-cat--' + p.category.toLowerCase()">{{ p.category }}</span></td>
              <td class="kit-muted">{{ p.location }}</td>
              <td><app-stock-meter [stock]="p.stock" [min]="p.minStock"></app-stock-meter></td>
              <td class="kit-muted">{{ p.unit }}</td>
              <td class="r">{{ money(p.unitCost) }}</td>
              <td><span class="rsv-badge" [ngClass]="badge[st(p)]">{{ st(p) }}</span></td>
            </tr>
            <tr *ngIf="!filtered.length"><td colspan="7" class="kit-empty">No hay productos con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="kit-muted il-foot" *ngIf="filtered.length">
        Mostrando {{ shown.length }} de {{ filtered.length }} productos · ordenados por prioridad
        <button type="button" class="il-more" *ngIf="shown.length < filtered.length" (click)="showAll = true">Ver todos</button>
      </p>
    </section>

    <aside class="kit-aside" *ngIf="selected as p">
      <section class="kit-card il-detail">
        <span class="kit-mono">{{ p.code }}</span>
        <h2>{{ p.name }}</h2>
        <div class="il-badges">
          <span class="inv-cat" [ngClass]="'inv-cat--' + p.category.toLowerCase()">{{ p.category }}</span>
          <span class="rsv-badge" [ngClass]="badge[st(p)]">{{ st(p) }}</span>
          <span class="rsv-badge rsv-badge--partial" *ngIf="expiryLabel(p)">{{ expiryLabel(p) }}</span>
        </div>
        <div class="il-facts">
          <div [class.warn]="p.stock <= p.minStock"><span>Existencias</span><strong>{{ qty(p.stock) }} {{ p.unit }}</strong></div>
          <div><span>Mínimo</span><strong>{{ qty(p.minStock) }} {{ p.unit }}</strong></div>
          <div><span>Costo unitario</span><strong>{{ money(p.unitCost) }}</strong></div>
          <div><span>Valor en bodega</span><strong>{{ money(p.stock * p.unitCost) }}</strong></div>
        </div>
        <p class="kit-muted il-where">{{ p.location || "Sin ubicación" }} · Proveedor: {{ p.supplier || "sin registrar" }}</p>
        <p class="kit-banner kit-banner--info il-req" *ngIf="!p.categoryInUse">Categoría en pausa: no se usa por ahora.</p>
        <h3>Movimientos recientes</h3>
        <div class="inv-mov" *ngFor="let x of recent">
          <div><strong>{{ x.m.kind }} · {{ x.m.reason.toLowerCase() }}</strong><small>{{ x.m.number }} · {{ dm(x.m.date) }} {{ x.m.time }}</small></div>
          <span [class.inv-green]="x.line.qty > 0" [class.inv-red]="x.line.qty < 0">{{ x.line.qty > 0 ? '+' : '' }}{{ qty(x.line.qty) }} {{ p.unit }}</span>
        </div>
        <p class="kit-muted" *ngIf="!recent.length">Sin movimientos registrados.</p>
        <p class="kit-banner kit-banner--info il-req" *ngIf="requested(p)">Compra solicitada {{ requested(p) }}.</p>
        <div class="il-actions">
          <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/inventory/products', p.id]" fragment="movimientos">Ver historial</a>
          <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="p.counted && p.categoryInUse && p.stock <= p.minStock && svc.canEdit; else edit" [disabled]="!!requested(p)" (click)="request(p)">Solicitar compra</button>
          <ng-template #edit><a class="rsv-btn rsv-btn--primary" [routerLink]="['/dashboard/inventory/products', p.id]">Editar producto</a></ng-template>
        </div>
      </section>
    </aside>
  </div>
  `,
  styles: [`
    .inv-kpis { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .il-layout { grid-template-columns: minmax(0, 1fr) 320px; }
    .il-foot { text-align: center; }
    .il-more { border: none; background: none; color: #0B6FD0; font: inherit; font-weight: 600; cursor: pointer; }
    .il-detail { border-color: #0B6FD0; }
    .il-detail h2 { margin: 2px 0 8px; font-size: 18px; color: #0A2540; }
    .il-detail h3 { margin: 14px 0 8px; font-size: 13px; color: #0A2540; }
    .il-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .il-badges .inv-cat { margin: 0; }
    .il-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .il-facts div { padding: 10px; border-radius: 10px; background: #F4F7FB; font-size: 11.5px; color: #6B7280; }
    .il-facts div.warn { background: #FFF4E5; }
    .il-facts strong { display: block; font-size: 15px; color: #0A2540; }
    .il-facts .warn strong { color: #92400E; }
    .il-where { font-size: 12px; margin: 10px 0 0; }
    .il-req { font-size: 12px; margin: 8px 0 0; }
    .il-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .il-actions .rsv-btn { height: 38px; padding: 0 10px; }
    .il-cats { margin-bottom: 18px; }
    .il-cats-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .il-cats-head .kit-muted { font-size: 12px; }
    .il-cat-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
    .il-cat { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #E6EBF2; border-radius: 10px; }
    .il-cat > div { flex: 1; min-width: 0; }
    .il-cat strong { display: block; font-size: 13px; color: #0A2540; }
    .il-cat small { font-size: 11px; color: #6B7280; }
    .il-cat.off { background: #F8FAFC; }
    .il-cat.off strong { color: #6B7280; }
    .il-cat-btn { border: none; background: none; padding: 0; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  `],
})
export class InventoryListComponent {
  readonly statuses: ProductStatus[] = ['Agotado', 'Stock bajo', 'Por vencer', 'Disponible', 'Por contar', 'En pausa'];
  readonly badge = STATUS_BADGE;
  get locations(): string[] { return this.svc.locations(); }
  get cats(): Category[] { return this.svc.getCategories(); }
  catError = '';
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly today = isoDate(0);

  products: Product[] = [];
  filtered: Product[] = [];
  categories: string[] = [];
  suppliers: string[] = [];
  alerts: Alert[] = [];
  count = {} as Record<ProductStatus, number>;
  expiring: Product[] = [];
  expiringNames = '';
  totalValue = 0;
  toCount = 0;
  category = '';
  search = '';
  status = '';
  supplier = '';
  location = '';
  showAll = false;
  selected?: Product;
  recent: { m: Movement; line: MovementLine }[] = [];

  constructor(public svc: InventoryService, route: ActivatedRoute) {
    const wanted = route.snapshot.queryParamMap.get('producto');
    this.category = route.snapshot.queryParamMap.get('categoria') ?? '';
    combineLatest([svc.getProducts(), svc.getAlerts(), svc.getMovements()]).subscribe(([products, alerts]) => {
      this.alerts = alerts;
      this.products = [...products].sort((a, b) => STATUS_ORDER[this.st(a)] - STATUS_ORDER[this.st(b)] || a.code.localeCompare(b.code));
      this.categories = svc.getCategories().map(c => c.name).filter(c => products.some(p => p.category === c));
      this.suppliers = svc.suppliers();
      this.statuses.forEach(s => this.count[s] = products.filter(p => this.st(p) === s).length);
      this.expiring = products.filter(p => { const d = daysToExpiry(p, this.today); return d !== null && d <= svc.config.expiryDays && p.stock > 0; });
      this.expiringNames = this.expiring.map(p => p.name.split(' ')[0].toLowerCase()).join(', ');
      this.totalValue = products.reduce((s, p) => s + p.stock * p.unitCost, 0);
      this.toCount = products.filter(p => p.categoryInUse && !p.counted).length;
      this.apply();
      this.select(products.find(p => p.id === (this.selected?.id ?? wanted)) ?? this.filtered[0]);
    });
  }

  get shown(): Product[] { return this.showAll ? this.filtered : this.filtered.slice(0, 14); }

  st(p: Product): ProductStatus { return productStatus(p, this.today, this.svc.config.expiryDays); }
  catCount(c: string): number { return this.products.filter(p => p.category === c).length; }
  dm(iso: string): string { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.products.filter(p => (!this.category || p.category === this.category) && (!this.status || this.st(p) === this.status)
      && (!this.supplier || p.supplier === this.supplier) && (!this.location || p.location === this.location)
      && (!q || [p.code, p.name, p.supplier, p.location, p.category].some(v => v.toLowerCase().includes(q))));
  }

  select(p?: Product): void {
    this.selected = p;
    this.recent = p ? this.svc.movementsFor(p.id).slice(0, 4) : [];
  }

  expiryLabel(p: Product): string {
    const d = daysToExpiry(p, this.today);
    return d !== null && d <= 30 ? `Vence ${this.dm(p.expiryDate)}` : '';
  }

  requested(p: Product): string {
    const at = this.alerts.find(a => a.productId === p.id && a.status === 'Activa' && a.purchaseRequestedAt)?.purchaseRequestedAt;
    return at ? `el ${this.dm(at)} a las ${at.slice(11, 16)}` : '';
  }

  request(p: Product): void { this.svc.requestPurchase(p.id).catch(e => this.catError = serverError(e, 'solicitar la compra')); }

  async toggle(c: Category): Promise<void> {
    this.catError = '';
    try { await this.svc.setCategoryInUse(c, !c.inUse); } catch (e) { this.catError = serverError(e, 'cambiar la categoría'); }
  }
}
