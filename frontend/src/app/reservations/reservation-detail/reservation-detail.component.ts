import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReservationService } from '../reservation.service';
import {
  Reservation, ReservationStatus, PaymentMethod, PaymentStatus,
  paymentStatus, totalGuests, lodgingLabel, totalAmount, paidAmount, balance, lastPayment, isVoid
} from '../reservation.model';
import { fmtDate, fmtDateTime, fmtMoney, statusBadge, paymentBadge } from '../reservation-format';
import { openConfirmation, openPaymentReceipt, guestMailto, downloadCsv } from '../reservation-documents';
import { RoomService } from '../../lodging/room.service';
import { Room } from '../../lodging/room.model';
import { Tra } from '../../tra/tra.model';
import { isoDate } from '../../shared/date-utils';

const STATUS_TEXT: Record<ReservationStatus, string> = {
  'Confirmada':    'La reserva está confirmada y activa.',
  'Pendiente':     'La reserva está pendiente de confirmación.',
  'Finalizada':    'La estadía terminó y la reserva quedó cerrada.',
  'Cancelada':     'La reserva fue cancelada.',
  'No presentada': 'El huésped no se presentó en la fecha de entrada.',
};

// Color del círculo de estado en la barra lateral
const STATUS_TONE: Record<ReservationStatus, string> = {
  'Confirmada': 'ok', 'Pendiente': 'warn', 'Finalizada': 'muted', 'Cancelada': 'danger', 'No presentada': 'danger',
};
const PAYMENT_TONE: Record<PaymentStatus, string> = { 'Pagado': 'ok', 'Parcial': 'partial', 'Pendiente': 'warn' };

