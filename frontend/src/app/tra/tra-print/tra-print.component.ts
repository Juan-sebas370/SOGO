import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TraService } from '../tra.service';
import { Tra } from '../tra.model';

@Component({
  selector: 'app-tra-print',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./tra-print.component.css'],
  template: `
  <div class="res-page no-print-nav" *ngIf="t">

    <div class="res-breadcrumb no-print">
      <a routerLink="/dashboard/tra">TRA</a><span>›</span>
      <a [routerLink]="['/dashboard/tra', t.id]">{{ t.code }}</a><span>›</span>
      <span>Imprimir</span>
    </div>

    <div class="print-actions no-print">
      <h1 class="res-title">Vista previa para impresión - {{ t.code }}</h1>
      <div class="print-btns">
        <a [routerLink]="['/dashboard/tra', t.id]" class="btn-secondary">← Volver</a>
        <button class="btn-primary" (click)="doPrint()">🖨 Imprimir</button>
      </div>
    </div>

    <!-- Documento oficial -->
    <div class="tra-document">

      <!-- Encabezado del documento -->
      <div class="doc-header">
        <div class="doc-logo-wrap">
          <img src="/assets/logo2.png" alt="Logo" class="doc-logo">
        </div>
        <div class="doc-title-wrap">
          <h2 class="doc-hospedaje">HOSPEDAJE SEBASTIÁN</h2>
          <p class="doc-filandia">— FILANDIA —</p>
          <p class="doc-tra-title">Tarjeta de Registro de Alojamiento (TRA)</p>
        </div>
        <div class="doc-qr">
          <!-- QR simulado -->
          <div class="qr-placeholder">
            <div class="qr-inner">QR</div>
          </div>
          <p class="doc-code">{{ t.code }}</p>
        </div>
      </div>

      <hr class="doc-divider">

      <!-- Cuerpo en dos columnas -->
      <div class="doc-body">

        <div class="doc-col">
          <h3 class="doc-section-title">Información del Huésped</h3>
          <div class="doc-row"><span class="doc-label">Nombre:</span><span class="doc-val">{{ t.fullName }}</span></div>
          <div class="doc-row"><span class="doc-label">Documento:</span><span class="doc-val">{{ t.docType }} {{ t.docNumber }}</span></div>
          <div class="doc-row"><span class="doc-label">Nacionalidad:</span><span class="doc-val">{{ t.nationality }}</span></div>
          <div class="doc-row"><span class="doc-label">Fecha de Nacimiento:</span><span class="doc-val">{{ t.birthDate | date:'dd/MM/yyyy' }}</span></div>
          <div class="doc-row"><span class="doc-label">País de Residencia:</span><span class="doc-val">{{ t.countryOfResidence }}</span></div>
          <div class="doc-row"><span class="doc-label">Ciudad de Residencia:</span><span class="doc-val">{{ t.cityOfResidence }}</span></div>
          <div class="doc-row"><span class="doc-label">Motivo del Viaje:</span><span class="doc-val">{{ t.travelReason }}</span></div>
          <div class="doc-row"><span class="doc-label">Medio de Transporte:</span><span class="doc-val">{{ t.transport }}</span></div>
          <div class="doc-row"><span class="doc-label">Empresa / Vuelo:</span><span class="doc-val">{{ t.company || '—' }}</span></div>
        </div>

        <div class="doc-col">
          <h3 class="doc-section-title">Información del Alojamiento</h3>
          <div class="doc-row"><span class="doc-label">Código TRA:</span><span class="doc-val doc-code-val">{{ t.code }}</span></div>
          <div class="doc-row"><span class="doc-label">Reserva:</span><span class="doc-val">{{ t.reservationCode }}</span></div>
          <div class="doc-row"><span class="doc-label">Habitación:</span><span class="doc-val">{{ t.roomType }}</span></div>
          <div class="doc-row"><span class="doc-label">Fecha de Entrada:</span><span class="doc-val">{{ t.checkInDate | date:'dd/MM/yyyy' }} {{ t.checkInTime }}</span></div>
          <div class="doc-row"><span class="doc-label">Fecha de Salida:</span><span class="doc-val">{{ t.checkOutDate | date:'dd/MM/yyyy' }} {{ t.checkOutTime }}</span></div>
          <div class="doc-row"><span class="doc-label">Número de Huéspedes:</span><span class="doc-val">{{ t.guests }}</span></div>
          <div class="doc-row"><span class="doc-label">Noches:</span><span class="doc-val">{{ t.nights }}</span></div>
          <div class="doc-row"><span class="doc-label">Plan / Tarifa:</span><span class="doc-val">{{ t.plan }}</span></div>
          <div class="doc-row"><span class="doc-label">Estado:</span><span class="doc-val">{{ t.status }}</span></div>
        </div>

      </div>

      <!-- Observaciones -->
      <div class="doc-obs" *ngIf="t.observations">
        <span class="doc-label">Observaciones:</span>
        <span class="doc-val">{{ t.observations }}</span>
      </div>

      <hr class="doc-divider">

      <!-- Footer del documento -->
      <div class="doc-footer">
        <span>Generado el {{ t.generatedAt | date:'dd/MM/yyyy HH:mm' }} por {{ t.generatedBy }}</span>
        <span>Gracias por su preferencia</span>
      </div>

    </div><!-- /tra-document -->

  </div>
  `
})
export class TraPrintComponent implements OnInit {
  t?: Tra;

  constructor(private svc: TraService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.t = this.svc.getById(id);
  }

  doPrint(): void { window.print(); }
}
