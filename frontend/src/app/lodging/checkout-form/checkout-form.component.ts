import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, PaymentMethod, isInHouse, lodgingLabel, totalAmount, paidAmount } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { RoomService } from '../room.service';
import { InvoiceService } from '../../billing/invoice.service';
import { ChargeService } from '../../billing/charge.service';
import { Invoice, isValidInvoice } from '../../billing/invoice.model';
import { isoDate, isoDateTime } from '../../shared/date-utils';

@Component({
  selector: 'app-checkout-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../lodging-flow.css'],
  template: `
  <nav class="lod-breadcrumb" aria-label="Ruta">
    <a routerLink="/dashboard">Dashboard</a><span aria-hidden="true">›</span>
    <a routerLink="/dashboard/lodging">Alojamiento</a><span aria-hidden="true">›</span><span>Check-Out</span>
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
          <div *ngIf="+form.extraCharges > 0"><span>Cargos del check-out</span><span>{{ money(+form.extraCharges) }}</span></div>
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
        <label for="co-extra">Cargos adicionales (consumos, daños...)</label>
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

  <div class="flow-error" *ngIf="errorMsg" role="alert">{{ errorMsg }}</div>

  <div class="flow-footer">
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/lodging">Cancelar</a>
    <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="r" (click)="confirm()">
      {{ due > 0 ? 'Cobrar ' + money(due) + ' y registrar salida' : 'Registrar check-out' }}
    </button>
  </div>
  `
})
export class CheckoutFormComponent {

  readonly paymentMethods: PaymentMethod[] = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Tarjeta'];
  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;

  r?: Reservation;
  today = isoDate(0);
  errorMsg = '';
  form = { date: isoDate(0), time: isoDateTime().slice(11, 16), extraCharges: 0, method: '' as PaymentMethod | '', receipt: '', sendToCleaning: true };

  constructor(
    private svc: ReservationService,
    private roomSvc: RoomService,
    private invoices: InvoiceService,
    private charges: ChargeService,
    private router: Router,
    route: ActivatedRoute
  ) {
    const r = this.svc.getById(route.snapshot.paramMap.get('id')!);
    if (!r || !isInHouse(r)) { this.router.navigate(['/dashboard/lodging']); return; }
    this.r = r;
  }

  /** Factura válida de la estadía: si existe, se cobra su saldo (incluye impuestos y consumos). */
  get invoice(): Invoice | undefined {
    return this.invoices.getSnapshot().find(i => i.reservationId === this.r!.id && isValidInvoice(i));
  }

  get total(): number {
    return this.invoice ? this.invoices.total(this.invoice) : totalAmount(this.r!) + (+this.form.extraCharges || 0);
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
    if (!this.invoice && +this.form.extraCharges > 0) {
      this.charges.add({ reservationId: r.id, category: 'Otro', description: 'Cargos del check-out', detail: 'Registrados al salir',
                         date: this.form.date, quantity: 1, unitValue: +this.form.extraCharges });
    }
    if (due > 0) this.svc.addPayment(r.id, { amount: due, method: this.form.method as PaymentMethod, receipt: this.form.receipt.trim() });
    this.svc.checkOut(r.id, `${this.form.date}T${this.form.time}`);
    if (this.form.sendToCleaning) r.rooms.forEach(n => this.roomSvc.setManualStatus(n, 'En limpieza'));
    this.router.navigate(['/dashboard/lodging', r.id, 'checkout-confirm']);
  }
}
