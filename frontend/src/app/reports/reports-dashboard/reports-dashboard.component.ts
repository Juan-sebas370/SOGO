import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReportsService } from '../reports.service';

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./reports-dashboard.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <span>Reportes</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Dashboard de Reportes</h1>
        <p class="res-subtitle">Mayo 2024</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" routerLink="/dashboard/reports/stats">📊 Estadísticas</button>
        <button class="btn-new" routerLink="/dashboard/reports/generator">+ Nuevo Reporte</button>
      </div>
    </div>

    <!-- KPIs principales -->
    <div class="report-kpi-grid">
      <div class="kpi-card">
        <span class="kpi-label">Ingresos Totales</span>
        <strong class="kpi-value">$ {{ kpis.totalIncome | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.incomeGrowth }}% vs Abr 2024</span>
      </div>
      <div class="kpi-card kpi-card--expense">
        <span class="kpi-label">Egresos Totales</span>
        <strong class="kpi-value text-danger">$ {{ kpis.totalExpense | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.expenseGrowth }}% vs Abr 2024</span>
      </div>
      <div class="kpi-card kpi-card--profit">
        <span class="kpi-label">Utilidad Neta</span>
        <strong class="kpi-value text-profit">$ {{ kpis.netProfit | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.profitGrowth }}% vs Abr 2024</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Transacciones</span>
        <strong class="kpi-value">{{ kpis.transactions | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.transGrowth }}% vs Abr 2024</span>
      </div>
    </div>

    <!-- Gráficos -->
    <div class="reports-charts-grid">

      <!-- Ingresos vs Egresos -->
      <div class="report-chart-card report-chart-card--wide">
        <h3 class="chart-title">Ingresos vs Egresos (Últimos 6 meses)</h3>
        <div class="line-chart-area">
          <!-- Líneas SVG simuladas -->
          <svg class="line-chart-svg" viewBox="0 0 500 160" preserveAspectRatio="none">
            <!-- Fondo grid -->
            <line *ngFor="let y of [20,60,100,140]" x1="0" [attr.y1]="y" x2="500" [attr.y2]="y" stroke="#F1EDE6" stroke-width="1"/>
            <!-- Línea ingresos -->
            <polyline points="40,130 120,118 200,105 280,98 360,95 460,85"
              fill="none" stroke="#0E5A9C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Línea egresos -->
            <polyline points="40,145 120,137 200,128 280,122 360,120 460,118"
              fill="none" stroke="#EF4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- Puntos ingresos -->
            <circle *ngFor="let p of incomePoints" [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="#0E5A9C"/>
            <!-- Puntos egresos -->
            <circle *ngFor="let p of expensePoints" [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="#EF4444"/>
          </svg>
          <!-- Eje X etiquetas -->
          <div class="line-chart-labels">
            <span *ngFor="let d of chartData">{{ d.month }}</span>
          </div>
        </div>
        <div class="chart-legend-row">
          <span class="chart-legend-item"><span class="legend-line" style="background:#0E5A9C"></span>Ingresos</span>
          <span class="chart-legend-item"><span class="legend-line" style="background:#EF4444"></span>Egresos</span>
        </div>
      </div>

      <!-- Donut por módulo -->
      <div class="report-chart-card">
        <h3 class="chart-title">Ingresos por Módulo</h3>
        <div class="donut-wrap" style="margin-top:12px">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#0E5A9C" stroke-width="18"
              stroke-dasharray="115 161" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="60 216" stroke-dashoffset="-115" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18"
              stroke-dasharray="44 232" stroke-dashoffset="-175" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18"
              stroke-dasharray="55 221" stroke-dashoffset="-219" stroke-linecap="round" transform="rotate(-90 60 60)"/>
          </svg>
          <ul class="donut-legend">
            <li *ngFor="let m of byModule">
              <span class="legend-dot" [style.background]="m.color"></span>
              {{ m.name }} <strong>{{ m.pct }}%</strong>
            </li>
          </ul>
        </div>
      </div>

    </div>

    <!-- Indicadores clave + Reportes recientes -->
    <div class="reports-bottom-grid">

      <!-- Indicadores clave -->
      <div class="detail-section">
        <h2 class="detail-section-title">Indicadores Clave</h2>
        <div class="indicator-list">
          <div class="indicator-item" *ngFor="let ind of indicators">
            <span class="indicator-name">{{ ind.label }}</span>
            <div class="indicator-right">
              <strong class="indicator-val">{{ ind.value }}</strong>
              <span class="indicator-trend" [class.up]="ind.trend > 0" [class.down]="ind.trend < 0">
                {{ ind.trend > 0 ? '▲' : '▼' }} {{ ind.trend | number:'1.1-1' }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Reportes recientes -->
      <div class="detail-section">
        <div class="detail-header-row">
          <h2 class="detail-section-title">Reportes Recientes</h2>
          <a routerLink="/dashboard/reports/generator" class="link-view-all">Ver todos los reportes →</a>
        </div>

        <div class="recent-report-item" *ngFor="let r of recentReports">
          <div class="recent-report-info">
            <span class="recent-report-name">{{ r.name }}</span>
            <span class="recent-report-period">{{ r.period }}</span>
          </div>
          <div class="recent-report-right">
            <span class="recent-report-date">{{ r.generated }}</span>
            <span class="res-badge res-badge--inv-opt">{{ r.format }}</span>
          </div>
        </div>
      </div>

      <!-- Acciones rápidas -->
      <div class="detail-section">
        <h2 class="detail-section-title">Acciones Rápidas</h2>
        <div class="quick-actions">
          <a routerLink="/dashboard/reports/generator" class="quick-action-btn">
            <span>📄</span> Nuevo Comprobante
          </a>
          <a routerLink="/dashboard/reports/generator" class="quick-action-btn">
            <span>📋</span> Plan de Cuentas
          </a>
          <a routerLink="/dashboard/reports/generator" class="quick-action-btn">
            <span>📚</span> Libro Diario
          </a>
          <a routerLink="/dashboard/reports/stats" class="quick-action-btn">
            <span>📊</span> Reportes Contables
          </a>
        </div>
      </div>

    </div>

  </div>
  `
})
export class ReportsDashboardComponent implements OnInit {
  kpis: any       = {};
  chartData: any[] = [];
  byModule: any[] = [];
  indicators: any[]= [];
  recentReports: any[] = [];

  incomePoints  = [{x:40,y:130},{x:120,y:118},{x:200,y:105},{x:280,y:98},{x:360,y:95},{x:460,y:85}];
  expensePoints = [{x:40,y:145},{x:120,y:137},{x:200,y:128},{x:280,y:122},{x:360,y:120},{x:460,y:118}];

  constructor(private svc: ReportsService) {}

  ngOnInit(): void {
    this.kpis         = this.svc.getKpis();
    this.chartData    = this.svc.getIncomeVsExpense();
    this.byModule     = this.svc.getByModule();
    this.indicators   = this.svc.getKeyIndicators();
    this.recentReports= this.svc.getRecentReports();
  }
}
