import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { ACCOUNTS, Entry, balances, counts, debitNature, monthStart, monthEnd } from '../accounting.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { dm, dmy } from '../accounting-format';

interface Row { entry: Entry; detail: string; debit: number; credit: number; balance: number; }

/** Libro mayor de una cuenta: saldo anterior, movimientos del rango y saldo final. */
@Component({
  selector: 'app-accounting-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../accounting.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/accounting">Contabilidad</a><span>/</span><span>Libro mayor</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Libro mayor</h1>
      <p class="kit-sub">Movimientos contabilizados de una cuenta con su saldo acumulado. Si eliges una cuenta título, incluye todas sus subcuentas.</p>
    </div>
  </header>
  <section class="kit-card" style="margin-bottom: 18px; display:flex; gap:10px; flex-wrap:wrap">
    <label class="kit-select" style="flex:2; min-width:260px"><span>Cuenta</span>
      <select [(ngModel)]="account" (ngModelChange)="load()"><option *ngFor="let a of accounts" [value]="a.code">{{ a.code }} · {{ a.name }}</option></select></label>
    <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="from" (ngModelChange)="load()"></label>
    <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="to" (ngModelChange)="load()"></label>
  </section>
  <section class="kit-card">
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Fecha</th><th>Comprobante</th><th>Concepto</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th><th class="r">Saldo</th></tr></thead>
        <tbody>
          <tr class="acc-muted-row"><td>{{ dm(from) }}</td><td></td><td>Saldo anterior</td><td></td><td></td><td></td><td class="r"><strong>{{ money(opening) }}</strong></td></tr>
          <tr *ngFor="let r of rows">
            <td>{{ dm(r.entry.date) }}</td>
            <td><a class="kit-code" routerLink="/dashboard/accounting/movements" [queryParams]="{ id: r.entry.id }">{{ r.entry.number }}</a></td>
            <td>{{ r.entry.concept }}<span class="rsv-badge rsv-badge--warn" *ngIf="r.entry.status === 'Provisional'" style="margin-left:6px">Provisional</span></td>
            <td class="kit-muted">{{ r.detail }}</td>
            <td class="r">{{ r.debit ? money(r.debit) : '' }}</td><td class="r">{{ r.credit ? money(r.credit) : '' }}</td>
            <td class="r"><strong [class.acc-red]="r.balance < 0">{{ money(r.balance) }}</strong></td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="7" class="kit-empty">Sin movimientos en el rango.</td></tr>
          <tr class="acc-equal"><td colspan="4">Saldo final al {{ dmy(to) }}</td><td class="r">{{ money(totalDebit) }}</td><td class="r">{{ money(totalCredit) }}</td><td class="r">{{ money(closing) }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  `,
})
export class LedgerComponent {
  get accounts() { return ACCOUNTS; }
  readonly money = fmtMoney;
  readonly dm = dm;
  readonly dmy = dmy;

  account: string;
  from: string;
  to: string;
  rows: Row[] = [];
  opening = 0;
  closing = 0;
  totalDebit = 0;
  totalCredit = 0;

  constructor(private svc: AccountingService, route: ActivatedRoute) {
    const q = route.snapshot.queryParamMap;
    this.account = q.get('cuenta') ?? '1110';
    const p = q.get('periodo') ?? svc.openPeriod;
    this.from = monthStart(p);
    this.to = monthEnd(p);
    svc.getEntries().subscribe(() => this.load());
  }

  load(): void {
    const all = this.svc.snapshot();
    const dayBefore = new Date(`${this.from}T12:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    // Una cuenta título (1110, 5205...) acumula todas sus subcuentas y auxiliares
    const mine = (code: string) => code.startsWith(this.account);
    this.opening = [...balances(all, '0000-01-01', dayBefore.toISOString().slice(0, 10))].filter(([c]) => mine(c)).reduce((s, [, v]) => s + v, 0);
    const sign = debitNature(this.account) ? 1 : -1;
    let running = this.opening;
    this.rows = all.filter(e => counts(e) && e.date >= this.from && e.date <= this.to)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      .flatMap(e => e.lines.filter(l => mine(l.account)).map(l => {
        running += sign * (l.debit - l.credit);
        const sub = l.account !== this.account ? `${l.account} · ` : '';
        return { entry: e, detail: sub + (l.detail || e.third || ''), debit: l.debit, credit: l.credit, balance: running };
      }));
    this.totalDebit = this.rows.reduce((s, r) => s + r.debit, 0);
    this.totalCredit = this.rows.reduce((s, r) => s + r.credit, 0);
    this.closing = running;
  }
}
