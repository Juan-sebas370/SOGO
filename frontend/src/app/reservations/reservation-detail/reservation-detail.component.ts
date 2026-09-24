import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReservationService, isoDate } from '../reservation.service';
import { Reservation, paymentStatus, totalGuests, lodgingLabel } from '../reservation.model';
import { fmtDate, fmtMoney, typeBadge, statusBadge, paymentBadge, traBadge } from '../reservation-format';

@Component({
  selector: 'app-reservation-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reservation-detail.component.css'],
  template: `
  <ng-container *ngIf="r; else notFound">
    <header class="rsv-header">
      <div class="rsv-header-main">
        <span class="rsv-header-icon">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>
        </span>
        <div>
          <span class="rsv-eyebrow">
            <a routerLink="/dashboard/reservations">Reservas</a><span aria-hidden="true">›</span>{{ r.code }}
          </span>
          <h1 class="rsv-title rsv-title--status">
            {{ r.guestName }}
            <span class="rsv-badge" [ngClass]="statusBadge(r.status)">{{ r.status }}</span>
          </h1>
          <p class="rsv-subtitle">Reserva {{ r.code }} · creada el {{ date(r.createdAt) }}</p>
        </div>
      </div>
      <div class="rsv-header-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="r.status === 'Pendiente'" (click)="confirm()">
          <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          Confirmar
        </button>
        <a class="rsv-btn rsv-btn--outline" *ngIf="canCheckIn" routerLink="/dashboard/lodging/checkin">
          <svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Registrar check-in
        </a>
        <a class="rsv-btn rsv-btn--outline" *ngIf="editable" [routerLink]="['/dashboard/reservations', r.id, 'edit']">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </a>
        <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="editable" (click)="showCancel = true; cancelReason = ''">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Cancelar reserva
        </button>
      </div>
    </header>

    <!-- Estadía en una línea -->
    <section class="rsv-panel rsv-stay">
      <div class="rsv-stay-item"><span>Entrada</span><strong>{{ date(r.checkIn) }}</strong></div>
      <div class="rsv-stay-item"><span>Salida</span><strong>{{ date(r.checkOut) }}</strong></div>
      <div class="rsv-stay-item"><span>Noches</span><strong>{{ r.nights || 'Pasadía' }}</strong></div>
      <div class="rsv-stay-item"><span>Huéspedes</span><strong>{{ guests(r) }}</strong><small>{{ r.adults }} adultos · {{ r.children }} niños · {{ r.infants }} bebés</small></div>
      <div class="rsv-stay-item"><span>Alojamiento</span><strong>{{ lodging(r) }}</strong><small>Habitaciones {{ r.rooms.join(', ') }}</small></div>
    </section>

    <div class="rsv-detail-grid">
      <section class="rsv-panel rsv-detail-card">
        <h2 class="rsv-detail-title">Huésped principal</h2>
        <dl class="rsv-dl">
          <div><dt>Nombre</dt><dd>{{ r.guestName }}</dd></div>
          <div><dt>{{ r.docType }}</dt><dd>{{ r.docNumber }}</dd></div>
          <div><dt>Teléfono</dt><dd>{{ r.phone }}</dd></div>
          <div><dt>Correo</dt><dd>{{ r.email || '—' }}</dd></div>
        </dl>
      </section>

      <section class="rsv-panel rsv-detail-card">
        <h2 class="rsv-detail-title">Reserva</h2>
        <dl class="rsv-dl">
          <div><dt>Tipo de reserva</dt><dd><span class="rsv-badge" [ngClass]="typeBadge(r.reservationType)">{{ r.reservationType }}</span></dd></div>
          <div><dt>Tipo de alojamiento</dt><dd>{{ r.lodgingType }}</dd></div>
          <div><dt>Plan / tarifa</dt><dd>{{ r.plan }}</dd></div>
          <div><dt>TRA</dt><dd><span class="rsv-badge" [ngClass]="traBadge(r.traStatus)">{{ r.traStatus }}</span></dd></div>
          <div *ngIf="r.cancelReason"><dt>Motivo de cancelación</dt><dd>{{ r.cancelReason }}</dd></div>
        </dl>
      </section>

      <section class="rsv-panel rsv-detail-card">
        <h2 class="rsv-detail-title">Pago</h2>
        <dl class="rsv-dl">
          <div><dt>Valor total</dt><dd>{{ money(r.totalAmount) }}</dd></div>
          <div><dt>Abonado</dt><dd>{{ money(r.paidAmount) }}</dd></div>
          <div><dt>Saldo</dt><dd class="rsv-dd-strong">{{ money(r.totalAmount - r.paidAmount) }}</dd></div>
          <div><dt>Estado del pago</dt><dd><span class="rsv-badge" [ngClass]="paymentBadge(pay(r))">{{ pay(r) }}</span></dd></div>
        </dl>
        <div class="rsv-progress" [attr.aria-label]="paidPct + '% pagado'">
          <span [style.width.%]="paidPct"></span>
        </div>
      </section>

      <section class="rsv-panel rsv-detail-card" *ngIf="r.observations">
        <h2 class="rsv-detail-title">Observaciones</h2>
        <p class="rsv-detail-text">{{ r.observations }}</p>
      </section>
    </div>

    <!-- Modal de cancelación -->
    <div class="rsv-modal-overlay" *ngIf="showCancel" (click)="showCancel = false">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="rsv-modal-icon">
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 class="rsv-modal-title">Cancelar reserva</h3>
        <p class="rsv-modal-desc">¿Seguro que deseas cancelar la reserva <strong>{{ r.code }}</strong> de {{ r.guestName }}?</p>
        <div class="rsv-field">
          <label for="cancel-reason">Motivo de cancelación</label>
          <select id="cancel-reason" class="rsv-input" [(ngModel)]="cancelReason">
            <option value="">Seleccionar motivo...</option>
            <option *ngFor="let m of cancelReasons">{{ m }}</option>
          </select>
        </div>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="showCancel = false">No, volver</button>
          <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="!cancelReason" (click)="confirmCancel()">Sí, cancelar</button>
        </div>
      </div>
    </div>
  </ng-container>

  <ng-template #notFound>
    <section class="rsv-panel rsv-not-found">
      <p>No encontramos esta reserva.</p>
      <a routerLink="/dashboard/reservations" class="rsv-btn rsv-btn--outline">Volver a reservas</a>
    </section>
  </ng-template>
  `
})
export class ReservationDetailComponent {

