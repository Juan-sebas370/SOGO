import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { BillingConfigService } from '../billing-config.service';
import { ChargeService } from '../charge.service';
import {
  Invoice, InvoiceLine, Buyer, ConceptCategory, computeTotals, lineGross, lineDiscount, lineNet, taxLabel,
  validateBuyer, nitCheckDigit, isValidInvoice, DOC_TYPES, FISCAL_RESPONSIBILITIES, EXTRA_CATEGORIES, CREDIT_TERMS, FiscalCheck
} from '../invoice.model';
import { InvoiceSheetComponent } from '../invoice-sheet/invoice-sheet.component';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, lodgingLabel, paidAmount, isInHouse, isVoid, splitFullName } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { CO_DEPARTMENTS, COUNTRY_OPTIONS, townsOf, isColombia, formatPlace } from '../../shared/colombia';
import { UsersService } from '../../users/users.service';
import { toast } from '../../shared/toast/toast.service';
import { serverMessage } from '../../shared/toast/notify.interceptor';

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-invoice-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InvoiceSheetComponent],
  styleUrls: ['./invoice-new.component.css'],
  template: `
  <nav class="bil-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/billing">Facturación</a><span>/</span>
    <span>{{ correcting ? 'Corregir ' + inv.number : 'Nueva factura' }}{{ reservation && step > 1 ? ' · ' + reservation.code : '' }}</span>
  </nav>
  <header class="bil-head">
    <div>
      <h1 class="bil-title">{{ stepTitle }}</h1>
      <p class="bil-subtitle">{{ stepSubtitle }}</p>
    </div>
    <ol class="bil-steps" aria-label="Pasos">
      <li *ngFor="let s of stepNames; let i = index" [class.active]="step === i + 1" [class.done]="step > i + 1">
        <span class="bil-step-dot">
          <svg *ngIf="step > i + 1" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          <ng-container *ngIf="step <= i + 1">{{ i + 1 }}</ng-container>
        </span>
        {{ s }}
      </li>
    </ol>
  </header>

  <!-- ═══════════ Paso 1 · Estadía y consumos ═══════════ -->
  <div class="nf-layout" *ngIf="step === 1">
    <div class="nf-main">
      <section class="bil-card">
        <div class="bil-card-head">
          <div>
            <span class="bil-card-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>
            <div><h2 class="bil-card-title">Huésped y estadía</h2><span class="bil-card-sub">Busca la reserva que vas a facturar</span></div>
          </div>
          <span class="rsv-badge" *ngIf="reservation" [ngClass]="stayComplete ? 'rsv-badge--ok' : 'rsv-badge--warn'">
            {{ stayComplete ? 'Información completa' : 'Faltan datos del huésped' }}
          </span>
        </div>

        <div class="nf-search" data-popover>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" [(ngModel)]="query" (focus)="searchOpen = true" (ngModelChange)="searchOpen = true"
                 placeholder="Busca por reserva, huésped o documento" aria-label="Buscar reserva">
          <span class="nf-search-hint" *ngIf="!query">Busca por reserva, huésped o documento</span>
          <ul class="nf-results" *ngIf="searchOpen">
            <li *ngFor="let r of results">
              <button type="button" (click)="selectReservation(r)" [disabled]="!!invoiceOf(r)">
                <strong>{{ r.code }} · {{ r.guestName }}</strong>
                <span>{{ lodging(r) }} · {{ date(r.checkIn) }} → {{ date(r.checkOut) }} · {{ accountLabel(r) }}</span>
                <em *ngIf="invoiceOf(r) as done">Ya facturada · {{ done.number }}</em>
              </button>
            </li>
            <li *ngIf="!results.length" class="nf-results-empty">Sin reservas que coincidan.</li>
          </ul>
        </div>

        <div class="nf-stay" *ngIf="reservation as r">
          <span class="nf-avatar">{{ initials(r.guestName) }}</span>
          <div class="nf-stay-guest"><strong>{{ r.guestName }}</strong><span>{{ docShort(r) }} · {{ r.phone }}</span></div>
          <div><span>Reserva</span><a class="bil-link" [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></div>
          <div><span>Alojamiento</span><strong>{{ lodging(r) }}</strong></div>
          <div><span>Estancia</span><strong>{{ dayMonth(r.checkIn) }} → {{ date(r.checkOut) }} · {{ r.nights ? r.nights + ' noche' + (r.nights === 1 ? '' : 's') : 'pasadía' }}</strong></div>
          <div><span>Cuenta</span><span class="rsv-badge" [ngClass]="accountBadge(r)">{{ accountLabel(r) }}</span></div>
        </div>

        <div class="nf-billto" *ngIf="reservation as r">
          <span class="nf-label">Facturar a</span>
          <div class="nf-radios">
            <label [class.active]="inv.billTo === 'Huésped'">
              <input type="radio" name="billTo" [checked]="inv.billTo === 'Huésped'" (change)="setBillTo('Huésped')">
              Huésped principal · {{ r.guestName }}
            </label>
            <label [class.active]="inv.billTo === 'Empresa'">
              <input type="radio" name="billTo" [checked]="inv.billTo === 'Empresa'" (change)="setBillTo('Empresa')">
              Empresa u otro adquiriente (NIT)
            </label>
          </div>
        </div>
      </section>

      <section class="bil-card" *ngIf="reservation">
        <div class="bil-card-head">
          <div>
            <span class="bil-card-icon"><svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg></span>
            <div><h2 class="bil-card-title">Alojamiento y consumos</h2><span class="bil-card-sub">La reserva y los consumos cargados a la estadía</span></div>
          </div>
          <div class="nf-card-actions">
            <button type="button" class="rsv-btn rsv-btn--outline nf-sm" (click)="openDiscount()">Aplicar descuento</button>
            <button type="button" class="rsv-btn rsv-btn--outline nf-sm nf-blue" (click)="openConcept()">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Agregar concepto
            </button>
          </div>
        </div>

        <div class="bil-table-wrap">
          <table class="bil-table nf-lines">
            <thead>
              <tr><th>Incluir</th><th>Concepto</th><th>Fecha</th><th class="num">Cant.</th><th class="num">Valor unit.</th><th class="num">Descuento</th><th>Impuesto</th><th class="num">Subtotal</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of inv.lines" [class.nf-off]="!l.included">
                <td><input type="checkbox" [(ngModel)]="l.included" [attr.aria-label]="'Incluir ' + l.description"></td>
                <td><strong>{{ l.description }}</strong><small>{{ l.detail }}</small></td>
                <td class="nowrap">{{ l.dateLabel }}</td>
                <td class="num">{{ l.quantity }}{{ l.unitLabel ? ' ' + l.unitLabel : '' }}</td>
                <td class="num">{{ money(l.unitValue) }}</td>
                <td class="num">
                  <ng-container *ngIf="l.discountPct; else noDiscount">
                    <button type="button" class="nf-discount" (click)="removeDiscount(l)" title="Quitar descuento">-{{ l.discountPct }}% {{ l.discountLabel }}</button>
                    <small class="nf-discount-value">- {{ money(discount(l)) }}</small>
                  </ng-container>
                  <ng-template #noDiscount>—</ng-template>
                </td>
                <td><span class="rsv-badge" [ngClass]="l.taxKind === 'INC' ? 'rsv-badge--ok' : l.taxRate === 0 ? 'rsv-badge--muted' : 'rsv-badge--info'">{{ tax(l) }}</span></td>
                <td class="num strong">{{ money(net(l)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="nf-tip">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Marca o desmarca un concepto: los totales se recalculan al instante.
        </p>
      </section>
    </div>

    <aside class="bil-side">
      <ng-container *ngTemplateOutlet="totalsCard"></ng-container>
      <section class="bil-card">
        <h3 class="bil-card-title nf-side-title">Verificación de la estadía</h3>
        <ul class="bil-checks">
          <li *ngFor="let c of stayChecks" [class.bad]="!c.ok">
            <svg class="bil-check-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path [attr.d]="c.ok ? 'M8 12l3 3 5-6' : 'M12 8v4M12 16h.01'"/></svg>
            <div>{{ c.label }}<small>{{ c.detail }}</small></div>
          </li>
        </ul>
      </section>
      <button type="button" class="rsv-btn rsv-btn--primary bil-block-btn" [disabled]="!step1Ok" (click)="goStep(2)">
        Continuar a datos fiscales
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
      <div class="bil-side-row">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!reservation" (click)="saveDraft()">Guardar borrador</button>
        <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/billing">Cancelar</a>
      </div>
    </aside>
  </div>

  <!-- ═══════════ Paso 2 · Datos fiscales ═══════════ -->
  <ng-container *ngIf="step === 2">
    <div class="bil-alert" *ngIf="failed.length" role="alert">
      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <p><strong>Hay {{ failed.length }} dato{{ failed.length === 1 ? '' : 's' }} por corregir antes de {{ correcting ? 'reenviar' : 'emitir' }} la factura</strong><br>{{ failedSummary }}</p>
    </div>
    <div class="bil-alert" *ngIf="correcting && inv.rejectionReason" role="status">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p><strong>Motivo del rechazo de la DIAN:</strong> {{ inv.rejectionReason }}.</p>
    </div>

    <div class="nf-layout">
      <section class="bil-card nf-main">
        <div class="bil-card-head">
          <div>
            <span class="bil-card-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg></span>
            <div><h2 class="bil-card-title">Datos del adquiriente</h2><span class="bil-card-sub">Quien recibe la factura ante la DIAN</span></div>
          </div>
          <span class="rsv-badge rsv-badge--info">Persona {{ inv.buyer.personType.toLowerCase() }}</span>
        </div>

        <h3 class="bil-section-label">Identificación tributaria</h3>
        <div class="nf-grid nf-grid--4">
          <div class="rsv-field">
            <label for="f-person">Tipo de persona *</label>
            <select id="f-person" class="rsv-input" [(ngModel)]="inv.buyer.personType" (ngModelChange)="onPersonType()">
              <option>Natural</option><option>Jurídica</option>
            </select>
          </div>
          <div class="rsv-field">
            <label for="f-doctype">Tipo de documento *</label>
            <select id="f-doctype" class="rsv-input" [(ngModel)]="inv.buyer.docType" (ngModelChange)="syncDv()">
              <option *ngFor="let d of docTypes" [value]="d.code">{{ d.label }}</option>
            </select>
          </div>
          <div class="rsv-field">
            <label for="f-doc">Número de identificación *</label>
            <input id="f-doc" type="text" class="rsv-input" [class.nf-bad]="bad('doc')" [(ngModel)]="inv.buyer.docNumber" (ngModelChange)="syncDv()">
            <small class="nf-err" *ngIf="bad('doc')">{{ check('doc').detail }}</small>
          </div>
          <div class="rsv-field">
            <label for="f-dv">DV</label>
            <input id="f-dv" type="text" class="rsv-input" [(ngModel)]="inv.buyer.dv" [disabled]="inv.buyer.docType !== 'NIT'" [placeholder]="inv.buyer.docType === 'NIT' ? '' : 'Solo para NIT'" maxlength="1">
            <small class="nf-help">Dígito de verificación{{ inv.buyer.docType === 'NIT' && inv.buyer.docNumber ? ' · calculado: ' + expectedDv : '' }}</small>
          </div>
        </div>
        <div class="nf-grid nf-grid--2-1">
          <div class="rsv-field">
            <label for="f-name">Nombre o razón social *</label>
            <input id="f-name" type="text" class="rsv-input" [class.nf-bad]="bad('name')" [(ngModel)]="inv.buyer.name">
            <small class="nf-err" *ngIf="bad('name')">Campo obligatorio</small>
          </div>
          <div class="rsv-field">
            <label for="f-resp">Responsabilidad fiscal *</label>
            <select id="f-resp" class="rsv-input" [(ngModel)]="inv.buyer.fiscalResponsibility">
              <option *ngFor="let r of responsibilities">{{ r }}</option>
            </select>
          </div>
        </div>

        <h3 class="bil-section-label">Contacto y ubicación</h3>
        <div class="nf-grid nf-grid--3">
          <div class="rsv-field">
            <label for="f-email">Correo de facturación *</label>
            <input id="f-email" type="email" class="rsv-input" [class.nf-bad]="bad('email')" [(ngModel)]="inv.buyer.email">
            <small class="nf-err" *ngIf="bad('email')">{{ inv.buyer.email ? 'Formato no válido: revisa el dominio (ej. @correo.com)' : 'Campo obligatorio' }}</small>
          </div>
          <div class="rsv-field">
            <label for="f-phone">Teléfono</label>
            <input id="f-phone" type="text" class="rsv-input" [(ngModel)]="inv.buyer.phone">
          </div>
          <div class="rsv-field">
            <label for="f-country">País *</label>
            <input id="f-country" type="text" class="rsv-input" list="nf-countries" [(ngModel)]="inv.buyer.country" (ngModelChange)="onCountry()" autocomplete="country-name">
            <datalist id="nf-countries"><option *ngFor="let c of countries" [value]="c"></option></datalist>
          </div>
          <ng-container *ngIf="buyerInColombia; else buyerAbroad">
            <div class="rsv-field">
              <label for="f-dept">Departamento *</label>
              <select id="f-dept" class="rsv-input" [class.nf-bad]="bad('place') && !inv.buyer.department" [(ngModel)]="inv.buyer.department" (ngModelChange)="inv.buyer.city = ''">
                <option value="">Seleccionar…</option>
                <option *ngFor="let d of departments" [value]="d.name">{{ d.name }}</option>
              </select>
            </div>
            <div class="rsv-field">
              <label for="f-city">Municipio *</label>
              <select id="f-city" class="rsv-input" [class.nf-bad]="bad('place') && !!inv.buyer.department" [(ngModel)]="inv.buyer.city" [disabled]="!inv.buyer.department">
                <option value="">{{ inv.buyer.department ? 'Seleccionar…' : 'Elige el departamento' }}</option>
                <option *ngFor="let c of cities" [value]="c">{{ c }}</option>
              </select>
            </div>
          </ng-container>
          <ng-template #buyerAbroad>
            <div class="rsv-field">
              <label for="f-region">Estado / provincia *</label>
              <input id="f-region" type="text" class="rsv-input" [class.nf-bad]="bad('place') && !inv.buyer.department" [(ngModel)]="inv.buyer.department" maxlength="60">
            </div>
            <div class="rsv-field">
              <label for="f-city-abroad">Ciudad *</label>
              <input id="f-city-abroad" type="text" class="rsv-input" [class.nf-bad]="bad('place') && !inv.buyer.city" [(ngModel)]="inv.buyer.city" maxlength="60">
            </div>
          </ng-template>
          <div class="rsv-field">
            <label for="f-address">Dirección *</label>
            <input id="f-address" type="text" class="rsv-input" [class.nf-bad]="bad('address')" [(ngModel)]="inv.buyer.address" placeholder="Ej. Cra 14 # 20-35">
            <small class="nf-err" *ngIf="bad('address')">Campo obligatorio</small>
          </div>
        </div>

        <h3 class="bil-section-label">Forma de pago</h3>
        <div class="nf-term">
          <div class="nf-radios">
            <label [class.active]="inv.paymentTerm === 'Contado'">
              <input type="radio" name="term" [checked]="inv.paymentTerm === 'Contado'" (change)="setTerm('Contado')"> Contado · se paga al emitir
            </label>
            <label [class.active]="inv.paymentTerm === 'Crédito'">
              <input type="radio" name="term" [checked]="inv.paymentTerm === 'Crédito'" (change)="setTerm('Crédito')"> Crédito · se paga después
            </label>
          </div>
          <div class="nf-term-due" *ngIf="inv.paymentTerm === 'Crédito'">
            <div class="rsv-field">
              <label for="f-due">Fecha de vencimiento *</label>
              <input id="f-due" type="date" class="rsv-input" [class.nf-bad]="!termOk" [(ngModel)]="inv.dueDate" [min]="tomorrow">
            </div>
            <div class="nf-term-quick" role="group" aria-label="Plazo">
              <button type="button" *ngFor="let d of creditTerms" [class.active]="inv.dueDate === inDays(d)" (click)="inv.dueDate = inDays(d)">{{ d }} días</button>
            </div>
          </div>
          <small class="nf-err" *ngIf="!termOk">La fecha de vencimiento de una factura a crédito debe ser posterior a hoy.</small>
        </div>

        <div class="nf-fiscal-foot">
          <label class="nf-check" *ngIf="inv.billTo === 'Huésped'">
            <input type="checkbox" [(ngModel)]="updateGuest">
            Actualizar estos datos en el registro del huésped
          </label>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="revalidate()">
            <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
            Validar de nuevo
          </button>
        </div>
      </section>

      <aside class="bil-side">
        <section class="bil-card">
          <div class="bil-card-head nf-result-head">
            <h3 class="bil-card-title">Resultado de la validación</h3>
            <span class="rsv-badge" [ngClass]="failed.length ? 'rsv-badge--danger' : 'rsv-badge--ok'">{{ okCount }} de {{ checks.length }} correctos</span>
          </div>
          <ul class="bil-checks">
            <li *ngFor="let c of checks" [class.bad]="!c.ok">
              <svg class="bil-check-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path [attr.d]="c.ok ? 'M8 12l3 3 5-6' : 'M12 8v4M12 16h.01'"/></svg>
              <div>{{ c.label }}<small>{{ c.detail }}</small></div>
            </li>
          </ul>
          <small class="nf-validated" *ngIf="validatedAt">Última validación: {{ dateTime(validatedAt) }} · {{ user }}</small>
        </section>
        <p class="bil-note">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          La información fiscal queda asociada a la factura y al huésped. Cada validación registra fecha, hora y usuario.
        </p>
        <button type="button" class="rsv-btn rsv-btn--primary bil-block-btn" [disabled]="failed.length > 0 || !termOk" (click)="goStep(3)">Continuar a vista previa</button>
        <p class="bil-hint" *ngIf="failed.length">Corrige {{ failed.length }} dato{{ failed.length === 1 ? '' : 's' }} para continuar</p>
        <p class="bil-hint" *ngIf="!failed.length && !termOk">Elige la fecha de vencimiento del crédito</p>
        <button type="button" class="rsv-btn rsv-btn--outline bil-block-btn" *ngIf="!correcting" (click)="goStep(1)">Volver a estadía y consumos</button>
        <a class="rsv-btn rsv-btn--outline bil-block-btn" *ngIf="correcting" [routerLink]="['/dashboard/billing', inv.id]">Cancelar corrección</a>
      </aside>
    </div>
  </ng-container>

  <!-- ═══════════ Paso 3 · Vista previa y emisión ═══════════ -->
  <div class="nf-layout nf-layout--preview" *ngIf="step === 3">
    <app-invoice-sheet [invoice]="inv" [preview]="true"></app-invoice-sheet>

    <aside class="bil-side">
      <section class="bil-card">
        <div class="bil-card-head nf-result-head">
          <h3 class="bil-card-title">Antes de {{ correcting ? 'reenviar' : 'emitir' }}</h3>
          <span class="rsv-badge" [ngClass]="preflightOk ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ preflightOk ? 'Todo listo' : 'Revisa' }}</span>
        </div>
        <ul class="bil-checks">
          <li *ngFor="let c of preflight" [class.bad]="!c.ok">
            <svg class="bil-check-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path [attr.d]="c.ok ? 'M8 12l3 3 5-6' : 'M12 8v4M12 16h.01'"/></svg>
            <div>{{ c.label }}<small>{{ c.detail }}</small></div>
          </li>
        </ul>
      </section>

      <button type="button" class="rsv-btn rsv-btn--primary bil-block-btn" [disabled]="!preflightOk || !canIssue || saving" (click)="issue()">
        <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        {{ saving ? 'Guardando…' : correcting ? 'Guardar corrección' : 'Emitir factura' }}
      </button>
      <p class="bil-hint" *ngIf="!canIssue">Tu rol no tiene permiso para {{ correcting ? 'corregir' : 'generar' }} facturas.</p>
      <p class="nf-err" *ngIf="serverError">{{ serverError }}</p>
      <div class="bil-side-row">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="goStep(correcting ? 2 : 1)">Volver a editar</button>
        <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="!correcting" (click)="draftPdf()">Borrador PDF</button>
      </div>

      <section class="bil-card" *ngIf="!correcting">
        <h3 class="bil-card-title nf-side-title">Qué pasa al emitir</h3>
        <ol class="nf-steps-info">
          <li><span>1</span>El servidor asigna el siguiente número de la resolución (aprox. <strong>{{ nextNumber }}</strong>) con la fecha y hora de emisión.</li>
          <li><span>2</span>La factura queda <strong>pendiente de validación DIAN</strong>: se valida con el proveedor tecnológico{{ providerName ? ' (' + providerName + ')' : '' }}.</li>
          <li><span>3</span>Cuando la DIAN responda, registra el CUFE (aceptada) o el motivo (rechazada) en el detalle de la factura.</li>
          <li><span>4</span>Contabilidad causa el ingreso con la factura y los consumos quedan marcados como facturados.</li>
        </ol>
      </section>
    </aside>
  </div>

  <!-- Panel de totales (pasos 1 y vista lateral) -->
  <ng-template #totalsCard>
    <section class="bil-card">
      <div class="bil-card-head nf-result-head">
        <div><h3 class="bil-card-title">Totales e impuestos</h3><span class="bil-card-sub">Se recalculan solos</span></div>
        <span class="rsv-badge rsv-badge--ok">Actualizado</span>
      </div>
      <dl class="bil-totals">
        <div><dt>Subtotal ({{ t.count }} concepto{{ t.count === 1 ? '' : 's' }})</dt><dd>{{ money(t.subtotal) }}</dd></div>
        <div><dt>Descuentos</dt><dd class="bil-discount">{{ t.discounts ? '- ' + money(t.discounts) : money(0) }}</dd></div>
        <div><dt>Base gravable</dt><dd>{{ money(t.base) }}</dd></div>
        <div *ngFor="let g of t.taxes"><dt>{{ g.label }} · base {{ money(g.base) }}</dt><dd>{{ money(g.amount) }}</dd></div>
        <div class="bil-total"><dt>Total factura</dt><dd>{{ money(t.total) }}</dd></div>
        <div><dt>Anticipo recibido</dt><dd>{{ advance ? '- ' + money(advance) : money(0) }}</dd></div>
      </dl>
      <div class="bil-balance" [class.bil-balance--ok]="t.total - advance <= 0">
        <span>Saldo a pagar al check-out</span><strong>{{ money(max0(t.total - advance)) }}</strong>
      </div>
    </section>
  </ng-template>

  <!-- Modal · descuento -->
  <div class="rsv-modal-overlay" *ngIf="discountForm" (click)="discountForm = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">Aplicar descuento</h3>
      <p class="rsv-modal-desc">El descuento reduce la base gravable del concepto.</p>
      <div class="rsv-field">
        <label for="d-line">Concepto</label>
        <select id="d-line" class="rsv-input" [(ngModel)]="discountForm.lineId">
          <option *ngFor="let l of includedLines" [value]="l.id">{{ l.description }} · {{ money(gross(l)) }}</option>
        </select>
      </div>
      <div class="nf-grid nf-grid--2">
        <div class="rsv-field">
          <label for="d-pct">Porcentaje (%)</label>
          <input id="d-pct" type="number" min="1" max="100" class="rsv-input" [(ngModel)]="discountForm.pct">
        </div>
        <div class="rsv-field">
          <label for="d-label">Motivo</label>
          <input id="d-label" type="text" class="rsv-input" [(ngModel)]="discountForm.label" placeholder="Ej.: temporada baja, cliente frecuente">
        </div>
      </div>
      <p class="nf-err" *ngIf="modalError">{{ modalError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="discountForm = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="applyDiscount()">Aplicar</button>
      </div>
    </div>
  </div>

  <!-- Modal · agregar concepto -->
  <div class="rsv-modal-overlay" *ngIf="conceptForm" (click)="conceptForm = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">Agregar concepto</h3>
      <p class="rsv-modal-desc">Se carga a la cuenta de la estadía {{ reservation?.code }}.</p>
      <div class="nf-grid nf-grid--2">
        <div class="rsv-field">
          <label for="c-cat">Tipo</label>
          <select id="c-cat" class="rsv-input" [(ngModel)]="conceptForm.category">
            <option *ngFor="let c of categories">{{ c }}</option>
          </select>
        </div>
        <div class="rsv-field">
          <label for="c-date">Fecha</label>
          <input id="c-date" type="date" class="rsv-input" [(ngModel)]="conceptForm.date">
        </div>
      </div>
      <div class="rsv-field">
        <label for="c-desc">Descripción *</label>
        <input id="c-desc" type="text" class="rsv-input" [(ngModel)]="conceptForm.description" placeholder="Ej.: Lavandería · 3 prendas">
      </div>
      <div class="rsv-field">
        <label for="c-detail">Detalle</label>
        <input id="c-detail" type="text" class="rsv-input" [(ngModel)]="conceptForm.detail" placeholder="Ej.: Piso 2 · solicitado en recepción">
      </div>
      <div class="nf-grid nf-grid--2">
        <div class="rsv-field">
          <label for="c-qty">Cantidad *</label>
          <input id="c-qty" type="number" min="1" class="rsv-input" [(ngModel)]="conceptForm.quantity">
        </div>
        <div class="rsv-field">
          <label for="c-unit">Valor unitario (COP) *</label>
          <input id="c-unit" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="conceptForm.unitValue">
        </div>
      </div>
      <p class="nf-err" *ngIf="modalError">{{ modalError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="conceptForm = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="addConcept()">Agregar</button>
      </div>
    </div>
  </div>
  `
})
export class InvoiceNewComponent {

