import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import {
  PayLine, PayrollRun, RunTotals, EMPTY_NOVELTY, runTotals, extrasTotal, bonusTotal, transportOf, extrasSummary,
  periodLabel, periodStart, periodEnd, rulesFor, nequiFmt,
} from '../payroll.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { dmy, stampOf } from '../payroll-format';

@Component({
  selector: 'app-liquidation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css'],
  template: `
  <ng-container *ngIf="run">
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Liquidar nómina</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Liquidar nómina · {{ label }}</h1>
      <p class="kit-sub">Período mensual {{ dmy(start) }} – {{ dmy(end) }} · fecha de pago {{ dmy(run.payDate) }} · jornada {{ rules.weeklyHours }} h/semana</p>
    </div>
    <div class="liq-side">
      <label class="kit-select"><span>Mes a liquidar</span>
        <select [ngModel]="run.period" (ngModelChange)="goTo($event)">
          <option *ngFor="let p of periods" [value]="p">{{ name(p) }}{{ hasRun(p) ? '' : ' · sin liquidar' }}</option>
        </select></label>
      <span class="pay-status" [ngClass]="statusClass">{{ statusText }}</span>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="run.status !== 'Borrador' && run.status !== 'Anulada'" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Liquidación confirmada · {{ run.confirmedBy }} · {{ stamp(run.confirmedAt!) }}</strong>
      La causación quedó integrada en Contabilidad. {{ run.status === 'Pagada' ? 'Pago registrado el ' + stamp(run.paidAt!) + '.' : 'Pendiente de pago.' }}</div>
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/payslips" [queryParams]="{ nomina: run.id }">Ver comprobantes</a>
  </div>
  <div class="kit-banner kit-banner--warn" *ngIf="issues.length && run.status === 'Borrador'" role="alert">
    <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><b>{{ issues.length }} inconsistencia{{ issues.length === 1 ? '' : 's' }} antes de confirmar:</b>
      <ng-container *ngFor="let l of issues; let last = last">{{ l.name }} no tiene {{ l.issues.join(', ') }} registrado{{ last ? '' : '; ' }}</ng-container>.
      Sin estos datos el aporte no se podrá reportar en la planilla.</div>
    <a class="rsv-btn rsv-btn--outline" [routerLink]="['/dashboard/payroll/employees', issues[0].employeeId]" [queryParams]="{ corregir: 1 }">Corregir datos del empleado</a>
  </div>
  <div class="kit-banner kit-banner--warn" *ngIf="run.status === 'Anulada'" role="status">
    <div><strong>Liquidación anulada · {{ run.annulment?.by }} · {{ run.annulment ? stamp(run.annulment.at) : '' }}</strong> Motivo: {{ run.annulment?.reason }}. Se conserva como registro; no cuenta en pagos ni reportes.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="svc.canCreate && run.period <= svc.currentPeriod()" (click)="restart()">Liquidar de nuevo</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert"><div>{{ error }}</div></div>

  <section class="kit-kpis">
    <div class="kit-kpi"><div><span>Empleados a liquidar</span><strong>{{ t.employees }}</strong><small>{{ excluded.join(' · ') || 'Todo el personal' }}</small></div></div>
    <div class="kit-kpi"><div><span>Total devengado</span><strong>{{ money(t.earnings) }}</strong><small>Salarios, extras, recargos y auxilios</small></div></div>
    <div class="kit-kpi"><div><span>Total deducciones</span><strong>{{ money(t.deductions) }}</strong><small>Legales y autorizadas</small></div></div>
    <div class="kit-kpi pay-kpi-main"><div><span>Neto a pagar</span><strong>{{ money(t.net) }}</strong><small>A {{ t.employees }} empleados</small></div></div>
  </section>

  <section class="kit-card">
    <div class="pay-card-head">
      <h2 class="kit-card-title">Detalle por empleado</h2>
      <span class="kit-muted">{{ run.status === 'Borrador' ? 'Haz clic en un empleado para ver o ajustar sus conceptos' : 'Liquidación cerrada: solo consulta' }}</span>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Empleado</th><th class="r">Salario base</th><th class="r">Extras y recargos</th><th class="r">Aux. transporte</th><th class="r">Bonificaciones</th>
          <th class="r">Total devengado</th><th class="r">Deducciones</th><th class="r">Neto a pagar</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let l of lines" class="clickable" [class.pay-warn-row]="l.issues.length" (click)="open(l)" tabindex="0" (keydown.enter)="open(l)">
            <td><div class="kit-prod"><span class="pay-avatar">{{ l.name[0] }}{{ l.name.split(' ').slice(-2)[0][0] }}</span>
              <div><strong>{{ l.name }}</strong><small class="kit-muted">{{ l.position }}{{ l.days < 30 ? ' · ' + l.days + ' días' : '' }}</small></div></div></td>
            <td class="r">{{ money(l.baseSalary) }}</td>
            <td class="r">{{ extras(l) ? money(extras(l)) : '—' }}<small class="pay-sub">{{ summary(l) }}</small></td>
            <td class="r">{{ transport(l) ? money(transport(l)) : '—' }}</td>
            <td class="r">{{ bonus(l) ? money(bonus(l)) : '—' }}</td>
            <td class="r"><strong>{{ money(l.totalEarnings) }}</strong></td>
            <td class="r pay-red">− {{ money(l.totalDeductions) }}</td>
            <td class="r"><strong>{{ money(l.net) }}</strong></td>
            <td><span class="rsv-badge" [ngClass]="l.issues.length ? 'rsv-badge--warn' : 'rsv-badge--ok'">{{ l.issues.length ? 'Revisar' : 'Listo' }}</span></td>
          </tr>
          <tr class="pay-total">
            <td>Totales · {{ t.employees }} empleados</td><td class="r">{{ money(t.base) }}</td><td class="r">{{ money(t.extras) }}</td><td class="r">{{ money(t.transport) }}</td>
            <td class="r">{{ money(t.bonus) }}</td><td class="r">{{ money(t.earnings) }}</td><td class="r pay-red">− {{ money(t.deductions) }}</td><td class="r">{{ money(t.net) }}</td><td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="pay-bar">
    <p class="pay-footnote">Valores {{ end.slice(0, 4) }}: SMMLV {{ money(rules.smmlv) }} · auxilio de transporte {{ money(rules.transportAid) }} · hora extra diurna +{{ pct(rules.extraDay) }}% · extra nocturna +{{ pct(rules.extraNight) }}% ·
      recargo nocturno +{{ pct(rules.nightSurcharge) }}% · dominical/festivo +{{ sundayPct }}% (desde {{ dmy(rules.sundayFrom) }}).</p>
    <div class="kit-actions" *ngIf="run.status === 'Borrador' && svc.canEdit">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="saveDraft()">{{ savedAt ? 'Borrador guardado ' + savedAt : 'Guardar borrador' }}</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="issues.length > 0" (click)="confirming = true">Confirmar liquidación</button>
    </div>
    <div class="kit-actions" *ngIf="run.status === 'Confirmada' && !prog.paid">
      <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="svc.canAnnul" (click)="annulling = true; reason = ''">Anular liquidación</button>
    </div>
  </div>

  <section class="kit-card nq-card" *ngIf="run.status === 'Confirmada' || run.status === 'Pagada'">
    <div class="pay-card-head">
      <h2 class="kit-card-title">Pagos por Nequi</h2>
      <span class="kit-muted">{{ prog.paid }} de {{ prog.total }} pagados · {{ prog.signed }} con firma de recibido</span>
    </div>
    <p class="pay-hint" *ngIf="run.status === 'Confirmada'">Transfiere desde Nequi el neto de cada empleado al número que aparece y escribe aquí la referencia de la
      transacción (la muestra la app al terminar). La nómina queda pagada cuando todos tienen su pago; luego cada empleado firma el recibido en Comprobantes.</p>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Empleado</th><th>Número Nequi</th><th class="r">Neto a transferir</th><th>Referencia Nequi</th><th>Estado</th></tr></thead>
        <tbody>
          <tr *ngFor="let l of lines">
            <td><strong>{{ l.name }}</strong><small class="pay-sub">{{ l.position }}</small></td>
            <td class="kit-mono">{{ payTo(l) ? nequi(payTo(l)) : 'Sin número' }}</td>
            <td class="r"><strong>{{ money(l.net) }}</strong></td>
            <td>
              <ng-container *ngIf="payment(l) as p; else payForm">
                <span class="kit-code">{{ p.reference }}</span><small class="pay-sub">{{ stamp(p.paidAt) }} · {{ p.paidBy }}</small>
              </ng-container>
              <ng-template #payForm>
                <div class="nq-pay" *ngIf="run.status === 'Confirmada' && svc.canEdit; else noPay">
                  <input class="rsv-input" [(ngModel)]="refs[l.employeeId]" placeholder="Ej. M1234567" [attr.aria-label]="'Referencia Nequi de ' + l.name" [disabled]="!payTo(l)">
                  <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!payTo(l) || (refs[l.employeeId] || '').trim().length < 4" (click)="registerPay(l)">Registrar</button>
                </div>
                <ng-template #noPay><span class="kit-muted">—</span></ng-template>
              </ng-template>
            </td>
            <td><span class="rsv-badge" [ngClass]="payment(l)?.receipt ? 'rsv-badge--ok' : payment(l) ? 'rsv-badge--info' : 'rsv-badge--warn'">
              {{ payment(l)?.receipt ? 'Pagado y firmado' : payment(l) ? 'Pagado · falta firma' : 'Pendiente de pago' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="kit-error" *ngIf="payError" role="alert">{{ payError }}</p>
    <a class="rsv-btn rsv-btn--outline nq-sign" routerLink="/dashboard/payroll/payslips" [queryParams]="{ nomina: run.id }" *ngIf="prog.paid > prog.signed">Ir a firmas de recibido</a>
  </section>

  <div class="rsv-modal-overlay" *ngIf="confirming" (click)="confirming = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="conf-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="conf-title">¿Confirmar la nómina de {{ label }}?</h2>
      <p class="rsv-modal-desc">Se liquidan {{ t.employees }} empleados por un neto de <strong>{{ money(t.net) }}</strong>. Después de confirmar no se pueden cambiar
        novedades ni deducciones; se contabiliza el gasto de personal y quedan listos los comprobantes.</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirming = false">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="confirm()">Confirmar liquidación</button>
      </div>
    </div>
  </div>
  <div class="rsv-modal-overlay" *ngIf="annulling" (click)="annulling = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="ann-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="ann-title">¿Anular la liquidación de {{ label }}?</h2>
      <p class="rsv-modal-desc">Se anula también su comprobante contable. Solo se puede anular antes de registrar pagos por Nequi. Después podrás liquidar el período de nuevo.</p>
      <label class="kit-field">Motivo<textarea class="rsv-input" rows="2" [(ngModel)]="reason"></textarea></label>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="annulling = false">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="reason.trim().length < 5" (click)="annul()">Anular</button>
      </div>
    </div>
  </div>
  </ng-container>
  <p class="kit-card kit-empty" *ngIf="!run">Todavía no hay nóminas. Un usuario con permiso para crear en Nómina puede abrir la del mes.</p>
  `,
  styles: [`
    .liq-side { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
    .liq-side .kit-select { min-width: 200px; }
    .pay-kpi-main { border-color: #0B6FD0; }
    .pay-kpi-main strong { color: #0A3D6D; }
    .pay-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .pay-card-head .kit-muted { font-size: 12px; }
    .pay-warn-row td { background: #FFFBF4; }
    .pay-total td { background: #F4F7FB; font-weight: 700; color: #0A2540; }
    .nq-card { margin-top: 18px; }
    .nq-pay { display: flex; gap: 6px; min-width: 240px; }
    .nq-pay .rsv-input { height: 36px; }
    .nq-pay .rsv-btn { height: 36px; padding: 0 12px; }
    .nq-sign { margin-top: 12px; }
  `],
})
export class LiquidationComponent {
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly stamp = stampOf;
  readonly extras = extrasTotal;
  readonly transport = transportOf;
  readonly bonus = bonusTotal;

