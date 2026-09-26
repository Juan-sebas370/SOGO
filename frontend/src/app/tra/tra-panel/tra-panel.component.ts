import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Reservation, ReservationType } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney, typeBadge } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';
import { downloadCsvFile } from '../../shared/documents';
import { TraService, TraRow } from '../tra.service';
import { TraGuest, TravelData, TraSend, TraViewStatus, LodgingUnit } from '../tra.model';
import { country, city, reasonLabel, docTypeLabel } from '../tra-catalogs';
import {
  Progress, progressOf, travelOf, inherits, isComplete, guestIssues, isMinor, needsSire, roleLabel, fullName,
  unitIdsFor, totalValue, statusLabel, statusBadge, sendBadge, fmtDoc, fmtStamp
} from '../tra-rules';

type Tab = 'TODAS' | 'BORRADOR' | 'LISTA_PARA_ENVIO' | 'REQUIERE_CORRECCION' | 'ERROR' | 'REPORTADA' | 'NO_APLICA';
type View = 'reserva' | 'principales' | 'acompanantes';

/** Un huésped con sus datos TRA ya resueltos (herencia, unidad, envío). */
interface GuestLine {
  guest:     TraGuest;
  role:      string;
  travel:    TravelData;
  inherited: boolean;
  rooms:     string;
  unitName:  string;
  complete:  boolean;
  issue?:    string;
  send?:     TraSend;
  minor:     boolean;
  sire:      boolean;
}

interface PanelRow {
  row:        TraRow;
  r:          Reservation;
  principal?: GuestLine;
  companions: GuestLine[];
  missing:    number;               // acompañantes que la reserva declara y aún no se registran
  progress?:  Progress;
  total:      number;
  note:       string;
  lastSend?:  string;
  mincitId?:  string;
  action?:    { label: string; link?: string[]; retry?: boolean };
  unitIds:    string[];
  index:      string;               // texto de búsqueda
}

/** Fila plana de la vista "Acompañantes": el acompañante y la reserva de su principal. */
interface CompanionRow { pr: PanelRow; line: GuestLine; }

