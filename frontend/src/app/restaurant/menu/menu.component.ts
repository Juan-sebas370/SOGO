import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { MenuProduct, MenuCategory, MENU_CATEGORIES, STOCK_BADGE, StockState, canSell, stockState } from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { dayTime } from '../restaurant-format';

@Component({
  selector: 'app-restaurant-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './menu.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante y cafetería</a></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Menú</h1>
      <p class="kit-sub">Consulta productos, precios y disponibilidad en tiempo real e inicia un pedido desde aquí.</p>
    </div>
    <div class="kit-actions">
      <a routerLink="/dashboard/restaurant/menu/edit" class="rsv-btn rsv-btn--outline">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Actualizar menú
      </a>
      <a routerLink="/dashboard/restaurant/orders/new" class="rsv-btn rsv-btn--primary">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuevo pedido<span class="mnu-count" *ngIf="draftCount">{{ draftCount }}</span>
      </a>
    </div>
  </header>

  <section class="kit-card mnu-filters">
    <div class="mnu-filter-row">
      <div class="kit-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Buscar producto por nombre o categoría..." aria-label="Buscar producto">
      </div>
      <label class="mnu-only">
        <span class="kit-toggle"><input type="checkbox" [(ngModel)]="onlySellable" (ngModelChange)="apply()"><i></i></span>
        Mostrar solo disponibles para la venta
      </label>
    </div>
    <div class="kit-chips" role="group" aria-label="Categoría">
      <button type="button" class="kit-chip" [class.active]="!category" (click)="setCategory(null)">Todos <small>{{ counts['all'] }}</small></button>
      <button type="button" class="kit-chip" *ngFor="let c of categories" [class.active]="category === c" (click)="setCategory(c)">{{ c }} <small>{{ counts[c] }}</small></button>
    </div>
  </section>

  <div class="kit-layout">
    <section class="mnu-grid" aria-label="Productos">
      <article *ngFor="let p of filtered" class="mnu-item" [class.selected]="selected?.id === p.id" [class.off]="!sellable(p)"
               (click)="selected = p" tabindex="0" (keydown.enter)="selected = p" [attr.aria-label]="p.name">
        <div class="mnu-item-top">
          <app-product-icon [category]="p.category"></app-product-icon>
          <div>
            <h3>{{ p.name }}</h3>
            <p>{{ p.description }}</p>
          </div>
        </div>
        <div class="mnu-item-price">
          <strong>{{ money(p.price) }}</strong>
          <span class="rsv-badge" [ngClass]="badge(state(p))">{{ state(p) }}</span>
        </div>
        <button type="button" class="mnu-add" [disabled]="!sellable(p)" (click)="add(p); $event.stopPropagation()">
          {{ !sellable(p) ? 'No disponible' : draft[p.id] ? '+ Agregar otro (' + draft[p.id] + ' en el pedido)' : '+ Agregar al pedido' }}
        </button>
      </article>
      <p class="kit-empty mnu-empty" *ngIf="!filtered.length">No hay productos que coincidan con la búsqueda.</p>
    </section>

    <aside class="kit-aside">
      <article class="kit-card mnu-detail" *ngIf="selected as p">
        <div class="mnu-detail-head">
          <app-product-icon [category]="p.category" size="lg"></app-product-icon>
          <div>
            <span class="mnu-cat">{{ p.category }}</span>
            <h2>{{ p.name }}</h2>
            <strong class="mnu-detail-price">{{ money(p.price) }}</strong>
          </div>
        </div>
        <p class="mnu-desc">{{ p.description }}</p>
        <ng-container *ngIf="p.ingredients.length">
          <h4>Ingredientes</h4>
          <div class="mnu-tags"><span *ngFor="let i of p.ingredients">{{ i }}</span></div>
        </ng-container>
        <ng-container *ngIf="p.observations">
          <h4>Observaciones</h4>
          <p class="mnu-obs">{{ p.observations }}</p>
        </ng-container>
        <hr class="kit-divider">
        <div class="kit-sum"><span>Disponibilidad</span>
          <span class="rsv-badge" [ngClass]="badge(state(p))">{{ state(p) }}{{ p.stock > 0 ? ' · ' + p.stock + ' porciones' : '' }}</span>
        </div>
        <div class="kit-sum"><span>Impuesto</span><strong>INC {{ taxPct }}%</strong></div>
        <button type="button" class="rsv-btn rsv-btn--primary kit-block mnu-cta" [disabled]="!sellable(p)" (click)="addAndGo(p)">
          {{ sellable(p) ? 'Agregar a un nuevo pedido' : 'No disponible para la venta' }}
        </button>
      </article>
      <p class="kit-banner kit-banner--info mnu-note" *ngIf="lastUpdate">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Menú actualizado {{ dayTime(lastUpdate.updatedAt) }} por {{ lastUpdate.updatedBy }}. Los productos agotados se muestran bloqueados y no se pueden pedir.</span>
      </p>
    </aside>
  </div>
  `,
})
export class MenuComponent {
  readonly categories = MENU_CATEGORIES;
  readonly money = fmtMoney;
  readonly dayTime = dayTime;
  readonly state = stockState;
  readonly sellable = canSell;

  products: MenuProduct[] = [];
  filtered: MenuProduct[] = [];
  counts: Record<string, number> = {};
  selected?: MenuProduct;
  lastUpdate?: MenuProduct;
  search = '';
  onlySellable = false;
  category: MenuCategory | null = null;
  draft: Record<string, number> = {};
  draftCount = 0;
  taxPct: number;

  constructor(private svc: RestaurantService, private router: Router) {
    this.taxPct = Math.round(svc.taxRate * 100);
    svc.getProducts().subscribe(list => {
      this.products = list;
      this.selected = list.find(p => p.id === this.selected?.id) ?? list.find(p => p.id === 'DES-01') ?? list[0];
      this.lastUpdate = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      this.apply();
    });
    svc.getDraft().subscribe(d => {
      this.draft = d;
      this.draftCount = Object.values(d).reduce((s, q) => s + q, 0);
    });
  }

  setCategory(c: MenuCategory | null): void {
    this.category = c;
    this.apply();
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    const base = this.products.filter(p =>
      (!q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)) && (!this.onlySellable || canSell(p)));
    this.counts = { all: base.length };
    this.categories.forEach(c => this.counts[c] = base.filter(p => p.category === c).length);
    this.filtered = base.filter(p => !this.category || p.category === this.category);
  }

  add(p: MenuProduct): void { this.svc.addToDraft(p.id); }

  addAndGo(p: MenuProduct): void {
    this.svc.addToDraft(p.id);
    this.router.navigate(['/dashboard/restaurant/orders/new']);
  }

  badge(s: StockState): string { return STOCK_BADGE[s]; }
}