  readonly cancelReasons = ['Cambio de planes del huésped', 'Solicitud del huésped', 'Error en la reserva', 'Otro'];

  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly typeBadge = typeBadge;
  readonly statusBadge = statusBadge;
  readonly paymentBadge = paymentBadge;
  readonly traBadge = traBadge;
  readonly pay = paymentStatus;
  readonly guests = totalGuests;
  readonly lodging = lodgingLabel;

  r?: Reservation;
  showCancel = false;
  cancelReason = '';

  constructor(private svc: ReservationService, route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id')!;
    this.svc.getAll().subscribe(() => this.r = this.svc.getById(id));
  }

  get editable(): boolean {
    return !!this.r && (this.r.status === 'Confirmada' || this.r.status === 'Pendiente');
  }

  get canCheckIn(): boolean {
    return this.editable && this.r!.checkIn <= isoDate(3) && this.r!.checkOut >= isoDate(0);
  }

  get paidPct(): number {
    const r = this.r!;
    return r.totalAmount ? Math.min(100, Math.round((r.paidAmount / r.totalAmount) * 100)) : 0;
  }

  confirm(): void {
    this.svc.update(this.r!.id, { status: 'Confirmada' });
  }

  confirmCancel(): void {
    if (!this.cancelReason) return;
    this.svc.cancel(this.r!.id, this.cancelReason);
    this.showCancel = false;
  }
}