  readonly stepNames = ['Estadía y consumos', 'Datos fiscales', 'Vista previa y emisión'];
  readonly docTypes = DOC_TYPES;
  readonly responsibilities = FISCAL_RESPONSIBILITIES;
  readonly departments = CO_DEPARTMENTS;
  readonly countries = COUNTRY_OPTIONS;
  readonly categories = EXTRA_CATEGORIES;
  readonly creditTerms = CREDIT_TERMS;
  readonly tomorrow = isoDate(1);
  readonly inDays = isoDate;

  readonly money = fmtMoney;
  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly lodging = lodgingLabel;
  readonly net = lineNet;
  readonly gross = lineGross;
  readonly discount = lineDiscount;
  readonly tax = taxLabel;
  readonly max0 = (n: number) => Math.max(0, n);
  get user(): string { return this.users.actor(); }
  saving = false;
  serverError = '';

  step: Step = 1;
  correcting = false;
  inv: Invoice;
  reservation?: Reservation;

  query = '';
  searchOpen = false;
  updateGuest = true;
  validatedAt = '';

  discountForm?: { lineId: string; pct: number; label: string };
  conceptForm?: { category: ConceptCategory; description: string; detail: string; date: string; quantity: number; unitValue: number };
  modalError = '';

  constructor(
    private svc: InvoiceService,
    private config: BillingConfigService,
    private charges: ChargeService,
    private reservations: ReservationService,
    private users: UsersService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    this.inv = this.blank();
    const id = route.snapshot.paramMap.get('id');
    const q = route.snapshot.queryParamMap;

    if (id) {
      // Corregir y reenviar una factura rechazada por la DIAN
      const existing = this.svc.getById(id);
      if (!existing || existing.dianStatus !== 'Rechazada') { this.router.navigate(['/dashboard/billing', id]); return; }
      this.inv = structuredClone(existing);
      this.reservation = this.reservations.getById(existing.reservationId);
      this.correcting = true;
      this.step = 2;
      this.updateGuest = false;
      return;
    }

    const draft = q.get('borrador') ? this.svc.getById(q.get('borrador')!) : undefined;
    if (draft?.dianStatus === 'Borrador') {
      this.inv = structuredClone(draft);
      this.reservation = this.reservations.getById(draft.reservationId);
      this.query = this.reservation?.code ?? '';
      return;
    }
    const code = q.get('reserva');
    const r = code ? this.reservations.getSnapshot().find(x => x.code === code) : undefined;
    if (r && !this.invoiceOf(r)) this.selectReservation(r);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.nf-search')) this.searchOpen = false;
  }

