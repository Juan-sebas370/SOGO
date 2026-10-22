import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { RestaurantService, unitLabelFor } from '../restaurant.service';
import { MenuProduct, RestaurantOrder, canSell, itemsTotals } from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, isInHouse, awaitsCheckIn, paidAmount } from '../../reservations/reservation.model';
import { ROOMS, FLOORS } from '../../lodging/house';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dayMonth, stamp } from '../restaurant-format';

interface Unit {
  key: string;
  title: string;
  stay?: Reservation;            // estadía activa (check-in hecho, sin check-out)
  note: string;                  // huésped o "Sin estadía activa"
  badge: string;
  tone: 'warn' | 'ok' | 'info' | 'muted';
}

@Component({
  selector: 'app-room-charge',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './room-charge.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Consumo a habitación</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar consumo a habitación</h1>
      <p class="kit-sub">El consumo se suma a la cuenta del huésped y se incluye en la factura del check-out.</p>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="done as o" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>{{ o.number }} cargado a {{ o.unitLabel }} · {{ money(total(o)) }}</strong>Quedó en la cuenta de {{ o.clientName }} y se descontó del inventario.</div>
    <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/restaurant/accounts/room', o.reservationId]">Ver cuenta</a>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div>{{ error }}</div>
  </div>

  <div class="kit-layout rch-layout">
    <div class="kit-stack">
      <!-- 1. Unidad -->
      <section class="kit-card">
        <div class="rch-step-head">
          <div>
            <h2 class="kit-card-title">1. Habitación o huésped</h2>
            <p class="kit-card-sub">Solo se pueden seleccionar unidades con estadía activa</p>
          </div>
          <div class="kit-search rch-search">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" [(ngModel)]="search" placeholder="Buscar huésped o habitación..." aria-label="Buscar huésped o habitación">
          </div>
        </div>
        <div class="rch-units" role="radiogroup" aria-label="Unidad">
          <button type="button" *ngFor="let u of visibleUnits" class="rch-unit" role="radio"
                  [attr.aria-checked]="selected?.key === u.key" [class.active]="selected?.key === u.key" [disabled]="!u.stay" (click)="select(u)">
            <strong>{{ u.title }}</strong>
            <span>{{ u.note }}</span>
            <em class="rsv-badge" [ngClass]="'rsv-badge--' + u.tone">{{ u.badge }}</em>
            <svg *ngIf="selected?.key === u.key" class="rch-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
          </button>
        </div>
        <div class="kit-banner kit-banner--ok rch-verified" *ngIf="stay as r">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
          <div><b>Estadía activa verificada.</b> {{ unit(r) }} · {{ r.guestName }} · {{ r.code }} · {{ dm(r.checkIn) }} → {{ dm(r.checkOut) }}{{ r.checkOut <= today ? ' (check-out hoy)' : '' }}</div>
        </div>
      </section>

      <!-- 2. Productos -->
      <section class="kit-card">
        <div class="rch-step-head">
          <h2 class="kit-card-title">2. Productos consumidos</h2>
          <div class="rch-picker-wrap">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="pickerOpen = !pickerOpen" [attr.aria-expanded]="pickerOpen">+ Agregar del menú</button>
            <div class="rch-picker" *ngIf="pickerOpen">
              <input class="rsv-input" type="search" [(ngModel)]="pickerSearch" placeholder="Buscar producto..." aria-label="Buscar producto del menú">
              <ul>
                <li *ngFor="let p of pickerList">
                  <button type="button" (click)="add(p)">
                    <app-product-icon [category]="p.category" size="sm"></app-product-icon>
                    <span>{{ p.name }}<small>{{ p.category }} · {{ p.stock }} disp.</small></span>
                    <strong>{{ money(p.price) }}</strong>
                  </button>
                </li>
                <li class="kit-muted rch-picker-empty" *ngIf="!pickerList.length">Sin productos disponibles.</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>Producto</th><th>Categoría</th><th class="r">Precio</th><th>Cantidad</th><th class="r">Subtotal</th><th><span class="sr-only">Quitar</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let l of lines">
                <td><div class="kit-prod"><app-product-icon [category]="l.p.category" size="sm"></app-product-icon><strong>{{ l.p.name }}</strong></div></td>
                <td>{{ l.p.category }}</td>
                <td class="r">{{ money(l.p.price) }}</td>
                <td>
                  <div class="kit-qty">
                    <button type="button" (click)="setQty(l.p, l.q - 1)" aria-label="Quitar uno">−</button>
                    <span>{{ l.q }}</span>
                    <button type="button" (click)="setQty(l.p, l.q + 1)" [disabled]="l.q >= l.p.stock" aria-label="Agregar uno">+</button>
                  </div>
                </td>
                <td class="r"><strong>{{ money(l.p.price * l.q) }}</strong></td>
                <td><button type="button" class="rch-remove" (click)="setQty(l.p, 0)" [attr.aria-label]="'Quitar ' + l.p.name">×</button></td>
              </tr>
              <tr *ngIf="!lines.length"><td colspan="6" class="kit-empty">Agrega los productos que consumió el huésped.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="rch-totals">
          <div class="kit-sum"><span>Subtotal</span><strong>{{ money(totals.subtotal) }}</strong></div>
          <div class="kit-sum"><span>INC {{ taxPct }}%</span><strong>{{ money(totals.tax) }}</strong></div>
          <div class="kit-sum kit-sum--total"><strong>Total del consumo</strong><strong>{{ money(totals.total) }}</strong></div>
        </div>
      </section>
    </div>

    <!-- Cuenta del huésped -->
    <aside class="kit-aside">
      <section class="kit-card" *ngIf="stay as r; else noStay">
        <div class="rch-guest">
          <span class="rch-avatar">{{ initials(r.guestName) }}</span>
          <div><strong>{{ r.guestName }}</strong><small>CC {{ r.docNumber }} · {{ unit(r) }}</small></div>
        </div>
        <hr class="kit-divider">
        <h3 class="rch-acc-title">Cuenta del huésped</h3>
        <div class="kit-sum"><span>Alojamiento ({{ r.nights }} noche{{ r.nights === 1 ? '' : 's' }})</span><strong>{{ money(r.lodgingAmount) }}</strong></div>
        <div class="kit-sum"><span>Consumos anteriores</span><strong>{{ money(r.extrasAmount) }}</strong></div>
        <div class="kit-sum rch-this"><span>+ Este consumo</span><strong>{{ money(totals.subtotal) }}</strong></div>
        <div class="kit-sum"><span>Pagos / anticipos</span><strong>− {{ money(paid(r)) }}</strong></div>
        <div class="rch-balance"><span>Nuevo saldo pendiente</span><strong>{{ money(newBalance(r)) }}</strong></div>
        <p class="rch-note">Valores antes de impuestos: el INC {{ taxPct }}% de este consumo ({{ money(totals.tax) }}) se liquida en la factura del check-out.</p>
      </section>
      <ng-template #noStay>
        <section class="kit-card kit-empty">Selecciona una habitación con estadía activa para ver la cuenta del huésped.</section>
      </ng-template>

      <section class="kit-card rch-checks">
        <p><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>Se descuenta del inventario: {{ lines.length }} producto{{ lines.length === 1 ? '' : 's' }}</p>
        <p><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>Queda disponible para facturación y check-out</p>
        <p><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>Auditoría: {{ user }} · {{ stamp(now) }}</p>
      </section>

      <button type="button" class="rsv-btn rsv-btn--primary rch-submit" [disabled]="!stay || !lines.length" (click)="submit()">
        Cargar {{ money(totals.total) }}{{ stay ? ' a la ' + unit(stay) : '' }}
      </button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="cancel()">Cancelar</button>
    </aside>
  </div>
  `,
})
export class RoomChargeComponent {
  readonly money = fmtMoney;
  readonly unit = unitLabelFor;
  readonly dm = dayMonth;
  readonly stamp = stamp;
  readonly paid = paidAmount;
  readonly today = isoDate(0);
  readonly user = localStorage.getItem('sogo_role') || 'Usuario';

  units: Unit[] = [];
  products: MenuProduct[] = [];
  selected?: Unit;
  search = '';
  pickerOpen = false;
  pickerSearch = '';
  items: Record<string, number> = {};
  done?: RestaurantOrder;
  error = '';
  now = isoDateTime();
  taxPct: number;

  constructor(private svc: RestaurantService, reservations: ReservationService, route: ActivatedRoute) {
    this.taxPct = Math.round(svc.taxRate * 100);
    combineLatest([reservations.getAll(), svc.getProducts()]).subscribe(([list, products]) => {
      this.products = products;
      this.units = this.buildUnits(list);
      const key = this.selected?.key ?? route.snapshot.queryParamMap.get('unidad');
      this.selected = this.units.find(u => u.key === key && u.stay);
    });
  }

  get stay(): Reservation | undefined { return this.selected?.stay; }

  get visibleUnits(): Unit[] {
    const q = this.search.trim().toLowerCase();
    return q ? this.units.filter(u => `${u.title} ${u.note}`.toLowerCase().includes(q)) : this.units;
  }

  get lines(): { p: MenuProduct; q: number }[] {
    return Object.entries(this.items).map(([id, q]) => ({ p: this.products.find(p => p.id === id)!, q })).filter(l => l.p);
  }

  get totals() {
    return itemsTotals(this.lines.map(l => ({ unitPrice: l.p.price, quantity: l.q })), this.svc.taxRate);
  }

  get pickerList(): MenuProduct[] {
    const q = this.pickerSearch.trim().toLowerCase();
    return this.products.filter(p => canSell(p) && (!q || `${p.name} ${p.category}`.toLowerCase().includes(q)));
  }

  private buildUnits(list: Reservation[]): Unit[] {
    const active = list.filter(isInHouse);
    const upcoming = list.filter(r => awaitsCheckIn(r) && r.checkIn >= this.today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const make = (key: string, title: string, match: (r: Reservation) => boolean, idle = 'Libre'): Unit => {
      const stay = active.find(match);
      if (stay) {
        const leaving = stay.checkOut <= this.today;
        return { key, title, stay, note: stay.guestName, badge: leaving ? 'Check-out hoy' : 'En hospedaje', tone: leaving ? 'warn' : 'ok' };
      }
      const next = upcoming.find(match);
      if (next) return { key, title, note: next.checkIn === this.today ? 'Llega hoy' : `Llega ${dayMonth(next.checkIn)}`, badge: 'Reservada', tone: 'info' };
      return { key, title, note: 'Sin estadía activa', badge: idle, tone: 'muted' };
    };
    return [
      ...ROOMS.map(room => make(room.number, `Hab. ${room.number}`, r => r.nights > 0 && r.rooms.includes(room.number))),
      ...FLOORS.map(f => make(`piso-${f}`, `Piso ${f}`, r => r.lodgingType === 'Piso' && r.floor === f)),
      make('casa', 'Casa completa', r => r.lodgingType === 'Casa completa' && r.nights > 0),
      make('pasadia', 'Pasadía', r => r.nights === 0, 'No aplica'),
    ];
  }

  select(u: Unit): void {
    if (!u.stay) return;
    this.selected = u;
    this.done = undefined;
  }

  add(p: MenuProduct): void {
    this.setQty(p, (this.items[p.id] ?? 0) + 1);
    this.pickerOpen = false;
    this.pickerSearch = '';
  }

  setQty(p: MenuProduct, q: number): void {
    const next = { ...this.items };
    if (q > 0) next[p.id] = Math.min(q, p.stock); else delete next[p.id];
    this.items = next;
  }

  newBalance(r: Reservation): number {
    return r.lodgingAmount + r.extrasAmount + this.totals.subtotal - paidAmount(r);
  }

  submit(): void {
    const r = this.stay;
    if (!r) return;
    this.error = '';
    try {
      this.done = this.svc.createOrder({
        target: 'Habitación', table: '', clientName: '', clientDoc: '', reservation: r,
        items: this.lines.map(l => ({ productId: l.p.id, quantity: l.q })), observations: '',
      });
      this.items = {};
      this.now = isoDateTime();
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  cancel(): void {
    this.items = {};
    this.selected = undefined;
    this.error = '';
  }

  total(o: RestaurantOrder): number {
    return itemsTotals(o.items, o.taxRate).total;
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
