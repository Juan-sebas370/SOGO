import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toast, Toast } from './toast.service';

/** Avisos de éxito o error, arriba a la derecha, en todas las pantallas. */
@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="tst-stack" aria-live="polite">
    <div *ngFor="let t of items; trackBy: byId" class="tst" [ngClass]="'tst--' + t.kind"
         [attr.role]="t.kind === 'error' ? 'alert' : 'status'" (mouseenter)="center.hold(t.id)" (mouseleave)="center.release(t.id)">
      <span class="tst-icon" aria-hidden="true" [ngSwitch]="t.kind">
        <svg *ngSwitchCase="'success'" viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>
        <svg *ngSwitchCase="'error'" viewBox="0 0 24 24"><path d="M12 7v6M12 16.5v.5"/></svg>
        <svg *ngSwitchDefault viewBox="0 0 24 24"><path d="M12 11v6M12 7.5v.5"/></svg>
      </span>
      <div class="tst-body">
        <strong>{{ t.title }}</strong>
        <span *ngIf="t.detail">{{ t.detail }}</span>
      </div>
      <button type="button" class="tst-close" (click)="center.dismiss(t.id)" aria-label="Cerrar aviso">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <i class="tst-bar" [style.animation-duration.ms]="t.duration"></i>
    </div>
  </div>
  `,
  styles: [`
    .tst-stack { position: fixed; top: 18px; right: 18px; z-index: 3000; display: flex; flex-direction: column; gap: 10px;
      width: min(380px, calc(100vw - 36px)); pointer-events: none; }
    .tst { position: relative; overflow: hidden; display: flex; align-items: flex-start; gap: 12px; padding: 13px 12px 15px 14px;
      border-radius: 14px; border: 1px solid; pointer-events: auto; font-family: inherit;
      box-shadow: 0 10px 28px rgba(10, 37, 64, 0.14), 0 2px 6px rgba(10, 37, 64, 0.06);
      animation: tst-in .32s cubic-bezier(.2, .9, .3, 1.2) both; }
    .tst-icon { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
    .tst-icon svg { width: 17px; height: 17px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .tst-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding-top: 1px; }
    .tst-body strong { font-size: 13.5px; font-weight: 700; line-height: 1.3; }
    .tst-body span { font-size: 12px; line-height: 1.4; opacity: .85; overflow-wrap: anywhere; }
    .tst-close { flex-shrink: 0; width: 26px; height: 26px; border: none; background: none; border-radius: 8px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; opacity: .55; }
    .tst-close:hover { opacity: 1; background: rgba(10, 37, 64, 0.06); }
    .tst-close svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
    .tst-bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; transform-origin: left; animation: tst-bar linear both; opacity: .55; }
    .tst:hover .tst-bar { animation-play-state: paused; }

    /* Éxito: verde claro y suave */
    .tst--success { background: #F0FAF4; border-color: #C9EBD6; color: #14532D; }
    .tst--success .tst-icon { background: #22A35A; box-shadow: 0 0 0 4px #DCF3E5; }
    .tst--success .tst-bar { background: #22A35A; }
    /* Error: rojo claro, sin estridencias */
    .tst--error { background: #FEF4F4; border-color: #F6CDCD; color: #7F1D1D; }
    .tst--error .tst-icon { background: #DC4B4B; box-shadow: 0 0 0 4px #FBE1E1; }
    .tst--error .tst-bar { background: #DC4B4B; }
    /* Información: azul de la aplicación */
    .tst--info { background: #F2F7FD; border-color: #CFE0F5; color: #0A3D6D; }
    .tst--info .tst-icon { background: #0B6FD0; box-shadow: 0 0 0 4px #DCEAF9; }
    .tst--info .tst-bar { background: #0B6FD0; }

    @keyframes tst-in { from { opacity: 0; transform: translateX(24px) scale(.97); } to { opacity: 1; transform: none; } }
    @keyframes tst-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .tst { animation: none; } .tst-bar { display: none; } }
  `],
})
export class ToastsComponent {
  readonly center = toast;
  items: Toast[] = [];
  constructor() { toast.items$.subscribe(list => this.items = list); }
  byId(_: number, t: Toast): number { return t.id; }
}