const PAGE_SIZE = 10;
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Component({
  selector: 'app-tra-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tra-panel.component.css'],
  template: `
  <!-- Encabezado -->
  <header class="rsv-header">
    <div class="rsv-header-main">
      <span class="rsv-header-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4"/><line x1="14" y1="9" x2="18" y2="9"/><line x1="14" y1="13" x2="18" y2="13"/></svg>
      </span>
      <div>
        <span class="rsv-eyebrow">TRA</span>
        <h1 class="rsv-title">Tarjeta de Registro de Alojamiento</h1>
        <p class="rsv-subtitle">Registra a todos los huéspedes de cada estancia y repórtalos al MinCIT al hacer el check-in.</p>
      </div>
    </div>
    <div class="rsv-header-actions">
      <a routerLink="/dashboard/tra/config" class="rsv-btn rsv-btn--outline">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Configuración TRA
      </a>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="exportCsv()" [disabled]="!filtered.length">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar
      </button>
    </div>
  </header>

  <!-- Indicadores -->
  <section class="rsv-kpis">
    <button type="button" class="rsv-kpi" (click)="quick('TODAS', 'hoy')">
      <span class="rsv-kpi-icon rsv-kpi-icon--green"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Check-ins de hoy</span>
        <span class="rsv-kpi-value">{{ kpi.today }}</span>
        <span class="rsv-kpi-detail" [title]="kpi.todayDetail">{{ kpi.todayDetail }}</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="quick('LISTA_PARA_ENVIO')">
      <span class="rsv-kpi-icon rsv-kpi-icon--blue"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Listas para envío</span>
        <span class="rsv-kpi-value">{{ kpi.ready }}</span>
        <span class="rsv-kpi-detail">{{ kpi.readyGuests }} huésped{{ kpi.readyGuests === 1 ? '' : 'es' }} por reportar</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="quick('REQUIERE_CORRECCION')">
      <span class="rsv-kpi-icon rsv-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Requieren corrección</span>
        <span class="rsv-kpi-value">{{ kpi.toFix }}</span>
        <span class="rsv-kpi-detail">{{ kpi.toFixIssues }} dato{{ kpi.toFixIssues === 1 ? '' : 's' }} por corregir</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="quick('ERROR')">
      <span class="rsv-kpi-icon rsv-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Con error de envío</span>
        <span class="rsv-kpi-value">{{ kpi.errors }}</span>
        <span class="rsv-kpi-detail">{{ kpi.errorsDetail }}</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="quick('REPORTADA')">
      <span class="rsv-kpi-icon rsv-kpi-icon--emerald"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Reportadas ({{ monthName }})</span>
        <span class="rsv-kpi-value">{{ kpi.reported }}</span>
        <span class="rsv-kpi-detail">{{ kpi.reportedGuests }} huéspedes reportados</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="quick('TODAS', 'proximas')">
      <span class="rsv-kpi-icon rsv-kpi-icon--purple"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Pre-registro próximo</span>
        <span class="rsv-kpi-value">{{ kpi.preDone }} / {{ kpi.preExpected }}</span>
        <span class="rsv-kpi-detail">huéspedes en {{ kpi.preReservations }} reserva{{ kpi.preReservations === 1 ? '' : 's' }}</span>
      </span>
    </button>
  </section>

  <!-- Avisos de error de envío -->
  <div class="tra-alert tra-alert--danger" *ngFor="let e of errorAlerts">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div class="tra-alert-body">
      <strong>{{ e.r.code }} no se pudo reportar.</strong>
      {{ e.message }}
    </div>
    <div class="tra-alert-actions">
      <a class="rsv-btn rsv-btn--outline rsv-btn--sm" [routerLink]="['/dashboard/tra', e.r.id]">Ver detalle</a>
      <button type="button" class="rsv-btn rsv-btn--danger rsv-btn--sm" (click)="retry(e.r.id)">Reenviar ahora</button>
    </div>
  </div>

  <!-- Tabs + filtros + tabla -->
  <section class="rsv-panel rsv-board">
    <nav class="rsv-tabs" aria-label="Filtrar por estado TRA">
      <button type="button" *ngFor="let t of tabs" class="rsv-tab" [class.active]="tab === t" (click)="setTab(t)">
        {{ tabLabel(t) }} <span class="rsv-tab-count">{{ tabCounts[t] }}</span>
      </button>
    </nav>

    <div class="rsv-filters">
      <div class="rsv-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Buscar por reserva, huésped o documento (incluye acompañantes)">
      </div>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Check-in</span>
          <select [(ngModel)]="checkin" (ngModelChange)="apply()">
            <option value="">Todas las fechas</option>
            <option value="hoy">Hoy</option>
            <option value="proximas">Próximos</option>
            <option *ngFor="let m of months" [value]="m.value">{{ m.label }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Unidad</span>
          <select [(ngModel)]="unit" (ngModelChange)="apply()">
            <option value="">Todas</option>
            <option *ngFor="let u of units" [value]="u.id">{{ u.name }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="rsv-select">
        <span class="rsv-select-text">
          <span class="rsv-select-label">Tipo de reserva</span>
          <select [(ngModel)]="type" (ngModelChange)="apply()">
            <option value="">Todos</option>
            <option *ngFor="let t of typeOptions" [value]="t">{{ t }}</option>
          </select>
        </span>
        <svg class="rsv-select-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <button type="button" class="rsv-clear" (click)="clearFilters()">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        Limpiar filtros
      </button>
    </div>

    <!-- Vista: agrupada por reserva o por rol -->
    <div class="tp-viewbar">
      <div class="tp-segmented" role="radiogroup" aria-label="Huéspedes a mostrar">
        <button type="button" role="radio" *ngFor="let v of views" [attr.aria-checked]="view === v.id" [class.active]="view === v.id" (click)="setView(v.id)">
          {{ v.label }} <span>{{ viewCounts[v.id] }}</span>
        </button>
      </div>
      <p class="tp-legend">
        <span class="tp-legend-inh">Texto gris</span> = dato de viaje heredado del huésped principal (RN-03) · Códigos: país ISO, ciudad DANE, motivo MinCIT.
      </p>
      <button type="button" class="tp-expand-all" *ngIf="view === 'reserva'" (click)="toggleAll()">
        {{ allExpanded ? 'Contraer todo' : 'Desplegar acompañantes' }}
      </button>
    </div>

    <div class="rsv-table-wrap">
      <table class="rsv-table tp-table">
        <thead>
          <tr>
            <th class="tp-col-toggle" *ngIf="view === 'reserva'"></th>
            <th>Reserva</th>
            <th>Huésped</th>
            <th>Tipo doc.</th>
            <th>N.º documento</th>
            <th>País residencia</th>
            <th>Ciudad procedencia</th>
            <th>Ingreso</th>
            <th>Salida</th>
            <th>N.º habitación</th>
            <th class="tp-num">Tarifa alojamiento</th>
            <th>Motivo de viaje</th>
            <th>Estado TRA</th>
            <th>Envío MinCIT</th>
            <th class="rsv-col-actions">Acciones</th>
          </tr>
        </thead>

        <!-- Vista por reserva / solo principales -->
        <ng-container *ngIf="view !== 'acompanantes'">
          <tbody *ngFor="let p of pagedRows" [class.tp-open]="isOpen(p)">
            <tr class="tp-principal">
              <td class="tp-col-toggle" *ngIf="view === 'reserva'">
                <button type="button" class="tp-toggle" *ngIf="p.companions.length || p.missing" (click)="toggle(p)"
                        [attr.aria-expanded]="isOpen(p)" [attr.aria-label]="(isOpen(p) ? 'Ocultar' : 'Ver') + ' acompañantes de ' + p.r.code">
                  <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                  <span>{{ p.companions.length + p.missing }}</span>
                </button>
              </td>
              <td>
                <a class="rsv-code" [routerLink]="['/dashboard/tra', p.r.id]">{{ p.r.code }}</a>
                <span class="rsv-badge tp-type" [ngClass]="typeBadge(p.r.reservationType)">{{ p.r.reservationType }}</span>
                <span class="tp-progress" *ngIf="p.progress as pg" [title]="pg.done + ' de ' + pg.expected + ' huéspedes completos'">
                  <span class="tp-bar"><span [style.width.%]="pg.pct" [class.full]="pg.pct === 100"></span></span>{{ pg.done }}/{{ pg.expected }}
                </span>
              </td>
              <ng-container *ngIf="p.principal as g; else noGuest">
                <td>
                  <span class="tp-name">{{ g.guest.firstNames }} <strong>{{ g.guest.lastNames }}</strong></span>
                  <span class="tra-tag tra-tag--blue">Principal</span>
                  <span class="tra-sub" *ngIf="p.companions.length">{{ p.companions.length }} acompañante{{ p.companions.length === 1 ? '' : 's' }}</span>
                </td>
                <ng-container *ngTemplateOutlet="cells; context: { $implicit: g, tariff: p.total }"></ng-container>
              </ng-container>
              <ng-template #noGuest>
                <td><span class="tp-name">{{ p.r.guestName }}</span></td>
                <td colspan="9" class="tra-muted tp-na">Sin TRA: {{ p.note.toLowerCase() }}.</td>
              </ng-template>
              <td>
                <span class="rsv-badge" [ngClass]="statusBadge(p.row.status)">{{ statusLabel(p.row.status) }}</span>
                <span class="tra-sub tp-note" [title]="p.note">{{ p.note }}</span>
              </td>
              <td>
                <ng-container *ngIf="p.lastSend; else dash">
                  <span class="tp-nowrap">{{ stamp(p.lastSend) }}</span>
                  <span class="tra-sub tra-mono">{{ p.mincitId || 'Sin ID' }}{{ p.row.status === 'ERROR' ? ' (parcial)' : '' }}</span>
                </ng-container>
              </td>
              <td class="rsv-col-actions">
                <div class="rsv-actions">
                  <ng-container *ngIf="p.action as a">
                    <a *ngIf="a.link" class="rsv-btn rsv-btn--outline rsv-btn--sm" [routerLink]="a.link">{{ a.label }}</a>
                    <button *ngIf="a.retry" type="button" class="rsv-btn rsv-btn--danger-outline rsv-btn--sm" (click)="retry(p.r.id)">{{ a.label }}</button>
                  </ng-container>
                  <a *ngIf="p.row.record" class="rsv-icon-btn rsv-icon-btn--view" [routerLink]="['/dashboard/tra', p.r.id]" title="Ver detalle" aria-label="Ver detalle">
                    <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </a>
                </div>
              </td>
            </tr>

            <ng-container *ngIf="view === 'reserva' && isOpen(p)">
              <tr class="tp-companion" *ngFor="let c of p.companions">
                <td class="tp-col-toggle"></td>
                <td><span class="tp-role">↳ {{ c.role }}</span><span class="tra-sub">de {{ principalName(p) }}</span></td>
                <ng-container *ngTemplateOutlet="companionCells; context: { $implicit: c, pr: p }"></ng-container>
              </tr>
              <tr class="tp-companion tp-missing" *ngIf="p.missing">
                <td class="tp-col-toggle"></td>
                <td colspan="13">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ p.missing }} acompañante{{ p.missing === 1 ? '' : 's' }} sin registrar · la reserva declara {{ p.progress?.expected }} huéspedes.
                  <a *ngIf="p.row.record && editable(p)" [routerLink]="['/dashboard/tra', p.r.id, 'registro']">Registrar ahora</a>
                </td>
                <td></td>
              </tr>
            </ng-container>
          </tbody>
          <tbody *ngIf="!pagedRows.length"><tr><td colspan="15" class="rsv-empty">No hay reservas con los filtros aplicados.</td></tr></tbody>
        </ng-container>

        <!-- Vista solo acompañantes: cada uno indica su huésped principal y su reserva -->
        <tbody *ngIf="view === 'acompanantes'">
          <tr class="tp-companion tp-companion--flat" *ngFor="let c of pagedCompanions">
            <td>
              <a class="rsv-code" [routerLink]="['/dashboard/tra', c.pr.r.id]">{{ c.pr.r.code }}</a>
              <span class="tra-sub">Principal: <strong>{{ principalName(c.pr) }}</strong></span>
              <span class="tra-sub">{{ c.line.role }}</span>
            </td>
            <ng-container *ngTemplateOutlet="companionCells; context: { $implicit: c.line, pr: c.pr }"></ng-container>
          </tr>
          <tr *ngIf="!pagedCompanions.length"><td colspan="14" class="rsv-empty">No hay acompañantes con los filtros aplicados.</td></tr>
        </tbody>
      </table>
    </div>

    <footer class="rsv-pagination">
      <span class="rsv-pag-info">{{ pageInfo }}</span>
      <div class="rsv-pag-btns">
        <button type="button" class="rsv-pag-btn" [disabled]="page === 1" (click)="setPage(page - 1)" aria-label="Página anterior">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button type="button" *ngFor="let n of pages" class="rsv-pag-btn" [class.active]="n === page" (click)="setPage(n)">{{ n }}</button>
        <button type="button" class="rsv-pag-btn" [disabled]="page === totalPages" (click)="setPage(page + 1)" aria-label="Página siguiente">
          <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </footer>
  </section>

  <!-- Celdas TRA de un huésped (4.1–4.7 + 3.2 y 3.3) -->
  <ng-template #cells let-g let-tariff="tariff">
    <td><span class="tra-mono" [title]="docLabel(g.guest.docType)">{{ g.guest.docType || '—' }}</span></td>
    <td class="tp-nowrap">
      <span *ngIf="g.guest.docNumber; else noDoc">{{ doc(g.guest.docNumber) }}</span>
      <ng-template #noDoc><span class="tra-missing">Falta</span></ng-template>
    </td>
    <td [class.tp-inh]="g.inherited">
      <ng-container *ngIf="countryOf(g.travel.residenceCountry) as c; else dash">
        <span class="tra-mono">{{ c.isoNumeric }}</span><span class="tra-sub">{{ c.name }} · {{ cityName(g.travel.residenceCity) }}</span>
      </ng-container>
    </td>
    <td [class.tp-inh]="g.inherited">
      <ng-container *ngIf="cityOf(g.travel.originCity) as c; else dash">
        <span class="tra-mono">{{ c.daneCode || c.id }}</span><span class="tra-sub">{{ c.name }}</span>
      </ng-container>
    </td>
    <td class="tp-nowrap" [class.tp-inh]="g.inherited">{{ date(g.travel.checkIn) }}</td>
    <td class="tp-nowrap" [class.tp-inh]="g.inherited">{{ date(g.travel.checkOut) }}</td>
    <td><span class="tp-nowrap">{{ g.rooms }}</span><span class="tra-sub">{{ g.unitName }}</span></td>
    <td class="tp-num">
      <ng-container *ngIf="tariff !== null; else incl">{{ money(tariff) }}<span class="tra-sub">total estancia</span></ng-container>
      <ng-template #incl><span class="tra-muted">—</span></ng-template>
    </td>
    <td [class.tp-inh]="g.inherited">
      <ng-container *ngIf="g.travel.reasonId; else noReason">
        <span class="tra-mono">{{ g.travel.reasonId }}</span><span class="tra-sub tp-reason" [title]="reason(g.travel.reasonId)">{{ reason(g.travel.reasonId) }}</span>
      </ng-container>
      <ng-template #noReason><span class="tra-missing">Falta</span></ng-template>
    </td>
  </ng-template>

  <!-- Resto de la fila de un acompañante -->
  <ng-template #companionCells let-c let-pr="pr">
    <td>
      <span class="tp-name">{{ c.guest.firstNames || 'Sin nombre' }} <strong>{{ c.guest.lastNames }}</strong></span>
      <span class="tp-tags">
        <span class="tra-tag" *ngIf="c.inherited">Viaje del principal</span>
        <span class="tra-tag tp-tag-minor" *ngIf="c.minor">Menor</span>
        <span class="tra-tag tp-tag-sire" *ngIf="c.sire">SIRE</span>
      </span>
    </td>
    <ng-container *ngTemplateOutlet="cells; context: { $implicit: c, tariff: null }"></ng-container>
    <td>
      <ng-container *ngIf="c.send as s; else noSend">
        <span class="rsv-badge" [ngClass]="sendBadge(s.status)">{{ s.status }}</span>
        <span class="tra-sub">{{ s.endpoint === 'ONE' ? '/one/' : '/two/' }}{{ s.attempts > 1 ? ' · ' + s.attempts + ' intentos' : '' }}</span>
      </ng-container>
      <ng-template #noSend>
        <span class="rsv-badge" [ngClass]="c.complete ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ c.complete ? 'Completo' : 'Falta dato' }}</span>
        <span class="tra-sub tp-note" *ngIf="c.issue" [title]="c.issue">{{ c.issue }}</span>
      </ng-template>
    </td>
    <td>
      <ng-container *ngIf="c.send?.attemptAt; else dash">
        <span class="tp-nowrap">{{ stamp(c.send!.attemptAt) }}</span><span class="tra-sub">HTTP {{ c.send!.httpStatus }}</span>
      </ng-container>
    </td>
    <td class="rsv-col-actions">
      <a *ngIf="editable(pr)" class="rsv-icon-btn" [routerLink]="['/dashboard/tra', pr.r.id, 'registro']" title="Editar en el registro" aria-label="Editar en el registro">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </a>
    </td>
  </ng-template>

  <ng-template #dash><span class="tra-muted">—</span></ng-template>
  `
})
export class TraPanelComponent {

