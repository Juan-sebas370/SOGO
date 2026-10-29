import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Invoice, computeTotals, lineDiscount, lineNet, taxLabel } from '../invoice.model';
import { InvoiceService } from '../invoice.service';
import { BillingConfigService } from '../billing-config.service';
import { ReservationService } from '../../reservations/reservation.service';
import { lodgingLabel, totalGuests, lastPayment } from '../../reservations/reservation.model';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { amountInWords } from '../number-words';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { dianLookupUrl } from '../invoice.model';
import { qrSvg } from '../qr';

/**
 * Representación gráfica de la factura (lo que recibe el huésped).
 * Se usa en la vista previa antes de emitir y en la impresión / PDF.
 */
@Component({
  selector: 'app-invoice-sheet',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./invoice-sheet.component.css'],
  template: `
  <article class="sheet" [class.sheet--preview]="preview">
    <span class="sheet-watermark" *ngIf="preview" aria-hidden="true">VISTA PREVIA</span>

    <header class="sheet-head">
      <div class="sheet-issuer">
        <span class="sheet-logo"><img [src]="issuer.logo" [alt]="'Logo de ' + issuer.name"></span>
        <div>
          <strong>{{ issuer.name }}</strong>
          <span *ngIf="issuer.legalName && issuer.legalName !== issuer.name">{{ issuer.legalName }}</span>
          <span><span [class.sheet-missing]="!issuer.nit">NIT {{ issuer.nit || 'pendiente' }}</span>{{ issuer.establishment ? ' · ' + issuer.establishment : '' }}{{ issuer.rnt ? ' · RNT ' + issuer.rnt : '' }}</span>
          <span>{{ join(issuer.address, issuer.city) }}</span>
          <span>{{ join(issuer.phone, issuer.email) }}</span>
        </div>
      </div>
      <div class="sheet-number">
        <span class="sheet-kind">Factura electrónica de venta</span>
        <strong>{{ invoice.number || numberPreview }}</strong>
        <span>Emisión: {{ issued }}</span>
        <span>Vencimiento: {{ date(invoice.paymentTerm === 'Contado' ? issuedDay : invoice.dueDate) }} · {{ invoice.paymentTerm }}</span>
      </div>
    </header>

    <p class="sheet-resolution" *ngIf="resolution.number; else noResolution">
      Autorización de numeración DIAN n.º {{ resolution.number }} · Prefijo {{ resolution.prefix }} ·
      Rango {{ resolution.from }} a {{ resolution.to }}{{ resolution.validFrom && resolution.validTo ? ' · Vigencia ' + date(resolution.validFrom!) + ' – ' + date(resolution.validTo!) : '' }}
    </p>
    <ng-template #noResolution><p class="sheet-resolution sheet-missing">Resolución de facturación DIAN pendiente de configurar (Facturación › Impuestos y DIAN).</p></ng-template>

    <div class="sheet-boxes">
      <section>
        <h4>Adquiriente</h4>
        <strong>{{ invoice.buyer.name || '—' }}</strong>
        <span>{{ invoice.buyer.docType }} {{ invoice.buyer.docNumber }}{{ invoice.buyer.dv ? '-' + invoice.buyer.dv : '' }} · Persona {{ invoice.buyer.personType.toLowerCase() }}</span>
        <span>{{ invoice.buyer.fiscalResponsibility }}</span>
        <span>{{ join(invoice.buyer.address || '[Dirección]', place) }}</span>
        <span>{{ invoice.buyer.email }}{{ invoice.buyer.phone ? ' · ' + invoice.buyer.phone : '' }}</span>
      </section>
      <section *ngIf="reservation as r">
        <h4>Estadía</h4>
        <strong>Reserva {{ r.code }}</strong>
        <span>{{ lodging(r) }}{{ r.rooms.length && r.lodgingType !== 'Habitación' ? ' · habitaciones ' + r.rooms.join(', ') : '' }}</span>
        <span>Entrada {{ date(r.checkIn) }} · Salida {{ date(r.checkOut) }} · {{ r.nights ? r.nights + ' noche' + (r.nights === 1 ? '' : 's') : 'Pasadía' }}</span>
        <span>{{ guests(r) }} huéspedes · {{ r.reservationType }}</span>
      </section>
    </div>

    <table class="sheet-lines">
      <thead>
        <tr><th>#</th><th>Descripción</th><th class="num">Cant.</th><th class="num">V. unitario</th><th class="num">Descuento</th><th>Impuesto</th><th class="num">Valor</th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let l of lines; let i = index">
          <td>{{ i + 1 }}</td>
          <td><strong>{{ l.description }}</strong><small>{{ l.dateLabel }}</small></td>
          <td class="num">{{ l.quantity }}</td>
          <td class="num">{{ money(l.unitValue) }}</td>
          <td class="num">{{ l.discountPct ? money(discount(l)) : '—' }}</td>
          <td>{{ tax(l) }}</td>
          <td class="num">{{ money(net(l)) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="sheet-bottom">
      <div class="sheet-notes">
        <section>
          <h4>Valor en letras</h4>
          <p>{{ words }}</p>
        </section>
        <section>
          <h4>Forma de pago</h4>
          <p>{{ invoice.paymentTerm }}{{ invoice.paymentTerm === 'Crédito' ? ' · vence el ' + date(invoice.dueDate) : '' }}{{ advance ? ' · Anticipo ' + money(advance) + (advanceInfo ? ' (' + advanceInfo + ')' : '') : '' }}</p>
          <p>Saldo por pagar: {{ money(balance) }}</p>
        </section>
      </div>
      <dl class="sheet-totals">
        <div><dt>Subtotal</dt><dd>{{ money(t.subtotal) }}</dd></div>
        <div><dt>Descuentos</dt><dd>{{ t.discounts ? '- ' + money(t.discounts) : money(0) }}</dd></div>
        <div><dt>Base gravable</dt><dd>{{ money(t.base) }}</dd></div>
        <div *ngFor="let g of t.taxes"><dt>{{ g.label }}</dt><dd>{{ money(g.amount) }}</dd></div>
        <div class="sheet-total"><dt>Total</dt><dd>{{ money(t.total) }}</dd></div>
      </dl>
    </div>

    <footer class="sheet-foot">
      <a *ngIf="qr; else noQr" class="sheet-qr sheet-qr--real" [href]="lookupUrl" target="_blank" rel="noopener" title="Consultar la factura en la DIAN" [innerHTML]="qr"></a>
      <ng-template #noQr><span class="sheet-qr">Código QR cuando la DIAN la acepte</span></ng-template>
      <div>
        <p><strong>CUFE:</strong> <code>{{ invoice.cufe || 'Se asigna cuando la DIAN valida la factura' }}</code></p>
        <p>Representación gráfica de la factura electrónica de venta.</p>
        <p *ngIf="providerName">Proveedor tecnológico: {{ providerName }}</p>
        <p *ngIf="invoice.annulment" class="sheet-annulled">Anulada con nota crédito {{ invoice.annulment.creditNote }} · {{ invoice.annulment.reason }}</p>
      </div>
    </footer>
  </article>
  `
})
export class InvoiceSheetComponent {
  @Input({ required: true }) invoice!: Invoice;
  /** Marca de agua "VISTA PREVIA" (antes de emitir o borrador). */
  @Input() preview = false;