  private blank(): Invoice {
    return {
      id: '', number: '', reservationId: '', reservationCode: '', billTo: 'Huésped', buyer: this.svc.emptyCompanyBuyer(),
      lines: [], paymentTerm: 'Contado', dueDate: isoDate(0), dianStatus: 'Borrador', events: [],
    };
  }

  // ── Encabezado ──
  get stepTitle(): string {
    if (this.correcting) return this.step === 2 ? 'Corregir datos fiscales' : 'Vista previa y reenvío';
    return ['Generar factura electrónica', 'Validar datos fiscales', 'Vista previa y emisión'][this.step - 1];
  }

  get stepSubtitle(): string {
    return [
      'Selecciona la estadía; el alojamiento y los consumos se consolidan automáticamente.',
      'Datos del adquiriente que aparecerán en la factura. Precargados del registro del huésped.',
      `Revisa la factura tal como la recibirá el huésped. Aún no se ha ${this.correcting ? 'reenviado' : 'emitido'}.`,
    ][this.step - 1];
  }

  goStep(s: Step): void {
    if (s === 3 && this.step === 2) this.markValidated();
    this.step = s;
    window.scrollTo({ top: 0 });
  }

  // ── Paso 1 · reserva y conceptos ──
  get results(): Reservation[] {
    const q = this.query.trim().toLowerCase();
    return this.reservations.getSnapshot()
      .filter(r => !isVoid(r))
      .filter(r => !q || [r.code, r.guestName, r.docNumber].some(v => v.toLowerCase().includes(q)))
      .sort((a, b) => Number(!!this.invoiceOf(a)) - Number(!!this.invoiceOf(b)) || b.checkOut.localeCompare(a.checkOut))
      .slice(0, 8);
  }

