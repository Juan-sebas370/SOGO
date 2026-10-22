import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { BalanceSheet, balanceSheet, equityResultRows, monthEnd, periodName } from '../accounting.model';
import { BalanceViewComponent } from '../balance-view.component';
import { UsersService } from '../../users/users.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { dmy } from '../accounting-format';

@Component({
  selector: 'app-accounting-balance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BalanceViewComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Balance financiero</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Balance financiero</h1>
      <p class="kit-sub">Vista previa · {{ svc.company }} · corte al {{ dmy(applied.cut) }} · cifras en pesos colombianos.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('Excel')">Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="csv('CSV')">CSV</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="pdf()">Imprimir</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--warn" *ngIf="!svc.hasOpening" role="status">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><strong>Faltan los saldos iniciales.</strong> El balance solo muestra lo registrado desde el {{ dmy(svc.goLive) }}. Registra los saldos reales de caja, bancos,
      propiedad y equipo, deudas y capital a esa fecha para que el balance quede completo.</div>
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/accounting/movement" [queryParams]="{ tipo: 'apertura' }" *ngIf="svc.canCreate">Registrar saldos iniciales</a>
  </div>

  <section class="kit-card bal-filters">
    <label class="kit-select"><span>Período contable</span>
      <select [(ngModel)]="draft.period" (ngModelChange)="draft.cut = end(draft.period)"><option *ngFor="let p of periods" [value]="p">{{ name(p) }}</option></select></label>
    <label class="kit-select"><span>Corte</span><input type="date" [(ngModel)]="draft.cut"></label>
    <label class="kit-select"><span>Nivel de detalle</span>
      <select [(ngModel)]="draft.level"><option [ngValue]="4">Cuentas de 4 dígitos</option><option [ngValue]="6">Subcuentas de 6 dígitos</option></select></label>
    <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!draft.cut" (click)="generate()">Generar balance</button>
    <p class="kit-banner kit-banner--warn bal-warn" *ngIf="provisional.length">
      <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
      <span>Incluye valores provisionales ({{ provisional.join(', ') }} en borrador).</span></p>
  </section>

  <app-balance-view [s]="sheet" [profitLabel]="'ene – ' + dmy(applied.cut).slice(0, 5)"></app-balance-view>

  <section class="kit-kpis bal-kpis">
    <div class="kit-kpi"><div><span>Total activo</span><strong>{{ money(sheet.assets) }}</strong></div></div>
    <div class="kit-kpi"><div><span>Total pasivo + patrimonio</span><strong>{{ money(sheet.liabilities + sheet.equity) }}</strong></div></div>
    <div class="kit-kpi" [class.bal-ok]="diff === 0" [class.bal-bad]="diff !== 0">
      <div><span>{{ diff === 0 ? 'Balance cuadrado' : 'Balance descuadrado' }}</span><small>Activo = Pasivo + Patrimonio · diferencia {{ money(diff) }}</small></div></div>
    <div class="kit-kpi"><div><span>Generado</span><strong class="bal-when">{{ dmy(generatedAt) }} {{ generatedAt.slice(11, 16) }}</strong><small>Por {{ user }} · registrado en auditoría</small></div></div>
  </section>
  `,
  styles: [`
    .bal-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
    .bal-filters .kit-select { flex: 1; min-width: 150px; }
    .bal-filters .rsv-btn { height: 46px; }
    .bal-warn { margin: 0; flex: 1.4; min-width: 240px; font-size: 12px; }
    .bal-kpis { margin-top: 18px; }
    .bal-ok { background: #ECFDF3; border-color: #BBE7CB; }
    .bal-ok span { color: #166534 !important; font-weight: 600; }
    .bal-bad { background: #FEF2F2; border-color: #FCA5A5; }
    .bal-when { font-size: 16px !important; }
  `],
})
export class BalanceComponent {
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly name = periodName;
  readonly end = monthEnd;
  get user(): string { return this.svc.actor; }

  periods: string[] = [];
  draft: { period: string; cut: string; level: 4 | 6 };
  applied: { period: string; cut: string; level: 4 | 6 };
  sheet!: BalanceSheet;
  provisional: string[] = [];
  generatedAt = isoDateTime();

  constructor(public svc: AccountingService, private audit: UsersService) {
    this.draft = { period: svc.openPeriod, cut: monthEnd(svc.openPeriod), level: 4 };
    this.applied = { ...this.draft };
    svc.getEntries().subscribe(() => {
      this.periods = svc.periods();
      this.compute();
    });
  }

  get diff(): number { return Math.round(this.sheet.assets - this.sheet.liabilities - this.sheet.equity); }

  generate(): void {
    this.applied = { ...this.draft };
    this.generatedAt = isoDateTime();
    this.compute();
    this.audit.addLog('Contabilidad: balance generado', `Corte ${dmy(this.applied.cut)} · activo ${this.money(this.sheet.assets)}`);
  }

  private compute(): void {
    const all = this.svc.snapshot();
    this.sheet = balanceSheet(all, this.applied.cut, this.applied.level);
    this.provisional = all.filter(e => e.status === 'Provisional' && e.date <= this.applied.cut).map(e => e.number);
  }

  private rows(): unknown[][] {
    const s = this.sheet;
    return [
      ['Código', 'Cuenta', 'Clase', 'Saldo'],
      ...s.lines.map(l => [l.code, l.name, l.cls + (l.cls !== 'Patrimonio' ? (l.current ? ' corriente' : ' no corriente') : ''), l.value]),
      ...equityResultRows(s).map(([c, n, v]) => [c, n, 'Patrimonio', v]),
      ['', 'TOTAL ACTIVO', '', s.assets], ['', 'TOTAL PASIVO', '', s.liabilities], ['', 'TOTAL PATRIMONIO', '', s.equity],
    ];
  }

  csv(kind: 'Excel' | 'CSV'): void {
    downloadCsvFile(this.rows(), `balance-${this.applied.cut}${kind === 'Excel' ? '-excel' : ''}.csv`);
    this.svc.logExport(`Balance financiero.${kind === 'Excel' ? 'xlsx' : 'csv'}`, periodName(this.applied.period));
  }

  pdf(): void {
    const s = this.sheet;
    const table = (rows: unknown[][]) => rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="r">${this.money(+(r[3] as number))}</td></tr>`).join('');
    const rows = this.rows().slice(1, -3);
    openDocument('Balance financiero', `
      <header><div><h1>Balance financiero</h1><div class="muted">${esc(this.svc.company)} · corte al ${dmy(this.applied.cut)}</div></div><div class="brand">SOGO</div></header>
      <h2>Activo</h2><table><tbody>${table(rows.filter(r => String(r[2]).startsWith('Activo')))}<tr class="total"><td></td><td>Total activo</td><td class="r">${this.money(s.assets)}</td></tr></tbody></table>
      <h2>Pasivo</h2><table><tbody>${table(rows.filter(r => String(r[2]).startsWith('Pasivo')))}<tr class="total"><td></td><td>Total pasivo</td><td class="r">${this.money(s.liabilities)}</td></tr></tbody></table>
      <h2>Patrimonio</h2><table><tbody>${table(rows.filter(r => String(r[2]).startsWith('Patrimonio')))}<tr class="total"><td></td><td>Total pasivo + patrimonio</td><td class="r">${this.money(s.liabilities + s.equity)}</td></tr></tbody></table>
      ${this.provisional.length ? `<p class="muted">Incluye valores provisionales: ${esc(this.provisional.join(', '))}.</p>` : ''}
      <p class="muted">Generado ${dmy(isoDate(0))} por ${esc(this.user)}.</p>`, true);
    this.svc.logExport('Balance financiero.pdf', periodName(this.applied.period));
  }
}
