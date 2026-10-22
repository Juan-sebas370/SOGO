import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Entry, EntryKind, EntryStatus, docTitle, costCenterLabel, STATUS_BADGE, accountByCode, mainAccount, entryTotal, periodName, monthStart, monthEnd } from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { dm, dmy } from '../accounting-format';
import { voucherHtml } from '../voucher';
import { SupportFile, UploadFile, SUPPORT_ACCEPT, fileSize, readSupport } from '../support-file';
import { toast } from '../../shared/toast/toast.service';

type Tab = 'Todos' | 'Recibos de caja' | 'Egresos' | 'Notas de contabilidad' | 'Notas crédito y débito';
/** Pestañas por documento del contador (se clasifica por tipo: los números viejos CI-/NC- siguen apareciendo bien). */
const TAB_KINDS: Record<Tab, EntryKind[]> = {
  'Todos': [], 'Recibos de caja': ['Ingreso', 'Cobro', 'Venta'], 'Egresos': ['Egreso', 'Pago'],
  'Notas de contabilidad': ['Ajuste', 'Provisión', 'Causación', 'Traslado', 'Apertura'], 'Notas crédito y débito': ['Nota crédito', 'Nota débito'],
};

@Component({
  selector: 'app-accounting-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Movimientos contables</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Consultar movimientos contables</h1>
      <p class="kit-sub">Todos los comprobantes del período, manuales e integrados, en tiempo real.</p>
    </div>
    <a routerLink="/dashboard/accounting/movement" class="rsv-btn rsv-btn--primary">+ Nuevo comprobante</a>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert"><div>{{ error }}</div></div>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="mvs-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t" [class.active]="tab === t" (click)="tab = t; apply()">{{ t }} <span>{{ counts[t] }}</span></button>
    </div>
    <div class="mvs-filters">
      <div class="kit-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" (ngModelChange)="apply()" placeholder="N.º de comprobante, cuenta, concepto..." aria-label="Buscar"></div>
      <label class="kit-select"><span>Período contable</span>
        <select [(ngModel)]="period" (ngModelChange)="setPeriod()"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
      <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="apply()"></label>
      <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" (ngModelChange)="apply()"></label>
      <label class="kit-select"><span>Estado</span>
        <select [(ngModel)]="status" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let s of statuses">{{ s }}</option></select></label>
    </div>
  </section>

  <div class="kit-layout mvs-layout">
    <section class="kit-card">
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Comprobante</th><th>Fecha</th><th>Concepto</th><th>Cuenta principal</th><th>Origen</th><th class="r">Valor</th><th>Estado</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of filtered" class="clickable" [class.selected]="e.id === selected?.id" [class.acc-muted-row]="e.status === 'Anulado'" (click)="selected = e" tabindex="0" (keydown.enter)="selected = e">
              <td><span class="kit-code">{{ e.number }}</span></td>
              <td class="mvs-nowrap">{{ dm(e.date) }} {{ e.time }}</td>
              <td>{{ e.concept }}</td>
              <td class="kit-muted">{{ main(e) }}</td>
              <td><span class="acc-origin" [class.acc-origin--manual]="e.origin === 'Manual'">{{ e.kind === 'Apertura' ? 'Saldos iniciales' : e.origin }}</span></td>
              <td class="r"><strong>{{ money(total(e)) }}</strong></td>
              <td><span class="rsv-badge" [ngClass]="badge[e.status]">{{ e.status }}</span></td>
            </tr>
            <tr *ngIf="!filtered.length"><td colspan="7" class="kit-empty">No hay comprobantes con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="acc-note" *ngIf="filtered.length">{{ filtered.length }} comprobante{{ filtered.length === 1 ? '' : 's' }}</p>
    </section>

    <aside class="kit-aside" *ngIf="selected as e">
      <section class="kit-card">
        <div class="mvs-head">
          <div><span>{{ title(e.kind) }}</span><strong>{{ e.number }}</strong></div>
          <span class="rsv-badge" [ngClass]="badge[e.status]">{{ e.status }}</span>
        </div>
        <dl class="mvs-facts">
          <div><dt>Fecha</dt><dd>{{ dmy(e.date) }} · {{ e.time }}</dd></div>
          <div><dt>Concepto</dt><dd>{{ e.concept }}</dd></div>
          <div *ngIf="e.third"><dt>Tercero</dt><dd>{{ e.third }}{{ e.thirdDoc ? ' · ' + e.thirdDoc : '' }}</dd></div>
          <div *ngIf="e.method"><dt>Forma de pago</dt><dd>{{ e.method }}</dd></div>
          <div *ngIf="e.invoiceRef"><dt>Factura que afecta</dt><dd>{{ e.invoiceRef }}{{ e.noteReason ? ' · ' + e.noteReason : '' }}</dd></div>
          <div><dt>Origen</dt><dd>{{ e.origin }}{{ e.sourceRef ? ' · ' + e.sourceRef : '' }}</dd></div>
          <div><dt>Registró</dt><dd>{{ e.createdBy }}</dd></div>
          <div *ngIf="e.annulment"><dt>Anulación</dt><dd>{{ e.annulment.reason }}</dd></div>
        </dl>
        <div class="mvs-lines-head"><span>Partidas · {{ e.lines.length }}</span><span>Valor</span></div>
        <ul class="mvs-lines">
          <li *ngFor="let l of e.lines" [class.cr]="l.credit > 0">
            <div class="mvs-l-main">
              <div class="mvs-l-acc"><code>{{ l.account }}</code><strong>{{ accName(l.account) }}</strong></div>
              <div class="mvs-l-meta">
                <span class="mvs-chip" *ngIf="l.costCenter">{{ ccLabel(l.costCenter) }}</span>
                <span *ngIf="l.detail && l.detail !== accName(l.account)">{{ l.detail }}</span>
                <span *ngIf="l.third && l.third !== e.third">{{ l.third }}{{ l.thirdDoc ? ' · ' + l.thirdDoc : '' }}</span>
              </div>
            </div>
            <div class="mvs-l-amt"><small>{{ l.debit ? 'Débito' : 'Crédito' }}</small><b>{{ money(l.debit || l.credit) }}</b></div>
          </li>
        </ul>
        <div class="mvs-totals" [class.bad]="total(e) !== credits(e)">
          <span>Sumas iguales</span>
          <div><small>Débitos</small><b>{{ money(total(e)) }}</b></div>
          <div><small>Créditos</small><b>{{ money(credits(e)) }}</b></div>
        </div>
        <h3 class="mvs-sub">Documentos soporte</h3>
        <ul class="mvs-files" *ngIf="e.files?.length">
          <li *ngFor="let f of e.files">
            <span class="mvs-file-ico">{{ f.type === 'application/pdf' ? 'PDF' : 'IMG' }}</span>
            <div><b>{{ f.name }}</b><small>{{ size(f.size) }} · {{ dm(f.at.slice(0, 10)) }} {{ f.at.slice(11, 16) }}{{ f.by ? ' · ' + f.by : '' }}</small></div>
            <button type="button" class="rsv-btn rsv-btn--outline mvs-mini" (click)="openFile(e, f)">Ver</button>
            <button type="button" class="rsv-btn rsv-btn--danger-outline mvs-mini" *ngIf="svc.canEdit && e.status !== 'Anulado'" [disabled]="busy" (click)="removeFile(e, f)" title="Quitar archivo">✕</button>
          </li>
        </ul>
        <div class="mvs-docs" *ngIf="e.supports.length"><span *ngFor="let s of e.supports" title="Referencia sin archivo">{{ s }}</span></div>
        <p class="acc-note" *ngIf="!e.files?.length && !e.supports.length">Sin documento soporte.</p>
        <label class="acc-file mvs-add" *ngIf="svc.canCreate && e.status !== 'Anulado' && (e.files?.length ?? 0) < 5">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>{{ busy ? 'Guardando…' : 'Agregar soporte (PDF o imagen, máx. 5 MB)' }}
          <input type="file" [accept]="accept" [disabled]="busy" (change)="addFile(e, $event)"></label>
        <p class="acc-note" *ngIf="e.status === 'Provisional'">Valor provisional: el registro de origen sigue en borrador en su módulo.</p>
        <p class="acc-note" *ngIf="e.observations">{{ e.observations }}</p>
        <div class="mvs-actions">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(e)">Imprimir</button>
          <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/accounting/ledger" [queryParams]="{ cuenta: e.lines[0].account, periodo: e.date.slice(0, 7) }">Ver en libro mayor</a>
          <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="e.status === 'Borrador' && svc.canEdit" [disabled]="busy" (click)="post(e)">Contabilizar</button>
          <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="e.origin === 'Manual' && e.status !== 'Anulado' && svc.canAnnul && !svc.isClosed(e.date)" (click)="annulTarget = e; reason = ''">Anular</button>
        </div>
        <p class="acc-note" *ngIf="e.origin !== 'Manual'">Los comprobantes integrados se corrigen o anulan en el módulo de {{ e.origin }}.</p>
        <p class="acc-note" *ngIf="svc.isClosed(e.date)">El mes de este comprobante está cerrado.</p>
      </section>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="annulTarget as e" (click)="annulTarget = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="an-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="an-title">¿Anular {{ e.number }}?</h2>
      <p class="rsv-modal-desc">El comprobante se conserva con estado Anulado y deja de afectar los saldos.</p>
      <label class="kit-field">Motivo<textarea class="rsv-input" rows="2" [(ngModel)]="reason"></textarea></label>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="annulTarget = undefined">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="reason.trim().length < 5 || busy" (click)="annul()">Anular</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .mvs-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .mvs-tabs button { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border: none; border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #1F2937; cursor: pointer; }
    .mvs-tabs button span { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; background: #EEF1F5; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
    .mvs-tabs button.active { background: #0A3D6D; color: #fff; }
    .mvs-tabs button.active span { background: #1F5A8E; }
    .mvs-filters { display: flex; gap: 10px; flex-wrap: wrap; }
    .mvs-filters .kit-search input { height: 46px; }
    .mvs-layout { grid-template-columns: minmax(0, 1fr) 420px; }
    .mvs-lines-head { display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6B7280; padding: 0 4px 6px; border-bottom: 1px solid #E6EBF2; }
    .mvs-lines { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow-y: auto; }
    .mvs-lines li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 4px; border-bottom: 1px solid #EEF1F5; border-left: 3px solid #1565C0; padding-left: 10px; }
    .mvs-lines li.cr { border-left-color: #D98A0B; }
    .mvs-l-main { min-width: 0; }
    .mvs-l-acc { display: flex; gap: 8px; align-items: baseline; }
    .mvs-l-acc code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; font-weight: 700; color: #0A2540; }
    .mvs-l-acc strong { font-size: 12.5px; font-weight: 600; color: #1F2937; }
    .mvs-l-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 11px; color: #6B7280; align-items: center; }
    .mvs-chip { background: #E3EEFF; color: #1D4ED8; border-radius: 999px; padding: 1px 8px; font-weight: 600; font-size: 10.5px; white-space: nowrap; }
    .mvs-l-amt { text-align: right; white-space: nowrap; display: flex; flex-direction: column; justify-content: center; }
    .mvs-l-amt small { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #1565C0; }
    .mvs-lines li.cr .mvs-l-amt small { color: #B45309; }
    .mvs-l-amt b { font-size: 13px; color: #0A2540; }
    .mvs-totals { display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: center; background: #ECFDF3; border-radius: 10px; padding: 10px 12px; margin-top: 10px; font-size: 12px; font-weight: 700; color: #0A2540; }
    .mvs-totals.bad { background: #FEF2F2; color: #B91C1C; }
    .mvs-totals div { text-align: right; display: flex; flex-direction: column; }
    .mvs-totals small { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; }
    @media (max-width: 1200px) { .mvs-layout { grid-template-columns: 1fr; } }
    .mvs-nowrap { white-space: nowrap; }
    .mvs-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .mvs-head span:first-child { display: block; font-size: 10.5px; text-transform: uppercase; color: #6B7280; }
    .mvs-head strong { font-family: ui-monospace, 'Consolas', monospace; font-size: 16px; color: #0A2540; }
    .mvs-facts { margin: 0 0 12px; padding: 10px 12px; background: #F4F7FB; border-radius: 10px; font-size: 12px; }
    .mvs-facts div { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
    .mvs-facts dt { color: #6B7280; } .mvs-facts dd { margin: 0; font-weight: 600; color: #0A2540; text-align: right; }
    .mvs-sub { margin: 14px 0 6px; font-size: 13px; color: #0A2540; }
    .mvs-files { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .mvs-files li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #E6EBF2; border-radius: 10px; background: #FAFBFD; }
    .mvs-files div { flex: 1; min-width: 0; }
    .mvs-files b { display: block; font-size: 12.5px; color: #0A2540; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mvs-files small { font-size: 11px; color: #6B7280; }
    .mvs-file-ico { width: 34px; height: 34px; border-radius: 8px; background: #FDECEC; color: #B91C1C; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .mvs-mini { height: 30px; padding: 0 10px; font-size: 12px; }
    .mvs-add { margin-top: 8px; }
    .mvs-docs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .mvs-docs span { padding: 5px 10px; border: 1px solid #D5DEEA; border-radius: 999px; font-size: 11.5px; }
    .mvs-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .mvs-actions .rsv-btn { height: 38px; padding: 0 10px; }
  `],
})
export class MovementsComponent {
  readonly tabs: Tab[] = ['Todos', 'Recibos de caja', 'Egresos', 'Notas de contabilidad', 'Notas crédito y débito'];
  readonly statuses: EntryStatus[] = ['Borrador', 'Provisional', 'Contabilizado', 'Anulado'];
  readonly badge = STATUS_BADGE;
  readonly money = fmtMoney;
  readonly dm = dm;
  readonly dmy = dmy;
  readonly name = periodName;
  readonly total = entryTotal;
  readonly size = fileSize;
  readonly accept = SUPPORT_ACCEPT;

  all: Entry[] = [];
  filtered: Entry[] = [];
  periods: string[] = [];
  counts = {} as Record<Tab, number>;
  tab: Tab = 'Todos';
  search = '';
  period: string;
  from: string;
  to: string;
  status = '';
  selected?: Entry;
  annulTarget?: Entry;
  reason = '';
  error = '';
  busy = false;

  // ── Documentos soporte ──
  async addFile(e: Entry, ev: Event): Promise<void> {
    let f: UploadFile | null;
    try { f = await readSupport(ev); } catch (err: any) { toast.error('Soporte no válido', err?.message); return; }
    if (!f) return;
    this.busy = true;
    try { await this.svc.addSupport(e.id, f); } catch { /* el aviso lo muestra el interceptor */ } finally { this.busy = false; }
  }

  openFile(e: Entry, f: SupportFile): void {
    this.svc.openSupport(e.id, f).catch(() => toast.error('No se pudo abrir el soporte', f.name));
  }

  async removeFile(e: Entry, f: SupportFile): Promise<void> {
    if (!confirm(`¿Quitar «${f.name}» del comprobante ${e.number}?`)) return;
    this.busy = true;
    try { await this.svc.removeSupport(e.id, f); } catch { /* el aviso lo muestra el interceptor */ } finally { this.busy = false; }
  }

  constructor(public svc: AccountingService, route: ActivatedRoute) {
    const wanted = route.snapshot.queryParamMap.get('id');
    const target = wanted ? svc.getById(wanted) : undefined;
    this.period = target?.date.slice(0, 7) ?? svc.openPeriod;
    this.from = monthStart(this.period);
    this.to = monthEnd(this.period);
    svc.getEntries().subscribe(list => {
      this.all = [...list].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`) || b.number.localeCompare(a.number));
      this.periods = svc.periods();
      this.selected = list.find(e => e.id === (this.selected?.id ?? wanted));
      this.apply();
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.annulTarget = undefined; }

  setPeriod(): void {
    this.from = monthStart(this.period);
    this.to = monthEnd(this.period);
    this.apply();
  }

  apply(): void {
    const q = this.search.trim().toLowerCase();
    const base = this.all.filter(e => (!this.from || e.date >= this.from) && (!this.to || e.date <= this.to) && (!this.status || e.status === this.status)
      && (!q || [e.number, e.concept, e.third, e.sourceRef ?? '', ...e.lines.map(l => `${l.account} ${this.accName(l.account)}`)].some(v => v.toLowerCase().includes(q))));
    this.tabs.forEach(t => this.counts[t] = base.filter(e => this.inTab(e, t)).length);
    this.filtered = base.filter(e => this.inTab(e, this.tab));
    if (!this.selected || !this.filtered.includes(this.selected)) this.selected = this.filtered.find(e => e.id === this.selected?.id) ?? this.filtered[0];
  }

  readonly title = docTitle;
  readonly ccLabel = costCenterLabel;
  private inTab(e: Entry, t: Tab): boolean { return t === 'Todos' || TAB_KINDS[t].includes(e.kind); }

  main(e: Entry): string { const c = mainAccount(e); return `${c.slice(0, 4)} · ${this.accName(c)}`; }
  accName(code: string): string { return accountByCode(code)?.name ?? code; }
  credits(e: Entry): number { return e.lines.reduce((s, l) => s + l.credit, 0); }

  async post(e: Entry): Promise<void> {
    this.error = '';
    this.busy = true;
    try { await this.svc.post(e.id); }
    catch (err: any) { this.error = `No se puede contabilizar ${e.number}: ${err?.error?.message ?? err?.message ?? 'error del servidor'}.`; }
    finally { this.busy = false; }
  }

  async annul(): Promise<void> {
    const target = this.annulTarget!;
    this.error = '';
    this.busy = true;
    try { await this.svc.annul(target.id, this.reason.trim()); }
    catch (err: any) { this.error = `No se puede anular ${target.number}: ${err?.error?.message ?? err?.message ?? 'error del servidor'}.`; }
    finally { this.busy = false; this.annulTarget = undefined; }
  }

  print(e: Entry): void { openDocument(`Comprobante ${e.number}`, voucherHtml(e, this.svc.issuer), true); }
}