  invoiceOf(r: Reservation): Invoice | undefined {
    return this.svc.getSnapshot().find(i => i.reservationId === r.id && isValidInvoice(i));
  }

  selectReservation(r: Reservation): void {
    this.reservation = r;
    this.query = r.code;
    this.searchOpen = false;
    const draft = this.svc.newDraft(r, this.inv.billTo);
    this.inv = { ...draft, id: this.inv.id };
  }

  setBillTo(to: Invoice['billTo']): void {
    if (!this.reservation) return;
    this.inv.billTo = to;
    this.inv.buyer = to === 'Empresa' ? this.svc.emptyCompanyBuyer() : this.svc.buyerFor(this.reservation);
  }

  accountLabel(r: Reservation): string {
    const today = isoDate(0);
    if (r.status === 'Finalizada') return 'Cerrada · check-out realizado';
    if (isInHouse(r)) return r.checkOut <= today ? 'Abierta · check-out hoy' : 'Abierta · en hospedaje';
    return r.checkIn > today ? 'Por llegar' : 'Pendiente de check-in';
  }

  accountBadge(r: Reservation): string {
    return r.status === 'Finalizada' ? 'rsv-badge--muted' : isInHouse(r) ? 'rsv-badge--warn' : 'rsv-badge--info';
  }