  readonly tabs: Tab[] = ['TODAS', 'BORRADOR', 'LISTA_PARA_ENVIO', 'REQUIERE_CORRECCION', 'ERROR', 'REPORTADA', 'NO_APLICA'];
  readonly views: { id: View; label: string }[] = [
    { id: 'reserva', label: 'Por reserva' },
    { id: 'principales', label: 'Huéspedes principales' },
    { id: 'acompanantes', label: 'Acompañantes' },
  ];
  readonly typeOptions: ReservationType[] = ['Individual', 'Grupo familiar', 'Grupo de trabajo', 'Evento / Pasadía'];

  // Plantilla
  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly doc = fmtDoc;
  readonly stamp = (s?: string) => fmtStamp(s);
  readonly typeBadge = typeBadge;
  readonly statusLabel = statusLabel;
  readonly statusBadge = statusBadge;
  readonly sendBadge = sendBadge;
  readonly reason = reasonLabel;
  readonly docLabel = docTypeLabel;
  readonly countryOf = country;
  readonly cityOf = city;
  readonly cityName = (id: string) => city(id)?.name ?? '—';

  readonly today = isoDate(0);
  readonly monthName = new Date().toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');

  all: PanelRow[] = [];
  filtered: PanelRow[] = [];
  pagedRows: PanelRow[] = [];
  pagedCompanions: CompanionRow[] = [];
  errorAlerts: { r: Reservation; message: string }[] = [];
  units: LodgingUnit[] = [];
  months: { value: string; label: string }[] = [];

