import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';
import { Product, StockStatus } from '../inventory.model';

@Component({
  selector: 'app-inventory-alerts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./inventory-alerts.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/inventory">Inventarios</a><span>›</span>
      <span>Alertas</span>
    </div>

    <h1 class="res-title">Alertas de Inventario</h1>

    <!-- Métricas de alerta -->
    <div class="alert-metrics">
      <div class="alert-metric-card alert-metric-card--low">
        <div class="alert-metric-icon">⚠️</div>
        <div>
          <span class="metric-label">Stock Bajo</span>
          <strong class="metric-value">{{ alerts.low }}</strong>
        </div>
      </div>
      <div class="alert-metric-card alert-metric-card--critical">
        <div class="alert-metric-icon">🚨</div>
        <div>
          <span class="metric-label">Stock Crítico</span>
          <strong class="metric-value">{{ alerts.critical }}</strong>
        </div>
      </div>
      <div class="alert-metric-card alert-metric-card--expiring">
        <div class="alert-metric-icon">📅</div>
        <div>
          <span class="metric-label">Próximos a Vencer</span>
          <strong class="metric-value">{{ alerts.expiring }}</strong>
        </div>
      </div>
    </div>

    <!-- Productos con stock bajo o crítico -->
    <div class="detail-section" style="margin-top:20px">
      <div class="detail-header-row">
        <h2 class="detail-section-title">Productos con Stock Bajo o Crítico</h2>
        <a routerLink="/dashboard/inventory/products" class="link-view-all">Ver todos los alertas →</a>
      </div>

      <table class="res-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th class="text-center">Stock Actual</th>
            <th class="text-center">Stock Mínimo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of alertProducts">
            <td class="font-bold">{{ p.name }}</td>
            <td>{{ p.category }}</td>
            <td class="text-center text-danger">{{ p.stockActual }}</td>
            <td class="text-center text-muted">{{ p.stockMin }}</td>
            <td><span class="res-badge" [ngClass]="badgeClass(p.status)">{{ p.status }}</span></td>
            <td>
              <div class="res-actions">
                <button class="action-btn action-btn--view"  title="Ver"    (click)="goDetail(p.id)">👁</button>
                <button class="action-btn action-btn--edit"  title="Editar" (click)="goEdit(p.id)">✏</button>
                <button class="action-btn action-btn--print" title="Entrada" (click)="goEntry(p.id)">+</button>
              </div>
            </td>
          </tr>
          <tr *ngIf="alertProducts.length===0">
            <td colspan="6" class="res-empty">🎉 No hay alertas de inventario en este momento.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Movimientos recientes -->
    <div class="detail-section" style="margin-top:20px">
      <h2 class="detail-section-title">Movimientos Recientes</h2>
      <table class="res-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Producto</th>
            <th class="text-center">Cantidad</th>
            <th>Usuario</th>
            <th>Referencia</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of movements">
            <td>{{ m.date | date:'dd/MM/yyyy' }}</td>
            <td>
              <span class="movement-type"
                [class.movement-type--entry]="m.type==='Entrada'"
                [class.movement-type--exit]="m.type==='Salida'"
                [class.movement-type--adjust]="m.type==='Ajuste'">
                {{ m.type }}
              </span>
            </td>
            <td>{{ m.product }}</td>
            <td class="text-center">
              <span [class.text-danger]="m.type==='Salida'">
                {{ m.type==='Salida' ? '-' : '+' }}{{ m.quantity }}
              </span>
            </td>
            <td>{{ m.user }}</td>
            <td class="text-muted">{{ m.reference }}</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
  `
})
export class InventoryAlertsComponent implements OnInit {
  alertProducts: Product[] = [];
  movements: any[] = [];
  alerts = { low: 0, critical: 0, expiring: 0 };

  constructor(private svc: InventoryService, private router: Router) {}

  ngOnInit(): void {
    this.alerts = this.svc.getAlerts();
    this.svc.getAll().subscribe(products => {
      this.alertProducts = products.filter(p => p.status === 'Bajo' || p.status === 'Crítico' || p.status === 'Vencido');
    });
    this.movements = this.svc.getMovements().slice(0, 8);
  }

  badgeClass(s: StockStatus): string {
    return { 'Óptimo':'res-badge--inv-opt','Bajo':'res-badge--inv-low','Crítico':'res-badge--inv-crit','Vencido':'res-badge--inv-exp' }[s] ?? '';
  }

  goDetail(id: string): void { this.router.navigate(['/dashboard/inventory/products', id]); }
  goEdit(id: string):   void { this.router.navigate(['/dashboard/inventory/products', id, 'edit']); }
  goEntry(id: string):  void { this.router.navigate(['/dashboard/inventory/entry'], { queryParams: { product: id } }); }
}
