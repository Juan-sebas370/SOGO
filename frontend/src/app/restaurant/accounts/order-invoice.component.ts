import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { RestaurantOrder, SalePaymentMethod, PAYMENT_METHODS, orderTotals } from '../restaurant.model';
import { BillingConfigService } from '../../billing/billing-config.service';
import { EMAIL_RE } from '../../billing/invoice.model';
import { amountInWords } from '../../billing/number-words';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { invoiceHtml, stamp } from '../restaurant-format';

@Component({
  selector: 'app-order-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './accounts.css'],
  template: `
  <ng-container *ngIf="o; else notFound">
  <nav class="kit-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><a routerLink="/dashboard/restaurant/accounts">Cuentas</a><span>/</span><span>{{ o.table || o.unitLabel }}</span>
  </nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Factura del restaurante</h1>
      <p class="kit-sub">Pedido {{ o.number }} · {{ o.table || o.unitLabel }} · {{ o.reservationId ? 'cargo a habitación' : 'venta directa' }} · {{ o.clientName }}</p>
    </div>
    <span class="inv-state">Cuenta: {{ o.invoice ? 'Facturada' : o.status === 'Anulada' ? 'Anulada' : 'Por cobrar' }}</span>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="o.invoice as inv" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Factura {{ inv.number }} generada · la cuenta quedó en estado Facturada</strong>
      Pago registrado ({{ inv.method }}). Registro: {{ o.closedBy }} · {{ stamp(inv.at) }}{{ inv.sentTo ? ' · enviada a ' + inv.sentTo : '' }}.</div>
  </div>
  <div class="kit-banner kit-banner--warn" *ngIf="o.status === 'Anulada'" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div>Este pedido fue anulado: {{ o.annulment?.reason }}</div>
  </div>
  <div class="kit-banner kit-banner--info" *ngIf="o.reservationId && !o.invoice" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <div>Este pedido está cargado a la estadía. Se cobra al cerrar la cuenta de la habitación.</div>
    <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/restaurant/accounts/room', o.reservationId]">Ir a la cuenta</a>
  </div>

  <div class="inv-layout">
    <div class="inv-left">
      <section class="kit-card">
        <h2 class="kit-card-title">¿Cómo se cobra este consumo?</h2>
        <label class="acc-dest active">
          <input type="radio" checked [disabled]="!!o.invoice">
          <span><strong>Factura independiente del restaurante</strong><small>Se emite y se cobra ahora</small></span>
        </label>
        <label class="acc-dest disabled">
          <input type="radio" disabled>
          <span><strong>Cargar a la cuenta de la habitación</strong><small>No disponible: el cliente no está alojado. Usa Consumo a habitación para huéspedes.</small></span>
        </label>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Cliente</h2>
        <fieldset class="inv-fields" [disabled]="!editable">
          <label class="kit-field">Nombre <input class="rsv-input" [(ngModel)]="clientName"></label>
          <div class="kit-row2">
            <label class="kit-field">Documento <input class="rsv-input" [(ngModel)]="clientDoc" inputmode="numeric"></label>
            <label class="kit-field">Medio de pago
              <select class="rsv-input" [(ngModel)]="method"><option *ngFor="let m of methods">{{ m }}</option></select>
            </label>
          </div>
        </fieldset>
        <label class="kit-field">Correo (opcional)
          <input class="rsv-input" type="email" [(ngModel)]="email" placeholder="Para enviar la factura" [class.invalid]="emailInvalid">
          <span class="kit-error" *ngIf="emailInvalid">Correo no válido</span>
        </label>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Acciones</h2>
        <div class="inv-actions">
          <button type="button" [disabled]="!o.invoice" (click)="open(false)">
            <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir
          </button>
          <button type="button" [disabled]="!o.invoice" (click)="open(true)">
            <svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Descargar
          </button>
          <button type="button" [disabled]="!o.invoice || !email.trim() || emailInvalid" (click)="send()">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Enviar
          </button>
        </div>
        <p class="kit-muted inv-sent" *ngIf="sentMsg">{{ sentMsg }}</p>
        <button type="button" *ngIf="editable" class="rsv-btn rsv-btn--primary acc-big" [disabled]="emailInvalid" (click)="issue()">Generar factura y cobrar {{ money(t.total) }}</button>
        <a *ngIf="!editable" routerLink="/dashboard/restaurant/orders/new" class="rsv-btn rsv-btn--primary acc-big">Nuevo pedido</a>
      </section>
    </div>

    <!-- Representación gráfica -->
    <article class="kit-card inv-sheet" aria-label="Vista previa de la factura">
      <div class="inv-top">
        <div class="inv-issuer">
          <span class="inv-logo">[LOGO]</span>
          <div>
            <h2>{{ issuer.name }} · Restaurante y cafetería</h2>
            <p>NIT {{ issuer.nit }}</p>
            <p>{{ issuer.address }} · {{ issuer.city }}</p>
          </div>
        </div>
        <div class="inv-num">
          <span>Factura electrónica de venta</span>
          <strong>{{ o.invoice?.number ?? 'Borrador' }}</strong>
          <p>{{ stamp(o.invoice?.at ?? o.createdAt) }}</p>
          <p>Contado · {{ o.invoice?.method ?? method }}</p>
        </div>
      </div>
      <div class="inv-boxes">
        <div><span>Cliente</span><strong>{{ o.invoice?.clientName ?? (clientName || 'Consumidor final') }}</strong><br>{{ o.invoice?.clientDoc ?? (clientDoc || '222222222222') }}</div>
        <div><span>Origen</span><strong>Pedido {{ o.number }}</strong><br>{{ o.table || o.unitLabel }} · {{ o.reservationId ? 'cargo a habitación' : 'venta directa' }}</div>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">V. unitario</th><th class="r">Desc.</th><th>Impuesto</th><th class="r">Valor</th></tr></thead>
          <tbody>
            <tr *ngFor="let i of o.items">
              <td><strong>{{ i.name }}</strong></td><td class="r">{{ i.quantity }}</td><td class="r">{{ money(i.unitPrice) }}</td>
              <td class="r">—</td><td>INC {{ taxPct }}%</td><td class="r">{{ money(i.unitPrice * i.quantity) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="inv-bottom">
        <div class="inv-qr">
          <span>Código QR</span>
          <div>
            <p><strong>CUFE:</strong> {{ o.invoice ? o.invoice.cufe.slice(0, 40) + '…' : '[se asigna al emitir]' }}</p>
            <p>{{ words(t.total) }}</p>
          </div>
        </div>
        <div class="inv-totals">
          <div class="kit-sum"><span>Subtotal</span><strong>{{ money(t.subtotal) }}</strong></div>
          <div class="kit-sum"><span>Descuentos</span><strong>{{ money(0) }}</strong></div>
          <div class="kit-sum"><span>INC {{ taxPct }}%</span><strong>{{ money(t.tax) }}</strong></div>
          <div class="inv-grand"><span>TOTAL</span><strong>{{ money(t.total) }}</strong></div>
        </div>
      </div>
    </article>
  </div>
  </ng-container>

  <ng-template #notFound>
    <p class="kit-card kit-empty">No se encontró el pedido. <a routerLink="/dashboard/restaurant/accounts">Volver a cuentas</a></p>
  </ng-template>
  `,
  styles: [`.inv-fields { border: none; padding: 0; margin: 0; } .inv-sent { font-size: 12px; margin: 0 0 10px; }`],
})
export class OrderInvoiceComponent {
  readonly money = fmtMoney;
  readonly stamp = stamp;
  readonly words = amountInWords;
  readonly methods = PAYMENT_METHODS;

