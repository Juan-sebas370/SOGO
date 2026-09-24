import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReservationService } from '../reservation.service';
import {
  Reservation, ReservationType, LodgingType, ReservationStatus, PaymentMethod, PaymentStatus, isVoid
} from '../reservation.model';
import { fmtDate, fmtMoney, paymentBadge } from '../reservation-format';
import { RoomService } from '../../lodging/room.service';
import { Room } from '../../lodging/room.model';

type Draft = Omit<Reservation, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reservation-form.component.css'],
  template: `
  <header class="rsv-header">
    <div class="rsv-header-main">
      <span class="rsv-header-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="13" x2="12" y2="18"/><line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/></svg>
      </span>
      <div>
        <span class="rsv-eyebrow">
          <a routerLink="/dashboard/reservations">Reservas</a><span aria-hidden="true">›</span>{{ isEdit ? code : 'Nueva' }}
        </span>
        <h1 class="rsv-title">{{ isEdit ? 'Editar reserva' : 'Nueva reserva' }}</h1>
        <p class="rsv-subtitle">{{ isEdit ? 'Actualiza los datos de la reserva ' + code + '.' : 'Registra una reserva para una habitación, un piso o la casa completa.' }}</p>
      </div>
    </div>
  </header>

  <div class="rsv-form-grid">
    <!-- Huésped principal -->
    <section class="rsv-panel rsv-form-card">
      <h2 class="rsv-form-title">Huésped principal</h2>
      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="docType">Tipo de documento</label>
          <select id="docType" class="rsv-input" [(ngModel)]="d.docType">
            <option *ngFor="let o of docTypes">{{ o }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label for="docNumber">Número de documento *</label>
          <input id="docNumber" type="text" class="rsv-input" [(ngModel)]="d.docNumber" placeholder="1234567890">
        </div>
      </div>
      <div class="rsv-field">
        <label for="guestName">Nombre completo *</label>
        <input id="guestName" type="text" class="rsv-input" [(ngModel)]="d.guestName" placeholder="Nombre y apellidos">
      </div>
      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="phone">Teléfono *</label>
          <input id="phone" type="text" class="rsv-input" [(ngModel)]="d.phone" placeholder="+57 300 123 4567">
        </div>
        <div class="rsv-field">
          <label for="email">Correo electrónico</label>
          <input id="email" type="email" class="rsv-input" [(ngModel)]="d.email" placeholder="correo@ejemplo.com">
        </div>
      </div>
      <div class="rsv-field">
        <label for="city">Ciudad / Departamento</label>
        <input id="city" type="text" class="rsv-input" [(ngModel)]="d.city" placeholder="Colombia - Armenia, Quindío">
      </div>
      <div class="rsv-field">
        <label for="obs">Observaciones</label>
        <textarea id="obs" rows="3" class="rsv-input" [(ngModel)]="d.observations" placeholder="Solicitudes especiales, hora de llegada..."></textarea>
      </div>
    </section>

    <!-- Detalles de la reserva -->
    <section class="rsv-panel rsv-form-card">
      <h2 class="rsv-form-title">Detalles de la reserva</h2>
      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="type">Tipo de reserva</label>
          <select id="type" class="rsv-input" [(ngModel)]="d.reservationType" (ngModelChange)="onTypeChange()">
            <option *ngFor="let o of typeOptions">{{ o }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label for="plan">Plan / tarifa</label>
          <select id="plan" class="rsv-input" [(ngModel)]="d.plan">
            <option *ngFor="let o of plans">{{ o }}</option>
          </select>
        </div>
      </div>

      <div class="rsv-field">
        <label>Tipo de alojamiento</label>
        <div class="rsv-segmented" role="radiogroup">
          <button type="button" *ngFor="let o of lodgingOptions" role="radio" [attr.aria-checked]="d.lodgingType === o"
                  [class.active]="d.lodgingType === o" (click)="setLodging(o)">{{ o }}</button>
        </div>
      </div>

      <div class="rsv-field" *ngIf="d.lodgingType === 'Habitación'">
        <label>Habitaciones *</label>
        <div class="rsv-room-floors">
          <div class="rsv-room-floor" *ngFor="let fl of floors">
            <span class="rsv-room-floor-name">Piso {{ fl }}</span>
            <div class="rsv-room-chips">
              <button type="button" *ngFor="let room of roomsOn(fl)" class="rsv-room-chip"
                      [class.active]="d.rooms.includes(room.number)" (click)="toggleRoom(room.number)">
                {{ room.number }} <small>{{ room.type }} · {{ room.capacity }}p</small>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="rsv-field" *ngIf="d.lodgingType === 'Piso'">
        <label for="floor">Piso *</label>
        <select id="floor" class="rsv-input" [(ngModel)]="d.floor" (ngModelChange)="syncRooms()">
          <option *ngFor="let fl of floors" [ngValue]="fl">Piso {{ fl }} — habitaciones {{ numbersOn(fl) }}</option>
        </select>
      </div>

      <p class="rsv-form-note" *ngIf="d.lodgingType === 'Casa completa'">
        Incluye todas las habitaciones: {{ allNumbers }}.
      </p>

      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="checkIn">Fecha de entrada *</label>
          <input id="checkIn" type="date" class="rsv-input" [(ngModel)]="d.checkIn" (ngModelChange)="calcNights()">
        </div>
        <div class="rsv-field">
          <label for="checkOut">Fecha de salida *</label>
          <input id="checkOut" type="date" class="rsv-input" [(ngModel)]="d.checkOut" [min]="d.checkIn" (ngModelChange)="calcNights()">
        </div>
      </div>

      <div class="rsv-form-row rsv-form-row--3">
        <div class="rsv-field">
          <label for="adults">Adultos *</label>
          <input id="adults" type="number" min="1" class="rsv-input" [(ngModel)]="d.adults">
        </div>
        <div class="rsv-field">
          <label for="children">Niños</label>
          <input id="children" type="number" min="0" class="rsv-input" [(ngModel)]="d.children">
        </div>
        <div class="rsv-field">
          <label for="infants">Bebés</label>
          <input id="infants" type="number" min="0" class="rsv-input" [(ngModel)]="d.infants">
        </div>
      </div>
    </section>

    <!-- Pago y estado -->
    <section class="rsv-panel rsv-form-card rsv-form-card--wide">
      <h2 class="rsv-form-title">Pago y estado</h2>
      <div class="rsv-form-row rsv-form-row--4">
        <div class="rsv-field">
          <label for="lodgingAmount">Valor alojamiento (COP) *</label>
          <input id="lodgingAmount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="d.lodgingAmount">
        </div>
        <div class="rsv-field">
          <label for="extrasAmount">Servicios adicionales (COP)</label>
          <input id="extrasAmount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="d.extrasAmount">
        </div>
        <div class="rsv-field">
          <label for="status">Estado</label>
          <select id="status" class="rsv-input" [(ngModel)]="d.status">
            <option *ngFor="let o of statusOptions">{{ o }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label>Total</label>
          <span class="rsv-form-total">{{ money(total) }}</span>
        </div>
      </div>

      <!-- Abono inicial: solo al crear. Los pagos siguientes se registran desde el detalle. -->
      <div class="rsv-form-row rsv-form-row--3" *ngIf="!isEdit">
        <div class="rsv-field">
          <label for="payAmount">Abono inicial (COP)</label>
          <input id="payAmount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="firstPayment.amount">
        </div>
        <div class="rsv-field">
          <label for="payMethod">Método de pago</label>
          <select id="payMethod" class="rsv-input" [(ngModel)]="firstPayment.method" [disabled]="!firstPayment.amount">
            <option *ngFor="let o of paymentMethods">{{ o }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label for="payReceipt">N.º de comprobante</label>
          <input id="payReceipt" type="text" class="rsv-input" [(ngModel)]="firstPayment.receipt" [disabled]="!firstPayment.amount" placeholder="1234">
        </div>
      </div>

      <div class="rsv-summary">
        <span><strong>{{ d.nights }}</strong> noche{{ d.nights === 1 ? '' : 's' }}</span>
        <span><strong>{{ guestsTotal }}</strong> huésped{{ guestsTotal === 1 ? '' : 'es' }} · capacidad {{ capacity }}</span>
        <span><strong>{{ d.rooms.length }}</strong> habitación{{ d.rooms.length === 1 ? '' : 'es' }}</span>
        <span>Pagado <strong>{{ money(paid) }}</strong></span>
        <span>Saldo <strong>{{ money(pending) }}</strong></span>
        <span class="rsv-badge" [ngClass]="paymentBadge(pay)">{{ pay }}</span>
      </div>
      <p class="rsv-form-warn" *ngIf="guestsTotal > capacity">
        La cantidad de huéspedes supera la capacidad de las habitaciones seleccionadas ({{ capacity }}).
      </p>
    </section>
  </div>

  <div class="rsv-form-error" *ngIf="errorMsg" role="alert">{{ errorMsg }}</div>

  <div class="rsv-form-footer">
    <a class="rsv-btn rsv-btn--outline" [routerLink]="isEdit ? ['/dashboard/reservations', id] : '/dashboard/reservations'">Cancelar</a>
    <button type="button" class="rsv-btn rsv-btn--primary" (click)="save()">
      {{ isEdit ? 'Guardar cambios' : 'Guardar reserva' }}
    </button>
  </div>
  `
})
export class ReservationFormComponent implements OnInit {

