import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService, Season, LodgingPolicies } from '../settings.service';
import { UsersService } from '../../users/users.service';
import { RoomService } from '../../lodging/room.service';
import { TraService } from '../../tra/tra.service';
import { ROOMS, FLOORS, summaryOf } from '../../lodging/house';
import { Room, ManualRoomStatus, BathroomType } from '../../lodging/room.model';
import { metaText } from '../hotel/hotel.component';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));
type UnitState = 'Habilitada' | ManualRoomStatus;
interface RoomDraft { number: string; floor: number; type: string; capacity: number; beds: string; bathroom: BathroomType; price: number; priceMid: number; priceHigh: number; state: UnitState; isNew: boolean; }
/** Valor sugerido para media/alta cuando la base aún no lo tiene (redondeado a $5.000). */
const sugerido = (base: number, factor: number) => Math.round(base * factor / 5000) * 5000;

@Component({
  selector: 'app-settings-lodging',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Alojamiento y reservas</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Alojamiento y reservas</h1><p class="kit-sub">Unidades, capacidad, estado y políticas que usan Reservas y Alojamiento.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!errors.length || !canEdit" (click)="save()">Guardar cambios</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="errors.length">{{ errors[0] }}</p>

  <section class="kit-card lo-mb">
    <div class="cf-card-head"><h2 class="kit-card-title">Unidades de alojamiento</h2><button type="button" class="rsv-btn rsv-btn--outline" (click)="openAdd()">+ Agregar habitación</button></div>
    <div class="kit-table-wrap">
      <table class="kit-table cf-table">
        <thead><tr><th>Unidad</th><th>Tipo</th><th class="r">Capacidad</th><th>Camas</th><th>Bloquea</th><th>Estado</th></tr></thead>
        <tbody>
          <tr class="lo-group"><td><strong>Casa completa</strong></td><td>Casa</td><td class="r">{{ sum(rooms).capacity }} pers.</td><td>{{ bedsOf(rooms) }}</td><td class="rp-muted">Todas</td><td><span class="rsv-badge" [ngClass]="groupBadge(rooms)">{{ groupState(rooms) }}</span></td></tr>
          <tr class="lo-group" *ngFor="let f of floors"><td><strong>Piso {{ f }}</strong></td><td>Piso</td><td class="r">{{ sum(onFloor(f)).capacity }} pers.</td><td>{{ bedsOf(onFloor(f)) }}</td>
            <td class="rp-muted">Hab. {{ numbers(onFloor(f)) }}</td><td><span class="rsv-badge" [ngClass]="groupBadge(onFloor(f))">{{ groupState(onFloor(f)) }}</span></td></tr>
          <tr *ngFor="let r of rooms">
            <td><strong>Hab. {{ r.number }}</strong> <span class="rsv-badge rsv-badge--info" *ngIf="r.isNew">Nueva</span></td>
            <td>{{ r.type }}</td>
            <td class="r"><span class="cf-unit lo-sm"><input type="number" min="1" max="12" [(ngModel)]="r.capacity"><span>pers.</span></span></td>
            <td><input class="rsv-input lo-beds" [(ngModel)]="r.beds" maxlength="60"></td>
            <td class="rp-muted">Piso {{ r.floor }}</td>
            <td><select class="rsv-input lo-state" [(ngModel)]="r.state" [ngClass]="'lo-' + stateClass(r.state)">
              <option>Habilitada</option><option>En limpieza</option><option>En mantenimiento</option><option>Fuera de servicio</option></select></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="cf-note">«Casa completa» y cada piso bloquean sus habitaciones cuando se reservan, y viceversa. Las habitaciones en mantenimiento o fuera de servicio no se pueden alojar (Alojamiento lo valida en el check-in). Los precios por noche se cambian en <a routerLink="/dashboard/lodging/rates">Alojamiento › Tarifas y temporadas</a>.</p>
  </section>


  <div class="cf-two">
    <section class="kit-card lo-rates">
      <h2 class="kit-card-title">Precios, tarifas y temporadas</h2>
      <p>Los precios por noche de cada habitación, las tarifas por persona de cada tipo de reserva y el calendario de temporadas (alta, media, baja y festivos) se gestionan en <strong>Alojamiento › Tarifas y temporadas</strong>. Allí también está el cotizador.</p>
      <a class="rsv-btn rsv-btn--primary" routerLink="/dashboard/lodging/rates">Ir a Tarifas y temporadas</a>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Políticas</h2>
      <div class="cf-row"><div><strong>Hora de check-in</strong></div><input class="rsv-input lo-time" type="time" [(ngModel)]="p.checkIn"></div>
      <div class="cf-row"><div><strong>Hora de check-out</strong></div><input class="rsv-input lo-time" type="time" [(ngModel)]="p.checkOut"></div>
      <div class="cf-row"><div><strong>Abono para confirmar</strong><small>Si no se paga, la reserva queda «Pendiente».</small></div><span class="cf-unit"><input type="number" min="0" max="100" [(ngModel)]="p.depositPct"><span>%</span></span></div>
      <div class="cf-row"><div><strong>Cancelación sin costo</strong><small>Antes de la llegada.</small></div><span class="cf-unit"><input type="number" min="0" max="720" [(ngModel)]="p.freeCancelHours"><span>horas</span></span></div>
      <div class="cf-row"><div><strong>Penalidad por cancelación tardía</strong></div>
        <select class="rsv-input" [(ngModel)]="p.latePenalty"><option>Primera noche</option><option>50 % del total</option><option>Total</option><option>Sin penalidad</option></select></div>
      <div class="cf-row"><div><strong>Pasadías</strong><small>Máximo de personas por día.</small></div><span class="cf-unit"><input type="number" min="1" max="100" [(ngModel)]="p.dayPassMax"><span>pers.</span></span></div>
      <div class="cf-row"><div><strong>Exigir TRA en el check-in</strong><small>No deja terminar el check-in sin la tarjeta lista.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="p.requireTra"><i></i></label></div>
    </section>
  </div>

  <div class="rsv-modal-overlay" *ngIf="adding" (click)="adding = null">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="lo-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="lo-title">Agregar habitación</h2>
      <div class="cf-fields">
        <label class="cf-field">Número *<input class="rsv-input" [(ngModel)]="adding.number" maxlength="5"></label>
        <label class="cf-field">Piso *<input class="rsv-input" type="number" min="1" max="9" [(ngModel)]="adding.floor"></label>
        <label class="cf-field">Tipo<select class="rsv-input" [(ngModel)]="adding.type"><option>Doble</option><option>Familiar</option><option>Sencilla</option><option>Suite</option></select></label>
        <label class="cf-field">Capacidad<input class="rsv-input" type="number" min="1" max="12" [(ngModel)]="adding.capacity"></label>
        <label class="cf-field">Camas<input class="rsv-input" [(ngModel)]="adding.beds" placeholder="1 cama doble"></label>
        <label class="cf-field">Baño<select class="rsv-input" [(ngModel)]="adding.bathroom"><option>Privado</option><option>Compartido</option></select></label>
        <label class="cf-field">Tarifa baja / noche<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="adding.price"></label>
        <label class="cf-field">Tarifa media / noche<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="adding.priceMid"></label>
        <label class="cf-field">Tarifa alta / noche<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="adding.priceHigh"></label>
      </div>
      <p class="kit-error" *ngIf="addError">{{ addError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="adding = null">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="add()">Agregar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .lo-mb { margin-bottom: 18px; }
    .lo-group td { background: #F8FAFD; }
    .lo-sm { height: 32px; }
    .lo-beds { min-width: 150px; }
    .lo-state { width: auto; height: 32px; font-size: 12px; font-weight: 700; }
    .lo-ok { color: #1F7A52; } .lo-warn { color: #B45309; background: #FDF1DF; } .lo-bad { color: #B42318; background: #FDECEA; }
    .lo-rates p { margin: 6px 0 14px; font-size: 13px; color: #374151; line-height: 1.55; }
    .lo-time { width: 110px; }
  `],
})
export class LodgingComponent {
  readonly money = money;
  rooms: RoomDraft[] = [];
  seasons: Season[];
  p: LodgingPolicies;
  private base = '';
  adding: RoomDraft | null = null;
  addError = '';
  saved = '';

  constructor(private settings: SettingsService, private users: UsersService, private roomSvc: RoomService, private tra: TraService) {
    this.seasons = clone(settings.seasons);
    this.p = clone(settings.policies);
    this.rooms = this.load();
    this.base = this.snapshot();
  }


  private load(): RoomDraft[] {
    const live = this.roomSvc.getSnapshot();
    return ROOMS.map(r => {
      const st = live.find(x => x.number === r.number)?.status;
      const state: UnitState = st === 'En limpieza' || st === 'En mantenimiento' || st === 'Fuera de servicio' ? st : 'Habilitada';
      return { number: r.number, floor: r.floor, type: r.type, capacity: r.capacity, beds: r.beds.join(' + '), bathroom: r.bathroom, price: r.pricePerNight,
        priceMid: r.pricePerNightMid ?? sugerido(r.pricePerNight, 1.27), priceHigh: r.pricePerNightHigh ?? sugerido(r.pricePerNight, 1.73), state, isNew: false };
    });
  }
  private snapshot(): string { return JSON.stringify({ r: this.rooms, s: this.seasons, p: this.p }); }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.lodging); }
  get dirty(): boolean { return this.snapshot() !== this.base; }
  get floors(): number[] { return [...new Set(this.rooms.map(r => r.floor))].sort(); }
  get errors(): string[] {
    const e: string[] = [];
    if (this.rooms.some(r => !(r.capacity >= 1 && r.capacity <= 12))) e.push('La capacidad de cada habitación debe estar entre 1 y 12 personas.');
    if (this.rooms.some(r => !r.beds.trim())) e.push('Describe las camas de cada habitación.');
    if (!/^\d{2}:\d{2}$/.test(this.p.checkIn) || !/^\d{2}:\d{2}$/.test(this.p.checkOut)) e.push('Indica las horas de check-in y check-out.');
    if (!(this.p.depositPct >= 0 && this.p.depositPct <= 100)) e.push('El abono debe estar entre 0 % y 100 %.');
    if (!(this.p.dayPassMax >= 1)) e.push('Indica el máximo de personas para pasadías.');
    return e;
  }

  onFloor(f: number): RoomDraft[] { return this.rooms.filter(r => r.floor === f); }
  numbers(rs: RoomDraft[]): string { return rs.map(r => r.number).join(', '); }
  sum(rs: RoomDraft[]): { capacity: number; price: number; mid: number; high: number } {
    return { capacity: rs.reduce((s, r) => s + +r.capacity, 0), price: rs.reduce((s, r) => s + +r.price, 0),
             mid: rs.reduce((s, r) => s + +r.priceMid, 0), high: rs.reduce((s, r) => s + +r.priceHigh, 0) };
  }
  bedsOf(rs: RoomDraft[]): string { return `${rs.length} habitaciones`; }
  stateClass(s: UnitState): string { return s === 'Habilitada' ? 'ok' : s === 'Fuera de servicio' ? 'bad' : 'warn'; }
  groupState(rs: RoomDraft[]): string { const blocked = rs.filter(r => r.state === 'En mantenimiento' || r.state === 'Fuera de servicio'); return blocked.length ? `${blocked.length} bloqueada${blocked.length === 1 ? '' : 's'}` : 'Habilitada'; }
  groupBadge(rs: RoomDraft[]): string { return this.groupState(rs) === 'Habilitada' ? 'rsv-badge--ok' : 'rsv-badge--warn'; }


  openAdd(): void {
    this.adding = { number: '', floor: Math.max(...this.floors), type: 'Doble', capacity: 2, beds: '1 cama doble', bathroom: 'Privado', price: 100000, priceMid: 125000, priceHigh: 175000, state: 'Habilitada', isNew: true };
    this.addError = '';
  }
  add(): void {
    const a = this.adding!;
    a.number = a.number.trim();
    if (!/^\d{3,4}$/.test(a.number)) { this.addError = 'El número de habitación debe tener 3 o 4 dígitos (ej.: 205).'; return; }
    if (this.rooms.some(r => r.number === a.number)) { this.addError = `Ya existe la habitación ${a.number}.`; return; }
    if (!(a.floor >= 1)) { this.addError = 'Indica el piso.'; return; }
    if (!(+a.price > 0) || !(+a.priceMid > 0) || !(+a.priceHigh > 0)) { this.addError = 'Indica las tarifas baja, media y alta (mayores que cero).'; return; }
    this.rooms = [...this.rooms, { ...a, floor: +a.floor, capacity: +a.capacity, price: +a.price, priceMid: +a.priceMid, priceHigh: +a.priceHigh }].sort((x, y) => x.number.localeCompare(y.number));
    this.adding = null;
  }

  discard(): void {
    const b = JSON.parse(this.base);
    this.rooms = b.r; this.seasons = b.s; this.p = b.p;
  }

  save(): void {
    if (this.errors.length || !this.canEdit) return;
    const detail: string[] = [];
    const before = new Map(this.load().map(r => [r.number, r]));
    this.rooms.forEach(d => {
      const beds = d.beds.split('+').map(x => x.trim()).filter(Boolean);
      const room = ROOMS.find(r => r.number === d.number);
      if (!room) {
        const created: Room = { id: `r${d.number}`, number: d.number, floor: +d.floor, type: d.type, capacity: +d.capacity, beds, bathroom: d.bathroom, pricePerNight: +d.price,
          pricePerNightMid: +d.priceMid, pricePerNightHigh: +d.priceHigh,
          description: `Habitación ${d.type.toLowerCase()} del piso ${d.floor}.`, services: ['WiFi gratis'], photos: [] };
        ROOMS.push(created);
        if (!FLOORS.includes(+d.floor)) { FLOORS.push(+d.floor); FLOORS.sort(); }
        detail.push(`habitación ${d.number} agregada`);
      } else {
        const b = before.get(d.number)!;
        if (b.price !== +d.price) detail.push(`Hab. ${d.number} tarifa baja ${money(b.price)} → ${money(+d.price)}`);
        if (b.priceMid !== +d.priceMid) detail.push(`Hab. ${d.number} tarifa media ${money(b.priceMid)} → ${money(+d.priceMid)}`);
        if (b.priceHigh !== +d.priceHigh) detail.push(`Hab. ${d.number} tarifa alta ${money(b.priceHigh)} → ${money(+d.priceHigh)}`);
        if (b.capacity !== +d.capacity) detail.push(`Hab. ${d.number} capacidad ${b.capacity} → ${d.capacity}`);
        Object.assign(room, { capacity: +d.capacity, beds, pricePerNight: +d.price, pricePerNightMid: +d.priceMid, pricePerNightHigh: +d.priceHigh });
      }
      const was = before.get(d.number)?.state ?? 'Habilitada';
      if (was !== d.state) {
        this.roomSvc.setManualStatus(d.number, d.state === 'Habilitada' ? null : d.state);
        detail.push(`Hab. ${d.number}: ${was} → ${d.state}`);
      }
    });
    this.roomSvc.catalogChanged();
    this.tra.updateSettings({ capacity: summaryOf(ROOMS.map(r => r.number)).capacity });
    if (JSON.stringify(this.p) !== JSON.stringify(this.settings.policies)) detail.push('políticas');
    this.settings.saveLodging(this.seasons.map(s => ({ ...s, adjustment: +s.adjustment, minNights: +s.minNights })), { ...this.p, depositPct: +this.p.depositPct, freeCancelHours: +this.p.freeCancelHours, dayPassMax: +this.p.dayPassMax }, detail.join(' · '))
      .then(() => this.saved = 'Cambios guardados en la base de datos: Reservas y Alojamiento ya usan estas unidades y políticas.')
      .catch(() => this.saved = '');
    this.rooms = this.load();
    this.base = this.snapshot();
  }
}
