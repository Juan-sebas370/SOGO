import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { COST_CENTERS, Entry, accountByCode, balanceSheet, counts, equityResultRows, pnl, monthStart, monthEnd, periodName } from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDateTime } from '../../shared/date-utils';
import { dm, dmy } from '../accounting-format';
import { chartAccounts, chartHtml, chartRows } from '../chart-export';
import { CcResult, NO_CENTER, ccTotal, costCenterHtml, costCenterReport, costCenterRows } from '../cost-center-export';

type Kind = 'Ingresos' | 'Egresos' | 'Movimientos contables' | 'Balance y estados financieros' | 'Información consolidada' | 'Centros de costo' | 'Plan de cuentas';
type Format = 'PDF' | 'Excel' | 'CSV';
const KINDS: { kind: Kind; desc: string }[] = [
  { kind: 'Ingresos', desc: 'Comprobantes de ingreso y ventas' },
  { kind: 'Egresos', desc: 'Comprobantes de egreso' },
  { kind: 'Movimientos contables', desc: 'Libro diario con débitos y créditos' },
  { kind: 'Balance y estados financieros', desc: 'Balance general y estado de resultados' },
  { kind: 'Información consolidada', desc: 'Todo lo anterior en un solo archivo' },
  { kind: 'Plan de cuentas', desc: 'Todas las cuentas del PUC con clase, nivel, naturaleza y saldo' },
  { kind: 'Centros de costo', desc: 'Resultado de Alojamiento, Restaurante y cafetería y Administración' },
];