  initials(name: string): string { return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  docShort(r: Reservation): string { return `${this.svc.buyerFor(r).docType} ${r.docNumber}`; }
  dayMonth(iso: string): string { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }

  get t() { return computeTotals(this.inv.lines); }
  get includedLines(): InvoiceLine[] { return this.inv.lines.filter(l => l.included); }
  get advance(): number { return this.reservation ? Math.min(this.t.total, paidAmount(this.reservation)) : 0; }
  get stayComplete(): boolean { return !!this.reservation && !!this.reservation.docNumber && !!this.reservation.guestName; }

  get stayChecks() {
    const active = this.config.get().taxes.filter(t => t.status !== 'Inactivo');
    const labels = [...new Set(active.filter(t => t.rate > 0).map(t => `${t.kind} ${Math.round(t.rate * 100)}%`))].join(' · ');
    return [
      { ok: this.stayComplete, label: 'Huésped y estadía completos', detail: this.reservation ? this.reservation.code : 'Selecciona una reserva' },
      { ok: this.t.count > 0, label: 'Conceptos facturables registrados', detail: `${this.t.count} incluido${this.t.count === 1 ? '' : 's'}` },
      { ok: active.length > 0, label: `Configuración tributaria vigente (${labels})`, detail: active.length ? 'Facturación › Impuestos y DIAN' : 'Configúralas en Facturación › Impuestos y DIAN' },
    ];
  }

  get step1Ok(): boolean { return this.stayChecks.every(c => c.ok); }

  openDiscount(): void {
    this.modalError = '';
    const first = this.includedLines[0];
    this.discountForm = { lineId: first?.id ?? '', pct: first?.discountPct || (null as unknown as number), label: first?.discountLabel || '' };
  }

  applyDiscount(): void {
    const f = this.discountForm!;
    const pct = +f.pct;
    if (!f.lineId || !(pct > 0 && pct <= 100)) { this.modalError = 'Elige un concepto y un porcentaje entre 1 y 100.'; return; }
    const line = this.inv.lines.find(l => l.id === f.lineId)!;
    line.discountPct = pct;
    line.discountLabel = f.label.trim();
    this.discountForm = undefined;
  }

  removeDiscount(l: InvoiceLine): void {
    l.discountPct = 0;
    l.discountLabel = '';
  }

  openConcept(): void {
    this.modalError = '';
    this.conceptForm = { category: 'Daños y faltantes', description: '', detail: '', date: isoDate(0), quantity: 1, unitValue: 0 };
  }

  /** El concepto se registra como consumo de la estadía (y suma a sus servicios adicionales). */
  addConcept(): void {
    const f = this.conceptForm!;
    if (!f.description.trim() || !(+f.quantity > 0) || !(+f.unitValue > 0)) {
      this.modalError = 'Completa la descripción, la cantidad y el valor unitario.';
      return;
    }
    this.charges.add({
      reservationId: this.reservation!.id, category: f.category, description: f.description.trim(), detail: f.detail.trim(),
      date: f.date || isoDate(0), quantity: +f.quantity, unitValue: +f.unitValue,
    });
    // Reconstruye las líneas conservando descuentos y exclusiones ya elegidos
    const previous = new Map(this.inv.lines.map(l => [l.id, l]));
    this.reservation = this.reservations.getById(this.reservation!.id);
    this.inv.lines = this.svc.buildLines(this.reservation!).map(l => {
      const p = previous.get(l.id);
      return p ? { ...l, included: p.included, discountPct: p.discountPct, discountLabel: p.discountLabel } : l;
    });
    this.conceptForm = undefined;
  }

  async saveDraft(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      await this.svc.saveDraft(this.inv);
      this.router.navigate(['/dashboard/billing']);
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.saving = false;
    }
  }

