import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StayService } from '../stay.service';
import { Stay } from '../stay.model';

@Component({
  selector: 'app-checkin-confirm',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./checkin-confirm.component.css'],
  template: `
  <div class="res-page confirm-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/lodging">Alojamiento</a><span>›</span>
      <span>Check-In · Confirmación</span>
    </div>

    <div class="confirm-card" *ngIf="stay">
      <!-- Ícono éxito -->
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
      </div>

      <h2 class="confirm-title">¡Check-In realizado con éxito!</h2>
      <p class="confirm-desc">El huésped ha sido registrado en la habitación.</p>

      <!-- Resumen -->
      <div class="confirm-summary">
        <div class="summary-row">
          <span class="summary-label">Huésped</span>
          <span class="summary-value">{{ stay.guestName }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Habitación</span>
          <span class="summary-value">{{ stay.roomType }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Salida Estimada</span>
          <span class="summary-value">{{ stay.estimatedCheckOut | date:'dd/MM/yyyy' }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Noches</span>
          <span class="summary-value">{{ stay.nights }}</span>
        </div>
      </div>

      <!-- Acciones -->
      <div class="confirm-actions">
        <button class="btn-outline" (click)="goDetail()">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver detalle del alojamiento
        </button>
        <button class="btn-primary" routerLink="/dashboard/lodging">
        Ir a listado
      </button>
      </div>
    </div>

  </div>
  `
})
export class CheckinConfirmComponent implements OnInit {
  stay?: Stay;

  constructor(private svc: StayService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.stay = this.svc.getById(id);
  }

  goDetail(): void { this.router.navigate(['/dashboard/lodging', this.stay!.id]); }
}
