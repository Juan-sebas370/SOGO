import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReservationService } from '../../reservations/reservation.service';
import { Reservation, awaitsCheckIn, isInHouse, lodgingLabel, balance, totalGuests } from '../../reservations/reservation.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { TraService } from '../../tra/tra.service';
import { statusLabel as traLabel } from '../../tra/tra-rules';
import { isoDate } from '../../shared/date-utils';

/**
 * Recepción: llegadas por registrar (check-in) y huéspedes alojados por despedir (check-out),
 * lado a lado. Desde aquí se abre el formulario de cada uno.
 */
@Component({
  selector: 'app-front-desk',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['../lodging-flow.css'],
  template: `
  <nav class="lod-breadcrumb" aria-label="Ruta">
    <a routerLink="/dashboard">Dashboard</a><span aria-hidden="true">›</span>
    <a routerLink="/dashboard/lodging">Alojamiento</a><span aria-hidden="true">›</span><span>Llegadas y salidas</span>
  </nav>
  <header class="fd-head">
    <div>
      <h1 class="flow-title">Llegadas y salidas</h1>
      <p class="fd-sub">{{ todayLabel }} · registra el check-in de quien llega y el check-out de quien se va.</p>
    </div>
    <a class="rsv-btn rsv-btn--outline fd-back" routerLink="/dashboard/lodging">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Alojamiento
    </a>
  </header>

  <div class="fd-board">
    <!-- ── Llegadas ── -->
    <section class="fd-col">
      <header class="fd-col-head">
        <span class="fd-col-icon fd-col-icon--in"><svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg></span>
        <h2>Llegadas</h2>
        <span class="fd-chip">Hoy <b>{{ arrivals.length }}</b></span>
        <span class="fd-chip fd-chip--warn" *ngIf="lateArrivals">Atrasadas <b>{{ lateArrivals }}</b></span>
      </header>

      <ul class="fd-list" *ngIf="arrivals.length; else noArrivals">
        <li class="fd-row" *ngFor="let a of arrivals">
          <span class="fd-avatar">{{ initials(a.guestName) }}</span>
          <div class="fd-text">
            <div class="fd-line1">
              <strong>{{ a.guestName }}</strong>
              <a class="fd-code" [routerLink]="['/dashboard/reservations', a.id]">{{ a.code }}</a>
              <span class="fd-tag fd-tag--bad" *ngIf="a.checkIn < today">Atrasada</span>
            </div>
            <div class="fd-line2">
              {{ lodging(a) }} · {{ short(a.checkIn) }} → {{ short(a.checkOut) }} · {{ nights(a) }} · {{ guests(a) }} hué.
            </div>
            <div class="fd-tags">
              <span class="fd-tag" [ngClass]="due(a) > 0 ? 'fd-tag--warn' : 'fd-tag--ok'">{{ due(a) > 0 ? 'Saldo ' + money(due(a)) : 'Pagada' }}</span>
              <span class="fd-tag" [ngClass]="traReady(a) ? 'fd-tag--ok' : 'fd-tag--warn'">TRA {{ traText(a).toLowerCase() }}</span>
            </div>
          </div>
          <a class="fd-btn fd-btn--in" [routerLink]="['/dashboard/lodging', a.id, 'checkin']">Check-in</a>
        </li>
      </ul>
      <ng-template #noArrivals><p class="fd-empty">No hay llegadas pendientes hoy.</p></ng-template>

      <ng-container *ngIf="upcoming.length">
        <h3 class="fd-sep">Próximos 7 días</h3>
        <ul class="fd-list">
          <li class="fd-row fd-row--soft" *ngFor="let a of upcoming">
            <span class="fd-day"><b>{{ a.checkIn | slice:8:10 }}</b>{{ month(a.checkIn) }}</span>
            <div class="fd-text">
              <div class="fd-line1"><strong>{{ a.guestName }}</strong><span class="fd-tag" [ngClass]="a.status === 'Confirmada' ? 'fd-tag--ok' : 'fd-tag--warn'">{{ a.status }}</span></div>
              <div class="fd-line2">{{ lodging(a) }} · {{ nights(a) }} · {{ guests(a) }} hué.</div>
            </div>
            <a class="fd-link" [routerLink]="['/dashboard/reservations', a.id]">Ver</a>
          </li>
        </ul>
      </ng-container>
    </section>

    <!-- ── Salidas ── -->
    <section class="fd-col">
      <header class="fd-col-head">
        <span class="fd-col-icon fd-col-icon--out"><svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M9 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg></span>
        <h2>Salidas</h2>
        <span class="fd-chip">Hoy <b>{{ departures.length }}</b></span>
        <span class="fd-chip">Alojados <b>{{ inHouse.length }}</b></span>
      </header>

      <ul class="fd-list" *ngIf="departures.length; else noDepartures">
        <li class="fd-row" *ngFor="let a of departures">
          <span class="fd-avatar fd-avatar--out">{{ initials(a.guestName) }}</span>
          <div class="fd-text">
            <div class="fd-line1">
              <strong>{{ a.guestName }}</strong>
              <a class="fd-code" [routerLink]="['/dashboard/reservations', a.id]">{{ a.code }}</a>
              <span class="fd-tag fd-tag--bad" *ngIf="a.checkOut < today">Debió salir el {{ short(a.checkOut) }}</span>
            </div>
            <div class="fd-line2">{{ lodging(a) }} · llegó {{ short(a.checkIn) }} · {{ guests(a) }} hué.</div>
            <div class="fd-tags">
              <span class="fd-tag" [ngClass]="due(a) > 0 ? 'fd-tag--warn' : 'fd-tag--ok'">{{ due(a) > 0 ? 'Por cobrar ' + money(due(a)) : 'Pagada' }}</span>
            </div>
          </div>
          <a class="fd-btn fd-btn--out" [routerLink]="['/dashboard/lodging', a.id, 'checkout']">Check-out</a>
        </li>
      </ul>
      <ng-template #noDepartures><p class="fd-empty">Nadie tiene salida programada para hoy.</p></ng-template>

      <ng-container *ngIf="staying.length">
        <h3 class="fd-sep">Alojados · salen después</h3>
        <ul class="fd-list">
          <li class="fd-row fd-row--soft" *ngFor="let a of staying">
            <span class="fd-day"><b>{{ a.checkOut | slice:8:10 }}</b>{{ month(a.checkOut) }}</span>
            <div class="fd-text">
              <div class="fd-line1"><strong>{{ a.guestName }}</strong></div>
              <div class="fd-line2">{{ lodging(a) }} · {{ guests(a) }} hué.{{ due(a) > 0 ? ' · saldo ' + money(due(a)) : '' }}</div>
            </div>
            <a class="fd-link" [routerLink]="['/dashboard/lodging', a.id, 'checkout']">Check-out anticipado</a>
          </li>
        </ul>
      </ng-container>
    </section>
  </div>
  `,
  styles: [`
    .fd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
    .fd-sub { margin: 4px 0 0; font-size: 13px; color: #4B5563; }
    .fd-sub::first-letter { text-transform: uppercase; }
    .fd-back { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .fd-back svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }

    .fd-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .fd-col { background: #fff; border: 1px solid #E5EAF1; border-radius: 14px; padding: 14px 16px 10px; min-width: 0; }

    .fd-col-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid #EEF1F5; }
    .fd-col-head h2 { margin: 0 auto 0 2px; font-size: 15px; font-weight: 700; color: #0A2540; }
    .fd-col-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; }
    .fd-col-icon svg { width: 16px; height: 16px; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .fd-col-icon--in { background: #DCF5E8; } .fd-col-icon--in svg { stroke: #16A34A; }
    .fd-col-icon--out { background: #E3EEFA; } .fd-col-icon--out svg { stroke: #0B6FD0; }
    .fd-chip { padding: 3px 10px; border-radius: 999px; background: #F3F5F8; font-size: 11.5px; color: #4B5563; }
    .fd-chip b { margin-left: 3px; color: #0A2540; }
    .fd-chip--warn { background: #FEF3C7; color: #92400E; } .fd-chip--warn b { color: #92400E; }

    .fd-list { list-style: none; margin: 0; padding: 0; }
    .fd-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #F1F3F7; }
    .fd-row:last-child { border-bottom: none; }
    .fd-row--soft { padding: 8px 0; }

    .fd-avatar { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: #DCF5E8; color: #15803D; font-size: 12px; font-weight: 700; }
    .fd-avatar--out { background: #E3EEFA; color: #0B6FD0; }
    .fd-day { width: 34px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; font-size: 9.5px; text-transform: uppercase; color: #6B7280; line-height: 1.2; }
    .fd-day b { font-size: 15px; color: #0A2540; }

    .fd-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .fd-line1 { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .fd-line1 strong { font-size: 13.5px; color: #0A2540; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fd-line2 { font-size: 12px; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fd-code { flex-shrink: 0; font-size: 11px; font-weight: 600; color: #0B6FD0; text-decoration: none; }
    .fd-code:hover { text-decoration: underline; }

    .fd-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
    .fd-tag { flex-shrink: 0; padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
    .fd-tag--ok { background: #ECFDF5; color: #15803D; }
    .fd-tag--warn { background: #FEF3C7; color: #92400E; }
    .fd-tag--bad { background: #FEE2E2; color: #B91C1C; }

    .fd-btn { flex-shrink: 0; height: 32px; padding: 0 14px; border-radius: 8px; display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; text-decoration: none; color: #fff; transition: filter .15s; }
    .fd-btn:hover { filter: brightness(1.08); }
    .fd-btn--in { background: #16A34A; }
    .fd-btn--out { background: #0B6FD0; }
    .fd-link { flex-shrink: 0; font-size: 12px; font-weight: 600; color: #0B6FD0; text-decoration: none; white-space: nowrap; }
    .fd-link:hover { text-decoration: underline; }

    .fd-sep { margin: 10px 0 0; padding: 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #9CA3AF; border-top: 1px dashed #E5EAF1; }
    .fd-empty { margin: 0; padding: 18px 0; text-align: center; font-size: 12.5px; color: #9CA3AF; }

    @media (max-width: 1100px) { .fd-board { grid-template-columns: 1fr; } }
    @media (max-width: 560px) {
      .fd-head { flex-direction: column; }
      .fd-row { flex-wrap: wrap; }
      .fd-btn { width: 100%; justify-content: center; }
    }
  `],
})
export class FrontDeskComponent implements OnDestroy {
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;
  readonly guests = totalGuests;
  readonly due = balance;
  readonly traLabel = traLabel;
  readonly today = isoDate(0);
  readonly todayLabel = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  arrivals: Reservation[] = [];
  upcoming: Reservation[] = [];
  inHouse: Reservation[] = [];
  departures: Reservation[] = [];
  staying: Reservation[] = [];
  private sub: Subscription;

