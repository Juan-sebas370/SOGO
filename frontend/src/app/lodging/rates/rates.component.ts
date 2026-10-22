import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RatesService, RoomPrice } from '../rates.service';
import {
  Rate, RATE_TYPES, Season, SEASON_LABEL, SeasonCalendar, YearlyRange, SpecialRange, CHILD_FACTOR,
  colombianHolidays, defaultCalendar, quote, seasonOf, parseIso,
} from '../rates.model';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';

type Tab = 'rates' | 'rooms' | 'calendar' | 'quote';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Alojamiento › Tarifas y temporadas: tarifas por persona de cada tipo de reserva, precio por
 * noche de cada habitación, calendario de temporadas (con festivos y fechas especiales) y un
 * cotizador. Todo se guarda en la base de datos compartida: es lo que cobra la página web.
 */
@Component({
  selector: 'app-lodging-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/lodging">Alojamiento</a><span>/</span><span>Tarifas y temporadas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Tarifas y temporadas</h1>
      <p class="kit-sub">Lo que se guarda aquí es lo que cobra la página web al reservar y lo que sugiere Reservas en SOGO.</p>
    </div>
    <div class="kit-actions" *ngIf="tab !== 'quote'">
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty || saving" (click)="discard()">Descartar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || saving || !svc.canEdit" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>
  </header>

  <p class="kit-banner kit-banner--danger" *ngIf="svc.loadError" role="alert">{{ svc.loadError }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error && dirty" role="alert">{{ error }}</p>
  <p class="kit-banner kit-banner--warn" *ngIf="!svc.canEdit">Tu rol puede consultar las tarifas, pero no cambiarlas (permiso «editar» de Alojamiento).</p>
  <p class="kit-banner kit-banner--info" *ngIf="!svc.calendarSaved && !svc.loadError">El calendario de temporadas aún no se ha guardado: la web usa el de fábrica (el mismo que ves aquí). Guárdalo una vez para que tome los festivos de Colombia.</p>


  <section class="kit-kpis rt-kpis">
    <div class="kit-kpi rt-today" [ngClass]="'rt-' + today.season"><div><span>Temporada de hoy</span><strong>{{ label[today.season] }}</strong><small>{{ today.reason }}</small></div></div>
    <div class="kit-kpi"><div><span>Próxima temporada alta</span><strong>{{ nextHigh.date ? dm(nextHigh.date) : '—' }}</strong><small>{{ nextHigh.reason }}</small></div></div>
    <div class="kit-kpi"><div><span>Días de cada temporada en {{ year }}</span><strong class="rt-mini">{{ yearCount.alta }} alta · {{ yearCount.media }} media</strong><small>{{ yearCount.baja }} días en baja</small></div></div>
    <div class="kit-kpi"><div><span>Individual esta noche</span><strong>{{ money(tonight) }}</strong><small>Por persona · temporada {{ label[today.season].toLowerCase() }}</small></div></div>
  </section>

  <div class="rt-tabs" role="tablist">
    <button type="button" role="tab" [class.active]="tab === 'rates'" (click)="tab = 'rates'">Tarifas por tipo de reserva</button>
    <button type="button" role="tab" [class.active]="tab === 'rooms'" (click)="tab = 'rooms'">Precio por habitación</button>
    <button type="button" role="tab" [class.active]="tab === 'calendar'" (click)="tab = 'calendar'">Calendario de temporadas</button>
    <button type="button" role="tab" [class.active]="tab === 'quote'" (click)="tab = 'quote'">Cotizador</button>
  </div>

  <!-- ── Tarifas por tipo de reserva ── -->
  <section class="kit-card" *ngIf="tab === 'rates'">
    <h2 class="kit-card-title">Tarifas por persona</h2>
    <p class="kit-card-sub">Es lo que cobra la web: tarifa de la temporada del día de llegada × personas × noches (pasadía y grupo de trabajo: × 1 día).</p>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Tipo de reserva</th><th>Se cobra</th><th class="r rt-th-baja">Baja</th><th class="r rt-th-media">Media</th><th class="r rt-th-alta">Alta</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rates">
            <td><input class="rsv-input rt-name" [(ngModel)]="r.name" maxlength="60" [disabled]="!svc.canEdit" [attr.aria-label]="'Nombre de ' + r.type"></td>
            <td class="kit-muted">{{ unit(r) }}</td>
            <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.low" [disabled]="!svc.canEdit" [attr.aria-label]="r.name + ' baja'"></span></td>
            <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.mid" [disabled]="!svc.canEdit" [attr.aria-label]="r.name + ' media'"></span></td>
            <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.high" [disabled]="!svc.canEdit" [attr.aria-label]="r.name + ' alta'"></span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="rt-rules">
      <span><b>Adultos y niños de 11 años o más:</b> tarifa completa</span>
      <span><b>Niños de 4 a 10 años:</b> {{ childPct }} % de la tarifa</span>
      <span><b>Niños de 0 a 3 años:</b> no pagan</span>
      <span><b>Temporada:</b> la del día de llegada, para toda la estadía</span>
    </div>
  </section>

  <!-- ── Precio por habitación ── -->
  <section class="kit-card" *ngIf="tab === 'rooms'">
    <h2 class="kit-card-title">Precio por noche de cada habitación</h2>
    <p class="kit-card-sub">Es el que muestra la página web en «Habitaciones». Lo que se cobra al reservar es la tarifa por persona.</p>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Habitación</th><th>Tipo</th><th class="r rt-th-baja">Baja</th><th class="r rt-th-media">Media</th><th class="r rt-th-alta">Alta</th></tr></thead>
        <tbody>
          <ng-container *ngFor="let f of floors">
            <tr class="rt-group"><td colspan="2"><strong>Piso {{ f }}</strong></td>
              <td class="r">{{ money(floorSum(f, 'low')) }}</td><td class="r">{{ money(floorSum(f, 'mid')) }}</td><td class="r">{{ money(floorSum(f, 'high')) }}</td></tr>
            <tr *ngFor="let r of roomsOn(f)">
              <td><strong>Hab. {{ r.number }}</strong></td><td class="kit-muted">{{ r.type }}</td>
              <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.low" [disabled]="!svc.canEdit" [attr.aria-label]="'Hab. ' + r.number + ' baja'"></span></td>
              <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.mid" [disabled]="!svc.canEdit" [attr.aria-label]="'Hab. ' + r.number + ' media'"></span></td>
              <td class="r"><span class="rt-money"><span>$</span><input type="number" min="0" step="1000" [(ngModel)]="r.high" [disabled]="!svc.canEdit" [attr.aria-label]="'Hab. ' + r.number + ' alta'"></span></td>
            </tr>
          </ng-container>
          <tr class="rt-total"><td colspan="2">Casa completa</td><td class="r">{{ money(allSum('low')) }}</td><td class="r">{{ money(allSum('mid')) }}</td><td class="r">{{ money(allSum('high')) }}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="kit-muted rt-note">Las habitaciones nuevas, su capacidad y su estado se manejan en Configuración › Alojamiento y reservas.</p>
  </section>

  <!-- ── Calendario de temporadas ── -->
  <ng-container *ngIf="tab === 'calendar'">
    <div class="rt-two">
      <section class="kit-card">
        <h2 class="kit-card-title">Reglas</h2>
        <p class="kit-card-sub">Orden: fechas especiales → temporada alta → Semana Santa → temporada media → festivos → fines de semana → baja.</p>

        <h3 class="rt-h3"><i class="rt-dot rt-alta"></i>Temporada alta · periodos de cada año</h3>
        <div class="rt-range" *ngFor="let r of cal.alta; let i = index">
          <input class="rsv-input" [(ngModel)]="r.nombre" placeholder="Nombre" maxlength="60" [disabled]="!svc.canEdit" aria-label="Nombre del periodo">
          <input class="rsv-input rt-md" [(ngModel)]="r.desde" placeholder="MM-DD" maxlength="5" [disabled]="!svc.canEdit" aria-label="Desde (MM-DD)">
          <span>a</span>
          <input class="rsv-input rt-md" [(ngModel)]="r.hasta" placeholder="MM-DD" maxlength="5" [disabled]="!svc.canEdit" aria-label="Hasta (MM-DD)">
          <button type="button" class="rt-x" *ngIf="svc.canEdit" (click)="cal.alta.splice(i, 1)" aria-label="Quitar periodo">×</button>
        </div>
        <button type="button" class="rsv-btn rsv-btn--outline rt-add" *ngIf="svc.canEdit" (click)="cal.alta.push({ nombre: '', desde: '', hasta: '' })">+ Periodo alto</button>
        <label class="rt-check"><input type="checkbox" [(ngModel)]="cal.semanaSanta" [disabled]="!svc.canEdit"> Semana Santa es temporada alta <small>(del sábado antes de Ramos al Domingo de Pascua; se calcula cada año)</small></label>

        <h3 class="rt-h3"><i class="rt-dot rt-media"></i>Temporada media</h3>
        <label class="rt-check"><input type="checkbox" [(ngModel)]="cal.finesDeSemana" [disabled]="!svc.canEdit"> Sábados y domingos</label>
        <label class="rt-check"><input type="checkbox" [(ngModel)]="cal.festivosMedia" [disabled]="!svc.canEdit"> Festivos (lista de abajo)</label>
        <div class="rt-range" *ngFor="let r of cal.media; let i = index">
          <input class="rsv-input" [(ngModel)]="r.nombre" placeholder="Nombre" maxlength="60" [disabled]="!svc.canEdit" aria-label="Nombre del periodo">
          <input class="rsv-input rt-md" [(ngModel)]="r.desde" placeholder="MM-DD" maxlength="5" [disabled]="!svc.canEdit" aria-label="Desde (MM-DD)">
          <span>a</span>
          <input class="rsv-input rt-md" [(ngModel)]="r.hasta" placeholder="MM-DD" maxlength="5" [disabled]="!svc.canEdit" aria-label="Hasta (MM-DD)">
          <button type="button" class="rt-x" *ngIf="svc.canEdit" (click)="cal.media.splice(i, 1)" aria-label="Quitar periodo">×</button>
        </div>
        <button type="button" class="rsv-btn rsv-btn--outline rt-add" *ngIf="svc.canEdit" (click)="cal.media.push({ nombre: '', desde: '', hasta: '' })">+ Periodo medio</button>

        <h3 class="rt-h3"><i class="rt-dot rt-esp"></i>Fechas especiales <small>(ferias, eventos del pueblo; mandan sobre todo)</small></h3>
        <div class="rt-range rt-range--sp" *ngFor="let s of cal.especiales; let i = index">
          <input class="rsv-input" [(ngModel)]="s.nombre" placeholder="Ej.: Fiestas de Filandia" maxlength="60" [disabled]="!svc.canEdit" aria-label="Nombre">
          <input class="rsv-input" type="date" [(ngModel)]="s.desde" [disabled]="!svc.canEdit" aria-label="Desde">
          <input class="rsv-input" type="date" [(ngModel)]="s.hasta" [disabled]="!svc.canEdit" aria-label="Hasta">
          <select class="rsv-input" [(ngModel)]="s.temporada" [disabled]="!svc.canEdit" aria-label="Temporada"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
          <button type="button" class="rt-x" *ngIf="svc.canEdit" (click)="cal.especiales.splice(i, 1)" aria-label="Quitar fecha especial">×</button>
        </div>
        <button type="button" class="rsv-btn rsv-btn--outline rt-add" *ngIf="svc.canEdit" (click)="addSpecial()">+ Fecha especial</button>
      </section>

      <section class="kit-card">
        <div class="rt-hol-head">
          <h2 class="kit-card-title">Festivos</h2>
          <div class="rt-hol-actions" *ngIf="svc.canEdit">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="addHolidays(year)">+ Festivos de Colombia {{ year }}</button>
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="addHolidays(year + 1)">+ {{ year + 1 }}</button>
          </div>
        </div>
        <p class="kit-card-sub">Se calculan con la ley colombiana (los trasladables pasan al lunes). Puedes agregar o quitar fechas.</p>
        <div class="rt-hol-add" *ngIf="svc.canEdit">
          <input class="rsv-input" type="date" [(ngModel)]="newHoliday" aria-label="Agregar festivo">
          <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!newHoliday" (click)="addHoliday()">Agregar</button>
        </div>
        <div class="rt-hols">
          <span class="rt-hol" *ngFor="let f of cal.festivos" [class.past]="f < todayIso">{{ dmy(f) }} <small>{{ holidayName(f) }}</small>
            <button type="button" *ngIf="svc.canEdit" (click)="removeHoliday(f)" [attr.aria-label]="'Quitar festivo ' + f">×</button></span>
          <p class="kit-muted" *ngIf="!cal.festivos.length">Sin festivos.</p>
        </div>
      </section>
    </div>

    <section class="kit-card rt-year">
      <div class="rt-year-head">
        <h2 class="kit-card-title">Vista del año</h2>
        <div class="rt-year-nav">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="year = year - 1" aria-label="Año anterior">‹</button>
          <strong>{{ year }}</strong>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="year = year + 1" aria-label="Año siguiente">›</button>
        </div>
        <div class="rt-legend"><span><i class="rt-dot rt-alta"></i>Alta</span><span><i class="rt-dot rt-media"></i>Media</span><span><i class="rt-dot rt-baja"></i>Baja</span></div>
      </div>
      <div class="rt-months">
        <div class="rt-month" *ngFor="let m of months">
          <strong>{{ m.name }}</strong>
          <div class="rt-wd"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
          <div class="rt-days">
            <span *ngFor="let b of m.blank"></span>
            <span *ngFor="let d of m.days" class="rt-day" [ngClass]="'rt-' + d.season" [class.today]="d.iso === todayIso" [attr.title]="dmy(d.iso) + ' · ' + label[d.season] + ' · ' + d.reason">{{ d.day }}</span>
          </div>
        </div>
      </div>
    </section>
  </ng-container>

  <!-- ── Cotizador ── -->
  <section class="kit-card rt-quote" *ngIf="tab === 'quote'">
    <h2 class="kit-card-title">Cotizador</h2>
    <p class="kit-card-sub">Calcula lo mismo que cobra la página web, con las tarifas y el calendario guardados.</p>
    <div class="rt-q-grid">
      <label class="kit-field">Tipo de reserva<select class="rsv-input" [(ngModel)]="q.type"><option *ngFor="let r of svc.rates$.value" [value]="r.type">{{ r.name }}</option></select></label>
      <label class="kit-field">Llegada<input class="rsv-input" type="date" [(ngModel)]="q.checkIn"></label>
      <label class="kit-field" *ngIf="!perDay(q.type)">Noches<input class="rsv-input" type="number" min="1" max="60" [(ngModel)]="q.nights"></label>
      <label class="kit-field">Adultos y niños de 11+<input class="rsv-input" type="number" min="1" max="40" [(ngModel)]="q.adults"></label>
      <label class="kit-field">Niños de 4 a 10<input class="rsv-input" type="number" min="0" max="40" [(ngModel)]="q.children"></label>
      <label class="kit-field">Niños de 0 a 3<input class="rsv-input" type="number" min="0" max="20" [(ngModel)]="q.infants"></label>
    </div>
    <div class="rt-q-result" *ngIf="result as r">
      <div class="rt-q-season" [ngClass]="'rt-' + r.season"><span>Temporada</span><strong>{{ label[r.season] }}</strong><small>{{ r.reason }}</small></div>
      <div class="rt-q-lines">
        <div><span>Tarifa por persona</span><strong>{{ money(r.perPerson) }}</strong></div>
        <div><span>{{ +q.adults || 0 }} × {{ money(r.perPerson) }}</span><strong>{{ money((+q.adults || 0) * r.perPerson) }}</strong></div>
        <div *ngIf="+q.children"><span>{{ q.children }} niño(s) × {{ childPct }} %</span><strong>{{ money((+q.children || 0) * r.perPerson * childFactor) }}</strong></div>
        <div *ngIf="+q.infants"><span>{{ q.infants }} bebé(s)</span><strong>Sin costo</strong></div>
        <div><span>Por {{ r.perDay ? 'día' : 'noche' }}</span><strong>{{ money(r.perNight) }}</strong></div>
        <div *ngIf="!r.perDay"><span>× {{ r.units }} noche{{ r.units === 1 ? '' : 's' }}</span><strong></strong></div>
        <div class="rt-q-total"><span>Total</span><strong>{{ money(r.total) }}</strong></div>
      </div>
    </div>
  </section>
  `,
  styles: [`
    .rt-kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .rt-mini { font-size: 17px !important; }
    .rt-today.rt-alta { border-color: #F2B8A0; background: #FFF6F1; }
    .rt-today.rt-media { border-color: #F3D9A4; background: #FFFBF1; }
    .rt-today.rt-baja { border-color: #BFE3CC; background: #F3FBF6; }
    .rt-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .rt-tabs button { height: 38px; padding: 0 16px; border: none; border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #1F2937; cursor: pointer; }
    .rt-tabs button.active { background: #0A3D6D; color: #fff; }
    .rt-name { height: 34px; min-width: 190px; font-weight: 600; }
    .rt-money { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #D5DEEA; border-radius: 8px; padding: 0 8px; height: 34px; background: #fff; }
    .rt-money span { color: #6B7280; font-size: 12px; }
    .rt-money input { border: none; width: 96px; text-align: right; font: inherit; font-weight: 600; outline: none; background: transparent; }
    .rt-th-baja { color: #15803D !important; } .rt-th-media { color: #B45309 !important; } .rt-th-alta { color: #C2410C !important; }
    .rt-rules { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .rt-rules span { background: #F4F7FB; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #374151; }
    .rt-group td { background: #F4F7FB; }
    .rt-total td { background: #EEF5FD; font-weight: 700; color: #0A2540; }
    .rt-note { font-size: 12px; margin: 10px 0 0; }
    .rt-two { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; align-items: start; }
    .rt-h3 { display: flex; align-items: center; gap: 8px; margin: 16px 0 8px; font-size: 13px; color: #0A2540; }
    .rt-h3 small { font-weight: 400; color: #6B7280; }
    .rt-dot { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }
    .rt-dot.rt-alta, .rt-day.rt-alta { background: #F8C9B4; }
    .rt-dot.rt-media, .rt-day.rt-media { background: #FBE3B0; }
    .rt-dot.rt-baja, .rt-day.rt-baja { background: #D7F0E0; }
    .rt-dot.rt-esp { background: #C9D9F5; }
    .rt-range { display: grid; grid-template-columns: minmax(120px, 1fr) 80px auto 80px 28px; gap: 6px; align-items: center; margin-bottom: 6px; }
    .rt-range--sp { grid-template-columns: minmax(120px, 1fr) 140px 140px 90px 28px; }
    .rt-range .rsv-input { height: 34px; }
    .rt-md { text-align: center; }
    .rt-x { border: none; background: none; color: #9AA5B4; font-size: 18px; cursor: pointer; }
    .rt-x:hover { color: #B91C1C; }
    .rt-add { height: 32px; font-size: 12px; margin: 2px 0 6px; }
    .rt-check { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; margin: 6px 0; cursor: pointer; }
    .rt-check input { margin-top: 3px; accent-color: #0B6FD0; }
    .rt-check small { color: #6B7280; }
    .rt-hol-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; }
    .rt-hol-actions { display: flex; gap: 6px; }
    .rt-hol-actions .rsv-btn { height: 32px; font-size: 12px; }
    .rt-hol-add { display: flex; gap: 6px; margin-bottom: 10px; }
    .rt-hol-add .rsv-input, .rt-hol-add .rsv-btn { height: 34px; }
    .rt-hols { display: flex; flex-wrap: wrap; gap: 6px; max-height: 380px; overflow: auto; }
    .rt-hol { display: inline-flex; align-items: center; gap: 4px; padding: 4px 4px 4px 10px; border-radius: 999px; background: #FFF6E5; border: 1px solid #F3D9A4; font-size: 12px; font-weight: 600; color: #92400E; }
    .rt-hol small { font-weight: 400; color: #A16207; }
    .rt-hol.past { opacity: .5; }
    .rt-hol button { border: none; background: none; cursor: pointer; color: #A16207; font-size: 14px; }
    .rt-year-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .rt-year-nav { display: flex; align-items: center; gap: 10px; }
    .rt-year-nav .rsv-btn { height: 32px; width: 36px; padding: 0; }
    .rt-legend { display: flex; gap: 14px; font-size: 12px; }
    .rt-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .rt-months { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .rt-month strong { display: block; font-size: 12.5px; color: #0A2540; margin-bottom: 4px; }
    .rt-wd, .rt-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .rt-wd span { font-size: 10px; color: #9AA5B4; text-align: center; }
    .rt-day { font-size: 11px; text-align: center; padding: 3px 0; border-radius: 4px; color: #1F2937; cursor: default; }
    .rt-day.today { outline: 2px solid #0A3D6D; font-weight: 700; }
    .rt-q-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0 14px; }
    .rt-q-result { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 16px; margin-top: 8px; }
    .rt-q-season { border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 2px; }
    .rt-q-season.rt-alta { background: #FFF1EA; } .rt-q-season.rt-media { background: #FFF8E8; } .rt-q-season.rt-baja { background: #EEF9F2; }
    .rt-q-season span, .rt-q-season small { font-size: 12px; color: #4B5563; }
    .rt-q-season strong { font-size: 22px; color: #0A2540; }
    .rt-q-lines div { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #EEF1F5; font-size: 13px; }
    .rt-q-total { border-bottom: none !important; font-size: 16px !important; color: #0A3D6D; }
    @media (max-width: 1000px) { .rt-two, .rt-q-result { grid-template-columns: 1fr; } }
  `],
})
export class RatesComponent {
  readonly label = SEASON_LABEL;
  readonly money = fmtMoney;
  readonly childFactor = CHILD_FACTOR;
  readonly childPct = Math.round(CHILD_FACTOR * 100);
  readonly todayIso = new Date().toISOString().slice(0, 10);

  tab: Tab = 'rates';
  rates: Rate[] = [];
  rooms: RoomPrice[] = [];
  cal: SeasonCalendar = defaultCalendar();
  year = new Date().getFullYear();
  newHoliday = '';
  saving = false;
  q = { type: 'individual', checkIn: this.todayIso, nights: 2, adults: 2, children: 0, infants: 0 };
  private base = '';

  constructor(public svc: RatesService, private users: UsersService) {
    svc.load().then(() => this.reset());
  }

  private reset(): void {
    this.rates = clone(this.svc.rates$.value);
    this.rooms = this.svc.roomPrices();
    this.cal = clone(this.svc.calendar$.value);
    this.base = this.snapshot();
  }

  private snapshot(): string { return JSON.stringify({ r: this.rates, h: this.rooms, c: this.cal }); }
  get dirty(): boolean { return !!this.base && this.snapshot() !== this.base; }

  get error(): string {
    if (this.rates.some(r => !(+r.low > 0) || !(+r.mid > 0) || !(+r.high > 0) || !r.name.trim())) return 'Cada tipo de reserva necesita nombre y tarifas baja, media y alta mayores que cero.';
    if (this.rooms.some(r => !(+r.low > 0) || !(+r.mid > 0) || !(+r.high > 0))) return 'Cada habitación necesita sus precios baja, media y alta mayores que cero.';
    if ([...this.cal.alta, ...this.cal.media].some(r => !MD.test(r.desde) || !MD.test(r.hasta))) return 'Las fechas de los periodos van como MM-DD (por ejemplo 12-15 para el 15 de diciembre).';
    if (this.cal.especiales.some(s => !s.desde || !s.hasta || s.hasta < s.desde)) return 'Revisa las fechas especiales: «hasta» va después de «desde».';
    return '';
  }

  // ── Indicadores ──
  get today() { return seasonOf(this.todayIso, this.cal); }
  get tonight(): number { const r = this.rates.find(x => x.type === 'individual'); return !r ? 0 : this.today.season === 'alta' ? +r.high : this.today.season === 'media' ? +r.mid : +r.low; }
  get nextHigh(): { date: string; reason: string } {
    const d = parseIso(this.todayIso);
    for (let i = 1; i <= 400; i++) {
      d.setDate(d.getDate() + 1);
      const iso = isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const s = seasonOf(iso, this.cal);
      if (s.season === 'alta') return { date: iso, reason: s.reason };
    }
    return { date: '', reason: 'Sin temporada alta en el próximo año' };
  }
  get yearCount(): Record<Season, number> {
    const c: Record<Season, number> = { alta: 0, media: 0, baja: 0 };
    this.months.forEach(m => m.days.forEach(d => c[d.season]++));
    return c;
  }

  // ── Tarifas ──
  unit(r: Rate): string { return RATE_TYPES.find(t => t.type === r.type)?.perDay ? 'por persona / día' : 'por persona / noche'; }
  perDay(type: string): boolean { return !!RATE_TYPES.find(t => t.type === type)?.perDay; }

  // ── Habitaciones ──
  get floors(): number[] { return [...new Set(this.rooms.map(r => r.floor))].sort(); }
  roomsOn(f: number): RoomPrice[] { return this.rooms.filter(r => r.floor === f); }
  floorSum(f: number, k: 'low' | 'mid' | 'high'): number { return this.roomsOn(f).reduce((s, r) => s + (+r[k] || 0), 0); }
  allSum(k: 'low' | 'mid' | 'high'): number { return this.rooms.reduce((s, r) => s + (+r[k] || 0), 0); }

  // ── Calendario ──
  get months() {
    return MONTHS.map((name, i) => {
      const first = new Date(this.year, i, 1).getDay();
      const total = new Date(this.year, i + 1, 0).getDate();
      return {
        name, blank: Array((first + 6) % 7).fill(0),
        days: Array.from({ length: total }, (_, k) => {
          const iso = isoOf(this.year, i + 1, k + 1);
          const s = seasonOf(iso, this.cal);
          return { day: k + 1, iso, season: s.season, reason: s.reason };
        }),
      };
    });
  }

  addSpecial(): void { this.cal.especiales.push({ nombre: '', desde: this.todayIso, hasta: this.todayIso, temporada: 'alta' } as SpecialRange); }
  addHoliday(): void { if (this.newHoliday && !this.cal.festivos.includes(this.newHoliday)) this.cal.festivos = [...this.cal.festivos, this.newHoliday].sort(); this.newHoliday = ''; }
  removeHoliday(f: string): void { this.cal.festivos = this.cal.festivos.filter(x => x !== f); }
  addHolidays(y: number): void { this.cal.festivos = [...new Set([...this.cal.festivos, ...colombianHolidays(y).map(h => h.date)])].sort(); }
  holidayName(f: string): string { return colombianHolidays(+f.slice(0, 4)).find(h => h.date === f)?.name ?? ''; }
  dmy(iso: string): string { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; }
  dm(iso: string): string { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }

  // ── Cotizador ──
  get result() {
    const rate = this.rates.find(r => r.type === this.q.type);
    if (!rate || !this.q.checkIn) return null;
    return quote({ ...rate, low: +rate.low, mid: +rate.mid, high: +rate.high }, this.q.checkIn, +this.q.nights || 1, +this.q.adults || 0, +this.q.children || 0, this.cal);
  }

  discard(): void { this.reset(); }

  async save(): Promise<void> {
    if (this.error || !this.svc.canEdit) return;
    this.saving = true;
    const before = JSON.parse(this.base);
    const done: string[] = [];
    try {
      const rates = this.rates.map(r => ({ ...r, name: r.name.trim(), low: +r.low, mid: +r.mid, high: +r.high }));
      if (JSON.stringify(rates) !== JSON.stringify(before.r)) { await this.svc.saveRates(rates); done.push('tarifas por tipo de reserva'); }
      const rooms = this.rooms.map(r => ({ ...r, low: +r.low, mid: +r.mid, high: +r.high }));
      const n = await this.svc.saveRoomPrices(rooms);
      if (n) done.push(`precios de ${n} habitación(es)`);
      const cal: SeasonCalendar = { ...this.cal, alta: this.cal.alta.map(trimRange), media: this.cal.media.map(trimRange),
        especiales: this.cal.especiales.map(s => ({ ...s, nombre: s.nombre.trim() })) };
      if (JSON.stringify(cal) !== JSON.stringify(before.c) || !this.svc.calendarSaved) { await this.svc.saveCalendar(cal); done.push('calendario de temporadas'); }
      if (done.length) this.users.addLog('Alojamiento: tarifas y temporadas', `Actualizado: ${done.join(' · ')}`);
      this.reset();
    } finally {
      this.saving = false;
    }
  }
}

const trimRange = (r: YearlyRange): YearlyRange => ({ ...r, nombre: r.nombre.trim() });
