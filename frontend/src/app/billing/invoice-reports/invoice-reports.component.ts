import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice, InvoiceState, ConceptCategory, InvoiceTotals, computeTotals, lineNet } from '../invoice.model';
import { STATE_BADGE, dayMonth } from '../billing-format';
import { UsersService } from '../../users/users.service';
import { fmtDate, fmtDateTime, fmtMoney } from '../../reservations/reservation-format';
import { isoDate, isoDateTime } from '../../shared/date-utils';

type StateFilter = 'Todos excepto anuladas' | 'Todos' | InvoiceState;
interface Filters { from: string; to: string; state: StateFilter; client: string; service: ConceptCategory | ''; }
interface Row { inv: Invoice; state: InvoiceState; t: InvoiceTotals; }

const SERVICES: ConceptCategory[] = ['Alojamiento', 'Daños y faltantes', 'Lavandería', 'Eventos y pasadías', 'Otro'];

@Component({
  selector: 'app-invoice-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-reports.component.css'],
  template: `
  <nav class="bil-crumb no-print" aria-label="Ruta">
    <a routerLink="/dashboard/billing">Facturación</a><span>/</span><span>Reportes</span>
  </nav>
  <header class="bil-head">
    <div>
      <h1 class="bil-title">Reportes de facturación</h1>
      <p class="bil-subtitle">Consolida las facturas de un período para análisis financiero y contable.</p>
    </div>
    <div class="bil-head-actions no-print">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="print()">
        <svg viewBox="0 0 24 24" class="rep-red"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF
      </button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="exportExcel()">
        <svg viewBox="0 0 24 24" class="rep-green"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>Excel
      </button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="exportCsv()">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>CSV
      </button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="print()">
        <svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir
      </button>
    </div>
  </header>

  <!-- Filtros (se aplican con "Generar reporte") -->
  <section class="bil-card rep-filters no-print">
    <div class="rep-range">
      <span class="bil-select-label">Rango de fechas</span>
      <div>
        <input type="date" class="rsv-input" [(ngModel)]="draft.from" aria-label="Desde">
        <span>–</span>
        <input type="date" class="rsv-input" [(ngModel)]="draft.to" [min]="draft.from" aria-label="Hasta">
      </div>
    </div>
    <label class="bil-select">
      <span class="bil-select-label">Estado</span>
      <select [(ngModel)]="draft.state">
        <option *ngFor="let s of stateOptions" [value]="s">{{ s }}</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>
    <label class="bil-select">
      <span class="bil-select-label">Huésped / cliente</span>
      <select [(ngModel)]="draft.client">
        <option value="">Todos</option>
        <option *ngFor="let c of clients" [value]="c">{{ c }}</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>
    <label class="bil-select">
      <span class="bil-select-label">Tipo de servicio</span>
      <select [(ngModel)]="draft.service">
        <option value="">Todos</option>
        <option *ngFor="let s of services" [value]="s">{{ s }}</option>
      </select>
      <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
    </label>
    <button type="button" class="rsv-btn rsv-btn--primary rep-generate" (click)="generate()">Generar reporte</button>
  </section>
  <p class="rep-dirty no-print" *ngIf="dirty">Cambiaste los filtros: pulsa “Generar reporte” para actualizar.</p>

  <p class="rep-print-range">Período: {{ date(f.from) }} – {{ date(f.to) }} · {{ f.state }}{{ f.client ? ' · ' + f.client : '' }}{{ f.service ? ' · ' + f.service : '' }}</p>

  <!-- Totales -->
  <section class="rep-kpis">
    <div class="bil-card"><span>Total facturado</span><strong>{{ money(sum.total) }}</strong><small>{{ valid.length }} factura{{ valid.length === 1 ? '' : 's' }}{{ excludedAnnulled ? ' · ' + excludedAnnulled + ' anulada' + (excludedAnnulled === 1 ? '' : 's') + ' excluida' + (excludedAnnulled === 1 ? '' : 's') : '' }}</small></div>
    <div class="bil-card"><span>Valor antes de impuestos</span><strong>{{ money(sum.base) }}</strong><small>Base gravable del período</small></div>
    <div class="bil-card"><span>Impuestos</span><strong>{{ money(sum.iva + sum.inc) }}</strong><small>IVA {{ money(sum.iva) }} · INC {{ money(sum.inc) }}</small></div>
    <div class="bil-card"><span>Descuentos</span><strong>{{ money(sum.discounts) }}</strong><small>{{ promos }} promoci{{ promos === 1 ? 'ón aplicada' : 'ones aplicadas' }}</small></div>
  </section>

  <div class="rep-charts">
    <section class="bil-card">
      <div class="bil-card-head">
        <div><div><h2 class="bil-card-title">Facturación diaria · {{ dayMonth(f.from) }} al {{ dayMonth(f.to) }}</h2><span class="bil-card-sub">Total por fecha de emisión, sin anuladas (COP)</span></div></div>
        <button type="button" class="rsv-btn rsv-btn--outline rep-sm no-print" (click)="showDailyTable = !showDailyTable">{{ showDailyTable ? 'Ver gráfico' : 'Ver tabla' }}</button>
      </div>
      <div class="rep-bars" *ngIf="!showDailyTable" role="img" [attr.aria-label]="'Facturación diaria del período, máximo ' + money(maxDay)">
        <div class="rep-bar" *ngFor="let d of daily" [title]="date(d.date) + ' · ' + money(d.amount)">
          <span [style.height.%]="d.amount ? max(4, d.amount / maxDay * 100) : 0"></span>
          <small>{{ d.date.slice(8, 10) }}</small>
        </div>
      </div>
      <table class="bil-table" *ngIf="showDailyTable">
        <thead><tr><th>Fecha</th><th class="num">Facturas</th><th class="num">Total</th></tr></thead>
        <tbody>
          <tr *ngFor="let d of dailyWithValues"><td>{{ date(d.date) }}</td><td class="num">{{ d.count }}</td><td class="num strong">{{ money(d.amount) }}</td></tr>
          <tr *ngIf="!dailyWithValues.length"><td colspan="3" class="bil-empty">Sin facturación en el período.</td></tr>
        </tbody>
      </table>
    </section>

    <section class="bil-card">
      <h2 class="bil-card-title">Por tipo de servicio</h2>
      <span class="bil-card-sub">Valor antes de impuestos</span>
      <ul class="rep-services">
        <li *ngFor="let s of byService">
          <div><span>{{ s.name }}</span><span><strong>{{ money(s.amount) }}</strong> · {{ s.pct }}%</span></div>
          <span class="rep-track"><span [style.width.%]="s.pct"></span></span>
        </li>
        <li *ngIf="!byService.length" class="rep-muted">Sin datos en el período.</li>
      </ul>
      <p class="bil-note" *ngIf="generatedAt">Reporte generado el {{ dateTime(generatedAt) }} por {{ user }}. Queda registrado en auditoría.</p>
    </section>
  </div>

  <section class="bil-card rep-detail">
    <div class="bil-card-head">
      <h2 class="bil-card-title">Detalle del período</h2>
      <span class="bil-card-sub">{{ rows.length }} factura{{ rows.length === 1 ? '' : 's' }} · ordenadas por fecha de emisión</span>
    </div>
    <div class="bil-table-wrap">
      <table class="bil-table">
        <thead>
          <tr><th>N.º factura</th><th>Emisión</th><th>Huésped / cliente</th><th>Estado</th><th class="num">Antes de impuestos</th><th class="num">Descuentos</th><th class="num">Impuestos</th><th class="num">Total</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows" [class.rep-annulled]="row.state === 'Anulada'">
            <td><a class="bil-code" [routerLink]="['/dashboard/billing', row.inv.id]">{{ row.inv.number }}</a></td>
            <td>{{ date(row.inv.issuedAt!) }}</td>
            <td>{{ row.inv.buyer.name }}</td>
            <td><span class="rsv-badge" [ngClass]="stateBadge[row.state]">{{ row.state }}</span></td>
            <td class="num">{{ money(row.t.base) }}</td>
            <td class="num">{{ row.t.discounts ? money(row.t.discounts) : '—' }}</td>
            <td class="num">{{ money(row.t.iva + row.t.inc) }}</td>
            <td class="num strong">{{ money(row.t.total) }}</td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="8" class="bil-empty">No hay facturas con estos filtros.</td></tr>
        </tbody>
        <tfoot *ngIf="rows.length">
          <tr>
            <td colspan="4">Totales del período (sin anuladas)</td>
            <td class="num">{{ money(sum.base) }}</td>
            <td class="num">{{ money(sum.discounts) }}</td>
            <td class="num">{{ money(sum.iva + sum.inc) }}</td>
            <td class="num">{{ money(sum.total) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
  `
})
export class InvoiceReportsComponent {

