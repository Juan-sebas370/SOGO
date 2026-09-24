import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InvoiceService } from '../invoice.service';

@Component({
  selector: 'app-invoice-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./invoice-reports.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/billing">Facturación</a><span>›</span>
      <span>Reportes</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Reportes de Facturación</h1>
      <button class="btn-new" (click)="generate()">📊 Generar Reporte</button>
    </div>

    <!-- Filtros -->
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
          <option>Pagada</option>
          <option>Pendiente</option>
          <option>Anulada</option>
          <option>Rechazada</option>
        </select>
      </div>
    </div>

    <!-- Métricas -->
    <div class="report-stats">
      <div class="report-stat-card">
        <span class="stat-label">Total Facturas</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Facturas Pagadas</span>
        <strong class="stat-value">{{ stats.paid }}</strong>
      </div>
      <div class="report-stat-card">
        <span class="stat-label">Facturas Pendientes</span>
        <strong class="stat-value">{{ stats.pending }}</strong>
      </div>
      <div class="report-stat-card report-stat-card--highlight">
        <span class="stat-label">Total Ingresos</span>
        <strong class="stat-value stat-value--income">$ {{ stats.income | number }}</strong>
      </div>
    </div>

    <!-- Gráficos -->
    <div class="report-charts">

      <!-- Barras: facturación diaria -->
      <div class="chart-card chart-card--wide">
        <h3 class="chart-title">Facturación diaria (este mes) <small>Millones ($)</small></h3>
        <div class="bar-chart bar-chart--tall">
          <div class="bar-group" *ngFor="let d of dailyData">
            <div class="bar" [style.height.px]="d.height" style="background:#0E5A9C"></div>
            <span class="bar-label">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- Donut: estado de facturas -->
      <div class="chart-card">
        <h3 class="chart-title">Estado de facturas</h3>
        <div class="donut-wrap">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="196 80" stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#3B82F6" stroke-width="18"
              stroke-dasharray="60 216" stroke-dashoffset="-196" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18"
              stroke-dasharray="22 254" stroke-dashoffset="-256" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18"
              stroke-dasharray="10 266" stroke-dashoffset="-278" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-family="Poppins,sans-serif" font-size="16" font-weight="700" fill="#2B2B2B">{{ stats.total }}</text>
            <text x="60" y="70" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Total</text>
          </svg>
          <ul class="donut-legend">
            <li><span class="legend-dot" style="background:#23B57B"></span>Pagadas <strong>{{ stats.paid }} ({{ pct(stats.paid) }}%)</strong></li>
            <li><span class="legend-dot" style="background:#3B82F6"></span>Pendientes <strong>{{ stats.pending }} ({{ pct(stats.pending) }}%)</strong></li>
            <li><span class="legend-dot" style="background:#EF4444"></span>Rechazadas <strong>{{ stats.rejected }} ({{ pct(stats.rejected) }}%)</strong></li>
            <li><span class="legend-dot" style="background:#F59E0B"></span>Anuladas <strong>{{ stats.annulled }} ({{ pct(stats.annulled) }}%)</strong></li>
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
export class InvoiceReportsComponent implements OnInit {
  dateFrom     = '2024-05-01';
  dateTo       = '2024-05-31';
  filterStatus = 'Todos';

  stats = { total:0, paid:0, pending:0, annulled:0, rejected:0, income:0 };

  dailyData = [
    {label:'05/05',height:30},{label:'09/05',height:40},{label:'11/05',height:60},
    {label:'15/05',height:50},{label:'21/05',height:80},{label:'24/05',height:70},
    {label:'25/05',height:55},{label:'26/05',height:65},{label:'29/05',height:45},
    {label:'31/05',height:50},
  ];

  constructor(private svc: InvoiceService) {}

  ngOnInit(): void { this.generate(); }

  generate(): void { this.stats = this.svc.getStats() as any; }

  pct(n: number): string { return this.stats.total > 0 ? ((n / this.stats.total) * 100).toFixed(0) : '0'; }

  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
}