  constructor(private svc: ReservationService, private traSvc: TraService) {
    this.sub = svc.getAll().subscribe(list => this.compute(list));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  private compute(list: Reservation[]): void {
    const today = this.today, week = isoDate(7);
    const byIn = (a: Reservation, b: Reservation) => a.checkIn.localeCompare(b.checkIn);
    const byOut = (a: Reservation, b: Reservation) => a.checkOut.localeCompare(b.checkOut);
    this.arrivals = list.filter(r => awaitsCheckIn(r) && r.checkIn <= today && r.checkOut >= today).sort(byIn);
    this.upcoming = list.filter(r => awaitsCheckIn(r) && r.checkIn > today && r.checkIn <= week).sort(byIn);
    this.inHouse = list.filter(isInHouse).sort(byOut);
    this.departures = this.inHouse.filter(r => r.checkOut <= today);
    this.staying = this.inHouse.filter(r => r.checkOut > today);
  }

  get lateArrivals(): number { return this.arrivals.filter(a => a.checkIn < this.today).length; }
  traOf(a: Reservation) { return this.traSvc.statusOf(a); }
  traReady(a: Reservation): boolean { return this.traSvc.isReadyForCheckIn(a); }
  traText(a: Reservation): string { const s = this.traOf(a); return s === 'BORRADOR' && this.traReady(a) ? 'Lista para envío' : traLabel(s); }
  nights(a: Reservation): string { return a.nights ? `${a.nights} noche${a.nights === 1 ? '' : 's'}` : 'Pasadía'; }
  initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

  private date(iso: string): Date { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  short(iso: string): string { return iso === this.today ? 'hoy' : this.date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', ''); }
  month(iso: string): string { return this.date(iso).toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''); }
}
