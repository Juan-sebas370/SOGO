import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { Payroll } from '../payroll.model';

@Component({
  selector: 'app-payroll-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./payroll-preview.component.css'],
  template: `
  <div class="res-page" *ngIf="payroll">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/payroll">Nómina</a><span>›</span>
      <a [routerLink]="['/dashboard/payroll', payroll.id]">{{ payroll.period }}</a><span>›</span>
      <span>Previsualización</span>
    </div>

    <h1 class="res-title">Previsualización de Nómina - {{ payroll.period }}</h1>

    <!-- Resumen rápido -->
    <div class="preview-summary">
      <span>Empleados: <strong>{{ payroll.employees }}</strong></span>
      <span>Devengos: <strong>$ {{ payroll.totalEarnings | number }}</strong></span>
      <span>Deducciones: <strong class="text-danger">$ {{ payroll.totalDeductions | number }}</strong></span>
      <span>Neta: <strong class="text-net">$ {{ payroll.netPayroll | number }}</strong></span>
    </div>

    <!-- Toolbar buscar -->
    <div class="res-toolbar" style="margin:16px 0">
      <div class="res-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" [(ngModel)]="search" (ngModelChange)="filter()"
          placeholder="Buscar empleado..." class="res-search">
      </div>
      <button class="btn-filter">🔽 Filtros</button>
    </div>

    <!-- Tabla empleados -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Cargo</th>
            <th class="text-right">Salario Básico</th>
            <th class="text-right">Devengos</th>
            <th class="text-right">Deducciones</th>
            <th class="text-right">Neto a Pagar</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of filteredItems">
            <td class="font-bold">{{ item.name }}</td>
            <td>{{ item.position }}</td>
            <td class="text-right">$ {{ item.baseSalary | number }}</td>
            <td class="text-right">$ {{ item.earnings | number }}</td>
            <td class="text-right text-danger">$ {{ item.deductions | number }}</td>
            <td class="text-right inv-total">$ {{ item.net | number }}</td>
          </tr>
          <!-- Totales -->
          <tr class="total-final-row">
            <td colspan="2"><strong>Totales</strong></td>
            <td class="text-right"><strong>$ {{ totalBase | number }}</strong></td>
            <td class="text-right"><strong>$ {{ payroll.totalEarnings | number }}</strong></td>
            <td class="text-right text-danger"><strong>$ {{ payroll.totalDeductions | number }}</strong></td>
            <td class="text-right inv-total"><strong>$ {{ payroll.netPayroll | number }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="form-footer">
      <button class="btn-outline" (click)="goBack()">✏ Volver a Editar</button>
      <button class="btn-outline" (click)="exportExcel()">📥 Exportar Excel</button>
      <button class="btn-primary btn-approve" (click)="approve()">✔ Aprobar y Finalizar</button>
    </div>

  </div>
  `
})
export class PayrollPreviewComponent implements OnInit {
  payroll?: Payroll;
  preview?: Payroll;
  filteredItems: any[] = [];
  search = '';
  totalBase = 0;

  constructor(private svc: PayrollService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.payroll = this.svc.getById(id);
    this.preview = this.svc.buildPreview(id);
    if (this.preview) {
      this.filteredItems = this.preview.items;
      this.totalBase = this.preview.items.reduce((a,i) => a + i.baseSalary, 0);
    }
  }

  filter(): void {
    const q = this.search.toLowerCase();
    this.filteredItems = (this.preview?.items ?? []).filter(i =>
      !q || i.name.toLowerCase().includes(q) || i.position.toLowerCase().includes(q)
    );
  }

  goBack():      void { this.router.navigate(['/dashboard/payroll', this.payroll!.id, 'liquidation']); }
  exportExcel(): void { alert('Exportar Excel (próximamente)'); }

  approve(): void {
    this.svc.updateStatus(this.payroll!.id, 'Completada', new Date().toISOString());
    this.router.navigate(['/dashboard/payroll', this.payroll!.id, 'confirm']);
  }
}