  readonly docTypes = ['Cédula de Ciudadanía', 'Cédula de Extranjería', 'Pasaporte', 'Tarjeta de Identidad'];
  readonly typeOptions: ReservationType[] = ['Individual', 'Grupo familiar', 'Grupo de trabajo', 'Evento / Pasadía'];
  readonly lodgingOptions: LodgingType[] = ['Habitación', 'Piso', 'Casa completa'];
  // Finalizada / Cancelada / No presentada no se asignan a mano desde aquí:
  // salen del flujo de alojamiento o de la acción "Cancelar reserva".
  readonly statusOptions: ReservationStatus[] = ['Pendiente', 'Confirmada'];
  readonly paymentMethods: PaymentMethod[] = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Tarjeta'];
  readonly plans = ['Solo alojamiento', 'Desayuno incluido', 'Media pensión', 'Todo incluido'];

  readonly money = fmtMoney;
  readonly paymentBadge = paymentBadge;

  isEdit = false;
  id = '';
  code = '';
  errorMsg = '';
  catalog: Room[] = [];
  floors: number[] = [];

  d: Draft = {
    guestName: '', docType: 'Cédula de Ciudadanía', docNumber: '', phone: '', email: '', city: '',
    reservationType: 'Individual', lodgingType: 'Habitación', rooms: [],
    adults: 1, children: 0, infants: 0,
    checkIn: '', checkOut: '', nights: 0,
    plan: 'Desayuno incluido',
    lodgingAmount: 0, extrasAmount: 0, payments: [],
    status: 'Pendiente', observations: ''
  };

