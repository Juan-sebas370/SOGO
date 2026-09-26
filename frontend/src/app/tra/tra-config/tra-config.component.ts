import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { fmtDateTime } from '../../reservations/reservation-format';
import { TraService } from '../tra.service';
import { TraSettings, TraSend, LodgingUnit, UnitType } from '../tra.model';
import {
  DOCUMENT_TYPES, TRAVEL_REASONS, COUNTRIES, CITIES, ACCOMMODATION_TYPES, ACCOMMODATION_CATALOG_PROVISIONAL, UNIT_TYPES
} from '../tra-catalogs';
import { fmtStamp } from '../tra-rules';
import { ROOMS, roomByNumber, roomDescription, summaryOf } from '../../lodging/house';

type Test = { state: 'idle' | 'testing' | 'ok' | 'error'; message: string };

const ALL_ROOMS = ROOMS.map(r => r.number);

@Component({
  selector: 'app-tra-config',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tra-config.component.css'],
  template: `
  <header class="rsv-header">
    <div>
      <span class="rsv-eyebrow"><a routerLink="/dashboard/tra">TRA</a><span aria-hidden="true">/</span>Configuración</span>
      <h1 class="rsv-title">Configuración TRA</h1>
      <p class="rsv-subtitle">Integración con el MinCIT, datos del establecimiento y unidades de alojamiento. Se configura una vez.</p>
    </div>
    <div class="rsv-header-actions">
      <span class="tc-saved" *ngIf="saved && !dirty">Cambios guardados ✓</span>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty" (click)="save()">Guardar cambios</button>
    </div>
  </header>

  <div class="tra-layout">
    <div class="tra-main">
      <!-- Integración -->
      <section class="tra-card">
        <div class="tra-card-head">
          <h2 class="tra-card-title tc-title">
            Integración PMS → MinCIT
            <span class="rsv-badge" [ngClass]="current.integrationActive ? 'rsv-badge--ok' : 'rsv-badge--danger'">● {{ current.integrationActive ? 'Conectado' : 'Sin conexión' }}</span>
          </h2>
          <div class="tra-card-badges">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="tokenInfo = true">Solicitar nuevo token</button>
            <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="test.state === 'testing'" (click)="testConnection()">
              <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ test.state === 'testing' ? 'Probando…' : 'Probar conexión' }}
            </button>
          </div>
        </div>
        <div class="tra-alert tc-test" *ngIf="test.state === 'ok' || test.state === 'error'" [ngClass]="test.state === 'ok' ? 'tra-alert--ok' : 'tra-alert--danger'">
          <div class="tra-alert-body">{{ test.message }}</div>
        </div>
        <div class="tc-tiles">
          <div class="tc-tile">
            <label for="rnt">RNT</label>
            <input id="rnt" class="tc-tile-input tra-mono" [(ngModel)]="form.rnt" placeholder="N.º de RNT">
          </div>
          <div class="tc-tile"><span>Token PMS</span><strong class="tra-mono">•••••••••••• {{ current.tokenLast4 || '----' }}</strong></div>
          <div class="tc-tile">
            <label for="rnt-mail">Correo registrado en el RNT</label>
            <input id="rnt-mail" type="email" class="tc-tile-input" [(ngModel)]="form.rntEmail" placeholder="correo del RNT">
          </div>
          <div class="tc-tile"><span>Última sincronización</span><strong>{{ dateTime(current.lastSync) }}</strong></div>
          <div class="tc-tile"><span>Último envío</span>
            <strong [class.tc-ok]="lastSend?.status === 'EXITOSO'" [class.tc-err]="lastSend?.status === 'ERROR'">
              {{ lastSend ? (lastSend.status === 'EXITOSO' ? 'Exitoso' : 'Con error') + ' · ' + stamp(lastSend.attemptAt) : 'Sin envíos' }}
            </strong>
          </div>
          <div class="tc-tile"><span>Estado</span><strong>{{ current.integrationActive ? 'Activo' : 'Inactivo' }}</strong></div>
        </div>
        <p class="tra-note">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>El token se solicita con el RNT y MinCIT lo envía al correo registrado. Se guarda como secreto en el servidor (TRA_TOKEN): nunca se muestra completo ni llega al navegador.</span>
        </p>
      </section>

      <!-- Establecimiento (nivel A) -->
      <section class="tra-card">
        <div class="tra-card-head">
          <div>
            <h2 class="tra-card-title">Datos del establecimiento</h2>
            <p class="tra-card-sub">Según el RNT · no se digitan en cada TRA</p>
          </div>
          <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="editing = !editing">{{ editing ? 'Listo' : 'Editar' }}</button>
        </div>
        <fieldset class="tc-fieldset tra-grid" [disabled]="!editing">
          <div class="rsv-field"><label for="e-prov">Prestador</label><input id="e-prov" class="rsv-input" [(ngModel)]="form.provider"></div>
          <div class="rsv-field"><label for="e-type">Tipo de prestador</label><input id="e-type" class="rsv-input" [(ngModel)]="form.providerType"></div>
          <div class="rsv-field"><label for="e-ciiu">CIIU</label><input id="e-ciiu" class="rsv-input" [(ngModel)]="form.ciiu" placeholder="Según RNT"></div>
          <div class="rsv-field"><label for="e-dep">Departamento</label><input id="e-dep" class="rsv-input" [(ngModel)]="form.department"></div>
          <div class="rsv-field"><label for="e-mun">Municipio</label><input id="e-mun" class="rsv-input" [(ngModel)]="form.municipality"></div>
          <div class="rsv-field"><label for="e-addr">Dirección</label><input id="e-addr" class="rsv-input" [(ngModel)]="form.address" placeholder="Dirección del alojamiento"></div>
          <div class="rsv-field"><label for="e-tel">Teléfono</label><input id="e-tel" class="rsv-input" [(ngModel)]="form.phone" placeholder="Teléfono"></div>
          <div class="rsv-field"><label for="e-mail">Correo</label><input id="e-mail" type="email" class="rsv-input" [(ngModel)]="form.email" placeholder="Correo"></div>
          <div class="rsv-field"><label for="e-web">Página web</label><input id="e-web" class="rsv-input" [(ngModel)]="form.website" placeholder="Sitio web"></div>
          <div class="rsv-field"><label>Número de unidades</label><input class="rsv-input" [value]="activeUnits" readonly><small>Unidades activas</small></div>
          <div class="rsv-field"><label for="e-cap">Capacidad (plazas)</label><input id="e-cap" type="number" min="1" class="rsv-input" [(ngModel)]="form.capacity"></div>
        </fieldset>
      </section>

      <!-- Unidades -->
      <section class="tra-card tra-card--flush">
        <div class="tra-card-head">
          <div>
            <h2 class="tra-card-title">Unidades de alojamiento</h2>
            <p class="tra-card-sub">La TRA se asocia a la unidad, no solo a la habitación</p>
          </div>
          <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="openUnit()">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva unidad
          </button>
        </div>
        <div class="tra-table-wrap">
          <table class="tra-table">
            <thead><tr><th>Unidad</th><th>Tipo</th><th>Piso</th><th>Capacidad</th><th>Camas</th><th>Habitaciones que incluye</th><th>Estado</th><th class="tc-right">Acciones</th></tr></thead>
            <tbody>
              <tr *ngFor="let u of units">
                <td><strong>{{ u.name }}</strong></td>
                <td><span class="tra-tag tra-mono" [ngClass]="'tc-type--' + u.type">{{ u.type }}</span></td>
                <td>{{ u.floors.join(' y ') }}</td>
                <td>{{ u.capacity }} persona{{ u.capacity === 1 ? '' : 's' }}</td>
                <td class="tc-nowrap">{{ beds(u.rooms) }}</td>
                <td class="tra-muted">
                  <ng-container *ngIf="u.type === 'HABITACION'; else roomList">{{ roomDetail(u.rooms[0]) }}</ng-container>
                  <ng-template #roomList>{{ u.type === 'CASA_COMPLETA' ? 'Todas (' + u.rooms.length + ')' : u.rooms.join(', ') }}</ng-template>
                </td>
                <td><span class="rsv-badge" [ngClass]="u.active ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ u.active ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="tc-right"><button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="openUnit(u)">Editar</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="tra-aside">
      <section class="tra-card">
        <h2 class="tra-card-title">Envío y reintentos</h2>
        <ul class="tc-switches">
          <li>
            <span class="tc-switch on locked" aria-hidden="true"></span>
            <div><strong>Enviar al confirmar check-in</strong><span>Nunca al crear la reserva (RN-05) · fijo</span></div>
          </li>
          <li>
            <button type="button" class="tc-switch" [class.on]="form.autoRetry" role="switch" [attr.aria-checked]="form.autoRetry" aria-label="Reintentos automáticos" (click)="form.autoRetry = !form.autoRetry"></button>
            <div>
              <strong>Reintentos automáticos</strong>
              <span class="tc-inline" *ngIf="form.autoRetry">
                Hasta <select [(ngModel)]="form.maxAttempts" aria-label="Intentos máximos"><option *ngFor="let n of [2, 3, 5]" [ngValue]="n">{{ n }}</option></select> intentos ·
                cada <select [(ngModel)]="form.retryMinutes" aria-label="Minutos entre intentos"><option *ngFor="let n of [5, 15, 30, 60]" [ngValue]="n">{{ n }}</option></select> min
              </span>
              <span *ngIf="!form.autoRetry">Solo reenvío manual</span>
            </div>
          </li>
          <li>
            <button type="button" class="tc-switch" [class.on]="form.notifyErrors" role="switch" [attr.aria-checked]="form.notifyErrors" aria-label="Avisar errores" (click)="form.notifyErrors = !form.notifyErrors"></button>
            <div><strong>Avisar errores al administrador</strong><span>Notificación y correo</span></div>
          </li>
        </ul>
      </section>

      <section class="tra-card">
        <div class="tra-card-head">
          <h2 class="tra-card-title">Catálogos</h2>
          <button type="button" class="rsv-btn rsv-btn--outline rsv-btn--sm" (click)="svc.syncCatalogs()">Sincronizar</button>
        </div>
        <ul class="tc-catalogs">
          <li *ngFor="let c of catalogs">
            <span>{{ c.label }}</span><span class="tra-muted">{{ c.count }}</span>
            <span class="rsv-badge" [ngClass]="c.provisional ? 'rsv-badge--warn' : 'rsv-badge--ok'">{{ c.provisional ? 'Provisional' : 'Cargado' }}</span>
          </li>
        </ul>
        <p class="tc-small">Última sincronización: {{ dateTime(svc.catalogsSynced) }}. Validar todos los códigos contra el manual técnico PMS vigente antes de producción.</p>
      </section>

      <section class="tra-card">
        <h2 class="tra-card-title">Seguridad y datos personales</h2>
        <ul class="tc-security">
          <li *ngFor="let s of security">
            <svg class="tra-icon tra-icon--ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>{{ s }}
          </li>
        </ul>
        <p class="tc-small">Res. 409 de 2022: seguridad, confidencialidad y circulación restringida de los datos.</p>
      </section>
    </aside>
  </div>

  <!-- Unidad -->
  <div class="rsv-modal-overlay" *ngIf="unitForm as u" (click)="unitForm = undefined">
    <div class="rsv-modal tc-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">{{ isNewUnit ? 'Nueva unidad' : 'Editar unidad' }}</h3>
      <div class="tra-grid tra-grid--2">
        <div class="rsv-field"><label for="u-name">Nombre</label><input id="u-name" class="rsv-input" [(ngModel)]="u.name"></div>
        <div class="rsv-field">
          <label for="u-type">Tipo</label>
          <select id="u-type" class="rsv-input" [(ngModel)]="u.type"><option *ngFor="let t of unitTypes" [value]="t">{{ t }}</option></select>
        </div>
        <div class="rsv-field">
          <label for="u-cap">Capacidad (personas)</label>
          <input id="u-cap" type="number" min="1" class="rsv-input" [(ngModel)]="u.capacity">
          <small *ngIf="u.rooms.length">Según camas: {{ suggested(u) }} personas · {{ beds(u.rooms) }}</small>
        </div>
        <div class="rsv-field">
          <label>Estado</label>
          <label class="tra-check tc-check-inline"><input type="checkbox" [(ngModel)]="u.active"> Activa</label>
        </div>
      </div>
      <div class="rsv-field">
        <label>Habitaciones que incluye</label>
        <div class="tc-rooms">
          <label class="tra-check" *ngFor="let n of rooms" [title]="roomDetail(n)"><input type="checkbox" [checked]="u.rooms.includes(n)" (change)="toggleRoom(u, n)"> {{ n }}</label>
        </div>
      </div>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="unitForm = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!u.name.trim() || !u.rooms.length || u.capacity < 1" (click)="saveUnit()">Guardar unidad</button>
      </div>
    </div>
  </div>

  <!-- Solicitar token -->
  <div class="rsv-modal-overlay" *ngIf="tokenInfo" (click)="tokenInfo = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">Solicitar nuevo token PMS</h3>
      <ol class="tc-steps">
        <li>Solicítalo en la plataforma de MinCIT con el RNT activo <strong>{{ current.rnt || '(sin RNT)' }}</strong>.</li>
        <li>MinCIT envía el token al correo registrado en el RNT: <strong>{{ current.rntEmail || '(sin correo)' }}</strong>.</li>
        <li>El administrador del servidor lo guarda como secreto <code class="tra-mono">TRA_TOKEN</code>. Nunca se pega en el navegador ni en la base de datos.</li>
        <li>Vuelve aquí y usa <strong>Probar conexión</strong>.</li>
      </ol>
      <div class="rsv-modal-footer"><button type="button" class="rsv-btn rsv-btn--primary" (click)="tokenInfo = false">Entendido</button></div>
    </div>
  </div>
  `
})
export class TraConfigComponent {

