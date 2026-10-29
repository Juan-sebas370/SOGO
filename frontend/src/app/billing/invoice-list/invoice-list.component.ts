import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { BillingConfigService } from '../billing-config.service';
import { Invoice, InvoiceState, DianStatus, isValidInvoice } from '../invoice.model';
import { STATE_BADGE, DIAN_BADGE, timeOf, dayMonth } from '../billing-format';
import { Reservation } from '../../reservations/reservation.model';
import { fmtDate, fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';

type Tab = 'Todas' | 'Emitidas' | 'Pendientes' | 'Pagadas' | 'Vencidas' | 'Anuladas' | 'Borradores';
const TAB_STATE: Record<Exclude<Tab, 'Todas'>, InvoiceState> = {
  'Emitidas': 'Emitida', 'Pendientes': 'Pendiente', 'Pagadas': 'Pagada', 'Vencidas': 'Vencida', 'Anuladas': 'Anulada', 'Borradores': 'Borrador',
};
const PAGE_SIZE = 10;
const defaultFilters = () => ({ search: '', from: isoDate(-29), to: isoDate(0), state: '' as InvoiceState | '', dian: '' as DianStatus | '' });

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-list.component.css'],
  template: `
  <nav class="bil-crumb" aria-label="Ruta"><span>Facturación</span></nav>
  <header class="bil-head">
    <div class="bil-head-main">
      <span class="bil-head-icon">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </span>
      <div>
        <h1 class="bil-title">Facturación electrónica</h1>
        <p class="bil-subtitle">Consulta, emite y envía las facturas de las estadías y consumos del hospedaje.</p>
      </div>
    </div>
    <div class="bil-head-actions">
      <a *ngIf="can('Generar factura')" routerLink="/dashboard/billing/new" class="rsv-btn rsv-btn--primary">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva factura
      </a>
      <a *ngIf="can('Generar reportes')" routerLink="/dashboard/billing/reports" class="rsv-btn rsv-btn--outline">
        <svg viewBox="0 0 24 24"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>
        Reportes
      </a>
      <a *ngIf="can('Configurar integración')" routerLink="/dashboard/billing/settings" class="rsv-btn rsv-btn--outline">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Impuestos y DIAN
      </a>
    </div>
  </header>

  <!-- Indicadores -->
  <section class="bil-kpis">
    <div class="bil-kpi">
      <span class="bil-kpi-icon bil-kpi-icon--blue"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
      <div>
        <span class="bil-kpi-label">Facturado ({{ monthLabel }})</span>
        <strong>{{ money(kpi.billed) }}</strong>
        <small>{{ kpi.validCount }} factura{{ kpi.validCount === 1 ? '' : 's' }} válida{{ kpi.validCount === 1 ? '' : 's' }} · {{ kpi.annulled }} anulada{{ kpi.annulled === 1 ? '' : 's' }}</small>
      </div>
    </div>
    <button type="button" class="bil-kpi" (click)="setTab('Pendientes')">
      <span class="bil-kpi-icon bil-kpi-icon--amber"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></span>
      <div>
        <span class="bil-kpi-label">Por cobrar</span>
        <strong>{{ money(kpi.receivable) }}</strong>
        <small>{{ kpi.receivableCount }} factura{{ kpi.receivableCount === 1 ? '' : 's' }} · {{ kpi.overdue }} vencida{{ kpi.overdue === 1 ? '' : 's' }}</small>
      </div>
    </button>
    <button type="button" class="bil-kpi" (click)="quickDian('Aceptada')">
      <span class="bil-kpi-icon bil-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
      <div>
        <span class="bil-kpi-label">Aceptadas DIAN</span>
        <strong>{{ kpi.accepted }} de {{ kpi.issued }}</strong>
        <small>{{ kpi.validating }} en validación</small>
      </div>
    </button>
    <button type="button" class="bil-kpi" (click)="quickDian('Rechazada')">
      <span class="bil-kpi-icon bil-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span>
      <div>
        <span class="bil-kpi-label">Rechazadas DIAN</span>
        <strong>{{ kpi.rejected }}</strong>
        <small>{{ kpi.rejected ? 'Requiere corrección' : 'Sin rechazos' }}</small>
      </div>
    </button>
    <div class="bil-kpi">
      <span class="bil-kpi-icon bil-kpi-icon--purple"><svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></span>
      <div>
        <span class="bil-kpi-label">Check-outs por facturar</span>
        <strong>{{ pendingCheckouts.length }}</strong>
        <small class="inv-pending-codes">
          <ng-container *ngIf="pendingCheckouts.length; else none">
            <a *ngFor="let r of pendingCheckouts.slice(0, 3); let last = last" routerLink="/dashboard/billing/new" [queryParams]="{ reserva: r.code }">{{ shortCode(r.code) }}{{ last ? '' : ' ·' }}</a>
          </ng-container>
          <ng-template #none>Todas facturadas</ng-template>
        </small>
      </div>
    </div>
  </section>

  <!-- Configuración incompleta: no se puede emitir -->
  <div class="bil-alert bil-alert--warn" *ngIf="blockers.length" role="status">
    <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <p><strong>Antes de emitir facturas completa la configuración.</strong> {{ blockers.join(' ') }}</p>
    <a class="bil-alert-btn" *ngIf="can('Configurar integración')" routerLink="/dashboard/billing/settings">Completar</a>
  </div>

  <!-- Factura rechazada por la DIAN -->
  <div class="bil-alert" *ngIf="rejected[0] as bad" role="alert">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <p>
      <strong>{{ bad.number }} fue rechazada por la DIAN.</strong>
      Motivo informado por el proveedor: {{ bad.rejectionReason }}. Corrige los datos fiscales y reenvía.
      <ng-container *ngIf="rejected.length > 1">Hay {{ rejected.length - 1 }} factura{{ rejected.length > 2 ? 's' : '' }} más rechazada{{ rejected.length > 2 ? 's' : '' }}.</ng-container>
    </p>
    <a class="bil-alert-btn" [routerLink]="['/dashboard/billing', bad.id, 'corregir']">Corregir y reenviar</a>
  </div>

  <section class="bil-card inv-board">
    <nav class="bil-tabs" aria-label="Filtrar por estado">
      <button type="button" *ngFor="let t of visibleTabs" class="bil-tab" [class.active]="tab === t" (click)="setTab(t)">
        {{ t }} <span class="bil-tab-count">{{ counts[t] }}</span>
      </button>
    </nav>

    <div class="bil-filters">
      <div class="bil-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="f.search" (ngModelChange)="apply()" placeholder="Buscar por n.º de factura, huésped, documento o código">
      </div>

      <div class="inv-date" data-popover>
        <button type="button" class="bil-select" (click)="dateOpen = !dateOpen" [attr.aria-expanded]="dateOpen">
          <span class="bil-select-label">Fecha de emisión</span>
          <span class="bil-select-value">{{ dateLabel }}</span>
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="bil-popover" *ngIf="dateOpen">
          <label>Desde<input type="date" class="rsv-input" [(ngModel)]="f.from" (ngModelChange)="apply()"></label>
          <label>Hasta<input type="date" class="rsv-input" [(ngModel)]="f.to" [min]="f.from" (ngModelChange)="apply()"></label>
          <button type="button" class="bil-clear inv-all-dates" (click)="f.from = ''; f.to = ''; apply()">Todas las fechas</button>
        </div>
      </div>

      <label class="bil-select">
        <span class="bil-select-label">Estado</span>
        <select [(ngModel)]="f.state" (ngModelChange)="apply()">
          <option value="">Todos</option>
          <option *ngFor="let s of states" [value]="s">{{ s }}</option>
        </select>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <label class="bil-select">
        <span class="bil-select-label">Estado DIAN</span>
        <select [(ngModel)]="f.dian" (ngModelChange)="apply()">
          <option value="">Todos</option>
          <option *ngFor="let s of dianStates" [value]="s">{{ s }}</option>
        </select>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </label>

      <button type="button" class="bil-clear" (click)="clear()">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        Limpiar filtros
      </button>
    </div>

    <div class="bil-table-wrap">
      <table class="bil-table inv-table">
        <thead>
          <tr>
            <th>N.º factura</th><th>Emisión</th><th>Huésped / cliente</th><th>Reserva</th><th class="num">Total</th>
            <th>Estado</th><th>DIAN</th><th>Enviada</th><th class="num">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let inv of paged">
            <td>
              <a class="bil-code" [routerLink]="detailLink(inv)" [queryParams]="detailQuery(inv)">{{ inv.number || 'Borrador' }}</a>
            </td>
            <td class="nowrap">{{ inv.issuedAt ? date(inv.issuedAt) : '—' }}<small>{{ inv.issuedAt ? time(inv.issuedAt) : 'Sin emitir' }}</small></td>
            <td>{{ inv.buyer.name }}<small>{{ inv.buyer.docType }} {{ inv.buyer.docNumber }}{{ inv.buyer.dv ? '-' + inv.buyer.dv : '' }}</small></td>
            <td><a class="bil-link nowrap" [routerLink]="['/dashboard/reservations', inv.reservationId]">{{ inv.reservationCode }}</a></td>
            <td class="num strong">{{ money(total(inv)) }}</td>
            <td>
              <span class="rsv-badge" [ngClass]="stateBadge[state(inv)]">{{ state(inv) }}</span>
              <small>{{ stateNote(inv) }}</small>
            </td>
            <td><span class="rsv-badge" [ngClass]="dianBadge[inv.dianStatus]">{{ inv.dianStatus === 'Borrador' ? '—' : inv.dianStatus }}</span></td>
            <td class="nowrap">{{ inv.sentVia ? inv.sentVia.channel + ' · ' + time(inv.sentVia.at) : '—' }}</td>
            <td>
              <div class="bil-actions">
                <a class="bil-icon-btn" [routerLink]="detailLink(inv)" [queryParams]="detailQuery(inv)"
                   [title]="inv.dianStatus === 'Borrador' ? 'Continuar borrador' : 'Ver detalle'" aria-label="Ver">
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </a>
                <a class="bil-icon-btn" [class.disabled]="!canShare(inv)" [routerLink]="canShare(inv) ? ['/facturas', inv.id, 'imprimir'] : null"
                   [queryParams]="{ pdf: 1 }" title="Descargar PDF" aria-label="Descargar PDF">
                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>
                <a class="bil-icon-btn" [class.disabled]="!canShare(inv) || inv.dianStatus !== 'Aceptada'"
                   [routerLink]="canShare(inv) && inv.dianStatus === 'Aceptada' ? ['/dashboard/billing', inv.id] : null"
                   [queryParams]="{ enviar: 'correo' }" title="Enviar por correo" aria-label="Enviar por correo">
                  <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
                </a>
              </div>
            </td>
          </tr>
          <tr *ngIf="!paged.length">
            <td colspan="9" class="bil-empty">
              No se encontraron facturas con los filtros aplicados.
              <button type="button" class="bil-link inv-empty-btn" (click)="clear()">Limpiar filtros</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="bil-pagination">
      <span>Mostrando {{ paged.length }} de {{ filtered.length }} factura{{ filtered.length === 1 ? '' : 's' }}</span>
      <div class="bil-pag-btns">
        <button type="button" class="bil-pag-btn" [disabled]="page === 1" (click)="setPage(page - 1)">Anterior</button>
        <button type="button" *ngFor="let p of pages" class="bil-pag-btn" [class.active]="p === page" (click)="setPage(p)">{{ p }}</button>
        <button type="button" class="bil-pag-btn" [disabled]="page === totalPages" (click)="setPage(page + 1)">Siguiente</button>
      </div>
    </footer>
  </section>
  `
})
export class InvoiceListComponent {

