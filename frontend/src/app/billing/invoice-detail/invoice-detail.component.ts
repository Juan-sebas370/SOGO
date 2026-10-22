import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { BillingConfigService } from '../billing-config.service';
import { Invoice, InvoiceState, EMAIL_RE, computeTotals, lineNet, taxLabel, checkCufe, dianLookupUrl } from '../invoice.model';
import { DIAN_BADGE, dayMonth } from '../billing-format';
import { ReservationService } from '../../reservations/reservation.service';
import { PaymentMethod, lodgingLabel } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { toast } from '../../shared/toast/toast.service';
import { serverMessage } from '../../shared/toast/notify.interceptor';

type Panel = 'Correo' | 'WhatsApp' | null;
type SendState = 'draft' | 'sending' | 'sent' | 'error';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-detail.component.css'],
  template: `
  <ng-container *ngIf="inv; else notFound">
    <nav class="bil-crumb" aria-label="Ruta">
      <a routerLink="/dashboard/billing">Facturación</a><span>/</span><span>{{ inv.number }}</span>
    </nav>
    <header class="bil-head">
      <div>
        <h1 class="bil-title">Factura {{ inv.number }}</h1>
        <p class="bil-subtitle">{{ inv.buyer.name }} · Reserva {{ inv.reservationCode }}{{ stayLabel }}</p>
      </div>
      <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="canAnnul" (click)="openAnnul()">Anular con nota crédito</button>
    </header>

    <!-- Estado -->
    <section class="bil-card det-status" [ngClass]="'det-status--' + toneOf(inv.dianStatus)">
      <span class="det-status-icon">
        <svg viewBox="0 0 24 24"><path [attr.d]="statusIconPath"/></svg>
      </span>
      <div><span>Validación DIAN</span><span class="rsv-badge" [ngClass]="dianBadge[inv.dianStatus]">{{ inv.annulment ? 'Anulada' : inv.dianStatus }}</span></div>
      <div><span>Emisión</span><strong>{{ dateTime(inv.issuedAt!) }}</strong></div>
      <div><span>Total</span><strong>{{ money(t.total) }}</strong></div>
      <div>
        <span>Estado de pago</span>
        <strong [ngClass]="'det-pay--' + state">{{ state }}{{ balance && state !== 'Anulada' ? ' · saldo ' + money(balance) : '' }}</strong>
        <button type="button" class="det-inline-link" *ngIf="balance > 0 && !inv.annulment" (click)="openPayment()">Registrar pago</button>
      </div>
      <div class="det-cufe"><span>CUFE</span><code>{{ inv.cufe || (inv.dianStatus === 'Rechazada' ? 'Sin CUFE: rechazada' : 'Pendiente de la DIAN') }}</code>
        <a *ngIf="inv.cufe" class="det-inline-link" [href]="lookup(inv.cufe)" target="_blank" rel="noopener">Consultar en la DIAN</a></div>
    </section>

    <div class="bil-alert" *ngIf="inv.dianStatus === 'Rechazada' && !inv.annulment" role="alert">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p><strong>Rechazada por la DIAN.</strong> Motivo informado por el proveedor: {{ inv.rejectionReason }}. Corrige los datos fiscales y reenvía; el número se conserva.</p>
      <a class="bil-alert-btn" [routerLink]="['/dashboard/billing', inv.id, 'corregir']">Corregir y reenviar</a>
    </div>
    <div class="bil-alert bil-alert--warn" *ngIf="inv.dianStatus === 'En validación' && !inv.annulment" role="status">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
      <p><strong>Pendiente de validación DIAN.</strong> Valídala con el proveedor tecnológico{{ providerName ? ' (' + providerName + ')' : '' }} y registra aquí su respuesta: el CUFE si fue aceptada o el motivo si fue rechazada. El envío al huésped se habilita cuando sea aceptada.</p>
      <button type="button" class="bil-alert-btn" *ngIf="canValidate" (click)="openDian()">Registrar respuesta</button>
    </div>
    <div class="bil-alert bil-alert--info" *ngIf="inv.annulment as a">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
      <p><strong>Anulada con nota crédito {{ a.creditNote }}</strong> el {{ dateTime(a.at) }}. Motivo: {{ a.reason }}.</p>
    </div>

    <div class="det-layout">
      <div class="det-main">
        <!-- Acciones -->
        <div class="det-tiles">
          <button type="button" class="det-tile" [disabled]="!canShare" (click)="downloadPdf()">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar PDF
          </button>
          <button type="button" class="det-tile" [disabled]="!canShare" (click)="print()">
            <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir
          </button>
          <button type="button" class="det-tile" [class.active]="panel === 'Correo'" [disabled]="!canSend" (click)="openPanel('Correo')">
            <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
            Enviar por correo
          </button>
          <button type="button" class="det-tile" [class.active]="panel === 'WhatsApp'" [disabled]="!canSend" (click)="openPanel('WhatsApp')">
            <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            Enviar por WhatsApp
          </button>
        </div>
        <p class="bil-hint det-hint" *ngIf="!canSend && !inv.annulment">{{ canShare ? 'El envío se habilita cuando la DIAN acepte la factura.' : 'Tu rol no tiene permiso para descargar ni enviar facturas.' }}</p>

        <!-- Envío por correo (CU07.1) -->
        <section class="bil-card" *ngIf="panel === 'Correo'">
          <div class="bil-card-head">
            <div><div><h2 class="bil-card-title">Enviar factura por correo</h2><span class="bil-card-sub">CU07.1 · El envío no modifica la factura ni su validez tributaria</span></div></div>
            <span class="rsv-badge" [ngClass]="emailValid(mail.to) ? 'rsv-badge--ok' : 'rsv-badge--danger'">{{ emailValid(mail.to) ? 'Correo verificado' : 'Correo no válido' }}</span>
          </div>

          <div class="bil-alert bil-alert--info" *ngIf="sendState === 'sent'">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            <p><strong>Factura enviada</strong> a {{ mail.to }}{{ mail.cc ? ' y ' + mail.cc : '' }} · {{ dateTime(inv.sentVia!.at) }}.</p>
            <button type="button" class="bil-alert-btn det-btn-neutral" (click)="sendState = 'draft'">Enviar de nuevo</button>
          </div>
          <div class="bil-alert" *ngIf="sendState === 'error'" role="alert">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p><strong>No se pudo enviar.</strong> {{ sendError }}</p>
            <button type="button" class="bil-alert-btn" (click)="sendEmail()">Reintentar</button>
          </div>

          <ng-container *ngIf="sendState !== 'sent'">
            <div class="det-grid">
              <div class="rsv-field">
                <label for="m-to">Para *</label>
                <input id="m-to" type="email" class="rsv-input" [(ngModel)]="mail.to">
              </div>
              <div class="rsv-field">
                <label for="m-cc">CC (opcional)</label>
                <input id="m-cc" type="email" class="rsv-input" [(ngModel)]="mail.cc" placeholder="Agregar otro correo">
              </div>
            </div>
            <div class="rsv-field">
              <label for="m-subject">Asunto</label>
              <input id="m-subject" type="text" class="rsv-input" [(ngModel)]="mail.subject">
            </div>
            <div class="rsv-field">
              <label for="m-body">Mensaje</label>
              <textarea id="m-body" rows="4" class="rsv-input" [(ngModel)]="mail.body"></textarea>
              <small class="det-help">Asunto y mensaje predeterminados · puedes personalizarlos antes de enviar</small>
            </div>
            <p class="det-help">El correo sale de la cuenta de SOGO con el mensaje, el detalle de la factura y su CUFE. El PDF y el XML oficiales los entrega el proveedor tecnológico.</p>

            <div class="det-mail-preview" *ngIf="mailPreview">
              <p><strong>De:</strong> {{ issuerName }} · <strong>Para:</strong> {{ mail.to }}{{ mail.cc ? ', ' + mail.cc : '' }}</p>
              <p><strong>Asunto:</strong> {{ mail.subject }}</p>
              <p class="det-mail-body">{{ mail.body }}</p>
            </div>

            <div class="det-mail-actions">
              <button type="button" class="rsv-btn rsv-btn--outline" (click)="mailPreview = !mailPreview">{{ mailPreview ? 'Ocultar vista previa' : 'Vista previa del correo' }}</button>
              <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="sendState === 'sending'" (click)="sendEmail()">
                <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {{ sendState === 'sending' ? 'Enviando…' : 'Enviar factura' }}
              </button>
            </div>
          </ng-container>
        </section>

        <!-- Envío por WhatsApp (CU07.2) -->
        <section class="bil-card" *ngIf="panel === 'WhatsApp'">
          <div class="bil-card-head">
            <div><div><h2 class="bil-card-title">Enviar por WhatsApp</h2><span class="bil-card-sub">CU07.2 · Se abre WhatsApp con el mensaje; adjunta el PDF descargado</span></div></div>
          </div>
          <div class="rsv-field">
            <label for="w-phone">Número de WhatsApp *</label>
            <input id="w-phone" type="text" class="rsv-input" [(ngModel)]="wa.phone">
            <small class="nf-err det-err" *ngIf="wa.phone && !phoneDigits">Escribe un número con indicativo, p. ej. +57 310 555 0142</small>
          </div>
          <div class="rsv-field">
            <label for="w-msg">Mensaje</label>
            <textarea id="w-msg" rows="4" class="rsv-input" [(ngModel)]="wa.message"></textarea>
          </div>
          <div class="det-mail-actions">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="downloadPdf()">Descargar PDF para adjuntar</button>
            <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!phoneDigits" (click)="sendWhatsApp()">Abrir WhatsApp</button>
          </div>
        </section>
      </div>

      <aside class="bil-side">
        <section class="bil-card">
          <h3 class="bil-card-title det-side-title">Resumen</h3>
          <dl class="bil-totals">
            <div><dt>Subtotal</dt><dd>{{ money(t.subtotal) }}</dd></div>
            <div><dt>Descuentos</dt><dd class="bil-discount">{{ t.discounts ? '- ' + money(t.discounts) : money(0) }}</dd></div>
            <div *ngFor="let g of t.taxes"><dt>{{ g.label }}</dt><dd>{{ money(g.amount) }}</dd></div>
            <div class="bil-total"><dt>Total</dt><dd>{{ money(t.total) }}</dd></div>
            <div><dt>Pagado</dt><dd>{{ money(paid) }}</dd></div>
          </dl>
          <details class="det-lines">
            <summary>Ver {{ t.count }} concepto{{ t.count === 1 ? '' : 's' }}</summary>
            <ul>
              <li *ngFor="let l of includedLines"><span>{{ l.description }} <small>{{ tax(l) }}</small></span><strong>{{ money(net(l)) }}</strong></li>
            </ul>
          </details>
        </section>

        <section class="bil-card">
          <h3 class="bil-card-title det-side-title">Historial de la factura</h3>
          <ol class="det-timeline">
            <li *ngFor="let e of history" [ngClass]="'det-tone--' + e.tone">
              <strong>{{ e.label }}</strong>
              <span>{{ dateTime(e.at) }}{{ e.at.length > 16 ? ':' + e.at.slice(17, 19) : '' }}{{ e.detail ? ' · ' + e.detail : '' }}</span>
            </li>
          </ol>
        </section>
      </aside>
    </div>

    <!-- Modal · anular -->
    <div class="rsv-modal-overlay" *ngIf="annulOpen" (click)="annulOpen = false">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="rsv-modal-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <h3 class="rsv-modal-title">Anular {{ inv.number }}</h3>
        <p class="rsv-modal-desc">Se emite una nota crédito por {{ money(t.total) }} que anula la factura ante la DIAN. Esta acción no se puede deshacer.</p>
        <div class="rsv-field">
          <label for="a-reason">Motivo *</label>
          <select id="a-reason" class="rsv-input" [(ngModel)]="annulReason">
            <option value="">Seleccionar motivo...</option>
            <option *ngFor="let m of annulReasons">{{ m }}</option>
          </select>
        </div>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="annulOpen = false">Volver</button>
          <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="!annulReason" (click)="annul()">Emitir nota crédito</button>
        </div>
      </div>
    </div>

    <!-- Modal · respuesta de la DIAN -->
    <div class="rsv-modal-overlay" *ngIf="dian" (click)="dian = undefined">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h3 class="rsv-modal-title">Respuesta de la DIAN · {{ inv.number }}</h3>
        <p class="rsv-modal-desc">Copia la respuesta que muestra el proveedor tecnológico para esta factura.</p>
        <div class="det-grid">
          <label class="det-choice" [class.active]="dian.accepted"><input type="radio" name="dian" [checked]="dian.accepted" (change)="dian.accepted = true"> Aceptada</label>
          <label class="det-choice" [class.active]="!dian.accepted"><input type="radio" name="dian" [checked]="!dian.accepted" (change)="dian.accepted = false"> Rechazada</label>
        </div>
        <ng-container *ngIf="dian.accepted">
          <div class="det-cufe-help">
            <strong>¿Qué es el CUFE?</strong>
            <p>Es el código único que la DIAN le asigna a la factura cuando la acepta: no se inventa ni se calcula en SOGO. Tiene <b>96 caracteres</b> (números 0-9 y letras a-f).</p>
            <strong>¿Dónde lo encuentro?</strong>
            <p>En el portal de tu proveedor tecnológico, en el detalle de la factura {{ inv.number }} (campo «CUFE»), en el PDF de la factura debajo del código QR, o en el XML (etiqueta <code>cbc:UUID</code>). También puedes pegar el enlace completo del código QR de la DIAN: SOGO toma el CUFE de ahí.</p>
          </div>
          <div class="rsv-field">
            <label for="d-cufe">CUFE *</label>
            <textarea id="d-cufe" rows="3" class="rsv-input det-cufe-input" [class.det-cufe-ok]="cufeCheck.value && !cufeCheck.error"
                      [class.det-cufe-bad]="!!cufeCheck.error" [(ngModel)]="dian.cufe" spellcheck="false"
                      placeholder="Pega aquí el CUFE (96 caracteres) o el enlace del código QR de la DIAN"></textarea>
            <small class="det-help" [class.det-ok]="cufeCheck.value.length === 96 && !cufeCheck.error">
              {{ cufeCheck.value.length }} de 96 caracteres{{ cufeCheck.value.length === 96 && !cufeCheck.error ? ' · CUFE válido' : '' }}{{ dian.cufe && cufeCheck.value !== dian.cufe ? ' · se quitaron espacios o el enlace' : '' }}</small>
            <small class="nf-err det-err" *ngIf="cufeCheck.error">{{ cufeCheck.error }}</small>
          </div>
        </ng-container>
        <div class="rsv-field" *ngIf="!dian.accepted">
          <label for="d-reason">Motivo del rechazo *</label>
          <textarea id="d-reason" rows="3" class="rsv-input" [(ngModel)]="dian.reason" placeholder="Tal como lo informa el proveedor"></textarea>
        </div>
        <p class="nf-err det-err" *ngIf="dianError">{{ dianError }}</p>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="dian = undefined">Cancelar</button>
          <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="busy || (dian.accepted ? !cufeValid : dian.reason.trim().length < 5)" (click)="saveDian()">Guardar respuesta</button>
        </div>
      </div>
    </div>

    <!-- Modal · registrar pago -->
    <div class="rsv-modal-overlay" *ngIf="payForm" (click)="payForm = undefined">
      <div class="rsv-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h3 class="rsv-modal-title">Registrar pago</h3>
        <p class="rsv-modal-desc">Saldo de {{ inv.number }}: {{ money(balance) }}. El pago queda en la cuenta de la reserva {{ inv.reservationCode }}.</p>
        <div class="rsv-field">
          <label for="p-amount">Valor (COP)</label>
          <input id="p-amount" type="number" min="0" step="1000" class="rsv-input" [(ngModel)]="payForm.amount">
        </div>
        <div class="det-grid">
          <div class="rsv-field">
            <label for="p-method">Método</label>
            <select id="p-method" class="rsv-input" [(ngModel)]="payForm.method">
              <option *ngFor="let m of paymentMethods">{{ m }}</option>
            </select>
          </div>
          <div class="rsv-field">
            <label for="p-receipt">N.º de comprobante</label>
            <input id="p-receipt" type="text" class="rsv-input" [(ngModel)]="payForm.receipt">
          </div>
        </div>
        <p class="nf-err det-err" *ngIf="payError">{{ payError }}</p>
        <div class="rsv-modal-footer">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="payForm = undefined">Cancelar</button>
          <button type="button" class="rsv-btn rsv-btn--primary" (click)="savePayment()">Registrar pago</button>
        </div>
      </div>
    </div>
  </ng-container>

  <ng-template #notFound>
    <section class="bil-card det-not-found">
      <p>No encontramos esta factura.</p>
      <a routerLink="/dashboard/billing" class="rsv-btn rsv-btn--outline">Volver a Facturación</a>
    </section>
  </ng-template>
  `
})
export class InvoiceDetailComponent {

