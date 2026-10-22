import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Reservation } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney, typeBadge } from '../../reservations/reservation-format';
import { isoDateTime } from '../../shared/date-utils';
import { esc, openDocument } from '../../shared/documents';
import { TraService } from '../tra.service';
import { TraRecord, TraGuest, TraSend, TraViewStatus, LodgingUnit } from '../tra.model';
import {
  roleLabel, fullName, fmtDoc, fmtStamp, needsSire, nightsBetween, totalValue, statusLabel, statusBadge, sendBadge
} from '../tra-rules';
import { TraStepperComponent } from '../tra-stepper/tra-stepper.component';

@Component({
  selector: 'app-tra-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, TraStepperComponent],
  styleUrls: ['./tra-detail.component.css'],
  template: `
  <ng-container *ngIf="rec && r; else notFound">
  <header class="rsv-header">
    <div>
      <span class="rsv-eyebrow"><a routerLink="/dashboard/tra">TRA</a><span aria-hidden="true">/</span>{{ r.code }}</span>
      <h1 class="rsv-title">Detalle TRA</h1>
      <p class="rsv-subtitle">Trazabilidad completa del reporte al MinCIT: qué se envió, cuándo y qué respondió.</p>
    </div>
    <div class="rsv-header-actions">
      <a *ngIf="editable" class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/tra', r.id, 'registro']">Registro de huéspedes</a>
      <a *ngIf="editable" class="rsv-btn rsv-btn--primary" [routerLink]="['/dashboard/tra', r.id, 'resumen']">Ir al resumen</a>
      <button *ngIf="status === 'ERROR'" type="button" class="rsv-btn rsv-btn--danger" (click)="retry()">Reenviar</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!rec.sends.length" (click)="downloadReceipt()">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Descargar comprobante
      </button>
    </div>
  </header>

  <!-- Estado del envío -->
  <section class="tra-card td-status" [ngClass]="'td-status--' + tone">
    <span class="td-status-icon">
      <svg *ngIf="tone === 'ok'" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      <svg *ngIf="tone === 'danger'" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <svg *ngIf="tone === 'info' || tone === 'muted'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
    </span>
    <div><span>Estado de la TRA</span><span class="rsv-badge" [ngClass]="statusBadge(status)">{{ statusLabel(status) }}</span></div>
    <div><span>Fecha de envío</span><strong>{{ first?.attemptAt ? dateTime(first!.attemptAt!) : 'Sin enviar' }}</strong></div>
    <div><span>Respuesta</span><strong>{{ response }}</strong></div>
    <div><span>ID MinCIT</span><strong class="tra-mono">{{ first?.mincitId || '—' }}</strong></div>
    <div><span>Intentos</span><strong>{{ attempts || '—' }}</strong></div>
    <div><span>Enviado por</span><strong>{{ rec.sentBy || '—' }}</strong></div>
    <app-tra-stepper *ngIf="editable" [reservationId]="r.id" [step]="3"></app-tra-stepper>
  </section>

  <div class="tra-layout">
    <div class="tra-main">
      <section class="tra-card tra-strip td-info">
        <div><span>Tipo</span><span class="rsv-badge" [ngClass]="typeBadge(r.reservationType)">{{ r.reservationType }}</span></div>
        <div><span>Unidad</span><strong>{{ unitNames }}</strong></div>
        <div><span>Estancia</span><strong>{{ short(r.checkIn) }} → {{ date(r.checkOut) }} · {{ nights }} noche{{ nights === 1 ? '' : 's' }}</strong></div>
        <div><span>Huéspedes</span><strong>{{ rec.guests.length }}</strong></div>
        <div><span>Valor total alojamiento</span><strong>{{ money(total) }}</strong></div>
      </section>

      <!-- Un envío por huésped -->
      <section class="tra-card tra-card--flush">
        <div class="tra-card-head">
          <h2 class="tra-card-title">Envíos por huésped</h2>
          <span class="tra-card-sub">Un registro de auditoría por cada petición</span>
        </div>
        <div class="tra-table-wrap" *ngIf="rec.sends.length; else notSent">
          <table class="tra-table td-table">
            <thead>
              <tr><th>Rol</th><th>Huésped</th><th>Documento</th><th>Endpoint</th><th>Estado envío</th><th>HTTP</th><th>Fecha</th><th class="td-right">Acciones</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of rec.sends; let i = index" [class.fail]="s.status === 'ERROR'" [class.td-selected]="i === selected">
                <td><span class="rsv-badge" [ngClass]="i === 0 ? 'rsv-badge--info' : 'rsv-badge--muted'">{{ role(s) }}</span></td>
                <td>{{ name(s) }}</td>
                <td class="td-nowrap">{{ guest(s)?.docType }} {{ doc(guest(s)?.docNumber || '') }}</td>
                <td><code class="tra-mono">{{ s.endpoint === 'ONE' ? '/one/' : '/two/' }}</code></td>
                <td>
                  <span class="rsv-badge" [ngClass]="sendBadge(s.status)">{{ s.status }}</span>
                  <span class="tra-sub">{{ sendNote(s, i) }}</span>
                </td>
                <td><strong class="tra-mono" [class.td-http-ok]="s.httpStatus === 200" [class.td-http-err]="s.httpStatus && s.httpStatus !== 200">{{ s.httpStatus ?? '—' }}</strong></td>
                <td class="td-nowrap">{{ stamp(s.attemptAt) || '—' }}</td>
                <td class="td-right"><button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" [disabled]="!s.attemptAt" (click)="selected = i; tab = 'response'">Ver respuesta</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <ng-template #notSent>
          <p class="tra-empty">Aún no se ha enviado: la TRA se envía al confirmar el check-in ({{ date(r.checkIn) }}).</p>
        </ng-template>
      </section>

      <!-- Petición / respuesta seleccionada -->
      <section class="tra-card" *ngIf="selectedSend as s">
        <div class="tra-card-head">
          <h2 class="tra-card-title">Request / response</h2>
          <div class="td-tabs">
            <button type="button" [class.active]="tab === 'request'" (click)="tab = 'request'">POST {{ s.endpoint === 'ONE' ? '/one/' : '/two/' }} · {{ name(s) }}</button>
            <button type="button" [class.active]="tab === 'response'" (click)="tab = 'response'">Respuesta</button>
          </div>
        </div>
        <p class="td-meta">requestId <code class="tra-mono">{{ s.requestId || '—' }}</code> · HTTP <strong>{{ s.httpStatus ?? '—' }}</strong> · Duración {{ s.durationMs ? s.durationMs + ' ms' : '—' }}</p>
        <pre class="td-code" *ngIf="tab === 'request'">POST https://pms.mincit.gov.co/{{ s.endpoint === 'ONE' ? 'one' : 'two' }}/
[Cuerpo de la petición según el manual técnico PMS vigente de MinCIT]
<ng-container *ngIf="s.endpoint === 'TWO'">Incluye el ID del registro que devolvió /one/: {{ s.mincitId || 'pendiente' }}
</ng-container>Token: se agrega en el servidor · nunca se guarda en el log</pre>
        <pre class="td-code" *ngIf="tab === 'response'">HTTP {{ s.httpStatus ?? 'sin respuesta' }} · {{ s.message || '—' }}
<ng-container *ngIf="s.endpoint === 'ONE' && s.mincitId">ID del registro: {{ s.mincitId }}
</ng-container>[Cuerpo de la respuesta según el manual técnico PMS vigente de MinCIT]</pre>
      </section>
    </div>

    <aside class="tra-aside">
      <section class="tra-card">
        <h2 class="tra-card-title">Historial (auditoría)</h2>
        <ol class="td-timeline">
          <li *ngFor="let e of rec.history" [ngClass]="'td-ev--' + e.tone">
            <strong>{{ e.title }}</strong>
            <span>{{ stamp(e.at, true) }}{{ e.detail ? ' · ' + e.detail : '' }}</span>
          </li>
          <li *ngIf="!rec.history.length" class="td-ev--muted"><span>Sin movimientos todavía.</span></li>
        </ol>
      </section>

      <section class="tra-card">
        <div class="tra-card-head">
          <h2 class="tra-card-title">SIRE · Migración Colombia</h2>
          <span class="rsv-badge" [ngClass]="foreigners.length ? 'rsv-badge--warn' : 'rsv-badge--muted'">{{ foreigners.length ? 'Aplica' : 'No aplica' }}</span>
        </div>
        <p class="td-sire" *ngIf="foreigners.length">
          {{ foreigners.length }} huésped{{ foreigners.length === 1 ? '' : 'es' }} con documento extranjero ({{ foreignerNames }}) se reporta{{ foreigners.length === 1 ? '' : 'n' }} a Migración Colombia en el módulo SIRE.
        </p>
        <p class="td-sire" *ngIf="!foreigners.length">En esta reserva todos los huéspedes tienen documento colombiano.</p>
        <p class="td-sire tra-muted">Módulo independiente de la TRA: lee los mismos datos del huésped, pero tiene su propio estado, envío y auditoría. Aún no está disponible en SOGO.</p>
      </section>
    </aside>
  </div>
  </ng-container>

  <ng-template #notFound>
    <p class="tra-empty">No existe una TRA para esta reserva. <a routerLink="/dashboard/tra">Volver al panel</a></p>
  </ng-template>
  `
})
export class TraDetailComponent {

  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly money = fmtMoney;
  readonly doc = fmtDoc;
  readonly stamp = fmtStamp;
  readonly short = (iso: string) => fmtDate(iso).slice(0, 5);
  readonly typeBadge = typeBadge;
  readonly statusLabel = statusLabel;
  readonly statusBadge = statusBadge;
  readonly sendBadge = sendBadge;

