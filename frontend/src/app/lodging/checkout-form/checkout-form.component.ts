import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StayService } from '../stay.service';
import { Stay } from '../stay.model';

@Component({
  selector: 'app-checkout-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./checkout-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/lodging">Alojamiento</a><span>›</span>
      <span>Check-Out</span>
    </div>

    <h1 class="res-title">Check-Out</h1>

    <div class="form-grid" *ngIf="stay">

      <!-- Izquierda: Info del alojamiento -->
      <div class="form-section">
        <h2 class="form-section-title">Información del Alojamiento</h2>

        <div class="detail-row"><span class="detail-label">Huésped</span><span class="detail-value font-bold">{{ stay.guestName }}</span></div>
        <div class="detail-row"><span class="detail-label">Habitación</span><span class="detail-value">{{ stay.roomType }}</span></div>
        <div class="detail-row"><span class="detail-label">Entrada</span><span class="detail-value">{{ stay.checkInDate | date:'dd/MM/yyyy' }} {{ stay.checkInTime }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Salida Estimada</span><span class="detail-value">{{ stay.estimatedCheckOut | date:'dd/MM/yyyy' }}</span></div>
        <div class="detail-row"><span class="detail-label">Noches</span><span class="detail-value">{{ stay.nights }}</span></div>
        <div class="detail-row"><span class="detail-label">Plan / Tarifa</span><span class="detail-value">{{ stay.plan }}</span></div>

        <!-- Total base -->
        <div class="stay-total">
          <span class="total-label">Total alojamiento</span>
          <span class="total-amount">$ {{ (stay.totalAmount ?? 0) | number }}</span>
        </div>
      </div>

      <!-- Derecha: Datos del Check-Out -->
      <div class="form-section">
        <h2 class="form-section-title">Datos del Check-Out</h2>

        <div class="form-field">
          <label>Fecha de Check-Out *</label>
          <input type="date" [(ngModel)]="form.checkOutDate" class="form-input">
        </div>

        <div class="form-field">
          <label>Hora de Check-Out *</label>
          <input type="time" [(ngModel)]="form.checkOutTime" class="form-input">
        </div>

        <div class="form-field">
          <label>Cargos Adicionales</label>
          <input type="number" [(ngModel)]="form.additionalCharges" min="0" placeholder="0" class="form-input">
        </div>

        <div class="form-field">
          <label>Método de Pago *</label>
          <select [(ngModel)]="form.paymentMethod" class="form-select">
            <option value="">Seleccionar...</option>
            <option>Efectivo</option>
            <option>Tarjeta de Crédito</option>
            <option>Tarjeta de Débito</option>
            <option>Transferencia</option>
          </select>
        </div>

        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="form.observations" rows="2" placeholder="Agradece el servicio." class="form-textarea"></textarea>
        </div>

        <!-- Total final -->
        <div class="stay-total stay-total--highlight">
          <span class="total-label">Total a cobrar</span>
          <span class="total-amount total-amount--big">$ {{ totalFinal | number }}</span>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/lodging">Cancelar</button>
      <button class="btn-primary btn-checkout" (click)="confirm()">
        Generar Check-Out
      </button>
    </div>

  </div>
  `
})
export class CheckoutFormComponent implements OnInit {
  stay?: Stay;
  errorMsg = '';

  form = {
    checkOutDate:       new Date().toISOString().slice(0, 10),
    checkOutTime:       new Date().toTimeString().slice(0, 5),
    additionalCharges:  0,
    paymentMethod:      '',
    observations:       ''
  };

  get totalFinal(): number {
    return (this.stay?.totalAmount ?? 0) + (this.form.additionalCharges || 0);
  }

  constructor(private svc: StayService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.stay = this.svc.getById(id);
  }

  confirm(): void {
    if (!this.form.checkOutDate || !this.form.checkOutTime || !this.form.paymentMethod) {
      this.errorMsg = 'Por favor completa todos los campos obligatorios.';
      return;
    }
    this.svc.checkOut(
      this.stay!.id,
      this.form.checkOutDate,
      this.form.checkOutTime,
      this.form.paymentMethod,
      this.form.additionalCharges
    );
    this.router.navigate(['/dashboard/lodging', this.stay!.id, 'checkout-confirm']);
  }
}