  readonly stateOptions: StateFilter[] = ['Todos excepto anuladas', 'Todos', 'Emitida', 'Pendiente', 'Pagada', 'Vencida', 'Anulada'];
  readonly services = SERVICES;
  readonly stateBadge = STATE_BADGE;
  readonly money = fmtMoney;
  readonly date = fmtDate;
  readonly dateTime = fmtDateTime;
  readonly dayMonth = dayMonth;
  readonly max = Math.max;
  get user(): string { return this.audit.actor(); }

  draft: Filters = { from: isoDate(-29), to: isoDate(0), state: 'Todos excepto anuladas', client: '', service: '' };
  f: Filters = { ...this.draft };
  generatedAt = '';
  showDailyTable = false;

  clients: string[] = [];
  rows: Row[] = [];
  valid: Row[] = [];
  excludedAnnulled = 0;
  sum: InvoiceTotals = computeTotals([]);
  promos = 0;
  daily: { date: string; amount: number; count: number }[] = [];
  maxDay = 1;
  byService: { name: string; amount: number; pct: number }[] = [];

  constructor(private svc: InvoiceService, private audit: UsersService) {
    this.svc.getAll().subscribe(list => {
      this.clients = [...new Set(list.filter(i => i.dianStatus !== 'Borrador').map(i => i.buyer.name))].sort();
      this.compute();
    });
  }