  run?: PayrollRun;
  lines: PayLine[] = [];
  issues: PayLine[] = [];
  excluded: string[] = [];
  t!: RunTotals;
  confirming = false;
  annulling = false;
  reason = '';
  error = '';
  savedAt = '';

  private runId = '';

  constructor(public svc: PayrollService, route: ActivatedRoute, private router: Router) {
    const wanted = route.snapshot.queryParamMap.get('nomina');
    const period = route.snapshot.queryParamMap.get('periodo');
    this.runId = ((wanted && svc.getRun(wanted)) || (period && /^\d{4}-\d{2}$/.test(period) ? svc.openRun(period) : svc.openRun(svc.workPeriod())))?.id ?? '';
    svc.getRuns().subscribe(() => this.refresh());
  }

  readonly name = periodLabel;
  get periods(): string[] { return this.svc.liquidablePeriods(); }
  hasRun(p: string): boolean { return this.svc.runsSnapshot().some(r => r.period === p && r.status !== 'Anulada'); }

  /** Cambia de mes: abre su nómina (o la crea en borrador si aún no existe y el rol puede). */
  goTo(period: string): void {
    const r = this.svc.openRun(period);
    if (!r || r.period !== period) { this.error = `No hay nómina de ${periodLabel(period).toLowerCase()} y tu rol no puede crearla.`; return; }
    this.error = '';
    this.runId = r.id;
    this.refresh();
    this.router.navigate([], { queryParams: { nomina: r.id }, replaceUrl: true });
  }

