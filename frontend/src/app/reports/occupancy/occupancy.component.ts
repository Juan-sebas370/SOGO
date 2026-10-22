import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, MonthSummary } from '../reports.service';
import { Range, OccupancyReport, Delta, delta, money, pct, num, dmy, dm, monthName, shiftMonth, rangeLabel, addDays, COLORS } from '../reports.model';
import { LodgingType, Reservation, isInHouse, awaitsCheckIn, isVoid } from '../../reservations/reservation.model';
import { RoomWithStatus, RoomStatus } from '../../lodging/room.model';
import { ROOMS } from '../../lodging/house';
import { LinesComponent, Series } from '../charts/charts';
import { DeltaComponent } from '../delta.component';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { svgMarkup } from '../charts/chart-export';

interface Filters { from: string; to: string; mode: LodgingType | ''; room: string; group: 'Día' | 'Semana'; }
interface Tile { room: RoomWithStatus; label: string; sub: string; tone: string; }

const STATUS_TONE: Record<RoomStatus, string> = {
  Ocupada: 'occ', Disponible: 'free', Reservada: 'res', 'En limpieza': 'maint', 'En mantenimiento': 'maint', 'Fuera de servicio': 'maint',
};
const STATUS_BADGE: Record<RoomStatus, string> = {
  Ocupada: 'rsv-badge--info', Disponible: 'rsv-badge--ok', Reservada: 'rsv-badge--evento', 'En limpieza': 'rsv-badge--warn', 'En mantenimiento': 'rsv-badge--warn', 'Fuera de servicio': 'rsv-badge--danger',
};

