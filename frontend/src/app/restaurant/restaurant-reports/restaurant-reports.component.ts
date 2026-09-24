import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';

@Component({
  selector: 'app-restaurant-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./restaurant-reports.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/restaurant">Restaurante y Cafetería</a><span>›</span>
      <span>Reportes</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Reportes del Restaurante y Cafetería</h1>
      <button class="btn-new" (click)="generate()">📊 Generar Reporte</button>
    </div>

    <!-- Filtros -->
    <div class="report-filters">
      <div class="form-field"><label>Fecha Desde</label><input type="date" [(ngModel)]="dateFrom" class="form-input"></div>
      <div class="form-field"><label>Fecha Hasta</label><input type="date" [(ngModel)]="dateTo" class="form-input"></div>
      <div class="form-field">
        <label>Tipo de Reporte</label>
        <select [(ngModel)]="reportType" class="form-select">
          <option>Ventas</option>
          <option>Pedidos</option>
          <option>Productos</option>
        </select>
      </div>
    </div>

    <!-- Métricas -->
    <div class="report-stats">
      <div class="report-stat-card report-stat-card--highlight">
        <span class="stat-label">Ventas Totales</span>
        <strong class="stat-value stat-value--income">$ {{ stats.sales | number }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Pedidos Totales</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Ticket Promedio</span>
        <strong class="stat-value">$ {{ stats.avgTicket | number }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Productos Vendidos</span>
        <strong class="stat-value">{{ stats.products }}</strong>
      </div>
    </div>

    <!-- Gráficos -->
    <div class="report-charts">

      <!-- Barras: ventas por día -->
      <div class="chart-card chart-card--wide">
        <h3 class="chart-title">Ventas por día (este mes) <small>Millones ($)</small></h3>
        <div class="bar-chart bar-chart--tall">
          <div class="bar-group" *ngFor="let d of dailyData">
            <div class="bar" [style.height.px]="d.height" style="background:#0E5A9C"></div>
            <span class="bar-label">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- Donut: ventas por categoría -->
      <div class="chart-card">
        <h3 class="chart-title">Ventas por categoría</h3>
        <div class="donut-wrap">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <!-- Alimentos 68% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#0E5A9C" stroke-width="18"
              stroke-dasharray="187 89" stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Bebidas 20% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="55 221" stroke-dashoffset="-187" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Postres 8% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18"
              stroke-dasharray="22 254" stroke-dashoffset="-242" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Otros 4% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18"
              stroke-dasharray="11 265" stroke-dashoffset="-264" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-family="Poppins,sans-serif" font-size="13" font-weight="700" fill="#2B2B2B">Ventas</text>
            <text x="60" y="70" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Por categoría</text>
          </svg>
          <ul class="donut-legend">
            <li><span class="legend-dot" style="background:#0E5A9C"></span>Alimentos <strong>68%</strong></li>
            <li><span class="legend-dot" style="background:#23B57B"></span>Bebidas <strong>20%</strong></li>
            <li><span class="legend-dot" style="background:#F59E0B"></span>Postres <strong>8%</strong></li>
            <li><span class="legend-dot" style="background:#EF4444"></span>Otros <strong>4%</strong></li>
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
export class RestaurantReportsComponent implements OnInit {
  dateFrom = '2024-05-01'; dateTo = '2024-05-31'; reportType = 'Ventas';
  stats = { sales:0, total:0, active:0, products:0, avgTicket:0, byCategory:{ Alimentos:68, Bebidas:20, Postres:8, Otros:4 } };

  dailyData = [
    {label:'05/05',height:25},{label:'07/05',height:35},{label:'09/05',height:50},
    {label:'11/05',height:45},{label:'15/05',height:60},{label:'17/05',height:40},
    {label:'19/05',height:55},{label:'21/05',height:70},{label:'24/05',height:80},
    {label:'26/05',height:65},{label:'28/05',height:50},{label:'31/05',height:45},
  ];

  constructor(private svc: RestaurantService) {}

  ngOnInit(): void { this.generate(); }

  generate(): void { this.stats = this.svc.getStats() as any; }

  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
}
