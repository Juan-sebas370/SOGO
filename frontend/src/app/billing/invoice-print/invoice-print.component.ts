import { AfterViewInit, Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice } from '../invoice.model';
import { InvoiceSheetComponent } from '../invoice-sheet/invoice-sheet.component';

/**
 * Página de impresión / PDF de una factura (fuera del menú del dashboard para
 * que solo se imprima la factura). "Guardar como PDF" se elige en el diálogo del navegador.
 */
@Component({
  selector: 'app-invoice-print',
  standalone: true,
  imports: [CommonModule, InvoiceSheetComponent],
  template: `
  <div class="print-bar" *ngIf="inv">
    <span>{{ inv.number || 'Borrador' }} · {{ inv.buyer.name }}</span>
    <div>
      <button type="button" (click)="print()">{{ pdf ? 'Guardar como PDF' : 'Imprimir' }}</button>
      <button type="button" class="ghost" (click)="close()">Volver</button>
    </div>
  </div>
  <p class="print-tip" *ngIf="pdf">En el diálogo de impresión elige <strong>“Guardar como PDF”</strong> como destino.</p>
  <main class="print-page">
    <app-invoice-sheet *ngIf="inv; else missing" [invoice]="inv" [preview]="inv.dianStatus === 'Borrador'"></app-invoice-sheet>
    <ng-template #missing><p>No encontramos esta factura.</p></ng-template>
  </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #EEF2F7; font-family: 'Poppins', sans-serif; }
    .print-bar {
      position: sticky; top: 0; z-index: 5;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 24px; background: #0A2540; color: #fff; font-size: 13px;
    }
    .print-bar div { display: flex; gap: 8px; }
    .print-bar button {
      padding: 8px 16px; border: none; border-radius: 8px; background: #0B6FD0;
      font-family: inherit; font-size: 13px; font-weight: 600; color: #fff; cursor: pointer;
    }
    .print-bar button.ghost { background: rgba(255,255,255,0.12); }
    .print-tip { max-width: 820px; margin: 16px auto 0; padding: 0 16px; font-size: 12.5px; color: #374151; }
    .print-page { max-width: 820px; margin: 16px auto 40px; padding: 0 16px; }
    @media print {
      :host { background: #fff; }
      .print-bar, .print-tip { display: none; }
      .print-page { max-width: none; margin: 0; padding: 0; }
    }
  `]
})
export class InvoicePrintComponent implements AfterViewInit {
  inv?: Invoice;
  pdf: boolean;

  constructor(svc: InvoiceService, route: ActivatedRoute, private location: Location) {
    this.inv = svc.getById(route.snapshot.paramMap.get('id')!);
    this.pdf = route.snapshot.queryParamMap.has('pdf');
  }

  ngAfterViewInit(): void {
    // Abre el diálogo en cuanto la factura está pintada
    if (this.inv) setTimeout(() => window.print(), 300);
  }

  print(): void { window.print(); }
  close(): void { this.location.back(); }
}
