import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { Order, OrderItem, MenuItem } from '../restaurant.model';

@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./order-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/restaurant">Restaurante y Cafetería</a><span>›</span>
      <a routerLink="/dashboard/restaurant/orders">Pedidos</a><span>›</span>
      <span>{{ isEdit ? 'Editar Pedido' : 'Nuevo Pedido' }}</span>
    </div>

    <h1 class="res-title">{{ isEdit ? 'Editar Pedido' : 'Nuevo Pedido' }}</h1>

    <div class="order-form-grid">

      <!-- IZQUIERDA: Información del Pedido -->
      <div class="form-section">
        <h2 class="form-section-title">Información del Pedido</h2>

        <div class="form-field">
          <label>Tipo de Pedido *</label>
          <select [(ngModel)]="f.type" class="form-select">
            <option>En mesa</option>
            <option>Domicilio</option>
            <option>Para llevar</option>
          </select>
        </div>

        <div class="form-field" *ngIf="f.type==='En mesa'">
          <label>Mesa *</label>
          <select [(ngModel)]="f.tableNumber" class="form-select">
            <option *ngFor="let t of availableTables" [value]="'Mesa ' + t.number">Mesa {{ t.number }}</option>
          </select>
        </div>

        <div class="form-field" *ngIf="f.type==='Domicilio'">
          <label>Dirección de entrega *</label>
          <input type="text" [(ngModel)]="f.tableNumber" placeholder="Calle 10 #5-20" class="form-input">
        </div>

        <div class="form-field">
          <label>Número de Clientes</label>
          <input type="number" [(ngModel)]="f.persons" min="1" class="form-input">
        </div>

        <div class="form-field">
          <label>Mesero *</label>
          <select [(ngModel)]="f.waiter" class="form-select">
            <option>Juan Camilo</option>
            <option>María</option>
            <option>Carlos</option>
            <option>Sofía</option>
          </select>
        </div>

        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" placeholder="Sin cebolla en las hamburguesas..." class="form-textarea"></textarea>
        </div>
      </div>

      <!-- DERECHA: Productos -->
      <div class="form-section products-section">
        <h2 class="form-section-title">Productos</h2>

        <!-- Selector de producto -->
        <div class="product-selector">
          <select [(ngModel)]="selectedProduct" class="form-select">
            <option value="">Seleccionar producto...</option>
            <optgroup *ngFor="let cat of categories" [label]="cat">
              <option *ngFor="let m of menuByCategory(cat)" [value]="m.id">{{ m.name }} — $ {{ m.price | number }}</option>
            </optgroup>
          </select>
          <button class="btn-add-concept" (click)="addItem()">+ Agregar Producto</button>
        </div>

        <!-- Encabezado tabla -->
        <div class="products-header">
          <span>Producto</span><span class="text-center">Cant.</span>
          <span class="text-right">Precio Unit.</span><span class="text-right">Subtotal</span>
          <span></span>
        </div>

        <!-- Items -->
        <div class="product-row" *ngFor="let item of items; let i=index">
          <span class="item-name">{{ item.product }}</span>
          <input type="number" [(ngModel)]="item.quantity" min="1" class="form-input qty-input" (ngModelChange)="recalcItem(i)">
          <span class="text-right item-price">$ {{ item.unitPrice | number }}</span>
          <span class="text-right item-sub">$ {{ item.subtotal | number }}</span>
          <button class="btn-del-concept" (click)="removeItem(i)">✕</button>
        </div>

        <p class="no-items" *ngIf="items.length===0">Agrega productos al pedido.</p>

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
      <button class="btn-secondary" routerLink="/dashboard/restaurant/orders">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Guardar Pedido' }}
      </button>
    </div>

  </div>
  `
})
export class OrderFormComponent implements OnInit {
  isEdit = false; existingId = ''; errorMsg = '';
  selectedProduct = '';
  categories = ['Alimentos','Bebidas','Postres','Otros'];
  items: OrderItem[] = [];
  subtotal = 0; iva = 0; total = 0;
  availableTables: { number: number }[] = [];

  f: Partial<Order> = {
    type: 'En mesa', tableNumber: 'Mesa 01', persons: 1,
    waiter: 'Juan Camilo', observations: '', status: 'En cocina',
    dateTime: new Date().toISOString()
  };

  constructor(private svc: RestaurantService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.svc.getTables().subscribe(tables => {
      this.availableTables = tables
        .filter(t => t.zone === 'Salón Principal' && t.status === 'Disponible')
        .map(t => ({ number: t.number }));
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getOrderById(id);
      if (found) { this.f = { ...found }; this.items = found.items.map(i => ({ ...i })); this.isEdit = true; this.existingId = id; this.recalc(); }
    }
  }

  menuByCategory(cat: string): MenuItem[] { return this.svc.menu.filter(m => m.category === cat); }

  addItem(): void {
    if (!this.selectedProduct) return;
    const m = this.svc.menu.find(x => x.id === this.selectedProduct);
    if (!m) return;
    const existing = this.items.find(i => i.product === m.name);
    if (existing) { existing.quantity++; existing.subtotal = existing.quantity * existing.unitPrice; }
    else { this.items.push({ product: m.name, category: m.category, quantity: 1, unitPrice: m.price, subtotal: m.price, status: 'Preparando' }); }
    this.selectedProduct = '';
    this.recalc();
  }

  removeItem(i: number): void { this.items.splice(i, 1); this.recalc(); }

  recalcItem(i: number): void { const item = this.items[i]; item.subtotal = item.quantity * item.unitPrice; this.recalc(); }

  recalc(): void {
    this.subtotal = this.items.reduce((a,i) => a + i.subtotal, 0);
    this.iva      = Math.round(this.subtotal * 0.19);
    this.total    = this.subtotal + this.iva;
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.tableNumber || this.items.length === 0) { this.errorMsg = 'Agrega al menos un producto y selecciona una mesa.'; return; }
    const payload = { ...this.f, items: this.items, subtotal: this.subtotal, iva: this.iva, total: this.total } as Omit<Order,'id'|'number'>;
    if (this.isEdit) { this.svc.updateOrder(this.existingId, payload); }
    else { this.svc.createOrder(payload); }
    this.router.navigate(['/dashboard/restaurant/orders']);
  }
}