  r?: Reservation;
  rec?: TraRecord;
  status: TraViewStatus = 'NO_APLICA';
  editable = false;
  selected = 0;
  tab: 'request' | 'response' = 'request';
  private units: LodgingUnit[] = [];

  constructor(private svc: TraService, route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id')!;
    this.svc.getRows().subscribe(() => {
      const row = this.svc.row(id);
      this.r = row?.reservation;
      this.rec = row?.record;
      this.status = row?.status ?? 'NO_APLICA';
      this.units = this.svc.getUnits();
      this.editable = !!this.rec && this.svc.isEditable(this.rec);
    });
    // Abre directamente el envío que falló, si lo hay
    const failed = this.rec?.sends.findIndex(s => s.status === 'ERROR') ?? -1;
    if (failed > 0) { this.selected = failed; this.tab = 'response'; }
  }

  get tone(): 'ok' | 'danger' | 'info' | 'muted' {
    return this.status === 'REPORTADA' ? 'ok' : this.status === 'ERROR' ? 'danger' : this.status === 'ENVIANDO' ? 'info' : 'muted';
  }

  get response(): string {
    const sends = this.rec!.sends.filter(s => s.attemptAt);
    if (!sends.length) return '—';
    const failed = sends.find(s => s.status === 'ERROR');
    return failed ? `HTTP ${failed.httpStatus || 'sin respuesta'}` : '200 OK';
  }

