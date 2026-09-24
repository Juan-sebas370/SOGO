import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StayService } from '../stay.service';
import { Stay } from '../stay.model';

@Component({
  selector: 'app-checkout-confirm',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./checkout-confirm.component.css'],
  template: `
  <div class="res-page confirm-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/lodging">Alojamiento</a><span>›</span>
      <span>Check-Out · Confirmación</span>
    </div>

    <div class="confirm-card" *ngIf="stay">
      <!-- Ícono éxito -->
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
      </div>

      <h2 class="confirm-title">¡Check-Out realizado con éxito!</h2>
      <p class="confirm-desc">El huésped ha sido retirado de su estadía.</p>

      <!-- Resumen -->
      <div class="confirm-summary">
        <div class="summary-row">
          <span class="summary-label">Huésped</span>
          <span class="summary-value">{{ stay.guestName }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Total Estadía</span>
          <span class="summary-value summary-value--highlight">$ {{ stay.totalAmount | number }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Habitación</span>
          <span class="summary-value">{{ stay.roomType }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Método de Pago</span>
          <span class="summary-value">{{ stay.paymentMethod }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Fecha de Salida</span>
          <span class="summary-value">{{ stay.checkOutDate | date:'dd/MM/yyyy' }} {{ stay.checkOutTime }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Estado</span>
          <span class="res-badge res-badge--done">Finalizado</span>
        </div>
      </div>

      <!-- Acciones -->
      <div class="confirm-actions">
        <button class="btn-outline" (click)="print()">
          <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Ver Factura
        </button>
        <button class="btn-primary" routerLink="/dashboard/lodging">
          Ir a listado
        </button>
      </div>
    </div>

  </div>
  `
})
export class CheckoutConfirmComponent implements OnInit {
  stay?: Stay;

  constructor(private svc: StayService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.stay = this.svc.getById(id);
  }

  print(): void { window.print(); }
}
