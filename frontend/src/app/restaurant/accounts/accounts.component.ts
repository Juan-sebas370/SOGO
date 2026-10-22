import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { RestaurantOrder, sumTotals, shortNumber } from '../restaurant.model';
import { ReservationService } from '../../reservations/reservation.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';
import { dayTime } from '../restaurant-format';

interface RoomAccount { reservationId: string; unit: string; guest: string; code: string; orders: number; total: number; leavingToday: boolean; since: string; }

@Component({
  selector: 'app-restaurant-accounts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './accounts.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Cuentas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Cuentas abiertas</h1>
      <p class="kit-sub">Cierra las cuentas de consumo de las habitaciones y cobra las ventas directas pendientes.</p>
    </div>
    <a routerLink="/dashboard/restaurant/orders/new" class="rsv-btn rsv-btn--primary">+ Nuevo pedido</a>
  </header>

  <section class="acc-section">
    <h2 class="kit-card-title">Cuentas de habitación <span class="acc-count">{{ rooms.length }}</span></h2>
    <div class="acc-grid">
      <a *ngFor="let a of rooms" class="acc-card" [routerLink]="['/dashboard/restaurant/accounts/room', a.reservationId]">
        <div class="acc-card-top">
          <strong>{{ a.unit }}</strong>
          <span class="rsv-badge" [ngClass]="a.leavingToday ? 'rsv-badge--warn' : 'rsv-badge--info'">{{ a.leavingToday ? 'Check-out hoy' : 'Cuenta abierta' }}</span>
        </div>
        <span>{{ a.guest }} · {{ a.code }}</span>
        <span class="kit-muted">{{ a.orders }} pedido{{ a.orders === 1 ? '' : 's' }} desde {{ a.since }}</span>
        <div class="acc-card-foot"><strong>{{ money(a.total) }}</strong><em>Cerrar cuenta →</em></div>
      </a>
      <p class="kit-card kit-empty" *ngIf="!rooms.length">No hay cuentas de habitación abiertas.</p>
    </div>
  </section>

  <section class="acc-section">
    <h2 class="kit-card-title">Ventas directas por cobrar <span class="acc-count">{{ direct.length }}</span></h2>
    <div class="acc-grid">
      <a *ngFor="let o of direct" class="acc-card" [routerLink]="['/dashboard/restaurant/accounts/order', o.id]">
        <div class="acc-card-top"><strong>{{ o.table }}</strong><span class="rsv-badge rsv-badge--warn">Pendiente</span></div>
        <span>{{ o.clientName }} · <span class="kit-code">{{ short(o.number) }}</span></span>
        <span class="kit-muted">Registrado {{ dayTime(o.createdAt) }}</span>
        <div class="acc-card-foot"><strong>{{ money(total(o)) }}</strong><em>Cobrar →</em></div>
      </a>
      <p class="kit-card kit-empty" *ngIf="!direct.length">No hay ventas directas pendientes de cobro.</p>
    </div>
  </section>
  `,
})
export class AccountsComponent {
  readonly money = fmtMoney;
  readonly dayTime = dayTime;
  readonly short = shortNumber;
  rooms: RoomAccount[] = [];
  direct: RestaurantOrder[] = [];

  constructor(svc: RestaurantService, reservations: ReservationService) {
    svc.getOrders().subscribe(orders => {
      const open = orders.filter(o => o.status === 'Pendiente');
      this.direct = open.filter(o => !o.reservationId);
      const byStay = new Map<string, RestaurantOrder[]>();
      open.filter(o => o.reservationId).forEach(o => byStay.set(o.reservationId!, [...(byStay.get(o.reservationId!) ?? []), o]));
      this.rooms = [...byStay].map(([id, list]) => {
        const r = reservations.getById(id);
        const first = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        return {
          reservationId: id, unit: first.unitLabel ?? '', guest: first.clientName, code: first.reservationCode ?? '',
          orders: list.length, total: sumTotals(list).total, leavingToday: !!r && r.checkOut <= isoDate(0), since: dayTime(first.createdAt),
        };
      });
    });
  }

  total(o: RestaurantOrder): number { return sumTotals([o]).total; }
}