  // ── Paso 2 · datos fiscales ──
  get checks(): FiscalCheck[] { return validateBuyer(this.inv.buyer); }
  /** Datos a corregir (el resumen "Campos obligatorios" no cuenta aparte: ya lo cubren los demás). */
  get failed(): FiscalCheck[] { return this.checks.filter(c => !c.ok && c.key !== 'required'); }
  get okCount(): number { return this.checks.filter(c => c.ok).length; }
  get failedSummary(): string { return this.failed.map(c => `${c.label}: ${c.detail.toLowerCase()}`).join(' · '); }
  check(key: string): FiscalCheck { return this.checks.find(c => c.key === key)!; }
  bad(key: string): boolean { return !this.check(key).ok; }
  get cities(): string[] { return townsOf(this.inv.buyer.department); }
  get buyerInColombia(): boolean { return isColombia(this.inv.buyer.country); }

  /** Al cambiar de país, lo elegido deja de aplicar (los departamentos de Colombia no sirven afuera, y al revés). */
  onCountry(): void {
    const b = this.inv.buyer;
    const known = CO_DEPARTMENTS.some(d => d.name === b.department);
    if (this.buyerInColombia !== known) { b.department = ''; b.city = ''; }
  }

  // ── Forma de pago ──
  /** Contado vence el día de emisión; crédito, en la fecha que se elija (por defecto a 30 días). */
  setTerm(term: Invoice['paymentTerm']): void {
    this.inv.paymentTerm = term;
    this.inv.dueDate = term === 'Crédito' ? (this.inv.dueDate > isoDate(0) ? this.inv.dueDate : isoDate(30)) : isoDate(0);
  }
  get termOk(): boolean { return this.inv.paymentTerm === 'Contado' || this.inv.dueDate > isoDate(0); }
  get expectedDv(): string { return nitCheckDigit(this.inv.buyer.docNumber); }

