import { Component } from '@angular/core';
import { readSupport, SUPPORT_ACCEPT, UploadFile } from '../support-file';
import { toast } from '../../shared/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Entry, EntryLine, accountByCode, balances, isClosing, monthStart, monthEnd, periodName, entryTotal, COST_CENTERS } from '../accounting.model';
import { INCOME_CATEGORIES, INCOME_METHODS } from '../accounting-config';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { dm } from '../accounting-format';
import { voucherHtml } from '../voucher';

interface Form { date: string; category: string; concept: string; third: string; base: number | null; exempt: boolean; method: string; account: string; support: string; observations: string; }

@Component({
  selector: 'app-accounting-income',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Registrar ingresos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar ingreso</h1>
      <p class="kit-sub">Período contable: <strong>{{ periodLabel }}</strong>. Los anticipos, pagos y estadías de Reservas y Alojamiento llegan solos por integración.</p>
    </div>
  </header>
  <div class="kit-banner kit-banner--danger" *ngIf="svc.loadError" role="alert"><div>{{ svc.loadError }}</div></div>
  <div class="kit-banner kit-banner--danger" *ngIf="serverError" role="alert"><div>{{ serverError }}</div></div>

  <div class="kit-banner kit-banner--ok" *ngIf="saved as s" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Ingreso {{ s.number }} registrado exitosamente</strong>Asociado a {{ periodLabel.toLowerCase() }}. Saldos actualizados en {{ touchedAccounts(s) }}. Registro: {{ s.createdBy }} · {{ dm(s.date) }} {{ s.time }}.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(s)">Ver comprobante</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="tried && errors.length" role="alert">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><b>No se puede guardar:</b> {{ errors.join(', ') }}.</div>
  </div>

  <div class="kit-layout">
    <div class="kit-stack">
      <section class="kit-card">
        <h2 class="kit-card-title">Datos del ingreso</h2>
        <div class="acc-grid3">
          <label class="kit-field">Fecha *<input class="rsv-input" type="date" [(ngModel)]="f.date" [min]="goLive" [max]="periodEnd" [class.invalid]="tried && !f.date"></label>
          <label class="kit-field">Categoría *
            <select class="rsv-input" [(ngModel)]="f.category" (ngModelChange)="f.exempt = false"><option *ngFor="let c of categories" [value]="c.name">{{ c.name }}</option></select></label>
          <label class="kit-field">Período contable<input class="rsv-input acc-readonly" [value]="periodLabel + ' · automático'" readonly></label>
          <label class="kit-field wide">Concepto *<input class="rsv-input" [(ngModel)]="f.concept" placeholder="Ej.: Pasadía grupo empresarial · 25 personas" [class.invalid]="tried && !f.concept.trim()"></label>
          <label class="kit-field">Cliente / tercero *<input class="rsv-input" list="thirds" [(ngModel)]="f.third" [class.invalid]="tried && !f.third.trim()"><datalist id="thirds"><option *ngFor="let t of thirds" [value]="t"></option></datalist></label>
          <label class="kit-field">NIT / CC *<input class="rsv-input" [(ngModel)]="thirdDoc" placeholder="Ej.: 900.571.635" [class.invalid]="tried && !thirdDoc.trim()"></label>
          <label class="kit-field">Centro de costo *<select class="rsv-input" [(ngModel)]="costCenter"><option *ngFor="let c of centers" [value]="c.code">{{ c.code }} {{ c.name }}</option></select></label>
          <label class="kit-field">Valor antes de impuestos *<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="f.base" [class.invalid]="tried && !(+(f.base ?? 0) > 0)"></label>
          <label class="kit-field">{{ cat.tax ? cat.tax + ' ' + (cat.rate * 100) + '%' : 'Impuesto' }}
            <input class="rsv-input acc-readonly" [value]="cat.tax ? (f.exempt ? 'Exento' : money(tax) + ' · calculado') : 'No aplica'" readonly>
            <span class="kit-muted" *ngIf="cat.tax"><input type="checkbox" [(ngModel)]="f.exempt"> Operación exenta / excluida</span></label>
          <label class="kit-field">Método de pago *
            <select class="rsv-input" [(ngModel)]="f.method" (ngModelChange)="onMethod()" [class.invalid]="tried && !f.method"><option value="">Selecciona…</option><option *ngFor="let m of methods">{{ m.name }}</option></select></label>
          <label class="kit-field">Cuenta destino *
            <select class="rsv-input" [(ngModel)]="f.account"><option *ngFor="let a of destAccounts" [value]="a">{{ label(a) }}</option></select></label>
          <label class="kit-field">Documento soporte *
            <span class="acc-file" [class.ok]="f.support" [class.invalid]="tried && !f.support">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {{ f.support || 'Adjuntar factura o recibo' }}<input type="file" [accept]="accept" (change)="attach($event)"></span></label>
          <label class="kit-field wide">Observaciones<textarea class="rsv-input" rows="2" [(ngModel)]="f.observations"></textarea></label>
        </div>
        <div class="acc-foot">
          <span class="acc-total-label">Total del ingreso: <strong>{{ money(total) }}</strong></span>
          <div class="kit-actions">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Limpiar</button>
            <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="(tried && errors.length > 0) || saving || !svc.canCreate" (click)="save()">{{ saving ? 'Guardando…' : 'Registrar ingreso' }}</button>
          </div>
        </div>
      </section>

      <section class="kit-card">
        <div class="acc-head-row"><h2 class="kit-card-title">Últimos ingresos</h2><span class="kit-muted">{{ periodLabel }}</span></div>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>N.º</th><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Método</th><th>Origen</th><th class="r">Valor</th></tr></thead>
            <tbody>
              <tr *ngFor="let e of recent" [class.selected]="e.id === saved?.id">
                <td><a class="kit-code" routerLink="/dashboard/accounting/movements" [queryParams]="{ id: e.id }">{{ e.number }}</a></td>
                <td>{{ dm(e.date) }}</td><td>{{ e.concept }}</td><td class="kit-muted">{{ e.category ?? '—' }}</td><td class="kit-muted">{{ e.method ?? '—' }}</td>
                <td><span class="acc-origin" [class.acc-origin--manual]="e.origin === 'Manual'">{{ e.origin }}</span></td>
                <td class="r"><strong>{{ money(total_(e)) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card">
        <h2 class="kit-card-title">Asiento {{ saved && !f.concept ? 'generado' : 'que se generará' }}</h2>
        <table class="kit-table acc-entry">
          <thead><tr><th>Cuenta</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of lines"><td><span class="acc-code">{{ l.account }}</span><small>{{ name(l.account) }}</small></td>
              <td class="r">{{ l.debit ? money(l.debit) : '—' }}</td><td class="r">{{ l.credit ? money(l.credit) : '—' }}</td></tr>
            <tr class="acc-equal"><td>Sumas iguales</td><td class="r">{{ money(total) }}</td><td class="r">{{ money(total) }}</td></tr>
          </tbody>
        </table>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Ingresos de {{ periodLabel.split(' ')[0].toLowerCase() }}</h2>
        <div class="acc-bar" *ngFor="let c of byCategory"><div><span>{{ c.name }}</span><strong>{{ money(c.value) }}</strong></div><i><b [style.width.%]="c.pct"></b></i></div>
        <hr class="kit-divider">
        <div class="kit-sum"><span>Total operacional</span><strong>{{ money(operational) }}</strong></div>
      </section>
    </aside>
  </div>
  `,
})
export class IncomeComponent {
  supportFile?: UploadFile;
  readonly accept = SUPPORT_ACCEPT;
  readonly categories = INCOME_CATEGORIES;
  readonly methods = INCOME_METHODS;
  readonly money = fmtMoney;
  readonly dm = dm;
  readonly total_ = entryTotal;
  readonly destAccounts = ['1110', '110505', '130505'];

  f!: Form;
  thirdDoc = '';
  costCenter = 'CC-01';
  get centers() { return COST_CENTERS.filter(c => c.active); }
  tried = false;
  saving = false;
  serverError = '';
  saved?: Entry;
  recent: Entry[] = [];
  thirds: string[] = [];
  byCategory: { name: string; value: number; pct: number }[] = [];
  operational = 0;

  constructor(public svc: AccountingService) {
    this.f = this.blank();
    svc.getEntries().subscribe(list => {
      const p = list.filter(e => e.status !== 'Borrador');
      this.recent = p.filter(e => (e.kind === 'Ingreso' || e.kind === 'Cobro') && e.status !== 'Anulado')
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 6);
      this.thirds = [...new Set(list.map(e => e.third).filter(Boolean))].sort();
      const b = balances(list.filter(e => !isClosing(e)), monthStart(svc.openPeriod), monthEnd(svc.openPeriod));
      // Una fila por cuenta: si dos categorías comparten cuenta, el valor no se repite
      const accounts = [...new Set(this.categories.filter(c => c.account.startsWith('41')).map(c => c.account))];
      const rows = accounts.map(a => ({ name: this.categories.filter(c => c.account === a).map(c => c.name).join(' / '), value: b.get(a) ?? 0 }));
      this.operational = rows.reduce((s, r) => s + r.value, 0);
      const max = Math.max(1, ...rows.map(r => r.value));
      this.byCategory = rows.map(r => ({ ...r, pct: r.value / max * 100 }));
    });
  }

  get goLive(): string { return this.svc.minDate; }
  get periodEnd(): string { return monthEnd(this.svc.openPeriod); }
  get periodLabel(): string { return periodName(this.svc.openPeriod); }
  get cat() { return this.categories.find(c => c.name === this.f.category)!; }
  get base(): number { return Math.max(0, Math.round(+(this.f.base ?? 0))); }
  get tax(): number { return this.cat.tax && !this.f.exempt ? Math.round(this.base * this.cat.rate) : 0; }
  get total(): number { return this.base + this.tax; }

  get lines(): EntryLine[] {
    const third = this.f.third.trim();
    return [
      { account: this.f.account, detail: this.f.method, third, debit: this.total, credit: 0 },
      { account: this.cat.account, detail: this.f.category, third, debit: 0, credit: this.base },
      ...(this.tax ? [{ account: this.cat.tax === 'INC' ? '249505' : '240805', detail: `${this.cat.tax} ${this.cat.rate * 100}%`, third: '', debit: 0, credit: this.tax }] : []),
    ];
  }

  get errors(): string[] {
    const e: string[] = [];
    if (!(this.base > 0)) e.push('falta el valor');
    if (!this.f.method) e.push('falta el método de pago');
    if (!this.f.third.trim()) e.push('falta el tercero');
    if (!this.thirdDoc.trim()) e.push('falta el NIT o CC del tercero');
    return [...e, ...this.svc.validate(this.entry())];
  }

  private entry() {
    return {
      kind: 'Ingreso' as const, date: this.f.date, time: new Date().toTimeString().slice(0, 5), concept: this.f.concept.trim(), third: this.f.third.trim(),
      thirdDoc: this.thirdDoc.trim() || undefined,
      category: this.f.category, method: this.f.method,
      lines: this.lines.map(l => ({ ...l, third: l.third || this.f.third.trim(), thirdDoc: this.thirdDoc.trim() || undefined, costCenter: this.costCenter })), supports: [], files: this.f.support && this.supportFile ? [this.supportFile] : [], observations: this.f.observations.trim(),
    };
  }

  onMethod(): void {
    this.f.account = this.methods.find(m => m.name === this.f.method)?.account ?? '1110';
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
      this.f = this.blank();
      this.tried = false;
    } catch (e: any) {
      this.serverError = e?.error?.message ?? e?.message ?? 'No se pudo registrar el ingreso.';
    } finally {
      this.saving = false;
    }
  }

  reset(): void { this.f = this.blank(); this.tried = false; }

  print(e: Entry): void { openDocument(`Comprobante ${e.number}`, voucherHtml(e, this.svc.issuer), false); }

  touchedAccounts(e: Entry): string {
    return e.lines.map(l => this.name(l.account)).join(', ');
  }

  label(code: string): string { return `${code} · ${this.name(code)}`; }
  name(code: string): string { return accountByCode(code)?.name ?? code; }

  private blank(): Form {
    return { date: isoDate(0) < this.svc.minDate ? this.svc.minDate : isoDate(0), category: 'Eventos y pasadías', concept: '', third: '', base: null, exempt: false,
      method: '', account: '1110', support: '', observations: '' };
  }
}
