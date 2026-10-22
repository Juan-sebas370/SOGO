import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Delta } from './reports.model';

/** Cambio frente al período de comparación: flecha, valor y color según si mejora o empeora. */
@Component({
  selector: 'rp-delta',
  standalone: true,
  imports: [CommonModule],
  template: `
  <span class="rp-delta" [class.good]="!d.none && d.good" [class.bad]="!d.none && !d.good" [class.none]="d.none"
        [attr.aria-label]="d.none ? 'Sin comparación' : (d.up ? 'Subió ' : 'Bajó ') + d.text">
    <svg *ngIf="!d.none" viewBox="0 0 12 12" aria-hidden="true"><path [attr.d]="d.up ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'"/></svg>{{ d.text }}
  </span>`,
  styles: [`
    .rp-delta { display: inline-flex; align-items: center; gap: 2px; font-weight: 700; font-size: 11px; margin-right: 6px; white-space: nowrap; }
    .rp-delta svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .good { color: #1F8A5B; } .bad { color: #C62828; } .none { color: #9AA5B4; font-weight: 500; }
  `],
})
export class DeltaComponent {
  @Input() d: Delta = { text: '—', up: false, good: true, none: true };
}
