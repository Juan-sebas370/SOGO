import { Component } from '@angular/core';
import { readSupport, SUPPORT_ACCEPT, UploadFile } from '../support-file';
import { toast } from '../../shared/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Entry, EntryLine, accountByCode, balances, isClosing, monthStart, monthEnd, periodName, COST_CENTERS } from '../accounting.model';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, RETENTIONS } from '../accounting-config';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { dm } from '../accounting-format';
import { voucherHtml } from '../voucher';

interface Form { category: string; date: string; account: string; concept: string; third: string; base: number | null; iva: boolean; method: string; retention: string; support: string; observations: string; }

/** Agrupación de gastos del mes (por prefijo de cuenta). */
const GROUPS: { name: string; test: (c: string) => boolean }[] = [
  { name: 'Nómina y prestaciones', test: c => c.startsWith('5205') },
  { name: 'Costos', test: c => c[0] === '6' || c[0] === '7' },
  { name: 'Depreciaciones y amortizaciones', test: c => c.startsWith('5260') || c.startsWith('5265') },
  { name: 'Servicios', test: c => c.startsWith('5235') },
  { name: 'Honorarios', test: c => c.startsWith('5210') },
  { name: 'Mantenimiento y adecuaciones', test: c => c.startsWith('5245') || c.startsWith('5250') },
  { name: 'Otros (impuestos, seguros, aseo, bancarios...)', test: c => ['5215', '5220', '5225', '5230', '5240', '5255', '5295', '5299'].includes(c.slice(0, 4)) || c.startsWith('53') },
];

