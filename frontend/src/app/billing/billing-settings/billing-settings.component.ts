import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BillingConfigService, BillingConfig, TaxRule, TaxConcept, ACTION_PERMISSION, BillingAction,
} from '../billing-config.service';
import { InvoiceService } from '../invoice.service';
import { EXTRA_CATEGORIES } from '../invoice.model';
import { UsersService } from '../../users/users.service';
import { fmtDate } from '../../reservations/reservation-format';
import { serverMessage } from '../../shared/toast/notify.interceptor';

const PERM_LABEL: Record<string, string> = { view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar' };

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./billing-settings.component.css'],
  template: `
  <nav class="bil-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/billing">Facturación</a><span>/</span><span>Impuestos y DIAN</span>
  </nav>
  <header class="bil-head">
    <div>
      <h1 class="bil-title">Impuestos y DIAN</h1>
      <p class="bil-subtitle">Resolución DIAN, proveedor tecnológico, tarifas de impuestos y mensaje al huésped. Se guarda en la base de datos.</p>
    </div>
    <div class="bil-head-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="dirty" (click)="discard()">Descartar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!rangeError || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
    </div>
  </header>

  <div class="bil-alert bil-alert--warn" *ngIf="blockers.length" role="status">
    <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <p><strong>Falta para poder emitir:</strong> {{ blockers.join(' ') }}</p>
  </div>

  <div class="set-layout">
    <div class="set-main">
      <!-- Emisor (Datos del hospedaje) -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div><div><h2 class="bil-card-title">Emisor de las facturas</h2><span class="bil-card-sub">Sale de Configuración › Datos del hospedaje (un solo lugar para todo SOGO)</span></div></div>
          <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/settings">Editar datos del hospedaje</a>
        </div>
        <div class="set-issuer">
          <span class="set-logo"><img [src]="issuer.logo" alt="Logo del hospedaje"></span>
          <div>
            <strong>{{ issuer.name || 'Sin nombre' }}</strong>
            <small *ngIf="issuer.legalName">{{ issuer.legalName }}</small>
            <small><span [class.set-missing]="!issuer.nit">NIT {{ issuer.nit || 'pendiente' }}</span> · <span [class.set-missing]="!issuer.rnt">RNT {{ issuer.rnt || 'pendiente' }}</span> · {{ issuer.establishment }}</small>
            <small>{{ issuer.address || 'Sin dirección' }}{{ issuer.city ? ' · ' + issuer.city : '' }}</small>
            <small>{{ issuer.phone }}{{ issuer.email ? ' · ' + issuer.email : '' }}</small>
          </div>
        </div>
      </section>

      <!-- Resolución -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div><div><h2 class="bil-card-title">Resolución de numeración DIAN</h2><span class="bil-card-sub">La entrega la DIAN (formulario 1876 en MUISCA). Define el número de cada factura</span></div></div>
          <span class="rsv-badge" [ngClass]="resolutionState.badge">{{ resolutionState.label }}</span>
        </div>
        <div class="set-grid set-grid--4">
          <div class="rsv-field"><label for="r-num">N.º de resolución *</label><input id="r-num" type="text" class="rsv-input" [(ngModel)]="c.resolution.number" maxlength="30"></div>
          <div class="rsv-field"><label for="r-prefix">Prefijo de facturas</label><input id="r-prefix" type="text" class="rsv-input" [(ngModel)]="c.resolution.prefix" maxlength="4" [disabled]="hasIssued" [title]="hasIssued ? 'No cambia mientras haya facturas emitidas con él' : ''"></div>
          <div class="rsv-field">
            <label>Rango autorizado *</label>
            <div class="set-range">
              <input type="number" class="rsv-input" [(ngModel)]="c.resolution.from" aria-label="Desde" min="1"><span>–</span>
              <input type="number" class="rsv-input" [(ngModel)]="c.resolution.to" aria-label="Hasta" min="1">
            </div>
          </div>
          <div class="rsv-field"><label>Próximo número</label><input type="text" class="rsv-input" [value]="nextNumber" readonly></div>
          <div class="rsv-field"><label for="r-from">Vigente desde *</label><input id="r-from" type="date" class="rsv-input" [(ngModel)]="c.resolution.validFrom"></div>
          <div class="rsv-field"><label for="r-to">Vigente hasta *</label><input id="r-to" type="date" class="rsv-input" [(ngModel)]="c.resolution.validTo"></div>
          <div class="rsv-field"><label for="r-key">Clave técnica</label><input id="r-key" type="text" class="rsv-input" [(ngModel)]="c.resolution.technicalKey" maxlength="80"></div>
          <div class="rsv-field"><label for="r-nc">Prefijo notas crédito</label><input id="r-nc" type="text" class="rsv-input" [(ngModel)]="c.resolution.creditPrefix" maxlength="4"></div>
        </div>
        <p class="set-msg set-msg--bad" *ngIf="rangeError">{{ rangeError }}</p>
        <div class="set-usage">
          <span>Consumo del rango{{ c.resolution.validFrom && c.resolution.validTo ? ' · vigencia ' + date(c.resolution.validFrom) + ' – ' + date(c.resolution.validTo) : '' }}</span>
          <strong>{{ usage.used }} usados · quedan {{ usage.left.toLocaleString('es-CO') }}</strong>
        </div>
        <span class="set-track"><span [style.width.%]="usagePct"></span></span>
      </section>

      <!-- Proveedor -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div>
            <span class="bil-card-icon set-icon-purple"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg></span>
            <div>
              <h2 class="bil-card-title">Proveedor tecnológico
                <span class="rsv-badge" [ngClass]="saved.provider.connected ? 'rsv-badge--ok' : 'rsv-badge--muted'">● {{ saved.provider.connected ? 'Responde' : 'Sin probar o sin respuesta' }}</span>
              </h2>
              <span class="bil-card-sub">Quien valida las facturas ante la DIAN y devuelve el CUFE</span>
            </div>
          </div>
          <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="testing || dirty" (click)="test()" [title]="dirty ? 'Guarda los cambios antes de probar' : ''">
            <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ testing ? 'Probando…' : 'Probar conexión' }}
          </button>
        </div>
        <div class="set-grid set-grid--3">
          <div class="rsv-field"><label for="p-name">Proveedor</label><input id="p-name" type="text" class="rsv-input" [(ngModel)]="c.provider.name" maxlength="80" placeholder="Nombre del proveedor autorizado"></div>
          <div class="rsv-field"><label for="p-url">URL de la API</label><input id="p-url" type="url" class="rsv-input" [(ngModel)]="c.provider.apiUrl" maxlength="200" placeholder="https://"></div>
          <div class="rsv-field">
            <label>Ambiente</label>
            <div class="set-segmented" role="radiogroup">
              <button type="button" *ngFor="let e of environments" role="radio" [attr.aria-checked]="c.provider.environment === e"
                      [class.active]="c.provider.environment === e" (click)="c.provider.environment = e">{{ e }}</button>
            </div>
          </div>
          <div class="rsv-field"><label for="p-client">Usuario / ID de cliente</label><input id="p-client" type="text" class="rsv-input" [(ngModel)]="c.provider.clientId" maxlength="120"></div>
          <div class="rsv-field">
            <label for="p-key">Clave de API</label>
            <div class="set-secret">
              <input id="p-key" [type]="showKey ? 'text' : 'password'" class="rsv-input" [(ngModel)]="c.provider.apiKey" autocomplete="new-password"
                     [placeholder]="saved.provider.apiKeySet ? 'Guardada · escribe otra para cambiarla' : 'Sin clave'">
              <button type="button" (click)="showKey = !showKey" [attr.aria-label]="showKey ? 'Ocultar clave' : 'Mostrar clave'">{{ showKey ? 'Ocultar' : 'Ver' }}</button>
            </div>
          </div>
          <div class="rsv-field"><label>Última prueba</label><input type="text" class="rsv-input" [value]="lastResponse" readonly></div>
        </div>
        <p class="bil-note set-note-blue">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          La clave se guarda en el servidor y nunca vuelve al navegador. SOGO numera y guarda cada factura; su validación DIAN se hace en el proveedor y
          la respuesta (CUFE o rechazo) se registra en el detalle de la factura.
        </p>
        <p class="set-msg" *ngIf="testMessage" [class.set-msg--bad]="!saved.provider.connected">{{ testMessage }}</p>
      </section>

      <!-- Impuestos -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div><div><h2 class="bil-card-title">Tarifas de impuestos</h2><span class="bil-card-sub">Las usa el cálculo de cada factura y la causación en Contabilidad. Confírmalas con el contador</span></div></div>
          <button type="button" class="rsv-btn rsv-btn--outline set-blue" (click)="editTax()">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo concepto
          </button>
        </div>
        <div class="bil-table-wrap">
          <table class="bil-table">
            <thead><tr><th>Concepto facturable</th><th>Impuesto</th><th>Tarifa</th><th>Condición</th><th>Estado</th><th class="num">Acciones</th></tr></thead>
            <tbody>
              <tr *ngFor="let t of c.taxes">
                <td class="strong">{{ t.concept }}</td>
                <td><span class="rsv-badge" [ngClass]="t.rate === 0 ? 'rsv-badge--muted' : t.kind === 'INC' ? 'rsv-badge--ok' : 'rsv-badge--info'">{{ t.rate === 0 ? t.kind + ' exento' : t.kind }}</span></td>
                <td>{{ pct(t.rate) }}%</td>
                <td class="set-muted">{{ t.condition }}</td>
                <td><span class="rsv-badge" [ngClass]="t.status === 'Activo' ? 'rsv-badge--ok' : t.status === 'Inactivo' ? 'rsv-badge--muted' : 'rsv-badge--warn'">{{ t.status }}</span></td>
                <td class="num"><button type="button" class="rsv-btn rsv-btn--outline set-edit" (click)="editTax(t)">Editar</button></td>
              </tr>
              <tr *ngIf="!c.taxes.length"><td colspan="6" class="bil-empty">Sin tarifas: agrega al menos la de Alojamiento.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="bil-side">
      <section class="bil-card">
        <h3 class="bil-card-title set-side-title">Mensaje al huésped</h3>
        <div class="rsv-field">
          <label for="t-subject">Asunto</label>
          <input id="t-subject" type="text" class="rsv-input" [(ngModel)]="c.emailSubject" maxlength="150">
        </div>
        <div class="rsv-field">
          <label for="t-body">Mensaje</label>
          <textarea id="t-body" rows="5" class="rsv-input" [(ngModel)]="c.emailBody" maxlength="1000"></textarea>
        </div>
        <small class="set-muted">Variables: {{ '{' }}número{{ '}' }}, {{ '{' }}huésped{{ '}' }}, {{ '{' }}fechas{{ '}' }}, {{ '{' }}total{{ '}' }}, {{ '{' }}hospedaje{{ '}' }}. Se usa en el correo y en WhatsApp.</small>
      </section>

      <section class="bil-card">
        <h3 class="bil-card-title set-side-title">Quién puede hacer qué</h3>
        <table class="set-perms">
          <thead><tr><th>Acción</th><th>Permiso necesario</th><th>Tú</th></tr></thead>
          <tbody>
            <tr *ngFor="let a of actions">
              <td>{{ a }}</td>
              <td class="set-muted">{{ permLabel(a) }}</td>
              <td><span class="rsv-badge" [ngClass]="can(a) ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ can(a) ? 'Sí' : 'No' }}</span></td>
            </tr>
          </tbody>
        </table>
        <small class="set-muted">Los permisos se asignan por rol en <a routerLink="/dashboard/users">Usuarios y roles</a>; el servidor los exige en cada acción.</small>
      </section>
    </aside>
  </div>

  <!-- Modal · concepto tributario -->
  <div class="rsv-modal-overlay" *ngIf="taxForm" (click)="taxForm = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
      <h3 class="rsv-modal-title">{{ taxForm.id ? 'Editar concepto' : 'Nuevo concepto' }}</h3>
      <p class="rsv-modal-desc">Los cambios aplican a las facturas que se generen después de guardar.</p>
      <div class="rsv-field">
        <label for="x-concept">Concepto facturable</label>
        <select id="x-concept" class="rsv-input" [(ngModel)]="taxForm.concept" [disabled]="!!taxForm.id">
          <option *ngFor="let k of concepts">{{ k }}</option>
        </select>
      </div>
      <div class="set-grid set-grid--2">
        <div class="rsv-field">
          <label for="x-kind">Impuesto</label>
          <select id="x-kind" class="rsv-input" [(ngModel)]="taxForm.kind"><option>IVA</option><option>INC</option></select>
        </div>
        <div class="rsv-field">
          <label for="x-rate">Tarifa (%)</label>
          <input id="x-rate" type="number" min="0" max="50" class="rsv-input" [(ngModel)]="taxForm.ratePct">
        </div>
      </div>
      <div class="rsv-field">
        <label for="x-cond">Condición</label>
        <input id="x-cond" type="text" class="rsv-input" [(ngModel)]="taxForm.condition" maxlength="120">
      </div>
      <div class="rsv-field">
        <label for="x-status">Estado</label>
        <select id="x-status" class="rsv-input" [(ngModel)]="taxForm.status"><option>Activo</option><option>Validar con contador</option><option>Inactivo</option></select>
      </div>
      <p class="set-msg set-msg--bad" *ngIf="taxError">{{ taxError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="taxForm = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="saveTax()">Aplicar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .set-issuer { display: flex; gap: 14px; align-items: center; }
    .set-logo { width: 58px; height: 58px; border-radius: 12px; background: #0A3D6D; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .set-logo img { width: 44px; height: 44px; object-fit: contain; }
    .set-issuer strong { display: block; font-size: 14px; color: #0A2540; }
    .set-issuer small { display: block; font-size: 12px; color: #4B5563; margin-top: 2px; }
    .set-missing { color: #B45309; font-weight: 600; }
  `],
})
export class BillingSettingsComponent {