  o?: RestaurantOrder;
  clientName = 'Consumidor final';
  clientDoc = '222222222222';
  method: SalePaymentMethod = 'Efectivo';
  email = '';
  sentMsg = '';
  taxPct: number;

  constructor(private svc: RestaurantService, private config: BillingConfigService, route: ActivatedRoute) {
    this.taxPct = Math.round(svc.taxRate * 100);
    const id = route.snapshot.paramMap.get('id')!;
    svc.getOrders().subscribe(() => {
      this.o = svc.getOrder(id);
      if (this.o?.invoice) {
        this.email = this.email || this.o.invoice.email;
        this.method = this.o.invoice.method;
      } else if (this.o && this.o.clientName !== 'Consumidor final') {
        this.clientName = this.o.clientName;
      }
    });
  }

  get issuer() { return this.config.get().issuer; }
  get t() { return orderTotals(this.o!); }
  get editable(): boolean { return !!this.o && this.o.status === 'Pendiente' && !this.o.reservationId; }
  get emailInvalid(): boolean { return !!this.email.trim() && !EMAIL_RE.test(this.email.trim()); }

  issue(): void {
    if (!this.o || !this.editable) return;
    this.svc.invoiceOrders([this.o.id], { clientName: this.clientName, clientDoc: this.clientDoc, method: this.method, email: this.email });
    if (this.email.trim()) this.send();
  }

  send(): void {
    if (!this.o?.invoice) return;
    this.svc.sendInvoice(this.o.invoice.orderIds, this.email.trim());
    this.sentMsg = `Factura enviada a ${this.email.trim()}.`;
  }

  open(print: boolean): void {
    const inv = this.o?.invoice;
    if (!inv) return;
    const orders = inv.orderIds.map(id => this.svc.getOrder(id)!).filter(Boolean);
    openDocument(`Factura ${inv.number}`, invoiceHtml(orders, this.issuer), print);
  }
}