  private refresh(): void {
    this.run = this.svc.getRun(this.runId);
    if (!this.run) return;
    this.svc.setWorkPeriod(this.run.period);
    this.lines = this.svc.effectiveLines(this.run);
    this.issues = this.run.status === 'Borrador' ? this.lines.filter(l => l.issues.length) : [];
    this.excluded = this.svc.excludedFor(this.run.period);
    this.t = runTotals(this.lines);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.confirming = this.annulling = false; }

  get label(): string { return periodLabel(this.run!.period); }
  get start(): string { return periodStart(this.run!.period); }
  get end(): string { return periodEnd(this.run!.period); }
  get rules() { return rulesFor(this.end); }
  pct(v: number): number { return Math.round(v * 100); }
  get sundayPct(): number { return Math.round(this.rules.sundaySurcharge * 100); }
  get statusText(): string {
    return { Borrador: 'Borrador · sin confirmar', Confirmada: 'Confirmada · pendiente de pago', Pagada: 'Pagada', Anulada: 'Anulada' }[this.run!.status];
  }
  get statusClass(): string {
    return { Borrador: 'pay-status--draft', Confirmada: 'pay-status--info', Pagada: 'pay-status--ok', Anulada: 'pay-status--draft' }[this.run!.status];
  }

  summary(l: PayLine): string { return extrasSummary(this.run!.novelties[l.employeeId] ?? EMPTY_NOVELTY); }