  readonly states: InvoiceState[] = ['Emitida', 'Pendiente', 'Pagada', 'Vencida', 'Anulada', 'Borrador'];
  readonly dianStates: DianStatus[] = ['En validación', 'Aceptada', 'Rechazada'];
  readonly stateBadge = STATE_BADGE;
  readonly dianBadge = DIAN_BADGE;
  readonly money = fmtMoney;
  readonly date = fmtDate;
  readonly time = timeOf;

  all: Invoice[] = [];
  filtered: Invoice[] = [];
  paged: Invoice[] = [];
  rejected: Invoice[] = [];
  pendingCheckouts: Reservation[] = [];

  tab: Tab = 'Todas';
  counts = {} as Record<Tab, number>;
  f = defaultFilters();
  dateOpen = false;

  page = 1;
  totalPages = 1;
  pages: number[] = [];

  monthLabel = new Date().toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  kpi = { billed: 0, validCount: 0, annulled: 0, receivable: 0, receivableCount: 0, overdue: 0, accepted: 0, issued: 0, validating: 0, rejected: 0 };

  constructor(private svc: InvoiceService, private config: BillingConfigService, private host: ElementRef<HTMLElement>) {
    this.svc.getAll().subscribe(list => {
      this.all = [...list].sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9'));
      this.rejected = this.all.filter(i => isValidInvoice(i) && i.dianStatus === 'Rechazada');
      this.pendingCheckouts = this.svc.pendingCheckouts();
      this.computeKpis();
      this.apply(false);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-popover]') || !this.host.nativeElement.contains(target)) this.dateOpen = false;
  }

  can(action: Parameters<BillingConfigService['can']>[0]): boolean { return this.config.can(action); }
  get blockers(): string[] { return this.config.issueBlockers(); }
  total(inv: Invoice): number { return this.svc.total(inv); }
  state(inv: Invoice): InvoiceState { return this.svc.state(inv); }
  canShare(inv: Invoice): boolean { return inv.dianStatus !== 'Borrador' && this.can('Descargar y enviar'); }
  shortCode(code: string): string { return code.replace(/^RSV-\d{4}-/, 'RSV-'); }

  /** Borradores se retoman en el asistente; las emitidas abren su detalle. */
  detailLink(inv: Invoice): unknown[] { return inv.dianStatus === 'Borrador' ? ['/dashboard/billing/new'] : ['/dashboard/billing', inv.id]; }
  detailQuery(inv: Invoice): Record<string, string> | null { return inv.dianStatus === 'Borrador' ? { borrador: inv.id } : null; }

  /** Segunda línea del estado: qué falta o cómo se pagó. */
  stateNote(inv: Invoice): string {
    const balance = this.svc.balance(inv);
    const paid = this.svc.paid(inv);
    switch (this.state(inv)) {
      case 'Borrador': return 'Sin emitir';
      case 'Anulada':  return `Nota crédito ${inv.annulment!.creditNote}`;
      case 'Vencida':  return `Venció el ${dayMonth(inv.dueDate)}`;
      case 'Pagada': {
        if (inv.lines.some(l => l.included && l.category === 'Alojamiento' && l.taxRate === 0)) return 'IVA exento · no residente';
        return this.svc.lastPaymentMethod(inv) ?? 'Pagada';
      }
      default: return paid > 0 ? `Saldo ${fmtMoney(balance)}` : 'Sin pago registrado';
    }
  }

  // ── Filtros y tabs ──
  get visibleTabs(): Tab[] {
    const tabs: Tab[] = ['Todas', 'Emitidas', 'Pendientes', 'Pagadas', 'Vencidas', 'Anuladas'];
    return this.counts['Borradores'] ? [...tabs, 'Borradores'] : tabs;
  }

  get dateLabel(): string {
    if (!this.f.from && !this.f.to) return 'Todas las fechas';
    return `${this.f.from ? dayMonth(this.f.from) : '…'} – ${this.f.to ? fmtDate(this.f.to) : '…'}`;
  }

  private inTab(inv: Invoice, t: Tab): boolean {
    if (t === 'Todas') return inv.dianStatus !== 'Borrador';
    return this.state(inv) === TAB_STATE[t];
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.apply();
  }

  quickDian(d: DianStatus): void {
    this.f = { ...defaultFilters(), from: '', to: '', dian: d };
    this.tab = 'Todas';
    this.apply();
  }

  clear(): void {
    this.f = defaultFilters();
    this.tab = 'Todas';
    this.apply();
  }

  apply(resetPage = true): void {
    const q = this.f.search.trim().toLowerCase();
    const base = this.all.filter(inv => {
      const day = (inv.issuedAt ?? isoDate(0)).slice(0, 10);
      return (!q || [inv.number, inv.buyer.name, inv.buyer.docNumber, inv.reservationCode].some(v => v.toLowerCase().includes(q))) &&
        (!this.f.from || day >= this.f.from) && (!this.f.to || day <= this.f.to) &&
        (!this.f.state || this.state(inv) === this.f.state) &&
        (!this.f.dian || inv.dianStatus === this.f.dian);
    });
    (['Todas', 'Emitidas', 'Pendientes', 'Pagadas', 'Vencidas', 'Anuladas', 'Borradores'] as Tab[])
      .forEach(t => this.counts[t] = base.filter(inv => this.inTab(inv, t)).length);
    this.filtered = base.filter(inv => this.inTab(inv, this.tab));
    if (resetPage) this.page = 1;
    this.paginate();
  }

  private paginate(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
    this.page = Math.min(this.page, this.totalPages);
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
    this.paged = this.filtered.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE);
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.paginate();
  }

  private computeKpis(): void {
    const month = isoDate(0).slice(0, 7);
    const issued = this.all.filter(i => i.dianStatus !== 'Borrador');
    const valid = issued.filter(isValidInvoice);
    const thisMonth = valid.filter(i => i.issuedAt!.startsWith(month));
    const open = valid.filter(i => this.svc.balance(i) > 0);
    this.kpi = {
      billed: thisMonth.reduce((s, i) => s + this.total(i), 0),
      validCount: thisMonth.length,
      annulled: issued.filter(i => i.annulment && i.issuedAt!.startsWith(month)).length,
      receivable: open.reduce((s, i) => s + this.svc.balance(i), 0),
      receivableCount: open.length,
      overdue: open.filter(i => this.state(i) === 'Vencida').length,
      accepted: issued.filter(i => i.dianStatus === 'Aceptada').length,
      issued: issued.length,
      validating: issued.filter(i => i.dianStatus === 'En validación').length,
      rejected: this.rejected.length,
    };
  }
}
