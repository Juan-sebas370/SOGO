import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Reservation } from '../../reservations/reservation.model';
import { isoDate } from '../../shared/date-utils';
import { UsersService } from '../../users/users.service';
import { TraService, TraRow } from '../tra.service';
import { TraRecord, TraGuest, SireGuestData, SireMovement } from '../tra.model';
import { COUNTRIES, COUNTRY_OPTIONS, FREQUENT_COUNTRIES, docTypeLabel } from '../tra-catalogs';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { fullName, fmtDoc, fmtStamp, travelOf } from '../tra-rules';
import { sireTxt, missingCodes } from '../sire-file';
import { sireCodes } from '../sire-codes';
import {
  SIRE_PORTAL, sireDataOf, sireIssues, sireFormFields, sireStatusLabel, sireStatusBadge, isDue, dmy
} from '../sire-rules';

type Tab = 'POR_REPORTAR' | 'PROGRAMADOS' | 'REPORTADOS' | 'TODOS';

/** Un movimiento con su reserva y su huésped ya resueltos. */
interface Line {
  m:     SireMovement;
  r:     Reservation;
  rec:   TraRecord;
  g:     TraGuest;
  key:   string;
  index: string;              // texto de búsqueda
}

/** Movimientos de una misma fecha: el SIRE solo guarda juntos los registros de la misma fecha. */
interface Group { date: string; lines: Line[]; }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Texto en ANSI (Windows-1252), como el «texto delimitado por tabulaciones» de Excel que pide la guía
 * del SIRE: la Ñ y las tildes van en un byte. Lo que no cabe se escribe sin tilde (o «?»).
 */
export function ansi(text: string): Uint8Array {
  const byte = (c: string) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63);
  return Uint8Array.from([...text].flatMap(ch => ch.charCodeAt(0) < 256 ? [ch.charCodeAt(0)]
    : [...ch.normalize('NFD').replace(/\p{Diacritic}/gu, '')].map(byte)));
}

