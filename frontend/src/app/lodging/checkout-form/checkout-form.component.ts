import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, PaymentMethod, isInHouse, lodgingLabel, totalAmount, paidAmount, GUEST_PAYMENT_METHODS } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { RoomService } from '../room.service';
import { InvoiceService } from '../../billing/invoice.service';
import { ChargeService } from '../../billing/charge.service';
import { Invoice, isValidInvoice } from '../../billing/invoice.model';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { DotacionService } from '../../inventory/dotacion.service';
import { DAMAGE_REASONS, DamageReason, DotacionItem, qtyOn } from '../../inventory/dotacion.model';
import { roomByNumber } from '../house';

/** Artículo de la dotación que el huésped perdió o dañó (se cobra al registrar la salida). */
interface DamageLine {
  itemId:    number;
  name:      string;
  floor:     number;
  quantity:  number;
  reason:    DamageReason;
  unitValue: number;
}

@Component({
  selector: 'app-checkout-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../lodging-flow.css'],
  template: `
  <nav class="lod-breadcrumb" aria-label="Ruta">
    <a routerLink="/dashboard">Dashboard</a><span aria-hidden="true">›</span>
    <a routerLink="/dashboard/lodging">Alojamiento</a><span aria-hidden="true">›</span><a routerLink="/dashboard/lodging/recepcion">Llegadas y salidas</a><span aria-hidden="true">›</span><span>Check-out</span>
  </nav>
  <h1 class="flow-title">Registrar check-out</h1>
  <p class="flow-subtitle">Liquida la estadía y libera las habitaciones.</p>

  <div class="flow-grid" *ngIf="r">
    <section class="rsv-panel flow-card">
      <h2 class="flow-card-title">Estadía</h2>
      <dl class="flow-dl">
        <div><dt>Reserva</dt><dd><a [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></dd></div>
        <div><dt>Huésped principal</dt><dd>{{ r.guestName }}</dd></div>
        <div><dt>Alojamiento</dt><dd>{{ lodging(r) }} · hab. {{ r.rooms.join(', ') }}</dd></div>
        <div><dt>Check-in</dt><dd>{{ dateTime(r.checkedInAt!) }}</dd></div>
        <div><dt>Salida prevista</dt><dd [class.flow-warn-text]="r.checkOut < today">{{ date(r.checkOut) }}</dd></div>
      </dl>

      <div class="flow-lines">
        <ng-container *ngIf="invoice as inv; else notInvoiced">
          <div><span>Factura <a [routerLink]="['/dashboard/billing', inv.id]">{{ inv.number }}</a> (con impuestos)</span><span>{{ money(total) }}</span></div>
        </ng-container>
        <ng-template #notInvoiced>
          <div><span>Alojamiento</span><span>{{ money(r.lodgingAmount) }}</span></div>
          <div><span>Servicios adicionales</span><span>{{ money(r.extrasAmount) }}</span></div>
          <div *ngIf="damagesTotal > 0"><span>Daños y faltantes ({{ damages.length }})</span><span>{{ money(damagesTotal) }}</span></div>
          <div *ngIf="+form.extraCharges > 0"><span>Otros cargos del check-out</span><span>{{ money(+form.extraCharges) }}</span></div>
        </ng-template>
        <div class="flow-lines-total"><span>Total</span><span>{{ money(total) }}</span></div>
        <div><span>Pagado</span><span>{{ money(paid) }}</span></div>
        <div class="flow-lines-due" [class.flow-lines-due--ok]="due === 0"><span>Saldo a cobrar</span><span>{{ money(due) }}</span></div>
      </div>
    </section>

    <section class="rsv-panel flow-card">
      <h2 class="flow-card-title">Datos del check-out</h2>
      <div class="flow-row">
        <div class="rsv-field">
          <label for="co-date">Fecha *</label>
          <input id="co-date" type="date" class="rsv-input" [(ngModel)]="form.date" [min]="r.checkedInAt!.slice(0, 10)">
        </div>
        <div class="rsv-field">
          <label for="co-time">Hora *</label>
          <input id="co-time" type="time" class="rsv-input" [(ngModel)]="form.time">
        </div>
      </div>
      <div class="rsv-field" *ngIf="!invoice">
        <label for="co-extra">Otros cargos (no incluidos en la revisión de dotación)</label>
        <input id="co-extra" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="form.extraCharges">
      </div>
      <p class="flow-alert" *ngIf="invoice">La estadía ya está facturada: se cobra el saldo de la factura. Un cargo nuevo requiere otra factura.</p>
      <ng-container *ngIf="due > 0">
        <div class="flow-row">
          <div class="rsv-field">
            <label for="co-method">Método de pago del saldo *</label>
            <select id="co-method" class="rsv-input" [(ngModel)]="form.method">
              <option value="">Seleccionar...</option>
              <option *ngFor="let m of paymentMethods">{{ m }}</option>
            </select>
          </div>
          <div class="rsv-field">
            <label for="co-receipt">N.º de comprobante</label>
            <input id="co-receipt" type="text" class="rsv-input" [(ngModel)]="form.receipt" placeholder="1234">
          </div>
        </div>
      </ng-container>
      <label class="flow-check">
        <input type="checkbox" [(ngModel)]="form.sendToCleaning">
        Enviar las habitaciones a limpieza al salir
      </label>
    </section>
  </div>

  <!-- Revisión de la dotación: lo que el huésped perdió o dañó se le cobra al precio del catálogo -->
  <section class="rsv-panel flow-card" *ngIf="r && !invoice" style="margin-top: 18px">
    <h2 class="flow-card-title">Revisión de dotación</h2>
    <p class="flow-subtitle" style="margin: 0 0 12px">
      Revisa lo que se prestó en {{ floorsLabel }} (habitaciones, lencería, cocina...). Si falta algo o se entrega dañado,
      agrégalo: se cobra al precio de <a routerLink="/dashboard/inventory/dotacion">Dotación de la casa</a>.
    </p>
    <div class="flow-row" style="align-items: flex-end; flex-wrap: wrap">
      <div class="rsv-field" style="flex: 2; min-width: 220px">
        <label for="co-item">Artículo</label>
        <select id="co-item" class="rsv-input" [(ngModel)]="line.itemId" (ngModelChange)="pickItem()">
          <option [ngValue]="null">Seleccionar...</option>
          <optgroup *ngFor="let g of itemGroups" [label]="g.category">
            <option *ngFor="let i of g.items" [ngValue]="i.id">{{ i.name }} · {{ money(i.unitPrice) }}</option>
          </optgroup>
        </select>
      </div>
      <div class="rsv-field" *ngIf="stayFloors.length > 1" style="min-width: 110px">
        <label for="co-floor">Piso</label>
        <select id="co-floor" class="rsv-input" [(ngModel)]="line.floor">
          <option *ngFor="let f of stayFloors" [ngValue]="f">Piso {{ f }}</option>
        </select>
      </div>
      <div class="rsv-field" style="max-width: 100px">
        <label for="co-qty">Cantidad</label>
        <input id="co-qty" type="number" min="1" step="1" class="rsv-input" [(ngModel)]="line.quantity">
      </div>
      <div class="rsv-field" style="min-width: 120px">
        <label for="co-reason">Motivo</label>
        <select id="co-reason" class="rsv-input" [(ngModel)]="line.reason">
          <option *ngFor="let m of reasons">{{ m }}</option>
        </select>
      </div>
      <div class="rsv-field" style="max-width: 150px">
        <label for="co-price">Valor unitario</label>
        <input id="co-price" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="line.unitValue">
      </div>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="addDamage()" style="margin-bottom: 2px">Agregar</button>
    </div>
    <p class="flow-error" *ngIf="lineError" role="alert" style="margin-top: 8px">{{ lineError }}</p>

    <div class="flow-lines" *ngIf="damages.length" style="margin-top: 14px">
      <div *ngFor="let d of damages; let i = index">
        <span>{{ d.quantity }} × {{ d.name }} · {{ d.reason }} · piso {{ d.floor }}
          <button type="button" class="rsv-btn rsv-btn--outline" style="height: 26px; padding: 0 8px; margin-left: 8px" (click)="damages.splice(i, 1)" [attr.aria-label]="'Quitar ' + d.name">Quitar</button>
        </span>
        <span>{{ money(d.quantity * d.unitValue) }}</span>
      </div>
      <div class="flow-lines-total"><span>Total daños y faltantes</span><span>{{ money(damagesTotal) }}</span></div>
    </div>
    <p class="flow-subtitle" *ngIf="!damages.length" style="margin: 12px 0 0">Sin novedades: todo se entregó completo y en buen estado.</p>
  </section>

  <div class="flow-error" *ngIf="errorMsg" role="alert">{{ errorMsg }}</div>

  <div class="flow-footer">
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/lodging/recepcion">Cancelar</a>
    <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="r" (click)="confirm()">
      {{ due > 0 ? 'Cobrar ' + money(due) + ' y registrar salida' : 'Registrar check-out' }}
    </button>
  </div>
  `
})
export class CheckoutFormComponent {

