import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BalanceSheet, equityResultRows } from './accounting.model';
import { fmtMoney } from '../reservations/reservation-format';

/** Balance general en dos columnas (activo | pasivo + patrimonio). Lo usan Balance y Estados financieros. */
@Component({
  selector: 'app-balance-view',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['../shared/styles/kit.css', './accounting.css'],
  template: `
  <div class="bv-grid">
    <section class="kit-card">
      <table class="kit-table acc-sheet">
        <tbody>
          <tr class="acc-group"><td colspan="3">ACTIVO</td></tr>
          <tr class="bv-sub"><td colspan="3">Activo corriente</td></tr>
          <tr *ngFor="let l of rows('Activo', true)"><td class="kit-mono">{{ l.code }}</td><td>{{ l.name }}</td><td class="r">{{ money(l.value) }}</td></tr>
          <tr class="acc-subtotal"><td colspan="2">Total activo corriente</td><td class="r">{{ money(s.currentAssets) }}</td></tr>
          <tr class="bv-sub"><td colspan="3">Activo no corriente</td></tr>
          <tr *ngFor="let l of rows('Activo', false)"><td class="kit-mono">{{ l.code }}</td><td>{{ l.name }}</td><td class="r">{{ money(l.value) }}</td></tr>
          <tr class="acc-subtotal"><td colspan="2">Total activo no corriente</td><td class="r">{{ money(s.nonCurrentAssets) }}</td></tr>
          <tr class="acc-grand"><td colspan="2">TOTAL ACTIVO</td><td class="r">{{ money(s.assets) }}</td></tr>
        </tbody>
      </table>
    </section>
    <section class="kit-card">
      <table class="kit-table acc-sheet">
        <tbody>
          <tr class="acc-group"><td colspan="3">PASIVO</td></tr>
          <tr class="bv-sub"><td colspan="3">Pasivo corriente</td></tr>
          <tr *ngFor="let l of rows('Pasivo', true)"><td class="kit-mono">{{ l.code }}</td><td>{{ l.name }}</td><td class="r">{{ money(l.value) }}</td></tr>
          <tr class="acc-subtotal"><td colspan="2">Total pasivo corriente</td><td class="r">{{ money(s.currentLiabilities) }}</td></tr>
          <ng-container *ngIf="rows('Pasivo', false).length">
            <tr class="bv-sub"><td colspan="3">Pasivo no corriente</td></tr>
            <tr *ngFor="let l of rows('Pasivo', false)"><td class="kit-mono">{{ l.code }}</td><td>{{ l.name }}</td><td class="r">{{ money(l.value) }}</td></tr>
            <tr class="acc-subtotal"><td colspan="2">Total pasivo no corriente</td><td class="r">{{ money(s.nonCurrentLiabilities) }}</td></tr>
          </ng-container>
          <tr class="acc-subtotal"><td colspan="2">TOTAL PASIVO</td><td class="r">{{ money(s.liabilities) }}</td></tr>
          <tr class="acc-group"><td colspan="3">PATRIMONIO</td></tr>
          <tr *ngFor="let l of rows('Patrimonio', false)"><td class="kit-mono">{{ l.code }}</td><td>{{ l.name }}</td><td class="r">{{ money(l.value) }}</td></tr>
          <tr *ngFor="let r of results"><td class="kit-mono">{{ r[0] }}</td><td>{{ r[1] }}<small class="kit-muted" *ngIf="r[0] === '3605' || r[0] === '3610'"> ({{ profitLabel }})</small></td><td class="r" [class.acc-red]="r[2] < 0">{{ money(r[2]) }}</td></tr>
          <tr class="acc-subtotal"><td colspan="2">Total patrimonio</td><td class="r">{{ money(s.equity) }}</td></tr>
          <tr class="acc-grand"><td colspan="2">TOTAL PASIVO + PATRIMONIO</td><td class="r">{{ money(s.liabilities + s.equity) }}</td></tr>
          <tr *ngIf="difference" class="acc-red"><td colspan="2">Descuadre (revisar comprobantes)</td><td class="r">{{ money(difference) }}</td></tr>
        </tbody>
      </table>
    </section>
  </div>
  `,
  styles: [`
    .bv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
    .bv-sub td { background: #F8FAFC; font-weight: 600; font-size: 12px; color: #0A3D6D; }
    @media (max-width: 1000px) { .bv-grid { grid-template-columns: 1fr; } }
  `],
})
export class BalanceViewComponent {
  @Input({ required: true }) s!: BalanceSheet;
  @Input() profitLabel = 'ene – corte';
  readonly money = fmtMoney;
  get results() { return equityResultRows(this.s); }
  /** Activo − (pasivo + patrimonio): debe ser 0 si todos los comprobantes cuadran. */
  get difference(): number { return Math.round(this.s.assets - this.s.liabilities - this.s.equity); }

  rows(cls: 'Activo' | 'Pasivo' | 'Patrimonio', current: boolean) {
    return this.s.lines.filter(l => l.cls === cls && (cls === 'Patrimonio' || l.current === current));
  }
}
