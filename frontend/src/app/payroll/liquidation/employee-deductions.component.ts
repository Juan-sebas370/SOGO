import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import {
  Employee, PayLine, PayrollRun, Novelty, EMPTY_NOVELTY, DeductionType, DEDUCTION_TYPES, StandingDeduction,
  legalDeductions, periodLabel, periodEnd, rulesFor, initials,
} from '../payroll.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDateTime } from '../../shared/date-utils';
import { dmy, stampOf } from '../payroll-format';

interface DeductionDraft { id?: string; type: DeductionType; description: string; amount: number | null; installments: number | null; }

@Component({
  selector: 'app-employee-deductions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <ng-container *ngIf="run && emp && line; else missing">
  <nav class="kit-crumb" aria-label="Ruta">
    <a routerLink="/dashboard/payroll">Nómina</a><span>/</span>
    <a routerLink="/dashboard/payroll/liquidation" [queryParams]="{ nomina: run.id }">Liquidar nómina · {{ label }}</a><span>/</span><span>{{ line.name }}</span>
  </nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Deducciones del empleado</h1>
      <p class="kit-sub">Calculadas sobre el salario y los conceptos liquidados. Se recalculan si cambia cualquier concepto.</p>
    </div>
  </header>

  <section class="kit-card pay-person" style="margin-bottom: 18px">
    <span class="pay-avatar pay-avatar--lg">{{ ini(emp) }}</span>
    <div style="flex:1"><h2>{{ line.name }}</h2>
      <p>{{ line.code }} · {{ line.position }} · salario {{ money(line.baseSalary) }} · EPS {{ emp.eps || 'sin registrar' }} · Pensión {{ emp.pensionFund || 'sin registrar' }}</p></div>
    <span class="rsv-badge" [ngClass]="editable ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ editable ? 'Recalculado ' + recalcAt : run.status === 'Borrador' ? 'Solo consulta' : 'Nómina ' + run.status.toLowerCase() }}</span>
  </section>

  <div class="kit-layout">
    <div class="kit-stack">
      <section class="kit-card" *ngIf="editable">
        <h2 class="kit-card-title">Novedades del período</h2>
        <div class="pay-grid">
          <label class="kit-field">Horas extra diurnas<input class="rsv-input" type="number" min="0" [(ngModel)]="nov.extraDay" (ngModelChange)="saveNovelty()"></label>
          <label class="kit-field">Horas extra nocturnas<input class="rsv-input" type="number" min="0" [(ngModel)]="nov.extraNight" (ngModelChange)="saveNovelty()"></label>
          <label class="kit-field">Horas con recargo nocturno<input class="rsv-input" type="number" min="0" [(ngModel)]="nov.nightHours" (ngModelChange)="saveNovelty()"></label>
          <label class="kit-field">Horas dominicales / festivas<input class="rsv-input" type="number" min="0" [(ngModel)]="nov.sundayHours" (ngModelChange)="saveNovelty()"></label>
          <label class="kit-field">Bonificación salarial<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="nov.bonusSalary" (ngModelChange)="saveNovelty()"></label>
          <label class="kit-field">Bonificación no salarial<input class="rsv-input" type="number" min="0" step="1000" [(ngModel)]="nov.bonusNonSalary" (ngModelChange)="saveNovelty()"></label>
        </div>
        <p class="kit-error" *ngIf="novError">{{ novError }}</p>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">1. Base de cotización (IBC)</h2>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>Concepto devengado</th><th class="r">Cantidad</th><th class="r">Valor</th><th>¿Base de aportes?</th></tr></thead>
            <tbody>
              <tr *ngFor="let e of line.earnings">
                <td><strong>{{ e.concept }}</strong></td><td class="r">{{ e.detail }}</td><td class="r">{{ money(e.value) }}</td>
                <td><span class="rsv-badge" [ngClass]="e.ibc ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ e.ibc ? 'Sí' : 'No' }}</span></td>
              </tr>
              <tr class="pay-ibc"><td>IBC (base de cotización)</td><td></td><td class="r">{{ money(line.ibc) }}</td><td></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="kit-card">
        <div class="pay-card-head">
          <h2 class="kit-card-title">2. Deducciones aplicadas</h2>
          <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="editable && !draft" (click)="startDeduction()">+ Agregar deducción autorizada</button>
        </div>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>Concepto</th><th>Tipo</th><th>Cálculo</th><th class="r">Valor</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let d of line.deductions">
                <td><strong>{{ d.concept }}</strong></td>
                <td><span class="rsv-badge" [ngClass]="d.kind === 'Legal' ? 'rsv-badge--info' : 'rsv-badge--partial'">{{ d.kind }}</span></td>
                <td class="kit-muted">{{ d.calc }}</td>
                <td class="r"><strong>{{ money(d.value) }}</strong></td>
                <td class="r">
                  <span class="rsv-badge rsv-badge--muted" *ngIf="d.kind === 'Legal' && d.value">Automática</span>
                  <button type="button" class="rsv-btn rsv-btn--outline pay-row-btn" *ngIf="d.deductionId && editable && !draft" (click)="editDeduction(d.deductionId)">Editar</button>
                </td>
              </tr>
              <tr class="pay-ded-total"><td>Total deducciones</td><td></td><td></td><td class="r">{{ money(line.totalDeductions) }}</td><td></td></tr>
            </tbody>
          </table>
        </div>

        <form class="pay-ded-form" *ngIf="draft as d" (ngSubmit)="saveDeduction()">
          <h3>{{ d.id ? 'Editar deducción' : 'Nueva deducción autorizada' }}</h3>
          <div class="pay-grid">
            <label class="kit-field">Tipo<select class="rsv-input" name="type" [(ngModel)]="d.type"><option *ngFor="let t of types">{{ t }}</option></select></label>
            <label class="kit-field">Descripción<input class="rsv-input" name="desc" [(ngModel)]="d.description" placeholder="Ej.: préstamo para estudio"></label>
            <label class="kit-field">Valor por período *<input class="rsv-input" name="amount" type="number" min="0" step="1000" [(ngModel)]="d.amount" [class.invalid]="dedError"></label>
            <label class="kit-field">N.º de cuotas<input class="rsv-input" name="inst" type="number" min="1" [(ngModel)]="d.installments" placeholder="Vacío = indefinida"></label>
          </div>
          <p class="kit-error" *ngIf="dedError">{{ dedError }}</p>
          <div class="kit-actions">
            <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="d.id" (click)="removeDeduction(d.id)">Retirar deducción</button>
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="draft = undefined">Cancelar</button>
            <button type="submit" class="rsv-btn rsv-btn--primary">Guardar</button>
          </div>
        </form>
        <p class="pay-types">Tipos disponibles: <span *ngFor="let t of types">{{ t }}</span></p>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card">
        <h2 class="kit-card-title">Resultado</h2>
        <div class="kit-sum"><span>Total devengado</span><strong>{{ money(line.totalEarnings) }}</strong></div>
        <div class="kit-sum"><span>Deducciones legales</span><strong class="pay-red">− {{ money(legal(line)) }}</strong></div>
        <div class="kit-sum"><span>Otras deducciones</span><strong class="pay-red">− {{ money(line.totalDeductions - legal(line)) }}</strong></div>
        <div class="kit-sum kit-sum--total"><strong>Neto a pagar</strong><strong>{{ money(line.net) }}</strong></div>
      </section>
      <section class="kit-card pay-footnote">
        <h3 class="pay-rules-title">Reglas aplicadas</h3>
        <p>• Salud 4% y pensión 4% sobre el IBC.</p>
        <p>• Fondo de solidaridad pensional 1% solo si el IBC ≥ 4 SMMLV ({{ money(rules.smmlv * 4) }}).</p>
        <p>• El auxilio de transporte y las bonificaciones no salariales no hacen parte del IBC.</p>
        <p>• Recargo dominical {{ sundayPct }}% desde el {{ dmy(rules.sundayFrom) }} · hora ordinaria {{ money(line.hourValue) }} ({{ line.weeklyHours }} h/semana).</p>
      </section>
      <p class="kit-banner kit-banner--info pay-footnote">Último cálculo: {{ user }} · {{ stamp(recalcFull) }} · registrado en auditoría.</p>
      <a class="rsv-btn rsv-btn--primary" routerLink="/dashboard/payroll/liquidation" [queryParams]="{ nomina: run.id }" style="height:46px">Volver a la liquidación</a>
    </aside>
  </div>
  </ng-container>
  <ng-template #missing><p class="kit-card kit-empty">El empleado no hace parte de esta nómina. <a routerLink="/dashboard/payroll/liquidation">Volver</a></p></ng-template>
  `,
  styles: [`
    .pay-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
    .pay-ibc td { background: #EEF5FD; font-weight: 700; color: #0A2540; }
    .pay-ded-total td { background: #FEF2F2; font-weight: 700; color: #B91C1C; }
    .pay-ded-form { margin-top: 14px; padding: 14px; border: 1px solid #D5DEEA; border-radius: 12px; background: #FAFBFD; }
    .pay-ded-form h3 { margin: 0 0 10px; font-size: 13.5px; color: #0A2540; }
    .pay-types { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 12px 0 0; font-size: 11.5px; color: #6B7280; }
    .pay-types span { padding: 3px 8px; border-radius: 6px; background: #EEF1F5; color: #374151; font-weight: 600; }
    .pay-rules-title { margin: 0 0 6px; font-size: 12.5px; color: #0A2540; }
    .kit-aside .pay-footnote p { margin: 4px 0; }
  `],
})
export class EmployeeDeductionsComponent {
  readonly types = DEDUCTION_TYPES;
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly stamp = stampOf;
  readonly ini = initials;
  readonly legal = legalDeductions;
  get user(): string { return this.svc.actor; }

  run?: PayrollRun;
  emp?: Employee;
  line?: PayLine;
  nov: Novelty = { ...EMPTY_NOVELTY };
  novError = '';
  draft?: DeductionDraft;
  dedError = '';
  recalcFull = isoDateTime();

  constructor(private svc: PayrollService, route: ActivatedRoute) {
    const runId = route.snapshot.paramMap.get('runId')!;
    const empId = route.snapshot.paramMap.get('employeeId')!;
    const refresh = () => {
      this.run = svc.getRun(runId);
      this.emp = svc.getEmployee(empId);
      this.line = this.run ? svc.effectiveLines(this.run).find(l => l.employeeId === empId) : undefined;
      this.recalcFull = isoDateTime();
    };
    svc.getRuns().subscribe(refresh);
    svc.getEmployees().subscribe(refresh);
    this.nov = { ...EMPTY_NOVELTY, ...(this.run?.novelties[empId] ?? {}) };
  }

  get editable(): boolean { return this.run?.status === 'Borrador' && this.svc.canEdit; }
  get label(): string { return periodLabel(this.run!.period); }
  get rules() { return rulesFor(periodEnd(this.run!.period)); }
  get sundayPct(): number { return Math.round(this.rules.sundaySurcharge * 100); }
  get recalcAt(): string { return this.recalcFull.slice(11, 16); }

  saveNovelty(): void {
    const values = Object.values(this.nov).map(v => +v || 0);
    if (values.some(v => v < 0 || !Number.isFinite(v))) { this.novError = 'Los valores no pueden ser negativos.'; return; }
    // Límite legal de trabajo suplementario: 2 h diarias / 12 semanales ≈ 48 h al mes
    if ((+this.nov.extraDay || 0) + (+this.nov.extraNight || 0) > 48) { this.novError = 'Las horas extra no pueden superar 48 h en el mes (2 h diarias, 12 semanales).'; return; }
    this.novError = '';
    const clean = Object.fromEntries(Object.entries(this.nov).map(([k, v]) => [k, Math.max(0, +v || 0)])) as unknown as Novelty;
    this.svc.setNovelty(this.run!.id, this.emp!.id, clean);
  }

  startDeduction(): void {
    this.dedError = '';
    this.draft = { type: 'Préstamo empresa', description: '', amount: null, installments: 1 };
  }

  editDeduction(id: string): void {
    const d = this.emp!.deductions.find(x => x.id === id);
    if (!d) return;
    this.dedError = '';
    this.draft = { id: d.id, type: d.type, description: d.description, amount: d.amount, installments: d.installments };
  }

  saveDeduction(): void {
    const d = this.draft!;
    const amount = +(d.amount ?? 0);
    if (amount <= 0) { this.dedError = 'El valor debe ser mayor que 0.'; return; }
    // Salvo embargos, los descuentos no pueden dejar al empleado con menos del 50 % de lo devengado (art. 149 CST)
    const others = this.line!.totalDeductions - (d.id ? this.line!.deductions.find(x => x.deductionId === d.id)?.value ?? 0 : 0);
    if (d.type !== 'Embargo judicial' && others + amount > this.line!.totalEarnings / 2) {
      this.dedError = 'Con este descuento el empleado recibiría menos del 50 % de lo devengado.';
      return;
    }
    const existing = d.id ? this.emp!.deductions.find(x => x.id === d.id) : undefined;
    const data: Omit<StandingDeduction, 'id'> & { id?: string } = {
      id: d.id, type: d.type, description: d.description.trim(), amount,
      installments: d.installments ? Math.max(1, Math.round(+d.installments)) : null,
      fromPeriod: existing?.fromPeriod ?? this.run!.period,
    };
    this.svc.saveDeduction(this.emp!.id, data);
    this.draft = undefined;
  }

  removeDeduction(id: string): void {
    this.svc.removeDeduction(this.emp!.id, id);
    this.draft = undefined;
  }
}
