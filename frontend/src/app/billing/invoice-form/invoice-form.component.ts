import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import { Invoice, InvoiceConcept } from '../invoice.model';

@Component({
  selector: 'app-invoice-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/billing">Facturación</a><span>›</span>
      <span>{{ isEdit ? 'Editar Factura' : 'Nueva Factura' }}</span>
    </div>

    <h1 class="res-title">{{ isEdit ? 'Editar Factura' : 'Nueva Factura Electrónica' }}</h1>

    <div class="inv-form-grid">

      <!-- COLUMNA 1: Datos del Cliente -->
      <div class="form-section">
        <h2 class="form-section-title">Datos del Cliente</h2>
        <div class="form-field">
          <label>Tipo de Documento *</label>
          <select [(ngModel)]="f.docType" class="form-select">
            <option>Cédula de Ciudadanía</option>
            <option>Pasaporte</option>
            <option>NIT</option>
            <option>Cédula Extranjera</option>
          </select>
        </div>
        <div class="form-field">
          <label>Número de Documento *</label>
          <input type="text" [(ngModel)]="f.docNumber" placeholder="1234567890" class="form-input">
        </div>
        <div class="form-field">
          <label>Nombre y Razón Social *</label>
          <input type="text" [(ngModel)]="f.clientName" placeholder="María López" class="form-input">
        </div>
        <div class="form-field">
          <label>Correo Electrónico</label>
          <input type="email" [(ngModel)]="f.email" placeholder="email@correo.com" class="form-input">
        </div>
        <div class="form-field">
          <label>Teléfono</label>
          <input type="text" [(ngModel)]="f.phone" placeholder="300 123-4567" class="form-input">
        </div>
      </div>

      <!-- COLUMNA 2: Detalles de la Factura -->
      <div class="form-section">
        <h2 class="form-section-title">Detalles de la Factura</h2>
        <div class="form-field">
          <label>Fecha de Emisión *</label>
          <input type="date" [(ngModel)]="f.issueDate" class="form-input">
        </div>
        <div class="form-field">
          <label>Condición de Pago *</label>
          <select [(ngModel)]="f.paymentMethod" class="form-select">
            <option>Contado</option>
            <option>Crédito 15 días</option>
            <option>Crédito 30 días</option>
            <option>Crédito 60 días</option>
          </select>
        </div>
        <div class="form-field">
          <label>Fecha de Vencimiento *</label>
          <input type="date" [(ngModel)]="f.dueDate" class="form-input">
        </div>
        <div class="form-field">
          <label>Método de Pago</label>
          <select [(ngModel)]="f.paymentMethod" class="form-select">
            <option>Efectivo</option>
            <option>Tarjeta de Crédito</option>
            <option>Tarjeta de Débito</option>
            <option>Transferencia</option>
          </select>
        </div>
        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" placeholder="Servicio de alojamiento del..." class="form-textarea"></textarea>
        </div>
      </div>

      <!-- COLUMNA 3: Conceptos -->
      <div class="form-section">
        <h2 class="form-section-title">Conceptos</h2>

        <!-- Encabezado tabla conceptos -->
        <div class="concepts-header">
          <span class="col-desc">Descripción</span>
          <span class="col-qty">Cant.</span>
          <span class="col-unit">Valor Unit.</span>
          <span class="col-total">Valor Total</span>
          <span class="col-del"></span>
        </div>

        <!-- Filas de conceptos -->
        <div class="concept-row" *ngFor="let c of concepts; let i = index">
          <input type="text"   [(ngModel)]="c.description" placeholder="Alojamiento" class="form-input col-desc" (ngModelChange)="recalc()">
          <input type="number" [(ngModel)]="c.quantity"    min="1" class="form-input col-qty"  (ngModelChange)="recalcRow(i)">
          <input type="number" [(ngModel)]="c.unitValue"   min="0" class="form-input col-unit" (ngModelChange)="recalcRow(i)">
          <span class="col-total-val">$ {{ c.total | number }}</span>
          <button class="btn-del-concept" (click)="removeConcept(i)" title="Eliminar">✕</button>
        </div>

        <button class="btn-add-concept" (click)="addConcept()">+ Agregar Concepto</button>

        <!-- Totales -->
        <div class="inv-totals">
          <div class="total-row"><span>Subtotal</span><span>$ {{ subtotal | number }}</span></div>
          <div class="total-row"><span>IVA (19%)</span><span>$ {{ iva | number }}</span></div>
          <div class="total-row total-row--final"><span>Total</span><span>$ {{ total | number }}</span></div>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/billing">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Guardar y Emitir' }}
      </button>
    </div>

  </div>
  `
})
export class InvoiceFormComponent implements OnInit {
  isEdit = false;
  errorMsg = '';
  existingId = '';

  f: Partial<Invoice> = {
    docType: 'Cédula de Ciudadanía', docNumber: '',
    clientName: '', email: '', phone: '',
    issueDate: new Date().toISOString().slice(0,10),
    dueDate:   new Date().toISOString().slice(0,10),
    paymentMethod: 'Contado',
    observations: '', status: 'Pendiente',
    techProvider: 'Factuatech S.A.S.',
    dianResolution: '18764321246676 de 09/21/2024'
  };

  concepts: InvoiceConcept[] = [
    { description: 'Alojamiento', quantity: 1, unitValue: 0, total: 0 }
  ];

  subtotal = 0;
  iva      = 0;
  total    = 0;

  constructor(private svc: InvoiceService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getById(id);
      if (found) {
        this.f        = { ...found };
        this.concepts = found.concepts.map(c => ({ ...c }));
        this.isEdit   = true;
        this.existingId = id;
        this.recalc();
      }
    }
  }

  addConcept(): void {
    this.concepts.push({ description: '', quantity: 1, unitValue: 0, total: 0 });
  }

  removeConcept(i: number): void {
    this.concepts.splice(i, 1);
    this.recalc();
  }

  recalcRow(i: number): void {
    const c = this.concepts[i];
    c.total = c.quantity * c.unitValue;
    this.recalc();
  }

  recalc(): void {
    this.subtotal = this.concepts.reduce((a, c) => a + c.total, 0);
    this.iva      = Math.round(this.subtotal * 0.19);
    this.total    = this.subtotal + this.iva;
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.clientName || !this.f.docNumber || !this.f.issueDate) {
      this.errorMsg = 'Por favor completa todos los campos obligatorios.';
      return;
    }
    const payload = {
      ...this.f,
      concepts: this.concepts,
      subtotal: this.subtotal,
      iva:      this.iva,
      total:    this.total,
    } as Omit<Invoice,'id'|'number'|'cufe'|'events'|'sentAt'>;

    if (this.isEdit) {
      this.svc.update(this.existingId, { ...payload, concepts: this.concepts, subtotal: this.subtotal, iva: this.iva, total: this.total });
    } else {
      const created = this.svc.create(payload);
      this.router.navigate(['/dashboard/billing', created.id, 'send']);
      return;
    }
    this.router.navigate(['/dashboard/billing']);
  }
}
