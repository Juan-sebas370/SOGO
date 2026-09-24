import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { JournalEntry } from '../accounting.model';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./journal.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/accounting">Contabilidad</a><span>›</span>
      <a routerLink="/dashboard/accounting/books">Libros</a><span>›</span>
      <span>Libro Diario</span>
    </div>

    <div class="res-header">
      <h1 class="res-title">Libro Diario</h1>
      <div class="header-actions">
        <button class="btn-outline-sm" (click)="exportExcel()">📥 Exportar Excel</button>
        <button class="btn-outline-sm" (click)="exportPdf()">📄 Exportar PDF</button>
        <button class="btn-new" (click)="generate()">+ Generar</button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="report-filters">
      <div class="form-field"><label>Fecha Desde</label><input type="date" [(ngModel)]="dateFrom" class="form-input"></div>
      <div class="form-field"><label>Fecha Hasta</label><input type="date" [(ngModel)]="dateTo" class="form-input"></div>
      <div class="form-field">
        <label>Cuenta</label>
        <select [(ngModel)]="accountFilter" class="form-select">
          <option value="Todas">Todas</option>
          <option *ngFor="let a of accounts" [value]="a.code">{{ a.code }} - {{ a.name }}</option>
        </select>
      </div>
    </div>

    <!-- Tabla -->
    <div class="res-table-wrap">
      <table class="res-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Comprobante</th>
            <th>Concepto</th>
            <th>Cuenta</th>
            <th>Descripción</th>
            <th class="text-right">Débito</th>
            <th class="text-right">Crédito</th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let e of entries; let i=index">
            <!-- Separador por fecha -->
            <tr class="journal-date-row" *ngIf="i===0 || entries[i-1].date !== e.date">
              <td colspan="7" class="journal-date-header">{{ e.date | date:'dd/MM/yyyy - EEEE':'':'es' }}</td>
            </tr>
            <tr>
              <td>{{ e.date | date:'dd/MM/yyyy' }}</td>
              <td class="res-code">{{ e.voucher }}</td>
              <td>{{ e.concept }}</td>
              <td><strong>{{ e.account }}</strong> · {{ e.accountName }}</td>
              <td class="text-muted">{{ e.description }}</td>
              <td class="text-right">{{ e.debit > 0 ? ('$ ' + (e.debit | number)) : '' }}</td>
              <td class="text-right text-muted">{{ e.credit > 0 ? ('$ ' + (e.credit | number)) : '' }}</td>
            </tr>
          </ng-container>

          <!-- Totales -->
          <tr class="total-final-row" *ngIf="entries.length > 0">
            <td colspan="5"><strong>Totales del período</strong></td>
            <td class="text-right"><strong>$ {{ totalDebit | number }}</strong></td>
            <td class="text-right"><strong>$ {{ totalCredit | number }}</strong></td>
          </tr>
          <tr *ngIf="entries.length===0"><td colspan="7" class="res-empty">No hay asientos en el período seleccionado.</td></tr>
        </tbody>
      </table>
    </div>

  </div>
  `
})
export class JournalComponent implements OnInit {
  dateFrom = '2024-05-01'; dateTo = '2024-05-31'; accountFilter = 'Todas';
  entries: JournalEntry[] = [];
  totalDebit = 0; totalCredit = 0;
  accounts: any[] = [];

  constructor(private svc: AccountingService) {}

  ngOnInit(): void { this.accounts = this.svc.accounts; this.generate(); }

  generate(): void {
    this.entries     = this.svc.getJournal(this.dateFrom, this.dateTo, this.accountFilter);
    this.totalDebit  = this.entries.reduce((a,e) => a + e.debit, 0);
    this.totalCredit = this.entries.reduce((a,e) => a + e.credit, 0);
  }

  exportExcel(): void { alert('Exportar Excel (próximamente)'); }
  exportPdf():   void { window.print(); }
}
