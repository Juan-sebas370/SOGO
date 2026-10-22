import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RestaurantService, unitLabelFor } from '../restaurant.service';
import { RestaurantOrder, SalePaymentMethod, PAYMENT_METHODS, ORDER_BADGE, orderTotals, sumTotals } from '../restaurant.model';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation } from '../../reservations/reservation.model';
import { BillingConfigService } from '../../billing/billing-config.service';
import { EMAIL_RE } from '../../billing/invoice.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dayMonth, dayTime, invoiceHtml, stamp } from '../restaurant-format';

type Destination = 'room' | 'invoice';

@Component({
  selector: 'app-room-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './accounts.css'],
  template: `
  <ng-container *ngIf="r; else notFound">
  <nav class="kit-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><a routerLink="/dashboard/restaurant/accounts">Cuentas</a><span>/</span><span>{{ unit }}</span>
  </nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Cerrar cuenta de consumos</h1>
      <p class="kit-sub">{{ r.guestName }} · {{ unit }} · {{ r.code }} · {{ dm(r.checkIn) }} → {{ dm(r.checkOut) }}/{{ r.checkOut.slice(0, 4) }}{{ r.checkOut <= today ? ' · check-out hoy' : '' }}</p>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="closed as c" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div *ngIf="c.dest === 'room'"><strong>Cuenta cerrada · {{ c.orders.length }} pedido{{ c.orders.length === 1 ? '' : 's' }} por {{ money(c.total) }}</strong>Los consumos quedaron en la cuenta de la habitación y se incluyen en la factura del check-out.</div>
    <div *ngIf="c.dest === 'invoice'"><strong>Factura {{ c.orders[0].invoice?.number }} generada · {{ money(c.total) }}</strong>Los consumos se cobraron aparte y salieron de la cuenta de la habitación.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="c.dest === 'invoice'" (click)="printInvoice(c.orders)">Ver factura</button>
  </div>

  <div class="kit-layout">
    <section class="kit-card">
      <div class="rch-head">
        <h2 class="kit-card-title">Consumos pendientes ({{ open.length }} pedido{{ open.length === 1 ? '' : 's' }})</h2>
        <span class="rsv-badge" [ngClass]="open.length ? 'rsv-badge--warn' : 'rsv-badge--muted'">{{ open.length ? 'Cuenta abierta' : 'Sin consumos pendientes' }}</span>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Producto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Subtotal</th></tr></thead>
          <tbody>
            <ng-container *ngFor="let o of open">
              <tr *ngFor="let i of o.items; let first = first">
                <td class="acc-order-cell"><span class="kit-code" *ngIf="first">{{ o.number }}</span></td>
                <td class="acc-order-cell"><span *ngIf="first">{{ dayTime(o.createdAt) }}</span></td>
                <td>{{ i.name }}</td>
                <td class="r">{{ i.quantity }}</td>
                <td class="r">{{ money(i.unitPrice) }}</td>
                <td class="r"><strong>{{ money(i.unitPrice * i.quantity) }}</strong></td>
              </tr>
              <tr class="acc-sub-row"><td colspan="5" class="r">Subtotal {{ o.number }}</td><td class="r"><strong>{{ money(sub(o)) }}</strong></td></tr>
            </ng-container>
            <tr *ngIf="!open.length"><td colspan="6" class="kit-empty">
              No hay consumos pendientes en esta cuenta.
              <a [routerLink]="['/dashboard/restaurant/room-charge']">Registrar un consumo</a>
            </td></tr>
          </tbody>
        </table>
      </div>

      <details class="acc-history" *ngIf="history.length">
        <summary>Pedidos cerrados de la estadía ({{ history.length }})</summary>
        <table class="kit-table">
          <tbody>
            <tr *ngFor="let o of history">
              <td class="kit-code">{{ o.number }}</td>
              <td>{{ dayTime(o.createdAt) }}</td>
              <td><span class="rsv-badge" [ngClass]="badge[o.status]">{{ o.status }}</span></td>
              <td class="kit-mono">{{ invoiceNumber(o) || '—' }}</td>
              <td class="r"><strong>{{ money(total(o)) }}</strong></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="isAdmin && reopenable.length" (click)="reopen()">
          Reabrir cuenta ({{ reopenable.length }} pedido{{ reopenable.length === 1 ? '' : 's' }})
        </button>
      </details>
    </section>

    <aside class="kit-aside">
      <section class="kit-card">
        <h2 class="kit-card-title">Total de la cuenta</h2>
        <div class="kit-sum"><span>Subtotal ({{ totals.units }} unidades)</span><strong>{{ money(totals.subtotal) }}</strong></div>
        <div class="kit-sum"><span>Descuentos</span><strong>{{ money(0) }}</strong></div>
        <div class="kit-sum"><span>INC {{ taxPct }}%</span><strong>{{ money(totals.tax) }}</strong></div>
        <div class="kit-sum kit-sum--total"><strong>Total a pagar</strong><strong>{{ money(totals.total) }}</strong></div>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">¿A dónde se envía?</h2>
        <label class="acc-dest" [class.active]="dest === 'room'">
          <input type="radio" name="dest" value="room" [(ngModel)]="dest">
          <span><strong>Cargar a la cuenta de la habitación</strong><small>Se incluye en la factura del alojamiento al hacer check-out</small></span>
        </label>
        <label class="acc-dest" [class.active]="dest === 'invoice'">
          <input type="radio" name="dest" value="invoice" [(ngModel)]="dest">
          <span><strong>Enviar a Facturación electrónica</strong><small>Genera una factura independiente del restaurante y se cobra ahora</small></span>
        </label>
        <ng-container *ngIf="dest === 'invoice'">
          <label class="kit-field">Medio de pago
            <select class="rsv-input" [(ngModel)]="method"><option *ngFor="let m of methods">{{ m }}</option></select>
          </label>
          <label class="kit-field">Correo (opcional)
            <input class="rsv-input" type="email" [(ngModel)]="email" [class.invalid]="emailInvalid">
            <span class="kit-error" *ngIf="emailInvalid">Correo no válido</span>
          </label>
        </ng-container>
      </section>

      <button type="button" class="rsv-btn rsv-btn--primary acc-big" [disabled]="!open.length || emailInvalid" (click)="confirming = true">Cerrar cuenta</button>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="confirming" (click)="confirming = false">
    <div class="rsv-modal acc-modal" role="dialog" aria-modal="true" aria-labelledby="close-title" (click)="$event.stopPropagation()">
      <div class="rsv-modal-icon"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
      <h2 class="rsv-modal-title" id="close-title">¿Cerrar la cuenta de la {{ unit }}?</h2>
      <p class="rsv-modal-desc">
        Se consolidarán {{ open.length }} pedido{{ open.length === 1 ? '' : 's' }} por <strong>{{ money(totals.total) }}</strong>
        {{ dest === 'room' ? 'y se cargarán a la cuenta de la habitación.' : 'en la factura electrónica ' + '(' + method + ').' }}
      </p>
      <ul>
        <li>Después del cierre no se podrán modificar los consumos.</li>
        <li>Solo un usuario autorizado puede reabrir la cuenta.</li>
        <li>Quedará registrado: {{ user }} · {{ stamp(now()) }}.</li>
      </ul>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirming = false">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="close()">Confirmar cierre</button>
      </div>
    </div>
  </div>
  </ng-container>

  <ng-template #notFound>
    <p class="kit-card kit-empty">No se encontró la estadía. <a routerLink="/dashboard/restaurant/accounts">Volver a cuentas</a></p>
  </ng-template>
  `,
  styles: [`.rch-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; } .acc-history { margin-top: 16px; } .acc-history .rsv-btn { margin-top: 10px; }`],
})
export class RoomAccountComponent {
  readonly money = fmtMoney;
  readonly dm = dayMonth;
  readonly dayTime = dayTime;
  readonly stamp = stamp;
  readonly now = isoDateTime;
  readonly methods = PAYMENT_METHODS;
  readonly badge = ORDER_BADGE;
  readonly today = isoDate(0);
  readonly user = localStorage.getItem('sogo_role') || 'Usuario';
  readonly isAdmin = this.user === 'Administrador';

