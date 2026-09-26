import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Invoice, InvoiceLine, InvoiceEvent, InvoiceState, Buyer, BuyerDocType,
  computeTotals, invoiceTotal, isValidInvoice, validateBuyer, nitCheckDigit
} from './invoice.model';
import { BillingConfigService } from './billing-config.service';
import { ChargeService } from './charge.service';
import { ReservationService } from '../reservations/reservation.service';
import { UsersService } from '../users/users.service';
import { Reservation, PaymentMethod, lodgingLabel, paidAmount, isInHouse } from '../reservations/reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';

const DOC_TYPE_CODE: Record<string, BuyerDocType> = {
  'Cédula de Ciudadanía': 'CC', 'Cédula de Extranjería': 'CE', 'Pasaporte': 'PA', 'Tarjeta de Identidad': 'TI', 'NIT': 'NIT',
};

const user = () => localStorage.getItem('sogo_role') || 'Usuario';
const now = () => `${isoDateTime()}:${String(new Date().getSeconds()).padStart(2, '0')}`;
const ev = (label: string, detail = '', tone: InvoiceEvent['tone'] = 'info', at = now()): InvoiceEvent => ({ at, label, detail, tone });

/** "22–25/09" a partir de dos fechas YYYY-MM-DD. */
function rangeLabel(from: string, to: string): string {
  const [, fm, fd] = from.split('-');
  const [, tm, td] = to.split('-');
  if (from === to) return `${fd}/${fm}`;
  return fm === tm ? `${fd}–${td}/${tm}` : `${fd}/${fm}–${td}/${tm}`;
}

