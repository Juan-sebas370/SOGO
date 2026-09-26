import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Reservation } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney } from '../../reservations/reservation-format';
import { TraService } from '../tra.service';
import { TraRecord, TraGuest, LodgingUnit } from '../tra.model';
import { country, city, reasonLabel, accommodationLabel } from '../tra-catalogs';
import {
  Validation, travelOf, inherits, isComplete, roleLabel, fullName, fmtDoc, nightsBetween, totalValue
} from '../tra-rules';
import { TraStepperComponent } from '../tra-stepper/tra-stepper.component';

@Component({
  selector: 'app-tra-summary',
  standalone: true,
  imports: [CommonModule, RouterLink, TraStepperComponent],
  styleUrls: ['./tra-summary.component.css'],
  template: `
  <ng-container *ngIf="rec && r && v; else notFound">
  <header class="rsv-header">
    <div>
      <span class="rsv-eyebrow"><a routerLink="/dashboard/tra">TRA</a><span aria-hidden="true">/</span>{{ r.code }}</span>
      <h1 class="rsv-title">Resumen TRA</h1>
      <p class="rsv-subtitle">Revisa lo que se enviará al MinCIT. Solo podrás enviar cuando todo esté correcto.</p>
    </div>
    <app-tra-stepper [reservationId]="r.id" [step]="2"></app-tra-stepper>
  </header>

  <!-- Estado de la validación -->
  <div class="tra-alert tra-alert--danger" *ngIf="!v.ok">
    <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div class="tra-alert-body">
      <strong>TRA no enviada: {{ v.issues.length }} problema{{ v.issues.length === 1 ? '' : 's' }} por corregir</strong>
      <ul><li *ngFor="let i of v.issues.slice(0, 4)">{{ issueText(i) }}</li></ul>
    </div>
    <div class="tra-alert-actions">
      <a class="rsv-btn rsv-btn--danger" [routerLink]="['/dashboard/tra', r.id, 'registro']">Corregir información</a>
    </div>
  </div>
  <div class="tra-alert tra-alert--info" *ngIf="v.ok && !checkInReached">
    <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    <div class="tra-alert-body"><strong>Todo correcto: la TRA queda lista para envío.</strong>Se enviará al confirmar el check-in, a partir del {{ date(r.checkIn) }} (nunca al crear la reserva).</div>
  </div>
  <div class="tra-alert tra-alert--ok" *ngIf="v.ok && checkInReached">
    <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    <div class="tra-alert-body"><strong>Todo correcto.</strong>Confirma el check-in para enviar la TRA al MinCIT.</div>
  </div>

  <div class="tra-layout">
    <div class="tra-main">
      <!-- 8 verificaciones -->
      <section class="tra-card">
        <div class="tra-card-head">
          <h2 class="tra-card-title">Validación previa al envío</h2>
          <span class="rsv-badge" [ngClass]="v.ok ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ v.passed }} de {{ v.checks.length }} correctas</span>
        </div>
        <div class="tra-checks">
          <div class="tra-checkitem" *ngFor="let c of v.checks" [class.fail]="!c.ok">
            <svg *ngIf="c.ok" class="tra-icon tra-icon--ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
            <svg *ngIf="!c.ok" class="tra-icon tra-icon--danger" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div><strong>{{ c.label }}</strong><span>{{ c.detail }}</span></div>
          </div>
        </div>
      </section>

      <!-- Lo que se enviará -->
      <section class="tra-card tra-card--flush">
        <div class="tra-card-head">
          <div>
            <h2 class="tra-card-title">Huéspedes a reportar ({{ rec.guests.length }})</h2>
            <p class="tra-card-sub">Solo los campos TRA 4.1–4.7. <span class="tra-tag">Heredado</span> = replicado del huésped principal.</p>
          </div>
        </div>
        <div class="tra-table-wrap">
          <table class="tra-table ts-table">
            <thead>
              <tr>
                <th>Rol</th><th>Documento</th><th>Nombres y apellidos</th><th>Residencia</th><th>Procedencia</th>
                <th>Motivo</th><th>Entrada → salida</th><th>Habitación</th><th>Endpoint</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let g of rec.guests" [class.fail]="!complete(g)">
                <td><span class="rsv-badge" [ngClass]="g.role === 'PRINCIPAL' ? 'rsv-badge--info' : 'rsv-badge--muted'">{{ role(g) }}</span></td>
                <td class="ts-nowrap"><strong>{{ g.docType || '—' }}</strong> <span *ngIf="g.docNumber; else noNumber">{{ doc(g.docNumber) }}</span>
                  <ng-template #noNumber><span class="tra-missing">Falta número</span></ng-template></td>
                <td>{{ g.firstNames }} <strong>{{ g.lastNames }}</strong></td>
                <td>{{ place(g, 'residence') }} <span class="tra-tag" *ngIf="inherits(g)">Heredado</span></td>
                <td>{{ place(g, 'origin') }} <span class="tra-tag" *ngIf="inherits(g)">Heredado</span></td>
                <td>{{ reasonOf(g) }}</td>
                <td class="ts-nowrap">{{ short(travel(g).checkIn) }} → {{ short(travel(g).checkOut) }}</td>
                <td>{{ roomsOf(g.unitId) }}</td>
                <td><code class="tra-mono">{{ g.role === 'PRINCIPAL' ? '/one/' : '/two/' }}</code></td>
                <td><span class="rsv-badge" [ngClass]="complete(g) ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ complete(g) ? 'Listo' : 'Corregir' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="tra-aside">
      <section class="tra-card">
        <span class="ts-eyebrow">Reserva</span>
        <a class="rsv-code ts-code" [routerLink]="['/dashboard/reservations', r.id]">{{ r.code }}</a>
        <dl class="tra-dl">
          <div><dt>Unidad</dt><dd>{{ unitNames }}</dd></div>
          <div><dt>Habitaciones</dt><dd>{{ rooms }}</dd></div>
          <div><dt>Tipo de acomodación</dt><dd>{{ accommodation }}</dd></div>
          <div><dt>Estancia</dt><dd>{{ short(r.checkIn) }} → {{ date(r.checkOut) }}</dd></div>
          <div><dt>Noches</dt><dd>{{ nights }}</dd></div>
          <div><dt>Valor total alojamiento</dt><dd class="ts-total">{{ money(total) }}</dd></div>
        </dl>
      </section>

      <section class="tra-card">
        <h2 class="tra-card-title">Plan de envío al MinCIT</h2>
        <ol class="ts-plan">
          <li><span>1</span><div><strong><code>POST /one/</code> · huésped principal</strong>Devuelve el ID del registro TRA</div></li>
          <li *ngIf="rec.guests.length > 1"><span>2</span><div><strong><code>POST /two/</code> × {{ rec.guests.length - 1 }} · acompañante{{ rec.guests.length === 2 ? '' : 's' }}</strong>Una petición por acompañante, con el ID del paso 1</div></li>
        </ol>
        <p class="tra-note">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>El token PMS lo agrega el servidor. Nunca viaja al navegador.</span>
        </p>
      </section>

      <div class="ts-actions">
        <button type="button" class="rsv-btn rsv-btn--primary rsv-btn--block" [disabled]="!canSend || sending" (click)="send()">
          {{ sending ? 'Enviando al MinCIT…' : 'Confirmar check-in y enviar TRA' }}
        </button>
        <p class="ts-hint" *ngIf="!v.ok">Corrige {{ v.issues.length }} problema{{ v.issues.length === 1 ? '' : 's' }} para habilitar el envío</p>
        <p class="ts-hint" *ngIf="v.ok && !checkInReached">Se habilita el día del check-in ({{ date(r.checkIn) }})</p>
        <a class="rsv-btn rsv-btn--outline rsv-btn--block" [routerLink]="['/dashboard/tra', r.id, 'registro']">Corregir información</a>
      </div>
    </aside>
  </div>
  </ng-container>

  <ng-template #notFound>
    <p class="tra-empty">No existe una TRA para esta reserva. <a routerLink="/dashboard/tra">Volver al panel</a></p>
  </ng-template>
  `
})
export class TraSummaryComponent {

  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly doc = fmtDoc;
  readonly inherits = inherits;
  readonly short = (iso: string) => fmtDate(iso).slice(0, 5);

