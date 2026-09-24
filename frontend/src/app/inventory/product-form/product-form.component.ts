import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { Product } from '../inventory.model';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./product-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/inventory">Inventarios</a><span>›</span>
      <a routerLink="/dashboard/inventory/products">Productos</a><span>›</span>
      <span>{{ isEdit ? 'Editar' : 'Nuevo' }}</span>
    </div>

    <h1 class="res-title">{{ isEdit ? 'Editar Producto' : 'Registro de Nuevo Producto' }}</h1>

    <div class="product-form-grid">

      <!-- COLUMNA 1: Información del Producto -->
      <div class="form-section">
        <h2 class="form-section-title">Información del Producto</h2>

        <div class="form-field">
          <label>Código</label>
          <input type="text" [value]="isEdit ? f.code : '(Automático)'" class="form-input" readonly>
        </div>
        <div class="form-field">
          <label>Nombre del Producto *</label>
          <input type="text" [(ngModel)]="f.name" placeholder="Harina de Trigo 1 kg" class="form-input">
        </div>
        <div class="form-field">
          <label>Categoría *</label>
          <select [(ngModel)]="f.category" class="form-select">
            <option>Alimentos</option>
            <option>Bebidas</option>
            <option>Limpieza</option>
            <option>Aseo</option>
            <option>Otros</option>
          </select>
        </div>
        <div class="form-field">
          <label>Unidad de Medida *</label>
          <select [(ngModel)]="f.unit" class="form-select">
            <option>Unidad</option><option>Bulto</option><option>Bolsa</option>
            <option>Paquete</option><option>Caja</option><option>Litro</option>
            <option>Kilogramo</option><option>Gramo</option>
          </select>
        </div>
        <div class="form-field">
          <label>Marca</label>
          <input type="text" [(ngModel)]="f.brand" placeholder="Doña Blanca" class="form-input">
        </div>
        <div class="form-field">
          <label>Proveedor</label>
          <input type="text" [(ngModel)]="f.supplier" placeholder="Molinos del Valle S.A.S." class="form-input">
        </div>
        <div class="form-field">
          <label>Descripción</label>
          <textarea [(ngModel)]="f.description" rows="3" placeholder="Harina de trigo fortificada de 1 kg." class="form-textarea"></textarea>
        </div>
        <div class="form-field">
          <label class="checkbox-label">
            <input type="checkbox" [(ngModel)]="f.isPerishable"> Producto Perecedero
          </label>
        </div>
        <div class="form-field" *ngIf="f.isPerishable">
          <label>Fecha de Vencimiento</label>
          <input type="date" [(ngModel)]="f.expiryDate" class="form-input">
        </div>
      </div>

      <!-- COLUMNA 2: Información de Inventario -->
      <div class="form-section">
        <h2 class="form-section-title">Información de Inventario</h2>

        <div class="form-field">
          <label>Stock Actual *</label>
          <input type="number" [(ngModel)]="f.stockActual" min="0" class="form-input">
        </div>
        <div class="form-field">
          <label>Stock Mínimo *</label>
          <input type="number" [(ngModel)]="f.stockMin" min="0" class="form-input">
        </div>
        <div class="form-field">
          <label>Stock Máximo *</label>
          <input type="number" [(ngModel)]="f.stockMax" min="0" class="form-input">
        </div>
        <div class="form-field">
          <label>Ubicación</label>
          <select [(ngModel)]="f.location" class="form-select">
            <option>Almacén Principal - Estante 1</option>
            <option>Almacén Principal - Estante 2</option>
            <option>Almacén Principal - Estante 3</option>
            <option>Bodega Limpieza - Estante 1</option>
            <option>Bodega Aseo - Estante 1</option>
            <option>Refrigerador Principal</option>
          </select>
        </div>
        <div class="form-field">
          <label>Costo Unitario *</label>
          <input type="number" [(ngModel)]="f.unitCost" min="0" class="form-input">
        </div>
        <div class="form-field">
          <label>Precio de Venta Sugerido</label>
          <input type="number" [(ngModel)]="f.salePrice" min="0" class="form-input">
        </div>
      </div>

      <!-- COLUMNA 3: Imagen -->
      <div class="form-section image-section">
        <h2 class="form-section-title">Imagen del Producto</h2>
        <div class="image-upload-area">
          <div class="image-placeholder">
            <span class="image-icon">🖼</span>
            <p>Arrastra una imagen aquí<br>o haz clic para seleccionar</p>
            <small>Formatos: JPG, PNG<br>Tamaño máximo: 2MB</small>
          </div>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/inventory/products">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Guardar Producto' }}
      </button>
    </div>

  </div>
  `
})
export class ProductFormComponent implements OnInit {
  isEdit = false; existingId = ''; errorMsg = '';

  f: Partial<Product> = {
    name: '', category: 'Alimentos', unit: 'Unidad',
    stockActual: 0, stockMin: 10, stockMax: 100,
    unitCost: 0, salePrice: 0,
    location: 'Almacén Principal - Estante 1',
    brand: '', supplier: '', description: '',
    isPerishable: false, expiryDate: ''
  };

  constructor(private svc: InventoryService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getById(id);
      if (found) { this.f = { ...found }; this.isEdit = true; this.existingId = id; }
    }
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.name || !this.f.unitCost) { this.errorMsg = 'Completa los campos obligatorios.'; return; }
    if (this.isEdit) { this.svc.update(this.existingId, this.f as Product); }
    else { this.svc.create(this.f as Omit<Product,'id'|'code'|'status'>); }
    this.router.navigate(['/dashboard/inventory/products']);
  }
}