  readonly annulReasons = ['Datos del adquiriente incorrectos', 'La factura debía salir a nombre de la empresa', 'Error en los valores o conceptos', 'Servicio no prestado / devolución', 'Otro'];
  readonly paymentMethods: PaymentMethod[] = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Tarjeta'];
  readonly money = fmtMoney;
  readonly dateTime = fmtDateTime;
  readonly dianBadge = DIAN_BADGE;
  readonly net = lineNet;
  readonly tax = taxLabel;

  inv?: Invoice;
  panel: Panel = null;

  mail = { to: '', cc: '', subject: '', body: '' };
  mailPreview = false;
  sendState: SendState = 'draft';
  sendError = '';
  wa = { phone: '', message: '' };

  annulOpen = false;
  annulReason = '';
  payForm?: { amount: number; method: PaymentMethod; receipt: string };
  payError = '';
  dian?: { accepted: boolean; cufe: string; reason: string };
  dianError = '';
  busy = false;

  constructor(
    private svc: InvoiceService,
    private config: BillingConfigService,
    private reservations: ReservationService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    const id = route.snapshot.paramMap.get('id')!;
    const wantsEmail = route.snapshot.queryParamMap.get('enviar') === 'correo';
    this.svc.getAll().subscribe(() => {
      const first = !this.inv;
      this.inv = this.svc.getById(id);
      if (this.inv?.dianStatus === 'Borrador') { this.router.navigate(['/dashboard/billing/new'], { queryParams: { borrador: id } }); return; }
      if (first && this.inv) {
        this.resetMessages();
        if (wantsEmail && this.canSend) this.panel = 'Correo';
      }
    });
  }

