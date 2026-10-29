import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import {
  Invoice, InvoiceLine, InvoiceState, Buyer, BuyerDocType, invoiceTotal, isValidInvoice,
} from './invoice.model';
import { BillingConfigService } from './billing-config.service';
import { ChargeService } from './charge.service';
import { ReservationService } from '../reservations/reservation.service';
import { UsersService } from '../users/users.service';
import { Reservation, PaymentMethod, lodgingLabel, paidAmount, isInHouse } from '../reservations/reservation.model';
import { isoDate } from '../shared/date-utils';
import { parsePlace, isColombia } from '../shared/colombia';
import { API_URL } from '../api';

const DOC_TYPE_CODE: Record<string, BuyerDocType> = {
  'Cédula de Ciudadanía': 'CC', 'Cédula de Extranjería': 'CE', 'Pasaporte': 'PA', 'Tarjeta de Identidad': 'TI', 'NIT': 'NIT',
};

/** "22–25/09" a partir de dos fechas YYYY-MM-DD. */
function rangeLabel(from: string, to: string): string {
  const [, fm, fd] = from.split('-');
  const [, tm, td] = to.split('-');
  if (from === to) return `${fd}/${fm}`;
  return fm === tm ? `${fd}–${td}/${tm}` : `${fd}/${fm}–${td}/${tm}`;
}

/** Lo que el servidor recibe de una factura (los eventos, números y estados los pone él). */
const body = (inv: Invoice) => ({
  id: inv.id, reservationId: inv.reservationId, billTo: inv.billTo, buyer: inv.buyer, lines: inv.lines,
  paymentTerm: inv.paymentTerm, dueDate: inv.dueDate, fiscalValidatedAt: inv.fiscalValidatedAt,
});

