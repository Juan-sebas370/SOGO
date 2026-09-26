import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BillingConfigService, BillingConfig, TaxRule, TaxConcept, BILLING_ACTIONS, PERMISSION_ROLES
} from '../billing-config.service';
import { InvoiceService } from '../invoice.service';
import { UsersService } from '../../users/users.service';
import { fmtDate, fmtDateTime } from '../../reservations/reservation-format';

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./billing-settings.component.css'],
  template: `
  <nav class="bil-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/billing">Facturación</a><span>/</span><span>Configuración</span>
  </nav>
  <header class="bil-head">
    <div>
      <h1 class="bil-title">Integración y configuración</h1>
      <p class="bil-subtitle">Proveedor de facturación electrónica, numeración, impuestos y permisos. Solo administradores.</p>
    </div>
    <div class="bil-head-actions">
      <span class="set-saved" *ngIf="savedAt && !dirty">Guardado {{ dateTime(savedAt) }}</span>
      <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="dirty" (click)="discard()">Descartar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!rangeError" (click)="save()">Guardar cambios</button>
    </div>
  </header>

  <div class="set-layout">
    <div class="set-main">
      <!-- Proveedor -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div>
            <span class="bil-card-icon set-icon-purple"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg></span>
            <div>
              <h2 class="bil-card-title">Proveedor de facturación electrónica
                <span class="rsv-badge" [ngClass]="c.provider.connected ? 'rsv-badge--ok' : 'rsv-badge--danger'">● {{ c.provider.connected ? 'Conectado' : 'Sin conexión' }}</span>
              </h2>
              <span class="bil-card-sub">Sistema externo · conexión por API segura</span>
            </div>
          </div>
          <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="testing" (click)="test()">
            <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ testing ? 'Probando…' : 'Probar conexión' }}
          </button>
        </div>
        <div class="set-grid set-grid--3">
          <div class="rsv-field"><label for="p-name">Proveedor</label><input id="p-name" type="text" class="rsv-input" [(ngModel)]="c.provider.name"></div>
          <div class="rsv-field"><label for="p-url">URL de la API</label><input id="p-url" type="text" class="rsv-input" [(ngModel)]="c.provider.apiUrl"></div>
          <div class="rsv-field">
            <label>Ambiente</label>
            <div class="set-segmented" role="radiogroup">
              <button type="button" *ngFor="let e of environments" role="radio" [attr.aria-checked]="c.provider.environment === e"
                      [class.active]="c.provider.environment === e" (click)="c.provider.environment = e">{{ e }}</button>
            </div>
          </div>
          <div class="rsv-field"><label for="p-client">Usuario / ID de cliente</label><input id="p-client" type="text" class="rsv-input" [(ngModel)]="c.provider.clientId"></div>
          <div class="rsv-field">
            <label for="p-key">Clave de API</label>
            <div class="set-secret">
              <input id="p-key" [type]="showKey ? 'text' : 'password'" class="rsv-input" [(ngModel)]="c.provider.apiKey">
              <button type="button" (click)="showKey = !showKey" [attr.aria-label]="showKey ? 'Ocultar clave' : 'Mostrar clave'">{{ showKey ? 'Ocultar' : 'Ver' }}</button>
            </div>
          </div>
          <div class="rsv-field"><label for="p-last">Última respuesta</label><input id="p-last" type="text" class="rsv-input" [value]="lastResponse" readonly></div>
        </div>
        <p class="bil-note set-note-blue">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Las credenciales se guardan cifradas en el servidor. SOGO envía cada factura al proveedor al emitirla, guarda el estado de aceptación o rechazo, el CUFE y el motivo de rechazo.
        </p>
        <p class="set-msg" *ngIf="testMessage" [class.set-msg--bad]="!c.provider.connected">{{ testMessage }}</p>
      </section>

      <!-- Resolución -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div><div><h2 class="bil-card-title">Resolución de numeración DIAN</h2><span class="bil-card-sub">Define el número único de cada factura</span></div></div>
          <span class="rsv-badge" [ngClass]="resolutionValid ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ resolutionValid ? 'Vigente' : 'Vencida' }}</span>
        </div>
        <div class="set-grid set-grid--4">
          <div class="rsv-field"><label for="r-num">N.º de resolución</label><input id="r-num" type="text" class="rsv-input" [(ngModel)]="c.resolution.number"></div>
          <div class="rsv-field"><label for="r-prefix">Prefijo</label><input id="r-prefix" type="text" class="rsv-input" [(ngModel)]="c.resolution.prefix" disabled title="El prefijo no cambia mientras haya facturas emitidas con él"></div>
          <div class="rsv-field">
            <label>Rango autorizado</label>
            <div class="set-range">
              <input type="number" class="rsv-input" [(ngModel)]="c.resolution.from" aria-label="Desde"><span>–</span>
              <input type="number" class="rsv-input" [(ngModel)]="c.resolution.to" aria-label="Hasta">
            </div>
          </div>
          <div class="rsv-field"><label>Próximo número</label><input type="text" class="rsv-input" [value]="nextNumber" readonly></div>
          <div class="rsv-field"><label for="r-from">Vigente desde</label><input id="r-from" type="date" class="rsv-input" [(ngModel)]="c.resolution.validFrom"></div>
          <div class="rsv-field"><label for="r-to">Vigente hasta</label><input id="r-to" type="date" class="rsv-input" [(ngModel)]="c.resolution.validTo"></div>
        </div>
        <p class="set-msg set-msg--bad" *ngIf="rangeError">{{ rangeError }}</p>
        <div class="set-usage">
          <span>Consumo del rango · vigencia {{ date(c.resolution.validFrom) }} – {{ date(c.resolution.validTo) }}</span>
          <strong>{{ usage.used }} usados · quedan {{ usage.left.toLocaleString('es-CO') }}</strong>
        </div>
        <span class="set-track"><span [style.width.%]="usagePct"></span></span>
      </section>

      <!-- Impuestos -->
      <section class="bil-card">
        <div class="bil-card-head">
          <div><div><h2 class="bil-card-title">Configuración tributaria</h2><span class="bil-card-sub">Tarifas que usa el cálculo automático de impuestos</span></div></div>
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
            </tbody>
          </table>
        </div>
      </section>

      <!-- Emisor -->
      <section class="bil-card">
        <div class="bil-card-head"><div><div><h2 class="bil-card-title">Datos del emisor</h2><span class="bil-card-sub">Encabezado de la representación gráfica de la factura</span></div></div></div>
        <div class="set-grid set-grid--3">
          <div class="rsv-field"><label for="e-name">Razón social</label><input id="e-name" type="text" class="rsv-input" [(ngModel)]="c.issuer.name"></div>
          <div class="rsv-field"><label for="e-nit">NIT</label><input id="e-nit" type="text" class="rsv-input" [(ngModel)]="c.issuer.nit"></div>
          <div class="rsv-field"><label for="e-rnt">RNT</label><input id="e-rnt" type="text" class="rsv-input" [(ngModel)]="c.issuer.rnt"></div>
          <div class="rsv-field"><label for="e-address">Dirección</label><input id="e-address" type="text" class="rsv-input" [(ngModel)]="c.issuer.address"></div>
          <div class="rsv-field"><label for="e-city">Ciudad</label><input id="e-city" type="text" class="rsv-input" [(ngModel)]="c.issuer.city"></div>
          <div class="rsv-field"><label for="e-phone">Teléfono</label><input id="e-phone" type="text" class="rsv-input" [(ngModel)]="c.issuer.phone"></div>
        </div>
      </section>
    </div>

    <aside class="bil-side">
      <section class="bil-card">
        <h3 class="bil-card-title set-side-title">Automatización</h3>
        <label class="set-toggle" *ngFor="let a of automations">
          <span><strong>{{ a.label }}</strong><small>{{ a.detail }}</small></span>
          <input type="checkbox" role="switch" [(ngModel)]="c.automation[a.key]">
          <i aria-hidden="true"></i>
        </label>
      </section>

      <section class="bil-card">
        <h3 class="bil-card-title set-side-title">Plantilla de correo</h3>
        <div class="rsv-field">
          <label for="t-subject">Asunto predeterminado</label>
          <input id="t-subject" type="text" class="rsv-input" [(ngModel)]="c.emailSubject">
        </div>
        <div class="rsv-field">
          <label for="t-body">Mensaje predeterminado</label>
          <textarea id="t-body" rows="4" class="rsv-input" [(ngModel)]="c.emailBody"></textarea>
        </div>
        <small class="set-muted">Variables: {{ '{' }}número{{ '}' }}, {{ '{' }}huésped{{ '}' }}, {{ '{' }}fechas{{ '}' }}, {{ '{' }}total{{ '}' }}</small>
      </section>

      <section class="bil-card">
        <h3 class="bil-card-title set-side-title">Permisos por rol</h3>
        <table class="set-perms">
          <thead><tr><th>Acción</th><th *ngFor="let r of roles">{{ r }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let a of actions">
              <td>{{ a }}</td>
              <td *ngFor="let r of roles">
                <label class="set-toggle set-toggle--mini">
                  <input type="checkbox" role="switch" [(ngModel)]="c.permissions[a][r]"
                         [disabled]="a === 'Configurar integración' && r === 'Admin'" [attr.aria-label]="a + ' · ' + r">
                  <i aria-hidden="true"></i>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
        <small class="set-muted">El Gerente usa los permisos de Admin. Admin siempre puede configurar la integración.</small>
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
          <input id="x-rate" type="number" min="0" max="100" class="rsv-input" [(ngModel)]="taxForm.ratePct">
        </div>
      </div>
      <div class="rsv-field">
        <label for="x-cond">Condición</label>
        <input id="x-cond" type="text" class="rsv-input" [(ngModel)]="taxForm.condition">
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
  `
})
export class BillingSettingsComponent {

