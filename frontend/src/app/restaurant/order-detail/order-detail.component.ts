import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { Order, OrderStatus } from '../restaurant.model';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./order-detail.component.css'],
  template: `
  <div class="res-page" *ngIf="order">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/restaurant/orders">Restaurante y Cafetería / Pedidos</a><span>›</span>
      <span>{{ order.number }}</span>
    </div>

    <div class="detail-header">
      <h1 class="res-title">Detalle del Pedido</h1>
      <span class="res-badge" [ngClass]="badgeClass(order.status)">{{ order.status }}</span>
    </div>

    <div class="detail-grid">

      <!-- Información del Pedido -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información del Pedido</h2>
        <div class="detail-row"><span class="detail-label">N° Pedido</span>    <span class="detail-value res-code">{{ order.number }}</span></div>
        <div class="detail-row"><span class="detail-label">Tipo de Pedido</span><span class="detail-value">{{ order.type }}</span></div>
        <div class="detail-row"><span class="detail-label">Número</span>        <span class="detail-value">{{ order.tableNumber }}</span></div>
        <div class="detail-row"><span class="detail-label">Mesero</span>        <span class="detail-value">{{ order.waiter }}</span></div>
        <div class="detail-row"><span class="detail-label">Personas</span>      <span class="detail-value">{{ order.persons }}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha y Hora</span>  <span class="detail-value">{{ order.dateTime | date:'dd/MM/yyyy HH:mm' }}</span></div>
        <div class="detail-row"><span class="detail-label">Estado</span>        <span class="res-badge" [ngClass]="badgeClass(order.status)">{{ order.status }}</span></div>
        <div class="detail-row" *ngIf="order.observations"><span class="detail-label">Observaciones</span><span class="detail-value">{{ order.observations }}</span></div>
      </div>

      <!-- Información del Cliente -->
      <div class="detail-section">
        <h2 class="detail-section-title">Información del Cliente</h2>
        <div class="detail-row"><span class="detail-label">Cliente</span>   <span class="detail-value font-bold">{{ order.clientName }}</span></div>
        <div class="detail-row"><span class="detail-label">Documento</span> <span class="detail-value">{{ order.docNumber }}</span></div>
        <div class="detail-row"><span class="detail-label">Teléfono</span>  <span class="detail-value">{{ order.phone }}</span></div>
      </div>

    </div>

    <!-- Productos del Pedido -->
    <div class="detail-section detail-products">
      <h2 class="detail-section-title">Productos del Pedido</h2>
      <table class="res-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Precio Unit.</th>
            <th class="text-right">Subtotal</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of order.items">
            <td>{{ item.product }}</td>
            <td class="text-right">{{ item.quantity }}</td>
            <td class="text-right">$ {{ item.unitPrice | number }}</td>
            <td class="text-right">$ {{ item.subtotal | number }}</td>
            <td><span class="res-badge" [ngClass]="item.status==='Listo' ? 'res-badge--ord-served' : 'res-badge--ord-prep'">{{ item.status }}</span></td>
          </tr>
        </tbody>
      </table>
      <div class="inv-totals inv-totals--right">
        <div class="total-row"><span>Subtotal</span><span>$ {{ order.subtotal | number }}</span></div>
        <div class="total-row"><span>IVA (19%)</span><span>$ {{ order.iva | number }}</span></div>
        <div class="total-row total-row--final"><span>Total</span><span>$ {{ order.total | number }}</span></div>
      </div>
    </div>

    <!-- Cambiar estado -->
    <div class="detail-section status-section">
      <h2 class="detail-section-title">Cambiar Estado</h2>
      <div class="status-buttons">
        <button class="btn-status" *ngFor="let s of statuses"
          [class.active]="order.status === s"
          [ngClass]="'btn-status--' + s.replace(' ','-').toLowerCase()"
          (click)="changeStatus(s)">{{ s }}</button>
      </div>
    </div>

    <!-- Acciones -->
    <div class="detail-actions">
      <button class="btn-outline" (click)="printTicket()">🖨 Imprimir Comanda</button>
      <button class="btn-outline" (click)="goEdit()">✏ Cambiar Estado</button>
      <button class="btn-danger-outline" (click)="cancelOrder()" [disabled]="order.status==='Cancelado' || order.status==='Servido'">🗑 Cancelar Pedido</button>
    </div>

  </div>
  `
})
export class OrderDetailComponent implements OnInit {
  order?: Order;
  statuses: OrderStatus[] = ['En cocina','Preparando','En camino','Servido','Cancelado'];

  constructor(private svc: RestaurantService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.order = this.svc.getOrderById(id);
  }

  badgeClass(s: OrderStatus): string {
    return { 'Preparando':'res-badge--ord-prep','En cocina':'res-badge--ord-kitchen','En camino':'res-badge--ord-way','Servido':'res-badge--ord-served','Cancelado':'res-badge--ord-cancel' }[s] ?? '';
  }

  changeStatus(s: OrderStatus): void {
    this.svc.updateOrder(this.order!.id, { status: s });
    this.order = this.svc.getOrderById(this.order!.id);
  }

  goEdit():       void { this.router.navigate(['/dashboard/restaurant/orders', this.order!.id, 'edit']); }
  printTicket():  void { window.print(); }
  cancelOrder():  void {
    if (confirm('¿Cancelar este pedido?')) {
      this.svc.updateOrder(this.order!.id, { status: 'Cancelado' });
      this.order = this.svc.getOrderById(this.order!.id);
    }
  }
}
