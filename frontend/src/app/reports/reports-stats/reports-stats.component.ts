import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReportsService } from '../reports.service';

@Component({
  selector: 'app-reports-stats',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./reports-stats.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/reports">Reportes</a><span>›</span>
      <span>Panel de Estadísticas</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Estadísticas Generales</h1>
      <span class="res-subtitle">Mayo 2024</span>
    </div>

    <!-- KPIs principales con tendencia -->
    <div class="stats-kpi-grid">
      <div class="stats-kpi-card stats-kpi-card--income">
        <span class="kpi-label">Ingresos Totales</span>
        <strong class="kpi-value">$ {{ kpis.totalIncome | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.incomeGrowth }}% vs Abr 2024</span>
      </div>
      <div class="stats-kpi-card stats-kpi-card--expense">
        <span class="kpi-label">Egresos Totales</span>
        <strong class="kpi-value text-danger">$ {{ kpis.totalExpense | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.expenseGrowth }}% vs Abr 2024</span>
      </div>
      <div class="stats-kpi-card stats-kpi-card--profit">
        <span class="kpi-label">Utilidad Neta</span>
        <strong class="kpi-value text-profit">$ {{ kpis.netProfit | number }}</strong>
        <span class="kpi-trend kpi-trend--up">▲ {{ kpis.profitGrowth }}% vs Abr 2024</span>
      </div>
      <div class="stats-kpi-card">
        <span class="kpi-label">Margen Neto</span>
        <strong class="kpi-value">{{ kpis.profitMargin }}%</strong>
        <span class="kpi-trend kpi-trend--up">▲ +4.2 p.p. vs Abr 2024</span>
      </div>
    </div>

    <!-- Gráficos centrales -->
    <div class="stats-charts-grid">

      <!-- Tendencia Ingresos vs Egresos -->
      <div class="report-chart-card stats-chart-wide">
        <h3 class="chart-title">Tendencia de Ingreso vs Egreso <small>(Millones $)</small></h3>
        <div class="line-chart-area">
          <svg class="line-chart-svg" viewBox="0 0 500 160" preserveAspectRatio="none">
            <line *ngFor="let y of gridLines" x1="0" [attr.y1]="y" x2="500" [attr.y2]="y" stroke="#F1EDE6" stroke-width="1"/>
            <polyline points="40,130 120,118 200,105 280,98 360,95 460,85"
              fill="none" stroke="#0E5A9C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="40,145 120,137 200,128 280,122 360,120 460,118"
              fill="none" stroke="#EF4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle *ngFor="let p of incomePoints" [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="#0E5A9C"/>
            <circle *ngFor="let p of expensePoints" [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="#EF4444"/>
          </svg>
          <div class="line-chart-labels">
            <span *ngFor="let d of chartData">{{ d.month }}</span>
          </div>
        </div>
        <div class="chart-legend-row">
          <span class="chart-legend-item"><span class="legend-line" style="background:#0E5A9C"></span>Ingresos</span>
          <span class="chart-legend-item"><span class="legend-line" style="background:#EF4444"></span>Egresos</span>
        </div>
      </div>

      <!-- Ocupación -->
      <div class="report-chart-card">
        <h3 class="chart-title">Ocupación Promedio</h3>
        <div class="occupancy-donut">
          <svg viewBox="0 0 120 120" width="130" height="130">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#F0EBE1" stroke-width="14"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="#0E5A9C" stroke-width="14"
              [attr.stroke-dasharray]="occupancyDash"
              stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            <text x="60" y="55" text-anchor="middle" font-family="Poppins,sans-serif" font-size="20" font-weight="800" fill="#0A3D6D">{{ kpis.occupancyRate }}%</text>
            <text x="60" y="72" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Ocupación</text>
          </svg>
          <div class="occupancy-scale">
            <span class="scale-label">0%</span>
            <div class="scale-bar"><div class="scale-fill" [style.width.%]="kpis.occupancyRate"></div></div>
            <span class="scale-label">100%</span>
          </div>
        </div>
      </div>

    </div>

    <div class="stats-charts-grid" style="margin-top:20px">

      <!-- Distribución por módulo -->
      <div class="report-chart-card">
        <h3 class="chart-title">Distribución de Ingresos por Módulo</h3>
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
              stroke-dasharray="57 219" stroke-dashoffset="-219" stroke-linecap="round" transform="rotate(-90 60 60)"/>
          </svg>
          <ul class="donut-legend">
            <li *ngFor="let m of byModule">
              <span class="legend-dot" [style.background]="m.color"></span>
              {{ m.name }} <strong>{{ m.pct }}%</strong>
            </li>
          </ul>
        </div>
      </div>

      <!-- Comparativo anual barras agrupadas -->
      <div class="report-chart-card">
        <h3 class="chart-title">Comparativo Anual <small>(Millones $)</small></h3>
        <div class="grouped-bar-chart">
          <div class="grouped-bar-group" *ngFor="let d of annualData">
            <div class="grouped-bars">
              <div class="grouped-bar grouped-bar--2023" [style.height.px]="d.y2023 * 0.6" title="2023: {{ d.y2023 }}M"></div>
              <div class="grouped-bar grouped-bar--2024" [style.height.px]="d.y2024 * 0.6" title="2024: {{ d.y2024 }}M"></div>
            </div>
            <span class="bar-label">{{ d.month }}</span>
          </div>
        </div>
        <div class="chart-legend-row" style="margin-top:8px">
          <span class="chart-legend-item"><span class="legend-line" style="background:#B0C4DE"></span>2023</span>
          <span class="chart-legend-item"><span class="legend-line" style="background:#0E5A9C"></span>2024</span>
        </div>
      </div>

    </div>

    <!-- Exportar -->
    <div class="report-export" style="margin-top:20px">
      <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
      <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
      <button class="btn-outline-sm" (click)="print()">🖨 Imprimir</button>
    </div>

  </div>
  `
})
export class ReportsStatsComponent implements OnInit {
  kpis: any = {};
  byModule: any[] = [];
  chartData: any[] = [];
  annualData: any[] = [];

  gridLines = [20, 60, 100, 140];
  incomePoints  = [{x:40,y:130},{x:120,y:118},{x:200,y:105},{x:280,y:98},{x:360,y:95},{x:460,y:85}];
  expensePoints = [{x:40,y:145},{x:120,y:137},{x:200,y:128},{x:280,y:122},{x:360,y:120},{x:460,y:118}];
  occupancyDash = '0 314';

  constructor(private svc: ReportsService) {}

  ngOnInit(): void {
    this.kpis       = this.svc.getKpis();
    this.byModule   = this.svc.getByModule();
    this.chartData  = this.svc.getIncomeVsExpense();
    this.annualData = this.svc.getAnnualComparison();
    // Calcular el dash del gauge de ocupación: circunferencia = 2*π*50 ≈ 314
    const circ = 2 * Math.PI * 50;
    const filled = (this.kpis.occupancyRate / 100) * circ;
    this.occupancyDash = `${Math.round(filled)} ${Math.round(circ)}`;
  }

  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
  print():       void { window.print(); }
}