  tab: Tab = 'TODAS';
  view: View = 'reserva';
  tabCounts = {} as Record<Tab, number>;
  viewCounts = {} as Record<View, number>;
  search = '';
  checkin = '';
  unit = '';
  type: ReservationType | '' = '';

  private expanded = new Set<string>();
  page = 1;
  totalPages = 1;
  pages: number[] = [];
  pageInfo = '';

  kpi = {
    today: 0, todayDetail: '', ready: 0, readyGuests: 0, toFix: 0, toFixIssues: 0,
    errors: 0, errorsDetail: '', reported: 0, reportedGuests: 0, preDone: 0, preExpected: 0, preReservations: 0,
  };

  constructor(private svc: TraService) {
    this.svc.getRows().subscribe(rows => {
      this.units = this.svc.getUnits();
      this.all = rows.map(row => this.toPanelRow(row));
      this.months = this.monthOptions();
      this.computeKpis();
      this.apply(false);
    });
  }

  // ── Construcción de filas ──
  private toPanelRow(row: TraRow): PanelRow {
    const { reservation: r, record: rec } = row;
    const unitIds = rec ? rec.units.map(u => u.unitId) : unitIdsFor(r);
    const base: PanelRow = {
      row, r, companions: [], missing: 0, total: r.lodgingAmount, note: '', unitIds,
      index: norm(`${r.code} ${r.guestName} ${r.docNumber}`),
    };
    if (!rec || row.status === 'NO_APLICA') {
      return { ...base, note: r.reservationType === 'Evento / Pasadía' ? 'Pasadía sin pernoctación' : `Reserva ${r.status.toLowerCase()}` };
    }

    const lines = rec.guests.map((g): GuestLine => {
      const unit = this.units.find(u => u.id === g.unitId);
      return {
        guest: g, role: roleLabel(rec, g), travel: travelOf(rec, g), inherited: inherits(g),
        rooms: unit?.rooms.join(', ') ?? '—', unitName: unit?.name ?? 'Sin unidad',
        complete: isComplete(rec, g), issue: guestIssues(rec, g)[0]?.replace(/ del (acompañante \d+|huésped principal)$/, ''),
        send: rec.sends.find(s => s.guestId === g.id),
        minor: isMinor(rec, g), sire: needsSire(g),
      };
    });
    const progress = progressOf(rec, r);
    const sent = rec.sends.filter(s => s.attemptAt).sort((a, b) => a.attemptAt!.localeCompare(b.attemptAt!));
    const failed = rec.sends.find(s => s.status === 'ERROR');

    return {
      ...base, progress, principal: lines[0], companions: lines.slice(1),
      missing: Math.max(0, progress.expected - rec.guests.length),
      total: totalValue(rec),
      note: this.noteFor(row, failed),
      lastSend: sent[sent.length - 1]?.attemptAt,
      mincitId: rec.sends[0]?.mincitId,
      action: this.actionFor(row),
      index: norm(`${r.code} ${rec.guests.map(g => `${fullName(g)} ${g.docNumber}`).join(' ')}`),
    };
  }

