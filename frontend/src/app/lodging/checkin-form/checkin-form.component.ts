import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, awaitsCheckIn, isInHouse, lodgingLabel, balance } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney } from '../../reservations/reservation-format';
import { RoomService } from '../room.service';
import { isoDate, isoDateTime } from '../../shared/date-utils';

@Component({
  selector: 'app-checkin-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../lodging-flow.css'],
  template: `
  <nav class="lod-breadcrumb" aria-label="Ruta">
    <a routerLink="/dashboard">Dashboard</a><span aria-hidden="true">›</span>
    <a routerLink="/dashboard/lodging">Alojamiento</a><span aria-hidden="true">›</span><span>Check-In</span>
  </nav>
  <h1 class="flow-title">Registrar check-in</h1>
  <p class="flow-subtitle">Confirma la llegada del huésped y los datos con los que se aloja.</p>

  <!-- Sin reserva elegida: llegadas pendientes de hoy -->
  <section class="rsv-panel flow-card flow-picker" *ngIf="!r">
    <h2 class="flow-card-title">Llegadas pendientes</h2>
    <ul class="flow-arrivals" *ngIf="arrivals.length; else noArrivals">
      <li *ngFor="let a of arrivals">
        <div>
          <strong>{{ a.guestName }}</strong>
          <span>{{ a.code }} · {{ lodging(a) }} · {{ date(a.checkIn) }} - {{ date(a.checkOut) }}</span>
        </div>
        <a class="rsv-btn rsv-btn--primary" [routerLink]="['/dashboard/lodging', a.id, 'checkin']">Registrar</a>
      </li>
    </ul>
    <ng-template #noArrivals><p class="flow-empty">No hay reservas esperando check-in hoy.</p></ng-template>
  </section>

  <div class="flow-grid" *ngIf="r">
    <section class="rsv-panel flow-card">
      <h2 class="flow-card-title">Reserva</h2>
      <dl class="flow-dl">
        <div><dt>Código</dt><dd><a [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></dd></div>
        <div><dt>Huésped principal</dt><dd>{{ r.guestName }}</dd></div>
        <div><dt>Alojamiento</dt><dd>{{ lodging(r) }} · hab. {{ r.rooms.join(', ') }}</dd></div>
        <div><dt>Entrada - Salida</dt><dd>{{ date(r.checkIn) }} - {{ date(r.checkOut) }}</dd></div>
        <div><dt>Plan / tarifa</dt><dd>{{ r.plan }}</dd></div>
        <div><dt>Saldo pendiente</dt><dd [class.flow-warn-text]="pending > 0">{{ money(pending) }}</dd></div>
        <div><dt>TRA</dt><dd>{{ tra }}</dd></div>
      </dl>
      <p class="flow-alert" *ngIf="tra === 'Pendiente'">
        El TRA de esta reserva está pendiente.
        <a routerLink="/dashboard/tra/new" [queryParams]="{ reserva: r.code }">Registrar TRA</a>
      </p>
      <p class="flow-alert" *ngIf="cleaningRooms.length">
        Habitación{{ cleaningRooms.length > 1 ? 'es' : '' }} {{ cleaningRooms.join(', ') }} en limpieza: al confirmar quedará{{ cleaningRooms.length > 1 ? 'n' : '' }} ocupada{{ cleaningRooms.length > 1 ? 's' : '' }}.
      </p>
    </section>

    <section class="rsv-panel flow-card">
      <h2 class="flow-card-title">Datos del check-in</h2>
      <div class="flow-row">
        <div class="rsv-field">
          <label for="ci-date">Fecha *</label>
          <input id="ci-date" type="date" class="rsv-input" [(ngModel)]="form.date">
        </div>
        <div class="rsv-field">
          <label for="ci-time">Hora *</label>
          <input id="ci-time" type="time" class="rsv-input" [(ngModel)]="form.time">
        </div>
      </div>
      <div class="rsv-field">
        <label for="ci-doc">Documento del huésped principal ({{ r.docType }}) *</label>
        <input id="ci-doc" type="text" class="rsv-input" [(ngModel)]="form.docNumber">
      </div>
      <div class="flow-row flow-row--3">
        <div class="rsv-field">
          <label for="ci-adults">Adultos *</label>
          <input id="ci-adults" type="number" min="1" class="rsv-input" [(ngModel)]="form.adults">
        </div>
        <div class="rsv-field">
          <label for="ci-children">Niños</label>
          <input id="ci-children" type="number" min="0" class="rsv-input" [(ngModel)]="form.children">
        </div>
        <div class="rsv-field">
          <label for="ci-infants">Bebés</label>
          <input id="ci-infants" type="number" min="0" class="rsv-input" [(ngModel)]="form.infants">
        </div>
      </div>
      <div class="rsv-field">
        <label for="ci-obs">Observaciones</label>
        <textarea id="ci-obs" rows="3" class="rsv-input" [(ngModel)]="form.observations"></textarea>
      </div>
    </section>
  </div>

  <div class="flow-error" *ngIf="errorMsg" role="alert">{{ errorMsg }}</div>

  <div class="flow-footer">
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/lodging">Cancelar</a>
    <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="r" (click)="confirm()">Confirmar check-in</button>
  </div>
  `
})
export class CheckinFormComponent {

  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;