  readonly environments: BillingConfig['provider']['environment'][] = ['Habilitación', 'Producción'];
  readonly actions = BILLING_ACTIONS;
  readonly roles = PERMISSION_ROLES;
  readonly concepts: TaxConcept[] = ['Alojamiento', 'Alojamiento · extranjero no residente', 'Restaurante', 'Minibar', 'Eventos y pasadías', 'Lavandería', 'Otro'];
  readonly automations: { key: keyof BillingConfig['automation']; label: string; detail: string }[] = [
    { key: 'sendOnIssue',   label: 'Enviar al proveedor al emitir',            detail: 'Transmisión inmediata a la DIAN' },
    { key: 'emailOnAccept', label: 'Enviar correo al huésped al ser aceptada', detail: 'Con PDF y XML adjuntos' },
    { key: 'retry',         label: 'Reintentar si el proveedor no responde',   detail: 'Hasta 3 intentos · cada 10 min' },
  ];
  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;

  c: BillingConfig;
  savedAt = '';
  showKey = false;
  testing = false;
  testMessage = '';

  taxForm?: { id: string; concept: TaxConcept; kind: TaxRule['kind']; ratePct: number; condition: string; status: TaxRule['status'] };
  taxError = '';

  constructor(private config: BillingConfigService, private invoices: InvoiceService, private audit: UsersService) {
    this.c = structuredClone(this.config.get());
  }

