import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../inventory.service';

@Component({
  selector: 'app-inventory-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./inventory-reports.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/inventory">Inventarios</a><span>›</span>
      <span>Reportes · Valorizado</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Reporte de Inventario Valorizado</h1>
      <button class="btn-new" (click)="generate()">📊 Generar Reporte</button>
    </div>

    <!-- Filtros -->
    <div class="report-filters">
      <div class="form-field"><label>Fecha de Corte *</label><input type="date" [(ngModel)]="cutDate" class="form-input"></div>
      <div class="form-field">
        <label>Categoría</label>
        <select [(ngModel)]="filterCategory" class="form-select">
          <option value="Todas">Todas</option>
          <option>Alimentos</option><option>Bebidas</option>
          <option>Limpieza</option><option>Aseo</option><option>Otros</option>
        </select>
      </div>
      <div class="form-field">
        <label>Proveedor</label>
        <select [(ngModel)]="filterSupplier" class="form-select">
          <option value="Todas">Todas</option>
          <option>Molinos del Valle S.A.S.</option>
          <option>Alquería S.A.</option>
          <option>Café de Colombia Ltda.</option>
        </select>
      </div>
    </div>

    <!-- Métricas -->
    <div class="report-stats">
      <div class="report-stat-card">
        <span class="stat-label">Total Unidades</span>
        <strong class="stat-value">{{ report?.totals?.units | number }}</strong>
      </div>
      <div class="report-stat-card report-stat-card--highlight">
        <span class="stat-label">Valor Costo</span>
        <strong class="stat-value stat-value--income">$ {{ report?.totals?.costValue | number }}</strong>
      </div>
      <div class="report-stat-card report-stat-card--highlight">
        <span class="stat-label">Valor Venta</span>
        <strong class="stat-value stat-value--income">$ {{ report?.totals?.saleValue | number }}</strong>
      </div>
    </div>

    <!-- Tabla por categoría -->
    <div class="report-grid">

      <!-- Tabla -->
      <div class="detail-section">
        <h2 class="detail-section-title">Resumen por Categoría</h2>
        <table class="res-table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th class="text-center">Productos</th>
              <th class="text-right">Unidades</th>
              <th class="text-right">Valor Costo</th>
              <th class="text-right">Valor Venta</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of categoryRows">
              <td class="font-bold">{{ row.category }}</td>
              <td class="text-center">{{ row.products }}</td>
              <td class="text-right">{{ row.units | number }}</td>
              <td class="text-right">$ {{ row.costValue | number }}</td>
              <td class="text-right inv-total">$ {{ row.saleValue | number }}</td>
            </tr>
            <tr class="total-final-row">
              <td><strong>Totales</strong></td>
              <td class="text-center"><strong>{{ report?.totals?.products }}</strong></td>
              <td class="text-right"><strong>{{ report?.totals?.units | number }}</strong></td>
              <td class="text-right"><strong>$ {{ report?.totals?.costValue | number }}</strong></td>
              <td class="text-right inv-total"><strong>$ {{ report?.totals?.saleValue | number }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Donut por categoría -->
      <div class="detail-section">
        <h2 class="detail-section-title">Distribución por Categoría</h2>
        <div class="donut-wrap" style="margin-top:16px">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#0E5A9C" stroke-width="18"
              stroke-dasharray="124 152" stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="55 221" stroke-dashoffset="-124" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18"
              stroke-dasharray="41 235" stroke-dashoffset="-179" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#8B5CF6" stroke-width="18"
              stroke-dasharray="28 248" stroke-dashoffset="-220" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18"
              stroke-dasharray="28 248" stroke-dashoffset="-248" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-family="Poppins,sans-serif" font-size="13" font-weight="700" fill="#2B2B2B">{{ report?.totals?.products }}</text>
            <text x="60" y="70" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Productos</text>
          </svg>
          <ul class="donut-legend">
            <li><span class="legend-dot" style="background:#0E5A9C"></span>Alimentos <strong>40%</strong></li>
            <li><span class="legend-dot" style="background:#23B57B"></span>Bebidas <strong>20%</strong></li>
            <li><span class="legend-dot" style="background:#F59E0B"></span>Limpieza <strong>15%</strong></li>
            <li><span class="legend-dot" style="background:#8B5CF6"></span>Aseo <strong>10%</strong></li>
            <li><span class="legend-dot" style="background:#EF4444"></span>Otros <strong>15%</strong></li>
          </ul>
        </div>
      </div>

    </div>

    <!-- Exportar -->
    <div class="report-export">
      <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
      <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
    </div>

  </div>
  `
})
export class InventoryReportsComponent implements OnInit {
  cutDate        = new Date().toISOString().slice(0,10);
  filterCategory = 'Todas';
  filterSupplier = 'Todas';
  report: any    = null;
  categoryRows: any[] = [];

  constructor(private svc: InventoryService) {}

  ngOnInit(): void { this.generate(); }

  generate(): void {
    this.report = this.svc.getValuationReport();
    this.categoryRows = Object.entries(this.report.byCategory).map(([category, data]: any) => ({
      category, ...data
    }));
  }

  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
}