  onPersonType(): void {
    const b = this.inv.buyer;
    if (b.personType === 'Jurídica') b.docType = 'NIT';
    else if (b.docType === 'NIT') b.docType = 'CC';
    this.syncDv();
  }

  /** El DV se calcula solo para NIT; para otros documentos se limpia. */
  syncDv(): void {
    const b = this.inv.buyer;
    b.dv = b.docType === 'NIT' && b.docNumber.replace(/\D/g, '').length >= 8 ? nitCheckDigit(b.docNumber) : '';
  }

  revalidate(): void { this.markValidated(); }

  private markValidated(): void {
    this.validatedAt = isoDateTime();
    if (!this.failed.length) this.inv.fiscalValidatedAt = `${this.validatedAt}:00`;
  }

  // ── Paso 3 · emisión ──
  get nextNumber(): string { return this.correcting ? this.inv.number : this.svc.nextNumber(); }
  get canIssue(): boolean { return this.config.can(this.correcting ? 'Validar datos fiscales' : 'Generar factura'); }
  get providerName(): string { return this.config.get().provider.name; }

  get preflight() {
    const usage = this.svc.rangeUsage();
    const blockers = this.config.issueBlockers();
    return [
      { ok: !!this.inv.fiscalValidatedAt && !this.failed.length, label: 'Datos fiscales validados', detail: this.inv.fiscalValidatedAt ? `${fmtDateTime(this.inv.fiscalValidatedAt)} · ${this.user}` : 'Pendiente' },
      { ok: this.t.count > 0 && this.t.total > 0, label: 'Totales e impuestos calculados', detail: `${this.t.count} conceptos · ${fmtMoney(this.t.total)}` },
      { ok: this.termOk, label: 'Forma de pago', detail: this.inv.paymentTerm === 'Contado' ? 'Contado' : this.termOk ? `Crédito · vence el ${fmtDate(this.inv.dueDate)}` : 'Falta la fecha de vencimiento' },
      { ok: !blockers.length, label: 'Emisor y resolución DIAN', detail: blockers[0] ?? `Resolución vigente · quedan ${usage.left.toLocaleString('es-CO')} números` },
      { ok: this.correcting || usage.left > 0, label: 'Rango de numeración', detail: usage.left > 0 ? `Próximo número ${this.nextNumber}` : 'Se agotó el rango autorizado' },
    ];
  }