  open(l: PayLine): void {
    this.router.navigate(['/dashboard/payroll/liquidation', this.run!.id, l.employeeId]);
  }

  saveDraft(): void {
    this.svc.saveDraft(this.run!.id);
    this.savedAt = new Date().toTimeString().slice(0, 5);
  }

  confirm(): void {
    this.error = '';
    try { this.svc.confirm(this.run!.id); } catch (e) { this.error = (e as Error).message; }
    this.confirming = false;
  }

  // ── Pagos por Nequi ──
  refs: Record<string, string> = {};
  payError = '';
  readonly nequi = nequiFmt;
  get prog() { return this.svc.paymentProgress(this.run!); }
  payment(l: PayLine) { return this.run?.payments?.[l.employeeId]; }
  /** Número Nequi: el que quedó en la liquidación confirmada o, si no, el de la ficha. */
  payTo(l: PayLine): string { return l.payTo || this.svc.getEmployee(l.employeeId)?.accountNumber || ''; }

  registerPay(l: PayLine): void {
    this.payError = this.svc.registerPayment(this.run!.id, l.employeeId, this.refs[l.employeeId] ?? '');
    if (!this.payError) delete this.refs[l.employeeId];
  }

  /** Abre una nómina nueva del período (la anulada se conserva como registro). */
  restart(): void {
    const r = this.svc.openRun(this.run!.period);
    if (!r) return;
    this.runId = r.id;
    this.refresh();
    this.router.navigate([], { queryParams: { nomina: r.id }, replaceUrl: true });
  }

  annul(): void {
    this.svc.annulRun(this.run!.id, this.reason.trim());
    this.annulling = false;
  }
}