/** CUFE simulado (en producción lo devuelve el proveedor tecnológico). */
function fakeCufe(): string {
  return Array.from({ length: 96 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {

  private data: Invoice[] = [];
  private invoices$ = new BehaviorSubject<Invoice[]>([]);

  constructor(
    private reservations: ReservationService,
    private charges: ChargeService,
    private config: BillingConfigService,
    private audit: UsersService,
  ) {
    this.data = this.seed();
    // El estado de pago depende de los pagos de la reserva: si cambian, se re-emite
    this.reservations.getAll().subscribe(() => this.invoices$.next(this.data));
  }

  getAll(): Observable<Invoice[]> { return this.invoices$.asObservable(); }
  getSnapshot(): Invoice[] { return this.data; }
  getById(id: string): Invoice | undefined { return this.data.find(i => i.id === id); }

  // ── Borrador a partir de una reserva ─────────────────

  /** Adquiriente precargado: los datos de la última factura del mismo documento, o los del huésped. */
  buyerFor(r: Reservation): Buyer {
    const previous = [...this.data].reverse().find(i => i.billTo === 'Huésped' && i.buyer.docNumber === r.docNumber);
    if (previous) return { ...previous.buyer };
    const [country, rest = ''] = r.city.split(' - ');
    const [city = '', department = ''] = rest.split(',').map(s => s.trim());
    return {
      personType: 'Natural', docType: DOC_TYPE_CODE[r.docType] ?? 'CC', docNumber: r.docNumber, dv: '',
      name: r.guestName, fiscalResponsibility: 'R-99-PN · No aplica – Otros',
      email: r.email, phone: r.phone, country: country || 'Colombia', department, city, address: '',
    };
  }

  emptyCompanyBuyer(): Buyer {
    return {
      personType: 'Jurídica', docType: 'NIT', docNumber: '', dv: '', name: '', fiscalResponsibility: 'R-99-PN · No aplica – Otros',
      email: '', phone: '', country: 'Colombia', department: '', city: '', address: '',
    };
  }

  /** Líneas facturables: el alojamiento de la reserva + los consumos cargados a la estadía. */
  buildLines(r: Reservation): InvoiceLine[] {
    const foreign = r.docType === 'Pasaporte' && !r.city.startsWith('Colombia');
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
    const consumos = this.charges.forReservation(r.id).map<InvoiceLine>(c => {
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

  saveDraft(inv: Invoice): Invoice {
    const draft: Invoice = { ...inv, id: inv.id || `i${Date.now()}`, dianStatus: 'Borrador' };
    this.upsert(draft);
    return draft;
  }

  deleteDraft(id: string): void {
    this.data = this.data.filter(i => !(i.id === id && i.dianStatus === 'Borrador'));
    this.invoices$.next(this.data);
  }

  // ── Numeración ───────────────────────────────────────

  private lastNumber(): number {
    const { prefix, from } = this.config.get().resolution;
    const used = this.data.filter(i => i.number.startsWith(prefix + '-')).map(i => Number(i.number.split('-')[1]));
    return Math.max(from - 1, ...used);
  }

  nextNumber(): string {
    const { prefix } = this.config.get().resolution;
    return `${prefix}-${this.lastNumber() + 1}`;
  }

  rangeUsage(): { used: number; left: number } {
    const { from, to } = this.config.get().resolution;
    const used = this.lastNumber() - from + 1;
    return { used, left: to - from + 1 - used };
  }

  // ── Emisión y validación con la DIAN ─────────────────

  issue(draft: Invoice): Invoice {
    const issuedAt = now();
    const inv: Invoice = {
      ...draft,
      id: draft.id || `i${Date.now()}`,
      number: this.nextNumber(),
      issuedAt,
      dueDate: draft.paymentTerm === 'Contado' ? issuedAt.slice(0, 10) : draft.dueDate,
      dianStatus: 'En validación',
      events: [
        ...draft.events,
        ev('Factura emitida', user()),
        ev('Enviada al proveedor tecnológico'),
      ],
    };
    this.upsert(inv);
    this.audit.addLog('Emisión de factura', `${inv.number} · ${inv.reservationCode} · ${inv.buyer.name}`);
    if (this.config.get().automation.sendOnIssue) this.transmit(inv.id);
    return inv;
  }

  /** Corrige el adquiriente de una factura rechazada y la reenvía (conserva su número). */
  resend(id: string, buyer: Buyer): void {
    this.patch(id, inv => ({
      ...inv, buyer, dianStatus: 'En validación', rejectionReason: undefined,
      events: [...inv.events, ev('Datos fiscales corregidos', user()), ev('Reenviada al proveedor tecnológico')],
    }));
    this.transmit(id);
  }

  /** Consulta el estado de una factura que quedó en validación. */
  checkStatus(id: string): void { this.transmit(id); }

  /**
   * Envío al proveedor. Sin backend todavía se simula su respuesta: la DIAN
   * rechaza si los datos del adquiriente no son válidos y, si los acepta,
   * devuelve el CUFE. Aquí es donde el servidor llamará al proveedor real.
   */
  private transmit(id: string): void {
    setTimeout(() => {
      const inv = this.getById(id);
      if (!inv || inv.dianStatus !== 'En validación') return;
      const failed = validateBuyer(inv.buyer).find(c => !c.ok);
      if (failed) {
        const reason = failed.key === 'doc' ? 'número de identificación del adquiriente no válido' : `${failed.label.toLowerCase()}: ${failed.detail.toLowerCase()}`;
        this.patch(id, i => ({ ...i, dianStatus: 'Rechazada', rejectionReason: reason, events: [...i.events, ev('Rechazada por la DIAN', reason, 'danger')] }));
        return;
      }
      this.patch(id, i => ({
        ...i, dianStatus: 'Aceptada', cufe: fakeCufe(),
        events: [...i.events, ev('Aceptada por la DIAN', 'CUFE recibido', 'ok'), ev('Cuenta actualizada y asociada al check-out')],
      }));
      if (this.config.get().automation.emailOnAccept && inv.buyer.email) this.send(id, 'Correo', inv.buyer.email);
    }, 1400);
  }

  // ── Después de emitir ────────────────────────────────

  /** Registra el envío (correo o WhatsApp). El envío real lo hará el servidor. */
  send(id: string, channel: 'Correo' | 'WhatsApp', to: string): void {
    const at = now();
    this.patch(id, i => ({ ...i, sentVia: { channel, at, to }, events: [...i.events, ev(`Enviada por ${channel === 'Correo' ? 'correo' : 'WhatsApp'}`, to, 'info', at)] }));
  }

  logDownload(id: string, what: 'PDF' | 'XML'): void {
    this.patch(id, i => ({ ...i, events: [...i.events, ev(`${what} descargado`, user(), 'muted')] }));
  }

  annul(id: string, reason: string): void {
    const count = this.data.filter(i => i.annulment).length;
    const creditNote = `NC-${String(count + 1).padStart(4, '0')}`;
    const at = now();
    this.patch(id, i => ({
      ...i, annulment: { creditNote, reason, at },
      events: [...i.events, ev(`Anulada con nota crédito ${creditNote}`, `${reason} · ${user()}`, 'danger', at)],
    }));
    this.audit.addLog('Anulación de factura', `${this.getById(id)?.number} · nota crédito ${creditNote} · ${reason}`);
  }

  /** Registra un pago de la factura en la cuenta de la reserva (única fuente de los pagos). */
  registerPayment(id: string, amount: number, method: PaymentMethod, receipt: string): void {
    const inv = this.getById(id);
    if (!inv) return;
    this.reservations.addPayment(inv.reservationId, { amount, method, receipt });
    this.patch(id, i => ({ ...i, events: [...i.events, ev('Pago registrado', `${method} · ${new Intl.NumberFormat('es-CO').format(amount)}`, 'ok')] }));
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

  private patch(id: string, fn: (i: Invoice) => Invoice): void {
    this.data = this.data.map(i => i.id === id ? fn(i) : i);
    this.invoices$.next(this.data);
  }

  // ── Datos de demostración ────────────────────────────
  // Facturas de las estadías ya cerradas de ReservationService (fechas relativas a hoy).
  // Cubren todos los estados: pagada, anulada con nota crédito y reemitida a empresa,
  // vencida, rechazada por la DIAN y en validación. La pasadía de María José López
  // queda sin facturar ("Check-outs por facturar").
  private seed(): Invoice[] {
    const byId = (id: string) => this.reservations.getById(id)!;
    const at = (offset: number, time: string) => `${isoDate(offset)}T${time}`;
    const list: Invoice[] = [];
    let n = 1040;

    const make = (resId: string, offset: number, time: string, opts: {
      buyer?: Partial<Buyer>; billTo?: Invoice['billTo']; term?: Invoice['paymentTerm']; dueIn?: number;
      dian: Invoice['dianStatus']; reason?: string; sent?: 'Correo' | 'WhatsApp';
      settle?: PaymentMethod; annul?: { offset: number; reason: string };
    }): Invoice => {
      const r = byId(resId);
      const base = this.newDraft(r, opts.billTo ?? 'Huésped');
      const buyer: Buyer = { ...base.buyer, address: 'Cra 14 # 20-35', ...opts.buyer };
      const issuedAt = at(offset, time);
      const events: InvoiceEvent[] = [
        ev('Datos fiscales validados', 'Administrador', 'muted', at(offset, time.replace(/:\d\d$/, ':00'))),
        ev('Factura emitida', 'Administrador', 'info', issuedAt),
        ev('Enviada al proveedor tecnológico', '', 'info', issuedAt),
      ];
      if (opts.dian === 'Aceptada') events.push(ev('Aceptada por la DIAN', 'CUFE recibido', 'ok', issuedAt), ev('Cuenta actualizada y asociada al check-out', '', 'info', issuedAt));
      if (opts.dian === 'Rechazada') events.push(ev('Rechazada por la DIAN', opts.reason!, 'danger', issuedAt));
      const inv: Invoice = {
        ...base, id: `i${++n}`, number: `FE-${n}`, buyer,
        paymentTerm: opts.term ?? 'Contado', dueDate: isoDate(offset + (opts.dueIn ?? 0)),
        dianStatus: opts.dian, issuedAt, fiscalValidatedAt: issuedAt,
        cufe: opts.dian === 'Aceptada' ? fakeCufe() : undefined, rejectionReason: opts.reason, events,
      };
      if (opts.sent) {
        const sentAt = at(offset, time.replace(/^(\d\d):(\d\d)/, (_, h, m) => `${h}:${String(Math.min(59, +m + 2)).padStart(2, '0')}`));
        inv.sentVia = { channel: opts.sent, at: sentAt, to: opts.sent === 'Correo' ? buyer.email : buyer.phone };
        inv.events.push(ev(`Enviada por ${opts.sent === 'Correo' ? 'correo' : 'WhatsApp'}`, inv.sentVia.to, 'info', sentAt));
      }
      if (opts.settle) {
        // Saldo pagado al check-out (los impuestos y consumos no estaban en el anticipo)
        const due = invoiceTotal(inv) - paidAmount(r);
        if (due > 0) this.reservations.addPayment(r.id, { amount: due, method: opts.settle, receipt: String(3000 + n) }, issuedAt.slice(0, 16));
      }
      if (opts.annul) {
        const annulAt = at(opts.annul.offset, '09:05:00');
        inv.annulment = { creditNote: `NC-${String(list.filter(i => i.annulment).length + 1).padStart(4, '0')}`, reason: opts.annul.reason, at: annulAt };
        inv.events.push(ev(`Anulada con nota crédito ${inv.annulment.creditNote}`, `${opts.annul.reason} · Administrador`, 'danger', annulAt));
      }
      list.push(inv);
      return inv;
    };

    make('1', -18, '11:20:03', { dian: 'Aceptada', sent: 'Correo', settle: 'Transferencia' });
    make('2', -13, '09:10:04', { dian: 'Aceptada', sent: 'Correo', annul: { offset: -12, reason: 'La factura debía salir a nombre de la empresa' } });
    const nit = '900456789';
    make('2', -12, '10:00:02', {
      billTo: 'Empresa', dian: 'Aceptada', sent: 'Correo', settle: 'Transferencia',
      buyer: { personType: 'Jurídica', docType: 'NIT', docNumber: nit, dv: nitCheckDigit(nit), name: 'Constructora Andina S.A.S.',
               fiscalResponsibility: 'O-15 · Autorretenedor', email: 'facturacion@constructoraandina.com', phone: '+57 601 745 2200',
               country: 'Colombia', department: 'Bogotá D.C.', city: 'Bogotá', address: 'Calle 93 # 11-26' },
    });
    make('3', -10, '11:15:05', { dian: 'Aceptada', sent: 'WhatsApp', term: 'Crédito', dueIn: 5 });
    make('4', -7, '10:40:02', { dian: 'Rechazada', reason: 'número de identificación del adquiriente no válido', buyer: { docNumber: '10506070800' } });
    make('9', 0, '09:41:03', { dian: 'En validación' });

    return list.reverse();
  }
}
