import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { Payroll } from '../payroll.model';

@Component({
  selector: 'app-payroll-confirm',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./payroll-confirm.component.css'],
  template: `
  <div class="res-page confirm-page" *ngIf="payroll">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/payroll">Nómina</a><span>›</span>
      <span>Completada</span>
    </div>

    <div class="confirm-card">

      <!-- Ícono -->
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
      </div>

      <h2 class="confirm-title">¡Nómina generada con éxito!</h2>
      <p class="confirm-desc">La nómina de {{ payroll.period }} ha sido generada y está lista para pago.</p>

      <!-- Resumen -->
      <div class="confirm-summary">
        <div class="summary-row"><span class="summary-label">Período</span>           <span class="summary-value">{{ payroll.period }}</span></div>
        <div class="summary-row"><span class="summary-label">Fecha de Generación</span><span class="summary-value">{{ payroll.generatedAt | date:'dd/MM/yyyy HH:mm' }}</span></div>
        <div class="summary-row"><span class="summary-label">Empleados</span>          <span class="summary-value">{{ payroll.employees }}</span></div>
        <div class="summary-row"><span class="summary-label">Total Devengos</span>     <span class="summary-value">$ {{ payroll.totalEarnings | number }}</span></div>
        <div class="summary-row"><span class="summary-label">Total Deducciones</span>  <span class="summary-value text-danger">$ {{ payroll.totalDeductions | number }}</span></div>
        <div class="summary-row summary-row--net">
          <span class="summary-label">Nómina Neta</span>
          <span class="summary-value summary-value--net">$ {{ payroll.netPayroll | number }}</span>
        </div>
      </div>

      <!-- Acciones -->
      <div class="confirm-actions">
        <button class="btn-outline" (click)="goDetail()">👁 Ver Detalle</button>
        <button class="btn-outline" (click)="planillaPila()">📋 Planilla PILA</button>
        <button class="btn-outline" (click)="comprobante()">🖨 Comprobante de Pago</button>
        <button class="btn-primary" routerLink="/dashboard/payroll">Ir al Listado</button>
      </div>

    </div>

  </div>
  `
})
export class PayrollConfirmComponent implements OnInit {
  payroll?: Payroll;

  constructor(private svc: PayrollService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.payroll = this.svc.getById(id);
  }

  goDetail():     void { this.router.navigate(['/dashboard/payroll', this.payroll!.id]); }
  planillaPila(): void { alert('Planilla PILA (próximamente)'); }
  comprobante():  void { window.print(); }
}
