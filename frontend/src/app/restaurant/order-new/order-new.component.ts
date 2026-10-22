import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { RestaurantService, unitLabelFor } from '../restaurant.service';
import {
  MenuProduct, MenuCategory, MENU_CATEGORIES, OrderTarget, RestaurantOrder, TABLES, canSell, itemsTotals, stockState,
} from '../restaurant.model';
import { Reservation } from '../../reservations/reservation.model';
import { ProductIconComponent } from '../product-icon.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { stamp, ticketHtml } from '../restaurant-format';
import { isoDateTime } from '../../shared/date-utils';

interface Line { product: MenuProduct; quantity: number; }

@Component({
  selector: 'app-order-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './order-new.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Nuevo pedido</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar pedido</h1>
      <p class="kit-sub">Selecciona productos del menú y asócialos a un huésped, a una habitación o a una venta directa.</p>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="registered as o" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div>
      <strong>Pedido {{ o.number }} registrado exitosamente</strong>
      Estado: Pendiente hasta que sea {{ o.reservationId ? 'cobrado con la cuenta de la habitación' : 'cobrado' }}. Inventario descontado: {{ o.items.length }} producto{{ o.items.length === 1 ? '' : 's' }}.
    </div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="printTicket(o)">Ver comanda</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div>{{ error }}</div>
  </div>

  <div class="kit-layout ord-layout">
    <!-- Productos -->
    <section class="kit-card">
      <div class="ord-list-head">
        <h2 class="kit-card-title">Productos del menú</h2>
        <span class="kit-muted">Solo se pueden agregar productos disponibles</span>
      </div>
      <div class="kit-search ord-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" placeholder="Buscar producto..." aria-label="Buscar producto">
      </div>
      <div class="kit-chips ord-chips" role="group" aria-label="Categoría">
        <button type="button" class="kit-chip" [class.active]="!category" (click)="category = null">Todos</button>
        <button type="button" class="kit-chip" *ngFor="let c of categories" [class.active]="category === c" (click)="category = c">{{ c }}</button>
      </div>
      <div class="ord-products">
        <div *ngFor="let p of visible" class="ord-product" [class.in]="qty(p)" [class.off]="!sellable(p)">
          <app-product-icon [category]="p.category"></app-product-icon>
          <div class="ord-product-info">
            <strong>{{ p.name }}</strong>
            <span>{{ money(p.price) }} <em class="rsv-badge" [ngClass]="sellable(p) ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ sellable(p) ? 'Disponible' : state(p) }}</em></span>
          </div>
          <span class="ord-in" *ngIf="qty(p) && !registered">× {{ qty(p) }}</span>
          <button type="button" class="ord-plus" *ngIf="sellable(p)" [disabled]="!!registered || qty(p) >= p.stock"
                  (click)="add(p)" [attr.aria-label]="'Agregar ' + p.name">+</button>
          <span class="ord-off" *ngIf="!sellable(p)">{{ state(p) }}</span>
        </div>
        <p class="kit-empty" *ngIf="!visible.length">Sin productos para esta búsqueda.</p>
      </div>
    </section>

    <!-- Pedido -->
    <aside class="kit-aside">
      <section class="kit-card">
        <div class="ord-num">
          <div><span>Pedido</span><strong>{{ registered?.number ?? nextNumber }}</strong></div>
          <span class="rsv-badge rsv-badge--warn">Pendiente</span>
        </div>

        <fieldset class="ord-target" [disabled]="!!registered">
          <legend>Asociar pedido a</legend>
          <div class="ord-seg" role="radiogroup">
            <button type="button" *ngFor="let t of targets" role="radio" [attr.aria-checked]="target === t" [class.active]="target === t" (click)="setTarget(t)">{{ t }}</button>
          </div>

          <div class="kit-row2" *ngIf="target === 'Venta directa'">
            <label class="kit-field">Mesa
              <select class="rsv-input" [(ngModel)]="table"><option *ngFor="let t of tables">{{ t }}</option></select>
            </label>
            <label class="kit-field">Cliente
              <input class="rsv-input" [(ngModel)]="clientName" placeholder="Consumidor final">
            </label>
          </div>

          <ng-container *ngIf="target !== 'Venta directa'">
            <label class="kit-field">{{ target === 'Huésped' ? 'Huésped alojado' : 'Habitación con estadía activa' }}
              <select class="rsv-input" [(ngModel)]="reservationId">
                <option value="">Selecciona…</option>
                <option *ngFor="let r of stays" [value]="r.id">{{ target === 'Huésped' ? r.guestName + ' · ' + unit(r) : unit(r) + ' · ' + r.guestName }}</option>
              </select>
            </label>
            <p class="kit-muted ord-hint" *ngIf="!stays.length">No hay estadías activas: solo se puede registrar como venta directa.</p>
          </ng-container>
        </fieldset>

        <hr class="kit-divider">
        <p class="kit-muted" *ngIf="!lines.length">Agrega productos desde la lista.</p>
        <div class="ord-line" *ngFor="let l of lines; trackBy: byProduct">
          <div><strong>{{ l.product.name }}</strong><small>{{ money(l.product.price) }} c/u</small></div>
          <div class="kit-qty" *ngIf="!registered">
            <button type="button" (click)="setQty(l, l.quantity - 1)" aria-label="Quitar uno">−</button>
            <span>{{ l.quantity }}</span>
            <button type="button" (click)="setQty(l, l.quantity + 1)" [disabled]="l.quantity >= l.product.stock" aria-label="Agregar uno">+</button>
          </div>
          <span class="ord-x" *ngIf="registered">× {{ l.quantity }}</span>
          <strong class="ord-line-total">{{ money(l.product.price * l.quantity) }}</strong>
        </div>

        <label class="kit-field ord-obs">Observaciones
          <textarea class="rsv-input" rows="2" [(ngModel)]="observations" [disabled]="!!registered" placeholder="Ej.: huevos bien cocidos · sin azúcar"></textarea>
        </label>

        <hr class="kit-divider">
        <div class="kit-sum"><span>Subtotal</span><strong>{{ money(totals.subtotal) }}</strong></div>
        <div class="kit-sum"><span>INC {{ taxPct }}%</span><strong>{{ money(totals.tax) }}</strong></div>
        <div class="kit-sum kit-sum--total"><strong>Total</strong><strong>{{ money(totals.total) }}</strong></div>

        <div class="ord-buttons">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">{{ registered ? 'Nuevo pedido' : 'Limpiar' }}</button>
          <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="!registered" [disabled]="!canRegister" (click)="register()">Registrar pedido</button>
          <a class="rsv-btn rsv-btn--primary" *ngIf="registered as o"
             [routerLink]="o.reservationId ? ['/dashboard/restaurant/accounts/room', o.reservationId] : ['/dashboard/restaurant/accounts/order', o.id]">
            {{ o.reservationId ? 'Ver cuenta' : 'Ir a cobrar' }}
          </a>
        </div>
      </section>
      <section class="kit-card ord-meta">
        <div class="kit-sum"><span>Registrado por</span><strong>{{ registered?.createdBy ?? user }}</strong></div>
        <div class="kit-sum"><span>Fecha y hora</span><strong>{{ stamp(registered?.createdAt ?? now) }}</strong></div>
      </section>
    </aside>
  </div>
  `,
})
export class OrderNewComponent {
  readonly categories = MENU_CATEGORIES;
  readonly targets: OrderTarget[] = ['Huésped', 'Habitación', 'Venta directa'];
  readonly tables = TABLES;
  readonly money = fmtMoney;
  readonly stamp = stamp;
  readonly unit = unitLabelFor;
  readonly sellable = canSell;
  readonly state = stockState;
  readonly user = localStorage.getItem('sogo_role') || 'Usuario';

  products: MenuProduct[] = [];
  draft: Record<string, number> = {};
  stays: Reservation[] = [];
  search = '';
  category: MenuCategory | null = null;

  target: OrderTarget = 'Venta directa';
  table = 'Mesa 1';
  clientName = 'Consumidor final';
  reservationId = '';
  observations = '';
  registered?: RestaurantOrder;
  error = '';
  now = isoDateTime();
  taxPct: number;

  constructor(private svc: RestaurantService) {
    this.taxPct = Math.round(svc.taxRate * 100);
    this.stays = svc.activeStays();
    combineLatest([svc.getProducts(), svc.getDraft()]).subscribe(([products, draft]) => {
      this.products = products;
      this.draft = draft;
    });
  }

  get nextNumber(): string { return this.svc.nextOrderNumber(); }

  get visible(): MenuProduct[] {
    const q = this.search.trim().toLowerCase();
    return this.products.filter(p => (!this.category || p.category === this.category) && (!q || p.name.toLowerCase().includes(q)));
  }

  get lines(): Line[] {
    const source = this.registered
      ? this.registered.items.map(i => ({ id: i.productId, q: i.quantity, price: i.unitPrice }))
      : Object.entries(this.draft).map(([id, q]) => ({ id, q, price: undefined as number | undefined }));
    return source.map(s => {
      const p = this.products.find(x => x.id === s.id)!;
      // Un pedido registrado muestra el precio con el que se vendió
      return { product: s.price === undefined ? p : { ...p, price: s.price }, quantity: s.q };
    }).filter(l => l.product);
  }

  get totals() {
    return itemsTotals(this.lines.map(l => ({ unitPrice: l.product.price, quantity: l.quantity })), this.registered?.taxRate ?? this.svc.taxRate);
  }

  get canRegister(): boolean {
    return this.lines.length > 0 && (this.target === 'Venta directa' || !!this.reservationId);
  }

  qty(p: MenuProduct): number {
    return this.registered ? 0 : this.draft[p.id] ?? 0;
  }

  add(p: MenuProduct): void { this.svc.addToDraft(p.id); }

  byProduct(_: number, l: Line): string { return l.product.id; }

  setQty(l: Line, q: number): void {
    this.svc.setDraftQty(l.product.id, Math.min(q, l.product.stock));
  }

  setTarget(t: OrderTarget): void {
    this.target = t;
    this.stays = this.svc.activeStays();
  }

  register(): void {
    this.error = '';
    try {
      this.registered = this.svc.createOrder({
        target: this.target, table: this.table, clientName: this.clientName, clientDoc: '',
        reservation: this.target === 'Venta directa' ? undefined : this.stays.find(r => r.id === this.reservationId),
        items: this.lines.map(l => ({ productId: l.product.id, quantity: l.quantity })),
        observations: this.observations,
      });
      this.svc.clearDraft();
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  reset(): void {
    if (!this.registered) this.svc.clearDraft();
    this.registered = undefined;
    this.observations = '';
    this.reservationId = '';
    this.clientName = 'Consumidor final';
    this.error = '';
    this.now = isoDateTime();
  }

  printTicket(o: RestaurantOrder): void {
    openDocument(`Comanda ${o.number}`, ticketHtml(o), true);
  }
}
