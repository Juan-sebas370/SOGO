import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Reservation, totalGuests } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney, typeBadge } from '../../reservations/reservation-format';
import { isoDateTime } from '../../shared/date-utils';
import { TraService } from '../tra.service';
import { TraRecord, TraGuest, TraUnit, TravelData, LodgingUnit } from '../tra.model';
import {
  DOCUMENT_TYPES, TRAVEL_REASONS, COUNTRIES, ACCOMMODATION_TYPES, RELATIONSHIPS, citiesOf
} from '../tra-catalogs';
import {
  principalOf, companionsOf, fullName, guestIssues, isComplete, isMinor, needsSire, progressOf, nightsBetween, newCompanion
} from '../tra-rules';
import { TraStepperComponent } from '../tra-stepper/tra-stepper.component';
import { roomByNumber, roomDescription, summaryOf } from '../../lodging/house';

interface MinorForm { guest: TraGuest; readonly: boolean; travelsWith: string; support: string; confirmed: boolean; }

const SUPPORTS = ['Registro civil', 'Autorización de los padres', 'Documento que acredita el vínculo'];

@Component({
  selector: 'app-tra-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TraStepperComponent],
  styleUrls: ['./tra-registration.component.css'],
  template: `
  <ng-container *ngIf="rec && r; else notFound">
  <header class="rsv-header">
    <div>
      <span class="rsv-eyebrow"><a routerLink="/dashboard/tra">TRA</a><span aria-hidden="true">/</span>{{ r.code }}</span>
      <h1 class="rsv-title">Registro de huéspedes</h1>
      <p class="rsv-subtitle">Registra a cada persona que se aloja. Los campos con * son obligatorios para la TRA (Res. 409 de 2022).</p>
    </div>
    <div class="rsv-header-actions" *ngIf="editable">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="save()">Guardar borrador</button>
      <button type="button" class="rsv-btn rsv-btn--primary" (click)="validateAndContinue()">
        Validar y continuar <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>
  </header>

  <section class="tra-card tra-strip">
    <div><span>Reserva</span><a class="rsv-code" [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a></div>
    <div><span>Tipo</span><span class="rsv-badge" [ngClass]="typeBadge(r.reservationType)">{{ r.reservationType }}</span></div>
    <div><span>Unidad</span><strong>{{ unitNames }}</strong></div>
    <div><span>Estancia</span><strong>{{ date(r.checkIn) }} → {{ date(r.checkOut) }} · {{ nights }} noche{{ nights === 1 ? '' : 's' }}</strong></div>
    <div><span>Huéspedes</span><strong>{{ expected }} (1 principal + {{ expected - 1 }} acompañante{{ expected === 2 ? '' : 's' }})</strong></div>
    <app-tra-stepper [reservationId]="r.id" [step]="1"></app-tra-stepper>
  </section>

  <div class="tra-alert tra-alert--info" *ngIf="!editable">
    <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    <div class="tra-alert-body"><strong>Esta TRA ya se envió al MinCIT.</strong>El registro queda en solo lectura; el seguimiento de cada envío está en el detalle.</div>
    <div class="tra-alert-actions"><a class="rsv-btn rsv-btn--outline rsv-btn--sm" [routerLink]="['/dashboard/tra', r.id]">Ver trazabilidad</a></div>
  </div>

  <div class="tra-alert tra-alert--ok" *ngIf="savedAt">
    <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    <div class="tra-alert-body">Borrador guardado a las {{ savedAt }}. La TRA se enviará al confirmar el check-in.</div>
  </div>

  <div class="tra-layout">
    <fieldset class="tra-main tr-fieldset" [disabled]="!editable">

      <!-- Unidad de alojamiento (3.1 – 3.3) -->
      <section class="tra-card">
        <div class="tra-card-head">
          <div>
            <h2 class="tra-card-title">Unidad de alojamiento</h2>
            <p class="tra-card-sub">Numerales 3.1 a 3.3 · se diligencia por cada unidad ocupada</p>
          </div>
          <span class="rsv-badge" [ngClass]="unitsComplete ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ unitsComplete ? 'Completo' : 'Falta dato' }}</span>
        </div>
        <div class="tr-unit" *ngFor="let u of rec.units; let i = index">
          <div class="tra-grid">
            <div class="rsv-field">
              <label [for]="'unit' + i">Unidad *</label>
              <select [id]="'unit' + i" class="rsv-input" [ngModel]="u.unitId" (ngModelChange)="changeUnit(u, $event)">
                <option *ngFor="let o of unitOptions(u)" [value]="o.id">{{ o.name }} ({{ o.type }} · capacidad {{ o.capacity }})</option>
              </select>
            </div>
            <div class="rsv-field">
              <label [for]="'acc' + i">Tipo de acomodación *</label>
              <select [id]="'acc' + i" class="rsv-input" [(ngModel)]="u.accommodationType" [class.invalid]="showErrors && !u.accommodationType">
                <option value="">Seleccionar...</option>
                <option *ngFor="let a of accommodationTypes" [value]="a.code">{{ a.label }}</option>
              </select>
            </div>
            <div class="rsv-field">
              <label>Número de las habitaciones *</label>
              <input class="rsv-input" [value]="roomsOf(u.unitId)" readonly>
            </div>
            <div class="rsv-field">
              <label [for]="'val' + i">Valor total pagado por alojamiento *</label>
              <input [id]="'val' + i" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="u.totalValue" [class.invalid]="showErrors && !(u.totalValue > 0)">
              <small>{{ money(u.totalValue || 0) }} · total de la estancia ({{ nights }} noche{{ nights === 1 ? '' : 's' }}), no la tarifa por noche.</small>
            </div>
            <div class="rsv-field">
              <label>Fecha de entrada *</label>
              <input class="rsv-input" [value]="date(r.checkIn)" readonly>
              <small>Tomada de la reserva</small>
            </div>
            <div class="rsv-field">
              <label>Fecha de salida *</label>
              <input class="rsv-input" [value]="date(r.checkOut)" readonly>
              <small>Tomada de la reserva</small>
            </div>
          </div>
          <div class="tr-capacity" *ngIf="unitInfo(u.unitId) as info" [class.over]="info.assigned > info.capacity">
            <svg viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
            <div>
              <strong>Capacidad {{ info.capacity }} personas · {{ info.doubleBeds }} cama{{ info.doubleBeds === 1 ? '' : 's' }} doble{{ info.doubleBeds === 1 ? '' : 's' }} · {{ info.bunkBeds }} camarote{{ info.bunkBeds === 1 ? '' : 's' }}
                · {{ info.assigned }} huésped{{ info.assigned === 1 ? '' : 'es' }} asignado{{ info.assigned === 1 ? '' : 's' }}</strong>
              <span *ngFor="let d of info.rooms">{{ d }}</span>
              <span *ngIf="info.assigned > info.capacity" class="tra-missing">Hay más huéspedes que plazas: reparte los huéspedes en otra unidad o cambia la unidad.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Huésped principal -->
      <section class="tra-card" *ngIf="principal as p">
        <div class="tra-card-head">
          <div class="tr-guest-title">
            <span class="tr-avatar">{{ initials(p) }}</span>
            <div>
              <h2 class="tra-card-title">Huésped principal</h2>
              <p class="tra-card-sub">Titular del contrato de hospedaje o representante del grupo</p>
            </div>
          </div>
          <div class="tra-card-badges">
            <span class="rsv-badge rsv-badge--info">PRINCIPAL</span>
            <ng-container *ngTemplateOutlet="state; context: { $implicit: p }"></ng-container>
          </div>
        </div>

        <h3 class="tra-section-label">Identificación</h3>
        <ng-container *ngTemplateOutlet="identity; context: { $implicit: p }"></ng-container>

        <ng-container *ngTemplateOutlet="travel; context: { $implicit: p, t: p.travel, lockDates: true }"></ng-container>

        <div class="tr-pms">
          <h3 class="tra-section-label">Datos operativos del PMS <span class="tra-tag">No se envían a TRA</span> <small>Opcionales · uso interno, SIRE o protección de menores</small></h3>
          <div class="tra-grid">
            <div class="rsv-field"><label for="p-phone">Teléfono</label><input id="p-phone" class="rsv-input" [(ngModel)]="p.phone"></div>
            <div class="rsv-field"><label for="p-mail">Correo</label><input id="p-mail" type="email" class="rsv-input" [(ngModel)]="p.email"></div>
            <div class="rsv-field"><label for="p-birth">Fecha de nacimiento</label><input id="p-birth" type="date" class="rsv-input" [(ngModel)]="p.birthDate"></div>
          </div>
        </div>
      </section>

      <!-- Acompañantes -->
      <section class="tra-card">
        <div class="tra-card-head">
          <div>
            <h2 class="tra-card-title">Acompañantes ({{ companions.length }})</h2>
            <p class="tra-card-sub">Cada persona alojada debe registrarse con su documento y nombre</p>
          </div>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="addCompanion()">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar acompañante
          </button>
        </div>

        <article class="tr-companion" *ngFor="let g of companions; let i = index" [class.has-issue]="showErrors && !complete(g)">
          <header class="tr-companion-head">
            <h3>Acompañante {{ i + 1 }} <span *ngIf="fullName(g)">· {{ fullName(g) }}</span></h3>
            <div class="tra-card-badges">
              <span class="rsv-badge rsv-badge--partial" *ngIf="minor(g)">Menor de edad</span>
              <span class="rsv-badge tr-badge-sire" *ngIf="sire(g)">Extranjero · aplica SIRE</span>
              <ng-container *ngTemplateOutlet="state; context: { $implicit: g }"></ng-container>
              <button type="button" class="rsv-icon-btn" (click)="removeCompanion(g)" title="Quitar acompañante" aria-label="Quitar acompañante">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </header>

          <ng-container *ngTemplateOutlet="identity; context: { $implicit: g }"></ng-container>
          <div class="tra-grid">
            <div class="rsv-field">
              <label [for]="g.id + '-rel'">Parentesco <span class="tra-tag">PMS</span></label>
              <select [id]="g.id + '-rel'" class="rsv-input" [(ngModel)]="g.relationship">
                <option [ngValue]="undefined">Sin especificar</option>
                <option *ngFor="let o of relationships" [ngValue]="o">{{ o }}</option>
              </select>
            </div>
            <div class="rsv-field">
              <label [for]="g.id + '-birth'">Fecha de nacimiento <span class="tra-tag">PMS</span></label>
              <input [id]="g.id + '-birth'" type="date" class="rsv-input" [(ngModel)]="g.birthDate">
            </div>
            <div class="rsv-field" *ngIf="rec.units.length > 1">
              <label [for]="g.id + '-unit'">Unidad del huésped</label>
              <select [id]="g.id + '-unit'" class="rsv-input" [(ngModel)]="g.unitId">
                <option *ngFor="let u of rec.units" [value]="u.unitId">{{ unitName(u.unitId) }}</option>
              </select>
            </div>
          </div>

          <!-- Protección de menores: flujo aparte de la TRA -->
          <div class="tr-minor" *ngIf="minor(g)" [class.done]="g.minorCheck?.verified">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div>
              <ng-container *ngIf="g.minorCheck?.verified; else pending">
                <strong>Verificación de menor: completada</strong>
                <span>Viaja con {{ g.minorCheck!.travelsWith }} · Soporte: {{ g.minorCheck!.support.toLowerCase() }} · Verificado por {{ g.minorCheck!.verifiedBy }} el {{ date(g.minorCheck!.verifiedAt || '') }}</span>
              </ng-container>
              <ng-template #pending>
                <strong>Verificación de menor: pendiente</strong>
                <span>Confirma con quién viaja y registra el soporte (registro civil o autorización de los padres).</span>
              </ng-template>
            </div>
            <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm tr-minor-btn" (click)="openMinor(g)">
              {{ g.minorCheck?.verified ? 'Ver soporte' : 'Registrar verificación' }}
            </button>
          </div>

          <label class="tra-check tr-inherit">
            <input type="checkbox" [ngModel]="!g.ownTravel" (ngModelChange)="setOwnTravel(g, !$event)">
            Usar información de viaje del huésped principal
            <small>· residencia, procedencia, motivo y fechas{{ g.ownTravel ? '' : ' · desmárcalo si viaja desde otro lugar' }}</small>
          </label>
          <div class="tr-own-travel" *ngIf="g.ownTravel">
            <ng-container *ngTemplateOutlet="travel; context: { $implicit: g, t: g.travel, lockDates: false }"></ng-container>
          </div>
        </article>

        <div class="tr-placeholder" *ngIf="missing > 0">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Falta{{ missing === 1 ? '' : 'n' }} {{ missing }} acompañante{{ missing === 1 ? '' : 's' }} por registrar: la reserva declara {{ expected }} huéspedes y todos deben reportarse (RN-01).
          <button type="button" class="tr-link" (click)="addCompanion()">Agregar</button>
        </div>
        <p class="tra-empty" *ngIf="!companions.length && !missing">Esta reserva no tiene acompañantes.</p>
      </section>
    </fieldset>

    <!-- Barra lateral -->
    <aside class="tra-aside">
      <section class="tra-card">
        <h2 class="tra-card-title">Progreso del registro</h2>
        <div class="tr-progress">
          <strong>{{ progress.done }} / {{ progress.expected }}</strong><span>huéspedes completos</span>
        </div>
        <div class="tr-bar"><span [style.width.%]="progress.pct" [class.full]="progress.pct === 100"></span></div>
        <ul class="tr-list">
          <li *ngFor="let g of rec.guests; let i = index" [class.bad]="!complete(g)">
            <svg *ngIf="complete(g)" class="tra-icon tra-icon--ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
            <svg *ngIf="!complete(g)" class="tra-icon tra-icon--danger" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="tr-list-name">{{ fullName(g) || 'Sin nombre' }}</span>
            <span class="tr-list-meta">{{ complete(g) ? (i === 0 ? 'Principal' : 'Acomp. ' + i) : shortIssue(g) }}</span>
          </li>
          <li *ngIf="missing" class="bad">
            <svg class="tra-icon tra-icon--danger" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span class="tr-list-name">{{ missing }} sin registrar</span><span class="tr-list-meta">Acompañante{{ missing === 1 ? '' : 's' }}</span>
          </li>
        </ul>
        <ng-container *ngIf="editable">
          <button type="button" class="rsv-btn rsv-btn--primary rsv-btn--block" (click)="validateAndContinue()">Validar y continuar</button>
          <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--block tr-mt" (click)="save()">Guardar borrador</button>
        </ng-container>
        <a *ngIf="!editable" class="rsv-btn rsv-btn--outline rsv-btn--block" [routerLink]="['/dashboard/tra', r.id]">Ver trazabilidad</a>
      </section>

      <section class="tra-card">
        <h2 class="tra-card-title">Reglas TRA · Res. 409 de 2022</h2>
        <ol class="tr-rules">
          <li>Se registra <strong>a cada huésped</strong>, no solo al titular.</li>
          <li>Residencia, procedencia, motivo y fechas del principal se replican a los acompañantes, salvo que sean distintos.</li>
          <li>Se reporta el <strong>valor total</strong> del alojamiento de la estancia.</li>
          <li>Parentesco, teléfono y fecha de nacimiento son datos del PMS: no se envían a la TRA.</li>
        </ol>
      </section>

      <p class="tra-note">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>La TRA se envía al MinCIT <strong>al confirmar el check-in</strong>, no al crear la reserva. Mientras tanto, este registro queda como borrador.</span>
      </p>
    </aside>
  </div>

  <!-- ── Plantillas ── -->
  <ng-template #state let-g>
    <span class="rsv-badge" [ngClass]="complete(g) ? 'rsv-badge--ok' : 'rsv-badge--danger'">
      {{ complete(g) ? 'Completo' : 'Falta ' + issues(g).length + ' dato' + (issues(g).length === 1 ? '' : 's') }}
    </span>
  </ng-template>

  <!-- 4.1 – 4.3 -->
  <ng-template #identity let-g>
    <div class="tra-grid tra-grid--4">
      <div class="rsv-field">
        <label [for]="g.id + '-dt'">Tipo de documento *</label>
        <select [id]="g.id + '-dt'" class="rsv-input" [(ngModel)]="g.docType" [class.invalid]="showErrors && !g.docType">
          <option value="">Seleccionar...</option>
          <option *ngFor="let d of documentTypes" [value]="d.code">{{ d.code }} · {{ d.label }}</option>
        </select>
      </div>
      <div class="rsv-field">
        <label [for]="g.id + '-dn'">Número de documento *</label>
        <input [id]="g.id + '-dn'" class="rsv-input" [(ngModel)]="g.docNumber" placeholder="Ingresa el número" [class.invalid]="showErrors && !g.docNumber.trim()">
        <small class="tra-missing" *ngIf="showErrors && !g.docNumber.trim()">Falta número de documento</small>
      </div>
      <div class="rsv-field">
        <label [for]="g.id + '-fn'">Nombres *</label>
        <input [id]="g.id + '-fn'" class="rsv-input" [(ngModel)]="g.firstNames" [class.invalid]="showErrors && !g.firstNames.trim()">
      </div>
      <div class="rsv-field">
        <label [for]="g.id + '-ln'">Apellidos *</label>
        <input [id]="g.id + '-ln'" class="rsv-input" [(ngModel)]="g.lastNames" [class.invalid]="showErrors && !g.lastNames.trim()">
      </div>
    </div>
  </ng-template>

  <!-- 4.4 – 4.7 -->
  <ng-template #travel let-g let-t="t" let-lockDates="lockDates">
    <div class="tra-grid tra-grid--4">
      <h3 class="tra-section-label tra-span-2">Residencia <small>· donde vive habitualmente</small></h3>
      <h3 class="tra-section-label tra-span-2 tr-hide-sm">Procedencia <small>· desde donde inició el viaje</small></h3>
      <div class="rsv-field">
        <label [for]="g.id + '-rc'">País *</label>
        <select [id]="g.id + '-rc'" class="rsv-input" [ngModel]="t.residenceCountry" (ngModelChange)="setCountry(t, 'residence', $event)" [class.invalid]="showErrors && !t.residenceCountry">
          <option value="">Seleccionar...</option>
          <option *ngFor="let c of countries" [value]="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="rsv-field">
        <label [for]="g.id + '-rci'">Ciudad *</label>
        <select [id]="g.id + '-rci'" class="rsv-input" [(ngModel)]="t.residenceCity" [class.invalid]="showErrors && !t.residenceCity">
          <option value="">Seleccionar...</option>
          <option *ngFor="let c of cities(t.residenceCountry)" [value]="c.id">{{ c.name }} ({{ c.department }})</option>
        </select>
      </div>
      <h3 class="tra-section-label tra-span-2 tr-show-sm">Procedencia <small>· desde donde inició el viaje</small></h3>
      <div class="rsv-field">
        <label [for]="g.id + '-oc'">País *</label>
        <select [id]="g.id + '-oc'" class="rsv-input" [ngModel]="t.originCountry" (ngModelChange)="setCountry(t, 'origin', $event)" [class.invalid]="showErrors && !t.originCountry">
          <option value="">Seleccionar...</option>
          <option *ngFor="let c of countries" [value]="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="rsv-field">
        <label [for]="g.id + '-oci'">Ciudad *</label>
        <select [id]="g.id + '-oci'" class="rsv-input" [(ngModel)]="t.originCity" [class.invalid]="showErrors && !t.originCity">
          <option value="">Seleccionar...</option>
          <option *ngFor="let c of cities(t.originCountry)" [value]="c.id">{{ c.name }} ({{ c.department }})</option>
        </select>
      </div>
      <div class="rsv-field tra-span-2">
        <label [for]="g.id + '-mv'">Principal motivo de viaje *</label>
        <select [id]="g.id + '-mv'" class="rsv-input" [(ngModel)]="t.reasonId" [class.invalid]="showErrors && !t.reasonId">
          <option [ngValue]="null">Seleccionar...</option>
          <option *ngFor="let m of reasons" [ngValue]="m.id">{{ m.id }} · {{ m.label }}</option>
        </select>
      </div>
      <ng-container *ngIf="lockDates; else ownDates">
        <div class="rsv-field tra-span-2">
          <label>Entrada → salida *</label>
          <input class="rsv-input" [value]="date(t.checkIn) + ' → ' + date(t.checkOut)" readonly>
        </div>
      </ng-container>
      <ng-template #ownDates>
        <div class="rsv-field">
          <label [for]="g.id + '-in'">Entrada *</label>
          <input [id]="g.id + '-in'" type="date" class="rsv-input" [(ngModel)]="t.checkIn" [min]="r!.checkIn" [max]="r!.checkOut">
        </div>
        <div class="rsv-field">
          <label [for]="g.id + '-out'">Salida *</label>
          <input [id]="g.id + '-out'" type="date" class="rsv-input" [(ngModel)]="t.checkOut" [min]="t.checkIn" [max]="r!.checkOut" [class.invalid]="showErrors && t.checkOut <= t.checkIn">
        </div>
      </ng-template>
    </div>
  </ng-template>

  <!-- Verificación de menor -->
  <div class="rsv-modal-overlay" *ngIf="minorForm as m" (click)="minorForm = undefined">
    <div class="rsv-modal tr-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">Verificación de menor de edad</h3>
      <p class="rsv-modal-desc">{{ fullName(m.guest) || 'Acompañante' }} · {{ m.guest.docType }} {{ m.guest.docNumber || 'sin número' }}</p>
      <div class="rsv-field">
        <label for="m-with">Viaja con</label>
        <select id="m-with" class="rsv-input" [(ngModel)]="m.travelsWith" [disabled]="m.readonly">
          <option value="">Seleccionar...</option>
          <option *ngFor="let a of adultsFor(m.guest)" [value]="a">{{ a }}</option>
        </select>
      </div>
      <div class="rsv-field">
        <label for="m-support">Soporte presentado</label>
        <select id="m-support" class="rsv-input" [(ngModel)]="m.support" [disabled]="m.readonly">
          <option value="">Seleccionar...</option>
          <option *ngFor="let s of supports" [value]="s">{{ s }}</option>
        </select>
      </div>
      <label class="tra-check" *ngIf="!m.readonly">
        <input type="checkbox" [(ngModel)]="m.confirmed"> Verifiqué el parentesco o la autorización de los padres.
      </label>
      <p class="tra-note tr-mt">
        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Dato operativo de protección de menores: no se envía a la TRA. El soporte se conserva en almacenamiento privado, nunca en URLs públicas.</span>
      </p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="minorForm = undefined">{{ m.readonly ? 'Cerrar' : 'Cancelar' }}</button>
        <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="!m.readonly" [disabled]="!m.travelsWith || !m.support || !m.confirmed" (click)="saveMinor()">Registrar verificación</button>
      </div>
    </div>
  </div>
  </ng-container>

  <ng-template #notFound>
    <p class="tra-empty">No existe una TRA para esta reserva. <a routerLink="/dashboard/tra">Volver al panel</a></p>
  </ng-template>
  `
})
export class TraRegistrationComponent {