  readonly paymentMethods = GUEST_PAYMENT_METHODS;
  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;

  readonly reasons = DAMAGE_REASONS;

  r?: Reservation;
  today = isoDate(0);
  errorMsg = '';
  form = { date: isoDate(0), time: isoDateTime().slice(11, 16), extraCharges: 0, method: '' as PaymentMethod | '', receipt: '', sendToCleaning: true };

  // Revisión de dotación
  stayFloors: number[] = [];
  itemGroups: { category: string; items: DotacionItem[] }[] = [];
  damages: DamageLine[] = [];
  line = this.emptyLine();
  lineError = '';

  constructor(
    private svc: ReservationService,
    private roomSvc: RoomService,
    private invoices: InvoiceService,
    private charges: ChargeService,
    private dotacion: DotacionService,
    private router: Router,
    route: ActivatedRoute
  ) {
    const r = this.svc.getById(route.snapshot.paramMap.get('id')!);
    if (!r || !isInHouse(r)) { this.router.navigate(['/dashboard/lodging']); return; }
    this.r = r;
    // Pisos de la estadía: de ahí salió la dotación que se le prestó al huésped
    this.stayFloors = [...new Set(r.rooms.map(n => roomByNumber(n)?.floor).filter((f): f is number => f != null))].sort();
    this.line.floor = this.stayFloors[0] ?? 1;
    this.dotacion.ready().then(() => this.buildGroups());
  }

