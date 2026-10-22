import { Component } from '@angular/core';
import { readSupport, SUPPORT_ACCEPT, UploadFile } from '../support-file';
import { toast } from '../../shared/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import {
  EntryKind, PREFIX, COST_CENTERS, NOTE_REASONS_CREDIT, accountByCode, activeAccounts, balances, debitNature, docTitle, monthEnd, periodName,
} from '../accounting.model';
import { PAYMENT_METHODS } from '../accounting-config';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';
import { openDocument } from '../../shared/documents';
import { dmy } from '../accounting-format';
import { amountInWords, blankVoucherHtml } from '../voucher';

interface Row { account: string; detail: string; third: string; thirdDoc: string; costCenter: string; debit: number | null; credit: number | null; }

/** Documentos del contador que se registran a mano (los demás llegan solos por integración). */
const DOCS: { kind: EntryKind; label: string; help: string }[] = [
  { kind: 'Ingreso', label: 'Recibo de caja', help: 'Entra dinero: pagos de huéspedes, anticipos, otros ingresos.' },
  { kind: 'Egreso', label: 'Comprobante de egreso', help: 'Sale dinero: pagos a proveedores, comisiones, servicios.' },
  { kind: 'Ajuste', label: 'Nota de contabilidad', help: 'No mueve dinero: aportes en especie, depreciaciones, provisiones, reclasificaciones.' },
  { kind: 'Nota crédito', label: 'Nota crédito', help: 'Disminuye lo cobrado en una factura: error, devolución, rebaja o anulación.' },
  { kind: 'Nota débito', label: 'Nota débito', help: 'Cobra al cliente un valor adicional al facturado.' },
  { kind: 'Apertura', label: 'Saldos iniciales', help: 'Saldo real de cada cuenta al inicio de la contabilidad en SOGO.' },
];