  readonly dateTime = fmtDateTime;
  readonly stamp = (s?: string) => fmtStamp(s);
  readonly unitTypes: UnitType[] = UNIT_TYPES;
  readonly rooms = ALL_ROOMS;
  readonly catalogs = [
    { label: 'Tipos de documento',     count: DOCUMENT_TYPES.length, provisional: false },
    { label: 'Motivos de viaje',       count: TRAVEL_REASONS.length, provisional: false },
    { label: 'Países (código ISO)',    count: COUNTRIES.length,      provisional: false },
    { label: 'Ciudades (código DANE)', count: CITIES.length,         provisional: false },
    { label: 'Tipos de acomodación',   count: ACCOMMODATION_TYPES.length, provisional: ACCOMMODATION_CATALOG_PROVISIONAL },
  ];
  readonly security = [
    'Tráfico cifrado (HTTPS)', 'Token solo en el servidor', 'Acceso por roles: Administrador, Recepción',
    'Logs de auditoría de accesos y envíos', 'Soportes en almacenamiento privado',
  ];

  current!: TraSettings;
  form!: TraSettings;
  units: LodgingUnit[] = [];
  lastSend?: TraSend;
  editing = false;
  saved = false;
  tokenInfo = false;
  test: Test = { state: 'idle', message: '' };
  unitForm?: LodgingUnit;
  isNewUnit = false;

