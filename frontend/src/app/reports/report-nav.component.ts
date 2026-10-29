import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Pestañas del módulo Reportes: cada pantalla se alcanza en un clic, sin volver al menú lateral. */
const TABS: { label: string; link: string; exact: boolean; icon: string }[] = [
  { label: 'General',       link: '/dashboard/reports',              exact: true,  icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { label: 'Ocupación',     link: '/dashboard/reports/occupancy',    exact: false, icon: 'M2 20v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2M12 15v-2a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7M2 17h20' },
  { label: 'Reservas',      link: '/dashboard/reports/reservations', exact: false, icon: 'M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
  { label: 'Financiero',    link: '/dashboard/reports/financial',    exact: false, icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { label: 'Inventario',    link: '/dashboard/reports/inventory',    exact: false, icon: 'M4 8h16v12H4zM9 8V4h6v4M8 12h8M8 16h8' },
  { label: 'Indicadores',   link: '/dashboard/reports/indicators',   exact: false, icon: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12h.01' },
  { label: 'Filtrar',       link: '/dashboard/reports/filter',       exact: false, icon: 'M3 5h18l-7 8v6l-4 2v-8z' },
  { label: 'Gráficos',      link: '/dashboard/reports/charts',       exact: false, icon: 'M6 20V10M12 20V4M18 20v-7' },
  { label: 'Automáticos',   link: '/dashboard/reports/scheduled',    exact: false, icon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z' },
];

@Component({
  selector: 'rp-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
  <nav class="rpn" aria-label="Reportes">
    <a *ngFor="let t of tabs" [routerLink]="t.link" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: t.exact }" class="rpn-tab">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="t.icon"/></svg>{{ t.label }}
    </a>
  </nav>`,
  styles: [`
    :host { display: block; margin: 14px 0 16px; }
    .rpn {
      display: flex; gap: 4px; padding: 4px; overflow-x: auto; scrollbar-width: none;
      background: #fff; border: 1px solid #E6EBF2; border-radius: 12px; box-shadow: 0 1px 3px rgba(15, 23, 42, .04);
    }
    .rpn::-webkit-scrollbar { display: none; }
    .rpn-tab {
      flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      height: 36px; padding: 0 12px; border-radius: 9px; white-space: nowrap; text-decoration: none;
      font-family: 'Poppins', sans-serif; font-size: 12.5px; font-weight: 600; color: #4B5563; transition: background .15s, color .15s;
    }
    .rpn-tab svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .rpn-tab:hover { background: #F2F7FE; color: #0A2540; }
    .rpn-tab.on { background: #0A3D6D; color: #fff; box-shadow: 0 2px 6px rgba(10, 61, 109, .25); }
  `],
})
export class ReportNavComponent {
  readonly tabs = TABS;
}
