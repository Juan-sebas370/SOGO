import { Component } from '@angular/core';
import { readSupport, SUPPORT_ACCEPT, UploadFile } from '../support-file';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import {
  ACCOUNTS, CLOSING, ENTRY_KINDS, Entry, EntryKind, EntryLine, GROUPS, accountByCode, activeAccounts, balances, counts, debitNature,
  isClosing, isResultAccount, kindLabel, monthStart, monthEnd, pnl,
} from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { downloadCsvFile, esc, openDocument } from '../../shared/documents';
import { dm, dmy } from '../accounting-format';
import { toast } from '../../shared/toast/toast.service';

type Tab = 'Balance de prueba' | 'Libro diario' | 'Auxiliar por tercero' | 'Cierre del ejercicio';
type Level = 1 | 2 | 4 | 6 | 0;
interface TrialRow { code: string; name: string; opening: number; debit: number; credit: number; closing: number; depth: number; }
interface ThirdRow { third: string; doc: string; debit: number; credit: number; balance: number; }
interface AuxRow { entry: Entry; line: EntryLine; balance: number; }

/** Texto sin tildes y en minúsculas, para buscar. */
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const CLASS_NAMES: Record<string, string> = {
  '1': 'ACTIVO', '2': 'PASIVO', '3': 'PATRIMONIO', '4': 'INGRESOS', '5': 'GASTOS', '6': 'COSTOS DE VENTAS', '7': 'COSTOS DE PRODUCCIÓN U OPERACIÓN',
};

/**
 * Libros contables: balance de prueba, libro diario, auxiliar por tercero y cierre del ejercicio.
 * Todo sale de los comprobantes contabilizados (manuales e integrados de los demás módulos).
 */
