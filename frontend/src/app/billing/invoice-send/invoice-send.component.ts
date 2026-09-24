import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice } from '../invoice.model';

@Component({
  selector: 'app-invoice-send',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-send.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/billing">Facturación</a><span>›</span>
      <span>Envío de Factura</span>
    </div>

    <!-- Estado: antes de enviar -->
    <div class="send-card" *ngIf="!sent && inv">
      <h1 class="res-title">Envío de Factura Electrónica</h1>
      <p class="res-subtitle">Factura {{ inv.number }} · {{ inv.clientName }}</p>

      <div class="send-form">
        <div class="form-field">
          <label>Correo del destinatario *</label>
          <input type="email" [(ngModel)]="emailTo" class="form-input" placeholder="email@correo.com">
        </div>
        <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>
      </div>

      <div class="form-footer">
        <button class="btn-secondary" routerLink="/dashboard/billing">Cancelar</button>
        <button class="btn-primary" (click)="doSend()">📧 Enviar Factura</button>
      </div>
    </div>

    <!-- Estado: enviada con éxito -->
    <div class="confirm-card" *ngIf="sent && inv">
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
      </div>
      <h2 class="confirm-title">Factura enviada con éxito</h2>
      <p class="confirm-desc">
        La factura <strong>{{ inv.number }}</strong> ha sido enviada correctamente al
        correo <strong>{{ emailTo }}</strong>.
      </p>

      <!-- Eventos -->
      <div class="events-section">
        <h3 class="events-title">Eventos de la Factura</h3>
        <div class="event-item" *ngFor="let e of inv.events">
          <span class="event-dot"></span>
          <span class="event-label">{{ e.label }}</span>
          <span class="event-date">{{ e.date }}</span>
        </div>
      </div>

      <div class="confirm-actions">
        <button class="btn-outline" (click)="goDetail()">Ver Detalle de la Factura</button>
        <button class="btn-primary" routerLink="/dashboard/billing">Ir al Listado</button>
      </div>
    </div>

  </div>
  `
})
export class InvoiceSendComponent implements OnInit {
  inv?: Invoice;
  emailTo   = '';
  sent      = false;
  errorMsg  = '';

  constructor(private svc: InvoiceService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.inv  = this.svc.getById(id);
    if (this.inv) this.emailTo = this.inv.email;
  }

  doSend(): void {
    if (!this.emailTo) { this.errorMsg = 'Ingresa un correo válido.'; return; }
    this.svc.send(this.inv!.id, this.emailTo);
    this.inv  = this.svc.getById(this.inv!.id);
    this.sent = true;
  }

  goDetail(): void { this.router.navigate(['/dashboard/billing', this.inv!.id]); }
}
