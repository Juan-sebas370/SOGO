import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StayService } from '../stay.service';
import { Stay } from '../stay.model';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, lodgingLabel, totalGuests } from '../../reservations/reservation.model';

@Component({
  selector: 'app-checkin-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./checkin-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/lodging">Alojamiento</a><span>›</span>
      <span>Check-In</span>
    </div>

    <h1 class="res-title">Check-In</h1>

    <!-- Selector de reserva (cuando no viene con id) -->
    <div class="form-section selector-section" *ngIf="!stay">
      <h2 class="form-section-title">Seleccionar Reserva</h2>
      <p class="recover-desc">Selecciona la reserva confirmada para registrar el Check-In.</p>
      <div class="form-field">
        <label>Reserva</label>
        <select [(ngModel)]="selectedReservationId" (ngModelChange)="loadFromReservation()" class="form-select">
          <option value="">Seleccionar reserva...</option>
          <option *ngFor="let r of confirmedReservations" [value]="r.id">
            {{ r.code }} — {{ r.guestName }} ({{ lodging(r) }})
          </option>
        </select>
      </div>
      <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>
    </div>

    <!-- Formulario (cuando hay stay cargado) -->
    <div class="form-grid" *ngIf="stay">
      <!-- Izquierda: Info de la reserva -->
      <div class="form-section">
        <h2 class="form-section-title">Información de la Reserva</h2>
        <div class="detail-row"><span class="detail-label">Código de Reserva</span><span class="res-code">{{ stay.reservationCode }}</span></div>
        <div class="detail-row"><span class="detail-label">Huésped</span><span class="detail-value">{{ stay.guestName }}</span></div>
        <div class="detail-row"><span class="detail-label">Habitación</span><span class="detail-value">{{ stay.roomType }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Entrada</span><span class="detail-value">{{ stay.checkInDate | date:'dd/MM/yyyy' }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Salida Estimada</span><span class="detail-value">{{ stay.estimatedCheckOut | date:'dd/MM/yyyy' }}</span></div>
        <div class="detail-row"><span class="detail-label">Noches</span><span class="detail-value">{{ stay.nights }}</span></div>
        <div class="detail-row"><span class="detail-label">Plan / Tarifa</span><span class="detail-value">{{ stay.plan }}</span></div>
        <div class="detail-row" *ngIf="stay.observations"><span class="detail-label">Observaciones</span><span class="detail-value">{{ stay.observations }}</span></div>
      </div>

      <!-- Derecha: Datos del Check-In -->
      <div class="form-section">
        <h2 class="form-section-title">Datos del Check-In</h2>

        <div class="form-field">
          <label>Fecha de Check-In *</label>
          <input type="date" [(ngModel)]="form.checkInDate" class="form-input">
        </div>

        <div class="form-field">
          <label>Hora de Check-In *</label>
          <input type="time" [(ngModel)]="form.checkInTime" class="form-input">
        </div>

        <div class="form-field">
          <label>Documento de Identidad *</label>
          <input type="text" [(ngModel)]="form.docNumber" placeholder="1234567890" class="form-input">
        </div>

        <div class="form-field">
          <label>Número de Huéspedes *</label>
          <input type="number" [(ngModel)]="form.guests" min="1" max="10" class="form-input">
        </div>

        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="form.observations" rows="3" placeholder="Observaciones adicionales..." class="form-textarea"></textarea>
        </div>
      </div>
    </div>

    <div class="form-error" *ngIf="stay && errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/lodging">Cancelar</button>
      <button class="btn-primary" (click)="confirm()" *ngIf="stay">
        Confirmar Check-In
      </button>
    </div>

  </div>
  `
})
export class CheckinFormComponent implements OnInit {
  stay?: Stay;
  errorMsg = '';
  selectedReservationId = '';
  confirmedReservations: Reservation[] = [];
  readonly lodging = lodgingLabel;

  form = {
    checkInDate:  new Date().toISOString().slice(0, 10),
    checkInTime:  new Date().toTimeString().slice(0, 5),
    docNumber:    '',
    guests:       1,
    observations: ''
  };

  constructor(
    private svc: StayService,
    private resSvc: ReservationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.stay = this.svc.getById(id);
      if (this.stay) {
        this.form.docNumber    = this.stay.docNumber;
        this.form.guests       = this.stay.guests;
        this.form.observations = this.stay.observations;
      }
    } else {
      // Cargar reservas confirmadas para el selector
      this.resSvc.getAll().subscribe(list => {
        this.confirmedReservations = list.filter(r => r.status === 'Confirmada' || r.status === 'Pendiente');
      });
    }
  }

  loadFromReservation(): void {
    if (!this.selectedReservationId) return;
    const res = this.resSvc.getById(this.selectedReservationId);
    if (!res) return;
    // Crear stay temporal desde la reserva
    this.stay = this.svc.addFromReservation({
      reservationCode: res.code,
      guestName:       res.guestName,
      roomNumber:      res.rooms.join(', '),
      roomType:        `${lodgingLabel(res)} · ${res.reservationType}`,
      checkInDate:     res.checkIn,
      checkOutDate:    res.checkOut,
      nights:          res.nights,
      guests:          totalGuests(res),
      plan:            res.plan,
      docNumber:       res.docNumber ?? '',
      observations:    res.observations
    });
    this.form.docNumber    = res.docNumber ?? '';
    this.form.guests       = totalGuests(res);
    this.form.observations = res.observations;
  }

  confirm(): void {
    if (!this.stay) return;
    if (!this.form.checkInDate || !this.form.checkInTime || !this.form.docNumber) {
      this.errorMsg = 'Por favor completa todos los campos obligatorios.';
      return;
    }
    this.svc.checkIn(
      this.stay.id,
      this.form.checkInDate,
      this.form.checkInTime,
      this.form.docNumber,
      this.form.guests
    );
    this.router.navigate(['/dashboard/lodging', this.stay.id, 'checkin-confirm']);
  }
}