@Component({
  selector: 'app-accounting-books',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Libros contables</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Libros contables</h1>
      <p class="kit-sub">Balance de prueba, libro diario, auxiliar por tercero y cierre anual, con los comprobantes contabilizados de todos los módulos.</p>
    </div>
    <div class="kit-actions" *ngIf="tab !== 'Cierre del ejercicio'">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="print()">Imprimir</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport" (click)="csv()">Exportar CSV</button>
    </div>
  </header>

  <section class="kit-card bk-bar">
    <div class="bk-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t" [class.active]="tab === t" (click)="setTab(t)">{{ t }}</button>
    </div>
    <ng-container *ngIf="tab !== 'Cierre del ejercicio'">
      <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="compute()"></label>
      <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" (ngModelChange)="compute()"></label>
    </ng-container>
    <label class="kit-select" *ngIf="tab === 'Balance de prueba'"><span>Nivel</span>
      <select [(ngModel)]="level" (ngModelChange)="compute()"><option *ngFor="let l of levels" [ngValue]="l.v">{{ l.name }}</option></select></label>
    <label class="kit-select" *ngIf="tab === 'Libro diario'"><span>Tipo</span>
      <select [(ngModel)]="kind" (ngModelChange)="compute()"><option value="">Todos</option><option *ngFor="let k of kinds" [value]="k">{{ label(k) }}</option></select></label>
    <ng-container *ngIf="tab === 'Auxiliar por tercero'">
      <label class="kit-select"><span>Cuenta</span>
        <select [(ngModel)]="auxAccount" (ngModelChange)="compute()"><option value="">Todas</option><option *ngFor="let a of titleAccounts" [value]="a.code">{{ a.code }} · {{ a.name }}</option></select></label>
      <label class="kit-select"><span>Tercero</span>
        <select [(ngModel)]="third" (ngModelChange)="compute()"><option value="">Resumen de todos</option><option *ngFor="let t of thirdNames" [value]="t">{{ t }}</option></select></label>
    </ng-container>
    <label class="kit-select" *ngIf="tab === 'Cierre del ejercicio'"><span>Ejercicio</span>
      <select [(ngModel)]="year" (ngModelChange)="compute()"><option *ngFor="let y of years" [value]="y">{{ y }}</option></select></label>
    <div class="bk-find" *ngIf="tab !== 'Cierre del ejercicio'">
      <label class="kit-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" [(ngModel)]="q" (ngModelChange)="compute()" [placeholder]="placeholder" aria-label="Buscar en el libro">
      </label>
      <span class="bk-count" *ngIf="q.trim()">{{ found }} · <button type="button" class="bk-clear" (click)="clearSearch()">Limpiar</button></span>
    </div>
  </section>

  <!-- Balance de prueba -->
  <section class="kit-card" *ngIf="tab === 'Balance de prueba'">
    <div class="kit-table-wrap">
      <table class="kit-table acc-sheet">
        <thead><tr><th>Código</th><th>Cuenta</th><th class="r">Saldo anterior</th><th class="r">Débitos</th><th class="r">Créditos</th><th class="r">Nuevo saldo</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of trialShown" [class.acc-group]="r.depth === 1" [class.acc-subtotal]="r.depth === 2 && level !== 2">
            <td class="kit-mono"><a class="kit-code" routerLink="/dashboard/accounting/ledger" [queryParams]="{ cuenta: r.code, periodo: from.slice(0, 7) }">{{ r.code }}</a></td>
            <td [style.padding-left.px]="10 + (r.depth > 1 ? (r.depth - 1) * 8 : 0)">{{ r.name }}</td>
            <td class="r" [class.acc-red]="r.opening < 0">{{ money(r.opening) }}</td><td class="r">{{ money(r.debit) }}</td><td class="r">{{ money(r.credit) }}</td>
            <td class="r" [class.acc-red]="r.closing < 0"><strong>{{ money(r.closing) }}</strong></td>
          </tr>
          <tr *ngIf="!trialShown.length"><td colspan="6" class="kit-empty">{{ q.trim() ? 'Ninguna cuenta coincide con «' + q.trim() + '».' : 'Sin saldos ni movimientos en el rango.' }}</td></tr>
          <tr [ngClass]="trialOk ? 'acc-equal' : 'acc-unequal'"><td colspan="3">Sumas {{ trialOk ? 'iguales' : 'DESIGUALES' }}</td><td class="r">{{ money(trialDebit) }}</td><td class="r">{{ money(trialCredit) }}</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="acc-note">Saldos en la naturaleza de cada cuenta (un saldo en rojo es contrario a su naturaleza). Haz clic en un código para abrir su libro mayor.<span *ngIf="q.trim()"> Las sumas son las de todo el balance, no solo de las cuentas encontradas.</span></p>
    <p class="kit-banner kit-banner--warn" *ngIf="provisional">Incluye {{ provisional }} comprobante(s) provisional(es) de módulos con registros en borrador.</p>
  </section>

  <!-- Libro diario -->
  <section class="kit-card" *ngIf="tab === 'Libro diario'">
    <div class="kit-table-wrap">
      <table class="kit-table acc-sheet">
        <thead><tr><th>Fecha</th><th>Comprobante</th><th>Cuenta</th><th>Detalle / tercero</th><th>C. costo</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
        <tbody>
          <ng-container *ngFor="let e of journal">
            <tr class="acc-group"><td>{{ dm(e.date) }}</td>
              <td><a class="kit-code" routerLink="/dashboard/accounting/movements" [queryParams]="{ id: e.id }">{{ e.number }}</a></td>
              <td colspan="5">{{ e.concept }}<span class="rsv-badge rsv-badge--warn" *ngIf="e.status === 'Provisional'" style="margin-left:6px">Provisional</span></td></tr>
            <tr *ngFor="let l of e.lines" [class.bk-hit]="hits.has(l)">
              <td></td><td></td><td><span class="kit-mono">{{ l.account }}</span> {{ name(l.account) }}</td>
              <td class="kit-muted">{{ l.detail || l.third || e.third }}</td><td class="kit-muted">{{ l.costCenter || '' }}</td>
              <td class="r">{{ l.debit ? money(l.debit) : '' }}</td><td class="r">{{ l.credit ? money(l.credit) : '' }}</td></tr>
          </ng-container>
          <tr *ngIf="!journal.length"><td colspan="7" class="kit-empty">{{ q.trim() ? 'Ningún comprobante del rango coincide con «' + q.trim() + '».' : 'Sin comprobantes en el rango.' }}</td></tr>
          <tr [ngClass]="journalDebit === journalCredit ? 'acc-equal' : 'acc-unequal'"><td colspan="5">Totales · {{ journal.length }} comprobante(s){{ q.trim() ? ' encontrados' : '' }}</td><td class="r">{{ money(journalDebit) }}</td><td class="r">{{ money(journalCredit) }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Auxiliar por tercero -->
  <section class="kit-card" *ngIf="tab === 'Auxiliar por tercero' && !third">
    <div class="kit-table-wrap">
      <table class="kit-table acc-sheet">
        <thead><tr><th>Tercero</th><th>NIT / CC</th><th class="r">Débitos</th><th class="r">Créditos</th><th class="r">Saldo (D − C)</th></tr></thead>
        <tbody>
          <tr *ngFor="let t of thirdsShown" class="clickable" (click)="openThird(t.third)" tabindex="0" (keydown.enter)="openThird(t.third)">
            <td>{{ t.third }}</td><td class="kit-mono">{{ t.doc || '—' }}</td><td class="r">{{ money(t.debit) }}</td><td class="r">{{ money(t.credit) }}</td>
            <td class="r" [class.acc-red]="t.balance < 0"><strong>{{ money(t.balance) }}</strong></td></tr>
          <tr *ngIf="!thirdsShown.length"><td colspan="5" class="kit-empty">{{ q.trim() ? 'Ningún tercero coincide con «' + q.trim() + '».' : 'Sin movimientos con tercero en el rango.' }}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="acc-note">Saldo acumulado desde el inicio hasta la fecha final. Elige la cuenta 1305 para ver lo que deben los clientes, o 2205 / 2335 para lo que se debe a proveedores.</p>
  </section>
  <section class="kit-card" *ngIf="tab === 'Auxiliar por tercero' && third">
    <div class="acc-head-row"><h2 class="kit-card-title">{{ third }} <small class="kit-muted">{{ thirdDoc }}</small></h2>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="openThird('')">Ver todos</button></div>
    <div class="kit-table-wrap">
      <table class="kit-table acc-sheet">
        <thead><tr><th>Fecha</th><th>Comprobante</th><th>Cuenta</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th><th class="r">Saldo (D − C)</th></tr></thead>
        <tbody>
          <tr class="acc-muted-row"><td>{{ dm(from) }}</td><td></td><td></td><td>Saldo anterior</td><td></td><td></td><td class="r"><strong>{{ money(auxOpening) }}</strong></td></tr>
          <tr *ngFor="let r of auxShown">
            <td>{{ dm(r.entry.date) }}</td><td><a class="kit-code" routerLink="/dashboard/accounting/movements" [queryParams]="{ id: r.entry.id }">{{ r.entry.number }}</a></td>
            <td><span class="kit-mono">{{ r.line.account }}</span> {{ name(r.line.account) }}</td><td class="kit-muted">{{ r.line.detail || r.entry.concept }}</td>
            <td class="r">{{ r.line.debit ? money(r.line.debit) : '' }}</td><td class="r">{{ r.line.credit ? money(r.line.credit) : '' }}</td>
            <td class="r" [class.acc-red]="r.balance < 0"><strong>{{ money(r.balance) }}</strong></td></tr>
          <tr *ngIf="!auxShown.length"><td colspan="7" class="kit-empty">{{ q.trim() && aux.length ? 'Ningún movimiento coincide con «' + q.trim() + '».' : 'Sin movimientos en el rango.' }}</td></tr>
          <tr class="acc-equal"><td colspan="6">Saldo al {{ dmy(to) }}</td><td class="r">{{ money(aux.length ? aux[aux.length - 1].balance : auxOpening) }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Cierre del ejercicio -->
  <div class="kit-layout bk-close" *ngIf="tab === 'Cierre del ejercicio'">
    <section class="kit-card">
      <h2 class="kit-card-title">Comprobante de cierre {{ year }} · 31/12/{{ year }}</h2>
      <p class="acc-section-sub">Cancela los saldos de ingresos (4), gastos (5) y costos (6 y 7) del año y traslada el resultado al patrimonio.</p>
      <div class="kit-table-wrap">
        <table class="kit-table acc-sheet">
          <thead><tr><th>Cuenta</th><th>C. costo</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of closingLines"><td><span class="kit-mono">{{ l.account }}</span> {{ name(l.account) }}</td><td class="kit-muted">{{ l.costCenter }}</td>
              <td class="r">{{ l.debit ? money(l.debit) : '' }}</td><td class="r">{{ l.credit ? money(l.credit) : '' }}</td></tr>
            <tr *ngIf="!closingLines.length"><td colspan="4" class="kit-empty">No hay saldos de resultados por cerrar en {{ year }}.</td></tr>
            <tr *ngIf="closingLines.length" class="acc-equal"><td colspan="2">Sumas iguales</td><td class="r">{{ money(sum(closingLines, 'debit')) }}</td><td class="r">{{ money(sum(closingLines, 'credit')) }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <aside class="kit-card">
      <span class="bk-eyebrow">Resultado del ejercicio {{ year }}</span>
      <div class="kit-sum"><span>Ingresos</span><strong>{{ money(result.income) }}</strong></div>
      <div class="kit-sum"><span>Costos y gastos</span><strong>{{ money(result.expenses) }}</strong></div>
      <div class="kit-sum"><span>Impuesto de renta (54)</span><strong>{{ money(result.tax) }}</strong></div>
      <div class="kit-sum kit-sum--total"><strong>{{ result.net >= 0 ? 'Utilidad neta' : 'Pérdida neta' }}</strong><strong [class.acc-red]="result.net < 0">{{ money(result.net) }}</strong></div>

      <p class="kit-banner kit-banner--ok" *ngIf="existing as x">Ejercicio cerrado con <a class="kit-code" routerLink="/dashboard/accounting/movements" [queryParams]="{ id: x.id }">{{ x.number }}</a>.
        Para rehacerlo, anúlalo en Comprobantes.</p>
      <ng-container *ngIf="!existing">
        <p class="kit-banner kit-banner--warn" *ngFor="let b of closingBlocks">{{ b }}</p>
        <p class="kit-banner kit-banner--info" *ngIf="!result.tax && result.net > 0 && !closingBlocks.length">Si el hospedaje debe impuesto de renta, regístralo antes del cierre (Nuevo comprobante: 5405 débito contra 2404 crédito).</p>
        <label class="kit-field">Soporte (acta o balance de prueba) *
          <span class="acc-file" [class.ok]="support"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>{{ support || 'Adjuntar soporte' }}<input type="file" [accept]="accept" (change)="attach($event)"></span></label>
        <button type="button" class="rsv-btn rsv-btn--primary" style="width:100%; margin-top:10px"
          [disabled]="saving || !svc.canCreate || closingBlocks.length > 0 || !closingLines.length || !support" (click)="close()">
          {{ saving ? 'Registrando…' : 'Registrar cierre ' + year }}</button>
        <p class="acc-note">Queda como nota de contabilidad (NCO). Los estados de resultados del año siguen mostrando lo ocurrido; el balance pasa el resultado a {{ result.net >= 0 ? '3605 Utilidad' : '3610 Pérdida' }} del ejercicio.</p>
      </ng-container>
    </aside>
  </div>
  `,
  styles: [`
    .bk-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
    .bk-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
    .bk-tabs button { height: 40px; padding: 0 16px; border: none; border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #1F2937; cursor: pointer; }
    .bk-tabs button.active { background: #0A3D6D; color: #fff; }
    .bk-close { grid-template-columns: minmax(0, 1fr) 340px; }
    .bk-eyebrow { font-size: 10.5px; text-transform: uppercase; color: #6B7280; display: block; margin-bottom: 6px; }
    .bk-close .kit-banner { margin: 12px 0; font-size: 12px; }
    tr.clickable { cursor: pointer; }
    .bk-find { display: flex; align-items: center; gap: 10px; flex: 1 1 100%; }
    .bk-count { font-size: 12.5px; color: #4B5563; white-space: nowrap; }
    .bk-clear { border: none; background: none; padding: 0; font: inherit; color: #0B6FD0; cursor: pointer; text-decoration: underline; }
    tr.bk-hit td { background: #FFF8E1; }
  `],
})
export class BooksComponent {
  supportFile?: UploadFile;
  readonly accept = SUPPORT_ACCEPT;
  readonly tabs: Tab[] = ['Balance de prueba', 'Libro diario', 'Auxiliar por tercero', 'Cierre del ejercicio'];
  readonly levels: { v: Level; name: string }[] = [
    { v: 1, name: 'Clase' }, { v: 2, name: 'Grupo' }, { v: 4, name: 'Cuenta' }, { v: 6, name: 'Subcuenta' }, { v: 0, name: 'Auxiliar (todo el detalle)' },
  ];
  readonly kinds = ENTRY_KINDS.concat(['Causación', 'Venta'] as EntryKind[]);
  readonly money = fmtMoney;
  readonly dm = dm;
  readonly dmy = dmy;
  readonly label = kindLabel;

  tab: Tab = 'Balance de prueba';
  from: string;
  to: string;
  level: Level = 4;
  kind = '';
  auxAccount = '';
  third = '';
  year: string;

  trial: TrialRow[] = [];
  trialDebit = 0;
  trialCredit = 0;
  provisional = 0;
  journal: Entry[] = [];
  journalDebit = 0;
  journalCredit = 0;
  thirds: ThirdRow[] = [];
  thirdNames: string[] = [];
  thirdDoc = '';
  aux: AuxRow[] = [];
  auxOpening = 0;
  closingLines: EntryLine[] = [];
  result = { income: 0, expenses: 0, tax: 0, net: 0 };
  existing?: Entry;
  closingBlocks: string[] = [];
  support = '';
  saving = false;
  /** Texto del buscador: código o nombre de cuenta, comprobante, concepto, tercero, NIT o valor. */
  q = '';
  trialShown: TrialRow[] = [];
  thirdsShown: ThirdRow[] = [];
  auxShown: AuxRow[] = [];
  /** Líneas del diario que coinciden (se resaltan). */
  hits = new Set<EntryLine>();

  constructor(public svc: AccountingService, route: ActivatedRoute) {
    const q = route.snapshot.queryParamMap;
    const tabs: Record<string, Tab> = { prueba: 'Balance de prueba', diario: 'Libro diario', terceros: 'Auxiliar por tercero', cierre: 'Cierre del ejercicio' };
    this.tab = tabs[q.get('libro') ?? ''] ?? 'Balance de prueba';
    this.q = q.get('buscar') ?? '';
    this.from = monthStart(svc.openPeriod);
    this.to = monthEnd(svc.openPeriod);
    this.year = String(+svc.year - (svc.openPeriod.endsWith('-12') ? 0 : 1));
    svc.getEntries().subscribe(() => this.compute());
  }

  get trialOk(): boolean { return Math.round(this.trialDebit) === Math.round(this.trialCredit); }
  get titleAccounts() { return ACCOUNTS.filter(a => a.code.length === 4 && ['1', '2'].includes(a.code[0])); }
  /** Ejercicios con comprobantes (más el actual), el más reciente primero. */
  get years(): string[] {
    const ys = new Set([this.svc.year, this.year, ...this.svc.snapshot().map(e => e.date.slice(0, 4))]);
    return [...ys].filter(y => y >= this.svc.goLive.slice(0, 4)).sort().reverse();
  }

  name(code: string): string {
    return accountByCode(code)?.name ?? GROUPS[code] ?? CLASS_NAMES[code] ?? '';
  }

  setTab(t: Tab): void { this.tab = t; this.q = ''; this.compute(); }
  clearSearch(): void { this.q = ''; this.compute(); }

  get placeholder(): string {
    if (this.tab === 'Balance de prueba') return 'Buscar cuenta por código o nombre (p. ej. 1105 o caja)';
    if (this.tab === 'Libro diario') return 'Buscar comprobante, concepto, cuenta, tercero, NIT o valor';
    return this.third ? 'Buscar comprobante, cuenta, detalle o valor' : 'Buscar tercero por nombre o NIT / CC';
  }

  /** Resultado del buscador en palabras. */
  get found(): string {
    const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
    if (this.tab === 'Balance de prueba') return n(this.trialShown.length, 'cuenta', 'cuentas');
    if (this.tab === 'Libro diario') return `${n(this.journal.length, 'comprobante', 'comprobantes')} · ${n(this.hits.size, 'línea', 'líneas')}`;
    return this.third ? n(this.auxShown.length, 'movimiento', 'movimientos') : n(this.thirdsShown.length, 'tercero', 'terceros');
  }

  /**
   * ¿El texto coincide? Sin tildes ni mayúsculas, todas las palabras deben aparecer.
   * Si se busca un número («1.250.000», «$ 85000»), también compara con los valores.
   */
  private matcher(): ((texts: string[], amounts?: number[]) => boolean) | null {
    const q = this.q.trim();
    if (!q) return null;
    const words = norm(q).split(/\s+/).filter(Boolean);
    const digits = /^[\d\s.,$]+$/.test(q) ? q.replace(/[^\d]/g, '') : '';
    return (texts, amounts = []) => {
      if (digits && amounts.some(a => a && String(Math.round(a)).includes(digits))) return true;
      const hay = norm(texts.filter(Boolean).join(' '));
      return words.every(w => hay.includes(w));
    };
  }
  openThird(t: string): void { this.third = t; this.compute(); }
  sum(lines: EntryLine[], k: 'debit' | 'credit'): number { return lines.reduce((s, l) => s + l[k], 0); }

  compute(): void {
    const all = this.svc.snapshot();
    if (this.from > this.to) [this.from, this.to] = [this.to, this.from];
    if (this.tab === 'Balance de prueba') this.computeTrial(all);
    if (this.tab === 'Libro diario') this.computeJournal(all);
    if (this.tab === 'Auxiliar por tercero') this.computeThirds(all);
    if (this.tab === 'Cierre del ejercicio') this.computeClosing(all);
  }

  private dayBefore(iso: string): string {
    const d = new Date(`${iso}T12:00`); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // ── Balance de prueba ──────────────────────────────

  private computeTrial(all: Entry[]): void {
    const opening = balances(all, '0000-01-01', this.dayBefore(this.from));
    const inRange = all.filter(e => counts(e) && e.date >= this.from && e.date <= this.to);
    this.provisional = inRange.filter(e => e.status === 'Provisional').length;
    const mov = new Map<string, { debit: number; credit: number }>();
    inRange.forEach(e => e.lines.forEach(l => {
      const m = mov.get(l.account) ?? { debit: 0, credit: 0 };
      m.debit += l.debit; m.credit += l.credit;
      mov.set(l.account, m);
    }));
    // Saldos por cuenta auxiliar y luego se acumulan en cada nivel (clase, grupo, cuenta, subcuenta)
    const rows = new Map<string, TrialRow>();
    const keys = (code: string): string[] => {
      const out = [code[0], code.slice(0, 2)];
      if (this.level === 1) return [out[0]];
      if (this.level === 2) return out;
      out.push(code.slice(0, 4));
      if (this.level === 6 || this.level === 0) out.push(code.slice(0, 6));
      if (this.level === 0) out.push(code);
      return [...new Set(out.filter(k => k.length <= code.length))];
    };
    new Set([...opening.keys(), ...mov.keys()]).forEach(code => {
      const o = opening.get(code) ?? 0, m = mov.get(code) ?? { debit: 0, credit: 0 };
      const delta = debitNature(code) ? m.debit - m.credit : m.credit - m.debit;
      keys(code).forEach((k, i) => {
        const r = rows.get(k) ?? { code: k, name: this.name(k) || k, opening: 0, debit: 0, credit: 0, closing: 0, depth: i + 1 };
        r.opening += o; r.debit += m.debit; r.credit += m.credit; r.closing += o + delta;
        rows.set(k, r);
      });
    });
    this.trial = [...rows.values()].filter(r => Math.round(r.opening) || Math.round(r.debit) || Math.round(r.credit) || Math.round(r.closing))
      .sort((a, b) => a.code.localeCompare(b.code));
    const m = this.matcher();
    this.trialShown = m ? this.trial.filter(r => m([r.code, r.name], [r.opening, r.debit, r.credit, r.closing])) : this.trial;
    this.trialDebit = [...mov.values()].reduce((s, m) => s + m.debit, 0);
    this.trialCredit = [...mov.values()].reduce((s, m) => s + m.credit, 0);
  }

  // ── Libro diario ───────────────────────────────────

  private computeJournal(all: Entry[]): void {
    const m = this.matcher();
    this.hits = new Set();
    const head = (e: Entry) => [e.number, e.concept, e.third, e.thirdDoc ?? '', e.category ?? '', kindLabel(e.kind), dmy(e.date)];
    const line = (e: Entry, l: EntryLine) => [l.account, this.name(l.account), l.detail ?? '', l.third || e.third, l.thirdDoc || e.thirdDoc || '', l.costCenter ?? ''];
    this.journal = all.filter(e => counts(e) && e.date >= this.from && e.date <= this.to && (!this.kind || e.kind === this.kind))
      .filter(e => {
        if (!m) return true;
        const lines = e.lines.filter(l => m(line(e, l), [l.debit, l.credit]));
        lines.forEach(l => this.hits.add(l));
        return lines.length > 0 || m(head(e), []);
      })
      .sort((a, b) => `${a.date}${a.time}${a.number}`.localeCompare(`${b.date}${b.time}${b.number}`));
    this.journalDebit = Math.round(this.journal.reduce((s, e) => s + this.sum(e.lines, 'debit'), 0));
    this.journalCredit = Math.round(this.journal.reduce((s, e) => s + this.sum(e.lines, 'credit'), 0));
  }

  // ── Auxiliar por tercero ───────────────────────────

  private computeThirds(all: Entry[]): void {
    const lineThird = (e: Entry, l: EntryLine) => (l.third || e.third || '').trim();
    const lineDoc = (e: Entry, l: EntryLine) => (l.thirdDoc || e.thirdDoc || '').trim();
    const match = (l: EntryLine) => !this.auxAccount || l.account.startsWith(this.auxAccount);
    const upTo = all.filter(e => counts(e) && e.date <= this.to)
      .sort((a, b) => `${a.date}${a.time}${a.number}`.localeCompare(`${b.date}${b.time}${b.number}`));
    const map = new Map<string, ThirdRow>();
    upTo.forEach(e => e.lines.filter(match).forEach(l => {
      const t = lineThird(e, l);
      if (!t) return;
      const r = map.get(t) ?? { third: t, doc: '', debit: 0, credit: 0, balance: 0 };
      r.doc = r.doc || lineDoc(e, l);
      r.debit += l.debit; r.credit += l.credit; r.balance += l.debit - l.credit;
      map.set(t, r);
    }));
    this.thirdNames = [...map.keys()].sort((a, b) => a.localeCompare(b));
    this.thirds = [...map.values()].filter(r => Math.round(r.debit) || Math.round(r.credit)).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    const m = this.matcher();
    this.thirdsShown = m && !this.third ? this.thirds.filter(t => m([t.third, t.doc], [t.balance, t.debit, t.credit])) : this.thirds;
    if (this.third && !map.has(this.third)) this.third = '';
    if (!this.third) { this.aux = []; this.auxShown = []; return; }
    this.thirdDoc = map.get(this.third)?.doc ?? '';
    let running = 0;
    this.auxOpening = 0;
    this.aux = [];
    upTo.forEach(e => e.lines.filter(l => match(l) && lineThird(e, l) === this.third).forEach(l => {
      running += l.debit - l.credit;
      if (e.date < this.from) this.auxOpening = running;
      else this.aux.push({ entry: e, line: l, balance: running });
    }));
    // El saldo de cada fila es el acumulado real (no se recalcula con el filtro)
    this.auxShown = m ? this.aux.filter(r => m([r.entry.number, r.entry.concept, r.line.account, this.name(r.line.account), r.line.detail ?? ''], [r.line.debit, r.line.credit])) : this.aux;
  }

  // ── Cierre del ejercicio ───────────────────────────

  private computeClosing(all: Entry[]): void {
    const [from, to] = [`${this.year}-01-01`, `${this.year}-12-31`];
    this.existing = all.find(e => isClosing(e) && e.status !== 'Anulado' && e.date.startsWith(this.year));
    const r = pnl(all, from, to);
    this.result = { income: r.income, expenses: r.expenses, tax: r.tax, net: r.net };
    // Saldo de cada cuenta de resultados por centro de costo (el cierre conserva el centro de cada gasto o ingreso)
    const bal = new Map<string, number>();
    all.filter(e => counts(e) && !isClosing(e) && e.date >= from && e.date <= to).forEach(e => e.lines.filter(l => isResultAccount(l.account)).forEach(l => {
      const k = `${l.account}|${l.costCenter || 'CC-03'}`;
      bal.set(k, (bal.get(k) ?? 0) + (debitNature(l.account) ? l.debit - l.credit : l.credit - l.debit));
    }));
    const lines: EntryLine[] = [];
    [...bal].filter(([, v]) => Math.round(v) !== 0).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => {
      const [account, costCenter] = k.split('|');
      const amount = Math.round(Math.abs(v));
      // Se lleva cada cuenta a cero: débito a las de naturaleza crédito con saldo normal y viceversa
      const debitSide = debitNature(account) ? v < 0 : v > 0;
      lines.push({ account, detail: `Cierre ${this.year}`, third: '', costCenter, debit: debitSide ? amount : 0, credit: debitSide ? 0 : amount });
    });
    const net = this.sum(lines, 'debit') - this.sum(lines, 'credit');   // > 0: utilidad (se acredita al patrimonio)
    const target = (pre: string) => activeAccounts().find(a => a.code.startsWith(pre))?.code;
    const equity = net >= 0 ? target('3605') : target('3610');
    this.closingBlocks = [];
    if (lines.length && Math.round(net) !== 0) {
      if (!equity) this.closingBlocks.push(`Falta una cuenta activa ${net >= 0 ? '3605 (utilidad del ejercicio)' : '3610 (pérdida del ejercicio)'} en el plan de cuentas.`);
      else lines.push({ account: equity, detail: `${net >= 0 ? 'Utilidad' : 'Pérdida'} del ejercicio ${this.year}`, third: '', costCenter: 'CC-03',
        debit: net < 0 ? Math.round(-net) : 0, credit: net >= 0 ? Math.round(net) : 0 });
    }
    this.closingLines = lines;
    const inactive = [...new Set(lines.map(l => l.account))].filter(c => !activeAccounts().some(a => a.code === c));
    if (inactive.length) this.closingBlocks.push(`Activa en el plan de cuentas: ${inactive.join(', ')} (tienen saldo y deben cerrarse).`);
    if (to > this.svc.maxDate) this.closingBlocks.push(`El cierre de ${this.year} se registra desde el 31 de diciembre de ${this.year}.`);
    else if (to < this.svc.goLive) this.closingBlocks.push(`El ejercicio ${this.year} es anterior al inicio de la contabilidad en SOGO.`);
    else if (this.svc.isClosed(to)) this.closingBlocks.push(`Diciembre de ${this.year} está cerrado: ábrelo en Integración para registrar el cierre.`);
    const pending = all.filter(e => e.status === 'Borrador' && e.date >= from && e.date <= to).length;
    if (pending) this.closingBlocks.push(`Hay ${pending} borrador(es) de ${this.year} sin contabilizar.`);
    if (all.some(e => e.status === 'Provisional' && e.date >= from && e.date <= to)) this.closingBlocks.push(`Hay comprobantes provisionales de ${this.year}: termina los registros en su módulo de origen.`);
  }

  async attach(ev: Event): Promise<void> {
    try {
      const f = await readSupport(ev);
      if (f) { this.support = f.name; this.supportFile = f; }
    } catch (e: any) {
      toast.error('Soporte no válido', e?.message);
    }
  }

  async close(): Promise<void> {
    if (this.saving || this.closingBlocks.length || !this.closingLines.length || !this.support) return;
    this.saving = true;
    try {
      const saved = await this.svc.register({
        kind: 'Ajuste', category: CLOSING, date: `${this.year}-12-31`, time: '23:59', concept: `Cierre del ejercicio ${this.year}`,
        third: this.svc.issuer.nombre, thirdDoc: this.svc.issuer.nit || undefined, lines: this.closingLines,
        supports: [], files: this.supportFile ? [this.supportFile] : [], observations: `Utilidad neta ${this.money(this.result.net)}`,
      });
      toast.success('Ejercicio cerrado', `${saved.number} · ${this.year}`);
      this.support = '';
      this.supportFile = undefined;
      this.compute();
    } catch (err: any) {
      toast.error('No se pudo registrar el cierre', err?.error?.message ?? err?.message);
    } finally {
      this.saving = false;
    }
  }

  // ── Exportar ───────────────────────────────────────

  private rows(): unknown[][] {
    if (this.tab === 'Balance de prueba') return [['Código', 'Cuenta', 'Saldo anterior', 'Débitos', 'Créditos', 'Nuevo saldo'],
      ...this.trialShown.map(r => [r.code, r.name, r.opening, r.debit, r.credit, r.closing]), ['', 'Sumas del balance', '', this.trialDebit, this.trialCredit, '']];
    if (this.tab === 'Libro diario') return [['Fecha', 'Comprobante', 'Concepto', 'Cuenta', 'Nombre', 'Tercero', 'C. costo', 'Débito', 'Crédito'],
      ...this.journal.flatMap(e => e.lines.map(l => [dmy(e.date), e.number, e.concept, l.account, this.name(l.account), l.third || e.third, l.costCenter ?? '', l.debit, l.credit])),
      ['', '', '', '', '', '', 'Totales', this.journalDebit, this.journalCredit]];
    if (!this.third) return [['Tercero', 'NIT / CC', 'Débitos', 'Créditos', 'Saldo'], ...this.thirdsShown.map(t => [t.third, t.doc, t.debit, t.credit, t.balance])];
    return [['Fecha', 'Comprobante', 'Cuenta', 'Detalle', 'Débito', 'Crédito', 'Saldo'], ['', '', '', 'Saldo anterior', '', '', this.auxOpening],
      ...this.auxShown.map(r => [dmy(r.entry.date), r.entry.number, r.line.account, r.line.detail || r.entry.concept, r.line.debit, r.line.credit, r.balance])];
  }

  private get title(): string {
    return this.tab === 'Auxiliar por tercero' && this.third ? `Auxiliar de ${this.third}` : this.tab;
  }

  private get searchNote(): string {
    return this.q.trim() ? ` · búsqueda «${this.q.trim()}»` : '';
  }

  csv(): void {
    downloadCsvFile(this.rows(), `${this.title.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-')}-${this.from}-${this.to}.csv`);
    this.svc.logExport(`${this.title}.csv`, `${dmy(this.from)} – ${dmy(this.to)}${this.searchNote}`);
  }

  print(): void {
    const rows = this.rows();
    openDocument(this.title, `
      <header><div><h1>${esc(this.title)}</h1><div class="muted">${esc(this.svc.company)}${this.svc.issuer.nit ? ` · NIT ${esc(this.svc.issuer.nit)}` : ''} · del ${dmy(this.from)} al ${dmy(this.to)}${esc(this.searchNote)}</div></div><div class="brand">SOGO</div></header>
      <table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(1).map(r => `<tr>${r.map(v => `<td${typeof v === 'number' ? ' class="r"' : ''}>${typeof v === 'number' ? this.money(v) : esc(v)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`, true);
  }
}
