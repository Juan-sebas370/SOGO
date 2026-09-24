import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ReportsService } from '../reports.service';

type ReportType = 'Ventas' | 'Financieros' | 'Ocupación' | 'Restaurante' | 'Nómina' | 'Inventarios' | 'Contables' | 'Personalizados';

@Component({
  selector: 'app-report-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./report-generator.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/reports">Reportes</a><span>›</span>
      <span>Generador de Reportes</span>
    </div>
    <h1 class="res-title">Generador de Reportes</h1>

    <!-- Stepper -->
    <div class="wizard-steps">
      <div class="wizard-step" [class.active]="step>=1" [class.done]="step>1">
        <span class="step-num">1</span><span class="step-label">Seleccionar Reporte</span>
      </div>
      <div class="wizard-line" [class.done]="step>1"></div>
      <div class="wizard-step" [class.active]="step>=2" [class.done]="step>2">
        <span class="step-num">2</span><span class="step-label">Configurar Filtros</span>
      </div>
      <div class="wizard-line" [class.done]="step>2"></div>
      <div class="wizard-step" [class.active]="step>=3" [class.done]="step>3">
        <span class="step-num">3</span><span class="step-label">Vista Previa</span>
      </div>
      <div class="wizard-line" [class.done]="step>3"></div>
      <div class="wizard-step" [class.active]="step>=4">
        <span class="step-num">4</span><span class="step-label">Generar</span>
      </div>
    </div>

    <!-- ═══ PASO 1: Tipo de reporte ═══ -->
    <div *ngIf="step===1" class="wizard-content">
      <h2 class="wizard-section-title">Seleccionar Tipo de Reporte</h2>
      <div class="report-types-grid">
        <button class="report-type-card" *ngFor="let t of reportTypes"
          [class.selected]="selectedType===t.type"
          (click)="selectType(t.type)">
          <span class="rtype-icon">{{ t.icon }}</span>
          <strong class="rtype-name">{{ t.type }}</strong>
          <p class="rtype-desc">{{ t.desc }}</p>
        </button>
      </div>
      <div class="wizard-footer">
        <button class="btn-secondary" routerLink="/dashboard/reports">Cancelar</button>
        <button class="btn-primary" (click)="next()" [disabled]="!selectedType">
          Siguiente →
        </button>
      </div>
    </div>

    <!-- ═══ PASO 2: Filtros ═══ -->
    <div *ngIf="step===2" class="wizard-content">
      <div class="filters-grid">

        <div class="form-section">
          <h2 class="form-section-title">Configurar Filtros del Reporte</h2>
          <div class="form-field">
            <label>Tipo de Reporte</label>
            <select [(ngModel)]="selectedType" class="form-select">
              <option *ngFor="let t of reportTypes" [value]="t.type">{{ t.type }}</option>
            </select>
          </div>
          <div class="form-field">
            <label>Período</label>
            <select [(ngModel)]="filters.period" class="form-select">
              <option>Personalizado</option>
              <option>Este mes</option>
              <option>Mes anterior</option>
              <option>Este año</option>
              <option>Año anterior</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>Fecha Desde *</label>
              <input type="date" [(ngModel)]="filters.dateFrom" class="form-input">
            </div>
            <div class="form-field">
              <label>Fecha Hasta *</label>
              <input type="date" [(ngModel)]="filters.dateTo" class="form-input">
            </div>
          </div>
          <div class="form-field">
            <label>Sucursal / Centro de Costo</label>
            <select [(ngModel)]="filters.branch" class="form-select">
              <option>Todas</option>
              <option>Principal</option>
              <option>Restaurante</option>
              <option>Administración</option>
            </select>
          </div>
          <div class="form-field">
            <label>Categoría / Servicio</label>
            <select [(ngModel)]="filters.category" class="form-select">
              <option>Todas</option>
              <option>Alojamiento</option>
              <option>Restaurante</option>
              <option>Facturación</option>
              <option>Otros</option>
            </select>
          </div>
        </div>

        <!-- Resumen de filtros -->
        <div class="form-section filter-summary">
          <h2 class="form-section-title">Resumen de Filtros</h2>
          <div class="filter-summary-row"><span>Reporte</span><strong>{{ selectedType }}</strong></div>
          <div class="filter-summary-row"><span>Período</span><strong>{{ filters.period }}</strong></div>
          <div class="filter-summary-row"><span>Fechas</span><strong>{{ filters.dateFrom }} al {{ filters.dateTo }}</strong></div>
          <div class="filter-summary-row"><span>Sucursal</span><strong>{{ filters.branch }}</strong></div>
          <div class="filter-summary-row"><span>Categoría</span><strong>{{ filters.category }}</strong></div>
        </div>

      </div>
      <div class="wizard-footer">
        <button class="btn-secondary" (click)="prev()">← Anterior</button>
        <button class="btn-primary" (click)="next()">Vista Previa →</button>
      </div>
    </div>

    <!-- ═══ PASO 3: Vista Previa ═══ -->
    <div *ngIf="step===3" class="wizard-content">
      <div class="preview-header">
        <h2 class="wizard-section-title">Vista Previa del Reporte - {{ selectedType }}</h2>
        <p class="res-subtitle">Período: {{ filters.dateFrom }} - {{ filters.dateTo }}</p>
      </div>

      <!-- KPIs resumen -->
      <div class="preview-kpis">
        <div class="preview-kpi"><span class="kpi-label">Ventas Totales</span><strong>$ {{ kpis.totalIncome | number }}</strong></div>
        <div class="preview-kpi"><span class="kpi-label">Transacciones</span><strong>{{ kpis.transactions | number }}</strong></div>
        <div class="preview-kpi"><span class="kpi-label">Ticket Promedio</span><strong>$ {{ kpis.avgTicketRest | number }}</strong></div>
        <div class="preview-kpi"><span class="kpi-label">Productos Vendidos</span><strong>2.856</strong></div>
      </div>

      <!-- Gráfico de barras + donut -->
      <div class="preview-charts">
        <div class="report-chart-card">
          <h3 class="chart-title">Ventas por Día</h3>
          <div class="bar-chart bar-chart--tall">
            <div class="bar-group" *ngFor="let d of previewBars">
              <div class="bar" [style.height.px]="d.h" style="background:#0E5A9C"></div>
              <span class="bar-label">{{ d.l }}</span>
            </div>
          </div>
        </div>
        <div class="report-chart-card">
          <h3 class="chart-title">Ventas por Categoría</h3>
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
      </div>

      <!-- Top 5 -->
      <div class="detail-section">
        <h2 class="detail-section-title">Top 5 Servicios / Productos</h2>
        <table class="res-table">
          <thead><tr><th>#</th><th>Servicio / Producto</th><th class="text-center">Cantidad</th><th class="text-right">Valor Total</th><th class="text-right">% Participación</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of top5">
              <td class="text-muted">{{ r.rank }}</td>
              <td class="font-bold">{{ r.service }}</td>
              <td class="text-center">{{ r.qty | number }}</td>
              <td class="text-right">$ {{ r.value | number }}</td>
              <td class="text-right">
                <div class="progress-bar-wrap">
                  <div class="progress-bar" [style.width.%]="r.pct"></div>
                  <span>{{ r.pct }}%</span>
                </div>
              </td>
            </tr>
            <tr class="total-final-row">
              <td colspan="2"><strong>Total</strong></td>
              <td class="text-center"><strong>1.796</strong></td>
              <td class="text-right"><strong>$ {{ kpis.totalIncome | number }}</strong></td>
              <td class="text-right"><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="wizard-footer">
        <button class="btn-secondary" (click)="prev()">← Anterior</button>
        <button class="btn-primary btn-generate" (click)="next()">Generar Reporte →</button>
      </div>
    </div>

    <!-- ═══ PASO 4: Generar ═══ -->
    <div *ngIf="step===4" class="wizard-content">
      <div class="generate-card">

        <!-- Ícono éxito -->
        <div class="confirm-icon">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
        </div>

        <h2 class="confirm-title">¡Reporte generado con éxito!</h2>
        <p class="confirm-desc">
          Período: {{ filters.dateFrom }} - {{ filters.dateTo }}<br>
          Generado el: 24/05/2024 11:35 a.m.<br>
          Por: Administrador
        </p>

        <!-- Opciones de descarga -->
        <div class="download-options">
          <h3 class="download-title">Opciones de Descarga</h3>
          <div class="download-btns">
            <button class="download-btn download-btn--pdf"   (click)="download('PDF')">📄 Descargar PDF</button>
            <button class="download-btn download-btn--excel" (click)="download('Excel')">📊 Descargar Excel</button>
            <button class="download-btn download-btn--csv"   (click)="download('CSV')">📋 Descargar CSV</button>
            <button class="download-btn download-btn--print" (click)="print()">🖨 Imprimir</button>
          </div>
        </div>

        <!-- Historial -->
        <div class="history-section">
          <h3 class="download-title">Historial de Reportes Generados</h3>
          <table class="res-table">
            <thead><tr><th>Reporte</th><th>Período</th><th>Fecha de Generación</th><th>Formato</th><th>Acciones</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of history">
                <td class="font-bold">{{ r.name }}</td>
                <td>{{ r.period }}</td>
                <td>{{ r.generated }}</td>
                <td><span class="res-badge res-badge--inv-opt">{{ r.format }}</span></td>
                <td>
                  <div class="res-actions">
                    <button class="action-btn action-btn--print" title="Descargar">⬇</button>
                    <button class="action-btn action-btn--cancel" title="Eliminar">🗑</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="wizard-footer">
          <button class="btn-secondary" (click)="step=1; selectedType=''">Nuevo Reporte</button>
          <button class="btn-primary" routerLink="/dashboard/reports">Ir al Dashboard</button>
        </div>

      </div>
    </div>

  </div>
  `
})
export class ReportGeneratorComponent implements OnInit {
  step = 1;
  selectedType = '';
  kpis: any = {};
  byModule: any[] = [];
  top5: any[] = [];
  history: any[] = [];

  filters = {
    period:   'Personalizado',
    dateFrom: '2024-05-01',
    dateTo:   '2024-05-31',
    branch:   'Todas',
    category: 'Todas',
  };

  reportTypes = [
    { type:'Financieros',    icon:'💰', desc:'Estados financieros, balance y resultados.' },
    { type:'Ventas',         icon:'📈', desc:'Reportes de ventas y facturación.' },
    { type:'Ocupación',      icon:'🏨', desc:'Ocupación de habitaciones y alojamiento.' },
    { type:'Restaurante',    icon:'🍽', desc:'Ventas y consumo en restaurante y cafetería.' },
    { type:'Nómina',         icon:'👥', desc:'Reporte de nómina y liquidaciones.' },
    { type:'Inventarios',    icon:'📦', desc:'Movimientos y valorización de inventarios.' },
    { type:'Contables',      icon:'📒', desc:'Comprobantes y libros contables.' },
    { type:'Personalizados', icon:'⚙', desc:'Reportes personalizados.' },
  ];

  previewBars = [
    {l:'05/05',h:30},{l:'08/05',h:45},{l:'11/05',h:55},{l:'14/05',h:40},
    {l:'17/05',h:60},{l:'20/05',h:70},{l:'23/05',h:65},{l:'26/05',h:50},
    {l:'29/05',h:45},{l:'31/05',h:55},
  ];

  constructor(private svc: ReportsService, private router: Router) {}

  ngOnInit(): void {
    this.kpis     = this.svc.getKpis();
    this.byModule = this.svc.getByModule();
    this.top5     = this.svc.getTop5();
    this.history  = this.svc.getHistoricalReports();
  }

  selectType(t: string): void { this.selectedType = t; }
  next(): void { if (this.step < 4) this.step++; }
  prev(): void { if (this.step > 1) this.step--; }
  download(fmt: string): void { alert(`Descargando en formato ${fmt}...`); }
  print(): void { window.print(); }
}