  r?: Reservation;
  arrivals: Reservation[] = [];
  errorMsg = '';

  form = { date: isoDate(0), time: isoDateTime().slice(11, 16), docNumber: '', adults: 1, children: 0, infants: 0, observations: '' };

  constructor(
    private svc: ReservationService,
    private roomSvc: RoomService,
    private router: Router,
    route: ActivatedRoute
  ) {
    const id = route.snapshot.paramMap.get('id');
    const today = isoDate(0);
    if (!id) {
      this.arrivals = this.svc.getSnapshot()
        .filter(r => awaitsCheckIn(r) && r.checkIn <= today && r.checkOut >= today)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      return;
    }
    const r = this.svc.getById(id);
    if (!r || !awaitsCheckIn(r)) { this.router.navigate(['/dashboard/lodging']); return; }
    this.r = r;
    this.form = { ...this.form, docNumber: r.docNumber, adults: r.adults, children: r.children, infants: r.infants, observations: r.observations };
  }

  get pending(): number { return balance(this.r!); }
  get tra() { return this.svc.traStatus(this.r!); }

  get cleaningRooms(): string[] {
    return this.roomSvc.getSnapshot().filter(room => this.r!.rooms.includes(room.number) && room.status === 'En limpieza').map(room => room.number);
  }

  private validate(): string {
    const r = this.r!;
    if (!this.form.date || !this.form.time) return 'Indica la fecha y la hora del check-in.';
    if (!this.form.docNumber.trim()) return 'Confirma el documento del huésped principal.';
    if ((+this.form.adults || 0) < 1) return 'Debe haber al menos un adulto.';

    const rooms = this.roomSvc.getSnapshot().filter(room => r.rooms.includes(room.number));
    const blocked = rooms.filter(room => room.status === 'En mantenimiento' || room.status === 'Fuera de servicio');
    if (blocked.length) return `No se puede alojar: ${blocked.map(b => `${b.number} (${b.status.toLowerCase()})`).join(', ')}.`;

    const busy = this.svc.getSnapshot().find(o => o.id !== r.id && isInHouse(o) && o.rooms.some(n => r.rooms.includes(n)));
    if (busy) return `Las habitaciones siguen ocupadas por ${busy.guestName} (${busy.code}). Registra primero su check-out.`;
    return '';
  }

  confirm(): void {
    this.errorMsg = this.validate();
    if (this.errorMsg) return;
    const r = this.r!;
    const cleaning = this.cleaningRooms;
    this.svc.checkIn(r.id, `${this.form.date}T${this.form.time}`, {
      docNumber: this.form.docNumber.trim(),
      adults: +this.form.adults, children: +this.form.children || 0, infants: +this.form.infants || 0,
      observations: this.form.observations.trim(),
    });
    // La limpieza terminó en cuanto entra el huésped
    cleaning.forEach(n => this.roomSvc.setManualStatus(n, null));
    this.router.navigate(['/dashboard/lodging', r.id, 'checkin-confirm']);
  }
}
