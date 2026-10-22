import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PayrollService } from '../payroll.service';
import { PayLine, PayrollRun, periodLabel, periodStart, periodEnd, initials, nequiFmt, EMPLOYER_RATES } from '../payroll.model';
import { SignaturePadComponent } from '../signature-pad/signature-pad.component';
import { BillingConfigService } from '../../billing/billing-config.service';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { dmy, payslipHtml, stampOf } from '../payroll-format';

@Component({
  selector: 'app-payslips',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SignaturePadComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../payroll.css', './payslips.component.css'],
  template: `
  <ng-container *ngIf="run">
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/payroll">Nómina</a><span>/</span><span>Comprobantes · {{ label }}</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Comprobantes de pago</h1>
      <p class="kit-sub">Vista previa antes de generar. Cada comprobante recibe un número único.</p>
    </div>
    <div class="kit-actions">
      <label class="kit-select"><span>Nómina</span>
        <select [ngModel]="run.id" (ngModelChange)="selectRun($event)">
          <option *ngFor="let r of runs" [value]="r.id">{{ periodName(r.period) }} · {{ r.status }}</option>
        </select></label>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!canGenerate || !pendingCount" (click)="generateAll()">
        {{ pendingCount ? 'Generar los ' + pendingCount + ' comprobantes' : 'Comprobantes generados' }}
      </button>
    </div>
  </header>

  <div class="kit-banner kit-banner--warn" *ngIf="run.status === 'Borrador'">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div>La nómina de {{ label }} está en borrador: puedes revisar la vista previa, pero los comprobantes se generan después de confirmar la liquidación.</div>
    <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/payroll/liquidation" [queryParams]="{ nomina: run.id }">Ir a la liquidación</a>
  </div>
  <div class="kit-banner kit-banner--ok" *ngIf="message" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg><div>{{ message }}</div>
  </div>

  <div class="cp-layout">
    <aside class="kit-card cp-list">
      <input class="rsv-input" type="search" [(ngModel)]="search" placeholder="Buscar empleado..." aria-label="Buscar empleado">
      <button type="button" *ngFor="let l of visible" class="cp-item" [class.active]="l.employeeId === selected?.employeeId" (click)="selected = l">
        <span class="pay-avatar">{{ l.name[0] }}{{ l.name.split(' ').slice(-2)[0][0] }}</span>
        <span class="cp-item-name"><strong>{{ l.name }}</strong><small class="kit-mono">{{ number(l) }}</small></span>
        <span class="cp-item-net">{{ money(l.net) }}<em *ngIf="generated(l)">✓</em></span>
      </button>
    </aside>

    <section *ngIf="selected as l">
      <div class="cp-toolbar">
        <span class="rsv-badge" [ngClass]="generated(l) ? 'rsv-badge--ok' : 'rsv-badge--warn'">{{ generated(l) ? 'Generado · ' + stamp(slip(l)!.generatedAt) : 'Vista previa · no generado' }}</span>
        <div class="kit-actions">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="open(l, false)">Imprimir</button>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="open(l, true)">Descargar PDF</button>
          <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!generated(l) || !svc.canEdit" (click)="send(l)" [title]="email(l) ? 'Abre tu correo para enviarlo a ' + email(l) : 'Sin correo registrado'">Enviar por correo</button>
          <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!canGenerate || generated(l)" (click)="generateOne(l)">Generar</button>
        </div>
      </div>

      <article class="kit-card cp-sheet">
        <div class="cp-top">
          <div class="cp-issuer">
            <img class="cp-logo" src="assets/brand/sogo-fondo-claro.png" alt="SOGO">
            <div><h2>{{ issuer.name }}</h2><p>NIT {{ issuer.nit }}</p><p>{{ issuer.address }} · {{ issuer.city }}</p></div>
          </div>
          <div class="cp-num">
            <span>Comprobante de pago de nómina</span>
            <strong>{{ number(l) }}</strong>
            <p>Período: {{ dmy(start) }} – {{ dmy(end) }}</p>
            <p>Fecha de pago: {{ dmy(run.payDate) }}</p>
          </div>
        </div>
        <div class="cp-boxes">
          <div><span>Empleado</span><strong>{{ l.name }}</strong>CC {{ l.docNumber }} · {{ l.code }}</div>
          <div><span>Cargo</span><strong>{{ l.position }}</strong>{{ l.area }} · {{ l.contractType }}</div>
          <div><span>Salario base</span><strong>{{ money(l.baseSalary) }}</strong>{{ l.days }} días · {{ l.weeklyHours }} h/semana</div>
        </div>
        <div class="cp-tables">
          <table class="kit-table">
            <thead><tr><th>Devengados</th><th class="r">Valor</th></tr></thead>
            <tbody>
              <tr *ngFor="let e of l.earnings"><td>{{ e.concept }}{{ e.detail && e.kind !== 'extra' ? ' · ' + e.detail : '' }}</td><td class="r">{{ money(e.value) }}</td></tr>
              <tr class="cp-total"><td>Total devengado</td><td class="r">{{ money(l.totalEarnings) }}</td></tr>
            </tbody>
          </table>
          <table class="kit-table">
            <thead><tr><th>Deducciones</th><th class="r">Valor</th></tr></thead>
            <tbody>
              <tr *ngFor="let d of l.deductions"><td>{{ d.concept }}{{ d.kind === 'Autorizada' ? ' · ' + d.calc.split(' · ')[0].toLowerCase() : d.value ? ' ' + d.calc.split(' ')[0] : '' }}</td><td class="r">{{ money(d.value) }}</td></tr>
              <tr class="cp-total cp-total--red"><td>Total deducciones</td><td class="r">{{ money(l.totalDeductions) }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="cp-bottom">
          <div class="pay-footnote">
            <p *ngIf="pay(l) as p; else unpaid"><strong>Pagado por Nequi {{ nequi(p.to) }}</strong> · referencia {{ p.reference }} · {{ stamp(p.paidAt) }} · {{ p.paidBy }}</p>
            <ng-template #unpaid><p>Se paga por {{ l.account }} · pago pendiente</p></ng-template>
            <p>Aportes del empleador (no se descuentan): pensión {{ employerPension }}%, ARL y caja de compensación.</p>
            <p>{{ generated(l) ? 'Generado por ' + slip(l)!.generatedBy + ' · ' + stamp(slip(l)!.generatedAt) : 'Generado por: ' + user + ' · se registrará fecha y hora al generar.' }}</p>
            <p *ngIf="slip(l)?.sentTo">Enviado a {{ slip(l)!.sentTo }}</p>
          </div>
          <div class="cp-net"><span>Neto a pagar</span><strong>{{ money(l.net) }}</strong></div>
        </div>
        <div class="cp-signs">
          <span>Firma del empleador</span>
          <span class="cp-received">
            <img *ngIf="pay(l)?.receipt as r" [src]="r.signature" alt="Firma de recibido">
            <span class="cp-sigline">Recibí conforme · {{ pay(l)?.receipt?.name || l.name }}{{ pay(l)?.receipt ? ' · ' + stamp(pay(l)!.receipt!.at) : '' }}</span>
          </span>
        </div>
      </article>

      <section class="kit-card cp-receipt" *ngIf="pay(l) && !pay(l)!.receipt && svc.canEdit">
        <h2 class="kit-card-title">Firma de recibido</h2>
        <p class="pay-hint">El empleado confirma que le llegó a su Nequi el pago de {{ money(l.net) }} (referencia {{ pay(l)!.reference }}).
          Firma en este recuadro con el dedo o el mouse. La firma queda guardada con el comprobante y no se puede cambiar.</p>
        <label class="kit-field">Nombre de quien firma<input class="rsv-input" [(ngModel)]="signName"></label>
        <app-signature-pad #pad (changed)="hasSignature = $event"></app-signature-pad>
        <label class="cp-check"><input type="checkbox" [(ngModel)]="signOk"> Confirmo que recibí {{ money(l.net) }} en mi Nequi {{ nequi(pay(l)!.to) }}.</label>
        <p class="kit-error" *ngIf="signError">{{ signError }}</p>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!hasSignature || !signOk || signName.trim().length < 3" (click)="sign(l, pad.value())">Guardar firma de recibido</button>
      </section>
    </section>
  </div>
  </ng-container>
  `,
})
export class PayslipsComponent {
  readonly money = fmtMoney;
  readonly dmy = dmy;
  readonly stamp = stampOf;
  readonly periodName = periodLabel;
  readonly ini = initials;
  get user(): string { return this.svc.actor; }