  get floorsLabel(): string {
    return this.stayFloors.length > 1 ? `los pisos ${this.stayFloors.join(' y ')}` : `el piso ${this.stayFloors[0] ?? ''}`;
  }

  get damagesTotal(): number {
    return this.damages.reduce((s, d) => s + d.quantity * d.unitValue, 0);
  }

  /** Artículos que se cobran y que hay en alguno de los pisos de la estadía, por categoría. */
  private buildGroups(): void {
    const items = this.dotacion.getSnapshot().filter(i => i.chargeable && this.stayFloors.some(f => qtyOn(i, f) > 0));
    this.itemGroups = [...new Set(items.map(i => i.category))].map(category => ({ category, items: items.filter(i => i.category === category) }));
  }

  pickItem(): void {
    const item = this.line.itemId != null ? this.dotacion.getById(this.line.itemId) : undefined;
    this.line.unitValue = item?.unitPrice ?? 0;
    // Si el artículo solo está en uno de los pisos, se elige ese
    if (item && qtyOn(item, this.line.floor) === 0) this.line.floor = this.stayFloors.find(f => qtyOn(item, f) > 0) ?? this.line.floor;
    this.lineError = '';
  }

  addDamage(): void {
    const item = this.line.itemId != null ? this.dotacion.getById(this.line.itemId) : undefined;
    const quantity = Math.floor(+this.line.quantity);
    if (!item) { this.lineError = 'Selecciona el artículo.'; return; }
    if (!(quantity >= 1)) { this.lineError = 'La cantidad debe ser 1 o más.'; return; }
    if (!(+this.line.unitValue >= 0)) { this.lineError = 'El valor unitario no puede ser negativo.'; return; }
    const available = qtyOn(item, this.line.floor);
    const already = this.damages.filter(d => d.itemId === item.id && d.floor === this.line.floor).reduce((s, d) => s + d.quantity, 0);
    if (quantity + already > available) {
      this.lineError = `En el piso ${this.line.floor} hay ${available} de "${item.name}" en la dotación.`;
      return;
    }
    this.damages.push({ itemId: item.id, name: item.name, floor: this.line.floor, quantity, reason: this.line.reason, unitValue: Math.round(+this.line.unitValue) });
    this.line = { ...this.emptyLine(), floor: this.line.floor };
    this.lineError = '';
  }