  constructor(public svc: TraService) {
    this.form = { ...svc.getSettings() };
    this.svc.getRows().subscribe(rows => {
      this.current = svc.getSettings();
      this.units = svc.getUnits();
      this.lastSend = rows.flatMap(r => r.record?.sends ?? []).filter(s => s.attemptAt && s.status !== 'ENVIANDO')
        .sort((a, b) => b.attemptAt!.localeCompare(a.attemptAt!))[0];
    });
  }

  get dirty(): boolean { return JSON.stringify(this.form) !== JSON.stringify(this.current); }
  get activeUnits(): number { return this.units.filter(u => u.active).length; }

  save(): void {
    this.svc.updateSettings(this.form);
    this.form = { ...this.svc.getSettings() };
    this.editing = false;
    this.saved = true;
  }

  async testConnection(): Promise<void> {
    this.test = { state: 'testing', message: '' };
    const res = await this.svc.testConnection();
    // lastSync e integrationActive vienen del servidor: no son cambios pendientes del formulario
    this.form = { ...this.form, lastSync: this.current.lastSync, integrationActive: this.current.integrationActive };
    this.test = res.httpStatus === 200
      ? { state: 'ok', message: `Conexión exitosa con MinCIT · HTTP 200 · ${res.durationMs} ms` }
      : { state: 'error', message: `MinCIT respondió HTTP ${res.httpStatus}. Revisa el token en el servidor.` };
  }

