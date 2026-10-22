import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService } from '../settings.service';
import { UsersService } from '../../users/users.service';
import { PayrollService } from '../../payroll/payroll.service';
import {
  YEAR_PARAMS, YearParams, PayrollRates, EMPLOYEE_RATES, EMPLOYER_RATES, ARL_RATES, PROVISION_RATES, EXEMPTION, rulesFor, monthlyHours, runTotals, currentRates,
} from '../../payroll/payroll.model';
import { metaText } from '../hotel/hotel.component';
import { stampOf } from '../../users/users-seed';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));
const pctOf = (v: number, d = 2) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: d }).format(v * 100)} %`;
interface Rates {
  health: number; pension: number; employerHealth: number; employerPension: number; ccf: number; arl: number; sena: number; icbf: number; exempt114: boolean;
  prima: number; cesantias: number; intereses: number; vacaciones: number; dotacion: number;
}

@Component({
  selector: 'app-settings-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Parámetros de nómina</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Parámetros de nómina</h1><p class="kit-sub">Valores legales que usa el módulo de Nómina para liquidar.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || !canEdit || saving" (click)="save()">{{ saving ? "Guardando…" : "Guardar cambios" }}</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error">{{ error }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="failed" role="alert">{{ failed }}</p>

  <section class="kit-card pp-years">
    <span class="rp-muted">Año:</span>
    <button type="button" class="kit-chip" *ngFor="let y of years" [class.active]="y === year" [class.pp-draft]="params[y].status === 'Borrador'" (click)="year = y">
      {{ y }}{{ params[y].status === 'Cerrado' ? '' : ' · ' + params[y].status.toLowerCase() }}</button>
    <span class="rp-muted pp-grow">Los valores de cada año se congelan: las nóminas ya confirmadas no cambian; los borradores se recalculan.</span>
    <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="!params[nextYear]" (click)="prepare()">Preparar parámetros {{ nextYear }}</button>
  </section>

  <div class="cf-two">
    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Valores base {{ year }} <span class="rsv-badge rsv-badge--muted" *ngIf="readOnly">Cerrado · solo lectura</span></h2>
        <table class="kit-table cf-table">
          <thead><tr><th>Parámetro</th><th class="r">Valor</th><th>Fuente</th></tr></thead>
          <tbody>
            <tr><td><strong>Salario mínimo (SMMLV)</strong></td><td class="r"><span class="cf-unit"><span>$</span><input class="wide" type="number" min="0" step="1" [(ngModel)]="p.smmlv" [disabled]="readOnly"></span></td><td class="rp-muted">Decreto de salario mínimo {{ year }}</td></tr>
            <tr><td><strong>Auxilio de transporte</strong></td><td class="r"><span class="cf-unit"><span>$</span><input class="wide" type="number" min="0" step="1" [(ngModel)]="p.transportAid" [disabled]="readOnly"></span></td><td class="rp-muted">Decreto {{ year }} · hasta 2 SMMLV</td></tr>
            <tr><td><strong>Jornada máxima semanal</strong></td><td class="r"><strong>{{ rules.weeklyHours }} horas</strong></td><td class="rp-muted">Ley 2101 de 2021 ({{ hoursNote }})</td></tr>
            <tr><td><strong>Horas mensuales</strong></td><td class="r">{{ hours }} horas</td><td class="rp-muted">Calculado</td></tr>
            <tr><td><strong>Valor hora ordinaria mínima</strong></td><td class="r">{{ money(p.smmlv / hours) }}</td><td class="rp-muted">Calculado</td></tr>
          </tbody>
        </table>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Recargos y horas extra</h2>
        <table class="kit-table cf-table">
          <thead><tr><th>Concepto</th><th class="r">Recargo sobre hora ordinaria</th><th>Horario</th></tr></thead>
          <tbody>
            <tr><td><strong>Recargo nocturno</strong></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="200" [(ngModel)]="pcts.night" [disabled]="readOnly"> %</span></td><td class="rp-muted">19:00 – 06:00</td></tr>
            <tr><td><strong>Recargo dominical y festivo</strong></td><td class="r"><strong>{{ pct(rules.sundaySurcharge, 0) }}</strong></td><td class="rp-muted">Ley 2466 de 2025 · desde {{ sundayFrom }}</td></tr>
            <tr><td><strong>Hora extra diurna</strong></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="200" [(ngModel)]="pcts.extraDay" [disabled]="readOnly"> %</span></td><td class="rp-muted">06:00 – 19:00</td></tr>
            <tr><td><strong>Hora extra nocturna</strong></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="200" [(ngModel)]="pcts.extraNight" [disabled]="readOnly"> %</span></td><td class="rp-muted">19:00 – 06:00</td></tr>
            <tr><td><strong>Extra dominical diurna</strong></td><td class="r">{{ pct(rules.sundaySurcharge + pcts.extraDay / 100, 0) }}</td><td class="rp-muted">Recargo + extra</td></tr>
          </tbody>
        </table>
        <p class="cf-note">La jornada semanal y el recargo dominical cambian por fechas que fija la ley; SOGO los aplica solo según el período liquidado.</p>
      </section>
    </div>

    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Seguridad social y parafiscales</h2>
        <table class="kit-table cf-table">
          <thead><tr><th>Concepto</th><th class="r">Empleado</th><th class="r">Empleador</th></tr></thead>
          <tbody>
            <tr><td><strong>Salud (EPS)</strong></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="20" step="0.1" [(ngModel)]="r.health"> %</span></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="20" step="0.1" [(ngModel)]="r.employerHealth"> %</span><small class="rp-muted" *ngIf="r.exempt114"> exonerado</small></td></tr>
            <tr><td><strong>Pensión</strong></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="20" step="0.1" [(ngModel)]="r.pension"> %</span></td><td class="r"><span class="cf-pct"><input type="number" min="0" max="30" step="0.1" [(ngModel)]="r.employerPension"> %</span></td></tr>
            <tr><td><strong>ARL · riesgo I</strong></td><td class="r">—</td><td class="r"><span class="cf-pct"><input type="number" min="0" max="10" step="0.001" [(ngModel)]="r.arl"> %</span></td></tr>
            <tr><td><strong>Caja de compensación</strong></td><td class="r">—</td><td class="r"><span class="cf-pct"><input type="number" min="0" max="10" step="0.1" [(ngModel)]="r.ccf"> %</span></td></tr>
            <tr><td><strong>SENA</strong></td><td class="r">—</td><td class="r"><span class="cf-pct"><input type="number" min="0" max="10" step="0.1" [(ngModel)]="r.sena"> %</span><small class="rp-muted" *ngIf="r.exempt114"> exonerado</small></td></tr>
            <tr><td><strong>ICBF</strong></td><td class="r">—</td><td class="r"><span class="cf-pct"><input type="number" min="0" max="10" step="0.1" [(ngModel)]="r.icbf"> %</span><small class="rp-muted" *ngIf="r.exempt114"> exonerado</small></td></tr>
          </tbody>
        </table>
        <label class="pp-exempt"><input type="checkbox" [(ngModel)]="r.exempt114">
          <span><strong>Aplicar exoneración del art. 114-1 E.T.</strong><small>Salud del empleador, SENA e ICBF en 0 para salarios menores a 10 SMMLV. Actívala solo si el contador lo indica: el informe actual del contador sí los liquida.</small></span></label>
        <p class="cf-note">Los riesgos II a V de ARL se ajustan en la misma proporción que el riesgo I.</p>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Prestaciones sociales</h2>
        <div class="cf-row"><div><strong>Prima de servicios</strong></div><span class="cf-pct"><input type="number" min="0" max="20" step="0.01" [(ngModel)]="r.prima"> %</span></div>
        <div class="cf-row"><div><strong>Cesantías</strong></div><span class="cf-pct"><input type="number" min="0" max="20" step="0.01" [(ngModel)]="r.cesantias"> %</span></div>
        <div class="cf-row"><div><strong>Intereses a las cesantías</strong><small>Anual: cada mes se provisiona la doceava parte sobre la cesantía del mes (12 % anual → 1 % de la cesantía).</small></div><span class="cf-pct"><input type="number" min="0" max="20" step="0.5" [(ngModel)]="r.intereses"> % anual</span></div>
        <div class="cf-row"><div><strong>Vacaciones</strong></div><span class="cf-pct"><input type="number" min="0" max="20" step="0.01" [(ngModel)]="r.vacaciones"> %</span></div>
        <div class="cf-row"><div><strong>Dotación</strong><small>Provisión mensual sobre el salario para uniformes y calzado.</small></div><span class="cf-pct"><input type="number" min="0" max="20" step="0.1" [(ngModel)]="r.dotacion"> %</span></div>
        <p class="cf-note">Los porcentajes de seguridad social y prestaciones son de ley y aplican a todas las nóminas que se liquiden desde ahora (las confirmadas no cambian).</p>
      </section>
      <p class="kit-banner kit-banner--warn">Valores de referencia. Verifica cada enero el decreto del salario mínimo y las normas vigentes con tu contador.</p>
    </div>
  </div>
  `,
  styles: [`
    .pp-years { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; padding: 12px 16px; }
    .pp-grow { flex: 1; min-width: 200px; font-size: 12px; text-align: right; }
    .pp-draft:not(.active) { border-style: dashed; }
    .cf-table .cf-unit { height: 32px; }
    .pp-exempt { display: flex; gap: 10px; align-items: flex-start; margin-top: 12px; padding: 10px 12px; border: 1px solid #E6EBF2; border-radius: 10px; background: #FAFBFD; cursor: pointer; }
    .pp-exempt input { margin-top: 3px; }
    .pp-exempt small { display: block; font-size: 11.5px; color: #6B7280; }
  `],
})
export class PayrollParamsComponent {
  readonly money = money;
  params: Record<number, YearParams>;
  year: number;
  /** Recargos en % por año (en pantalla); se guardan como fracción. */
  private pctMap: Record<number, { night: number; extraDay: number; extraNight: number }> = {};
  get pcts() { return this.pctMap[this.year]; }
  r: Rates;
  private baseParams: string;
  private baseRates: string;
  saved = '';
  failed = '';
  saving = false;

