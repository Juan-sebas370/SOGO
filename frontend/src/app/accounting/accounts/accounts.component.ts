import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { ACCOUNTS, Account, AccountClass, balances } from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { chartAccounts, chartHtml, chartRows } from '../chart-export';

const CLASSES: AccountClass[] = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto', 'Costo'];
const FIRST_DIGIT: Record<AccountClass, string> = { Activo: '1', Pasivo: '2', Patrimonio: '3', Ingreso: '4', Gasto: '5', Costo: '6' };

/** Plan de cuentas (tabla `cuentas_puc`): consulta, cuentas nuevas, edición (código, clase, nombre...) y eliminación. */
@Component({
  selector: 'app-accounting-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Plan de cuentas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Plan de cuentas</h1>
      <p class="kit-sub">Cuentas del PUC que usa SOGO, guardadas en la base de datos. Una cuenta inactiva conserva lo registrado, pero no se usa en comprobantes nuevos.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport || !rows.length" (click)="exportPdf()">PDF</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport || !rows.length" (click)="exportCsv(true)">Excel</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport || !rows.length" (click)="exportCsv(false)">CSV</button>
      <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="svc.canEdit" (click)="startNew()">+ Nueva cuenta</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert"><div>{{ error }}</div></div>
  <div class="kit-banner kit-banner--ok" *ngIf="done" role="status"><div>{{ done }}</div></div>

  <section class="kit-card pa-form" *ngIf="form as f">
    <h2 class="kit-card-title">{{ original ? 'Editar cuenta ' + original : 'Nueva cuenta' }}</h2>
    <p class="kit-banner kit-banner--info pa-note" *ngIf="locked">
      SOGO usa esta cuenta para integrar los módulos: puedes cambiar su nombre y si es de naturaleza contraria, pero no el código, la clase ni desactivarla.</p>

    <div class="pa-fields">
      <label class="pa-field">
        <span class="pa-label">Clase *</span>
        <select class="rsv-input" [(ngModel)]="f.cls" [disabled]="locked"><option *ngFor="let c of classes" [value]="c">{{ c }}</option></select>
        <small class="pa-hint">&nbsp;</small>
      </label>
      <label class="pa-field">
        <span class="pa-label">Código *</span>
        <input class="rsv-input kit-mono" [(ngModel)]="f.code" [disabled]="locked" inputmode="numeric" maxlength="10" placeholder="Ej.: 1110">
        <small class="pa-hint" [class.pa-hint--bad]="f.code && !prefixOk">Empieza por {{ digit(f.cls) }} · de 1 a 10 dígitos</small>
      </label>
      <label class="pa-field">
        <span class="pa-label">Nombre *</span>
        <input class="rsv-input" [(ngModel)]="f.name" maxlength="150" placeholder="Ej.: Bancos">
        <small class="pa-hint">&nbsp;</small>
      </label>
    </div>

    <div class="pa-checks">
      <label class="pa-check" *ngIf="f.cls === 'Activo' || f.cls === 'Pasivo'"><input type="checkbox" [(ngModel)]="f.current" [disabled]="locked"> Corriente (corto plazo)</label>
      <label class="pa-check"><input type="checkbox" [(ngModel)]="f.contra"> Naturaleza contraria</label>
      <label class="pa-check"><input type="checkbox" [(ngModel)]="f.active" [disabled]="locked"> Activa</label>
    </div>

    <p class="pa-move" *ngIf="original && f.code.trim() !== original && (editingUses > 0)">
      Los {{ editingUses }} movimiento(s) de la cuenta {{ original }} pasarán al código {{ f.code.trim() || '…' }} (los comprobantes conservan su número y valores).</p>
    <p class="kit-error" *ngIf="formError">{{ formError }}</p>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="cancel()">Cancelar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cuenta' }}</button>
    </div>
  </section>

  <section class="kit-card">
    <div class="acc-head-row" style="margin-bottom: 12px">
      <div class="acc-chips">
        <button type="button" class="kit-chip" [class.active]="!cls" (click)="cls = ''">Todas <small>{{ all.length }}</small></button>
        <button type="button" class="kit-chip" *ngFor="let c of classes" [class.active]="cls === c" (click)="cls = c">{{ c }} <small>{{ count(c) }}</small></button>
      </div>
      <div class="kit-search acc-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="q" placeholder="Código o nombre..." aria-label="Buscar cuenta"></div>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Código</th><th>Cuenta</th><th>Clase</th><th class="r">Saldo actual</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr *ngFor="let a of rows" [class.acc-muted-row]="a.active === false">
            <td class="kit-mono">{{ a.code }}</td>
            <td><strong>{{ a.name }}</strong><small class="kit-muted" *ngIf="a.contra"> · naturaleza contraria</small>
              <small class="kit-muted" *ngIf="a.system"> · usada por SOGO</small></td>
            <td>{{ a.cls }}{{ a.current ? ' corriente' : '' }}</td>
            <td class="r">{{ saldo(a.code) ? money(saldo(a.code)) : '—' }}</td>
            <td><span class="rsv-badge" [ngClass]="a.active === false ? 'rsv-badge--muted' : 'rsv-badge--ok'">{{ a.active === false ? 'Inactiva' : 'Activa' }}</span></td>
            <td class="r pa-actions">
              <a class="rsv-btn rsv-btn--outline acc-row-btn" routerLink="/dashboard/accounting/ledger" [queryParams]="{ cuenta: a.code }">Libro mayor</a>
              <button type="button" class="rsv-btn rsv-btn--outline acc-row-btn" *ngIf="svc.canEdit" (click)="edit(a)">Editar</button>
              <button type="button" class="rsv-btn rsv-btn--danger-outline acc-row-btn" *ngIf="svc.canAnnul" [disabled]="!!whyNotDelete(a)"
                      [attr.title]="whyNotDelete(a) || 'Eliminar la cuenta'" (click)="toDelete = a">Eliminar</button>
            </td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="6" class="kit-empty">No hay cuentas con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="acc-note">Solo se eliminan cuentas sin movimientos que SOGO no use para integrar. Si una cuenta ya tiene movimientos, desactívala o cámbiale el código.</p>
  </section>

  <div class="rsv-modal-overlay" *ngIf="toDelete as d" (click)="toDelete = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="del-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="del-title">¿Eliminar la cuenta {{ d.code }}?</h2>
      <p class="rsv-modal-desc">«{{ d.name }}» ({{ d.cls }}) se quita del plan de cuentas. No tiene movimientos registrados.</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="toDelete = undefined">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="deleting" (click)="remove(d)">{{ deleting ? 'Eliminando…' : 'Eliminar' }}</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .acc-search { min-width: 240px; }
    .acc-search input { height: 40px; }
    .acc-row-btn { height: 30px; padding: 0 10px; font-size: 12px; margin-left: 4px; }
    .pa-actions { white-space: nowrap; }
    .pa-form { margin-bottom: 18px; }
    .pa-note { margin: 0 0 14px; font-size: 12px; }
    .pa-fields { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(170px, 1fr) minmax(240px, 2fr); gap: 14px; align-items: start; }
    .pa-field { display: flex; flex-direction: column; gap: 6px; margin: 0; }
    .pa-label { font-size: 12.5px; font-weight: 600; color: #374151; line-height: 18px; }
    .pa-field .rsv-input { height: 42px; width: 100%; box-sizing: border-box; }
    .pa-hint { min-height: 16px; font-size: 11px; color: #6B7280; line-height: 16px; }
    .pa-hint--bad { color: #B91C1C; }
    .pa-checks { display: flex; gap: 22px; flex-wrap: wrap; margin: 8px 0 12px; }
    .pa-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #1F2937; cursor: pointer; }
    .pa-check input { width: 16px; height: 16px; accent-color: #0B6FD0; }
    .pa-move { margin: 0 0 10px; font-size: 12px; color: #0B6FD0; }
    @media (max-width: 760px) { .pa-fields { grid-template-columns: 1fr; } }
  `],
})
export class AccountsComponent {
  readonly classes = CLASSES;
  readonly money = fmtMoney;
  cls: AccountClass | '' = '';
  q = '';
  form?: Account;
  /** Código de la cuenta que se está editando ('' = cuenta nueva). */
  original = '';
  locked = false;
  editingUses = 0;
  saving = false;
  deleting = false;
  toDelete?: Account;
  formError = '';
  error = '';
  done = '';
  private balance = new Map<string, number>();

  constructor(public svc: AccountingService) {
    svc.getEntries().subscribe(list => this.balance = balances(list, '0000-01-01', '9999-12-31'));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.toDelete = undefined; }

  get all(): Account[] { return ACCOUNTS; }
  get rows(): Account[] {
    const q = this.q.trim().toLowerCase();
    return ACCOUNTS.filter(a => (!this.cls || a.cls === this.cls) && (!q || a.code.includes(q) || a.name.toLowerCase().includes(q)));
  }
  count(c: AccountClass): number { return ACCOUNTS.filter(a => a.cls === c).length; }
  digit(c: AccountClass): string { return c === 'Costo' ? '6 o 7' : FIRST_DIGIT[c]; }
  saldo(code: string): number { return Math.round(this.balance.get(code) ?? 0); }

  /** ¿El código corresponde a la clase? (primer dígito del PUC) */
  get prefixOk(): boolean {
    const f = this.form!;
    const code = f.code.trim();
    return f.cls === 'Costo' ? /^[67]/.test(code) : code.startsWith(FIRST_DIGIT[f.cls]);
  }

  /** Motivo por el que no se puede eliminar ('' = se puede). */
  whyNotDelete(a: Account): string {
    if (a.system) return 'SOGO usa esta cuenta para integrar los módulos';
    if ((a.uses ?? 0) > 0) return `Tiene ${a.uses} movimiento(s): desactívala o cámbiale el código`;
    return '';
  }

  startNew(): void {
    this.original = '';
    this.locked = false;
    this.editingUses = 0;
    this.formError = this.done = this.error = '';
    this.form = { code: '', name: '', cls: 'Gasto', current: false, contra: false, active: true };
  }

  edit(a: Account): void {
    this.original = a.code;
    this.locked = !!a.system;
    this.editingUses = a.uses ?? 0;
    this.formError = this.done = this.error = '';
    this.form = { code: a.code, name: a.name, cls: a.cls, current: !!a.current, contra: !!a.contra, active: a.active !== false };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancel(): void { this.form = undefined; this.formError = ''; }

  // ── Exportar (lo que se ve: clase elegida y búsqueda) ──
  private exportList() {
    const codes = new Set(this.rows.map(a => a.code));
    return chartAccounts(this.svc.snapshot(), { inactive: true, cut: isoDate(0) }).filter(x => codes.has(x.a.code));
  }
  private get exportLabel(): string { return (this.cls ? this.cls.toLowerCase() : 'todas') + (this.q.trim() ? ` · búsqueda «${this.q.trim()}»` : ''); }

  exportPdf(): void {
    openDocument('Plan de cuentas', chartHtml(this.exportList(), this.svc.company, isoDate(0), this.svc.actor), true);
    this.svc.logExport('Plan de cuentas.pdf', this.exportLabel);
  }

  exportCsv(excel: boolean): void {
    const suffix = this.cls ? `-${this.cls.toLowerCase()}` : '';
    downloadCsvFile(chartRows(this.exportList()), `plan-de-cuentas${suffix}-${isoDate(0)}${excel ? '-excel' : ''}.csv`);
    this.svc.logExport(`Plan de cuentas.${excel ? 'xlsx' : 'csv'}`, this.exportLabel);
  }

  async save(): Promise<void> {
    const f = this.form!;
    f.code = f.code.trim();
    f.name = f.name.trim();
    if (!/^\d{1,10}$/.test(f.code)) { this.formError = 'El código debe tener entre 1 y 10 dígitos.'; return; }
    if (!this.prefixOk) { this.formError = `Las cuentas de ${f.cls.toLowerCase()} empiezan por ${this.digit(f.cls)}.`; return; }
    if (f.code !== this.original && ACCOUNTS.some(a => a.code === f.code)) { this.formError = `Ya existe la cuenta ${f.code}.`; return; }
    if (f.name.length < 3) { this.formError = 'Escribe el nombre de la cuenta.'; return; }
    if (this.original && f.active === false && this.saldo(this.original)) {
      this.formError = 'La cuenta tiene saldo: se puede desactivar cuando quede en cero (o anula lo registrado en ella).'; return;
    }
    this.saving = true;
    this.formError = '';
    try {
      await this.svc.saveAccount({ ...f, current: f.cls === 'Activo' || f.cls === 'Pasivo' ? !!f.current : false }, this.original || undefined);
      this.done = this.original && this.original !== f.code
        ? `La cuenta ${this.original} ahora es ${f.code} · ${f.name}.` : `Cuenta ${f.code} · ${f.name} guardada.`;
      this.form = undefined;
    } catch (e: any) {
      this.formError = e?.error?.message ?? 'No se pudo guardar la cuenta.';
    } finally {
      this.saving = false;
    }
  }

  async remove(a: Account): Promise<void> {
    this.deleting = true;
    this.error = this.done = '';
    try {
      await this.svc.deleteAccount(a.code);
      this.done = `Cuenta ${a.code} · ${a.name} eliminada.`;
      if (this.original === a.code) this.form = undefined;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar la cuenta.';
    } finally {
      this.deleting = false;
      this.toDelete = undefined;
    }
  }
}
