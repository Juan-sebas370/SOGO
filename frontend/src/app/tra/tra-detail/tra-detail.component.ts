import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TraService } from '../tra.service';
import { Tra, TraStatus } from '../tra.model';

@Component({
  selector: 'app-tra-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./tra-detail.component.css'],
  template: `
  <div class="res-page" *ngIf="t">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/tra">TRA</a><span>›</span>
      <span>{{ t.code }} · Detalle</span>
    </div>

    <div class="detail-header">
      <h1 class="res-title">Detalle de la Tarjeta de Registro de Alojamiento (TRA)</h1>
      <span class="res-badge" [ngClass]="badgeClass(t.status)">{{ t.status }}</span>
    </div>

    <div class="detail-grid">

      <!-- Información del Huésped -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información del Huésped</h2>
        <div class="detail-row"><span class="detail-label">Nombre Completo</span>    <span class="detail-value">{{ t.fullName }}</span></div>
        <div class="detail-row"><span class="detail-label">Tipo y Número de Doc.</span><span class="detail-value">{{ t.docType }} {{ t.docNumber }}</span></div>
        <div class="detail-row"><span class="detail-label">Nacionalidad</span>        <span class="detail-value">{{ t.nationality }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Nacimiento</span> <span class="detail-value">{{ t.birthDate | date:'dd/MM/yyyy' }}</span></div>
        <div class="detail-row"><span class="detail-label">País de Residencia</span>  <span class="detail-value">{{ t.countryOfResidence }}</span></div>
        <div class="detail-row"><span class="detail-label">Ciudad de Residencia</span><span class="detail-value">{{ t.cityOfResidence }}</span></div>
        <div class="detail-row"><span class="detail-label">Motivo del Viaje</span>    <span class="detail-value">{{ t.travelReason }}</span></div>
        <div class="detail-row"><span class="detail-label">Medio de Transporte</span> <span class="detail-value">{{ t.transport }}</span></div>
        <div class="detail-row"><span class="detail-label">Empresa / Vuelo</span>     <span class="detail-value">{{ t.company || '—' }}</span></div>
      </div>

      <!-- Información del Alojamiento -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información del Alojamiento</h2>
        <div class="detail-row"><span class="detail-label">Código TRA</span>          <span class="detail-value res-code">{{ t.code }}</span></div>
        <div class="detail-row"><span class="detail-label">Reserva</span>             <span class="detail-value res-code">{{ t.reservationCode }}</span></div>
        <div class="detail-row"><span class="detail-label">Habitación</span>          <span class="detail-value">{{ t.roomType }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Entrada</span>    <span class="detail-value">{{ t.checkInDate | date:'dd/MM/yyyy' }} {{ t.checkInTime }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Salida</span>     <span class="detail-value">{{ t.checkOutDate | date:'dd/MM/yyyy' }} {{ t.checkOutTime }}</span></div>
        <div class="detail-row"><span class="detail-label">Número de Huéspedes</span> <span class="detail-value">{{ t.guests }}</span></div>
        <div class="detail-row"><span class="detail-label">Noches</span>              <span class="detail-value">{{ t.nights }}</span></div>
        <div class="detail-row"><span class="detail-label">Plan / Tarifa</span>       <span class="detail-value">{{ t.plan }}</span></div>
        <div class="detail-row"><span class="detail-label">Estado</span>              <span class="res-badge" [ngClass]="badgeClass(t.status)">{{ t.status }}</span></div>
      </div>

    </div>

    <!-- Observaciones -->
    <div class="detail-obs" *ngIf="t.observations">
      <h2 class="detail-section-title">Observaciones</h2>
      <p class="obs-text">{{ t.observations }}</p>
    </div>

    <!-- Footer info -->
    <div class="detail-footer-info">
      Generado el {{ t.generatedAt | date:'dd/MM/yyyy HH:mm' }} por {{ t.generatedBy }}
    </div>

    <!-- Acciones -->
    <div class="detail-actions">
      <button class="btn-outline" (click)="print()">🖨 Imprimir</button>
      <button class="btn-outline" (click)="download()">⬇ Descargar PDF</button>
      <button class="btn-primary" (click)="goEdit()" [disabled]="t.status==='Anulada'">✏ Editar</button>
    </div>

  </div>
  `
})
export class TraDetailComponent implements OnInit {
  t?: Tra;

  constructor(private svc: TraService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.t = this.svc.getById(id);
  }

  badgeClass(s: TraStatus): string {
    return { 'Generada':'res-badge--tra-gen','Anulada':'res-badge--tra-ann','Pendiente':'res-badge--tra-pen' }[s] ?? '';
  }

  goEdit():    void { this.router.navigate(['/dashboard/tra', this.t!.id, 'edit']); }
  print():     void { this.router.navigate(['/dashboard/tra', this.t!.id, 'print']); }
  download():  void { window.print(); }
}