  get preflightOk(): boolean { return this.preflight.every(c => c.ok); }

  async issue(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.serverError = '';
    try {
      if (this.correcting) {
        await this.svc.resend(this.inv.id, this.inv.buyer);
        this.router.navigate(['/dashboard/billing', this.inv.id]);
        return;
      }
      const issued = await this.svc.issue(this.inv);
      if (this.updateGuest && this.inv.billTo === 'Huésped' && this.reservation) this.updateGuestRecord();
      toast.success(`Factura ${issued.number} emitida`, 'Registra la respuesta de la DIAN cuando el proveedor la valide');
      this.router.navigate(['/dashboard/billing', issued.id]);
    } catch (e) {
      this.serverError = serverMessage(e) || 'No se pudo emitir la factura.';
    } finally {
      this.saving = false;
    }
  }

  /** Guarda el borrador y abre su representación gráfica para imprimir o guardar como PDF. */
  async draftPdf(): Promise<void> {
    try {
      const saved = await this.svc.saveDraft(this.inv);
      this.inv.id = saved.id;
      this.router.navigate(['/facturas', saved.id, 'imprimir'], { queryParams: { pdf: 1 } });
    } catch {
      // El aviso de error lo muestra el interceptor
    }
  }

  private updateGuestRecord(): void {
    const b = this.inv.buyer;
    const r = this.reservation!;
    // Si el nombre cambió en la factura, se actualizan también nombres y apellidos de la reserva
    const name = b.name.trim().replace(/\s+/g, ' ');
    const names = name !== r.guestName ? (([firstName, lastName]) => ({ firstName, lastName }))(splitFullName(name)) : {};
    this.reservations.update(r.id, {
      guestName: name, ...names, docNumber: b.docNumber, email: b.email, phone: b.phone,
      city: formatPlace({ country: b.country, department: b.department, town: b.city }),
    });
  }
}