@Component({
  selector: 'app-accounting-export',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Exportar</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Exportar información contable</h1>
      <p class="kit-sub">Genera archivos para análisis, respaldo, auditorías y entidades de control. La exportación no modifica los datos.</p>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="done" role="status"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg><div>{{ done }}</div></div>

  <div class="exp-layout">
    <div class="kit-stack">
      <section class="kit-card">
        <h2 class="kit-card-title">1. {{ kind === 'Plan de cuentas' ? 'Saldos al corte' : 'Período contable' }}</h2>
        <div class="kit-row2">
          <label class="kit-select" *ngIf="kind !== 'Plan de cuentas'"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="build()"></label>
          <label class="kit-select"><span>{{ kind === 'Plan de cuentas' ? 'Corte' : 'Hasta' }}</span><input type="date" [(ngModel)]="to" [min]="kind === 'Plan de cuentas' ? '' : from" (ngModelChange)="build()"></label>
        </div>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">2. Información a exportar</h2>
        <label class="exp-opt" *ngFor="let k of kinds" [class.active]="kind === k.kind">
          <input type="radio" name="kind" [value]="k.kind" [(ngModel)]="kind" (ngModelChange)="build()">
          <span><strong>{{ k.kind }}</strong><small>{{ k.desc }}</small></span>
        </label>
        <div class="exp-chart" *ngIf="kind === 'Plan de cuentas'">
          <label class="kit-select"><span>Clase</span>
            <select [(ngModel)]="chartCls" (ngModelChange)="build()"><option value="">Todas</option><option *ngFor="let c of classes">{{ c }}</option></select></label>
          <label class="exp-check"><input type="checkbox" [(ngModel)]="chartInactive" (ngModelChange)="build()"> Incluir cuentas inactivas</label>
        </div>
        <div class="exp-chart" *ngIf="kind === 'Centros de costo'">
          <label class="kit-select"><span>Centro de costo</span>
            <select [(ngModel)]="center" (ngModelChange)="build()"><option value="">Los 3 centros (comparativo)</option><option *ngFor="let c of centers" [value]="c.code">{{ c.code }} {{ c.name }}</option></select></label>
          <label class="exp-check"><input type="checkbox" [(ngModel)]="ccLines" (ngModelChange)="build()"> Incluir cada movimiento</label>
        </div>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">3. Formato</h2>
        <div class="exp-formats" role="radiogroup">
          <button type="button" *ngFor="let f of formats" role="radio" [attr.aria-checked]="format === f" [class.active]="format === f" (click)="format = f">{{ f }}</button>
        </div>
        <button type="button" class="rsv-btn rsv-btn--primary exp-go" [disabled]="!count" (click)="export()">{{ count ? 'Exportar ' + count + ' ' + unit : 'Sin datos para exportar' }}</button>
      </section>
    </div>

    <div class="kit-stack">
      <section class="kit-card">
        <div class="acc-head-row"><h2 class="kit-card-title">Vista previa</h2><span class="rsv-badge rsv-badge--info">{{ fileName }}</span></div>
        <dl class="exp-meta">
          <div><dt>Empresa</dt><dd>{{ svc.company }}</dd></div>
          <div><dt>{{ kind === 'Plan de cuentas' ? 'Saldos al' : 'Período' }}</dt><dd>{{ kind === 'Plan de cuentas' ? dmy(to) : dmy(from) + ' – ' + dmy(to) }}</dd></div>
          <div><dt>Generado</dt><dd>{{ dmy(now) }} {{ now.slice(11, 16) }}</dd></div>
          <div><dt>Usuario</dt><dd>{{ user }}</dd></div>
        </dl>
        <ng-container *ngIf="kind === 'Centros de costo' && count">
          <div class="exp-cc">
            <div class="exp-cc-card" *ngFor="let c of ccPreview" [class.total]="c.code === 'TOTAL'" [class.warn]="c.code === noCenter">
              <span class="exp-cc-code">{{ c.code === 'TOTAL' ? 'Consolidado' : c.code === noCenter ? 'Revisar' : c.code }}</span>
              <strong>{{ c.name }}</strong>
              <dl>
                <div><dt>Ingresos</dt><dd>{{ money(c.income) }}</dd></div>
                <div><dt>Costos</dt><dd>{{ money(c.costs) }}</dd></div>
                <div><dt>Gastos</dt><dd>{{ money(c.expenses) }}</dd></div>
              </dl>
              <div class="exp-cc-result" [class.neg]="c.result < 0"><span>Resultado</span><b>{{ money(c.result) }}</b></div>
              <small>{{ c.margin === null ? 'Sin ingresos en el período' : 'Margen ' + pctLabel(c.margin) }}</small>
            </div>
          </div>
          <p class="acc-note" *ngIf="hasNoCenter">Hay movimientos sin centro de costo: aparecen en "Sin centro asignado". Corríjalos en el comprobante para que el informe quede completo.</p>
        </ng-container>
        <div class="kit-table-wrap" *ngIf="rows.length > 1; else empty">
          <table class="kit-table">
            <thead><tr><th *ngFor="let h of rows[0]">{{ h }}</th></tr></thead>
            <tbody><tr *ngFor="let r of rows.slice(1, 9)"><td *ngFor="let v of r" [class.r]="isNum(v)">{{ isNum(v) ? (v ? money(+v) : '') : v }}</td></tr></tbody>
          </table>
          <p class="acc-note">Mostrando {{ min(8, rows.length - 1) }} de {{ rows.length - 1 }} líneas · el archivo incluye todas, en el mismo orden y con las mismas cuentas del sistema.</p>
        </div>
        <ng-template #empty>
          <div class="exp-empty">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <strong>No hay información disponible</strong><span>No hay registros para exportar entre el {{ dmy(from) }} y el {{ dmy(to) }}.</span>
          </div>
        </ng-template>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Exportaciones recientes</h2>
        <table class="kit-table">
          <thead><tr><th>Archivo</th><th>Período</th><th>Usuario</th><th>Fecha</th></tr></thead>
          <tbody><tr *ngFor="let x of svc.exportsLog.slice(0, 6)"><td>{{ x.file }}</td><td>{{ x.period }}</td><td>{{ x.user }}</td><td>{{ dmy(x.at) }} {{ x.at.slice(11, 16) }}</td></tr></tbody>
        </table>
      </section>
    </div>
  </div>
  `,
  styles: [`
    .exp-layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 18px; align-items: start; }
    .exp-opt { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid #E6EBF2; border-radius: 12px; margin-bottom: 8px; cursor: pointer; }
    .exp-opt.active { border: 2px solid #0B6FD0; padding: 11px; background: #F5F9FE; }
    .exp-opt input { margin-top: 3px; accent-color: #0B6FD0; }
    .exp-chart { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; padding: 4px 2px 0; }
    .exp-chart .kit-select { min-width: 150px; }
    .exp-check { display: flex; align-items: center; gap: 8px; font-size: 13px; padding-bottom: 12px; cursor: pointer; }
    .exp-check input { accent-color: #0B6FD0; }
    .exp-opt strong { display: block; font-size: 13px; color: #0A2540; }
    .exp-opt small { font-size: 11.5px; color: #6B7280; }
    .exp-formats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .exp-formats button { height: 44px; border: 1px solid #D5DEEA; border-radius: 10px; background: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .exp-formats button.active { border: 2px solid #0B6FD0; background: #F5F9FE; color: #0B6FD0; }
    .exp-go { width: 100%; height: 48px; }
    .exp-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin: 0 0 12px; padding: 10px 12px; background: #F4F7FB; border-radius: 10px; font-size: 12px; }
    .exp-meta div { display: flex; gap: 6px; } .exp-meta dt { color: #6B7280; } .exp-meta dd { margin: 0; font-weight: 600; color: #0A2540; }
    .exp-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 30px; text-align: center; color: #6B7280; font-size: 12.5px; }
    .exp-empty svg { width: 30px; height: 30px; fill: none; stroke: #0B6FD0; stroke-width: 1.8; }
    .exp-empty strong { color: #0A2540; }
    .exp-cc { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .exp-cc-card { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid #E6EBF2; border-top: 3px solid #1565C0; border-radius: 12px; background: #fff; }
    .exp-cc-card.total { border-top-color: #0A2540; background: #F4F7FB; }
    .exp-cc-card.warn { border-top-color: #C2710A; }
    .exp-cc-code { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6B7280; }
    .exp-cc-card strong { font-size: 13px; color: #0A2540; }
    .exp-cc-card dl { margin: 4px 0 0; display: grid; gap: 2px; font-size: 12px; }
    .exp-cc-card dl div { display: flex; justify-content: space-between; gap: 8px; } .exp-cc-card dt { color: #6B7280; } .exp-cc-card dd { margin: 0; font-variant-numeric: tabular-nums; }
    .exp-cc-result { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; padding-top: 6px; border-top: 1px solid #E6EBF2; font-size: 12px; }
    .exp-cc-result b { font-size: 14px; color: #0A2540; font-variant-numeric: tabular-nums; } .exp-cc-result.neg b { color: #B42318; }
    .exp-cc-card small { font-size: 11px; color: #6B7280; }
    @media (max-width: 1000px) { .exp-layout { grid-template-columns: 1fr; } }
  `],
})
export class ExportComponent {
  readonly kinds = KINDS;
  readonly formats: Format[] = ['PDF', 'Excel', 'CSV'];
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly min = Math.min;
  get user(): string { return this.svc.actor; }

  from: string;
  to: string;
  kind: Kind = 'Movimientos contables';
  format: Format = 'Excel';
  rows: unknown[][] = [];
  count = 0;
  unit = 'movimientos';
  now = isoDateTime();
  done = '';
  readonly classes = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto', 'Costo'];
  chartCls = '';
  chartInactive = false;
  private chartList: ReturnType<typeof chartAccounts> = [];
  readonly noCenter = NO_CENTER;
  center = '';
  ccLines = false;
  ccPreview: CcResult[] = [];
  hasNoCenter = false;
  private ccList: CcResult[] = [];
  get centers() { return COST_CENTERS; }
  pctLabel(m: number): string { return `${(m * 100).toFixed(1).replace('.', ',')} %`; }

  constructor(public svc: AccountingService) {
    this.from = monthStart(svc.openPeriod);
    this.to = monthEnd(svc.openPeriod);
    svc.getEntries().subscribe(() => this.build());
  }

  get fileName(): string { return `${this.kind}.${this.format === 'Excel' ? 'xlsx' : this.format.toLowerCase()}`; }
  isNum(v: unknown): boolean { return typeof v === 'number'; }

  build(): void {
    this.now = isoDateTime();
    const all = this.svc.snapshot().filter(e => counts(e) && e.date >= this.from && e.date <= this.to)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const journal = (list: Entry[]) => [
      ['Comprobante', 'Fecha', 'Cuenta', 'Concepto', 'Débito', 'Crédito'],
      ...list.flatMap(e => e.lines.map(l => [e.number, dm(e.date), `${l.account} ${accountByCode(l.account)?.name ?? ''}`, e.concept, l.debit, l.credit])),
    ];
    const byPrefix = (p: string[]) => all.filter(e => p.includes(e.number.slice(0, 2)));
    const statements = () => {
      const s = balanceSheet(this.svc.snapshot(), this.to, 6);
      const r = pnl(this.svc.snapshot(), this.from, this.to);
      return [
        ['Estado', 'Código', 'Cuenta', 'Saldo'],
        ...s.lines.map(l => ['Balance general', l.code, l.name, l.value]),
        ...equityResultRows(s).map(([c, n, v]) => ['Balance general', c, n, v]),
        ['Estado de resultados', '', 'Ingresos', r.income], ['Estado de resultados', '', 'Costos', r.costs],
        ['Estado de resultados', '', 'Gastos operacionales', r.opExpenses], ['Estado de resultados', '', 'Gastos financieros', r.financial],
        ['Estado de resultados', '', 'Ingresos no operacionales', r.nonOperational], ['Estado de resultados', '', 'Utilidad antes de impuestos', r.profit],
        ['Estado de resultados', '', 'Impuesto de renta', r.tax], ['Estado de resultados', '', 'Utilidad neta', r.net],
      ];
    };
    if (this.kind === 'Plan de cuentas') {
      this.chartList = chartAccounts(this.svc.snapshot(), { inactive: this.chartInactive, cut: this.to, cls: this.chartCls || undefined });
      this.rows = this.chartList.length ? chartRows(this.chartList) : [[]];
      this.count = this.chartList.length;
      this.unit = this.count === 1 ? 'cuenta' : 'cuentas';
      return;
    }
    if (this.kind === 'Centros de costo') {
      const report = costCenterReport(this.svc.snapshot(), this.from, this.to, COST_CENTERS);
      this.hasNoCenter = report.some(c => c.code === NO_CENTER);
      // Un centro elegido sale solo; el comparativo trae los 3 (y las líneas sin centro, si las hay)
      this.ccList = this.center ? report.filter(c => c.code === this.center) : report;
      const withData = this.ccList.filter(c => c.accounts.length);
      this.ccPreview = this.ccList.length > 1 ? [...this.ccList, ccTotal(this.ccList)] : this.ccList;
      this.rows = withData.length ? costCenterRows(this.ccList, this.ccLines) : [[]];
      this.count = withData.length;
      this.unit = this.count === 1 ? 'centro de costo' : 'centros de costo';
      return;
    }
    const list = this.kind === 'Ingresos' ? byPrefix(['CI', 'FV']) : this.kind === 'Egresos' ? byPrefix(['CE']) : all;
    if (this.kind === 'Balance y estados financieros') {
      this.rows = all.length ? statements() : [[]];
      this.count = all.length ? 1 : 0;
      this.unit = 'estados financieros';
    } else if (this.kind === 'Información consolidada') {
      this.rows = all.length ? [...journal(list), ...statements().map(r => ['', ...r.slice(0, 1), r[2], '', r[3], ''])] : [[]];
      this.count = list.length;
      this.unit = 'movimientos y estados';
    } else {
      this.rows = list.length ? journal(list) : [[]];
      this.count = list.length;
      this.unit = this.count === 1 ? 'comprobante' : this.kind === 'Movimientos contables' ? 'movimientos' : 'comprobantes';
    }
  }

  export(): void {
    const period = `${dmy(this.from)} – ${dmy(this.to)}`;
    if (this.kind === 'Plan de cuentas') {
      const suffix = this.chartCls ? `-${this.chartCls.toLowerCase()}` : '';
      if (this.format === 'PDF') openDocument('Plan de cuentas', chartHtml(this.chartList, this.svc.company, this.to, this.user), true);
      else downloadCsvFile(this.rows, `plan-de-cuentas${suffix}-${this.to}${this.format === 'Excel' ? '-excel' : ''}.csv`);
      this.svc.logExport(this.fileName, `Saldos al ${dmy(this.to)}`);
      this.done = `${this.fileName} generado · ${this.count} ${this.unit}${this.chartCls ? ' de ' + this.chartCls.toLowerCase() : ''} · saldos al ${dmy(this.to)}.`;
      return;
    }
    if (this.kind === 'Centros de costo') {
      const name = this.center ? COST_CENTERS.find(c => c.code === this.center)?.name ?? this.center : '';
      const slug = name ? '-' + name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, '-') : '';
      if (this.format === 'PDF') openDocument('Informe por centros de costo', costCenterHtml(this.ccList, { company: this.svc.company, period, user: this.user, withLines: this.ccLines }), true);
      else downloadCsvFile(this.rows, `centros-de-costo${slug}-${this.from}_${this.to}${this.format === 'Excel' ? '-excel' : ''}.csv`);
      this.svc.logExport(this.fileName, period);
      this.done = `${this.fileName} generado · ${name || 'los 3 centros de costo'} · ${period}.`;
      return;
    }
    if (this.format === 'PDF') {
      openDocument(this.kind, `
        <header><div><h1>${esc(this.kind)}</h1><div class="muted">${esc(this.svc.company)} · ${esc(period)} · generado por ${esc(this.user)}</div></div><div class="brand">SOGO</div></header>
        <table><thead><tr>${this.rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
        ${this.rows.slice(1).map(r => `<tr>${r.map(v => `<td${typeof v === 'number' ? ' class="r"' : ''}>${typeof v === 'number' ? (v ? this.money(v) : '') : esc(v)}</td>`).join('')}</tr>`).join('')}
        </tbody></table>`, true);
    } else {
      // Excel abre el CSV (punto y coma + BOM) en columnas
      downloadCsvFile(this.rows, `${this.kind.toLowerCase().replace(/ /g, '-')}-${this.from}_${this.to}${this.format === 'Excel' ? '-excel' : ''}.csv`);
    }
    this.svc.logExport(this.fileName, periodName(this.from.slice(0, 7)) + (this.to.slice(0, 7) !== this.from.slice(0, 7) ? ` – ${periodName(this.to.slice(0, 7))}` : ''));
    this.done = `${this.fileName} generado · ${this.count} ${this.unit} del ${period}.`;
  }
}
