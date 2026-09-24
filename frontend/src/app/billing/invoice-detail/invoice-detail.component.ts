import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice, InvoiceStatus } from '../invoice.model';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./invoice-detail.component.css'],
  template: `
  <div class="res-page" *ngIf="inv">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/billing">Facturación</a><span>›</span>
      <span>Detalle de Factura</span>
    </div>

    <div class="detail-header">
      <h1 class="res-title">Detalle de Factura Electrónica</h1>
      <span class="res-badge" [ngClass]="badgeClass(inv.status)">{{ inv.status }}</span>
    </div>

    <div class="detail-grid">

      <!-- Info de la Factura -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información de la Factura</h2>
        <div class="detail-row"><span class="detail-label">Número de Factura</span> <span class="detail-value res-code">{{ inv.number }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Emisión</span>  <span class="detail-value">{{ inv.issueDate | date:'dd/MM/yyyy HH:mm' }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha de Vencimiento</span><span class="detail-value">{{ inv.dueDate | date:'dd/MM/yyyy' }}</span></div>
        <div class="detail-row"><span class="detail-label">Estado</span>             <span class="res-badge" [ngClass]="badgeClass(inv.status)">{{ inv.status }}</span></div>
        <div class="detail-row"><span class="detail-label">CUFE</span>               <span class="detail-value cufe-text">{{ inv.cufe || '—' }}</span></div>
        <div class="detail-row"><span class="detail-label">Proveedor Tecnológico</span><span class="detail-value">{{ inv.techProvider }}</span></div>
        <div class="detail-row"><span class="detail-label">Resolución DIAN</span>   <span class="detail-value">{{ inv.dianResolution }}</span></div>
      </div>

      <!-- Info del Cliente -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información del Cliente</h2>
        <div class="detail-row"><span class="detail-label">Cliente</span>    <span class="detail-value font-bold">{{ inv.clientName }}</span></div>
        <div class="detail-row"><span class="detail-label">Documento</span>  <span class="detail-value">{{ inv.docNumber }}</span></div>
        <div class="detail-row"><span class="detail-label">Correo</span>     <span class="detail-value">{{ inv.email }}</span></div>
        <div class="detail-row"><span class="detail-label">Teléfono</span>   <span class="detail-value">{{ inv.phone }}</span></div>
        <div class="detail-row" *ngIf="inv.observations"><span class="detail-label">Observaciones</span><span class="detail-value">{{ inv.observations }}</span></div>
      </div>

    </div>

    <!-- Conceptos -->
    <div class="detail-concepts">
      <h2 class="detail-section-title">Conceptos</h2>
      <table class="res-table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Valor Unitario</th>
            <th class="text-right">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let c of inv.concepts">
            <td>{{ c.description }}</td>
            <td class="text-right">{{ c.quantity }}</td>
            <td class="text-right">$ {{ c.unitValue | number }}</td>
            <td class="text-right">$ {{ c.total | number }}</td>
          </tr>
        </tbody>
      </table>
      <div class="inv-totals inv-totals--right">
        <div class="total-row"><span>Subtotal</span><span>$ {{ inv.subtotal | number }}</span></div>
        <div class="total-row"><span>IVA (19%)</span><span>$ {{ inv.iva | number }}</span></div>
        <div class="total-row total-row--final"><span>Total</span><span>$ {{ inv.total | number }}</span></div>
      </div>
    </div>

    <!-- Acciones -->
    <div class="detail-actions">
      <button class="btn-outline" (click)="download()">⬇ Descargar PDF</button>
      <button class="btn-outline" (click)="goSend()">📧 Enviar por Email</button>
      <button class="btn-danger-outline" (click)="annul()" [disabled]="inv.status==='Anulada'">🗑 Anular Factura</button>
      <button class="btn-secondary" routerLink="/dashboard/billing">Volver al Listado</button>
    </div>

  </div>
  `
})
export class InvoiceDetailComponent implements OnInit {
  inv?: Invoice;

  constructor(private svc: InvoiceService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.inv = this.svc.getById(id);
  }

  badgeClass(s: InvoiceStatus): string {
    return { 'Pagada':'res-badge--inv-paid','Pendiente':'res-badge--inv-pend','Anulada':'res-badge--inv-ann','Rechazada':'res-badge--inv-rej' }[s] ?? '';
  }

  goSend():   void { this.router.navigate(['/dashboard/billing', this.inv!.id, 'send']); }
  download(): void { window.print(); }
  annul():    void {
    if (confirm('¿Anular esta factura?')) {
      this.svc.annul(this.inv!.id);
      this.inv = this.svc.getById(this.inv!.id);
    }
  }
}
