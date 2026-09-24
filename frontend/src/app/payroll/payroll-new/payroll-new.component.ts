import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';

@Component({
  selector: 'app-payroll-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./payroll-new.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/payroll">Nómina</a><span>›</span>
      <span>Nueva Nómina</span>
    </div>
    <h1 class="res-title">Nueva Nómina</h1>

    <div class="payroll-new-grid">

      <!-- COLUMNA 1: Información del Período -->
      <div class="form-section">
        <h2 class="form-section-title">Información del Período</h2>

        <div class="form-field">
          <label>Período *</label>
          <input type="text" [(ngModel)]="f.period" placeholder="Junio 2024" class="form-input">
        </div>

        <div class="form-field">
          <label>Fecha Inicial *</label>
          <input type="date" [(ngModel)]="f.startDate" class="form-input">
        </div>

        <div class="form-field">
          <label>Fecha Final *</label>
          <input type="date" [(ngModel)]="f.endDate" (ngModelChange)="calcDays()" class="form-input">
        </div>

        <div class="form-field">
          <label>Días Laborados</label>
          <input type="number" [(ngModel)]="f.workedDays" min="1" max="31" class="form-input">
        </div>

        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" placeholder="Nómina correspondiente al mes de..." class="form-textarea"></textarea>
        </div>
      </div>

      <!-- COLUMNA 2: Conceptos a Incluir -->
      <div class="form-section">
        <h2 class="form-section-title">Conceptos a Incluir</h2>
        <div class="concepts-list">
          <label class="concept-check" *ngFor="let c of concepts">
            <input type="checkbox" [checked]="isChecked(c)" (change)="toggleConcept(c)">
            <span class="concept-name">{{ c }}</span>
          </label>
        </div>
      </div>

      <!-- COLUMNA 3: Resumen Estimado -->
      <div class="form-section summary-section">
        <h2 class="form-section-title">Resumen Estimado</h2>

        <div class="summary-row">
          <span class="summary-label">Empleados</span>
          <span class="summary-value">{{ activeCount }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Total Devengos</span>
          <span class="summary-value">$ {{ estimatedEarnings | number }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Total Deducciones</span>
          <span class="summary-value text-danger">$ {{ estimatedDeductions | number }}</span>
        </div>

        <div class="summary-net">
          <span class="summary-net-label">Nómina Neta Estimada</span>
          <strong class="summary-net-value">$ {{ estimatedNet | number }}</strong>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/payroll">Cancelar</button>
      <button class="btn-primary" (click)="save()">Crear Nómina</button>
    </div>

  </div>
  `
})
export class PayrollNewComponent implements OnInit {

  concepts: string[] = [];
  selectedConcepts: string[] = ['Salario Básico', 'Horas Extras', 'Recargos', 'Bonificaciones', 'Auxilio de Transporte', 'Auxilio de Alimentación'];

  f = {
    period: '', startDate: new Date().toISOString().slice(0,10),
    endDate: '', workedDays: 30, observations: ''
  };

  activeCount = 0;
  estimatedEarnings = 0; estimatedDeductions = 0; estimatedNet = 0;
  errorMsg = '';

  constructor(private svc: PayrollService, private router: Router) {}

  ngOnInit(): void {
    this.concepts = this.svc.conceptsList;
    this.activeCount = this.svc.getActiveEmployees().length;
    this.recalcEstimate();
  }

  isChecked(c: string): boolean { return this.selectedConcepts.includes(c); }

  toggleConcept(c: string): void {
    if (this.isChecked(c)) { this.selectedConcepts = this.selectedConcepts.filter(x => x !== c); }
    else { this.selectedConcepts.push(c); }
    this.recalcEstimate();
  }

  calcDays(): void {
    if (this.f.startDate && this.f.endDate) {
      const d = Math.ceil((new Date(this.f.endDate).getTime() - new Date(this.f.startDate).getTime()) / 86400000);
      this.f.workedDays = d > 0 ? d : 30;
    }
  }

  recalcEstimate(): void {
    const items = this.svc['buildItems'] ? (this.svc as any).buildItems(this.selectedConcepts) : [];
    if (items.length) {
      this.estimatedEarnings   = items.reduce((a: number, i: any) => a + i.earnings, 0);
      this.estimatedDeductions = items.reduce((a: number, i: any) => a + i.deductions, 0);
    } else {
      const base = this.svc.getActiveEmployees().reduce((a,e) => a + e.baseSalary, 0);
      this.estimatedEarnings   = Math.round(base * 1.25);
      this.estimatedDeductions = Math.round(base * 0.08);
    }
    this.estimatedNet = this.estimatedEarnings - this.estimatedDeductions;
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.period || !this.f.startDate || !this.f.endDate) { this.errorMsg = 'Completa todos los campos obligatorios.'; return; }
    if (this.selectedConcepts.length === 0) { this.errorMsg = 'Selecciona al menos un concepto.'; return; }
    const created = this.svc.create({
      period: this.f.period, startDate: this.f.startDate, endDate: this.f.endDate,
      workedDays: this.f.workedDays, employees: this.activeCount,
      concepts: this.selectedConcepts, status: 'En proceso', observations: this.f.observations
    });
    this.router.navigate(['/dashboard/payroll', created.id, 'liquidation']);
  }
}