  get dirty(): boolean { return JSON.stringify(this.draft) !== JSON.stringify(this.f); }
  get dailyWithValues() { return this.daily.filter(d => d.count); }

  generate(): void {
    this.f = { ...this.draft };
    this.generatedAt = isoDateTime();
    this.compute();
    this.audit.addLog('Reporte de facturación', `${fmtDate(this.f.from)} – ${fmtDate(this.f.to)} · ${this.f.state}`);
  }

  private compute(): void {
    const f = this.f;
    const issued = this.svc.getSnapshot().filter(i => i.dianStatus !== 'Borrador');
    const inRange = issued.filter(i => {
      const day = i.issuedAt!.slice(0, 10);
      return day >= f.from && day <= f.to && (!f.client || i.buyer.name === f.client);
    });
    // Con "Tipo de servicio" solo cuentan las líneas de ese servicio
    const rowsAll: Row[] = inRange
      .map(inv => ({ inv, state: this.svc.state(inv), t: computeTotals(f.service ? inv.lines.filter(l => l.category === f.service) : inv.lines) }))
      .filter(r => !f.service || r.t.count > 0)
      .sort((a, b) => b.inv.issuedAt!.localeCompare(a.inv.issuedAt!));

    this.rows = rowsAll.filter(r =>
      f.state === 'Todos' ? true : f.state === 'Todos excepto anuladas' ? r.state !== 'Anulada' : r.state === f.state);
    this.valid = this.rows.filter(r => r.state !== 'Anulada');
    this.excludedAnnulled = rowsAll.filter(r => r.state === 'Anulada').length;

    const add = (a: number, b: number) => a + b;
    this.sum = {
      count: this.valid.length,
      subtotal: this.valid.map(r => r.t.subtotal).reduce(add, 0),
      discounts: this.valid.map(r => r.t.discounts).reduce(add, 0),
      base: this.valid.map(r => r.t.base).reduce(add, 0),
      taxes: [],
      iva: this.valid.map(r => r.t.iva).reduce(add, 0),
      inc: this.valid.map(r => r.t.inc).reduce(add, 0),
      total: this.valid.map(r => r.t.total).reduce(add, 0),
    };
    this.promos = this.valid.reduce((s, r) => s + r.inv.lines.filter(l => l.included && l.discountPct > 0 && (!f.service || l.category === f.service)).length, 0);

    // Serie diaria del rango (máximo 62 días para que el gráfico sea legible)
    const days: string[] = [];
    for (let d = new Date(f.from + 'T00:00'); days.length < 62; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso > f.to) break;
      days.push(iso);
    }
    this.daily = days.map(day => {
      const those = this.valid.filter(r => r.inv.issuedAt!.startsWith(day));
      return { date: day, amount: those.reduce((s, r) => s + r.t.total, 0), count: those.length };
    });
    this.maxDay = Math.max(1, ...this.daily.map(d => d.amount));

    const byCat = new Map<string, number>();
    this.valid.forEach(r => r.inv.lines
      .filter(l => l.included && (!f.service || l.category === f.service))
      .forEach(l => byCat.set(l.category, (byCat.get(l.category) ?? 0) + lineNet(l))));
    const totalBase = [...byCat.values()].reduce(add, 0) || 1;
    this.byService = [...byCat].sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, pct: Math.round(amount / totalBase * 100) }));
  }

  // ── Exportación ──
  print(): void { window.print(); }

  private table(): string[][] {
    const head = ['N.º factura', 'Emisión', 'Huésped / cliente', 'Documento', 'Reserva', 'Estado', 'DIAN', 'Antes de impuestos', 'Descuentos', 'IVA', 'INC', 'Total'];
    const body = this.rows.map(r => [
      r.inv.number, fmtDate(r.inv.issuedAt!), r.inv.buyer.name, `${r.inv.buyer.docType} ${r.inv.buyer.docNumber}`, r.inv.reservationCode,
      r.state, r.inv.dianStatus, String(r.t.base), String(r.t.discounts), String(r.t.iva), String(r.t.inc), String(r.t.total),
    ]);
    const foot = ['Totales (sin anuladas)', '', '', '', '', '', '', String(this.sum.base), String(this.sum.discounts), String(this.sum.iva), String(this.sum.inc), String(this.sum.total)];
    return [head, ...body, foot];
  }

  private download(content: string, type: string, ext: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-facturacion-${this.f.from}_${this.f.to}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** CSV con punto y coma + BOM: Excel en español lo abre en columnas y con tildes. */
  exportCsv(): void {
    const csv = '﻿' + this.table().map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    this.download(csv, 'text/csv;charset=utf-8', 'csv');
  }

  /** Hoja de Excel (tabla HTML que Excel abre directamente como .xls). */
  exportExcel(): void {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = this.table().map((r, i) => `<tr>${r.map(v => i === 0 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${rows}</table></body></html>`;
    this.download(html, 'application/vnd.ms-excel', 'xls');
  }
}