  private noteFor(row: TraRow, failed?: TraSend): string {
    const { reservation: r, record: rec } = row;
    const when = r.checkIn === this.today ? 'Check-in hoy' : r.checkIn > this.today ? `Check-in ${fmtDate(r.checkIn).slice(0, 5)}` : 'Check-in pasado';
    switch (row.status) {
      case 'BORRADOR':            return r.checkIn > this.today ? 'Pre-registro' : when;
      case 'LISTA_PARA_ENVIO':    return when;
      case 'REQUIERE_CORRECCION': return this.svc.validation(r.id)?.issues[0]?.message ?? 'Revisa los datos';
      case 'ENVIANDO':            return 'Enviando al MinCIT…';
      case 'ERROR':               return `HTTP ${failed?.httpStatus || 'sin respuesta'} · ${failed?.attempts ?? 1} intento${failed?.attempts === 1 ? '' : 's'}`;
      case 'REPORTADA':           return `${rec!.sends.length} de ${rec!.sends.length} exitosos`;
      default:                    return '';
    }
  }

  private actionFor(row: TraRow): PanelRow['action'] {
    const id = row.reservation.id;
    switch (row.status) {
      case 'BORRADOR':            return { label: 'Completar', link: ['/dashboard/tra', id, 'registro'] };
      case 'REQUIERE_CORRECCION': return { label: 'Corregir',  link: ['/dashboard/tra', id, 'registro'] };
      case 'LISTA_PARA_ENVIO':    return { label: 'Enviar',    link: ['/dashboard/tra', id, 'resumen'] };
      case 'ERROR':               return { label: 'Reenviar',  retry: true };
      case 'REPORTADA':           return { label: 'Ver',       link: ['/dashboard/tra', id] };
      default:                    return undefined;
    }
  }