  // ── Derivados ──
  get t() { return computeTotals(this.inv!.lines); }
  get includedLines() { return this.inv!.lines.filter(l => l.included); }
  get state(): InvoiceState { return this.svc.state(this.inv!); }
  get paid(): number { return this.svc.paid(this.inv!); }
  get balance(): number { return this.inv!.annulment ? 0 : this.svc.balance(this.inv!); }
  get accepted(): boolean { return this.inv!.dianStatus === 'Aceptada' && !this.inv!.annulment; }
  get canShare(): boolean { return this.config.can('Descargar y enviar'); }
  get canSend(): boolean { return this.canShare && this.accepted; }
  get canAnnul(): boolean { return this.config.can('Anular con nota crédito') && this.accepted; }
  get canValidate(): boolean { return this.config.can('Validar datos fiscales'); }
  get history() { return [...this.inv!.events].reverse(); }
  get issuerName(): string { return this.config.get().issuer.name; }
  get providerName(): string { return this.config.get().provider.name; }
  get phoneDigits(): string { const d = this.wa.phone.replace(/\D/g, ''); return d.length >= 10 ? d : ''; }

  get stayLabel(): string {
    const r = this.reservations.getById(this.inv!.reservationId);
    return r ? ` · ${lodgingLabel(r)} · ${dayMonth(r.checkIn)} → ${fmtDate(r.checkOut)}` : '';
  }

