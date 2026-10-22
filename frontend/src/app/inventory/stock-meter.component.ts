import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fmtQty } from './inventory.model';

/** Barra de existencias con la marca del mínimo: "8 / mín. 10". */
@Component({
  selector: 'app-stock-meter',
  standalone: true,
  imports: [CommonModule],
  template: `
  <span class="sm" [attr.aria-label]="qty(stock) + ' de mínimo ' + qty(min)">
    <span class="sm-track">
      <b [style.width.%]="fill" [ngClass]="tone"></b>
      <i [style.left.%]="marker"></i>
    </span>
    <span class="sm-text"><strong>{{ qty(stock) }}</strong> / mín. {{ qty(min) }}</span>
  </span>
  `,
  styles: [`
    .sm { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; font-size: 12px; }
    .sm-track { position: relative; width: 90px; height: 7px; border-radius: 999px; background: #E6EBF2; }
    .sm-track b { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; }
    .sm-track i { position: absolute; top: -4px; width: 2px; height: 15px; background: #0A2540; }
    .ok { background: #2E9D5B; } .warn { background: #C26A0A; } .empty { background: transparent; }
    .sm-text strong { color: #0A2540; }
  `],
})
export class StockMeterComponent {
  @Input() stock = 0;
  @Input() min = 0;
  readonly qty = fmtQty;

  /** Escala: el triple del mínimo (o las existencias, si son más), para que la marca se vea. */
  private get scale(): number { return Math.max(this.stock, this.min * 3, 1); }
  get fill(): number { return this.stock / this.scale * 100; }
  get marker(): number { return this.min / this.scale * 100; }
  get tone(): string { return this.stock <= 0 ? 'empty' : this.stock <= this.min ? 'warn' : 'ok'; }
}