  // ── Filtros ──
  private inTab(p: PanelRow, t: Tab): boolean {
    return t === 'TODAS' || p.row.status === t;
  }

  tabLabel(t: Tab): string {
    return t === 'TODAS' ? 'Todas' : t === 'REPORTADA' ? 'Reportadas' : statusLabel(t);
  }

  apply(resetPage = true): void {
    const q = norm(this.search.trim());
    const base = this.all.filter(p =>
      (!q || p.index.includes(q)) &&
      (!this.unit || p.unitIds.includes(this.unit)) &&
      (!this.type || p.r.reservationType === this.type) &&
      this.matchCheckin(p.r)
    );
    this.tabs.forEach(t => this.tabCounts[t] = base.filter(p => this.inTab(p, t)).length);
    this.filtered = base.filter(p => this.inTab(p, this.tab));

    // Si la búsqueda coincide con un acompañante, su reserva se despliega
    if (q) this.filtered.filter(p => p.companions.some(c => norm(`${fullName(c.guest)} ${c.guest.docNumber}`).includes(q))).forEach(p => this.expanded.add(p.r.id));

    this.viewCounts = {
      reserva: this.filtered.length,
      principales: this.filtered.filter(p => p.principal).length,
      acompanantes: this.companionRows().length,
    };
    if (resetPage) this.page = 1;
    this.paginate();
  }

