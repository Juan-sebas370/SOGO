import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';

@Component({
  selector: 'app-accounting-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./accounting-reports.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/accounting">Contabilidad</a><span>›</span>
      <span>Reportes</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Reportes Contables</h1>
      <button class="btn-new" (click)="generate()">📊 Generar Reporte</button>
    </div>

    <!-- Filtros -->
    <div class="report-filters">
      <div class="form-field">
        <label>Tipo de Reporte</label>
        <select [(ngModel)]="reportType" class="form-select">
          <option>Balance General</option>
          <option>Estado de Resultados</option>
          <option>Flujo de Caja</option>
          <option>Libro Mayor</option>
        </select>
      </div>
      <div class="form-field"><label>Fecha Desde</label><input type="date" [(ngModel)]="dateFrom" class="form-input"></div>
      <div class="form-field"><label>Fecha Hasta</label><input type="date" [(ngModel)]="dateTo" class="form-input"></div>
    </div>

    <!-- Balance General -->
    <div class="balance-grid">

      <!-- ACTIVOS -->
      <div class="balance-section">
        <h2 class="balance-title balance-title--asset">Activo</h2>
        <div class="balance-row"><span>Activo Corriente</span><span class="balance-val">$ {{ bs.assets.current | number }}</span></div>
        <div class="balance-row"><span>Activo No Corriente</span><span class="balance-val">$ {{ bs.assets.nonCurrent | number }}</span></div>
        <div class="balance-row balance-row--total"><span><strong>Total Activos</strong></span><span><strong>$ {{ bs.assets.total | number }}</strong></span></div>

        <h2 class="balance-title balance-title--liability" style="margin-top:20px">Pasivo</h2>
        <div class="balance-row"><span>Pasivo Corriente</span><span class="balance-val">$ {{ bs.liabilities.current | number }}</span></div>
        <div class="balance-row"><span>Pasivo No Corriente</span><span class="balance-val">$ {{ bs.liabilities.nonCurrent | number }}</span></div>
        <div class="balance-row balance-row--total"><span><strong>Total Pasivo</strong></span><span><strong>$ {{ bs.liabilities.total | number }}</strong></span></div>

        <div class="balance-row balance-row--equity" style="margin-top:16px">
          <span><strong>Patrimonio</strong></span>
          <span><strong class="text-profit">$ {{ bs.equity | number }}</strong></span>
        </div>
      </div>

      <!-- ESTRUCTURA + DONUT -->
      <div class="balance-section">
        <h2 class="balance-title">Estructura Financiera</h2>
        <div class="donut-wrap" style="margin-top:16px">
          <svg class="donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
            <!-- Activo Corriente 44.7% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#0E5A9C" stroke-width="18"
              stroke-dasharray="123 153" stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <!-- Activo No Corriente 55.3% -->
            <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18"
              stroke-dasharray="152 124" stroke-dashoffset="-123" stroke-linecap="round"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-family="Poppins,sans-serif" font-size="10" font-weight="700" fill="#2B2B2B">Activos</text>
            <text x="60" y="70" text-anchor="middle" font-family="Poppins,sans-serif" font-size="8" fill="#7A7A7A">{{ bs.assets.total/1000000 | number:'1.0-0' }}M</text>
          </svg>
          <ul class="donut-legend">
            <li><span class="legend-dot" style="background:#0E5A9C"></span>Activo Corriente <strong>{{ pct(bs.assets.current, bs.assets.total) }}%</strong></li>
            <li><span class="legend-dot" style="background:#23B57B"></span>Activo No Corriente <strong>{{ pct(bs.assets.nonCurrent, bs.assets.total) }}%</strong></li>
          </ul>
        </div>

        <!-- Indicadores -->
        <h2 class="balance-title" style="margin-top:24px">Indicadores</h2>
        <div class="indicator-row">
          <span class="indicator-label">Razón Corriente</span>
          <span class="indicator-value">{{ bs.indicators.currentRatio }}</span>
        </div>
        <div class="indicator-row">
          <span class="indicator-label">Nivel de Endeudamiento</span>
          <span class="indicator-value" [class.indicator-warning]="bs.indicators.debtToEquity > 50">{{ bs.indicators.debtToEquity }}%</span>
        </div>
      </div>

    </div>

    <!-- Exportar -->
    <div class="report-export">
      <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
      <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
      <button class="btn-outline-sm" (click)="print()">🖨 Imprimir</button>
    </div>

  </div>
  `
})
export class AccountingReportsComponent implements OnInit {
  reportType = 'Balance General';
  dateFrom   = '2024-05-01';
  dateTo     = '2024-05-31';
  bs: any    = { assets:{}, liabilities:{}, equity:0, indicators:{} };

  constructor(private svc: AccountingService) {}

  ngOnInit(): void { this.generate(); }

  generate():  void { this.bs = this.svc.getBalanceSheet(); }
  pct(v:number, total:number): string { return total > 0 ? ((v/total)*100).toFixed(1) : '0'; }
  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
  print():       void { window.print(); }
}