  get statusIconPath(): string {
    if (this.inv!.annulment || this.inv!.dianStatus === 'Rechazada') return 'M18 6L6 18M6 6l12 12';
    return this.inv!.dianStatus === 'Aceptada' ? 'M20 6L9 17l-5-5' : 'M12 7v5l3 2';
  }

  toneOf(s: Invoice['dianStatus']): string {
    if (this.inv!.annulment) return 'muted';
    return s === 'Aceptada' ? 'ok' : s === 'Rechazada' ? 'danger' : 'warn';
  }

  emailValid(e: string): boolean { return EMAIL_RE.test(e.trim()); }

  // ── Plantillas de mensaje (Facturación › Configuración) ──
  private fill(template: string): string {
    const inv = this.inv!;
    const r = this.reservations.getById(inv.reservationId);
    const fechas = r ? `${dayMonth(r.checkIn)} al ${fmtDate(r.checkOut)}` : '';
    return template
      .replace(/\{número\}/g, inv.number).replace(/\{huésped\}/g, inv.buyer.name.split(' ')[0])
      .replace(/\{fechas\}/g, fechas).replace(/\{total\}/g, fmtMoney(this.t.total)).replace(/\{hospedaje\}/g, this.issuerName);
  }

  private resetMessages(): void {
    const c = this.config.get();
    const subject = c.emailSubject || 'Factura electrónica {número} · {hospedaje}';
    const body = c.emailBody || 'Hola {huésped}, adjuntamos la factura electrónica {número} de tu estadía del {fechas}, por {total}.';
    this.mail = { to: this.inv!.buyer.email, cc: '', subject: this.fill(subject), body: this.fill(body) };
    this.wa = { phone: this.inv!.buyer.phone, message: `${this.fill(body)}${this.inv!.cufe ? ' CUFE: ' + this.inv!.cufe : ''}` };
    this.sendState = 'draft';
  }

