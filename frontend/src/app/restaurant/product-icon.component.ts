import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuCategory } from './restaurant.model';

/** Ícono de la categoría del producto, con su color (tarjetas, tablas y listas del restaurante). */
@Component({
  selector: 'app-product-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
  <span class="pi" [ngClass]="'pi--' + category.toLowerCase()" [class.pi--sm]="size === 'sm'" [class.pi--lg]="size === 'lg'" aria-hidden="true">
    <ng-container [ngSwitch]="category">
      <svg *ngSwitchCase="'Bebidas'" viewBox="0 0 24 24"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c0 1 1 1 1 2M11.5 3.5c0 1 1 1 1 2"/></svg>
      <svg *ngSwitchCase="'Desayunos'" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="2.6"/><path d="M12 3v3"/></svg>
      <svg *ngSwitchCase="'Almuerzos'" viewBox="0 0 24 24"><circle cx="12" cy="13" r="5"/><path d="M3 5v5a2 2 0 0 0 2 2v7M5 5v4M21 5c-1.5 0-2.5 1.5-2.5 4s1 3 2.5 3v7"/></svg>
      <svg *ngSwitchCase="'Cenas'" viewBox="0 0 24 24"><path d="M4 16a8 8 0 0 1 16 0z"/><path d="M2.5 19h19M12 8V6"/></svg>
      <svg *ngSwitchCase="'Postres'" viewBox="0 0 24 24"><path d="M5 20h14l-1.5-8h-11z"/><path d="M6.5 12a5.5 5.5 0 0 1 11 0"/><path d="M12 4v2.5"/></svg>
      <svg *ngSwitchDefault viewBox="0 0 24 24"><path d="M3 14h18a9 9 0 0 1-18 0z"/><path d="M12 5v4M8 7l1 2M16 7l-1 2"/></svg>
    </ng-container>
  </span>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .pi { width: 38px; height: 38px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
    .pi svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .pi--sm { width: 30px; height: 30px; border-radius: 8px; }
    .pi--sm svg { width: 15px; height: 15px; }
    .pi--lg { width: 52px; height: 52px; border-radius: 12px; }
    .pi--lg svg { width: 25px; height: 25px; }
    .pi--bebidas   { background: #E3EEFF; color: #1D4ED8; }
    .pi--desayunos { background: #FEF3C7; color: #A16207; }
    .pi--almuerzos { background: #DDF7E6; color: #15803D; }
    .pi--cenas     { background: #F1E8FF; color: #7E22CE; }
    .pi--postres   { background: #FDE2EC; color: #BE185D; }
    .pi--snacks    { background: #FFEDD5; color: #C2410C; }
  `],
})
export class ProductIconComponent {
  @Input() category: MenuCategory = 'Snacks';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
}