  /** Envío del principal (/one/): fecha de envío e ID MinCIT de toda la TRA. */
  get first(): TraSend | undefined { return this.rec!.sends.find(s => s.endpoint === 'ONE'); }
  get attempts(): number { return Math.max(0, ...this.rec!.sends.map(s => s.attempts)); }
  get nights(): number { return nightsBetween(this.r!.checkIn, this.r!.checkOut); }
  get total(): number { return totalValue(this.rec!); }
  get unitNames(): string { return this.rec!.units.map(u => this.units.find(x => x.id === u.unitId)?.name ?? '—').join(' + '); }
  get selectedSend(): TraSend | undefined { return this.rec!.sends[this.selected]?.attemptAt ? this.rec!.sends[this.selected] : undefined; }
  get foreigners(): TraGuest[] { return this.rec!.guests.filter(needsSire); }
  get foreignerNames(): string { return this.foreigners.map(fullName).join(', '); }

  guest(s: TraSend): TraGuest | undefined { return this.rec!.guests.find(g => g.id === s.guestId); }
  name(s: TraSend): string { const g = this.guest(s); return g ? fullName(g) : '—'; }
  role(s: TraSend): string { const g = this.guest(s); return g ? roleLabel(this.rec!, g, true) : ''; }

  sendNote(s: TraSend, i: number): string {
    if (s.status === 'ERROR') return s.message ?? '';
    if (s.status !== 'EXITOSO') return i === 0 ? 'Devuelve el ID del registro' : 'Espera el ID de /one/';
    return i === 0 ? `ID ${s.mincitId}` : 'Con ID del principal';
  }