@Component({
  selector: 'app-reservation-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reservation-detail.component.css'],
  template: `
  <div class="rd-layout" *ngIf="r; else notFound">

    <!-- ═════════════ Columna principal ═════════════ -->
    <div class="rd-main">
      <a routerLink="/dashboard/reservations" class="rd-back">
        <svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
        Volver a reservas
      </a>

      <header class="rd-head">
        <div>
          <h1 class="rd-title">Detalle de Reserva</h1>
          <div class="rd-code">
            {{ r.code }}
            <span class="rsv-badge rsv-badge--pill" [ngClass]="statusBadge(r.status)">{{ r.status }}</span>
          </div>
        </div>
        <div class="rd-head-meta">
          <span>
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Creada el {{ dateTime(r.createdAt) }}
          </span>
          <span>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            Última actualización: {{ dateTime(r.updatedAt) }}
          </span>
          <div class="rd-more" data-popover>
            <button type="button" class="rd-more-btn" (click)="moreOpen = !moreOpen" aria-label="Más opciones" [attr.aria-expanded]="moreOpen">
              <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
            </button>
            <div class="rd-popover" *ngIf="moreOpen">
              <button type="button" *ngIf="r.status === 'Pendiente'" (click)="setStatus('Confirmada')">Confirmar reserva</button>
              <button type="button" *ngIf="canFinish" (click)="setStatus('Finalizada')">Marcar como finalizada</button>
              <button type="button" *ngIf="canNoShow" (click)="setStatus('No presentada')">Marcar como no presentada</button>
              <button type="button" (click)="copyCode()">{{ copied ? 'Código copiado ✓' : 'Copiar código' }}</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Resumen -->
      <section class="rd-card rd-summary">
        <div class="rd-sum-item">
          <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="12" cy="5" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M3 20v-6a3 3 0 0 1 6 0M9 20v-7a3 3 0 0 1 6 0v7M15 20v-6a3 3 0 0 1 6 0v6"/></svg>
          <div><span>Tipo de reserva</span><strong>{{ r.reservationType }}</strong></div>
        </div>
        <div class="rd-sum-item">
          <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
          <div><span>Alojamiento</span><strong class="rd-sum-sm">{{ lodging(r) }}</strong></div>
        </div>
        <div class="rd-sum-item">
          <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div><span>Huéspedes</span><strong>{{ guests(r) }} persona{{ guests(r) === 1 ? '' : 's' }}</strong></div>
        </div>
        <div class="rd-sum-item">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <span>Entrada - Salida</span>
            <strong class="rd-sum-sm">{{ date(r.checkIn) }} - {{ date(r.checkOut) }}</strong>
            <small>{{ nightsText }}</small>
          </div>
        </div>
        <div class="rd-sum-item">
          <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
          <div>
            <span>Estado de pago</span>
            <span class="rsv-badge rsv-badge--pill rd-sum-badge" [ngClass]="paymentBadge(pay)">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>{{ pay }}
            </span>
          </div>
        </div>
      </section>

      <div class="rd-grid">
        <!-- Información de la reserva -->
        <section class="rd-card">
          <h2 class="rd-card-title">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Información de la reserva
          </h2>
          <div class="rd-card-body rd-cols">
            <dl class="rd-fields">
              <div><dt>Código de reserva</dt><dd>{{ r.code }}</dd></div>
              <div><dt>Tipo de reserva</dt><dd>{{ r.reservationType }}</dd></div>
              <div><dt>Fecha de creación</dt><dd>{{ dateTime(r.createdAt) }}</dd></div>
              <div><dt>Estado</dt><dd><span class="rsv-badge rsv-badge--pill" [ngClass]="statusBadge(r.status)">{{ r.status }}</span></dd></div>
            </dl>
            <dl class="rd-fields">
              <div><dt>Alojamiento</dt><dd>{{ lodging(r) }}</dd></div>
              <div><dt>Habitaciones</dt><dd>{{ r.rooms.join(', ') }}</dd></div>
              <div><dt>Fecha de entrada</dt><dd>{{ date(r.checkIn) }}</dd></div>
              <div><dt>Fecha de salida</dt><dd>{{ date(r.checkOut) }}</dd></div>
            </dl>
          </div>
        </section>

        <!-- Información del cliente -->
        <section class="rd-card">
          <h2 class="rd-card-title">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Información del cliente
          </h2>
          <div class="rd-card-body">
            <dl class="rd-fields">
              <div><dt>Nombre</dt><dd>{{ r.guestName }}</dd></div>
              <div><dt>{{ r.docType }}</dt><dd>{{ docNumber(r.docNumber) }}</dd></div>
              <div><dt>Correo electrónico</dt><dd>{{ r.email || '—' }}</dd></div>
              <div><dt>Teléfono</dt><dd>{{ r.phone }}</dd></div>
              <div><dt>Ciudad / Departamento</dt><dd>{{ r.city || '—' }}</dd></div>
            </dl>
          </div>
        </section>

        <!-- Información del alojamiento -->
        <section class="rd-card">
          <h2 class="rd-card-title">
            <svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>
            Información del alojamiento
          </h2>
          <div class="rd-card-body rd-lodging">
            <div class="rd-lodging-main">
              <img src="assets/casa.jpg" alt="" class="rd-lodging-img">
              <div>
                <strong class="rd-lodging-name">{{ lodging(r) }}</strong>
                <p><span>Capacidad máxima:</span> {{ capacity }} personas</p>
                <p><span>Habitaciones:</span> {{ r.rooms.join(', ') }}</p>
                <p><span>Plan / tarifa:</span> {{ r.plan }}</p>
              </div>
            </div>
            <div class="rd-rooms">
              <div class="rd-rooms-head">Distribución de habitaciones</div>
              <div class="rd-rooms-row" *ngFor="let room of rooms">
                <strong>{{ room.number }}</strong>
                <span>{{ room.type }} · {{ room.capacity }} persona{{ room.capacity === 1 ? '' : 's' }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Detalle de pago -->
        <section class="rd-card">
          <h2 class="rd-card-title">
            <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
            Detalle de pago
          </h2>
          <div class="rd-card-body rd-pay">
            <div class="rd-pay-main">
              <div class="rd-pay-top">
                <div class="rd-pay-method">
                  <span class="rd-pay-method-icon">
                    <svg viewBox="0 0 24 24"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16" cy="14" r="1.5"/></svg>
                  </span>
                  <div><span>Método de pago</span><strong>{{ last?.method || '—' }}</strong></div>
                </div>
                <div><span>N° de comprobante</span><strong>{{ last?.receipt || '—' }}</strong></div>
              </div>
              <small class="rd-pay-count" *ngIf="r.payments.length > 1">{{ r.payments.length }} pagos registrados · se muestra el último</small>
              <div class="rd-pay-line"><span>Alojamiento ({{ nightsText }})</span><span>{{ money(r.lodgingAmount) }}</span></div>
              <div class="rd-pay-line"><span>Servicios adicionales</span><span>{{ money(r.extrasAmount) }}</span></div>
              <div class="rd-pay-line rd-pay-total"><span>Total</span><span>{{ money(total) }}</span></div>
              <div class="rd-pay-paid" [class.rd-pay-paid--partial]="pay !== 'Pagado'">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
                <span>{{ pay === 'Pagado' ? 'Precio pagado por el cliente' : 'Pagado hasta ahora' }}</span>
                <strong>{{ money(paid) }}</strong>
              </div>
            </div>
            <dl class="rd-fields rd-pay-side">
              <div><dt>Estado de pago</dt><dd><span class="rsv-badge rsv-badge--pill rd-sum-badge" [ngClass]="paymentBadge(pay)">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>{{ pay }}</span></dd></div>
              <div><dt>Valor pendiente</dt><dd>{{ money(pending) }}</dd></div>
              <div><dt>Fecha de pago</dt><dd>{{ last ? dateTime(last.date) : '—' }}</dd></div>
            </dl>
          </div>
        </section>
      </div>

      <!-- Información del TRA -->
      <section class="rd-card">
        <h2 class="rd-card-title">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Información del TRA
        </h2>
        <div class="rd-card-body rd-tra" *ngIf="tra; else noTra">
          <div><span>Código TRA</span><strong>{{ tra.code }}</strong></div>
          <div><span>Estado</span>
            <span class="rsv-badge rsv-badge--pill rd-sum-badge" [ngClass]="tra.status === 'Generada' ? 'rsv-badge--ok' : 'rsv-badge--warn'">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>{{ tra.status === 'Generada' ? 'Registrado' : tra.status }}
            </span>
          </div>
          <div><span>Fecha de registro</span><strong>{{ dateTime(tra.generatedAt) }}</strong></div>
          <div><span>Fecha de salida</span><strong>{{ date(tra.checkOutDate) }}</strong></div>
          <div><span>No. de documento</span><strong>{{ docNumber(tra.docNumber) }}</strong></div>
          <a class="rd-tra-link" [routerLink]="['/dashboard/tra', tra.id]">
            <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span><strong>Ver más información del TRA</strong>Consulta todos los detalles, movimientos y documentos en el módulo de TRA.</span>
            <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </a>
        </div>
        <ng-template #noTra>
          <div class="rd-card-body rd-tra-empty">
            <p *ngIf="traStatus === 'Pendiente'">Esta reserva aún no tiene un TRA registrado.</p>
            <p *ngIf="traStatus === 'No aplica'">Esta reserva no requiere TRA ({{ r.reservationType === 'Evento / Pasadía' ? 'pasadía sin pernoctación' : 'reserva ' + r.status.toLowerCase() }}).</p>
            <a class="rd-tra-link" *ngIf="traStatus === 'Pendiente'" routerLink="/dashboard/tra/new" [queryParams]="{ reserva: r.code }">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span><strong>Registrar TRA</strong>Se abrirá el formulario con los datos de esta reserva.</span>
              <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </a>
          </div>
        </ng-template>
      </section>

      <div class="rd-grid rd-grid--bottom">
        <!-- Documentos asociados -->
        <section class="rd-card">
          <h2 class="rd-card-title rd-card-title--plain">
            <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            Documentos asociados
          </h2>
          <ul class="rd-docs">
            <li>
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="rd-doc-name">Reserva / Confirmación (PDF)</span>
              <span class="rd-doc-date">{{ dateTime(r.createdAt) }}</span>
              <button type="button" class="rd-doc-btn" (click)="openConfirmation(r)">Ver</button>
            </li>
            <li *ngIf="tra">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="rd-doc-name">Comprobante de envío TRA (PDF)</span>
              <span class="rd-doc-date">{{ dateTime(tra.generatedAt) }}</span>
              <a class="rd-doc-btn" [routerLink]="['/dashboard/tra', tra.id, 'print']">Ver</a>
            </li>
          </ul>
        </section>

        <!-- Detalles o anotaciones -->
        <section class="rd-card">
          <h2 class="rd-card-title rd-card-title--plain">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Detalles o anotaciones
          </h2>
          <div class="rd-card-body rd-notes">
            <textarea [(ngModel)]="notes" maxlength="500" rows="4"
                      placeholder="Ejemplo: El cliente solicitó una cama adicional. Se presentó una novedad con el check-in, pero se resolvió al momento."></textarea>
            <div class="rd-notes-foot">
              <button type="button" class="rd-notes-save" *ngIf="notesDirty" (click)="saveNotes()">Guardar anotación</button>
              <span class="rd-notes-saved" *ngIf="notesSaved && !notesDirty">Guardado ✓</span>
              <span class="rd-notes-count">{{ notes.length }}/500</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- ═════════════ Barra lateral ═════════════ -->
    <aside class="rd-aside">
      <section class="rd-card rd-state">
        <div class="rd-state-block">
          <span class="rd-state-icon" [ngClass]="'rd-tone--' + statusTone">
            <svg viewBox="0 0 24 24"><path [attr.d]="statusTone === 'danger' ? 'M18 6L6 18M6 6l12 12' : 'M20 6L9 17l-5-5'"/></svg>
          </span>
          <div>
            <span class="rd-state-title">Estado de la reserva</span>
            <span class="rd-state-value" [ngClass]="'rd-tone-text--' + statusTone">{{ r.status }}</span>
            <p>{{ statusText }}</p>
          </div>
        </div>
        <div class="rd-state-block">
          <span class="rd-state-icon" [ngClass]="'rd-tone--' + payTone">
            <svg viewBox="0 0 24 24"><path [attr.d]="pay === 'Pagado' ? 'M20 6L9 17l-5-5' : 'M12 7v5l3 2'"/></svg>
          </span>
          <div>
            <span class="rd-state-title">Estado del pago</span>
            <span class="rd-state-value" [ngClass]="'rd-tone-text--' + payTone">{{ pay }}</span>
            <p>{{ payText }}</p>
          </div>
        </div>
      </section>

      <section class="rd-card rd-side-card">
        <h3 class="rd-side-title">Acciones rápidas</h3>
        <div class="rd-actions">
          <button type="button" class="rd-action rd-action--primary" (click)="openPaymentReceipt(r)">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Generar comprobante
          </button>
          <a class="rd-action rd-action--blue" [class.disabled]="!editable" [routerLink]="editable ? ['/dashboard/reservations', r.id, 'edit'] : null"
             [attr.aria-disabled]="!editable" [title]="editable ? '' : 'Solo se editan reservas confirmadas o pendientes'">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Editar reserva
          </a>
          <button type="button" class="rd-action rd-action--red" [disabled]="!editable" (click)="showCancel = true; cancelReason = ''">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            Cancelar reserva
          </button>
          <button type="button" class="rd-action rd-action--green" [disabled]="!canPay" (click)="openPayment()"
                  [title]="canPay ? '' : (pending ? 'La reserva no admite pagos' : 'No hay saldo pendiente')">
            <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Registrar pago
          </button>
          <a class="rd-action rd-action--purple" routerLink="/dashboard/reports/generator">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
            Generar reporte
          </a>
          <a class="rd-action rd-action--blue" [class.disabled]="traStatus === 'No aplica'"
             [routerLink]="traStatus === 'No aplica' ? null : (tra ? ['/dashboard/tra', tra.id] : '/dashboard/tra/new')"
             [queryParams]="tra ? null : { reserva: r.code }" [attr.aria-disabled]="traStatus === 'No aplica'">
            <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            {{ tra ? 'Ver / gestionar TRA' : 'Registrar TRA' }}
          </a>
        </div>
      </section>

      <section class="rd-card rd-side-card">
        <h3 class="rd-side-title">Opciones adicionales</h3>
        <div class="rd-options">
          <button type="button" (click)="openConfirmation(r, true)">
            <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir planilla de reserva
            <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <a [attr.href]="r.email ? mailto : null" [class.disabled]="!r.email">
            <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
            Enviar por correo al huésped
            <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </a>
          <button type="button" (click)="openConfirmation(r, true)" title="Elige “Guardar como PDF” en el diálogo de impresión">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6M9 15l3 3 3-3"/></svg>
            Descargar PDF
            <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button type="button" (click)="exportExcel()">
            <svg class="rd-excel" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/></svg>
            Exportar Excel
            <svg class="rd-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </section>

      <p class="rd-note">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        La información del TRA se basa en los datos registrados en la reserva y puede variar según el proceso de migración o la normativa vigente.
      </p>
    </aside>

    <!-- Modal: registrar pago -->
    <div class="rsv-modal-overlay" *ngIf="showPayment" (click)="showPayment = false">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h3 class="rsv-modal-title">Registrar pago</h3>
        <p class="rsv-modal-desc">Saldo pendiente de <strong>{{ r.code }}</strong>: {{ money(pending) }}</p>
        <div class="rsv-field">
          <label for="pay-amount">Valor (COP)</label>
          <input id="pay-amount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="payment.amount">
        </div>
        <div class="rsv-field">
          <label for="pay-method">Método de pago</label>
          <select id="pay-method" class="rsv-input" [(ngModel)]="payment.method">
            <option *ngFor="let m of paymentMethods">{{ m }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label for="pay-receipt">N.º de comprobante</label>
          <input id="pay-receipt" type="text" class="rsv-input" [(ngModel)]="payment.receipt" placeholder="1234">
        </div>
        <p class="rd-modal-error" *ngIf="paymentError">{{ paymentError }}</p>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="showPayment = false">Cancelar</button>
          <button type="button" class="rsv-btn rsv-btn--primary" (click)="savePayment()">Registrar pago</button>
        </div>
      </div>
    </div>

    <!-- Modal: cancelar reserva -->
    <div class="rsv-modal-overlay" *ngIf="showCancel" (click)="showCancel = false">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="rsv-modal-icon">
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h3 class="rsv-modal-title">Cancelar reserva</h3>
        <p class="rsv-modal-desc">¿Seguro que deseas cancelar la reserva <strong>{{ r.code }}</strong> de {{ r.guestName }}?</p>
        <div class="rsv-field">
          <label for="cancel-reason">Motivo de cancelación</label>
          <select id="cancel-reason" class="rsv-input" [(ngModel)]="cancelReason">
            <option value="">Seleccionar motivo...</option>
            <option *ngFor="let m of cancelReasons">{{ m }}</option>
          </select>
        </div>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="showCancel = false">No, volver</button>
          <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="!cancelReason" (click)="confirmCancel()">Sí, cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <ng-template #notFound>
    <section class="rd-card rd-not-found">
      <p>No encontramos esta reserva.</p>
      <a routerLink="/dashboard/reservations" class="rsv-btn rsv-btn--outline">Volver a reservas</a>
    </section>
  </ng-template>
  `
})
export class ReservationDetailComponent {

