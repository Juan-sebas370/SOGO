import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TraService } from '../tra.service';
import { Tra } from '../tra.model';

@Component({
  selector: 'app-tra-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./tra-reports.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/tra">TRA</a><span>›</span>
      <span>Reportes TRA</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Reportes de Tarjetas TRA</h1>
      </div>
      <button class="btn-new" (click)="generate()">📊 Generar Reporte</button>
    </div>

    <!-- Filtros de fecha y estado -->
    <div class="report-filters">
      <div class="form-field">
        <label>Fecha Desde</label>
        <input type="date" [(ngModel)]="dateFrom" class="form-input">
      </div>
      <div class="form-field">
        <label>Fecha Hasta</label>
        <input type="date" [(ngModel)]="dateTo" class="form-input">
      </div>
      <div class="form-field">
        <label>Estado</label>
        <select [(ngModel)]="filterStatus" class="form-select">
          <option value="Todos">Todos</option>
          <option value="Generada">Generada</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Anulada">Anulada</option>
        </select>
      </div>
    </div>

    <!-- Métricas -->
    <div class="report-stats">
      <div class="report-stat-card">
        <span class="stat-label">Total TRA Generadas</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Huéspedes Registrados</span>
        <strong class="stat-value">{{ stats.guests }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Noches Totales</span>
        <strong class="stat-value">{{ stats.nights }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Promedio por Noche</span>
        <strong class="stat-value">{{ stats.avgNights }}</strong>
      </div>
    </div>

    <!-- Gráficos -->
    <div class="report-charts">

      <!-- Barras: TRA por día -->
      <div class="chart-card">
        <h3 class="chart-title">TRA generadas por día</h3>
        <div class="bar-chart">
          <div class="bar-group" *ngFor="let d of dailyData">
            <div class="bar" [style.height.px]="d.height" [style.background]="d.color"></div>
            <span class="bar-value">{{ d.value }}</span>
            <span class="bar-label">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- Donut: Estados -->
      <div class="chart-card">
        <h3 class="chart-title">Estados</h3>
        <div class="donut-wrap">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <!-- Generadas ~88% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="242 34" stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Anuladas ~8% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18"
              stroke-dasharray="22 254" stroke-dashoffset="-242" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Pendientes ~4% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18"
              stroke-dasharray="11 265" stroke-dashoffset="-264" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-family="Poppins,sans-serif" font-size="16" font-weight="700" fill="#2B2B2B">{{ stats.total }}</text>
            <text x="60" y="70" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Total</text>
          </svg>
          <ul class="donut-legend">
            <li><span class="legend-dot" style="background:#23B57B"></span>Generadas <strong>{{ stats.generated }} ({{ pct(stats.generated) }}%)</strong></li>
            <li><span class="legend-dot" style="background:#EF4444"></span>Anuladas <strong>{{ stats.annulled }} ({{ pct(stats.annulled) }}%)</strong></li>
            <li><span class="legend-dot" style="background:#F59E0B"></span>Pendientes <strong>{{ stats.pending }} ({{ pct(stats.pending) }}%)</strong></li>
          </ul>
        </div>
      </div>

    </div>

    <!-- Acciones exportar -->
    <div class="report-export">
      <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
      <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
    </div>

  </div>
  `
})
export class TraReportsComponent implements OnInit {

  dateFrom    = '2024-05-01';
  dateTo      = '2024-05-31';
  filterStatus = 'Todos';

  stats = { total: 0, generated: 0, annulled: 0, pending: 0, guests: 0, nights: 0, avgNights: '0' };

  dailyData = [
    { label:'05/05', value:2, height:40,  color:'#0E5A9C' },
    { label:'10/05', value:3, height:60,  color:'#0E5A9C' },
    { label:'15/05', value:4, height:80,  color:'#0E5A9C' },
    { label:'20/05', value:5, height:100, color:'#0E5A9C' },
    { label:'24/05', value:3, height:60,  color:'#0E5A9C' },
    { label:'25/05', value:3, height:60,  color:'#0E5A9C' },
    { label:'26/05', value:3, height:60,  color:'#0E5A9C' },
    { label:'27/05', value:2, height:40,  color:'#0E5A9C' },
    { label:'28/05', value:2, height:40,  color:'#0E5A9C' },
    { label:'29/05', value:2, height:40,  color:'#0E5A9C' },
  ];

  constructor(private svc: TraService) {}

  ngOnInit(): void { this.generate(); }

  generate(): void { this.stats = this.svc.getStats() as any; }

  pct(n: number): string {
    return this.stats.total > 0 ? ((n / this.stats.total) * 100).toFixed(0) : '0';
  }

  exportExcel(): void { alert('Exportación a Excel (próximamente con backend)'); }
  exportPdf():   void { window.print(); }
}