  private emptyLine() {
    return { itemId: null as number | null, floor: 1, quantity: 1, reason: 'Faltante' as DamageReason, unitValue: 0 };
  }

  /** Factura válida de la estadía: si existe, se cobra su saldo (incluye impuestos y consumos). */
  get invoice(): Invoice | undefined {
    return this.invoices.getSnapshot().find(i => i.reservationId === this.r!.id && isValidInvoice(i));
  }

  get total(): number {
    return this.invoice ? this.invoices.total(this.invoice) : totalAmount(this.r!) + this.damagesTotal + (+this.form.extraCharges || 0);
  }
  get paid(): number { return paidAmount(this.r!); }
  get due(): number { return Math.max(0, this.total - this.paid); }

  confirm(): void {
    const r = this.r!;
    if (!this.form.date || !this.form.time) { this.errorMsg = 'Indica la fecha y la hora del check-out.'; return; }
    if (`${this.form.date}T${this.form.time}` < r.checkedInAt!) { this.errorMsg = 'La salida no puede ser anterior al check-in.'; return; }
    if ((+this.form.extraCharges || 0) < 0) { this.errorMsg = 'Los cargos adicionales no pueden ser negativos.'; return; }
    if (this.due > 0 && !this.form.method) { this.errorMsg = 'Selecciona el método de pago del saldo pendiente.'; return; }

    const due = this.due;
    // Los cargos del check-out quedan como consumo de la estadía (aparecen al facturar)
    if (!this.invoice) {
      this.damages.forEach(d => this.charges.add({
        reservationId: r.id, category: 'Daños y faltantes', description: `${d.name} · ${d.reason}`,
        detail: `Piso ${d.floor} · revisión de salida`, date: this.form.date, quantity: d.quantity, unitValue: d.unitValue,
        itemId: d.itemId, floor: d.floor, reason: d.reason,
      }));
      if (+this.form.extraCharges > 0) {
        this.charges.add({ reservationId: r.id, category: 'Otro', description: 'Cargos del check-out', detail: 'Registrados al salir',
                           date: this.form.date, quantity: 1, unitValue: +this.form.extraCharges });
      }
    }
    if (due > 0) this.svc.addPayment(r.id, { amount: due, method: this.form.method as PaymentMethod, receipt: this.form.receipt.trim() });
    this.svc.checkOut(r.id, `${this.form.date}T${this.form.time}`);
    if (this.form.sendToCleaning) r.rooms.forEach(n => this.roomSvc.setManualStatus(n, 'En limpieza'));
    this.router.navigate(['/dashboard/lodging', r.id, 'checkout-confirm']);
  }
}