  readonly documentTypes = DOCUMENT_TYPES;
  readonly reasons = TRAVEL_REASONS;
  readonly countries = COUNTRIES;
  readonly accommodationTypes = ACCOMMODATION_TYPES;
  readonly relationships = RELATIONSHIPS;
  readonly supports = SUPPORTS;
  readonly cities = citiesOf;
  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly typeBadge = typeBadge;
  readonly fullName = fullName;

  r?: Reservation;
  rec?: TraRecord;
  editable = false;
  showErrors = false;
  savedAt = '';
  minorForm?: MinorForm;
  private units: LodgingUnit[] = [];

  constructor(private svc: TraService, private router: Router, route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id')!;
    const row = this.svc.row(id);
    this.r = row?.reservation;
    this.rec = this.svc.draft(id);
    this.units = this.svc.getUnits();
    if (this.rec) {
      this.editable = this.svc.isEditable(this.rec);
      this.showErrors = this.rec.status === 'REQUIERE_CORRECCION';
    }
  }

  // ── Derivados ──
  get principal(): TraGuest { return principalOf(this.rec!); }
  get companions(): TraGuest[] { return companionsOf(this.rec!); }
  get expected(): number { return Math.max(totalGuests(this.r!), this.rec!.guests.length); }
  get missing(): number { return Math.max(0, totalGuests(this.r!) - this.rec!.guests.length); }
  get progress() { return progressOf(this.rec!, this.r!); }
  get nights(): number { return nightsBetween(this.r!.checkIn, this.r!.checkOut); }
  get unitNames(): string { return this.rec!.units.map(u => this.unitName(u.unitId)).join(' + '); }
  get unitsComplete(): boolean { return this.rec!.units.every(u => u.unitId && u.accommodationType && u.totalValue > 0); }