  openPanel(p: Panel): void {
    this.panel = this.panel === p ? null : p;
    this.mailPreview = false;
  }

  // ── Acciones ──
  downloadPdf(): void {
    this.svc.logDownload(this.inv!.id, 'PDF');
    this.router.navigate(['/facturas', this.inv!.id, 'imprimir'], { queryParams: { pdf: 1 } });
  }

  print(): void {
    this.router.navigate(['/facturas', this.inv!.id, 'imprimir']);
  }

  /** Envío real: lo hace el servidor con la cuenta de correo de SOGO. */
  async sendEmail(): Promise<void> {
    const bad = [this.mail.to, this.mail.cc].filter(Boolean).find(e => !this.emailValid(e));
    if (!this.mail.to.trim() || bad !== undefined) {
      this.sendState = 'error';
      this.sendError = `El correo "${bad ?? ''}" no tiene un formato válido. Corrígelo y reintenta.`;
      return;
    }
    this.sendState = 'sending';
    try {
      await this.svc.sendEmail(this.inv!.id, this.mail);
      this.sendState = 'sent';
    } catch (e) {
      this.sendState = 'error';
      this.sendError = serverMessage(e);
    }
  }

  async sendWhatsApp(): Promise<void> {
    window.open(`https://wa.me/${this.phoneDigits}?text=${encodeURIComponent(this.wa.message)}`, '_blank');
    await this.svc.logSent(this.inv!.id, 'WhatsApp', this.wa.phone).catch(() => undefined);
  }

