import { RatesService } from '../../lodging/rates.service';
import { SEASON_LABEL, rateTypeOf } from '../../lodging/rates.model';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReservationService } from '../reservation.service';
import {
  Reservation, ReservationType, LodgingType, ReservationStatus, PaymentMethod, PaymentStatus, isVoid, CHANNELS, splitFullName
} from '../reservation.model';
import { fmtDate, fmtMoney, paymentBadge } from '../reservation-format';
import { RoomService } from '../../lodging/room.service';
import { SettingsService } from '../../settings/settings.service';
import { isoDate, isoDateTime } from '../../shared/date-utils';

/** Quita espacios de más: "  maría   fernanda " → "maría fernanda". */
const clean = (v?: string) => (v ?? '').trim().replace(/\s+/g, ' ');

/** Día siguiente a una fecha YYYY-MM-DD. */
const nextDay = (iso: string) => { const d = new Date(`${iso}T12:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
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
      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="firstName">Nombres *</label>
          <input id="firstName" type="text" class="rsv-input" [(ngModel)]="d.firstName" maxlength="60" placeholder="Ej.: María Fernanda" autocomplete="given-name">
        </div>
        <div class="rsv-field">
          <label for="lastName">Apellidos *</label>
          <input id="lastName" type="text" class="rsv-input" [(ngModel)]="d.lastName" maxlength="60" placeholder="Ej.: López Ramírez" autocomplete="family-name">
        </div>
      </div>
      <p class="rsv-form-hint" *ngIf="splitSuggested">Esta reserva tenía el nombre completo en un solo campo: revisa que nombres y apellidos hayan quedado bien separados.</p>
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
          <label for="channel">Canal</label>
          <select id="channel" class="rsv-input" [(ngModel)]="d.channel">
            <option *ngFor="let o of channels">{{ o }}</option>
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
                      [class.active]="d.rooms.includes(room.number)" [class.busy]="!!busyBy(room.number)"
                      [disabled]="!!busyBy(room.number) && !d.rooms.includes(room.number)" (click)="toggleRoom(room.number)"
                      [title]="busyBy(room.number) ? 'Ocupada por ' + busyBy(room.number)!.code : ''">
                {{ room.number }}
                <small *ngIf="busyBy(room.number) as b; else free">Ocupada · {{ b.code }}</small>
                <ng-template #free><small>{{ room.capacity }} pers. · {{ money(room.pricePerNight) }}/noche</small></ng-template>
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
      <p class="rsv-form-warn" *ngIf="d.lodgingType !== 'Habitación' && busyRooms.length">
        No disponible en esas fechas: {{ busyRooms.join(' · ') }}.
      </p>
      <p class="rsv-form-hint" *ngIf="!datesSet">Elige las fechas de entrada y salida para ver qué habitaciones están libres.</p>

      <div class="rsv-form-row">
        <div class="rsv-field">
          <label for="checkIn">Fecha de entrada *</label>
          <input id="checkIn" type="date" class="rsv-input" [(ngModel)]="d.checkIn" [min]="isEdit ? '' : today" (ngModelChange)="calcNights()">
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
          <small class="rsv-form-hint" *ngIf="suggestedAmount && +d.lodgingAmount !== suggestedAmount">
            Tarifa {{ quote.label }} · temporada {{ quote.season }} ({{ quote.reason.toLowerCase() }}): {{ money(quote.perNight) }} {{ quote.perDay ? 'por día' : '× ' + quote.units + ' noche' + (quote.units === 1 ? '' : 's') }} = {{ money(suggestedAmount) }}
            <button type="button" (click)="d.lodgingAmount = suggestedAmount">Usar</button>
          </small>
          <small class="rsv-form-hint" *ngIf="total > 0 && policies.depositPct">
            Abono para confirmar ({{ policies.depositPct }} %): {{ money(depositDue) }} · check-in {{ policies.checkIn }} · check-out {{ policies.checkOut }}
          </small>
        </div>
        <div class="rsv-field">
          <label for="extrasAmount">Servicios adicionales (COP)</label>
          <input id="extrasAmount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="d.extrasAmount">
        </div>
        <div class="rsv-field">
          <label>Estado de la reserva</label>
          <span class="rsv-badge" [ngClass]="autoStatus === 'Confirmada' ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ autoStatus }}</span>
          <small class="rsv-form-hint">{{ statusReason }}</small>
          <label class="rsv-consent rsv-consent--inline" *ngIf="d.status !== 'Confirmada' && autoStatus !== 'Confirmada' || confirmWithoutDeposit">
            <input type="checkbox" [(ngModel)]="confirmWithoutDeposit"> Confirmar sin el abono
          </label>
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

      <label class="rsv-consent" *ngIf="askConsent">
        <input type="checkbox" [(ngModel)]="consent">
        El huésped autorizó el tratamiento de sus datos personales (Ley 1581 de 2012) *
      </label>

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
    <button type="button" class="rsv-btn rsv-btn--primary" (click)="save()" [disabled]="saving">
      {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar reserva' }}
    </button>
  </div>
  `
})
export class ReservationFormComponent implements OnInit {