  issues(g: TraGuest): string[] { return guestIssues(this.rec!, g); }
  complete(g: TraGuest): boolean { return isComplete(this.rec!, g); }
  minor(g: TraGuest): boolean { return isMinor(this.rec!, g); }
  sire(g: TraGuest): boolean { return needsSire(g); }
  shortIssue(g: TraGuest): string { return this.issues(g)[0]?.replace(/ del (acompañante \d+|huésped principal)$/, '') ?? ''; }

  unitName(id: string): string { return this.units.find(u => u.id === id)?.name ?? 'Sin unidad'; }
  roomsOf(id: string): string { return this.units.find(u => u.id === id)?.rooms.join(', ') ?? ''; }
  /** Camas, capacidad y ocupación de una unidad, con el detalle de cada habitación. */
  unitInfo(unitId: string) {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) return undefined;
    return {
      ...summaryOf(unit.rooms),
      capacity: unit.capacity,
      assigned: this.rec!.guests.filter(g => g.unitId === unitId).length,
      rooms: unit.rooms.map(n => roomByNumber(n)).filter(r => !!r).map(r => `Hab. ${r!.number}: ${roomDescription(r!)} · ${r!.capacity} personas`),
    };
  }

  unitOptions(current: TraUnit): LodgingUnit[] { return this.units.filter(u => u.active || u.id === current.unitId); }

  initials(g: TraGuest): string {
    return `${g.firstNames.charAt(0)}${g.lastNames.charAt(0)}`.toUpperCase() || '?';
  }

  /** Adultos del grupo con quienes puede viajar un menor. */
  adultsFor(minor: TraGuest): string[] {
    const adults = this.rec!.guests.filter(g => g !== minor && !this.minor(g) && fullName(g))
      .map(g => `${fullName(g)}${g.role === 'PRINCIPAL' ? ' (huésped principal)' : g.relationship ? ` (${g.relationship.toLowerCase()})` : ''}`);
    return [...adults, 'Otro adulto con autorización de los padres'];
  }

  // ── Edición ──
  changeUnit(u: TraUnit, unitId: string): void {
    this.rec!.guests.filter(g => g.unitId === u.unitId).forEach(g => g.unitId = unitId);
    u.unitId = unitId;
    u.accommodationType = this.units.find(x => x.id === unitId)?.type ?? u.accommodationType;
  }

  setCountry(t: TravelData, which: 'residence' | 'origin', countryId: string): void {
    if (which === 'residence') { t.residenceCountry = countryId; t.residenceCity = ''; }
    else { t.originCountry = countryId; t.originCity = ''; }
  }

  /** Al desmarcar "Usar información del principal" aparecen sus campos, precargados con los del principal. */
  setOwnTravel(g: TraGuest, own: boolean): void {
    if (own) g.travel = { ...this.principal.travel };
    g.ownTravel = own;
  }

  addCompanion(): void {
    this.rec!.guests.push(newCompanion(this.rec!, `${this.rec!.reservationId}-g${Date.now()}`));
  }

  removeCompanion(g: TraGuest): void {
    this.rec!.guests = this.rec!.guests.filter(x => x !== g);
  }

  openMinor(g: TraGuest): void {
    const c = g.minorCheck;
    this.minorForm = { guest: g, readonly: !!c?.verified, travelsWith: c?.travelsWith ?? '', support: c?.support ?? '', confirmed: false };
  }

  saveMinor(): void {
    const m = this.minorForm!;
    m.guest.minorCheck = {
      verified: true, travelsWith: m.travelsWith, support: m.support,
      verifiedBy: localStorage.getItem('sogo_role') || 'Administrador', verifiedAt: isoDateTime(),
    };
    this.minorForm = undefined;
  }

  // ── Guardar / validar ──
  save(): void {
    this.svc.saveRegistration(this.rec!.reservationId, this.rec!.units, this.rec!.guests);
    this.savedAt = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  validateAndContinue(): void {
    this.save();
    this.svc.markValidated(this.rec!.reservationId);
    this.router.navigate(['/dashboard/tra', this.rec!.reservationId, 'resumen']);
  }
}