  private matchCheckin(r: Reservation): boolean {
    if (!this.checkin) return true;
    if (this.checkin === 'hoy') return r.checkIn === this.today;
    if (this.checkin === 'proximas') return r.checkIn > this.today;
    return r.checkIn.startsWith(this.checkin);
  }

  private monthOptions(): { value: string; label: string }[] {
    const months = [...new Set(this.all.map(p => p.r.checkIn.slice(0, 7)))].sort().reverse();
    return months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const label = new Date(y, mo - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      return { value: m, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }

  setTab(t: Tab): void { this.tab = t; this.apply(); }
  setView(v: View): void { this.view = v; this.apply(); }

  quick(t: Tab, checkin = ''): void {
    this.search = ''; this.unit = ''; this.type = '';
    this.checkin = checkin;
    this.tab = t;
    this.apply();
  }

  clearFilters(): void { this.quick('TODAS'); }

  // ── Vistas ──
  private companionRows(): CompanionRow[] {
    return this.filtered.flatMap(pr => pr.companions.map(line => ({ pr, line })));
  }

  private paginate(): void {
    const source: unknown[] = this.view === 'acompanantes' ? this.companionRows()
      : this.view === 'principales' ? this.filtered.filter(p => p.principal) : this.filtered;
    this.totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
    this.page = Math.min(this.page, this.totalPages);
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    const slice = <T>(list: T[]) => list.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE);

    if (this.view === 'acompanantes') this.pagedCompanions = slice(source as CompanionRow[]);
    else this.pagedRows = slice(source as PanelRow[]);

    const noun = this.view === 'acompanantes' ? 'acompañantes' : this.view === 'principales' ? 'huéspedes principales' : 'reservas';
    const shown = this.view === 'acompanantes' ? this.pagedCompanions.length : this.pagedRows.length;
    this.pageInfo = `Mostrando ${shown} de ${source.length} ${noun}`;
  }

  setPage(n: number): void {
    if (n < 1 || n > this.totalPages) return;
    this.page = n;
    this.paginate();
  }

  isOpen(p: PanelRow): boolean { return this.expanded.has(p.r.id); }

  toggle(p: PanelRow): void {
    this.expanded.has(p.r.id) ? this.expanded.delete(p.r.id) : this.expanded.add(p.r.id);
  }

  get allExpanded(): boolean {
    const groups = this.pagedRows.filter(p => p.companions.length || p.missing);
    return groups.length > 0 && groups.every(p => this.expanded.has(p.r.id));
  }

  toggleAll(): void {
    const open = !this.allExpanded;
    this.pagedRows.forEach(p => open ? this.expanded.add(p.r.id) : this.expanded.delete(p.r.id));
  }

  principalName(p: PanelRow): string {
    return p.principal ? fullName(p.principal.guest) : p.r.guestName;
  }

  editable(p: PanelRow): boolean {
    return !!p.row.record && this.svc.isEditable(p.row.record);
  }

  // ── Acciones ──
  retry(reservationId: string): void {
    this.svc.retry(reservationId);
  }

  exportCsv(): void {
    const header = ['Reserva', 'Rol', 'Huésped principal', 'Tipo de documento', 'Número de documento', 'Nombres', 'Apellidos',
      'ID país residencia', 'País residencia', 'ID ciudad residencia', 'Ciudad residencia', 'ID ciudad procedencia', 'Ciudad procedencia',
      'Fecha ingreso', 'Fecha salida', 'Número habitación', 'Unidad', 'Tarifa alojamiento', 'ID motivo de viaje', 'Motivo de viaje',
      'Dato heredado', 'Estado TRA', 'Estado envío', 'HTTP', 'ID MinCIT'];
    const lines = this.filtered.flatMap(p => {
      const guests = [p.principal, ...p.companions].filter((g): g is GuestLine => !!g)
        .filter(g => this.view === 'reserva' || (this.view === 'principales') === (g.guest.role === 'PRINCIPAL'));
      return guests.map(g => {
        const t = g.travel;
        return [
          p.r.code, g.role, this.principalName(p), g.guest.docType, g.guest.docNumber, g.guest.firstNames, g.guest.lastNames,
          country(t.residenceCountry)?.isoNumeric ?? '', country(t.residenceCountry)?.name ?? '', t.residenceCity, city(t.residenceCity)?.name ?? '',
          t.originCity, city(t.originCity)?.name ?? '', fmtDate(t.checkIn), fmtDate(t.checkOut), g.rooms, g.unitName,
          g.guest.role === 'PRINCIPAL' ? p.total : '', t.reasonId ?? '', reasonLabel(t.reasonId),
          g.inherited ? 'Sí' : 'No', statusLabel(p.row.status), g.send?.status ?? '', g.send?.httpStatus ?? '', g.send?.mincitId ?? '',
        ];
      });
    });
    downloadCsvFile([header, ...lines], `tra-huespedes-${this.today}.csv`);
  }

  // ── Indicadores y avisos ──
  private computeKpis(): void {
    const k = this.kpi;
    const withTra = this.all.filter(p => p.row.record && p.row.status !== 'NO_APLICA');
    const is = (s: TraViewStatus) => withTra.filter(p => p.row.status === s);

    const todays = withTra.filter(p => p.r.checkIn === this.today);
    k.today = todays.length;
    const parts = ([['LISTA_PARA_ENVIO', 'lista'], ['REQUIERE_CORRECCION', 'requiere corrección'], ['ERROR', 'con error'], ['REPORTADA', 'reportada'], ['BORRADOR', 'en borrador']] as [TraViewStatus, string][])
      .map(([s, label]) => [todays.filter(p => p.row.status === s).length, label] as const)
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${n} ${label}`);
    k.todayDetail = parts.join(' · ') || 'Sin llegadas hoy';

    k.ready = is('LISTA_PARA_ENVIO').length;
    k.readyGuests = is('LISTA_PARA_ENVIO').reduce((s, p) => s + (p.row.record?.guests.length ?? 0), 0);

    const toFix = is('REQUIERE_CORRECCION');
    k.toFix = toFix.length;
    k.toFixIssues = toFix.reduce((s, p) => s + (this.svc.validation(p.r.id)?.issues.length ?? 0), 0);

    const errors = is('ERROR');
    k.errors = errors.length;
    const next = errors.map(p => this.svc.nextRetry(p.row.record!)).filter(Boolean).sort()[0];
    k.errorsDetail = !errors.length ? 'Sin errores' : next ? `Reintento automático ${next.slice(11, 16)}` : 'Requiere reenvío manual';

    const month = this.today.slice(0, 7);
    const reported = is('REPORTADA').filter(p => (p.row.record!.checkInAt ?? '').startsWith(month));
    k.reported = reported.length;
    k.reportedGuests = reported.reduce((s, p) => s + p.row.record!.guests.length, 0);

    const upcoming = withTra.filter(p => p.r.checkIn > this.today && p.progress);
    k.preReservations = upcoming.length;
    k.preDone = upcoming.reduce((s, p) => s + p.progress!.done, 0);
    k.preExpected = upcoming.reduce((s, p) => s + p.progress!.expected, 0);

    this.errorAlerts = errors.map(p => ({ r: p.r, message: this.errorMessage(p) }));
  }

  private errorMessage(p: PanelRow): string {
    const rec = p.row.record!;
    const failed = rec.sends.find(s => s.status === 'ERROR');
    const guestIndex = failed ? rec.guests.findIndex(g => g.id === failed.guestId) : -1;
    const where = failed?.endpoint === 'ONE'
      ? 'en el huésped principal (/one/), así que no se enviaron los acompañantes'
      : `en el acompañante ${guestIndex} de ${rec.guests.length - 1}`;
    const next = this.svc.nextRetry(rec);
    return `MinCIT respondió HTTP ${failed?.httpStatus || 'sin respuesta'} ${where}. La TRA local está guardada` +
      (next ? ` y se reintentará automáticamente a las ${next.slice(11, 16)}.` : '; los reintentos automáticos se agotaron, reenvíala manualmente.');
  }
}