  constructor(private settings: SettingsService, private users: UsersService, private payroll: PayrollService) {
    this.params = clone(YEAR_PARAMS);
    this.year = Object.values(this.params).find(p => p.status === 'Vigente')?.year ?? new Date().getFullYear();
    this.r = this.readRates();
    this.baseParams = JSON.stringify(this.params);
    this.baseRates = JSON.stringify(this.r);
    this.syncPcts();
  }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.payroll); }
  get years(): number[] { return Object.keys(this.params).map(Number).sort(); }
  get nextYear(): number { return Math.max(...this.years) + 1; }
  get p(): YearParams { return this.params[this.year]; }
  get readOnly(): boolean { return this.p.status === 'Cerrado'; }
  get rules() { return rulesFor(`${this.year}-12-31`); }
  get hours(): number { return monthlyHours(this.rules); }
  get hoursNote(): string { return this.rules.weeklyHours === 42 ? 'desde 15/07/2026' : this.rules.weeklyHours === 44 ? 'desde 15/07/2025' : 'vigente'; }
  get sundayFrom(): string { const f = this.rules.sundayFrom; return `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`; }
  get dirty(): boolean { this.pushPcts(); return JSON.stringify(this.params) !== this.baseParams || JSON.stringify(this.r) !== this.baseRates; }
  get error(): string {
    for (const y of this.years) {
      const p = this.params[y];
      if (!(p.smmlv > 0) || !(p.transportAid >= 0)) return `Revisa el salario mínimo y el auxilio de transporte de ${y}.`;
      if ([p.extraDay, p.extraNight, p.nightSurcharge].some(v => !(v >= 0 && v <= 2))) return `Los recargos de ${y} deben estar entre 0 % y 200 %.`;
    }
    if (Object.values(this.r).some(v => typeof v === 'number' && !(v >= 0 && v <= 30))) return 'Los porcentajes de seguridad social y prestaciones deben estar entre 0 % y 30 %.';
    return '';
  }

  pct(v: number, d = 2): string { return pctOf(v, d); }

  private syncPcts(): void {
    const r = (v: number) => Math.round(v * 1000) / 10;
    this.pctMap = Object.fromEntries(this.years.map(y => [y, { night: r(this.params[y].nightSurcharge), extraDay: r(this.params[y].extraDay), extraNight: r(this.params[y].extraNight) }]));
  }
  private pushPcts(): void {
    this.years.forEach(y => {
      const x = this.pctMap[y];
      if (!x || this.params[y].status === 'Cerrado') return;
      this.params[y].nightSurcharge = +x.night / 100; this.params[y].extraDay = +x.extraDay / 100; this.params[y].extraNight = +x.extraNight / 100;
    });
  }

  private readRates(): Rates {
    const r2 = (v: number) => Math.round(v * 100000) / 1000;
    return {
      health: r2(EMPLOYEE_RATES.health), pension: r2(EMPLOYEE_RATES.pension), employerHealth: r2(EMPLOYER_RATES.health), employerPension: r2(EMPLOYER_RATES.pension),
      ccf: r2(EMPLOYER_RATES.ccf), arl: r2(ARL_RATES.I), sena: r2(EMPLOYER_RATES.sena), icbf: r2(EMPLOYER_RATES.icbf), exempt114: EXEMPTION.exempt114,
      prima: r2(PROVISION_RATES.prima), cesantias: r2(PROVISION_RATES.cesantias), intereses: r2(PROVISION_RATES.intereses * 12), vacaciones: r2(PROVISION_RATES.vacaciones),
      dotacion: r2(PROVISION_RATES.dotacion),
    };
  }

  prepare(): void {
    const from = this.params[Math.max(...this.years)];
    this.params[this.nextYear] = { ...clone(from), year: this.nextYear, status: 'Borrador', updatedAt: stampOf(new Date()), updatedBy: this.users.actor() };
    this.pushPcts();
    this.syncPcts();
    this.year = Math.max(...this.years);
  }

  discard(): void {
    this.params = JSON.parse(this.baseParams);
    this.r = JSON.parse(this.baseRates);
    if (!this.params[this.year]) this.year = Object.values(this.params).find(p => p.status === 'Vigente')?.year ?? this.years[0];
    this.syncPcts();
  }

  async save(): Promise<void> {
    this.pushPcts();
    if (this.error || !this.canEdit || this.saving) return;
    const run = this.payroll.runsSnapshot().find(r => r.period === this.payroll.currentPeriod() && r.status === 'Borrador');
    const before = run?.status === 'Borrador' ? runTotals(this.payroll.linesFor(run)).net : null;
    // Valores por año que cambiaron
    const changed: string[] = [];
    const years: YearParams[] = [];
    this.years.forEach(y => {
      const old = YEAR_PARAMS[y], p = { ...this.params[y], smmlv: +this.params[y].smmlv, transportAid: +this.params[y].transportAid };
      if (JSON.stringify(old) === JSON.stringify(p) || p.status === 'Cerrado') return;
      if (!old) changed.push(`${y} preparado como borrador`);
      else if (old.smmlv !== p.smmlv) changed.push(`SMMLV ${y}: ${money(old.smmlv)} → ${money(p.smmlv)}`);
      else changed.push(`recargos o auxilio ${y}`);
      years.push(p);
    });
    // Porcentajes de ley (aplican a lo que se liquide desde ahora)
    let rates: PayrollRates | null = null;
    if (JSON.stringify(this.r) !== this.baseRates) {
      const r = this.r, f = (v: number) => +v / 100;
      const arlFactor = f(r.arl) / ARL_RATES.I;
      rates = currentRates();
      Object.assign(rates.employee, { health: f(r.health), pension: f(r.pension) });
      Object.assign(rates.employer, { health: f(r.employerHealth), pension: f(r.employerPension), ccf: f(r.ccf), sena: f(r.sena), icbf: f(r.icbf) });
      (Object.keys(rates.arl) as (keyof typeof ARL_RATES)[]).forEach(k => rates!.arl[k] = Math.round(ARL_RATES[k] * arlFactor * 1e6) / 1e6);
      Object.assign(rates.provision, { prima: f(r.prima), cesantias: f(r.cesantias), intereses: f(r.intereses) / 12, vacaciones: f(r.vacaciones), dotacion: f(r.dotacion) });
      rates.exempt114 = !!r.exempt114;
      changed.push('porcentajes de seguridad social y prestaciones' + (r.exempt114 !== EXEMPTION.exempt114 ? ` · exoneración art. 114-1 ${r.exempt114 ? 'activada' : 'desactivada'}` : ''));
    }
    this.saving = true;
    this.saved = this.failed = '';
    try {
      await this.payroll.saveParams(years, rates, changed.join(' · '));
    } catch (e: any) {
      this.failed = `No se pudieron guardar los parámetros${e?.error?.message ? ': ' + e.error.message : '.'}`;
      return;
    } finally {
      this.saving = false;
    }
    this.settings.touch('payroll', changed.join(' · '));
    const after = run?.status === 'Borrador' ? runTotals(this.payroll.linesFor(run)).net : null;
    this.params = clone(YEAR_PARAMS);
    this.r = this.readRates();
    this.baseParams = JSON.stringify(this.params);
    this.baseRates = JSON.stringify(this.r);
    this.syncPcts();
    this.saved = 'Parámetros guardados en la base de datos.' + (run && before !== null && after !== null
      ? ` La nómina en borrador de ${run.period} se recalculó: neto ${money(before)} → ${money(after)}. Las confirmadas no cambiaron.` : ' Las nóminas confirmadas no cambiaron.');
  }
}