  /** CUFE limpio (sin espacios ni enlace) y el motivo si no sirve. */
  get cufeCheck(): { value: string; error: string } { return checkCufe(this.dian?.cufe ?? ''); }
  get cufeValid(): boolean { const c = this.cufeCheck; return c.value.length === 96 && !c.error; }
  readonly lookup = dianLookupUrl;

  openDian(): void {
    this.dianError = '';
    this.dian = { accepted: true, cufe: '', reason: '' };
  }

  async saveDian(): Promise<void> {
    const d = this.dian!;
    const cufe = this.cufeCheck.value;
    if (d.accepted && !this.cufeValid) { this.dianError = this.cufeCheck.error || 'Pega el CUFE de 96 caracteres que asignó la DIAN.'; return; }
    if (!d.accepted && d.reason.trim().length < 5) { this.dianError = 'Escribe el motivo del rechazo.'; return; }
    this.busy = true;
    try {
      await this.svc.registerDianResponse(this.inv!.id, d.accepted ? { accepted: true, cufe } : { accepted: false, reason: d.reason.trim() });
      toast.success(d.accepted ? 'Factura aceptada por la DIAN' : 'Rechazo registrado', this.inv!.number);
      this.dian = undefined;
      this.resetMessages();
    } catch (e) {
      this.dianError = serverMessage(e);
    } finally {
      this.busy = false;
    }
  }

  openAnnul(): void {
    this.annulReason = '';
    this.annulOpen = true;
  }

  async annul(): Promise<void> {
    if (!this.annulReason || this.busy) return;
    this.busy = true;
    try {
      await this.svc.annul(this.inv!.id, this.annulReason);
      this.annulOpen = false;
      this.panel = null;
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.busy = false;
    }
  }

  openPayment(): void {
    this.payError = '';
    this.payForm = { amount: this.balance, method: 'Efectivo', receipt: '' };
  }

  async savePayment(): Promise<void> {
    const f = this.payForm!;
    const amount = +f.amount || 0;
    if (amount <= 0 || amount > this.balance) { this.payError = `El valor debe estar entre 1 y ${fmtMoney(this.balance)}.`; return; }
    try {
      await this.svc.registerPayment(this.inv!.id, amount, f.method, f.receipt.trim());
      this.payForm = undefined;
    } catch (e) {
      this.payError = serverMessage(e);
    }
  }
}
