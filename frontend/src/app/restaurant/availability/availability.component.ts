import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { MenuProduct, MenuCategory, MENU_CATEGORIES, STOCK_BADGE, StockState, stockState } from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { dayTime } from '../restaurant-format';

type Chip = 'Todos' | StockState;
const ORDER: Record<StockState, number> = { 'Agotado': 0, 'Existencias bajas': 1, 'No disponible': 2, 'Disponible': 3 };

@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Disponibilidad</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Disponibilidad de productos</h1>
      <p class="kit-sub">Existencias en tiempo real: se descuentan con cada pedido y vuelven al anularlo.</p>
    </div>
    <a routerLink="/dashboard/inventory" class="rsv-btn rsv-btn--outline">
      <svg viewBox="0 0 24 24"><path d="M21 16V8l-9-5-9 5v8l9 5z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>Ir a Inventarios
    </a>
  </header>

  <section class="kit-kpis">
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--blue"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>
      <div><span>Productos</span><strong>{{ products.length }}</strong><small>En el menú</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
      <div><span>Disponibles</span><strong>{{ count['Disponible'] }}</strong><small>Sobre el mínimo</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <div><span>Existencias bajas</span><strong>{{ count['Existencias bajas'] }}</strong><small>Bajo el mínimo</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span>
      <div><span>Agotados</span><strong>{{ count['Agotado'] }}</strong><small>Bloqueados en pedidos</small></div></div>
  </section>

  <div class="kit-banner kit-banner--warn" *ngIf="attention.length" role="status">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><b>{{ attention.length }} producto{{ attention.length === 1 ? ' requiere' : 's requieren' }} atención:</b> {{ attentionText }}</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="restock()" [disabled]="requested">{{ requested ? 'Solicitud enviada' : 'Solicitar abastecimiento' }}</button>
  </div>

  <section class="kit-card">
    <div class="av-filters">
      <div class="kit-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" placeholder="Buscar por nombre, categoría o código..." aria-label="Buscar producto">
      </div>
      <div class="kit-chips">
        <ng-container *ngFor="let c of chips">
          <button type="button" class="kit-chip" *ngIf="c === 'Todos' || count[c] || chip === c" [class.active]="chip === c" (click)="chip = c">
            {{ c }} <small>{{ c === 'Todos' ? products.length : count[c] }}</small>
          </button>
        </ng-container>
      </div>
      <label class="kit-select"><span>Categoría</span>
        <select [(ngModel)]="category"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select>
      </label>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="r">Precio</th><th>Existencias vs. mínimo</th><th>Estado</th><th>Último movimiento</th></tr></thead>
        <tbody>
          <tr *ngFor="let p of visible" [class.av-danger]="state(p) === 'Agotado'" [class.av-warn]="state(p) === 'Existencias bajas'">
            <td class="kit-mono">{{ p.code }}</td>
            <td><div class="kit-prod"><app-product-icon [category]="p.category" size="sm"></app-product-icon><strong>{{ p.name }}</strong></div></td>
            <td>{{ p.category }}</td>
            <td class="r">{{ money(p.price) }}</td>
            <td>
              <div class="av-meter" [attr.aria-label]="p.stock + ' de mínimo ' + p.minStock">
                <span class="av-track">
                  <b [style.width.%]="fill(p)" [ngClass]="'av-fill--' + tone(p)"></b>
                  <i [style.left.%]="marker(p)"></i>
                </span>
                <span><strong>{{ p.stock }}</strong> / mín. {{ p.minStock }}</span>
              </div>
            </td>
            <td><span class="rsv-badge" [ngClass]="badge(state(p))">{{ state(p) }}</span></td>
            <td class="kit-muted">{{ p.lastMovement ? p.lastMovement.text + ' · ' + dayTime(p.lastMovement.at) : 'Sin movimientos' }}</td>
          </tr>
          <tr *ngIf="!visible.length"><td colspan="7" class="kit-empty">No hay productos con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  `,
  styles: [`
    .av-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    .av-filters .kit-search input { height: 46px; }
    .av-danger td { background: #FFF8F8; }
    .av-warn td { background: #FFFBF4; }
    .av-meter { display: flex; align-items: center; gap: 10px; font-size: 12px; white-space: nowrap; }
    .av-track { position: relative; width: 110px; height: 7px; border-radius: 999px; background: #E6EBF2; }
    .av-track b { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; }
    .av-track i { position: absolute; top: -4px; width: 2px; height: 15px; background: #0A2540; }
    .av-fill--ok { background: #2E9D5B; } .av-fill--warn { background: #C26A0A; } .av-fill--danger { background: transparent; }
  `],
})
export class AvailabilityComponent {
  readonly categories = MENU_CATEGORIES;
  readonly chips: Chip[] = ['Todos', 'Disponible', 'Existencias bajas', 'Agotado', 'No disponible'];
  readonly money = fmtMoney;
  readonly dayTime = dayTime;
  readonly state = stockState;

  products: MenuProduct[] = [];
  count = {} as Record<StockState, number>;
  attention: MenuProduct[] = [];
  attentionText = '';
  search = '';
  chip: Chip = 'Todos';
  category: MenuCategory | '' = '';
  requested = false;

  constructor(private svc: RestaurantService) {
    svc.getProducts().subscribe(list => {
      this.products = [...list].sort((a, b) => ORDER[stockState(a)] - ORDER[stockState(b)] || a.code.localeCompare(b.code));
      (['Disponible', 'Existencias bajas', 'Agotado', 'No disponible'] as StockState[])
        .forEach(s => this.count[s] = list.filter(p => stockState(p) === s).length);
      const out = list.filter(p => stockState(p) === 'Agotado');
      const low = list.filter(p => stockState(p) === 'Existencias bajas');
      this.attention = [...out, ...low];
      const names = (ps: MenuProduct[]) => ps.map(p => p.name).join(' y ');
      this.attentionText = [
        out.length ? `${names(out)} ${out.length === 1 ? 'está agotado' : 'están agotados'}` : '',
        low.length ? `${names(low)} ${low.length === 1 ? 'está' : 'están'} por debajo del mínimo` : '',
      ].filter(Boolean).join('; ') + '.';
    });
  }

  get visible(): MenuProduct[] {
    const q = this.search.trim().toLowerCase();
    return this.products.filter(p => (this.chip === 'Todos' || stockState(p) === this.chip)
      && (!this.category || p.category === this.category)
      && (!q || `${p.name} ${p.category} ${p.code}`.toLowerCase().includes(q)));
  }

  /** Escala: el triple del mínimo (o las existencias, si son más), para que la marca del mínimo se vea. */
  private scale(p: MenuProduct): number { return Math.max(p.stock, p.minStock * 3, 1); }
  fill(p: MenuProduct): number { return (p.stock / this.scale(p)) * 100; }
  marker(p: MenuProduct): number { return (p.minStock / this.scale(p)) * 100; }
  tone(p: MenuProduct): string { return p.stock <= 0 ? 'danger' : p.stock < p.minStock ? 'warn' : 'ok'; }
  badge(s: StockState): string { return STOCK_BADGE[s]; }

  restock(): void {
    this.svc.requestRestock(this.attention);
    this.requested = true;
  }
}
