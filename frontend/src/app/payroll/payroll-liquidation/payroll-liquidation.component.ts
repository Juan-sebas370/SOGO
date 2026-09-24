import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { Payroll } from '../payroll.model';

type Tab = 'resumen' | 'devengos' | 'deducciones' | 'empleados';

@Component({
  selector: 'app-payroll-liquidation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./payroll-liquidation.component.css'],
  template: `
  <div class="res-page" *ngIf="payroll">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/payroll">Nómina</a><span>›</span>
      <a [routerLink]="['/dashboard/payroll', payroll.id]">{{ payroll.period }}</a><span>›</span>
      <span>Liquidación</span>
    </div>

    <div class="detail-header">
      <h1 class="res-title">Liquidación de Nómina - {{ payroll.period }}</h1>
      <span class="res-badge" [ngClass]="badgeClass(payroll.status)">{{ payroll.status }}</span>
    </div>

    <!-- Métricas rápidas -->
    <div class="liq-metrics">
      <div class="liq-metric-card">
        <span class="metric-icon">👤</span>
        <div>
          <span class="metric-label">Empleados</span>
          <strong class="metric-value">{{ payroll.employees }}</strong>
          <span class="metric-sub">Activos</span>
        </div>
      </div>
      <div class="liq-metric-card liq-metric-card--earnings">
        <div>
          <span class="metric-label">Total Devengos</span>
          <strong class="metric-value">$ {{ payroll.totalEarnings | number }}</strong>
        </div>
      </div>
      <div class="liq-metric-card liq-metric-card--deductions">
        <div>
          <span class="metric-label">Total Deducciones</span>
          <strong class="metric-value text-danger">$ {{ payroll.totalDeductions | number }}</strong>
        </div>
      </div>
      <div class="liq-metric-card liq-metric-card--net">
        <div>
          <span class="metric-label">Nómina Neta</span>
          <strong class="metric-value metric-value--net">$ {{ payroll.netPayroll | number }}</strong>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="lodge-tabs">
      <button class="lodge-tab" [class.active]="tab==='resumen'"     (click)="tab='resumen'">Resumen</button>
      <button class="lodge-tab" [class.active]="tab==='devengos'"    (click)="tab='devengos'">Devengos</button>
      <button class="lodge-tab" [class.active]="tab==='deducciones'" (click)="tab='deducciones'">Deducciones</button>
      <button class="lodge-tab" [class.active]="tab==='empleados'"   (click)="tab='empleados'">Empleados</button>
    </div>

    <!-- RESUMEN -->
    <div *ngIf="tab==='resumen'" class="liq-tab-content">
      <div class="liq-content-grid">
        <!-- Tabla conceptos -->
        <div class="detail-section">
          <h2 class="detail-section-title">Resumen por Concepto</h2>
          <table class="res-table">
            <thead><tr><th>Concepto</th><th class="text-right">Devengos</th><th class="text-right">Deducciones</th></tr></thead>
            <tbody>
              <tr *ngFor="let c of concepts">
                <td>{{ c.name }}</td>
                <td class="text-right">{{ c.earnings > 0 ? ('$ ' + (c.earnings | number)) : '—' }}</td>
                <td class="text-right text-danger">{{ c.deductions > 0 ? ('$ ' + (c.deductions | number)) : '—' }}</td>
              </tr>
              <tr class="total-final-row">
                <td><strong>Total Devengos</strong></td>
                <td class="text-right"><strong>$ {{ payroll.totalEarnings | number }}</strong></td>
                <td class="text-right text-danger"><strong>$ {{ payroll.totalDeductions | number }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Donut distribución -->
        <div class="detail-section">
          <h2 class="detail-section-title">Distribución de Devengos</h2>
          <div class="donut-wrap" style="margin-top:12px">
            <svg class="donut-svg" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="44" fill="none" stroke="#F0EBE1" stroke-width="18"/>
              <circle cx="60" cy="60" r="44" fill="none" stroke="#0E5A9C" stroke-width="18" stroke-dasharray="193 83" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 60 60)"/>
              <circle cx="60" cy="60" r="44" fill="none" stroke="#23B57B" stroke-width="18" stroke-dasharray="25 251" stroke-dashoffset="-193" stroke-linecap="round" transform="rotate(-90 60 60)"/>
              <circle cx="60" cy="60" r="44" fill="none" stroke="#F59E0B" stroke-width="18" stroke-dasharray="14 262" stroke-dashoffset="-218" stroke-linecap="round" transform="rotate(-90 60 60)"/>
              <circle cx="60" cy="60" r="44" fill="none" stroke="#8B5CF6" stroke-width="18" stroke-dasharray="11 265" stroke-dashoffset="-232" stroke-linecap="round" transform="rotate(-90 60 60)"/>
              <circle cx="60" cy="60" r="44" fill="none" stroke="#EF4444" stroke-width="18" stroke-dasharray="8 268" stroke-dashoffset="-243" stroke-linecap="round" transform="rotate(-90 60 60)"/>
              <text x="60" y="66" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" fill="#7A7A7A">Devengos</text>
            </svg>
            <ul class="donut-legend">
              <li><span class="legend-dot" style="background:#0E5A9C"></span>Salario Básico <strong>70%</strong></li>
              <li><span class="legend-dot" style="background:#23B57B"></span>Horas Extras <strong>9%</strong></li>
              <li><span class="legend-dot" style="background:#F59E0B"></span>Prestaciones <strong>10%</strong></li>
              <li><span class="legend-dot" style="background:#8B5CF6"></span>Bonificaciones <strong>8%</strong></li>
              <li><span class="legend-dot" style="background:#EF4444"></span>Otros <strong>3%</strong></li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- EMPLEADOS -->
    <div *ngIf="tab==='empleados'" class="liq-tab-content">
      <div class="res-table-wrap">
        <table class="res-table">
          <thead><tr><th>Empleado</th><th>Cargo</th><th class="text-right">Salario Básico</th><th class="text-right">Devengos</th><th class="text-right">Deducciones</th><th class="text-right">Neto a Pagar</th></tr></thead>
          <tbody>
            <tr *ngFor="let item of preview?.items ?? []">
              <td class="font-bold">{{ item.name }}</td>
              <td>{{ item.position }}</td>
              <td class="text-right">$ {{ item.baseSalary | number }}</td>
              <td class="text-right">$ {{ item.earnings | number }}</td>
              <td class="text-right text-danger">$ {{ item.deductions | number }}</td>
              <td class="text-right inv-total">$ {{ item.net | number }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- DEVENGOS -->
    <div *ngIf="tab==='devengos'" class="liq-tab-content">
      <div class="detail-section">
        <h2 class="detail-section-title">Conceptos Devengados</h2>
        <table class="res-table">
          <thead><tr><th>Concepto</th><th class="text-right">Valor</th></tr></thead>
          <tbody>
            <tr *ngFor="let c of concepts | slice:0:6">
              <td>{{ c.name }}</td>
              <td class="text-right">{{ c.earnings > 0 ? ('$ ' + (c.earnings | number)) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- DEDUCCIONES -->
    <div *ngIf="tab==='deducciones'" class="liq-tab-content">
      <div class="detail-section">
        <h2 class="detail-section-title">Conceptos Deducidos</h2>
        <table class="res-table">
          <thead><tr><th>Concepto</th><th class="text-right">Valor</th></tr></thead>
          <tbody>
            <tr *ngFor="let c of concepts | slice:6">
              <td>{{ c.name }}</td>
              <td class="text-right text-danger">$ {{ c.deductions | number }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Acciones -->
    <div class="liq-actions">
      <button class="btn-outline" (click)="validate()">✅ Validar Nómina</button>
      <button class="btn-outline" (click)="goPreview()">👁 Generar Previsualización</button>
      <button class="btn-primary" (click)="finalize()">✔ Finalizar Nómina</button>
    </div>

  </div>
  `
})
export class PayrollLiquidationComponent implements OnInit {
  payroll?: Payroll;
  preview?: Payroll;
  concepts: any[] = [];
  tab: Tab = 'resumen';

  constructor(private svc: PayrollService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.payroll = this.svc.getById(id);
    if (this.payroll) {
      this.preview  = this.svc.buildPreview(id);
      this.concepts = this.svc.getConceptBreakdown(id);
    }
  }

  badgeClass(s: string): string {
    return { 'En proceso':'res-badge--pay-process','Preparando':'res-badge--pay-prep','En validación':'res-badge--pay-valid','Completada':'res-badge--pay-done' }[s] ?? '';
  }

  validate():   void { this.svc.updateStatus(this.payroll!.id, 'En validación'); this.payroll = this.svc.getById(this.payroll!.id); }
  goPreview():  void { this.router.navigate(['/dashboard/payroll', this.payroll!.id, 'preview']); }
  finalize():   void { this.router.navigate(['/dashboard/payroll', this.payroll!.id, 'preview']); }
}