// SIRE (Migración Colombia) dentro del módulo TRA. El SIRE no tiene API: esta pantalla
// dice qué extranjeros reportar cada día, entrega los datos en el orden del formulario
// de Alojamiento y Hospedaje para copiarlos, y registra quién lo reportó y cuándo.
@Component({
  selector: 'app-tra-sire',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchSelectComponent],
  styleUrls: ['./tra-sire.component.css'],
  template: `
  <header class="rsv-header">
    <div class="rsv-header-main">
      <span class="rsv-header-icon">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </span>
      <div>
        <span class="rsv-eyebrow"><a routerLink="/dashboard/tra">TRA</a><span aria-hidden="true">/</span>SIRE</span>
        <h1 class="rsv-title">SIRE · Reporte de extranjeros</h1>
        <p class="rsv-subtitle">Migración Colombia: reporta la entrada y la salida de cada huésped extranjero el mismo día en que ocurren.</p>
      </div>
    </div>
    <div class="rsv-header-actions">
      <a routerLink="/dashboard/tra" class="rsv-btn rsv-btn--outline">Volver a la TRA</a>
      <a [href]="portal" target="_blank" rel="noopener" class="rsv-btn rsv-btn--primary">
        <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Abrir portal de Migración
      </a>
    </div>
  </header>

  <section class="rsv-kpis">
    <button type="button" class="rsv-kpi" (click)="setTab('POR_REPORTAR')">
      <span class="rsv-kpi-icon rsv-kpi-icon--blue"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Por reportar hoy</span>
        <span class="rsv-kpi-value">{{ kpi.today }}</span>
        <span class="rsv-kpi-detail">entradas y salidas de hoy</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="setTab('POR_REPORTAR')">
      <span class="rsv-kpi-icon rsv-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Vencidos</span>
        <span class="rsv-kpi-value">{{ kpi.late }}</span>
        <span class="rsv-kpi-detail">debían reportarse el día del movimiento</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="setTab('POR_REPORTAR')">
      <span class="rsv-kpi-icon rsv-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Faltan datos</span>
        <span class="rsv-kpi-value">{{ kpi.incomplete }}</span>
        <span class="rsv-kpi-detail">completa la ficha antes de reportar</span>
      </span>
    </button>
    <button type="button" class="rsv-kpi" (click)="setTab('REPORTADOS')">
      <span class="rsv-kpi-icon rsv-kpi-icon--emerald"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
      <span class="rsv-kpi-body">
        <span class="rsv-kpi-label">Reportados este mes</span>
        <span class="rsv-kpi-value">{{ kpi.reported }}</span>
        <span class="rsv-kpi-detail">movimientos guardados en el SIRE</span>
      </span>
    </button>
  </section>

  <div class="tra-alert tra-alert--info">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    <div class="tra-alert-body">
      <strong>Cómo reportar.</strong> En el SIRE entra a <em>Cargar Información › Alojamiento y Hospedaje › Diligenciar Formulario</em>,
      copia los datos de la ficha de cada huésped, pulsa <em>Agregar Registro</em> y al final <em>Guardar</em>.
      Agrega juntos solo los registros de la misma fecha de movimiento. Cuando el SIRE confirme los registros válidos, márcalos aquí como reportados.
    </div>
  </div>

  <div class="tra-alert tra-alert--warn" *ngIf="reservationFilter">
    <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
    <div class="tra-alert-body">Mostrando solo la reserva <strong>{{ reservationCode }}</strong>.</div>
    <div class="tra-alert-actions"><a class="rsv-btn rsv-btn--outline rsv-btn--sm" routerLink="/dashboard/tra/sire">Ver todas</a></div>
  </div>

  <section class="rsv-panel rsv-board">
    <nav class="rsv-tabs" aria-label="Filtrar movimientos SIRE">
      <button type="button" *ngFor="let t of tabs" class="rsv-tab" [class.active]="tab === t.id" (click)="setTab(t.id)">
        {{ t.label }} <span class="rsv-tab-count">{{ counts[t.id] }}</span>
      </button>
    </nav>

    <div class="rsv-filters">
      <div class="rsv-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="Buscar por reserva, huésped o documento">
      </div>
    </div>

    <p class="tra-empty" *ngIf="!groups.length">
      {{ tab === 'POR_REPORTAR' ? 'No hay extranjeros por reportar.' : 'No hay movimientos para mostrar.' }}
    </p>

    <div class="ts-group" *ngFor="let grp of groups">
      <div class="ts-group-head">
        <div>
          <strong>Fecha de movimiento: {{ dmy(grp.date) }}</strong>
          <span class="tra-muted"> · {{ grp.lines.length }} registro{{ grp.lines.length === 1 ? '' : 's' }}</span>
        </div>
        <div class="ts-group-actions" *ngIf="selectable(grp).length">
          <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="downloadTxt(grp)"
                  [title]="'Archivo para SIRE › Alojamiento y Hospedaje › Cargar Archivo'">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar TXT ({{ txtLines(grp).length }})
          </button>
          <button type="button" class="rsv-btn rsv-btn--primary rsv-btn--sm" *ngIf="canEdit"
                  [disabled]="!selectedIn(grp).length" (click)="markGroup(grp)">
            Marcar {{ selectedIn(grp).length || '' }} como reportado{{ selectedIn(grp).length === 1 ? '' : 's' }}
          </button>
        </div>
      </div>
      <p class="ts-txt-note" *ngIf="txtNote?.date === grp.date">{{ txtNote!.text }}</p>
      <div class="rsv-table-wrap">
        <table class="rsv-table">
          <thead>
            <tr>
              <th class="ts-col-check" *ngIf="canEdit && selectable(grp).length">
                <input type="checkbox" [checked]="allSelected(grp)" (change)="selectAll(grp, $any($event.target).checked)" aria-label="Seleccionar todos">
              </th>
              <th>Movimiento</th>
              <th>Huésped</th>
              <th>Documento</th>
              <th>Nacionalidad</th>
              <th>Reserva</th>
              <th>Estado</th>
              <th class="rsv-col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of grp.lines">
              <td class="ts-col-check" *ngIf="canEdit && selectable(grp).length">
                <input type="checkbox" *ngIf="canMark(l)" [checked]="selected.has(l.key)" (change)="toggle(l)" [attr.aria-label]="'Seleccionar ' + name(l.g)">
              </td>
              <td><span class="ts-move" [class.ts-move--out]="l.m.type === 'SALIDA'">{{ l.m.type === 'ENTRADA' ? 'Entrada' : 'Salida' }}</span></td>
              <td>
                <strong>{{ name(l.g) }}</strong>
                <span class="tra-sub" *ngIf="l.m.issues.length && !l.m.report">{{ l.m.issues[0] }}{{ l.m.issues.length > 1 ? ' (+' + (l.m.issues.length - 1) + ')' : '' }}</span>
              </td>
              <td>{{ docLabel(l.g.docType) }}<br><span class="tra-mono">{{ doc(l.g.docNumber) }}</span></td>
              <td>{{ nationality(l) || '—' }}</td>
              <td><a class="rsv-code" [routerLink]="['/dashboard/tra', l.r.id]">{{ l.r.code }}</a></td>
              <td>
                <span class="rsv-badge" [ngClass]="badge(l.m.status)">{{ statusLabel(l.m.status) }}</span>
                <span class="tra-sub" *ngIf="l.m.report as rp">{{ stamp(rp.reportedAt) }} · {{ rp.reportedBy }}</span>
              </td>
              <td class="rsv-col-actions">
                <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="open(l)">Ficha SIRE</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Ficha SIRE del huésped -->
  <div class="rsv-modal-overlay" *ngIf="sheet as s" (click)="close()">
    <div class="rsv-modal ts-modal" role="dialog" aria-modal="true" aria-labelledby="ts-title" (click)="$event.stopPropagation()">
      <header class="ts-head">
        <div class="ts-head-main">
          <span class="ts-eyebrow">Ficha SIRE · Reserva {{ s.line.r.code }}</span>
          <h3 class="ts-title" id="ts-title">{{ name(s.line.g) }}</h3>
          <div class="ts-meta">
            <span class="ts-move" [class.ts-move--out]="s.line.m.type === 'SALIDA'">{{ s.line.m.type === 'ENTRADA' ? 'Entrada' : 'Salida' }}</span>
            <span>{{ dmy(s.line.m.date) }}</span>
            <span class="rsv-badge" [ngClass]="badge(s.line.m.status)">{{ statusLabel(s.line.m.status) }}</span>
          </div>
        </div>
        <button type="button" class="ts-close" (click)="close()" aria-label="Cerrar">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="ts-body">
        <section class="ts-col">
          <h4 class="ts-step"><span>1</span> Completa los datos</h4>
          <p class="ts-hint">Verifícalos con el pasaporte o documento del huésped.</p>
          <div class="ts-fields">
            <div class="rsv-field">
              <label for="ts-l1">Primer apellido</label>
              <input id="ts-l1" class="rsv-input" [(ngModel)]="s.data.firstLastName" [disabled]="!canEdit">
            </div>
            <div class="rsv-field">
              <label for="ts-l2">Segundo apellido <span class="ts-opt">opcional</span></label>
              <input id="ts-l2" class="rsv-input" [(ngModel)]="s.data.secondLastName" [disabled]="!canEdit" placeholder="Si el documento lo tiene">
            </div>
            <div class="rsv-field">
              <label for="ts-bd">Fecha de nacimiento</label>
              <input id="ts-bd" type="date" class="rsv-input" [max]="today" [(ngModel)]="s.data.birthDate" [disabled]="!canEdit">
            </div>
            <div class="rsv-field">
              <label for="ts-nat">Nacionalidad</label>
              <app-search-select inputId="ts-nat" [options]="foreignCountries" [pinned]="frequentCountries" placeholder="Escribe el país…"
                                 [(ngModel)]="s.data.nationality" [disabled]="!canEdit"></app-search-select>
              <button type="button" class="ts-suggest" *ngIf="canEdit && !s.data.nationality && natSuggestion(s.line) as c" (click)="s.data.nationality = c.id">
                ✦ ¿Nacionalidad {{ c.name }}? (reside allí) · Usar
              </button>
            </div>
            <div class="rsv-field">
              <label for="ts-org">País de procedencia</label>
              <app-search-select inputId="ts-org" [options]="countries" [pinned]="frequentCountries" placeholder="Escribe el país…"
                                 [(ngModel)]="s.data.originCountry" [disabled]="!canEdit"></app-search-select>
            </div>
            <div class="rsv-field">
              <label for="ts-dst">País próximo destino</label>
              <app-search-select inputId="ts-dst" [options]="countries" [pinned]="frequentCountries" placeholder="Escribe el país…"
                                 [(ngModel)]="s.data.nextDestination" [disabled]="!canEdit"></app-search-select>
            </div>
          </div>
          <p class="ts-hint">El documento y los nombres vienen del registro TRA; si están mal, corrígelos allí.</p>

          <ul class="ts-issues" *ngIf="sheetIssues.length">
            <li *ngFor="let i of sheetIssues">{{ i }}</li>
          </ul>
          <p class="ts-done" *ngIf="s.line.m.report as rp">
            Reportado al SIRE el {{ stamp(rp.reportedAt) }} por {{ rp.reportedBy }}.
          </p>
        </section>

        <section class="ts-col">
          <h4 class="ts-step"><span>2</span> Copia al formulario del SIRE</h4>
          <p class="ts-hint">En el mismo orden en que aparecen los campos.</p>
          <ol class="ts-copy">
            <li *ngFor="let f of sheetFields" [class.ts-copy--empty]="!f.value">
              <div class="ts-copy-text">
                <span class="ts-copy-label">{{ f.label }}</span>
                <span class="ts-copy-value">{{ f.value || 'Vacío' }}</span>
              </div>
              <button type="button" class="ts-copy-btn" [class.done]="copied === f.label" *ngIf="f.value"
                      (click)="copy(f.value, f.label)" [attr.aria-label]="'Copiar ' + f.label" [title]="'Copiar ' + f.label">
                <svg *ngIf="copied !== f.label" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg *ngIf="copied === f.label" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
              </button>
            </li>
          </ol>
        </section>
      </div>

      <footer class="ts-foot">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="close()">Cerrar</button>
        <div class="ts-foot-actions">
          <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="canEdit && dirty" (click)="saveSheet()">Guardar datos</button>
          <button type="button" class="rsv-btn rsv-btn--danger" *ngIf="canEdit && s.line.m.report" (click)="undo(s.line)">Desmarcar reportado</button>
          <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="canEdit && !s.line.m.report && s.line.m.status !== 'PROGRAMADO'"
                  [disabled]="sheetIssues.length" (click)="markOne()">
            Guardar y marcar como reportado
          </button>
        </div>
      </footer>
    </div>
  </div>
  `
})
export class TraSireComponent implements OnDestroy {

