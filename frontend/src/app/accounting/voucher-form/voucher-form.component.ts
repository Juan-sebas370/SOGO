import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountingService } from '../accounting.service';
import { Voucher, AccountLine, Account } from '../accounting.model';

@Component({
  selector: 'app-voucher-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['./voucher-form.component.css'],
  template: `
  <div class="res-page">

    <div class="res-breadcrumb">
      <a routerLink="/dashboard">Dashboard</a><span>›</span>
      <a routerLink="/dashboard/accounting">Contabilidad</a><span>›</span>
      <a routerLink="/dashboard/accounting/vouchers">Comprobantes</a><span>›</span>
      <span>{{ isEdit ? 'Editar' : 'Nuevo' }}</span>
    </div>
    <h1 class="res-title">{{ isEdit ? 'Editar Comprobante Contable' : 'Nuevo Comprobante Contable' }}</h1>

    <div class="voucher-form-grid">

      <!-- IZQUIERDA: Información General -->
      <div class="form-section">
        <h2 class="form-section-title">Información General</h2>

        <div class="form-field">
          <label>Fecha *</label>
          <input type="date" [(ngModel)]="f.date" class="form-input">
        </div>
        <div class="form-field">
          <label>Tipo de Comprobante *</label>
          <select [(ngModel)]="f.type" class="form-select">
            <option value="ING">ING - Ingreso</option>
            <option value="EGR">EGR - Egreso</option>
            <option value="PAG">PAG - Pago</option>
            <option value="FAC">FAC - Factura</option>
            <option value="NOM">NOM - Nómina</option>
          </select>
        </div>
        <div class="form-field">
          <label>Número</label>
          <input type="text" [value]="isEdit ? f.number : '(Automático)'" class="form-input" readonly>
        </div>
        <div class="form-field">
          <label>Tercero *</label>
          <input type="text" [(ngModel)]="f.tercero" placeholder="María López" class="form-input" (ngModelChange)="f.third=$event">
        </div>
        <div class="form-field">
          <label>Concepto *</label>
          <input type="text" [(ngModel)]="f.concept" placeholder="Ingreso por alojamiento - Hab. 102" class="form-input">
        </div>
        <div class="form-field">
          <label>Centro de Costo</label>
          <select [(ngModel)]="f.centro" class="form-select">
            <option>Principal</option><option>Restaurante</option><option>Administración</option>
          </select>
        </div>
        <div class="form-field">
          <label>Observaciones</label>
          <textarea [(ngModel)]="f.observations" rows="3" class="form-textarea" placeholder="Ingreso correspondiente al alojamiento..."></textarea>
        </div>
      </div>

      <!-- DERECHA: Detalles + Líneas -->
      <div class="form-section">
        <h2 class="form-section-title">Detalles del Comprobante</h2>

        <!-- Encabezado líneas -->
        <div class="lines-header">
          <span class="col-acct">Cuenta Contable</span>
          <span class="col-desc-line">Descripción</span>
          <span class="col-amt text-right">Débito</span>
          <span class="col-amt text-right">Crédito</span>
          <span class="col-del"></span>
        </div>

        <!-- Filas -->
        <div class="line-row" *ngFor="let l of lines; let i=index">
          <select [(ngModel)]="l.account" (ngModelChange)="syncAccountName(i)" class="form-select col-acct">
            <option value="">Seleccionar...</option>
            <option *ngFor="let a of accounts" [value]="a.code">{{ a.code }} - {{ a.name }}</option>
          </select>
          <input type="text" [(ngModel)]="l.accountName" class="form-input col-desc-line" readonly>
          <input type="number" [(ngModel)]="l.debit"  min="0" class="form-input col-amt" (ngModelChange)="recalc()" placeholder="0">
          <input type="number" [(ngModel)]="l.credit" min="0" class="form-input col-amt" (ngModelChange)="recalc()" placeholder="0">
          <button class="btn-del-concept" (click)="removeLine(i)">✕</button>
        </div>

        <button class="btn-add-concept" (click)="addLine()">+ Agregar Línea</button>

        <!-- Totales con indicador de cuadre -->
        <div class="voucher-totals">
          <div class="total-row"><span>Total Débito</span><span>$ {{ totalDebit | number }}</span></div>
          <div class="total-row"><span>Total Crédito</span><span>$ {{ totalCredit | number }}</span></div>
          <div class="total-row" [class.total-row--ok]="diff===0" [class.total-row--error]="diff!==0">
            <span>Diferencia</span>
            <span>$ {{ diff | number }}</span>
          </div>
          <div class="balance-indicator" [class.ok]="diff===0" [class.error]="diff!==0">
            {{ diff===0 ? '✔ Comprobante cuadrado' : '⚠ El comprobante no cuadra' }}
          </div>
        </div>
      </div>

    </div>

    <div class="form-error" *ngIf="errorMsg">{{ errorMsg }}</div>

    <div class="form-footer">
      <button class="btn-secondary" routerLink="/dashboard/accounting/vouchers">Cancelar</button>
      <button class="btn-primary" (click)="save()">
        {{ isEdit ? 'Guardar Cambios' : 'Guardar Comprobante' }}
      </button>
    </div>

  </div>
  `
})
export class VoucherFormComponent implements OnInit {
  isEdit = false; existingId = ''; errorMsg = '';

  f: Partial<Voucher> = {
    date: new Date().toISOString().slice(0,10),
    type: 'ING', concept: '', tercero: '', third: '',
    centro: 'Principal', observations: '', status: 'En proceso',
    debit: 0, credit: 0
  };

  lines: AccountLine[] = [
    { account:'', accountName:'', debit:0, credit:0 },
    { account:'', accountName:'', debit:0, credit:0 },
  ];

  totalDebit = 0; totalCredit = 0; diff = 0;
  accounts: Account[] = [];

  constructor(private svc: AccountingService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.accounts = this.svc.accounts as any;
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const found = this.svc.getById(id);
      if (found) { this.f = { ...found }; this.lines = found.lines.map(l => ({ ...l })); this.isEdit = true; this.existingId = id; this.recalc(); }
    }
  }

  syncAccountName(i: number): void {
    const acc = this.svc.accounts.find(a => a.code === this.lines[i].account);
    this.lines[i].accountName = acc ? acc.name : '';
  }

  addLine():          void { this.lines.push({ account:'', accountName:'', debit:0, credit:0 }); }
  removeLine(i:number):void{ this.lines.splice(i, 1); this.recalc(); }

  recalc(): void {
    this.totalDebit  = this.lines.reduce((a,l) => a + (l.debit  || 0), 0);
    this.totalCredit = this.lines.reduce((a,l) => a + (l.credit || 0), 0);
    this.diff        = this.totalDebit - this.totalCredit;
  }

  save(): void {
    this.errorMsg = '';
    if (!this.f.concept || !this.f.tercero) { this.errorMsg = 'Completa los campos obligatorios.'; return; }
    if (this.diff !== 0) { this.errorMsg = 'El comprobante no cuadra. Verifica los valores de débito y crédito.'; return; }
    const payload = { ...this.f, lines: this.lines, debit: this.totalDebit, credit: this.totalCredit } as Omit<Voucher,'id'|'number'>;
    if (this.isEdit) { this.svc.update(this.existingId, payload); }
    else { this.svc.create(payload); }
    this.router.navigate(['/dashboard/accounting/vouchers']);
  }
}
