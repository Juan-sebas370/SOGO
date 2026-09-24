import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';

@Component({
  selector: 'app-income-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./income-statement.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/accounting">Contabilidad</a><span>›</span>
      <span>Estados Financieros</span>
    </div>

    <div class="res-header">
      <div>
        <h1 class="res-title">Estado de Resultados</h1>
        <p class="res-subtitle">Período: {{ data.period }}</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline-sm" (click)="changePeriod()">🔄 Cambiar Período</button>
        <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
        <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
      </div>
    </div>

    <div class="income-grid">

      <!-- IZQUIERDA: Tabla del estado -->
      <div class="form-section">

        <!-- Ingresos Operacionales -->
        <h2 class="income-section-title income-section-title--income">Ingresos Operacionales</h2>
        <div class="income-row"><span>Ingresos por Alojamiento</span><span>$ {{ data.operationalIncome.alojamiento | number }}</span></div>
        <div class="income-row"><span>Ingresos Restaurante y Cafetería</span><span>$ {{ data.operationalIncome.restaurante | number }}</span></div>
        <div class="income-row"><span>Otros Ingresos</span><span>$ {{ data.operationalIncome.otros | number }}</span></div>
        <div class="income-row income-row--subtotal"><span><strong>Total Ingresos</strong></span><span><strong>$ {{ data.operationalIncome.total | number }}</strong></span></div>

        <!-- Costos y Gastos -->
        <h2 class="income-section-title income-section-title--cost" style="margin-top:20px">Costos de Operación</h2>
        <div class="income-row"><span>Costo de Alimentos y Bebidas</span><span class="text-danger">$ {{ data.operationalCosts.alimentosBebidas | number }}</span></div>
        <div class="income-row"><span>Gastos de Personal</span><span class="text-danger">$ {{ data.operationalCosts.personal | number }}</span></div>
        <div class="income-row"><span>Gastos Generales</span><span class="text-danger">$ {{ data.operationalCosts.generales | number }}</span></div>
        <div class="income-row income-row--subtotal"><span><strong>Total Costos y Gastos</strong></span><span><strong class="text-danger">$ {{ data.operationalCosts.total | number }}</strong></span></div>

        <!-- Utilidad -->
        <div class="income-row income-row--profit">
          <span><strong>Utilidad del Período</strong></span>
          <span><strong class="text-profit">$ {{ data.netProfit | number }}</strong></span>
        </div>
      </div>

      <!-- DERECHA: Gráfico de barras -->
      <div class="form-section">
        <h2 class="form-section-title">Gráfico de Resultados</h2>
        <div class="income-chart">
          <div class="income-bar-group">
            <div class="income-bar income-bar--income" [style.height.px]="barH(data.operationalIncome.total)"></div>
            <span class="bar-value">{{ data.operationalIncome.total / 1000000 | number:'1.0-1' }}M</span>
            <span class="bar-label">Ingresos</span>
          </div>
          <div class="income-bar-group">
            <div class="income-bar income-bar--cost" [style.height.px]="barH(data.operationalCosts.total)"></div>
            <span class="bar-value">{{ data.operationalCosts.total / 1000000 | number:'1.0-1' }}M</span>
            <span class="bar-label">Costos y Gastos</span>
          </div>
          <div class="income-bar-group">
            <div class="income-bar income-bar--profit" [style.height.px]="barH(data.netProfit)"></div>
            <span class="bar-value">{{ data.netProfit / 1000000 | number:'1.0-1' }}M</span>
            <span class="bar-label">Utilidad</span>
          </div>
        </div>
      </div>

    </div>

  </div>
  `
})
export class IncomeStatementComponent implements OnInit {
  data: any = {};
  maxVal = 0;

  constructor(private svc: AccountingService) {}

  ngOnInit(): void {
    this.data   = this.svc.getIncomeStatement();
    this.maxVal = this.data.operationalIncome.total;
  }

  barH(v: number): number { return Math.round((v / this.maxVal) * 200); }
  changePeriod():  void { alert('Cambiar período (próximamente)'); }
  exportExcel():   void { alert('Exportar Excel (próximamente)'); }
  exportPdf():     void { window.print(); }
}
