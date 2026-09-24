import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TraService } from '../tra.service';
import { Tra } from '../tra.model';
import { ReservationService } from '../../reservations/reservation.service';
import { lodgingLabel, totalGuests } from '../../reservations/reservation.model';

@Component({
  selector: 'app-tra-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tra-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/tra">TRA</a><span>›</span>
      <span>{{ isEdit ? 'Editar TRA' : 'Nueva Tarjeta' }}</span>
    </div>

    <h1 class="res-title">{{ isEdit ? 'Editar TRA' : 'Nueva Tarjeta de Registro de Alojamiento (TRA)' }}</h1>

    <!-- Grid 3 columnas -->
    <div class="tra-form-grid">

      <!-- COLUMNA 1: Datos del Huésped -->
      <div class="form-section">
        <h2 class="form-section-title">Datos del Huésped</h2>

        <div class="form-field">
          <label>Tipo de Documento *</label>
          <select [(ngModel)]="f.docType" class="form-select">
            <option>Cédula de Ciudadanía</option>
            <option>Pasaporte</option>
            <option>Cédula Extranjera</option>
            <option>Tarjeta de Identidad</option>
          </select>
        </div>

        <div class="form-field">
          <label>Número de Documento *</label>
          <input type="text" [(ngModel)]="f.docNumber" placeholder="1234567890" class="form-input">
        </div>

        <div class="form-field">
          <label>Nombre *</label>
          <input type="text" [(ngModel)]="f.firstName" placeholder="María" class="form-input">
        </div>

        <div class="form-field">
          <label>Apellidos *</label>
          <input type="text" [(ngModel)]="f.lastName" placeholder="López García" class="form-input">
        </div>

        <div class="form-field">
          <label>Nacionalidad *</label>
          <input type="text" [(ngModel)]="f.nationality" placeholder="Colombiana" class="form-input">
        </div>

        <div class="form-field">
          <label>Fecha de Nacimiento</label>
          <input type="date" [(ngModel)]="f.birthDate" class="form-input">
        </div>

        <div class="form-field">
          <label>País de Residencia</label>
          <input type="text" [(ngModel)]="f.countryOfResidence" placeholder="Colombia" class="form-input">
        </div>

        <div class="form-field">
          <label>Ciudad de Residencia</label>
          <input type="text" [(ngModel)]="f.cityOfResidence" placeholder="Armenia" class="form-input">
        </div>
      </div>

      <!-- COLUMNA 2: Datos del Alojamiento -->
      <div class="form-section">
        <h2 class="form-section-title">Datos del Alojamiento</h2>

        <div class="form-field">
          <label>Reserva</label>
          <input type="text" [(ngModel)]="f.reservationCode" placeholder="RSV-2026-00125" class="form-input">
        </div>

        <div class="form-field">
          <label>Habitación *</label>
          <select [(ngModel)]="f.roomType" (ngModelChange)="syncRoom()" class="form-select">
            <option>102 - Doble Estándar</option>
            <option>104 - Doble Estándar</option>
            <option>105 - Simple</option>
            <option>106 - Simple</option>
            <option>201 - Doble Estándar</option>
            <option>203 - Suite</option>
            <option>301 - Suite</option>
          </select>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Fecha de Entrada *</label>
            <input type="date" [(ngModel)]="f.checkInDate" class="form-input">
          </div>
          <div class="form-field">
            <label>Hora de Entrada</label>
            <input type="time" [(ngModel)]="f.checkInTime" class="form-input">
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Fecha de Salida *</label>
            <input type="date" [(ngModel)]="f.checkOutDate" (ngModelChange)="calcNights()" class="form-input">
          </div>
          <div class="form-field">
            <label>Hora de Salida</label>
            <input type="time" [(ngModel)]="f.checkOutTime" class="form-input">
          </div>
        </div>

        <div class="form-field">
          <label>Número de Huéspedes</label>
          <input type="number" [(ngModel)]="f.guests" min="1" class="form-input">
        </div>

        <div class="form-field">
          <label>Noches</label>
          <input type="number" [(ngModel)]="f.nights" min="1" class="form-input" readonly>
        </div>

        <div class="form-field">
          <label>Plan / Tarifa</label>
          <select [(ngModel)]="f.plan" class="form-select">
            <option>Solo alojamiento</option>
            <option>Desayuno incluido</option>
            <option>Media pensión</option>
            <option>Todo incluido</option>
          </select>
        </div>
      </div>

      <!-- COLUMNA 3: Datos Adicionales -->
      <div class="form-section">
        <h2 class="form-section-title">Datos Adicionales</h2>

        <div class="form-field">
          <label>Motivo del Viaje *</label>
          <select [(ngModel)]="f.travelReason" class="form-select">
            <option>Turismo</option>
            <option>Negocios</option>
            <option>Salud</option>
            <option>Educación</option>
            <option>Familiar</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="form-field">
          <label>País de Residencia</label>
          <select [(ngModel)]="f.residenceCountry" class="form-select">
            <option>Colombia</option>
            <option>México</option>
            <option>Argentina</option>
            <option>Venezuela</option>
            <option>Ecuador</option>
            <option>Perú</option>
            <option>Estados Unidos</option>
            <option>España</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="form-field">
          <label>Número de Huéspedes</label>
          <input type="number" [(ngModel)]="f.guests" min="1" class="form-input">
        </div>

        <div class="form-field">
          <label>Noches</label>
          <input type="number" [(ngModel)]="f.nights" min="1" class="form-input">
        </div>

        <div class="form-field">
          <label>Medio de Transporte</label>
          <select [(ngModel)]="f.transport" class="form-select">
            <option>Aéreo</option>
            <option>Terrestre</option>
            <option>Marítimo</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="form-field">
          <label>Empresa / Vuelo</label>
          <input type="text" [(ngModel)]="f.company" placeholder="AV123" class="form-input">
        </div>

        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" placeholder="Llegada en la tarde..." class="form-textarea"></textarea>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/tra">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Generar TRA' }}
      </button>
    </div>

  </div>
  `
})
export class TraFormComponent implements OnInit {

  isEdit = false;
  errorMsg = '';
  existingId = '';

  f: Partial<Tra> = {
    docType: 'Cédula de Ciudadanía', docNumber: '',
    firstName: '', lastName: '', fullName: '',
    nationality: 'Colombiana', birthDate: '',
    countryOfResidence: 'Colombia', cityOfResidence: '',
    reservationCode: '', roomType: '102 - Doble Estándar', roomNumber: '102',
    checkInDate: new Date().toISOString().slice(0,10), checkInTime: '',
    checkOutDate: '', checkOutTime: '',
    nights: 1, guests: 1,
    plan: 'Desayuno incluido',
    travelReason: 'Turismo', residenceCountry: 'Colombia',
    transport: 'Aéreo', company: '', age: '',
    travelPurpose: 'Turismo',
    status: 'Generada', observations: '',
    generatedBy: 'Administrador'
  };

  constructor(
    private svc: TraService,
    private reservations: ReservationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getById(id);
      if (found) { this.f = { ...found }; this.isEdit = true; this.existingId = id; }
      return;
    }
    // Llegando desde el detalle de una reserva (?reserva=RSV-...): se precargan sus datos
    const code = this.route.snapshot.queryParamMap.get('reserva');
    const r = code ? this.reservations.getSnapshot().find(x => x.code === code) : undefined;
    if (r) {
      const [firstName, ...rest] = r.guestName.split(' ');
      this.f = {
        ...this.f,
        reservationCode: r.code, fullName: r.guestName, firstName, lastName: rest.join(' '),
        docType: r.docType, docNumber: r.docNumber,
        roomNumber: r.rooms.join(', '), roomType: lodgingLabel(r),
        checkInDate: r.checkIn, checkOutDate: r.checkOut, nights: r.nights,
        guests: totalGuests(r), plan: r.plan,
      };
    }
  }

  syncRoom(): void {
    this.f.roomNumber = (this.f.roomType ?? '').split(' - ')[0];
  }

  calcNights(): void {
    if (this.f.checkInDate && this.f.checkOutDate) {
      const d1 = new Date(this.f.checkInDate);
      const d2 = new Date(this.f.checkOutDate);
      const diff = Math.ceil((d2.getTime() - d1.getTime()) / 86400000);
      this.f.nights = diff > 0 ? diff : 1;
    }
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.docNumber || !this.f.firstName || !this.f.lastName || !this.f.checkInDate) {
      this.errorMsg = 'Por favor completa todos los campos obligatorios.';
      return;
    }
    this.f.fullName = `${this.f.firstName} ${this.f.lastName}`;
    if (this.isEdit) {
      this.svc.update(this.existingId, this.f as Tra);
    } else {
      this.svc.create(this.f as Omit<Tra, 'id'|'code'|'generatedAt'>);
    }
    this.router.navigate(['/dashboard/tra']);
  }
}