  runs: PayrollRun[] = [];
  run?: PayrollRun;
  lines: PayLine[] = [];
  selected?: PayLine;
  search = '';
  message = '';

  constructor(public svc: PayrollService, private config: BillingConfigService, route: ActivatedRoute) {
    const wanted = route.snapshot.queryParamMap.get('nomina');
    const initial = (wanted && svc.getRun(wanted)) || svc.workRun() || svc.currentRun();
    svc.getRuns().subscribe(runs => {
      this.runs = runs.filter(r => r.status !== 'Anulada');
      this.load(this.run?.id ?? initial?.id ?? this.runs[0]?.id ?? '');
    });
  }

  get issuer() { return this.config.get().issuer; }
  get label(): string { return periodLabel(this.run!.period); }
  get start(): string { return periodStart(this.run!.period); }
  get end(): string { return periodEnd(this.run!.period); }
  get canGenerate(): boolean { return this.svc.canEdit && (this.run?.status === 'Confirmada' || this.run?.status === 'Pagada'); }
  get pendingCount(): number { return this.lines.filter(l => !this.generated(l)).length; }
  get visible(): PayLine[] {
    const q = this.search.trim().toLowerCase();
    return q ? this.lines.filter(l => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)) : this.lines;
  }

  selectRun(id: string): void {
    this.message = '';
    this.selected = undefined;
    this.load(id);
  }

  private load(id: string): void {
    this.run = this.svc.getRun(id);
    if (!this.run) return;
    this.svc.setWorkPeriod(this.run.period);
    this.lines = this.svc.effectiveLines(this.run);
    this.selected = this.lines.find(l => l.employeeId === this.selected?.employeeId) ?? this.lines[0];
  }

  number(l: PayLine): string { return this.svc.payslipFor(this.run!, l.employeeId).number; }
  slip(l: PayLine) { return this.svc.payslipFor(this.run!, l.employeeId).payslip; }
  generated(l: PayLine): boolean { return this.slip(l)?.status === 'Generado'; }
  email(l: PayLine): string { return this.svc.getEmployee(l.employeeId)?.email ?? ''; }

  // ── Pago Nequi y firma de recibido ──
  readonly nequi = nequiFmt;
  get employerPension(): number { return Math.round(EMPLOYER_RATES.pension * 1000) / 10; }
  pay(l: PayLine) { return this.run?.payments?.[l.employeeId]; }
  signName = '';
  signOk = false;
  hasSignature = false;
  signError = '';
  private signFor = '';

  /** Al cambiar de empleado se reinicia el formulario de firma con su nombre. */
  ngDoCheck(): void {
    const id = this.selected?.employeeId ?? '';
    if (id !== this.signFor) {
      this.signFor = id;
      this.signName = this.selected?.name ?? '';
      this.signOk = this.hasSignature = false;
      this.signError = '';
    }
  }

  sign(l: PayLine, signature: string): void {
    if (!signature) { this.signError = 'Falta la firma.'; return; }
    this.signError = this.svc.signReceipt(this.run!.id, l.employeeId, this.signName, signature);
    if (!this.signError) this.message = `Firma de recibido de ${this.signName.trim()} guardada.`;
  }

  generateAll(): void {
    const n = this.svc.generatePayslips(this.run!.id);
    this.message = `${n} comprobante${n === 1 ? '' : 's'} generado${n === 1 ? '' : 's'} para ${this.label}.`;
  }

  generateOne(l: PayLine): void {
    this.svc.generatePayslips(this.run!.id, [l.employeeId]);
    this.message = `Comprobante ${this.number(l)} generado.`;
  }

  /**
   * SOGO no tiene un servidor de correo configurado: se abre el correo del usuario con el
   * mensaje listo y se descarga el PDF para adjuntarlo. El envío queda registrado.
   */
  send(l: PayLine): void {
    const to = this.email(l);
    if (!to) { this.message = `${l.name} no tiene correo registrado: agrégalo en su ficha de empleado.`; return; }
    const number = this.number(l);
    const subject = `Comprobante de pago de nómina ${number} · ${this.label}`;
    const body = `Hola ${l.name.split(' ')[0]},\n\nAdjunto encontrarás tu comprobante de pago de nómina ${number} del período ${this.label}.\n`
      + `Neto pagado: ${this.money(l.net)}.\n\nCordialmente,\n${this.issuer.name}`;
    this.open(l, true);
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.svc.sendPayslip(this.run!.id, l.employeeId, to);
    this.message = `Se abrió tu correo para enviar ${number} a ${to}. Guarda el PDF que se abrió y adjúntalo al mensaje.`;
  }

  open(l: PayLine, print: boolean): void {
    openDocument(`Comprobante ${this.number(l)}`, payslipHtml(this.run!, l, this.number(l), this.issuer), print);
  }
}
