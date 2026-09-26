import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, lodgingLabel, totalGuests, totalAmount, paidAmount, lastPayment } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { openPaymentReceipt } from '../../reservations/reservation-documents';

/** Confirmación tras registrar un check-in o un check-out (la ruta indica cuál con data.kind). */
@Component({
  selector: 'app-lodging-confirm',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['../lodging-flow.css'],
  template: `
  <section class="rsv-panel flow-confirm" *ngIf="r">
    <span class="flow-confirm-icon">
      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    </span>
    <h1 class="flow-title">{{ kind === 'checkin' ? '¡Check-in registrado!' : '¡Check-out registrado!' }}</h1>
    <p class="flow-subtitle">
      {{ kind === 'checkin' ? r.guestName + ' quedó alojado en ' + lodging(r).toLowerCase() + '.' : 'La estadía de ' + r.guestName + ' quedó cerrada y la reserva finalizada.' }}
    </p>

    <dl class="flow-dl flow-confirm-dl">
      <div><dt>Reserva</dt><dd>{{ r.code }}</dd></div>
      <div><dt>Habitaciones</dt><dd>{{ r.rooms.join(', ') }}</dd></div>
      <ng-container *ngIf="kind === 'checkin'; else outData">
        <div><dt>Check-in</dt><dd>{{ dateTime(r.checkedInAt!) }}</dd></div>
        <div><dt>Salida prevista</dt><dd>{{ date(r.checkOut) }}</dd></div>
        <div><dt>Huéspedes</dt><dd>{{ guests(r) }}</dd></div>
      </ng-container>
      <ng-template #outData>
        <div><dt>Check-out</dt><dd>{{ dateTime(r.checkedOutAt!) }}</dd></div>
        <div><dt>Total estadía</dt><dd>{{ money(total(r)) }}</dd></div>
        <div><dt>Pagado</dt><dd>{{ money(paid(r)) }}{{ last(r) ? ' · ' + last(r)!.method : '' }}</dd></div>
      </ng-template>
    </dl>

    <div class="flow-footer flow-footer--center">
      <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="kind === 'checkout'" (click)="receipt(r)">Ver comprobante</button>
      <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/reservations', r.id]">Ver reserva</a>
      <a class="rsv-btn" [ngClass]="kind === 'checkout' ? 'rsv-btn--outline' : 'rsv-btn--primary'" routerLink="/dashboard/lodging">Ir a Alojamiento</a>
      <a class="rsv-btn rsv-btn--primary" *ngIf="kind === 'checkout'" routerLink="/dashboard/billing/new" [queryParams]="{ reserva: r.code }">Facturar estadía</a>
    </div>
  </section>
  `
})
export class LodgingConfirmComponent {

  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;
  readonly guests = totalGuests;
  readonly total = totalAmount;
  readonly paid = paidAmount;
  readonly last = lastPayment;
  readonly receipt = (r: Reservation) => openPaymentReceipt(r);

  r?: Reservation;
  kind: 'checkin' | 'checkout';

  constructor(svc: ReservationService, route: ActivatedRoute) {
    this.kind = route.snapshot.data['kind'];
    this.r = svc.getById(route.snapshot.paramMap.get('id')!);
  }
}