@Component({
  selector: 'app-accounting-movement',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Nuevo comprobante</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Nuevo comprobante contable</h1>
      <p class="kit-sub">Con el formato del contador: Nº consecutivo, tercero con identificación, centro de costo por línea y valor en letras.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="printBlank()">Formato en blanco</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="saving || !svc.canCreate" (click)="save(true)">Guardar borrador</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="saving || !svc.canCreate" (click)="save(false)">{{ saving ? 'Guardando…' : 'Registrar ' + doc.label.toLowerCase() }}</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="serverError" role="alert"><div>{{ serverError }}</div></div>
  <div class="kit-banner kit-banner--info" *ngIf="kind === 'Apertura'">
    <div><strong>Saldos iniciales</strong> Registra con fecha {{ dmy(svc.goLive) }} el saldo real de cada cuenta a esa fecha. Activos al débito; pasivos y patrimonio al crédito.
      {{ svc.hasOpening ? 'Ya hay saldos iniciales registrados: este comprobante se suma a ellos.' : '' }}</div>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="tried && errors.length" role="alert"><div><b>No se puede guardar:</b> {{ errors.join(', ') }}.</div></div>

  <section class="kit-card mv-docs">
    <p class="acc-section-sub">Documento *</p>
    <div class="mv-doc-grid" role="radiogroup" aria-label="Documento">
      <button type="button" *ngFor="let d of docs" role="radio" [attr.aria-checked]="kind === d.kind" [class.active]="kind === d.kind" (click)="setKind(d.kind)">
        <strong>{{ d.label }}</strong><code>{{ prefix(d.kind) }}</code><small>{{ d.help }}</small></button>
    </div>
  </section>

  <section class="kit-card mv-head">
    <div class="mv-doc-box"><strong>{{ doc.label }}</strong><span>Nº <code>{{ svc.previewNumber(kind, date) }}</code></span><small>Lo asigna el servidor al registrar</small></div>
    <div class="acc-grid3">
      <label class="kit-field">Fecha de emisión *<input class="rsv-input" type="date" [(ngModel)]="date" [min]="svc.minDate" [max]="periodEnd">
        <small class="kit-muted">Desde el {{ dmy(svc.minDate) }}{{ svc.closedThrough ? ' (meses cerrados hasta ' + svc.closedThrough + ')' : ' (inicio de la contabilidad en SOGO)' }}.
          <a routerLink="/dashboard/accounting/integration">Cambiar inicio</a></small></label>
      <label class="kit-field">{{ thirdLabel }} {{ needsThird ? '*' : '' }}<input class="rsv-input" [(ngModel)]="third" placeholder="Nombre o razón social" [class.invalid]="tried && needsThird && !third.trim()"></label>
      <label class="kit-field">{{ isNote ? 'NIT / CC' : 'Identificación (NIT o CC)' }} {{ needsThird ? '*' : '' }}<input class="rsv-input" [(ngModel)]="thirdDoc" placeholder="Ej.: 7.511.827 o 900.571.635-1" [class.invalid]="tried && needsThird && !thirdDoc.trim()"></label>
      <label class="kit-field" *ngIf="isCash">Forma de pago *<select class="rsv-input" [(ngModel)]="method"><option *ngFor="let m of methods" [value]="m.name">{{ m.name }}</option></select></label>
      <label class="kit-field" *ngIf="isNote">Factura que afecta *<input class="rsv-input" [(ngModel)]="invoiceRef" placeholder="Ej.: FE-1052" [class.invalid]="tried && !invoiceRef.trim()"></label>
      <label class="kit-field" *ngIf="kind === 'Nota crédito'">Motivo *<select class="rsv-input" [(ngModel)]="noteReason"><option value="">Selecciona…</option><option *ngFor="let m of reasons">{{ m }}</option></select></label>
      <label class="kit-field wide">Concepto *<input class="rsv-input" [(ngModel)]="concept" [placeholder]="conceptHint" [class.invalid]="tried && !concept.trim()"></label>
      <label class="kit-field">Documento soporte *
        <span class="acc-file" [class.ok]="support" [class.invalid]="tried && !support">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>{{ support || 'Adjuntar soporte' }}<input type="file" [accept]="accept" (change)="attach($event)"></span></label>
      <label class="kit-field">Período contable<input class="rsv-input acc-readonly" [value]="periodLabel" readonly></label>
    </div>
  </section>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="acc-head-row">
      <h2 class="kit-card-title">Partidas</h2>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="add()">+ Agregar línea</button>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table mv-table">
        <thead><tr><th>Código · cuenta</th><th>Tercero</th><th>Centro de costo</th><th>Descripción</th><th class="r">Débito</th><th class="r">Crédito</th><th></th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows; let i = index">
            <td><select class="rsv-input mv-acc" [(ngModel)]="r.account" [class.invalid]="tried && !r.account" [attr.aria-label]="'Cuenta de la línea ' + (i + 1)">
              <option value="">Selecciona una cuenta…</option><option *ngFor="let a of accounts" [value]="a.code">{{ a.code }} · {{ a.name }}</option></select></td>
            <td><input class="rsv-input mv-third" [(ngModel)]="r.third" [placeholder]="third || 'Tercero'" aria-label="Tercero">
              <input class="rsv-input mv-doc" [(ngModel)]="r.thirdDoc" [placeholder]="thirdDoc || 'NIT / CC'" aria-label="NIT o CC"></td>
            <td><select class="rsv-input mv-cc" [(ngModel)]="r.costCenter" [class.invalid]="tried && !asDraft && !r.costCenter" aria-label="Centro de costo">
              <option value="">Centro…</option><option *ngFor="let c of centers" [value]="c.code">{{ c.code }} {{ c.name }}</option></select></td>
            <td><input class="rsv-input" [(ngModel)]="r.detail" aria-label="Descripción"></td>
            <td><input class="rsv-input mv-num" type="number" min="0" [(ngModel)]="r.debit" (ngModelChange)="r.debit && (r.credit = null)" [class.invalid]="tried && rowBad(r)" aria-label="Débito"></td>
            <td><input class="rsv-input mv-num" type="number" min="0" [(ngModel)]="r.credit" (ngModelChange)="r.credit && (r.debit = null)" [class.invalid]="tried && rowBad(r)" aria-label="Crédito"></td>
            <td><button type="button" class="mv-remove" (click)="remove(i)" [disabled]="rows.length <= 2" [attr.aria-label]="'Quitar línea ' + (i + 1)">×</button></td>
          </tr>
          <tr class="mv-sum"><td colspan="4">Sumas iguales</td><td class="r">{{ money(debits) }}</td><td class="r">{{ money(credits) }}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="mv-words" *ngIf="debits > 0"><b>Valor en letras:</b> {{ words(debits) }}</p>
    <div class="kit-banner" [ngClass]="balanced ? 'kit-banner--ok' : 'kit-banner--warn'" style="margin: 10px 0 0">
      <div><b>{{ balanced ? 'Comprobante cuadrado.' : 'Comprobante descuadrado.' }}</b> {{ balanced ? '' : 'Débitos y créditos deben sumar igual · diferencia ' + money(debits - credits) }}</div>
    </div>
  </section>

  <div class="kit-layout">
    <section class="kit-card">
      <h2 class="kit-card-title">Observaciones</h2>
      <textarea class="rsv-input" rows="3" [(ngModel)]="observations" style="width:100%"></textarea>
    </section>
    <aside class="kit-card">
      <h2 class="kit-card-title">Saldos después del comprobante</h2>
      <div class="kit-sum" *ngFor="let a of after"><span>{{ a.code }} {{ a.name }}</span><strong [class.acc-red]="a.value < 0">{{ money(a.value) }}</strong></div>
      <p class="kit-muted" *ngIf="!after.length">Elige las cuentas para ver cómo quedan sus saldos.</p>
      <p class="acc-note">Elaboró: {{ svc.actor }} · el servidor guarda fecha, hora y número al registrar.</p>
    </aside>
  </div>
  `,
  styles: [`
    .mv-docs { margin-bottom: 14px; }
    .mv-doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .mv-doc-grid button { text-align: left; border: 1px solid #D5DEEA; border-radius: 12px; background: #fff; padding: 10px 12px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 3px; }
    .mv-doc-grid button.active { border: 2px solid #0B6FD0; padding: 9px 11px; background: #F5F9FE; }
    .mv-doc-grid strong { font-size: 13px; color: #0A2540; }
    .mv-doc-grid code { font-size: 11px; color: #0B6FD0; }
    .mv-doc-grid small { font-size: 11px; color: #6B7280; line-height: 1.35; }
    .mv-head { margin-bottom: 18px; position: relative; }
    .mv-doc-box { float: right; border: 2px solid #7CC4B0; border-radius: 10px; padding: 8px 14px; margin: 0 0 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 210px; }
    .mv-doc-box strong { text-transform: uppercase; font-size: 12.5px; color: #0A2540; }
    .mv-doc-box span { font-size: 12px; } .mv-doc-box code { font-weight: 700; }
    .mv-doc-box small { font-size: 10.5px; color: #6B7280; }
    .mv-table td { padding: 6px 6px; vertical-align: top; }
    .mv-acc { min-width: 240px; }
    .mv-third, .mv-doc { min-width: 140px; }
    .mv-doc { margin-top: 4px; font-size: 12px; height: 32px; }
    .mv-cc { min-width: 150px; }
    .mv-num { text-align: right; min-width: 110px; }
    .mv-remove { border: none; background: none; font-size: 18px; color: #6B7280; cursor: pointer; }
    .mv-remove:disabled { opacity: 0.3; cursor: not-allowed; }
    .mv-sum td { font-weight: 700; color: #0A2540; border-top: 2px solid #D5DEEA; }
    .mv-words { font-size: 12.5px; margin: 10px 0 0; color: #374151; }
  `],
})
export class MovementComponent {
  supportFile?: UploadFile;
  readonly accept = SUPPORT_ACCEPT;
  readonly docs = DOCS;
  readonly money = fmtMoney;
  readonly words = amountInWords;
  readonly dmy = dmy;
  readonly methods = PAYMENT_METHODS;
  readonly reasons = NOTE_REASONS_CREDIT;
  get accounts() { return activeAccounts(); }
  get centers() { return COST_CENTERS.filter(c => c.active); }

  kind: EntryKind = 'Ingreso';
  date = isoDate(0);
  concept = '';
  third = '';
  thirdDoc = '';
  method = 'Efectivo';
  invoiceRef = '';
  noteReason = '';
  support = '';
  observations = '';
  rows: Row[] = [this.blankRow(), this.blankRow()];
  tried = false;
  asDraft = false;
  saving = false;
  serverError = '';

  constructor(public svc: AccountingService, private router: Router, route: ActivatedRoute) {
    if (this.date < svc.minDate) this.date = svc.minDate;
    const tipo = route.snapshot.queryParamMap.get('tipo');
    if (tipo === 'apertura') this.setKind('Apertura');
    else if (tipo === 'nota-credito') this.setKind('Nota crédito');
    else if (tipo === 'nota-debito') this.setKind('Nota débito');
  }

  get doc() { return DOCS.find(d => d.kind === this.kind)!; }
  prefix(k: EntryKind): string { return `${PREFIX[k]}-${this.date.slice(0, 4)}…`; }
  get isCash(): boolean { return this.kind === 'Ingreso' || this.kind === 'Egreso'; }
  get isNote(): boolean { return this.kind === 'Nota crédito' || this.kind === 'Nota débito'; }
  get needsThird(): boolean { return this.isCash || this.isNote; }
  get thirdLabel(): string { return this.kind === 'Ingreso' ? 'Recibido de' : this.kind === 'Egreso' ? 'Pagado a' : this.isNote ? 'Cliente' : 'Tercero'; }
  get conceptHint(): string {
    return { Ingreso: 'Ej.: Hospedaje 2 noches, reserva vía Booking', Egreso: 'Ej.: Pago de comisión a Booking.com, factura Nº …',
      Ajuste: 'Ej.: Aporte de capital en especie', 'Nota crédito': 'Ej.: Rebaja por inconveniente con la habitación', 'Nota débito': 'Ej.: Cobro de noche adicional',
      Apertura: 'Saldos iniciales' }[this.kind as string] ?? '';
  }

  /** Los saldos iniciales van con la fecha de inicio de la contabilidad en SOGO. */
  setKind(k: EntryKind): void {
    this.kind = k;
    if (k === 'Apertura') {
      this.date = this.svc.goLive;
      if (!this.concept.trim()) this.concept = `Saldos iniciales al ${dmy(this.svc.goLive)}`;
    }
    if (k === 'Nota débito') this.noteReason = 'Cobro adicional';
    else if (k !== 'Nota crédito') this.noteReason = '';
  }


  get periodEnd(): string { return monthEnd(this.svc.openPeriod); }
  get periodLabel(): string { return this.date ? periodName(this.date.slice(0, 7)) : periodName(this.svc.openPeriod); }
  get debits(): number { return this.rows.reduce((s, r) => s + (+(r.debit ?? 0) || 0), 0); }
  get credits(): number { return this.rows.reduce((s, r) => s + (+(r.credit ?? 0) || 0), 0); }
  get balanced(): boolean { return this.debits > 0 && Math.round(this.debits) === Math.round(this.credits); }
  get usedAccounts(): string[] { return [...new Set(this.rows.map(r => r.account).filter(Boolean))]; }

  get after(): { code: string; name: string; value: number }[] {
    const b = balances(this.svc.snapshot(), '0000-01-01', this.date || isoDate(0));
    return this.usedAccounts.map(code => {
      const effect = this.rows.filter(r => r.account === code).reduce((s, r) => s + (+(r.debit ?? 0) || 0) - (+(r.credit ?? 0) || 0), 0);
      return { code, name: accountByCode(code)?.name ?? '', value: (b.get(code) ?? 0) + (debitNature(code) ? effect : -effect) };
    });
  }

  get errors(): string[] {
    const e = this.svc.validate(this.entry(this.asDraft));
    if (this.asDraft) return e;
    if (this.rows.some(r => !r.costCenter)) e.push('falta el centro de costo en alguna línea');
    if (this.needsThird && !this.third.trim()) e.push(`falta «${this.thirdLabel.toLowerCase()}»`);
    if (this.needsThird && !this.thirdDoc.trim()) e.push('falta la identificación (NIT o CC)');
    if (this.isNote && !this.invoiceRef.trim()) e.push('falta la factura que afecta');
    if (this.kind === 'Nota crédito' && !this.noteReason) e.push('falta el motivo de la nota crédito');
    return e;
  }

  rowBad(r: Row): boolean { return (+(r.debit ?? 0) > 0) === (+(r.credit ?? 0) > 0); }

  private entry(draft: boolean) {
    const third = this.third.trim(), thirdDoc = this.thirdDoc.trim();
    return {
      kind: this.kind, date: this.date, time: new Date().toTimeString().slice(0, 5), concept: this.concept.trim(),
      third, thirdDoc: thirdDoc || undefined, method: this.isCash ? this.method : undefined,
      invoiceRef: this.isNote ? this.invoiceRef.trim() : undefined, noteReason: this.isNote ? this.noteReason : undefined,
      lines: this.rows.map(r => ({
        account: r.account, detail: r.detail.trim(), third: r.third.trim() || third, thirdDoc: r.thirdDoc.trim() || thirdDoc || undefined,
        costCenter: r.costCenter || undefined, debit: +(r.debit ?? 0) || 0, credit: +(r.credit ?? 0) || 0,
      })),
      supports: [], files: this.support && this.supportFile ? [this.supportFile] : [], observations: this.observations.trim(), draft,
    };
  }

  add(): void {
    const cc = this.rows[this.rows.length - 1]?.costCenter ?? '';
    this.rows = [...this.rows, { ...this.blankRow(), costCenter: cc }];
  }
  remove(i: number): void { this.rows = this.rows.filter((_, j) => j !== i); }

  async attach(ev: Event): Promise<void> {
    try {
      const f = await readSupport(ev);
      if (f) { this.support = f.name; this.supportFile = f; }
    } catch (e: any) {
      toast.error('Soporte no válido', e?.message);
    }
  }

  printBlank(): void {
    openDocument(`${docTitle(this.kind)} en blanco`, blankVoucherHtml(this.kind, this.svc.issuer, PREFIX[this.kind]), true);
  }

  async save(draft: boolean): Promise<void> {
    this.tried = true;
    this.asDraft = draft;
    this.serverError = '';
    if (this.errors.length || this.saving) return;
    this.saving = true;
    try {
      const created = await this.svc.register(this.entry(draft));
      this.router.navigate(['/dashboard/accounting/movements'], { queryParams: { id: created.id } });
    } catch (err: any) {
      this.serverError = err?.error?.message ?? err?.message ?? 'No se pudo registrar el comprobante.';
    } finally {
      this.saving = false;
    }
  }

  private blankRow(): Row { return { account: '', detail: '', third: '', thirdDoc: '', costCenter: '', debit: null, credit: null }; }
}