  r?: Reservation;
  unit = '';
  open: RestaurantOrder[] = [];
  history: RestaurantOrder[] = [];
  dest: Destination = 'room';
  method: SalePaymentMethod = 'Efectivo';
  email = '';
  confirming = false;
  closed?: { dest: Destination; orders: RestaurantOrder[]; total: number };
  taxPct: number;

  constructor(private svc: RestaurantService, reservations: ReservationService, private config: BillingConfigService, route: ActivatedRoute) {
    this.taxPct = Math.round(svc.taxRate * 100);
    const id = route.snapshot.paramMap.get('id')!;
    this.r = reservations.getById(id);
    if (this.r) {
      this.unit = unitLabelFor(this.r);
      this.email = this.r.email;
    }
    svc.getOrders().subscribe(orders => {
      this.open = svc.openOrdersFor(id);
      this.history = orders.filter(o => o.reservationId === id && (o.status === 'Facturada' || o.status === 'Pagada'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.confirming = false; }

  get totals() { return sumTotals(this.open); }
  get emailInvalid(): boolean { return this.dest === 'invoice' && !!this.email.trim() && !EMAIL_RE.test(this.email.trim()); }
  get reopenable(): RestaurantOrder[] { return this.history.filter(o => o.status === 'Facturada' && !this.svc.invoiceNumber(o)); }

  sub(o: RestaurantOrder): number { return orderTotals(o).subtotal; }
  total(o: RestaurantOrder): number { return orderTotals(o).total; }
  invoiceNumber(o: RestaurantOrder): string { return this.svc.invoiceNumber(o); }

  close(): void {
    const r = this.r!;
    const ids = this.open.map(o => o.id);
    const total = this.totals.total;
    if (this.dest === 'room') {
      this.svc.closeToRoom(ids);
    } else {
      this.svc.invoiceOrders(ids, { clientName: r.guestName, clientDoc: r.docNumber, method: this.method, email: this.email });
    }
    this.closed = { dest: this.dest, orders: ids.map(id => this.svc.getOrder(id)!), total };
    this.confirming = false;
  }

  reopen(): void {
    this.svc.reopen(this.reopenable.map(o => o.id));
    this.closed = undefined;
  }

  printInvoice(orders: RestaurantOrder[]): void {
    openDocument(`Factura ${orders[0].invoice?.number}`, invoiceHtml(orders, this.config.get().issuer), false);
  }
}