  readonly environments: BillingConfig['provider']['environment'][] = ['Habilitación', 'Producción'];
  readonly actions = Object.keys(ACTION_PERMISSION) as BillingAction[];
  readonly concepts: TaxConcept[] = ['Alojamiento', 'Alojamiento · extranjero no residente', ...EXTRA_CATEGORIES];
  readonly date = fmtDate;

  c: BillingConfig;
  saved: BillingConfig;
  saving = false;
  showKey = false;
  testing = false;
  testMessage = '';

  taxForm?: { id: string; concept: TaxConcept; kind: TaxRule['kind']; ratePct: number; condition: string; status: TaxRule['status'] };
  taxError = '';

  constructor(private config: BillingConfigService, private invoices: InvoiceService, private audit: UsersService) {
    this.saved = this.config.raw();
    this.c = this.config.raw();
  }

  get issuer() { return this.config.issuer; }
  get blockers(): string[] { return this.config.issueBlockers(); }
  get dirty(): boolean { return JSON.stringify(this.c) !== JSON.stringify(this.saved); }
  get hasIssued(): boolean { return this.invoices.getSnapshot().some(i => !!i.number); }
  get lastResponse(): string {
    const r = this.saved.provider.lastResponse;
    return r ? r.replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)(:\d\d)?/, (_, d, t) => `${fmtDate(d)} ${t}`) : 'Sin probar';
  }
  get nextNumber(): string { return this.invoices.nextNumber(); }
  get usage() { return this.invoices.rangeUsage(); }
  get usagePct(): number { const u = this.usage; return Math.min(100, Math.max(0, u.used / Math.max(1, u.used + u.left) * 100)); }
  pct(rate: number): number { return Math.round(rate * 1000) / 10; }
  can(a: BillingAction): boolean { return this.config.can(a); }
  permLabel(a: BillingAction): string { const [m, p] = ACTION_PERMISSION[a]; return `${m} · ${PERM_LABEL[p]}`; }

  get resolutionState(): { label: string; badge: string } {
    const r = this.saved.resolution, t = new Date().toISOString().slice(0, 10);
    if (!r.number || !r.validFrom || !r.validTo) return { label: 'Sin configurar', badge: 'rsv-badge--warn' };
    if (t < r.validFrom) return { label: 'Aún no vigente', badge: 'rsv-badge--warn' };
    if (t > r.validTo) return { label: 'Vencida', badge: 'rsv-badge--danger' };
    return this.usage.left > 0 ? { label: 'Vigente', badge: 'rsv-badge--ok' } : { label: 'Rango agotado', badge: 'rsv-badge--danger' };
  }

  get rangeError(): string {
    const r = this.c.resolution;
    const used = Number(this.invoices.nextNumber().split('-')[1]) - 1;
    if (!/^[A-Z0-9]{1,4}$/.test(r.prefix ?? '')) return 'El prefijo de facturas debe tener de 1 a 4 letras o números en mayúscula.';
    if (!/^[A-Z0-9]{1,4}$/.test(r.creditPrefix ?? '')) return 'El prefijo de notas crédito debe tener de 1 a 4 letras o números en mayúscula.';
    if (!(+r.from > 0) || !(+r.to > +r.from)) return 'El rango debe ir de un número menor a uno mayor.';
    if (this.hasIssued && +r.to < used) return `El rango no puede terminar antes de la última factura emitida (${r.prefix}-${used}).`;
    if (r.validFrom && r.validTo && r.validTo < r.validFrom) return 'La vigencia debe terminar después de empezar.';
    return '';
  }

  async test(): Promise<void> {
    this.testing = true;
    this.testMessage = '';
    try {
      const res = await this.config.testConnection();
      this.saved = this.config.raw();
      this.c = { ...this.c, provider: { ...this.saved.provider } };
      this.testMessage = res.ok ? `Conexión correcta: ${res.message}.` : `${res.message}.`;
    } catch (e) {
      this.testMessage = serverMessage(e);
    } finally {
      this.testing = false;
    }
  }

  async save(): Promise<void> {
    if (this.rangeError || this.saving) return;
    this.saving = true;
    try {
      const c = structuredClone(this.c);
      c.resolution.prefix = c.resolution.prefix.trim().toUpperCase();
      c.resolution.creditPrefix = c.resolution.creditPrefix.trim().toUpperCase();
      c.resolution.from = +c.resolution.from;
      c.resolution.to = +c.resolution.to;
      await this.config.save(c);
      this.saved = this.config.raw();
      this.c = this.config.raw();
      this.audit.addLog('Configuración de facturación', 'Resolución, proveedor, tarifas o mensaje actualizados');
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.saving = false;
    }
  }

  discard(): void {
    this.c = this.config.raw();
  }

  editTax(t?: TaxRule): void {
    this.taxError = '';
    this.taxForm = t
      ? { id: t.id, concept: t.concept, kind: t.kind, ratePct: this.pct(t.rate), condition: t.condition, status: t.status }
      : { id: '', concept: 'Otro', kind: 'IVA', ratePct: 19, condition: 'General', status: 'Validar con contador' };
  }

  saveTax(): void {
    const f = this.taxForm!;
    const rate = +f.ratePct;
    if (!(rate >= 0 && rate <= 50)) { this.taxError = 'La tarifa debe estar entre 0 y 50 %.'; return; }
    if (!f.id && this.c.taxes.some(t => t.concept === f.concept && t.status !== 'Inactivo')) { this.taxError = 'Ese concepto ya tiene una tarifa activa; edítala en la tabla.'; return; }
    const rule: TaxRule = { id: f.id || `t${Date.now().toString(36)}`, concept: f.concept, kind: f.kind, rate: Math.round(rate * 10) / 1000, condition: f.condition.trim() || 'General', status: f.status };
    this.c.taxes = f.id ? this.c.taxes.map(t => t.id === f.id ? rule : t) : [...this.c.taxes, rule];
    this.taxForm = undefined;
  }
}