  firstPayment: { amount: number; method: PaymentMethod; receipt: string } = { amount: 0, method: 'Efectivo', receipt: '' };

  constructor(
    private svc: ReservationService,
    private roomSvc: RoomService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.catalog = this.roomSvc.getSnapshot();
    this.floors = [...new Set(this.catalog.map(r => r.floor))].sort();

    const id = this.route.snapshot.paramMap.get('id');
    const found = id ? this.svc.getById(id) : undefined;
    if (found) {
      const { id: _id, code, createdAt, updatedAt, ...rest } = found;
      this.d = { ...rest, rooms: [...rest.rooms] };
      this.isEdit = true;
      this.id = found.id;
      this.code = code;
    }
  }

  // ── Alojamiento ──
  roomsOn(floor: number): Room[] { return this.catalog.filter(r => r.floor === floor); }
  numbersOn(floor: number): string { return this.roomsOn(floor).map(r => r.number).join(', '); }
  get allNumbers(): string { return this.catalog.map(r => r.number).join(', '); }

  setLodging(t: LodgingType): void {
    this.d.lodgingType = t;
    if (t === 'Piso' && !this.d.floor) this.d.floor = this.floors[0];
    if (t === 'Habitación') this.d.rooms = [];
    this.syncRooms();
  }

  /** Piso y Casa completa definen solas sus habitaciones. */
  syncRooms(): void {
    if (this.d.lodgingType === 'Piso') {
      this.d.rooms = this.roomsOn(this.d.floor!).map(r => r.number);
    } else if (this.d.lodgingType === 'Casa completa') {
      this.d.floor = undefined;
      this.d.rooms = this.catalog.map(r => r.number);
    } else {
      this.d.floor = undefined;
    }
  }