  readonly docTypes = ['Cédula de Ciudadanía', 'Cédula de Extranjería', 'Pasaporte', 'Tarjeta de Identidad'];
  readonly channels = CHANNELS;
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
  splitSuggested = false;
  id = '';
  code = '';
  errorMsg = '';
  saving = false;
  catalog: Room[] = [];
  floors: number[] = [];

  d: Draft = {
    guestName: '', firstName: '', lastName: '', docType: 'Cédula de Ciudadanía', docNumber: '', phone: '', email: '', city: '',
    reservationType: 'Individual', channel: 'Directo', lodgingType: 'Habitación', rooms: [],
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
    private route: ActivatedRoute,
    private settings: SettingsService,
    public rates: RatesService,
  ) {}

  ngOnInit(): void {
    this.rates.ready();
    this.catalog = this.roomSvc.getSnapshot();
    this.floors = [...new Set(this.catalog.map(r => r.floor))].sort();

    const id = this.route.snapshot.paramMap.get('id');
    const found = id ? this.svc.getById(id) : undefined;
    if (found) {
      const { id: _id, code, createdAt, updatedAt, ...rest } = found;
      this.d = { ...rest, rooms: [...rest.rooms] };
      // Reservas guardadas con el nombre completo en un solo campo: se sugiere la separación
      if (!this.d.lastName?.trim()) {
        [this.d.firstName, this.d.lastName] = splitFullName(this.d.guestName);
        this.splitSuggested = !!this.d.lastName;
      }
      this.isEdit = true;
      this.id = found.id;
      this.code = code;
      return;
    }

    // Desde Alojamiento: ?habitacion=102 o ?casa=1 preseleccionan el alojamiento
    const query = this.route.snapshot.queryParamMap;
    const room = query.get('habitacion');
    if (query.get('casa')) {
      this.setLodging('Casa completa');
    } else if (room && this.catalog.some(r => r.number === room)) {
      this.d.rooms = [room];
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

  // ── Disponibilidad ──
  readonly today = isoDate(0);

  get datesSet(): boolean { return !!this.d.checkIn && !!this.d.checkOut && this.d.checkOut >= this.d.checkIn; }

  /**
   * Reserva vigente que ocupa la habitación en las fechas elegidas. La salida y la entrada del mismo
   * día no se cruzan; una pasadía ocupa su día completo. Las finalizadas, canceladas y no presentadas no ocupan.
   */
  busyBy(room: string): Reservation | undefined {
    if (!this.datesSet) return undefined;
    const end = (r: { checkIn: string; checkOut: string }) => r.checkOut > r.checkIn ? r.checkOut : nextDay(r.checkIn);
    const myEnd = end(this.d);
    return this.svc.getSnapshot().find(r =>
      r.id !== this.id && !isVoid(r) && r.status !== 'Finalizada' && r.rooms.includes(room)
      && r.checkIn < myEnd && this.d.checkIn < end(r));
  }

  /** Habitaciones ocupadas del piso o la casa elegidos: "201 (RSV-2026-00012)". */
  get busyRooms(): string[] {
    return this.d.rooms.map(n => ({ n, r: this.busyBy(n) })).filter(x => x.r).map(x => `${x.n} (${x.r!.code})`);
  }

  // ── Resumen ──
  get guestsTotal(): number { return (+this.d.adults || 0) + (+this.d.children || 0) + (+this.d.infants || 0); }
  get capacity(): number { return this.catalog.filter(r => this.d.rooms.includes(r.number)).reduce((s, r) => s + r.capacity, 0); }
  /** Suma de la tarifa base por noche de las habitaciones elegidas. */
  get ratePerNight(): number {
    return this.catalog.filter(r => this.d.rooms.includes(r.number)).reduce((s, r) => s + r.pricePerNight, 0);
  }
  /** Sugerencia (no obligatoria) para el valor del alojamiento, con la tarifa que cobra la web. */
  get suggestedAmount(): number { return this.quote.total; }
  /** Lo mismo que cobra la página web: tarifa por persona del tipo de reserva en la temporada de llegada (Alojamiento › Tarifas y temporadas). */
  get quote() {
    const pasadia = this.d.reservationType === 'Evento / Pasadía' || this.d.reservationType === 'Grupo de trabajo';
    if (!this.d.checkIn || (!pasadia && !(this.d.nights > 0)) || !this.rates.rates$.value.length) return { total: 0, perNight: 0, units: 0, perDay: false, season: '', reason: '', label: '' };
    const q = this.rates.quoteFor(this.d.reservationType, this.d.checkIn, this.d.nights, +this.d.adults || 0, +this.d.children || 0);
    return { ...q, season: SEASON_LABEL[q.season].toLowerCase(), label: this.rates.rates$.value.find(r => r.type === rateTypeOf(this.d.reservationType))?.name.toLowerCase() ?? '' };
  }
  get policies() { return this.settings.policies; }
  get askConsent(): boolean { return this.settings.audit.askConsent; }
  consent = false;
  get depositDue(): number { return Math.round(this.total * this.policies.depositPct / 100 / 1000) * 1000; }

  get total(): number { return (+this.d.lodgingAmount || 0) + (+this.d.extrasAmount || 0); }
  get paid(): number {
    return this.d.payments.reduce((s, p) => s + p.amount, 0) + (this.isEdit ? 0 : +this.firstPayment.amount || 0);
  }
  get pending(): number { return Math.max(0, this.total - this.paid); }
  /** Excepción: confirmar aunque el huésped aún no haya pagado el abono (queda en el historial de la reserva). */
  confirmWithoutDeposit = false;

  /**
   * Estado según lo registrado: «Confirmada» cuando lo pagado cubre el abono para confirmar
   * (Configuración › Alojamiento y reservas); si no, «Pendiente». Una reserva ya confirmada no vuelve a pendiente.
   */
  get autoStatus(): ReservationStatus {
    if (this.isEdit && this.d.status !== 'Pendiente') return this.d.status;
    if (this.confirmWithoutDeposit) return 'Confirmada';
    return this.policies && this.settings.policiesSaved && this.total > 0 && this.paid >= this.depositDue ? 'Confirmada' : 'Pendiente';
  }

  get statusReason(): string {
    if (this.isEdit && this.d.status !== 'Pendiente') return 'Estado actual de la reserva.';
    if (this.confirmWithoutDeposit) return 'Confirmada a mano, sin el abono.';
    if (!this.settings.policiesSaved) return 'Define el abono para confirmar en Configuración › Alojamiento y reservas.';
    if (this.total <= 0) return 'Indica el valor para calcular el abono.';
    return this.paid >= this.depositDue
      ? `Abono cubierto (${this.policies.depositPct} %: ${fmtMoney(this.depositDue)}).`
      : `Falta ${fmtMoney(this.depositDue - this.paid)} del abono (${this.policies.depositPct} %) para confirmar.`;
  }

  get pay(): PaymentStatus {
    if (this.total > 0 && this.paid >= this.total) return 'Pagado';
    return this.paid > 0 ? 'Parcial' : 'Pendiente';
  }

  // ── Guardar ──
  private validate(): string {
    const d = this.d;
    if (!d.firstName?.trim()) return 'Escribe los nombres del huésped principal.';
    if (!d.lastName?.trim()) return 'Escribe los apellidos del huésped principal.';
    if (!d.docNumber.trim() || !d.phone.trim()) return 'Completa los datos obligatorios del huésped principal.';
    if (!d.rooms.length) return 'Selecciona al menos una habitación.';
    if (!d.checkIn || !d.checkOut) return 'Indica las fechas de entrada y salida.';
    const sameDayAllowed = d.reservationType === 'Evento / Pasadía';
    if (d.checkOut < d.checkIn || (!sameDayAllowed && d.checkOut === d.checkIn)) {
      return sameDayAllowed ? 'La salida no puede ser antes de la entrada.' : 'La salida debe ser al menos un día después de la entrada.';
    }
    if ((+d.adults || 0) < 1) return 'Debe haber al menos un adulto.';
    if (this.askConsent && !this.consent && !d.dataConsentAt) return 'Falta la autorización del huésped para el tratamiento de sus datos (Configuración › Auditoría).';
    if (d.reservationType === 'Evento / Pasadía' && this.policies.dayPassMax > 0 && this.guestsTotal > this.policies.dayPassMax) return `Las pasadías admiten máximo ${this.policies.dayPassMax} personas por día.`;
    if ((+d.lodgingAmount || 0) <= 0) return 'Indica el valor del alojamiento.';
    if ((+d.extrasAmount || 0) < 0) return 'Los servicios adicionales no pueden ser negativos.';
    if (this.paid > this.total) return 'Lo pagado no puede superar el valor total de la reserva.';

    if (!this.isEdit && d.checkIn < this.today) return 'La fecha de entrada no puede estar en el pasado.';

    // Disponibilidad (el servidor vuelve a validarla al guardar, también contra las reservas de la web)
    const clash = d.rooms.map(n => ({ n, r: this.busyBy(n) })).filter(x => x.r);
    if (clash.length) {
      const first = clash[0].r!;
      const shared = clash.filter(x => x.r === first).map(x => x.n).join(', ');
      return `${shared.includes(',') ? 'Las habitaciones ' + shared + ' ya están reservadas' : 'La habitación ' + shared + ' ya está reservada'} en esas fechas (${first.code}, ${fmtDate(first.checkIn)} - ${fmtDate(first.checkOut)}).`;
    }
    return '';
  }

  save(): void {
    this.calcNights();
    this.errorMsg = this.validate();
    if (this.errorMsg) return;

    const data: Draft = {
      ...this.d,
      firstName: clean(this.d.firstName), lastName: clean(this.d.lastName),
      guestName: `${clean(this.d.firstName)} ${clean(this.d.lastName)}`,
      adults: +this.d.adults, children: +this.d.children || 0, infants: +this.d.infants || 0,
      lodgingAmount: +this.d.lodgingAmount, extrasAmount: +this.d.extrasAmount || 0,
      status: this.autoStatus,
      observations: this.confirmWithoutDeposit && this.autoStatus === 'Confirmada' && this.d.status === 'Pendiente' && !this.d.observations.includes('Confirmada sin abono')
        ? `${this.d.observations.trim()}${this.d.observations.trim() ? '\n' : ''}Confirmada sin abono (${isoDateTime().replace('T', ' ')}).` : this.d.observations,
      ...(this.askConsent && this.consent && !this.d.dataConsentAt ? { dataConsentAt: isoDateTime() } : {}),
    };

    if (this.isEdit) {
      this.svc.update(this.id, data);
      this.router.navigate(['/dashboard/reservations', this.id]);
    } else {
      // El id y el código los asigna la base de datos: se espera la respuesta para abrir la reserva
      this.saving = true;
      // La reserva y su abono inicial se guardan juntos: si el pago no se puede registrar, tampoco la reserva
      const { amount, method, receipt } = this.firstPayment;
      const first = +amount > 0 ? { amount: +amount, method, receipt: receipt.trim() } : undefined;
      this.svc.create(data, first).then(created => {
        this.router.navigate(['/dashboard/reservations', created.id]);
      }).catch(() => this.saving = false);
    }
  }
}