  retry(): void { this.svc.retry(this.r!.id); }

  /** Comprobante imprimible del reporte (Guardar como PDF desde el navegador). */
  downloadReceipt(): void {
    const r = this.r!, rec = this.rec!;
    const rows = rec.sends.map(s => `<tr><td>${esc(this.role(s))}</td><td>${esc(this.name(s))}</td>
      <td>${esc(this.guest(s)?.docType)} ${esc(fmtDoc(this.guest(s)?.docNumber ?? ''))}</td><td>${s.endpoint === 'ONE' ? '/one/' : '/two/'}</td>
      <td>${esc(s.status)}</td><td>${esc(s.httpStatus ?? '')}</td><td>${esc(fmtStamp(s.attemptAt, true))}</td></tr>`).join('');
    openDocument(`TRA ${r.code}`, `
      <header><div><h1>Comprobante de reporte TRA</h1><div class="muted">Reserva ${esc(r.code)} · generado el ${esc(fmtDateTime(isoDateTime()))}</div></div>
      <div class="brand">SOGO<div class="muted" style="font-size:11px;font-weight:400">${esc(this.svc.getSettings().provider)} · RNT ${esc(this.svc.getSettings().rnt)}</div></div></header>
      <h2>Reporte</h2><table>
        <tr><th style="width:38%">Estado</th><td>${esc(statusLabel(this.status))}</td></tr>
        <tr><th>ID MinCIT</th><td>${esc(rec.sends[0]?.mincitId ?? '—')}</td></tr>
        <tr><th>Check-in confirmado</th><td>${esc(rec.checkInAt ? fmtDateTime(rec.checkInAt) : '—')}</td></tr>
        <tr><th>Enviado por</th><td>${esc(rec.sentBy ?? '—')}</td></tr>
      </table>
      <h2>Estancia</h2><table>
        <tr><th style="width:38%">Unidad</th><td>${esc(this.unitNames)}</td></tr>
        <tr><th>Entrada · salida</th><td>${esc(fmtDate(r.checkIn))} · ${esc(fmtDate(r.checkOut))} (${this.nights} noches)</td></tr>
        <tr><th>Valor total alojamiento</th><td>${esc(fmtMoney(this.total))}</td></tr>
      </table>
      <h2>Envíos por huésped</h2><table><tr><th>Rol</th><th>Huésped</th><th>Documento</th><th>Endpoint</th><th>Estado</th><th>HTTP</th><th>Fecha</th></tr>${rows}</table>
      <p class="muted" style="margin-top:24px">Información reportada al Ministerio de Comercio, Industria y Turismo según la Res. 409 de 2022. Documento con datos personales: circulación restringida.</p>`, true);
  }
}
