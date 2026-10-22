import { Component, inject } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { Product, STATUS_BADGE, productStatus, fmtQty } from '../inventory.model';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dmy } from '../inventory-format';

type Format = 'PDF' | 'Excel' | 'CSV';
interface Row { p: Product; entries: number; exits: number; adjust: number; }

@Component({
  selector: 'app-inventory-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Exportar</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Exportar información del inventario</h1>
      <p class="kit-sub">Para análisis, respaldo, auditorías y contabilidad. La exportación no modifica los datos.</p>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="done" role="status"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg><div>{{ done }}</div></div>

  <div class="ex-layout">
    <div class="kit-stack">
      <section class="kit-card">
        <h2 class="kit-card-title">1. Criterios</h2>
        <div class="kit-row2">
          <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" [max]="to" (ngModelChange)="build()"></label>
          <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" [min]="from" (ngModelChange)="build()"></label>
        </div>
        <p class="kit-field" style="margin: 12px 0 6px">Categorías</p>
        <div class="ex-cats">
          <label *ngFor="let c of categories" class="ex-check"><input type="checkbox" [checked]="cats.has(c)" (change)="toggleCat(c)"> {{ c }}</label>
        </div>
        <label class="kit-select" style="margin-top: 10px"><span>Proveedor</span>
          <select [(ngModel)]="supplier" (ngModelChange)="build()"><option value="">Todos</option><option *ngFor="let s of suppliers">{{ s }}</option></select></label>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">2. Información a incluir</h2>
        <label class="ex-check" *ngFor="let o of includeOptions"><input type="checkbox" [(ngModel)]="include[o.key]" (ngModelChange)="build()"> {{ o.label }}</label>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">3. Formato</h2>
        <div class="ex-formats" role="radiogroup">
          <button type="button" *ngFor="let f of formats" role="radio" [attr.aria-checked]="format === f" [class.active]="format === f" (click)="format = f">{{ f }}</button>
        </div>
        <button type="button" class="rsv-btn rsv-btn--primary ex-go" [disabled]="!rows.length || !anyInclude" (click)="export()">
          {{ !anyInclude ? 'Elige qué información incluir' : rows.length ? 'Exportar ' + rows.length + ' producto' + (rows.length === 1 ? '' : 's') : 'Sin datos para exportar' }}</button>
      </section>
    </div>

    <div class="kit-stack">
      <section class="kit-card">
        <div class="inv-head-row"><h2 class="kit-card-title">Vista previa</h2><span class="rsv-badge rsv-badge--info">{{ fileName }}</span></div>
        <dl class="ex-meta">
          <div><dt>Empresa</dt><dd>{{ company }}</dd></div><div><dt>Período</dt><dd>{{ dmy(from) }} – {{ dmy(to) }}</dd></div>
          <div><dt>Generado</dt><dd>{{ dmy(now) }} {{ now.slice(11, 16) }}</dd></div><div><dt>Usuario</dt><dd>{{ user }}</dd></div>
        </dl>
        <div class="kit-table-wrap" *ngIf="rows.length; else empty">
          <table class="kit-table">
            <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th>
              <th class="r" *ngIf="include.stock">Existencias</th><th class="r" *ngIf="include.entries">Entradas</th><th class="r" *ngIf="include.exits">Salidas</th>
              <th class="r" *ngIf="include.adjust">Ajustes</th><th *ngIf="include.stock">Estado</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of rows.slice(0, 12)">
                <td class="kit-mono">{{ r.p.code }}</td><td>{{ r.p.name }}</td><td class="kit-muted">{{ r.p.category }}</td>
                <td class="r" *ngIf="include.stock"><strong>{{ qty(r.p.stock) }} {{ r.p.unit }}</strong></td>
                <td class="r" *ngIf="include.entries">{{ r.entries ? qty(r.entries) : '—' }}</td><td class="r" *ngIf="include.exits">{{ r.exits ? qty(r.exits) : '—' }}</td>
                <td class="r" *ngIf="include.adjust">{{ r.adjust ? qty(r.adjust) : '—' }}</td>
                <td *ngIf="include.stock"><span class="rsv-badge" [ngClass]="badge[st(r.p)]">{{ st(r.p) }}</span></td>
              </tr>
            </tbody>
          </table>
          <p class="inv-hint">Mostrando {{ rows.length > 12 ? 12 : rows.length }} de {{ rows.length }} productos{{ include.detail ? ' · el archivo incluye además ' + detailCount + ' líneas de movimientos' : '' }}.</p>
        </div>
        <ng-template #empty><p class="kit-empty">No hay información disponible para exportar con los criterios seleccionados.</p></ng-template>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Exportaciones recientes</h2>
        <table class="kit-table"><thead><tr><th>Archivo</th><th>Período</th><th>Usuario</th><th>Fecha</th></tr></thead>
          <tbody><tr *ngFor="let x of svc.exportsLog.slice(0, 6)"><td>{{ x.file }}</td><td>{{ x.period }}</td><td>{{ x.user }}</td><td>{{ dmy(x.at) }} {{ x.at.slice(11, 16) }}</td></tr></tbody></table>
      </section>
    </div>
  </div>
  `,
  styles: [`
    .ex-layout { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 18px; align-items: start; }
    .ex-cats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; }
    .ex-check { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; cursor: pointer; }
    .ex-check input { accent-color: #0B6FD0; }
    .ex-formats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .ex-formats button { height: 44px; border: 1px solid #D5DEEA; border-radius: 10px; background: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .ex-formats button.active { border: 2px solid #0B6FD0; background: #F5F9FE; color: #0B6FD0; }
    .ex-go { width: 100%; height: 48px; }
    .ex-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin: 0 0 12px; padding: 10px 12px; background: #F4F7FB; border-radius: 10px; font-size: 12px; }
    .ex-meta div { display: flex; gap: 6px; } .ex-meta dt { color: #6B7280; } .ex-meta dd { margin: 0; font-weight: 600; color: #0A2540; }
    @media (max-width: 1000px) { .ex-layout { grid-template-columns: 1fr; } }
  `],
})
export class ExportComponent {
  private hotel = inject(HotelService);
  get company(): string { return this.hotel.name; }
  readonly formats: Format[] = ['PDF', 'Excel', 'CSV'];
  readonly badge = STATUS_BADGE;
  readonly qty = fmtQty;
  readonly dmy = dmy;
  get user(): string { return this.svc.actorName; }
  readonly includeOptions: { key: 'stock' | 'entries' | 'exits' | 'adjust' | 'detail'; label: string }[] = [
    { key: 'stock', label: 'Existencias actuales y estado' }, { key: 'entries', label: 'Entradas' }, { key: 'exits', label: 'Salidas' },
    { key: 'adjust', label: 'Ajustes' }, { key: 'detail', label: 'Detalle de cada movimiento' },
  ];

  from = `${isoDate(0).slice(0, 7)}-01`;
  to = isoDate(0);
  categories: string[] = [];
  suppliers: string[] = [];
  cats = new Set<string>();
  supplier = '';
  include = { stock: true, entries: true, exits: true, adjust: true, detail: false };
  format: Format = 'Excel';
  rows: Row[] = [];
  detailCount = 0;
  now = isoDateTime();
  done = '';

  constructor(public svc: InventoryService) {
    svc.getProducts().subscribe(list => {
      this.categories = [...new Set(list.map(p => p.category))];
      this.suppliers = [...new Set(list.map(p => p.supplier))].sort();
      if (!this.cats.size) this.cats = new Set(['Alimentos', 'Bebidas'].filter(c => this.categories.includes(c)));
      this.build();
    });
  }

  get anyInclude(): boolean { return Object.values(this.include).some(Boolean); }
  get fileName(): string {
    const scope = this.cats.size && this.cats.size < this.categories.length ? [...this.cats].join(' y ').toLowerCase() : 'completo';
    return `Inventario ${scope} · ${dmy(this.to).slice(3)}.${this.format === 'Excel' ? 'xlsx' : this.format.toLowerCase()}`;
  }

  st(p: Product) { return productStatus(p, isoDate(0), this.svc.config.expiryDays); }

  toggleCat(c: string): void {
    this.cats.has(c) ? this.cats.delete(c) : this.cats.add(c);
    this.build();
  }

  build(): void {
    this.now = isoDateTime();
    const moves = this.svc.movementsSnapshot().filter(m => m.date >= this.from && m.date <= this.to);
    const sum = (id: string, kind: string) => moves.filter(m => m.kind === kind).reduce((s, m) => s + m.lines.filter(l => l.productId === id).reduce((a, l) => a + l.qty, 0), 0);
    this.rows = this.svc.productsSnapshot().filter(p => (!this.cats.size || this.cats.has(p.category)) && (!this.supplier || p.supplier === this.supplier))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(p => ({ p, entries: round(sum(p.id, 'Entrada')), exits: round(-sum(p.id, 'Salida')), adjust: round(sum(p.id, 'Ajuste')) }));
    const ids = new Set(this.rows.map(r => r.p.id));
    this.detailCount = moves.reduce((s, m) => s + m.lines.filter(l => ids.has(l.productId)).length, 0);
  }

  private table(): unknown[][] {
    const head = ['Código', 'Producto', 'Categoría', ...(this.include.stock ? ['Existencias', 'Unidad', 'Mínimo', 'Costo unitario', 'Valor', 'Estado'] : []),
      ...(this.include.entries ? ['Entradas'] : []), ...(this.include.exits ? ['Salidas'] : []), ...(this.include.adjust ? ['Ajustes'] : [])];
    const out: unknown[][] = [head, ...this.rows.map(r => [r.p.code, r.p.name, r.p.category,
      ...(this.include.stock ? [r.p.stock, r.p.unit, r.p.minStock, r.p.unitCost, r.p.stock * r.p.unitCost, this.st(r.p)] : []),
      ...(this.include.entries ? [r.entries] : []), ...(this.include.exits ? [r.exits] : []), ...(this.include.adjust ? [r.adjust] : [])])];
    if (this.include.detail) {
      const ids = new Set(this.rows.map(r => r.p.id));
      out.push([], ['Movimiento', 'Fecha', 'Tipo', 'Motivo', 'Código', 'Producto', 'Cantidad', 'Antes', 'Después', 'Costo unitario', 'Usuario']);
      this.svc.movementsSnapshot().filter(m => m.date >= this.from && m.date <= this.to).forEach(m => m.lines.filter(l => ids.has(l.productId))
        .forEach(l => out.push([m.number, dmy(m.date), m.kind, l.reason || m.reason, l.code, l.name, l.qty, l.before, l.after, l.unitCost, m.user])));
    }
    return out;
  }

  export(): void {
    const t = this.table();
    if (this.format === 'PDF') {
      openDocument(this.fileName, `
        <header><div><h1>${esc(this.fileName.replace(/\.\w+$/, ''))}</h1><div class="muted">${esc(this.company)} · ${dmy(this.from)} – ${dmy(this.to)} · ${esc(this.user)}</div></div><div class="brand">SOGO</div></header>
        <table>${t.map((r, i) => `<tr>${r.map(v => i === 0 || (r.length && typeof r[0] === 'string' && r[0] === 'Movimiento') ? `<th>${esc(v)}</th>` : `<td${typeof v === 'number' ? ' class="r"' : ''}>${typeof v === 'number' ? fmtQty(v) : esc(v)}</td>`).join('')}</tr>`).join('')}</table>`, true);
    } else {
      // Excel abre el CSV (punto y coma + BOM) en columnas
      downloadCsvFile(t, `${this.fileName.replace(/\.\w+$/, '').replace(/[ ·]+/g, '-').toLowerCase()}${this.format === 'Excel' ? '-excel' : ''}.csv`);
    }
    this.svc.logExport(this.fileName, `${dmy(this.from)} – ${dmy(this.to)}`);
    this.done = `${this.fileName} generado · ${this.rows.length} productos${this.include.detail ? ` y ${this.detailCount} líneas de movimientos` : ''}.`;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