  readonly cancelReasons = ['Cambio de planes del huésped', 'Solicitud del huésped', 'Error en la reserva', 'Otro'];
  readonly paymentMethods: PaymentMethod[] = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Tarjeta'];

  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly money = fmtMoney;
  readonly statusBadge = statusBadge;
  readonly paymentBadge = paymentBadge;
  readonly guests = totalGuests;
  readonly lodging = lodgingLabel;
  readonly openConfirmation = openConfirmation;
  readonly openPaymentReceipt = openPaymentReceipt;

  r?: Reservation;
  tra?: Tra;
  rooms: Room[] = [];

  moreOpen = false;
  copied = false;

  notes = '';
  notesSaved = false;

  showCancel = false;
  cancelReason = '';

  showPayment = false;
  payment: { amount: number; method: PaymentMethod; receipt: string } = { amount: 0, method: 'Efectivo', receipt: '' };
  paymentError = '';

  constructor(
    private svc: ReservationService,
    private roomSvc: RoomService,
    private host: ElementRef<HTMLElement>,
    route: ActivatedRoute
  ) {
    const id = route.snapshot.paramMap.get('id')!;
    this.svc.getAll().subscribe(() => {
      const prev = this.r;
      this.r = this.svc.getById(id);
      if (!this.r) return;
      this.tra = this.svc.traFor(this.r);
      const catalog = this.roomSvc.getSnapshot();
      this.rooms = catalog.filter(room => this.r!.rooms.includes(room.number));
      // Solo se reinicia el borrador de anotaciones al cargar, no en cada cambio (p. ej. al registrar un pago)
      if (!prev) this.notes = this.r.observations;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-popover]') || !this.host.nativeElement.contains(target)) this.moreOpen = false;
  }

  // ── Derivados ──
  get total(): number { return totalAmount(this.r!); }
  get paid(): number { return paidAmount(this.r!); }
  get pending(): number { return balance(this.r!); }
  get pay(): PaymentStatus { return paymentStatus(this.r!); }
  get last() { return lastPayment(this.r!); }
  get traStatus() { return this.svc.traStatus(this.r!); }
  get capacity(): number { return this.rooms.reduce((s, room) => s + room.capacity, 0); }
  get mailto(): string { return guestMailto(this.r!); }

  get nightsText(): string {
    const n = this.r!.nights;
    return n ? `${n} noche${n === 1 ? '' : 's'}` : 'Pasadía';
  }

  get statusTone(): string { return STATUS_TONE[this.r!.status]; }
  get payTone(): string { return PAYMENT_TONE[this.pay]; }

  get statusText(): string {
    const r = this.r!;
    return r.status === 'Cancelada' && r.cancelReason ? `Cancelada: ${r.cancelReason}.` : STATUS_TEXT[r.status];
  }

  get payText(): string {
    if (this.pay === 'Pagado') return 'El pago ha sido recibido en su totalidad.';
    if (this.pay === 'Parcial') return `Se han recibido ${fmtMoney(this.paid)}; faltan ${fmtMoney(this.pending)}.`;
    return 'Aún no se ha registrado ningún pago.';
  }

  get editable(): boolean {
    return this.r!.status === 'Confirmada' || this.r!.status === 'Pendiente';
  }

  get canPay(): boolean { return !isVoid(this.r!) && this.pending > 0; }
  get canFinish(): boolean { return this.r!.status === 'Confirmada' && this.r!.checkOut <= isoDate(0); }
  get canNoShow(): boolean { return this.editable && this.r!.checkIn <= isoDate(0); }
  get notesDirty(): boolean { return this.notes !== this.r!.observations; }

  docNumber(n: string): string {
    return /^\d+$/.test(n) ? Number(n).toLocaleString('es-CO') : n;
  }

  // ── Acciones ──
  setStatus(status: ReservationStatus): void {
    this.moreOpen = false;
    this.svc.update(this.r!.id, { status });
  }

  copyCode(): void {
    navigator.clipboard?.writeText(this.r!.code).then(() => {
      this.copied = true;
      setTimeout(() => { this.copied = false; this.moreOpen = false; }, 1200);
    });
  }

  saveNotes(): void {
    this.svc.update(this.r!.id, { observations: this.notes.trim() });
    this.notes = this.notes.trim();
    this.notesSaved = true;
  }

  openPayment(): void {
    this.payment = { amount: this.pending, method: 'Efectivo', receipt: '' };
    this.paymentError = '';
    this.showPayment = true;
  }

  savePayment(): void {
    const amount = +this.payment.amount || 0;
    if (amount <= 0) { this.paymentError = 'Indica un valor mayor a cero.'; return; }
    if (amount > this.pending) { this.paymentError = `El valor no puede superar el saldo pendiente (${fmtMoney(this.pending)}).`; return; }
    this.svc.addPayment(this.r!.id, { amount, method: this.payment.method, receipt: this.payment.receipt.trim() });
    this.showPayment = false;
  }

  confirmCancel(): void {
    if (!this.cancelReason) return;
    this.svc.cancel(this.r!.id, this.cancelReason);
    this.showCancel = false;
  }

  exportExcel(): void {
    downloadCsv([this.r!], r => this.svc.traStatus(r), `${this.r!.code}.csv`);
  }
}