  readonly date = fmtDate;
  readonly money = fmtMoney;
  readonly lodging = lodgingLabel;
  readonly guests = totalGuests;
  readonly net = lineNet;
  readonly discount = lineDiscount;
  readonly tax = taxLabel;

  constructor(private invoices: InvoiceService, private config: BillingConfigService, private reservations: ReservationService, private sanitizer: DomSanitizer) {}

  /** QR con la dirección de consulta de la DIAN (la exige la representación gráfica); solo cuando ya hay CUFE. */
  private qrFor = '';
  private qrCache: SafeHtml | null = null;
  get lookupUrl(): string { return dianLookupUrl(this.invoice.cufe ?? ''); }
  get qr(): SafeHtml | null {
    const cufe = this.invoice.cufe ?? '';
    if (!cufe) return null;
    // El SVG sale de qrSvg (solo rectángulos) con el CUFE validado: se puede insertar tal cual
    if (this.qrFor !== cufe) { this.qrFor = cufe; this.qrCache = this.sanitizer.bypassSecurityTrustHtml(qrSvg(this.lookupUrl, 110)); }
    return this.qrCache;
  }
  get place(): string { const b = this.invoice.buyer; return [b.city, b.department, b.country && b.country !== 'Colombia' ? b.country : ''].filter(Boolean).join(', '); }

  get issuer() { return this.config.get().issuer; }
  get resolution() { return this.config.get().resolution; }
  get providerName() { return this.config.get().provider.name; }
  get numberPreview() { return this.invoices.nextNumber(); }
  join(...parts: string[]): string { return parts.filter(Boolean).join(' · '); }
  get reservation() { return this.reservations.getById(this.invoice.reservationId); }
  get lines() { return this.invoice.lines.filter(l => l.included); }
  get t() { return computeTotals(this.invoice.lines); }
  get words() { return amountInWords(this.t.total); }
  get issuedDay() { return (this.invoice.issuedAt ?? new Date().toISOString()).slice(0, 10); }
  get issued() { return this.invoice.issuedAt ? fmtDateTime(this.invoice.issuedAt) : 'al emitir'; }

  /** Anticipo = lo pagado en la reserva; para un borrador aún no hay factura con la cual cruzarlo. */
  get advance(): number {
    const r = this.reservation;
    return r ? Math.min(this.t.total, r.payments.reduce((s, p) => s + p.amount, 0)) : 0;
  }
  get advanceInfo(): string {
    const p = this.reservation ? lastPayment(this.reservation) : undefined;
    return p ? `${p.method.toLowerCase()}, ${fmtDate(p.date)}` : '';
  }
  get balance(): number { return Math.max(0, this.t.total - this.advance); }
}
