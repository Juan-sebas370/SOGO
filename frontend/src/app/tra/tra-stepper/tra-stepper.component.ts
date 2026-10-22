import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Pasos del flujo de una TRA: 1 Registro → 2 Resumen → 3 Envío (detalle). */
@Component({
  selector: 'app-tra-stepper',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  <ol class="steps">
    <li *ngFor="let s of steps; let i = index" [class.done]="i + 1 < step" [class.current]="i + 1 === step">
      <a [routerLink]="['/dashboard/tra', reservationId].concat(s.path)">
        <span class="dot">
          <svg *ngIf="i + 1 < step" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          <ng-container *ngIf="i + 1 >= step">{{ i + 1 }}</ng-container>
        </span>
        {{ s.label }}
      </a>
    </li>
  </ol>
  `,
  styles: [`
    .steps { display: flex; align-items: center; gap: 10px; margin: 0; padding: 0; list-style: none; font-family: 'Poppins', sans-serif; }
    li { display: flex; align-items: center; gap: 10px; }
    li + li::before { content: ''; width: 36px; height: 2px; background: #E6EBF2; }
    li.done + li::before, li.done + li.current::before { background: #16A34A; }
    a { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: #6B7280; text-decoration: none; }
    .dot { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
           background: #EEF1F5; color: #4B5563; font-size: 12px; }
    .dot svg { width: 14px; height: 14px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .done a, .current a { color: #0A2540; }
    .done .dot { background: #16A34A; }
    .current .dot { background: #0B6FD0; color: #fff; }
  `]
})
export class TraStepperComponent {
  @Input({ required: true }) reservationId!: string;
  @Input({ required: true }) step!: 1 | 2 | 3;

  readonly steps = [
    { label: 'Registro', path: ['registro'] },
    { label: 'Resumen',  path: ['resumen'] },
    { label: 'Envío',    path: [] as string[] },
  ];
}