  toggleRoom(n: string): void {
    this.d.rooms = this.d.rooms.includes(n) ? this.d.rooms.filter(x => x !== n) : [...this.d.rooms, n].sort();
  }

  onTypeChange(): void {
    this.calcNights();
  }

  calcNights(): void {
    if (!this.d.checkIn || !this.d.checkOut) { this.d.nights = 0; return; }
    const diff = Math.round((Date.parse(this.d.checkOut) - Date.parse(this.d.checkIn)) / 86400000);
    this.d.nights = Math.max(0, diff);
  }

  // ── Resumen ──
  get guestsTotal(): number { return (+this.d.adults || 0) + (+this.d.children || 0) + (+this.d.infants || 0); }
  get capacity(): number { return this.catalog.filter(r => this.d.rooms.includes(r.number)).reduce((s, r) => s + r.capacity, 0); }
  get total(): number { return (+this.d.lodgingAmount || 0) + (+this.d.extrasAmount || 0); }
  get paid(): number {
    return this.d.payments.reduce((s, p) => s + p.amount, 0) + (this.isEdit ? 0 : +this.firstPayment.amount || 0);
  }
  get pending(): number { return Math.max(0, this.total - this.paid); }
  get pay(): PaymentStatus {
    if (this.total > 0 && this.paid >= this.total) return 'Pagado';
    return this.paid > 0 ? 'Parcial' : 'Pendiente';
  }

  // ── Guardar ──
  private validate(): string {
    const d = this.d;
    if (!d.guestName.trim() || !d.docNumber.trim() || !d.phone.trim()) return 'Completa los datos obligatorios del huésped principal.';
    if (!d.rooms.length) return 'Selecciona al menos una habitación.';
    if (!d.checkIn || !d.checkOut) return 'Indica las fechas de entrada y salida.';
    const sameDayAllowed = d.reservationType === 'Evento / Pasadía';
    if (d.checkOut < d.checkIn || (!sameDayAllowed && d.checkOut === d.checkIn)) {
      return sameDayAllowed ? 'La salida no puede ser antes de la entrada.' : 'La salida debe ser al menos un día después de la entrada.';
    }
    if ((+d.adults || 0) < 1) return 'Debe haber al menos un adulto.';
    if ((+d.lodgingAmount || 0) <= 0) return 'Indica el valor del alojamiento.';
    if ((+d.extrasAmount || 0) < 0) return 'Los servicios adicionales no pueden ser negativos.';
    if (this.paid > this.total) return 'Lo pagado no puede superar el valor total de la reserva.';

    // Disponibilidad: ninguna otra reserva activa puede usar las mismas habitaciones en fechas que se crucen
    const clash = this.svc.getSnapshot().find(r =>
      r.id !== this.id && !isVoid(r) && r.status !== 'Finalizada' &&
      r.rooms.some(n => d.rooms.includes(n)) &&
      r.checkIn <= d.checkOut && r.checkOut >= d.checkIn &&
      // salida y entrada el mismo día no se cruzan (salvo pasadías, que ocupan ese día completo)
      !(r.checkOut === d.checkIn && r.nights > 0) && !(d.checkOut === r.checkIn && d.nights > 0)
    );
    if (clash) {
      const shared = clash.rooms.filter(n => d.rooms.includes(n)).join(', ');
      return `Las habitaciones ${shared} ya están reservadas en esas fechas (${clash.code}, ${fmtDate(clash.checkIn)} - ${fmtDate(clash.checkOut)}).`;
    }
    return '';
  }

  save(): void {
    this.calcNights();
    this.errorMsg = this.validate();
    if (this.errorMsg) return;

    const data: Draft = {
      ...this.d,
      guestName: this.d.guestName.trim(),
      adults: +this.d.adults, children: +this.d.children || 0, infants: +this.d.infants || 0,
      lodgingAmount: +this.d.lodgingAmount, extrasAmount: +this.d.extrasAmount || 0,
    };

    if (this.isEdit) {
      this.svc.update(this.id, data);
      this.router.navigate(['/dashboard/reservations', this.id]);
    } else {
      const created = this.svc.create(data);
      const { amount, method, receipt } = this.firstPayment;
      if (+amount > 0) this.svc.addPayment(created.id, { amount: +amount, method, receipt: receipt.trim() });
      this.router.navigate(['/dashboard/reservations', created.id]);
    }
  }
}