  readonly portal = SIRE_PORTAL;
  readonly dmy = dmy;
  readonly doc = fmtDoc;
  readonly stamp = (iso: string) => fmtStamp(iso);
  readonly docLabel = docTypeLabel;
  readonly name = fullName;
  readonly statusLabel = sireStatusLabel;
  readonly badge = sireStatusBadge;
  readonly countries = COUNTRY_OPTIONS;
  readonly frequentCountries = FREQUENT_COUNTRIES.filter(id => id !== 'CO');
  readonly foreignCountries = COUNTRY_OPTIONS.filter(c => c.value !== 'CO');
  readonly today = isoDate(0);
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'POR_REPORTAR', label: 'Por reportar' },
    { id: 'PROGRAMADOS',  label: 'Programados' },
    { id: 'REPORTADOS',   label: 'Reportados' },
    { id: 'TODOS',        label: 'Todos' },
  ];

  tab: Tab = 'POR_REPORTAR';
  search = '';
  reservationFilter = '';
  reservationCode = '';
  lines: Line[] = [];
  groups: Group[] = [];
  counts: Record<Tab, number> = { POR_REPORTAR: 0, PROGRAMADOS: 0, REPORTADOS: 0, TODOS: 0 };
  kpi = { today: 0, late: 0, incomplete: 0, reported: 0 };
  selected = new Set<string>();
  sheet?: { line: Line; data: SireGuestData; saved: string };
  copied = '';
  readonly canEdit: boolean;
  private sub: Subscription;

  constructor(private svc: TraService, users: UsersService, route: ActivatedRoute) {
    this.canEdit = users.can('TRA', 'edit');
    this.reservationFilter = route.snapshot.queryParamMap.get('reserva') ?? '';
    if (this.reservationFilter) this.tab = 'TODOS';
    this.sub = this.svc.getRows().subscribe(() => this.load());
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  private load(): void {
    this.lines = this.svc.sireMovements()
      .filter(x => !this.reservationFilter || x.row.reservation.id === this.reservationFilter)
      .flatMap(({ row, movements }) => movements.map(m => this.line(row, m)));
    this.reservationCode = this.lines[0]?.r.code ?? this.svc.row(this.reservationFilter)?.reservation.code ?? this.reservationFilter;
    const month = this.today.slice(0, 7);
    this.kpi = {
      today:      this.lines.filter(l => isDue(l.m) && l.m.date === this.today).length,
      late:       this.lines.filter(l => l.m.status === 'VENCIDO').length,
      incomplete: this.lines.filter(l => isDue(l.m) && l.m.issues.length).length,
      reported:   this.lines.filter(l => l.m.report?.reportedAt.startsWith(month)).length,
    };
    // La ficha abierta sigue al registro actualizado (p. ej. después de guardar)
    if (this.sheet) {
      const fresh = this.lines.find(l => l.key === this.sheet!.line.key);
      if (fresh) this.sheet.line = fresh; else this.sheet = undefined;
    }
    this.apply();
  }

  private line(row: TraRow, m: SireMovement): Line {
    const rec = row.record!;
    const g = rec.guests.find(x => x.id === m.guestId)!;
    return {
      m, r: row.reservation, rec, g, key: `${row.reservation.id}|${m.guestId}|${m.type}`,
      index: norm([row.reservation.code, fullName(g), g.docNumber].join(' ')),
    };
  }

  private inTab(l: Line, t: Tab): boolean {
    switch (t) {
      case 'POR_REPORTAR': return isDue(l.m);
      case 'PROGRAMADOS':  return l.m.status === 'PROGRAMADO';
      case 'REPORTADOS':   return l.m.status === 'REPORTADO';
      default:             return true;
    }
  }

  apply(): void {
    const q = norm(this.search.trim());
    const matches = this.lines.filter(l => !q || l.index.includes(q));
    this.tabs.forEach(t => this.counts[t.id] = matches.filter(l => this.inTab(l, t.id)).length);
    const shown = matches.filter(l => this.inTab(l, this.tab));
    // Lo más urgente primero (vencidos, luego hoy); programados en orden de llegada; reportados lo último arriba
    const asc = this.tab === 'POR_REPORTAR' || this.tab === 'PROGRAMADOS';
    const dates = [...new Set(shown.map(l => l.m.date))].sort((a, b) => asc ? a.localeCompare(b) : b.localeCompare(a));
    const order = (l: Line) => `${l.r.code}|${l.m.type === 'ENTRADA' ? 0 : 1}|${fullName(l.g)}`;
    this.groups = dates.map(date => ({ date, lines: shown.filter(l => l.m.date === date).sort((a, b) => order(a).localeCompare(order(b))) }));
    const visible = new Set(shown.map(l => l.key));
    this.selected.forEach(k => { if (!visible.has(k)) this.selected.delete(k); });
  }

  setTab(t: Tab): void { this.tab = t; this.apply(); }

  /** Propuesta de nacionalidad: el país donde reside, si no es Colombia. Se confirma con un clic contra el pasaporte. */
  natSuggestion(l: Line): { id: string; name: string } | undefined {
    const id = travelOf(l.rec, l.g).residenceCountry;
    const c = id && id !== 'CO' ? COUNTRIES.find(x => x.id === id) : undefined;
    return c && { id: c.id, name: c.name };
  }

  nationality(l: Line): string {
    const id = sireDataOf(l.rec, l.g).nationality;
    return COUNTRIES.find(c => c.id === id)?.name ?? '';
  }

  // ── Selección para marcar varios a la vez ────────────
  canMark(l: Line): boolean { return isDue(l.m) && !l.m.issues.length; }
  selectable(grp: Group): Line[] { return grp.lines.filter(l => this.canMark(l)); }
  selectedIn(grp: Group): Line[] { return this.selectable(grp).filter(l => this.selected.has(l.key)); }
  allSelected(grp: Group): boolean { const s = this.selectable(grp); return !!s.length && s.every(l => this.selected.has(l.key)); }
  toggle(l: Line): void { this.selected.has(l.key) ? this.selected.delete(l.key) : this.selected.add(l.key); }
  selectAll(grp: Group, on: boolean): void { this.selectable(grp).forEach(l => on ? this.selected.add(l.key) : this.selected.delete(l.key)); }

  // ── Archivo plano (TXT) ──────────────────────────────
  txtNote?: { date: string; text: string };

  /** Lo seleccionado del grupo; sin selección, todo lo que se puede reportar. */
  txtLines(grp: Group): Line[] {
    const sel = this.selectedIn(grp);
    return sel.length ? sel : this.selectable(grp);
  }

  /**
   * Descarga el TXT del SIRE con los movimientos de una misma fecha (el SIRE solo acepta juntos
   * los de la misma fecha). Quien no tenga todos sus códigos queda por fuera y se avisa.
   */
  downloadTxt(grp: Group): void {
    const s = this.svc.getSettings();
    const codes = sireCodes(s.sireHotelCode ?? '', s.sireCityCode ?? '');
    const lines = this.txtLines(grp).map(l => ({ l, sl: { rec: l.rec, guest: l.g, type: l.m.type, date: l.m.date } }));
    const ok = lines.filter(x => !missingCodes(x.sl, codes).length);
    const skipped = lines.filter(x => missingCodes(x.sl, codes).length)
      .map(x => `${fullName(x.l.g)} (${x.l.m.type === 'ENTRADA' ? 'entrada' : 'salida'}): falta ${missingCodes(x.sl, codes).join(', ').toLowerCase()}`);
    if (!ok.length) {
      this.txtNote = { date: grp.date, text: `No se generó el archivo. ${skipped.join(' · ')}. Revisa Configuración TRA › SIRE o repórtalos por formulario.` };
      return;
    }
    const bytes = ansi(sireTxt(ok.map(x => x.sl), codes));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'text/plain' }));
    a.download = `SIRE_${codes.hotel || 'hotel'}_${grp.date}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.txtNote = { date: grp.date, text: `Archivo con ${ok.length} registro${ok.length === 1 ? '' : 's'}: súbelo en SIRE › Cargar Información › Alojamiento y Hospedaje › Cargar Archivo y, cuando el SIRE los muestre como válidos, márcalos aquí como reportados.`
      + (skipped.length ? ` Quedaron por fuera (repórtalos por formulario): ${skipped.join(' · ')}.` : '') };
  }

  markGroup(grp: Group): void {
    const lines = this.selectedIn(grp);
    if (!lines.length || !confirm(`¿Confirmas que ${lines.length === 1 ? 'este registro ya quedó guardado' : `estos ${lines.length} registros ya quedaron guardados`} en el SIRE con fecha ${dmy(grp.date)}?`)) return;
    const byReservation = new Map<string, Line[]>();
    lines.forEach(l => byReservation.set(l.r.id, [...(byReservation.get(l.r.id) ?? []), l]));
    byReservation.forEach((ls, id) => this.svc.markSireReported(id, ls.map(l => ({ guestId: l.g.id, type: l.m.type, date: l.m.date }))));
    lines.forEach(l => this.selected.delete(l.key));
  }

  // ── Ficha ────────────────────────────────────────────
  open(l: Line): void {
    const data = sireDataOf(l.rec, l.g);
    this.sheet = { line: l, data, saved: JSON.stringify(data) };
    this.copied = '';
  }

  close(): void {
    if (this.dirty && !confirm('Hay cambios sin guardar en la ficha. ¿Cerrar de todas formas?')) return;
    this.sheet = undefined;
  }

  get dirty(): boolean { return !!this.sheet && JSON.stringify(this.sheet.data) !== this.sheet.saved; }
  get sheetIssues(): string[] { return this.sheet ? sireIssues(this.sheet.line.rec, this.sheet.line.g, this.sheet.data) : []; }

  get sheetFields(): { label: string; value: string }[] {
    if (!this.sheet) return [];
    const { line, data } = this.sheet;
    const rec: TraRecord = { ...line.rec, sire: { guests: { ...line.rec.sire?.guests, [line.g.id]: data }, reports: line.rec.sire?.reports ?? [] } };
    return sireFormFields(rec, line.g, line.m, docTypeLabel(line.g.docType));
  }

  saveSheet(): void {
    const s = this.sheet;
    if (!s || !this.dirty) return;
    this.svc.saveSireData(s.line.r.id, s.line.g.id, s.data);
    s.saved = JSON.stringify(s.data);
  }

  markOne(): void {
    const s = this.sheet;
    if (!s || this.sheetIssues.length) return;
    this.saveSheet();
    this.svc.markSireReported(s.line.r.id, [{ guestId: s.line.g.id, type: s.line.m.type, date: s.line.m.date }]);
    this.sheet = undefined;
  }

  undo(l: Line): void {
    if (!confirm(`¿Desmarcar la ${l.m.type === 'ENTRADA' ? 'entrada' : 'salida'} de ${fullName(l.g)}? Úsalo solo si no quedó guardada en el SIRE.`)) return;
    this.svc.undoSireReport(l.r.id, l.g.id, l.m.type);
  }

  copy(value: string, label: string): void {
    navigator.clipboard?.writeText(value).then(() => {
      this.copied = label;
      setTimeout(() => { if (this.copied === label) this.copied = ''; }, 1500);
    }).catch(() => undefined);
  }
}
