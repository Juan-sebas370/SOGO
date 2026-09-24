import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { EntryItem, Product } from '../inventory.model';

@Component({
  selector: 'app-inventory-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./inventory-entry.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/inventory">Inventarios</a><span>›</span>
      <a routerLink="/dashboard/inventory/movements">Movimientos</a><span>›</span>
      <span>Nueva Entrada</span>
    </div>

    <h1 class="res-title">Registro de Entrada de Inventario</h1>

    <div class="entry-form-grid">

      <!-- IZQUIERDA: Información General -->
      <div class="form-section">
        <h2 class="form-section-title">Información General</h2>

        <div class="form-field">
          <label>Fecha *</label>
          <input type="date" [(ngModel)]="f.date" class="form-input">
        </div>
        <div class="form-field">
          <label>Proveedor *</label>
          <select [(ngModel)]="f.supplier" class="form-select">
            <option>Molinos del Valle S.A.S.</option>
            <option>Alquería S.A.</option>
            <option>Café de Colombia Ltda.</option>
            <option>P&G Colombia</option>
            <option>Aceites del Valle</option>
            <option>Alpina S.A.</option>
            <option>Colgate-Palmolive</option>
            <option>Manuelita S.A.</option>
          </select>
        </div>
        <div class="form-field">
          <label>Factura / Remisión</label>
          <input type="text" [(ngModel)]="f.invoice" placeholder="FV-0001288" class="form-input">
        </div>
        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" placeholder="Entrada de mercancía según factura..." class="form-textarea"></textarea>
        </div>

        <!-- Resumen -->
        <div class="entry-summary">
          <div class="entry-sum-row"><span>Total Ítems</span><strong>{{ items.length }}</strong></div>
          <div class="entry-sum-row"><span>Total Cantidad</span><strong>{{ totalQty }}</strong></div>
          <div class="entry-sum-row entry-sum-row--total"><span>Valor Total</span><strong>$ {{ totalValue | number }}</strong></div>
        </div>
      </div>

      <!-- DERECHA: Detalle de Productos -->
      <div class="form-section">
        <h2 class="form-section-title">Detalle de Productos</h2>

        <!-- Encabezado -->
        <div class="entry-header">
          <span class="col-prod">Producto</span>
          <span class="col-unit">Unidad</span>
          <span class="col-qty text-center">Cantidad</span>
          <span class="col-cost text-right">Costo Unitario</span>
          <span class="col-total text-right">Total</span>
          <span class="col-del"></span>
        </div>

        <!-- Filas -->
        <div class="entry-row" *ngFor="let item of items; let i=index">
          <select [(ngModel)]="item.productId" (ngModelChange)="syncProduct(i)" class="form-select col-prod">
            <option value="">Seleccionar...</option>
            <option *ngFor="let p of products" [value]="p.id">{{ p.name }}</option>
          </select>
          <span class="col-unit text-muted">{{ item.unit }}</span>
          <input type="number" [(ngModel)]="item.quantity" min="1" class="form-input col-qty"
            (ngModelChange)="recalcItem(i)">
          <input type="number" [(ngModel)]="item.unitCost" min="0" class="form-input col-cost"
            (ngModelChange)="recalcItem(i)">
          <span class="col-total text-right inv-total">$ {{ item.total | number }}</span>
          <button class="btn-del-concept" (click)="removeItem(i)">✕</button>
        </div>

        <button class="btn-add-concept" (click)="addItem()">+ Agregar Producto</button>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/inventory">Cancelar</button>
      <button class="btn-primary" (click)="save()">Guardar Entrada</button>
    </div>

  </div>
  `
})
export class InventoryEntryComponent implements OnInit {
  products: Product[] = [];
  items: EntryItem[] = [
    { productId:'', product:'', unit:'', quantity:1, unitCost:0, total:0 }
  ];
  totalQty = 0; totalValue = 0;
  errorMsg = '';

  f = {
    date: new Date().toISOString().slice(0,10),
    supplier: 'Molinos del Valle S.A.S.',
    invoice: '', observations: ''
  };

  constructor(
    private svc: InventoryService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.svc.getAll().subscribe(p => { this.products = p; });
    // Pre-cargar producto si viene por query param
    const pid = this.route.snapshot.queryParamMap.get('product');
    if (pid) {
      const found = this.svc.getById(pid);
      if (found) {
        this.items[0] = { productId: found.id, product: found.name, unit: found.unit, quantity: 1, unitCost: found.unitCost, total: found.unitCost };
        this.recalc();
      }
    }
  }

  syncProduct(i: number): void {
    const p = this.products.find(x => x.id === this.items[i].productId);
    if (p) {
      this.items[i].product  = p.name;
      this.items[i].unit     = p.unit;
      this.items[i].unitCost = p.unitCost;
      this.recalcItem(i);
    }
  }

  addItem():    void { this.items.push({ productId:'', product:'', unit:'', quantity:1, unitCost:0, total:0 }); }
  removeItem(i: number): void { this.items.splice(i, 1); this.recalc(); }

  recalcItem(i: number): void {
    this.items[i].total = this.items[i].quantity * this.items[i].unitCost;
    this.recalc();
  }

  recalc(): void {
    this.totalQty   = this.items.reduce((a,i) => a + i.quantity, 0);
    this.totalValue = this.items.reduce((a,i) => a + i.total, 0);
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.supplier || this.items.some(i => !i.productId)) {
      this.errorMsg = 'Completa todos los campos obligatorios.';
      return;
    }
    this.svc.addEntry({ ...this.f, items: this.items });
    this.router.navigate(['/dashboard/inventory/products']);
  }
}