  get dirty(): boolean { return JSON.stringify(this.c) !== JSON.stringify(this.config.get()); }
  get lastResponse(): string { return this.c.provider.lastResponse.replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)/, (_, d, t) => `${fmtDate(d)} ${t}`); }
  get nextNumber(): string { return this.invoices.nextNumber(); }
  get usage() { return this.invoices.rangeUsage(); }
  get usagePct(): number { const u = this.usage; return Math.min(100, Math.max(1, u.used / Math.max(1, u.used + u.left) * 100)); }
  get resolutionValid(): boolean { const t = new Date().toISOString().slice(0, 10); return this.c.resolution.validFrom <= t && this.c.resolution.validTo >= t; }
  pct(rate: number): number { return Math.round(rate * 100); }

  get rangeError(): string {
    const r = this.c.resolution;
    const used = Number(this.invoices.nextNumber().split('-')[1]) - 1;
    if (!(r.from > 0) || !(r.to > r.from)) return 'El rango debe ir de un número menor a uno mayor.';
    if (used >= r.from && r.to < used) return `El rango no puede terminar antes de la última factura emitida (${r.prefix}-${used}).`;
    if (r.validTo < r.validFrom) return 'La vigencia debe terminar después de empezar.';
    return '';
  }

  test(): void {
    // La prueba usa lo guardado; si hay cambios de credenciales, primero se guardan
    if (this.dirty && !this.rangeError) this.save();
    this.testing = true;
    this.testMessage = '';
    this.config.testConnection().then(res => {
      this.testing = false;
      this.c.provider = structuredClone(this.config.get().provider);
      this.testMessage = res.ok ? 'Conexión correcta con el proveedor.' : `No se pudo conectar: ${res.message}.`;
    });
  }

  save(): void {
    if (this.rangeError) return;
    // Admin siempre conserva el acceso a esta pantalla
    this.c.permissions['Configurar integración']['Admin'] = true;
    this.config.save(this.c);
    this.c = structuredClone(this.config.get());
    this.savedAt = new Date().toISOString().slice(0, 16);
    this.audit.addLog('Configuración de facturación', 'Proveedor, numeración, impuestos o permisos actualizados');
  }

  discard(): void {
    this.c = structuredClone(this.config.get());
  }

  editTax(t?: TaxRule): void {
    this.taxError = '';
    this.taxForm = t
      ? { id: t.id, concept: t.concept, kind: t.kind, ratePct: this.pct(t.rate), condition: t.condition, status: t.status }
      : { id: '', concept: 'Otro', kind: 'IVA', ratePct: 19, condition: 'General', status: 'Activo' };
  }

  saveTax(): void {
    const f = this.taxForm!;
    const rate = +f.ratePct;
    if (!(rate >= 0 && rate <= 100)) { this.taxError = 'La tarifa debe estar entre 0 y 100.'; return; }
    if (!f.id && this.c.taxes.some(t => t.concept === f.concept)) { this.taxError = 'Ese concepto ya tiene tarifa; edítala en la tabla.'; return; }
    const rule: TaxRule = { id: f.id || `t${Date.now()}`, concept: f.concept, kind: f.kind, rate: rate / 100, condition: f.condition.trim() || 'General', status: f.status };
    this.c.taxes = f.id ? this.c.taxes.map(t => t.id === f.id ? rule : t) : [...this.c.taxes, rule];
    this.taxForm = undefined;
  }
}