  r?: Reservation;
  rec?: TraRecord;
  v?: Validation;
  sending = false;
  private units: LodgingUnit[] = [];

  constructor(private svc: TraService, private router: Router, route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id')!;
    this.svc.getRows().subscribe(() => {
      const row = this.svc.row(id);
      this.r = row?.reservation;
      this.rec = row?.record;
      this.units = this.svc.getUnits();
      this.v = this.svc.validation(id);
    });
    // Una TRA ya enviada se consulta en su detalle
    if (this.rec && !this.svc.isEditable(this.rec)) this.router.navigate(['/dashboard/tra', id], { replaceUrl: true });
  }

  get checkInReached(): boolean { return this.svc.checkInReached(this.r!); }
  get canSend(): boolean { return this.v!.ok && this.checkInReached; }
  get nights(): number { return nightsBetween(this.r!.checkIn, this.r!.checkOut); }
  get total(): number { return totalValue(this.rec!); }
  get unitNames(): string { return this.rec!.units.map(u => this.unit(u.unitId)?.name ?? '—').join(' + '); }
  get rooms(): string { return this.rec!.units.flatMap(u => this.unit(u.unitId)?.rooms ?? []).join(', '); }
  get accommodation(): string { return this.rec!.units.map(u => accommodationLabel(u.accommodationType) || 'Sin definir').join(' + '); }

  private unit(id: string): LodgingUnit | undefined { return this.units.find(u => u.id === id); }
  roomsOf(unitId: string): string { return this.unit(unitId)?.rooms.join(', ') ?? '—'; }

  travel(g: TraGuest) { return travelOf(this.rec!, g); }
  complete(g: TraGuest): boolean { return isComplete(this.rec!, g); }
  role(g: TraGuest): string { return roleLabel(this.rec!, g, true); }
  reasonOf(g: TraGuest): string { return reasonLabel(this.travel(g).reasonId) || '—'; }

  place(g: TraGuest, which: 'residence' | 'origin'): string {
    const t = this.travel(g);
    const [c, ci] = which === 'residence' ? [t.residenceCountry, t.residenceCity] : [t.originCountry, t.originCity];
    return c ? `${country(c)?.name ?? c} · ${city(ci)?.name ?? '—'}` : '—';
  }

  /** Con el nombre del huésped cuando se conoce: "Acompañante 3 · Martín Gómez — Falta número de documento" */
  issueText(i: { guestId?: string; message: string }): string {
    const g = this.rec!.guests.find(x => x.id === i.guestId);
    return g && fullName(g) ? `${fullName(g)} — ${i.message}` : i.message;
  }

  /** Inicia el envío y lleva al detalle, donde se ve el avance de cada petición. */
  send(): void {
    this.sending = true;
    this.svc.send(this.r!.id);
    this.router.navigate(['/dashboard/tra', this.r!.id]);
  }
}