@Component({
  selector: 'app-accounting-expense',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Registrar egresos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar egreso</h1>
      <p class="kit-sub">Gastos operativos, administrativos y financieros. La nómina y las compras de inventario llegan por integración.</p>
    </div>
  </header>
  <div class="kit-banner kit-banner--danger" *ngIf="svc.loadError" role="alert"><div>{{ svc.loadError }}</div></div>
  <div class="kit-banner kit-banner--danger" *ngIf="serverError" role="alert"><div>{{ serverError }}</div></div>

  <div class="kit-banner kit-banner--ok" *ngIf="saved as s" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Egreso {{ s.number }} registrado</strong>{{ s.concept }} · {{ money(payable(s)) }} a {{ s.third || 'proveedor' }}.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(s)">Ver comprobante</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="tried && errors.length" role="alert">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><b>No se puede guardar:</b> {{ errors.join(', ') }}.</div>
  </div>

  <div class="kit-layout">
    <section class="kit-card">
      <h2 class="kit-card-title">Datos del egreso</h2>
      <p class="acc-section-sub">Categoría *</p>
      <div class="acc-chips" role="radiogroup" aria-label="Categoría">
        <button type="button" class="kit-chip" role="radio" *ngFor="let c of categories" [attr.aria-checked]="f.category === c.name" [class.active]="f.category === c.name" (click)="setCategory(c.name)">{{ c.name }}</button>
      </div>
      <div class="kit-banner kit-banner--info" *ngIf="cat.integrated">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <div>{{ cat.integrated }}</div>
        <a class="rsv-btn rsv-btn--outline" [routerLink]="cat.name === 'Nómina' ? '/dashboard/payroll/liquidation' : '/dashboard/inventory'">Ir a {{ cat.name === 'Nómina' ? 'Nómina' : 'Inventarios' }}</a>
      </div>
      <ng-container *ngIf="!cat.integrated">
        <div class="acc-grid3">
          <label class="kit-field">Fecha *<input class="rsv-input" type="date" [(ngModel)]="f.date" [min]="goLive" [max]="periodEnd"></label>
          <label class="kit-field">Cuenta de gasto *
            <select class="rsv-input" [(ngModel)]="f.account"><option *ngFor="let a of cat.accounts" [value]="a">{{ a }} · {{ name(a) }}</option></select></label>
          <label class="kit-field">Período contable<input class="rsv-input acc-readonly" [value]="periodLabel + ' · automático'" readonly></label>
          <label class="kit-field wide">Concepto *<input class="rsv-input" [(ngModel)]="f.concept" placeholder="Ej.: Mantenimiento preventivo de calentadores" [class.invalid]="tried && !f.concept.trim()"></label>
          <label class="kit-field">Proveedor *<input class="rsv-input" list="providers" [(ngModel)]="f.third" [class.invalid]="tried && !f.third.trim()"><datalist id="providers"><option *ngFor="let t of thirds" [value]="t"></option></datalist></label>
          <label class="kit-field">NIT / CC *<input class="rsv-input" [(ngModel)]="thirdDoc" placeholder="Ej.: 900.571.635" [class.invalid]="tried && !thirdDoc.trim()"></label>
          <label class="kit-field">Centro de costo *<select class="rsv-input" [(ngModel)]="costCenter"><option *ngFor="let c of centers" [value]="c.code">{{ c.code }} {{ c.name }}</option></select></label>
          <label class="kit-field">Valor antes de IVA *<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="f.base" [class.invalid]="tried && !(base > 0)"></label>
          <label class="kit-field">IVA descontable 19%
            <input class="rsv-input acc-readonly" [value]="f.iva ? money(iva) : 'No aplica'" readonly>
            <span class="kit-muted"><input type="checkbox" [(ngModel)]="f.iva"> La factura trae IVA</span></label>
          <label class="kit-field">Método de pago *
            <select class="rsv-input" [(ngModel)]="f.method" [class.invalid]="tried && !f.method"><option value="">Selecciona…</option><option *ngFor="let m of methods">{{ m.name }}</option></select>
            <span class="kit-error" *ngIf="tried && !f.method">Campo obligatorio</span></label>
          <label class="kit-field">Retención en la fuente
            <select class="rsv-input" [(ngModel)]="f.retention"><option *ngFor="let r of retentions" [value]="r.name">{{ r.name }}{{ r.rate ? ' · ' + money(retentionOf(r.rate)) : '' }}</option></select></label>
          <label class="kit-field">Documento soporte <span class="kit-muted">(opcional)</span>
            <span class="acc-file" [class.ok]="f.support">
              <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>{{ f.support || 'Adjuntar factura del proveedor' }}<input type="file" [accept]="accept" (change)="attach($event)"></span>
            </label>
          <label class="kit-field wide">Observaciones<textarea class="rsv-input" rows="2" [(ngModel)]="f.observations"></textarea></label>
        </div>
        <div class="acc-foot">
          <span class="acc-total-label">Valor a pagar al proveedor: <strong>{{ money(toPay) }}</strong></span>
          <div class="kit-actions">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Cancelar</button>
            <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="(tried && errors.length > 0) || saving || !svc.canCreate" (click)="save()">{{ saving ? 'Guardando…' : 'Registrar egreso' }}</button>
          </div>
        </div>
      </ng-container>
    </section>

    <aside class="kit-aside">
      <section class="kit-card" *ngIf="!cat.integrated">
        <h2 class="kit-card-title">Asiento que se generará</h2>
        <table class="kit-table acc-entry">
          <thead><tr><th>Cuenta</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of lines"><td><span class="acc-code">{{ l.account || '[Pendiente]' }}</span><small>{{ l.account ? name(l.account) : 'Según método de pago' }}</small></td>
              <td class="r">{{ l.debit ? money(l.debit) : '—' }}</td><td class="r">{{ l.credit ? money(l.credit) : '—' }}</td></tr>
            <tr class="acc-equal"><td>Sumas iguales</td><td class="r">{{ money(base + iva) }}</td><td class="r">{{ money(base + iva) }}</td></tr>
          </tbody>
        </table>
        <p class="acc-note">Retención y cuentas según configuración tributaria · validar con el contador (bases mínimas en UVT).</p>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Egresos de {{ periodLabel.split(' ')[0].toLowerCase() }}</h2>
        <div class="acc-bar acc-bar--out" *ngFor="let g of byGroup"><div><span>{{ g.name }}</span><strong>{{ money(g.value) }}</strong></div><i><b [style.width.%]="g.pct"></b></i></div>
        <hr class="kit-divider">
        <div class="kit-sum"><span>Total egresos</span><strong>{{ money(totalOut) }}</strong></div>
        <p class="acc-note" *ngIf="provisional">Incluye la nómina en borrador con valor provisional.</p>
      </section>
    </aside>
  </div>
  `,
})
export class ExpenseComponent {
  supportFile?: UploadFile;
  readonly accept = SUPPORT_ACCEPT;
  readonly categories = EXPENSE_CATEGORIES;
  readonly methods = EXPENSE_METHODS;
  readonly retentions = RETENTIONS;
  readonly money = fmtMoney;
  readonly dm = dm;

  f!: Form;
  thirdDoc = '';
  costCenter = 'CC-03';
  get centers() { return COST_CENTERS.filter(c => c.active); }
  tried = false;
  saving = false;
  serverError = '';
  saved?: Entry;
  thirds: string[] = [];
  byGroup: { name: string; value: number; pct: number }[] = [];
  totalOut = 0;
  provisional = false;

  constructor(public svc: AccountingService) {
    this.f = this.blank('Mantenimiento');
    svc.getEntries().subscribe(list => {
      this.thirds = [...new Set(list.map(e => e.third).filter(Boolean))].sort();
      const b = balances(list.filter(e => !isClosing(e)), monthStart(svc.openPeriod), monthEnd(svc.openPeriod));
      const rows = GROUPS.map(g => ({ name: g.name, value: [...b].filter(([c]) => g.test(c)).reduce((s, [, v]) => s + v, 0) }));
      this.totalOut = rows.reduce((s, r) => s + r.value, 0);
      const max = Math.max(1, ...rows.map(r => r.value));
      this.byGroup = rows.filter(r => r.value).map(r => ({ ...r, pct: r.value / max * 100 }));
      this.provisional = svc.provisional().length > 0;
    });
  }

  get goLive(): string { return this.svc.minDate; }
  get periodEnd(): string { return monthEnd(this.svc.openPeriod); }
  get periodLabel(): string { return periodName(this.svc.openPeriod); }
  get cat() { return this.categories.find(c => c.name === this.f.category)!; }
  get base(): number { return Math.max(0, Math.round(+(this.f.base ?? 0))); }
  get iva(): number { return this.f.iva ? Math.round(this.base * 0.19) : 0; }
  get retention() { return this.retentions.find(r => r.name === this.f.retention)!; }
  get ret(): number { return this.retentionOf(this.retention.rate); }
  get toPay(): number { return this.base + this.iva - this.ret; }
  get payAccount(): string { return this.methods.find(m => m.name === this.f.method)?.account ?? ''; }

  retentionOf(rate: number): number { return Math.round(this.base * rate); }

  get lines(): EntryLine[] {
    const third = this.f.third.trim();
    return [
      { account: this.f.account, detail: this.f.category, third, debit: this.base, credit: 0 },
      ...(this.iva ? [{ account: '240810', detail: 'IVA descontable', third, debit: this.iva, credit: 0 }] : []),
      ...(this.ret ? [{ account: this.retention.account, detail: this.retention.name, third, debit: 0, credit: this.ret }] : []),
      { account: this.payAccount, detail: this.f.method, third, debit: 0, credit: this.toPay },
    ];
  }

  get errors(): string[] {
    const e: string[] = [];
    if (!(this.base > 0)) e.push('falta el valor');
    if (!this.f.method) e.push('falta el método de pago');
    if (!this.f.third.trim()) e.push('falta el tercero');
    if (!this.thirdDoc.trim()) e.push('falta el NIT o CC del tercero');
    if (!this.f.concept.trim()) e.push('falta el concepto');
    const rest = this.svc.validate(this.entry()).filter(x => !['falta el concepto', 'hay partidas sin cuenta'].includes(x));
    return [...e, ...rest];
  }

  private entry() {
    return {
      kind: 'Egreso' as const, date: this.f.date, time: new Date().toTimeString().slice(0, 5), concept: this.f.concept.trim(), third: this.f.third.trim(),
      thirdDoc: this.thirdDoc.trim() || undefined,
      category: this.f.category, method: this.f.method,
      lines: this.lines.map(l => ({ ...l, third: l.third || this.f.third.trim(), thirdDoc: this.thirdDoc.trim() || undefined, costCenter: this.costCenter })), supports: [], files: this.f.support && this.supportFile ? [this.supportFile] : [], observations: this.f.observations.trim(),
    };
  }

  setCategory(name: string): void {
    const keep = this.f;
    this.f = { ...this.blank(name), date: keep.date, concept: keep.concept, third: keep.third, base: keep.base, method: keep.method, support: keep.support, observations: keep.observations };
  }

  async attach(ev: Event): Promise<void> {
    try {
      const f = await readSupport(ev);
      if (f) { this.f.support = f.name; this.supportFile = f; }
    } catch (e: any) {
      toast.error('Soporte no válido', e?.message);
    }
  }

  async save(): Promise<void> {
    this.tried = true;
    this.serverError = '';
    if (this.errors.length || this.saving) return;
    this.saving = true;
    try {
      this.saved = await this.svc.register(this.entry());
      this.thirdDoc = '';
      this.f = this.blank(this.f.category);
      this.tried = false;
    } catch (e: any) {
      this.serverError = e?.error?.message ?? e?.message ?? 'No se pudo registrar el egreso.';
    } finally {
      this.saving = false;
    }
  }

  reset(): void { this.f = this.blank(this.f.category); this.tried = false; }

  payable(e: Entry): number { return e.lines[e.lines.length - 1]?.credit ?? 0; }
  print(e: Entry): void { openDocument(`Comprobante ${e.number}`, voucherHtml(e, this.svc.issuer), false); }
  name(code: string): string { return accountByCode(code)?.name ?? code; }

  private blank(category: string): Form {
    const c = this.categories.find(x => x.name === category)!;
    return { category, date: isoDate(0) < this.svc.minDate ? this.svc.minDate : isoDate(0), account: c.accounts[0] ?? '', concept: '', third: '', base: null,
      iva: c.iva, method: '', retention: c.retention, support: '', observations: '' };
  }
}
