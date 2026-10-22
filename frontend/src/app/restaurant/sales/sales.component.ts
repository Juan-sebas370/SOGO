import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { RestaurantOrder, OrderStatus, SaleType, ORDER_BADGE, orderTotals, saleType, shortNumber, sumTotals } from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { BillingConfigService } from '../../billing/billing-config.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { dayMonth, invoiceHtml, stamp, ticketHtml } from '../restaurant-format';

type Tab = 'Todas' | OrderStatus;
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'Todas', label: 'Todas' }, { tab: 'Pendiente', label: 'Pendientes' }, { tab: 'Facturada', label: 'Facturadas' },
  { tab: 'Pagada', label: 'Pagadas' }, { tab: 'Anulada', label: 'Anuladas' },
];

@Component({
  selector: 'app-restaurant-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './sales.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Ventas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Consultar ventas</h1>
      <p class="kit-sub">Transacciones del restaurante y cafetería, actualizadas en tiempo real.</p>
    </div>
    <a routerLink="/dashboard/restaurant/reports" class="rsv-btn rsv-btn--outline">
      <svg viewBox="0 0 24 24"><path d="M6 18V8m6 10V4m6 14v-7"/></svg>Generar reporte
    </a>
  </header>

  <section class="kit-kpis">
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--blue"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
      <div><span>Ventas de hoy</span><strong>{{ kpi.count }}</strong><small>Pedidos del {{ dm(today) }}</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
      <div><span>Ingresos de hoy</span><strong>{{ money(kpi.income) }}</strong><small>Incluye INC</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 21v-6h6v6"/></svg></span>
      <div><span>Cargos a habitación</span><strong>{{ money(kpi.roomAmount) }}</strong><small>Pendientes de hoy · {{ kpi.roomCount }} pedido{{ kpi.roomCount === 1 ? '' : 's' }}</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--purple"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span>
      <div><span>Anuladas ({{ monthName }})</span><strong>{{ kpi.annulled }}</strong><small>{{ kpi.lastAnnulled || 'Ninguna este mes' }}</small></div></div>
  </section>

  <div class="kit-layout sal-layout">
    <section class="kit-card sal-list">
      <div class="sal-tabs" role="tablist">
        <button type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t.tab" [class.active]="tab === t.tab" (click)="setTab(t.tab)">
          {{ t.label }} <span>{{ counts[t.tab] }}</span>
        </button>
      </div>
      <div class="sal-filters">
        <div class="kit-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="N.º de factura, pedido, cliente o habitación..." aria-label="Buscar venta">
        </div>
        <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="apply()"></label>
        <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" [min]="from" (ngModelChange)="apply()"></label>
        <label class="kit-select"><span>Tipo</span>
          <select [(ngModel)]="type" (ngModelChange)="apply()"><option value="">Todos</option><option>Venta directa</option><option>Cargo a habitación</option></select>
        </label>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente / huésped</th><th>Tipo</th><th>Factura</th><th class="r">Total</th><th>Estado</th></tr></thead>
          <tbody>
            <tr *ngFor="let o of filtered" class="clickable" [class.selected]="selected?.id === o.id" (click)="selected = o" tabindex="0" (keydown.enter)="selected = o">
              <td><span class="kit-code">{{ o.number }}</span></td>
              <td class="sal-date">{{ dm(o.createdAt) }}<small>{{ o.createdAt.slice(11, 16) }}</small></td>
              <td><strong>{{ o.clientName }}</strong><small class="sal-sub">{{ o.table || o.unitLabel }}</small></td>
              <td><span class="sal-type" [class.room]="o.reservationId">{{ type_(o) }}</span></td>
              <td class="kit-mono">{{ invoiceNumber(o) || '—' }}</td>
              <td class="r"><strong>{{ money(total(o)) }}</strong></td>
              <td><span class="rsv-badge" [ngClass]="badge[o.status]">{{ o.status }}</span></td>
            </tr>
            <tr *ngIf="!filtered.length"><td colspan="7" class="kit-empty">No hay ventas con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="sal-foot kit-muted" *ngIf="filtered.length">{{ filtered.length }} venta{{ filtered.length === 1 ? '' : 's' }} · {{ money(filteredTotal) }}</p>
    </section>

    <aside class="kit-aside">
      <section class="kit-card sal-detail" *ngIf="selected as o; else pick">
        <div class="sal-detail-head">
          <div><span>Detalle de la venta</span><strong>{{ o.number }}</strong></div>
          <span class="rsv-badge" [ngClass]="badge[o.status]">{{ o.status }}</span>
        </div>
        <dl class="sal-facts">
          <div><dt>Cliente</dt><dd>{{ o.clientName }}{{ o.clientDoc && o.clientDoc !== '222222222222' ? ' · CC ' + o.clientDoc : '' }}</dd></div>
          <div><dt>Origen</dt><dd>{{ o.table || o.unitLabel }} · {{ type_(o).toLowerCase() }}</dd></div>
          <div *ngIf="o.reservationCode"><dt>Reserva</dt><dd>{{ o.reservationCode }}</dd></div>
          <div><dt>Factura</dt><dd>{{ invoiceNumber(o) || '—' }}</dd></div>
          <div><dt>Fecha</dt><dd>{{ stamp(o.createdAt) }}</dd></div>
          <div *ngIf="o.invoice"><dt>Pago</dt><dd>{{ o.invoice.method }}</dd></div>
          <div *ngIf="o.annulment"><dt>Anulación</dt><dd>{{ o.annulment.reason }}</dd></div>
        </dl>
        <div class="sal-item" *ngFor="let i of o.items">
          <app-product-icon [category]="i.category" size="sm"></app-product-icon>
          <div><strong>{{ i.name }}</strong><small>{{ i.quantity }} × {{ money(i.unitPrice) }}</small></div>
          <strong>{{ money(i.quantity * i.unitPrice) }}</strong>
        </div>
        <hr class="kit-divider">
        <div class="kit-sum"><span>Subtotal</span><strong>{{ money(t(o).subtotal) }}</strong></div>
        <div class="kit-sum"><span>INC {{ pct(o) }}%</span><strong>{{ money(t(o).tax) }}</strong></div>
        <div class="kit-sum kit-sum--total"><strong>Total</strong><strong>{{ money(t(o).total) }}</strong></div>
        <div class="sal-buttons">
          <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="o.invoice" (click)="viewInvoice(o)">Ver factura</button>
          <a class="rsv-btn rsv-btn--primary" *ngIf="o.status === 'Pendiente'"
             [routerLink]="o.reservationId ? ['/dashboard/restaurant/accounts/room', o.reservationId] : ['/dashboard/restaurant/accounts/order', o.id]">
            {{ o.reservationId ? 'Ver cuenta' : 'Cobrar' }}
          </a>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="printTicket(o)">Imprimir comanda</button>
          <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="o.status === 'Pendiente'" (click)="annulTarget = o; annulReason = ''">Anular</button>
        </div>
      </section>
      <ng-template #pick><section class="kit-card kit-empty">Selecciona una venta para ver su detalle.</section></ng-template>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="annulTarget as o" (click)="annulTarget = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="annul-title" (click)="$event.stopPropagation()">
      <div class="rsv-modal-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></div>
      <h2 class="rsv-modal-title" id="annul-title">¿Anular el pedido {{ o.number }}?</h2>
      <p class="rsv-modal-desc">Las existencias vuelven al inventario{{ o.reservationId ? ' y el cargo sale de la cuenta de la habitación' : '' }}. Queda registrado en auditoría.</p>
      <label class="kit-field">Motivo de la anulación
        <textarea class="rsv-input" rows="2" [(ngModel)]="annulReason" placeholder="Ej.: el cliente se retiró antes de servir"></textarea>
      </label>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="annulTarget = undefined">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="annulReason.trim().length < 5" (click)="annul()">Anular pedido</button>
      </div>
    </div>
  </div>
  `,
})
export class SalesComponent {
  readonly tabs = TABS;
  readonly money = fmtMoney;
  readonly dm = dayMonth;
  readonly stamp = stamp;
  readonly badge = ORDER_BADGE;
  readonly type_ = saleType;
  readonly t = orderTotals;
  readonly today = isoDate(0);
  readonly monthName = new Date().toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');

  orders: RestaurantOrder[] = [];
  filtered: RestaurantOrder[] = [];
  filteredTotal = 0;
  counts = {} as Record<Tab, number>;
  tab: Tab = 'Todas';
  search = '';
  from = isoDate(-6);
  to = isoDate(0);
  type: SaleType | '' = '';
  selected?: RestaurantOrder;
  annulTarget?: RestaurantOrder;
  annulReason = '';
  kpi = { count: 0, income: 0, roomAmount: 0, roomCount: 0, annulled: 0, lastAnnulled: '' };

  constructor(private svc: RestaurantService, private config: BillingConfigService) {
    svc.getOrders().subscribe(list => {
      this.orders = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.selected = list.find(o => o.id === this.selected?.id);
      this.computeKpis();
      this.apply();
      this.selected ??= this.filtered[0];
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.annulTarget = undefined; }

  setTab(t: Tab): void {
    this.tab = t;
    this.apply();
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    const base = this.orders.filter(o => {
      const day = o.createdAt.slice(0, 10);
      return (!this.from || day >= this.from) && (!this.to || day <= this.to)
        && (!this.type || saleType(o) === this.type)
        && (!q || [o.number, this.invoiceNumber(o), o.clientName, o.table, o.unitLabel ?? '', o.reservationCode ?? ''].some(v => v.toLowerCase().includes(q)));
    });
    this.tabs.forEach(({ tab }) => this.counts[tab] = base.filter(o => tab === 'Todas' || o.status === tab).length);
    this.filtered = base.filter(o => this.tab === 'Todas' || o.status === this.tab);
    this.filteredTotal = sumTotals(this.filtered.filter(o => o.status !== 'Anulada')).total;
  }

  private computeKpis(): void {
    const valid = this.orders.filter(o => o.status !== 'Anulada');
    const todays = valid.filter(o => o.createdAt.startsWith(this.today));
    const rooms = todays.filter(o => o.reservationId && o.status === 'Pendiente');
    const annulled = this.orders.filter(o => o.status === 'Anulada' && o.createdAt.slice(0, 7) === this.today.slice(0, 7));
    this.kpi = {
      count: todays.length, income: sumTotals(todays).total,
      roomAmount: sumTotals(rooms).total, roomCount: rooms.length,
      annulled: annulled.length, lastAnnulled: annulled[0] ? shortNumber(annulled[0].number) : '',
    };
  }

  total(o: RestaurantOrder): number { return orderTotals(o).total; }
  pct(o: RestaurantOrder): number { return Math.round(o.taxRate * 100); }
  invoiceNumber(o: RestaurantOrder): string { return this.svc.invoiceNumber(o); }

  annul(): void {
    if (!this.annulTarget) return;
    this.svc.annulOrder(this.annulTarget.id, this.annulReason.trim());
    this.annulTarget = undefined;
  }

  viewInvoice(o: RestaurantOrder): void {
    const orders = o.invoice!.orderIds.map(id => this.svc.getOrder(id)!).filter(Boolean);
    openDocument(`Factura ${o.invoice!.number}`, invoiceHtml(orders, this.config.get().issuer), false);
  }

  printTicket(o: RestaurantOrder): void {
    openDocument(`Comanda ${o.number}`, ticketHtml(o), true);
  }
}