  openUnit(u?: LodgingUnit): void {
    this.isNewUnit = !u;
    this.unitForm = u
      ? structuredClone(u)
      : { id: `unidad-${Date.now()}`, name: '', type: 'HABITACION', floors: [], capacity: 2, rooms: [], active: true };
  }

  /** "3 dobles · 1 camarote" */
  beds(rooms: string[]): string {
    const b = summaryOf(rooms);
    return `${b.doubleBeds} doble${b.doubleBeds === 1 ? '' : 's'} · ${b.bunkBeds} camarote${b.bunkBeds === 1 ? '' : 's'}`;
  }

  roomDetail(n: string): string {
    const r = roomByNumber(n);
    return r ? roomDescription(r) : n;
  }

  suggested(u: LodgingUnit): number { return summaryOf(u.rooms).capacity; }

  /** Al cambiar las habitaciones, la capacidad se ajusta a sus camas. */
  toggleRoom(u: LodgingUnit, n: string): void {
    u.rooms = u.rooms.includes(n) ? u.rooms.filter(r => r !== n) : ALL_ROOMS.filter(r => r === n || u.rooms.includes(r));
    u.capacity = this.suggested(u) || u.capacity;
  }

  saveUnit(): void {
    const u = this.unitForm!;
    // El piso sale de las habitaciones que incluye
    u.floors = [...new Set(u.rooms.map(n => roomByNumber(n)?.floor).filter((f): f is number => !!f))].sort();
    this.svc.saveUnit({ ...u, name: u.name.trim() });
    this.unitForm = undefined;
  }
}