/**
 * Facturas electrónicas guardadas en la base de datos (tablas `facturas`, `factura_lineas`,
 * `factura_eventos`). El servidor numera con la resolución, guarda el historial y valida.
 * La validación ante la DIAN la hace el proveedor tecnológico: SOGO registra su respuesta
 * (CUFE o motivo de rechazo); no la inventa.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceService {

  private readonly base = `${API_URL}/facturacion/facturas`;
  private data: Invoice[] = [];
  private invoices$ = new BehaviorSubject<Invoice[]>([]);
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(
    private http: HttpClient,
    private reservations: ReservationService,
    private charges: ChargeService,
    private config: BillingConfigService,
    private users: UsersService,
  ) {
    // El estado de pago depende de los pagos de la reserva: si cambian, se vuelve a emitir la lista
    this.reservations.getAll().subscribe(() => this.invoices$.next(this.data));
  }

  /** Primera carga de la sesión (el guard del dashboard la espera). Sin permiso de consulta queda vacío. */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token ? this.reload().catch(e => { if (e?.status !== 403) console.error('No se pudieron cargar las facturas', e); }) : Promise.resolve();
    }
    return this.loading;
  }

  async reload(): Promise<void> {
    this.data = await firstValueFrom(this.http.get<Invoice[]>(this.base));
    this.invoices$.next(this.data);
  }

  getAll(): Observable<Invoice[]> { return this.invoices$.asObservable(); }
  getSnapshot(): Invoice[] { return this.data; }
  getById(id: string): Invoice | undefined { return this.data.find(i => i.id === id); }

  // ── Borrador a partir de una reserva ─────────────────

  /** Adquiriente precargado: los datos de la última factura del mismo documento, o los del huésped. */
  buyerFor(r: Reservation): Buyer {
    const previous = this.data.find(i => i.billTo === 'Huésped' && i.buyer.docNumber === r.docNumber);
    if (previous) return { ...previous.buyer };
    // Lugar de residencia de la reserva, ya ajustado al catálogo DANE (también registros viejos sin país)
    const place = parsePlace(r.city);
    return {
      personType: 'Natural', docType: DOC_TYPE_CODE[r.docType] ?? 'CC', docNumber: r.docNumber, dv: '',
      name: r.guestName, fiscalResponsibility: 'R-99-PN · No aplica – Otros',
      email: r.email, phone: r.phone, country: place.country, department: place.department, city: place.town, address: '',
    };
  }

  emptyCompanyBuyer(): Buyer {
    return {
      personType: 'Jurídica', docType: 'NIT', docNumber: '', dv: '', name: '', fiscalResponsibility: 'R-99-PN · No aplica – Otros',
      email: '', phone: '', country: 'Colombia', department: '', city: '', address: '',
    };
  }

  /** Líneas facturables: el alojamiento de la reserva + los consumos cargados a la estadía y aún sin facturar. */
  buildLines(r: Reservation): InvoiceLine[] {
    const foreign = r.docType === 'Pasaporte' && !isColombia(parsePlace(r.city).country);
    const isDayPass = r.nights === 0;
    const lodgingCategory = isDayPass ? 'Eventos y pasadías' : 'Alojamiento';
    const lodgingTax = this.config.taxFor(lodgingCategory, foreign);
    const lodging: InvoiceLine = {
      id: `l-${r.id}`, category: lodgingCategory,
      description: `${isDayPass ? 'Evento / pasadía' : 'Alojamiento'} · ${lodgingLabel(r)}`,
      detail: `Reserva ${r.code}`, dateLabel: rangeLabel(r.checkIn, r.checkOut),
      quantity: isDayPass ? 1 : r.nights, unitLabel: isDayPass ? 'día' : 'noches',
      unitValue: Math.round(r.lodgingAmount / (isDayPass ? 1 : r.nights)),
      discountPct: 0, discountLabel: '', taxKind: lodgingTax.kind, taxRate: lodgingTax.rate, included: true,
    };
    const consumos = this.charges.forReservation(r.id).filter(c => !this.invoiceForCharge(c.id)).map<InvoiceLine>(c => {
      const tax = this.config.taxFor(c.category);
      return {
        id: `c-${c.id}`, category: c.category, description: c.description, detail: c.detail,
        dateLabel: rangeLabel(c.date, c.date), quantity: c.quantity, unitLabel: '', unitValue: c.unitValue,
        discountPct: 0, discountLabel: '', taxKind: tax.kind, taxRate: tax.rate, included: true, chargeId: c.id,
      };
    });
    return [lodging, ...consumos];
  }

  newDraft(r: Reservation, billTo: Invoice['billTo'] = 'Huésped'): Invoice {
    return {
      id: '', number: '', reservationId: r.id, reservationCode: r.code, billTo,
      buyer: billTo === 'Empresa' ? this.emptyCompanyBuyer() : this.buyerFor(r),
      lines: this.buildLines(r), paymentTerm: 'Contado', dueDate: isoDate(0),
      dianStatus: 'Borrador', events: [],
    };
  }

  async saveDraft(inv: Invoice): Promise<Invoice> {
    const saved = await firstValueFrom(this.http.post<Invoice>(this.base, body(inv)));
    this.upsert(saved);
    this.users.addLog('Factura en borrador', `${inv.reservationCode} · ${inv.buyer.name}`);
    return saved;
  }

  async deleteDraft(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/${id}`));
    this.data = this.data.filter(i => i.id !== id);
    this.invoices$.next(this.data);
  }

  // ── Numeración (vista previa; el número definitivo lo asigna el servidor al emitir) ──

  private lastNumber(): number {
    const { prefix, from } = this.config.get().resolution;
    const used = this.data.map(i => i.number).filter(n => n.startsWith(prefix + '-')).map(n => Number(n.split('-')[1]) || 0);
    return Math.max(from - 1, ...used);
  }

  nextNumber(): string { return `${this.config.get().resolution.prefix}-${this.lastNumber() + 1}`; }

  rangeUsage(): { used: number; left: number } {
    const { from, to } = this.config.get().resolution;
    const used = Math.max(0, this.lastNumber() - from + 1);
    return { used, left: Math.max(0, to - from + 1 - used) };
  }

  /** Factura válida de la estadía que incluye un consumo dado. */
  invoiceForCharge(chargeId: string): Invoice | undefined {
    return this.data.find(i => isValidInvoice(i) && i.lines.some(l => l.included && l.chargeId === chargeId));
  }

  // ── Emisión y respuesta de la DIAN ───────────────────

  /** El servidor valida, asigna el número de la resolución y la deja pendiente de validación DIAN. */
  async issue(draft: Invoice): Promise<Invoice> {
    const inv = await firstValueFrom(this.http.post<Invoice>(`${this.base}/${draft.id || 0}/emitir`, body(draft)));
    this.upsert(inv);
    this.users.addLog('Emisión de factura', `${inv.number} · ${inv.reservationCode} · ${inv.buyer.name}`);
    return inv;
  }

  /** Respuesta de la DIAN informada por el proveedor: aceptada (CUFE) o rechazada (motivo). */
  async registerDianResponse(id: string, r: { accepted: true; cufe: string; note?: string } | { accepted: false; reason: string }): Promise<void> {
    const inv = await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/respuesta-dian`, r));
    this.upsert(inv);
    this.users.addLog(r.accepted ? 'Factura aceptada por la DIAN' : 'Factura rechazada por la DIAN', `${inv.number}${r.accepted ? '' : ' · ' + r.reason}`);
  }

  /** Corrige el adquiriente de una factura rechazada y la deja otra vez en validación (conserva su número). */
  async resend(id: string, buyer: Buyer): Promise<void> {
    this.upsert(await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/corregir`, { buyer })));
  }

  // ── Después de emitir ────────────────────────────────

  /** Envía la factura por correo desde el servidor (cuenta de correo de SOGO). */
  async sendEmail(id: string, mail: { to: string; cc: string; subject: string; body: string }): Promise<void> {
    this.upsert(await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/correo`, mail)));
  }

  /** Deja constancia de un envío hecho fuera de SOGO (WhatsApp). */
  async logSent(id: string, channel: 'Correo' | 'WhatsApp', to: string): Promise<void> {
    this.upsert(await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/envio`, { channel, to })));
  }

  logDownload(id: string, what: 'PDF' | 'XML'): void {
    firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/descarga`, { what })).then(inv => this.upsert(inv)).catch(() => undefined);
  }

  async annul(id: string, reason: string): Promise<void> {
    const inv = await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/anular`, { reason }));
    this.upsert(inv);
    this.users.addLog('Anulación de factura', `${inv.number} · nota crédito ${inv.annulment?.creditNote} · ${reason}`);
  }

  /** Registra un pago de la factura en la cuenta de la reserva (única fuente de los pagos). */
  async registerPayment(id: string, amount: number, method: PaymentMethod, receipt: string): Promise<void> {
    const inv = this.getById(id);
    if (!inv) return;
    // Primero el pago en la reserva (de ahí sale el saldo); si falla, no se anota en la factura
    await this.reservations.addPayment(inv.reservationId, { amount, method, receipt });
    const detail = `${method} · ${new Intl.NumberFormat('es-CO').format(amount)}${receipt ? ' · ' + receipt : ''}`;
    this.upsert(await firstValueFrom(this.http.post<Invoice>(`${this.base}/${id}/pago`, { detail })));
  }

  // ── Estado derivado ──────────────────────────────────

  total(inv: Invoice): number { return invoiceTotal(inv); }

  /** Lo pagado: los pagos de la reserva, hasta el total de la factura. */
  paid(inv: Invoice): number {
    const r = this.reservations.getById(inv.reservationId);
    return r ? Math.min(this.total(inv), paidAmount(r)) : 0;
  }

  balance(inv: Invoice): number { return Math.max(0, this.total(inv) - this.paid(inv)); }

  /** Método del último pago recibido en la reserva de la factura. */
  lastPaymentMethod(inv: Invoice): PaymentMethod | undefined {
    return this.reservations.getById(inv.reservationId)?.payments.slice(-1)[0]?.method;
  }

  state(inv: Invoice): InvoiceState {
    if (inv.dianStatus === 'Borrador') return 'Borrador';
    if (inv.annulment) return 'Anulada';
    if (inv.dianStatus === 'En validación') return 'Emitida';
    if (this.balance(inv) === 0) return 'Pagada';
    // Rechazada por la DIAN: aún no es válida, así que no "vence"; queda pendiente de corrección
    if (inv.dianStatus === 'Rechazada') return 'Pendiente';
    return inv.dueDate < isoDate(0) ? 'Vencida' : 'Pendiente';
  }

  /** Estadías cerradas (o que salen hoy) que todavía no tienen una factura válida. */
  pendingCheckouts(): Reservation[] {
    const today = isoDate(0);
    const invoiced = new Set(this.data.filter(isValidInvoice).map(i => i.reservationId));
    return this.reservations.getSnapshot().filter(r =>
      !invoiced.has(r.id) && (r.status === 'Finalizada' || (isInHouse(r) && r.checkOut <= today)));
  }

  /** Resumen para Inicio y notificaciones. */
  getStats() {
    const valid = this.data.filter(isValidInvoice);
    const states = valid.map(i => this.state(i));
    return {
      total: valid.length,
      paid: states.filter(s => s === 'Pagada').length,
      pending: states.filter(s => s !== 'Pagada').length,
      annulled: this.data.filter(i => i.annulment).length,
      rejected: valid.filter(i => i.dianStatus === 'Rechazada').length,
      income: valid.reduce((s, i) => s + this.paid(i), 0),
      pendingAmount: valid.reduce((s, i) => s + this.balance(i), 0),
    };
  }

  /** Total facturado (válidas) por fecha de emisión. */
  getIncomeByDate(): { date: string; amount: number }[] {
    const byDate = new Map<string, number>();
    this.data.filter(isValidInvoice).forEach(i => {
      const d = i.issuedAt!.slice(0, 10);
      byDate.set(d, (byDate.get(d) ?? 0) + this.total(i));
    });
    return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
  }

  // ── Interno ──────────────────────────────────────────

  private upsert(inv: Invoice): void {
    this.data = this.data.some(i => i.id === inv.id) ? this.data.map(i => i.id === inv.id ? inv : i) : [inv, ...this.data];
    this.invoices$.next(this.data);
  }
}