@Component({
  selector: 'app-reports-occupancy',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LinesComponent, DeltaComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/reports">Reportes</a><span>/</span><span>Ocupación</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Reporte de ocupación</h1>
      <p class="kit-sub">Uso de las {{ rooms.length }} habitaciones de la casa · se actualiza con cada reserva, check-in y check-out.</p>
    </div>
    <div class="kit-actions" *ngIf="svc.canExport()">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">Excel (CSV)</button>
    </div>
  </header>

  <section class="kit-card rp-filters">
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="draft.from" [min]="svc.goLive" [max]="draft.to"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="draft.to" [min]="draft.from"></label>
    <label class="kit-select"><span>Modalidad de reserva</span>
      <select [(ngModel)]="draft.mode"><option value="">Todas</option><option value="Habitación">Habitaciones sueltas</option><option value="Piso">Piso completo</option><option value="Casa completa">Casa completa</option></select></label>
    <label class="kit-select"><span>Unidad</span>
      <select [(ngModel)]="draft.room"><option value="">Todas</option><option *ngFor="let r of rooms" [value]="r.number">Hab. {{ r.number }}</option></select></label>
    <label class="kit-select"><span>Agrupar por</span><select [(ngModel)]="draft.group"><option>Día</option><option>Semana</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="invalid" (click)="apply()">Aplicar</button>
    <p class="kit-error" *ngIf="draft.from < svc.goLive" style="width:100%;margin:0">El detalle diario existe desde el {{ dmy(svc.goLive) }}; los meses anteriores solo tienen totales.</p>
  </section>

  <section class="kit-kpis rp-kpis">
    <div class="rp-kpi"><span>Ocupación promedio</span><strong>{{ pct(occ.pct) }}</strong><div><rp-delta [d]="d.pct"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ pct(cmp.occupancy) }}</small></div></div>
    <div class="rp-kpi"><span>Noches ocupadas</span><strong>{{ occ.occupied }}</strong><small>de {{ occ.available }} disponibles</small></div>
    <div class="rp-kpi"><span>Estancia promedio</span><strong>{{ num(occ.avgStay, 1) }} noches</strong><div><rp-delta [d]="d.stay"></rp-delta><small class="rp-cmp">{{ cmpName }} {{ num(cmp.avgStay, 1) }}</small></div></div>
    <div class="rp-kpi"><span>Tarifa promedio (ADR)</span><strong>{{ money(occ.adr) }}</strong><div><rp-delta [d]="d.adr"></rp-delta><small class="rp-cmp">Por noche ocupada</small></div></div>
    <div class="rp-kpi"><span>RevPAR</span><strong>{{ money(occ.revpar) }}</strong><div><rp-delta [d]="d.revpar"></rp-delta><small class="rp-cmp">Ingreso por noche disponible</small></div></div>
  </section>

  <div class="rp-grid rp-grid--2-1">
    <section class="kit-card" #chart>
      <div class="rp-card-head">
        <div><h2 class="kit-card-title">Ocupación {{ applied.group === 'Día' ? 'diaria' : 'semanal' }}</h2><p class="kit-card-sub">% de habitaciones ocupadas por noche · {{ rangeLabel(applied) }}</p></div>
        <div class="rp-legend"><span><i [style.background]="C.blue"></i>Ocupación</span><span *ngIf="goal !== null"><i class="line" [style.background]="C.amber"></i>Meta {{ num(goal) }} %</span></div>
      </div>
      <rp-lines [labels]="labels" [series]="series" [goals]="goalLines" [yMax]="100" [points]="applied.group === 'Semana'"
                valuesShown="max" [tick]="tickPct" [valueLabel]="valuePct" [tooltip]="tip" aria="Ocupación por noche"></rp-lines>
      <p class="rp-note">{{ insight }}</p>
    </section>

    <section class="kit-card">
      <div class="rp-card-head"><h2 class="kit-card-title">Estado hoy</h2><span class="rsv-badge rsv-badge--info">{{ dm(svc.today) }} · {{ now }}</span></div>
      <div class="oc-counts">
        <div><strong class="t-occ">{{ count('Ocupada') }}</strong><span>Ocupadas</span></div>
        <div><strong class="t-free">{{ count('Disponible') }}</strong><span>Disponibles</span></div>
        <div><strong class="t-res">{{ count('Reservada') }}</strong><span>Reservadas</span></div>
        <div><strong class="t-maint">{{ blockedCount }}</strong><span>Limpieza / mant.</span></div>
      </div>
      <div class="oc-tiles">
        <a class="oc-tile" *ngFor="let t of tiles" [ngClass]="'oc-' + t.tone" routerLink="/dashboard/lodging"><strong>{{ t.label }}</strong><small>{{ t.sub }}</small></a>
      </div>
      <p class="rp-note">{{ todayNote }}</p>
    </section>
  </div>

  <div class="rp-grid rp-grid--2-1">
    <section class="kit-card">
      <h2 class="kit-card-title">Ocupación por habitación</h2>
      <div class="kit-table-wrap">
        <table class="kit-table rp-table">
          <thead><tr><th>Unidad</th><th>Tipo</th><th class="r">Noches ocupadas</th><th>% ocupación</th><th class="r">Estadías</th><th class="r">Estancia prom.</th><th>Estado hoy</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of occ.rooms">
              <td><strong>Hab. {{ r.room.number }}</strong></td><td class="rp-muted">{{ r.room.type }} · piso {{ r.room.floor }}</td>
              <td class="r">{{ r.occupied }} / {{ r.available }}</td>
              <td><div class="rp-meter"><div class="rp-meter-track"><b [class.low]="r.pct < lowCut" [style.width.%]="r.pct"></b></div><strong>{{ pct(r.pct) }}</strong></div></td>
              <td class="r">{{ r.stays }}</td><td class="r">{{ r.stays ? num(r.avgStay, 1) : '—' }}</td>
              <td><span class="rsv-badge" [ngClass]="badge(r.room.number)">{{ statusOf(r.room.number) }}</span></td>
            </tr>
            <tr class="rp-total"><td>Total</td><td></td><td class="r">{{ occ.occupied }} / {{ occ.available }}</td><td>{{ pct(occ.pct) }}</td><td class="r">{{ occ.stays }}</td><td class="r">{{ num(occ.avgStay, 1) }}</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <p class="rp-note">Una estadía de piso o casa completa ocupa varias habitaciones a la vez; por eso la suma de estadías por habitación es mayor que el total.</p>
    </section>

    <section class="kit-card">
      <h2 class="kit-card-title">Por tipo de habitación</h2>
      <div class="oc-type" *ngFor="let t of byType">
        <div class="oc-type-head"><span>{{ t.type }} ({{ t.rooms }})</span><strong>{{ pct(t.pct) }}</strong></div>
        <div class="rp-hbar-track"><b [style.width.%]="t.pct" [style.background]="t.pct < lowCut ? C.amber : C.blue"></b></div>
        <small>{{ t.occupied }} de {{ t.available }} noches</small>
      </div>
      <h2 class="kit-card-title oc-mt">Por modalidad de reserva</h2>
      <div class="oc-kv" *ngFor="let m of occ.byMode"><span>{{ modeLabel(m.mode) }}</span><strong>{{ m.nights }} noches · {{ pct(m.share) }}</strong></div>
      <div class="kit-divider"></div>
      <div class="oc-kv" *ngIf="bestWeek"><span>Semana más alta</span><strong>{{ bestWeek.label }} · {{ pct(bestWeek.pct) }}</strong></div>
      <div class="oc-kv" *ngIf="worstWeek"><span>Semana más baja</span><strong>{{ worstWeek.label }} · {{ pct(worstWeek.pct) }}</strong></div>
      <div class="oc-kv"><span>Bloqueadas hoy</span><strong>{{ blockedLabel }}</strong></div>
    </section>
  </div>
  `,
  styles: [`
    .oc-counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 6px 0 12px; }
    .oc-counts div { background: #F4F7FB; border-radius: 10px; padding: 9px 4px; text-align: center; }
    .oc-counts strong { display: block; font-size: 20px; }
    .oc-counts span { font-size: 11px; color: #6B7280; }
    .t-occ { color: #1565C0; } .t-free { color: #1F8A5B; } .t-res { color: #7C4DDB; } .t-maint { color: #B45309; }
    .oc-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
    .oc-tile { display: block; border-radius: 10px; padding: 9px 10px; border: 1px solid; text-decoration: none; min-height: 50px; }
    .oc-tile strong { display: block; font-size: 12.5px; }
    .oc-tile small { font-size: 11px; color: #4B5563; }
    .oc-occ { background: #E8F1FC; border-color: #BCD6F3; color: #1565C0; }
    .oc-free { background: #E7F6EE; border-color: #BCE3CC; color: #1F7A52; }
    .oc-res { background: #F1EAFD; border-color: #D8C8F6; color: #6D3FC8; }
    .oc-maint { background: #FDF1DF; border-color: #F4D3A4; color: #B45309; }
    .oc-type { margin-bottom: 12px; font-size: 12.5px; }
    .oc-type-head { display: flex; justify-content: space-between; margin-bottom: 5px; color: #1F2937; }
    .oc-type small { color: #6B7280; font-size: 11.5px; }
    .oc-type .rp-hbar-track { height: 9px; }
    .oc-mt { margin-top: 16px; }
    .oc-kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; font-size: 12.5px; color: #4B5563; }
    .oc-kv strong { color: #0A2540; text-align: right; }
    .kit-divider { border-top: 1px solid #EEF1F5; margin: 8px 0; }
  `],
})
export class OccupancyComponent implements OnDestroy {
  readonly C = COLORS;
  readonly money = money; readonly pct = pct; readonly num = num; readonly dmy = dmy; readonly dm = dm; readonly rangeLabel = rangeLabel;
  readonly rooms = ROOMS;
  readonly tickPct = (v: number) => `${v} %`;
  readonly valuePct = (v: number) => pct(v);

  draft: Filters;
  applied: Filters;
  occ!: OccupancyReport;
  cmp!: MonthSummary;
  cmpName = '';
  d!: { pct: Delta; stay: Delta; adr: Delta; revpar: Delta };
  labels: string[] = [];
  series: Series[] = [];
  buckets: { label: string; pct: number; occupied: number; available: number }[] = [];
  insight = '';
  live: RoomWithStatus[] = [];
  tiles: Tile[] = [];
  todayNote = '';
  byType: { type: string; rooms: number; occupied: number; available: number; pct: number }[] = [];
  bestWeek: { label: string; pct: number } | null = null;
  worstWeek: { label: string; pct: number } | null = null;
  now = '';
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.draft = { from: svc.goLive, to: svc.today, mode: '', room: '', group: 'Día' };
    this.applied = { ...this.draft };
    this.sub = svc.changes$.subscribe(() => this.compute());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  /** Meta de ocupación (null si no se ha definido: no se dibuja ni se compara). */
  get goal(): number | null { return this.svc.goal('occupancy'); }
  get goalLines(): { value: number; color: string; label: string }[] { return this.goal === null ? [] : [{ value: this.goal, color: this.C.amber, label: 'Meta' }]; }
  get lowCut(): number { return (this.goal ?? 0) / 2; }
  get invalid(): boolean { return !this.draft.from || !this.draft.to || this.draft.from > this.draft.to || this.draft.from < this.svc.goLive; }
  get blockedCount(): number { return this.live.filter(r => STATUS_TONE[r.status] === 'maint').length; }
  get blockedLabel(): string {
    const b = this.live.filter(r => STATUS_TONE[r.status] === 'maint');
    return b.length ? b.map(r => `Hab. ${r.number} (${r.status.toLowerCase()})`).join(', ') : 'Ninguna';
  }
  count(s: RoomStatus): number { return this.live.filter(r => r.status === s).length; }
  statusOf(n: string): RoomStatus { return this.live.find(r => r.number === n)?.status ?? 'Disponible'; }
  badge(n: string): string { return STATUS_BADGE[this.statusOf(n)]; }
  modeLabel(m: LodgingType): string { return m === 'Habitación' ? 'Habitaciones sueltas' : m === 'Piso' ? 'Piso completo' : 'Casa completa'; }

  readonly tip = (i: number) => {
    const b = this.buckets[i];
    return b ? [b.label, `${pct(b.pct)} · ${b.occupied} de ${b.available} noches`] : [];
  };

  apply(): void {
    this.applied = { ...this.draft };
    this.compute();
    this.svc.log('reporte de ocupación generado', rangeLabel(this.applied));
  }

  private compute(): void {
    const f = this.applied, s = this.svc;
    this.occ = s.occupancy(f, { lodgingType: f.mode, room: f.room });
    const cmpPeriod = shiftMonth(f.from.slice(0, 7), -1);
    this.cmp = s.monthSummary(cmpPeriod);
    this.cmpName = monthName(cmpPeriod).replace(/^./, c => c.toUpperCase());
    this.d = {
      pct: delta(this.occ.pct, this.cmp.occupancy, 'pp'), stay: delta(this.occ.avgStay, this.cmp.avgStay),
      adr: delta(this.occ.adr, this.cmp.adr), revpar: delta(this.occ.revpar, this.cmp.revpar),
    };

    // Serie diaria o semanal (bloques de 7 noches desde el inicio del rango)
    const days = this.occ.days;
    if (f.group === 'Día') {
      this.buckets = days.map(x => ({ label: dmy(x.date), pct: x.pct, occupied: x.occupied, available: x.available }));
      this.labels = days.map(x => String(+x.date.slice(8)));
    } else {
      this.buckets = [];
      for (let i = 0; i < days.length; i += 7) {
        const w = days.slice(i, i + 7);
        const occupied = w.reduce((a, x) => a + x.occupied, 0), available = w.reduce((a, x) => a + x.available, 0);
        this.buckets.push({ label: `${dm(w[0].date)} – ${dm(w[w.length - 1].date)}`, pct: available ? occupied / available * 100 : 0, occupied, available });
      }
      this.labels = this.buckets.map(b => b.label.slice(0, 5));
    }
    this.series = [{ name: 'Ocupación', color: COLORS.blue, values: this.buckets.map(b => b.pct), area: true }];

    const weeks: { label: string; pct: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const w = days.slice(i, i + 7);
      if (w.length < 4 && weeks.length) continue;
      const av = w.reduce((a, x) => a + x.available, 0);
      weeks.push({ label: `${dm(w[0].date).slice(0, 2)}–${dm(w[w.length - 1].date)}`, pct: av ? w.reduce((a, x) => a + x.occupied, 0) / av * 100 : 0 });
    }
    this.bestWeek = weeks.length > 1 ? weeks.reduce((a, b) => b.pct > a.pct ? b : a) : null;
    this.worstWeek = weeks.length > 1 ? weeks.reduce((a, b) => b.pct < a.pct ? b : a) : null;

    // Lectura: fines de semana (noches de viernes y sábado) frente a lunes–miércoles
    const avgOf = (pred: (dow: number) => boolean) => {
      const sel = days.filter(x => pred(new Date(`${x.date}T12:00`).getDay()));
      const av = sel.reduce((a, x) => a + x.available, 0);
      return av ? sel.reduce((a, x) => a + x.occupied, 0) / av * 100 : 0;
    };
    const weekend = avgOf(d => d === 5 || d === 6), weekdays = avgOf(d => d >= 1 && d <= 3);
    const peak = days.reduce((a, x) => x.pct > a.pct ? x : a, days[0]);
    this.insight = !days.length ? '' : this.occ.occupied === 0 ? 'No hay noches ocupadas en el rango seleccionado.'
      : `Viernes y sábados promedian ${pct(weekend)} y de lunes a miércoles ${pct(weekdays)}. El pico fue el ${dm(peak.date)} con ${pct(peak.pct)}; `
        + (this.goal === null ? `promedio del rango: ${pct(this.occ.pct)} (sin meta de ocupación definida).`
          : this.occ.pct >= this.goal ? `el promedio cumple la meta de ${num(this.goal)} %.` : `el promedio queda ${num(this.goal - this.occ.pct, 1)} pp por debajo de la meta.`);

    // Estado hoy (Alojamiento)
    this.live = s.roomList();
    const today = s.today, tomorrow = addDays(today, 1);
    const list = s.reservationList();
    const stayOf = (n: string) => list.find(r => r.rooms.includes(n) && isInHouse(r));
    const arrivalOf = (n: string) => list.filter(r => r.rooms.includes(n) && awaitsCheckIn(r) && r.checkIn >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
    this.tiles = this.live.map(room => {
      const st = stayOf(room.number), arr = arrivalOf(room.number);
      const sub = room.status === 'Ocupada' && st ? (st.checkOut <= today ? 'Sale hoy' : `${first(st)} · sale ${dm(st.checkOut)}`)
        : room.status === 'Reservada' && arr ? `Llega hoy · ${first(arr)}`
        : room.status === 'Disponible' ? (arr ? `Llega ${arr.checkIn === tomorrow ? 'mañana' : dm(arr.checkIn)}` : 'Disponible')
        : room.status;
      return { room, label: `Hab. ${room.number}`, sub, tone: STATUS_TONE[room.status] };
    });
    const out = list.filter(r => isInHouse(r) && r.checkOut <= today);
    const arriving = list.filter(r => !isVoid(r) && r.checkIn === tomorrow);
    this.todayNote = `${out.length} salida${out.length === 1 ? '' : 's'} hoy${out.length ? ` (${out.map(r => r.rooms.map(n => n).join(', ')).join(' y ')})` : ''} · `
      + `${arriving.length} llegada${arriving.length === 1 ? '' : 's'} mañana${arriving.length ? ` (${arriving.map(r => `${r.guestName}, ${r.adults + r.children + r.infants} huéspedes`).join('; ')})` : ''}.`;
    this.now = new Date().toTimeString().slice(0, 5);

    const types = [...new Set(this.occ.rooms.map(r => r.room.type))];
    this.byType = types.map(type => {
      const rs = this.occ.rooms.filter(r => r.room.type === type);
      const occupied = rs.reduce((a, r) => a + r.occupied, 0), available = rs.reduce((a, r) => a + r.available, 0);
      return { type: type === 'Doble' ? 'Habitaciones dobles' : `Habitaciones ${type.toLowerCase()}es`, rooms: rs.length, occupied, available, pct: available ? occupied / available * 100 : 0 };
    });
  }

  private rows(): unknown[][] {
    return [
      [`Reporte de ocupación · ${this.svc.company}`, rangeLabel(this.applied)], [],
      ['Ocupación promedio', pct(this.occ.pct)], ['Noches ocupadas', this.occ.occupied, 'de', this.occ.available], ['Estancia promedio', num(this.occ.avgStay, 1)],
      ['ADR', Math.round(this.occ.adr)], ['RevPAR', Math.round(this.occ.revpar)], [],
      ['Fecha', 'Noches ocupadas', 'Disponibles', '% ocupación'], ...this.occ.days.map(x => [dmy(x.date), x.occupied, x.available, num(x.pct, 1)]), [],
      ['Habitación', 'Tipo', 'Noches ocupadas', 'Disponibles', '% ocupación', 'Estadías', 'Estancia promedio', 'Estado hoy'],
      ...this.occ.rooms.map(r => [`Hab. ${r.room.number}`, r.room.type, r.occupied, r.available, num(r.pct, 1), r.stays, num(r.avgStay, 1), this.statusOf(r.room.number)]),
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.rows(), `reporte-ocupacion-${this.applied.from}_${this.applied.to}.csv`);
    this.svc.log('exportación', `Reporte de ocupación.csv · ${rangeLabel(this.applied)}`);
  }

  pdf(): void {
    const host = document.querySelector('app-reports-occupancy rp-lines');
    openDocument('Reporte de ocupación', `
      <header><div><h1>Reporte de ocupación</h1><div class="muted">${esc(this.svc.company)} · ${rangeLabel(this.applied)}</div></div><div class="brand">SOGO</div></header>
      <table><tbody><tr><td>Ocupación promedio</td><td class="r"><strong>${pct(this.occ.pct)}</strong></td><td>Noches ocupadas</td><td class="r">${this.occ.occupied} de ${this.occ.available}</td></tr>
      <tr><td>Estancia promedio</td><td class="r">${num(this.occ.avgStay, 1)} noches</td><td>ADR / RevPAR</td><td class="r">${money(this.occ.adr)} / ${money(this.occ.revpar)}</td></tr></tbody></table>
      ${host ? `<h2>Ocupación ${this.applied.group === 'Día' ? 'diaria' : 'semanal'}</h2>${svgMarkup(host, 700)}<p class="muted">${esc(this.insight)}</p>` : ''}
      <h2>Por habitación</h2><table><thead><tr><th>Habitación</th><th class="r">Noches</th><th class="r">%</th><th class="r">Estadías</th></tr></thead><tbody>
      ${this.occ.rooms.map(r => `<tr><td>Hab. ${r.room.number} · ${esc(r.room.type)}</td><td class="r">${r.occupied} / ${r.available}</td><td class="r">${pct(r.pct)}</td><td class="r">${r.stays}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="r">${this.occ.occupied} / ${this.occ.available}</td><td class="r">${pct(this.occ.pct)}</td><td class="r">${this.occ.stays}</td></tr></tbody></table>`, true);
    this.svc.log('exportación', `Reporte de ocupación.pdf · ${rangeLabel(this.applied)}`);
  }
}

const first = (r: Reservation) => r.guestName.split(' ').slice(0, 2).join(' ');
