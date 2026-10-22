import { Component, inject } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InventoryService, serverError } from '../inventory.service';
import { UsersService } from '../../users/users.service';
import { PayrollService } from '../../payroll/payroll.service';
import { Product, Movement, Supplier, EntryReason, ENTRY_REASONS, allowsFraction, fmtQty } from '../inventory.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { movementHtml, dmy } from '../inventory-format';

interface Row { p: Product; qty: number | null; cost: number | null; }

@Component({
  selector: 'app-inventory-entries',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Entradas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar entrada</h1>
      <p class="kit-sub">Compras, devoluciones, reposiciones, donaciones o ajustes positivos. Las existencias se actualizan al registrar.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Limpiar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="(tried && errors.length > 0) || saving || !svc.canCreate" (click)="save()">{{ saving ? "Guardando…" : "Registrar entrada" }}</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="done as d" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Entrada {{ d.m.number }} registrada exitosamente</strong>
      {{ d.m.lines.length }} producto{{ d.m.lines.length === 1 ? '' : 's' }} actualizado{{ d.m.lines.length === 1 ? '' : 's' }} · {{ d.attended }} alerta{{ d.attended === 1 ? '' : 's' }} atendida{{ d.attended === 1 ? '' : 's' }} · enviada a Contabilidad. Registro: {{ d.m.user }} · {{ dmy(d.m.date) }} {{ d.m.time }}.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(d.m)">Ver comprobante de entrada</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="tried && errors.length" role="alert">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div><b>No se puede registrar:</b> {{ errors.join(', ') }}.</div>
  </div>

  <section class="kit-card" style="margin-bottom: 18px">
    <p class="kit-field">Tipo de entrada *</p>
    <div class="inv-chips" role="radiogroup" aria-label="Tipo de entrada">
      <button type="button" class="kit-chip" role="radio" *ngFor="let r of reasons" [attr.aria-checked]="reason === r" [class.active]="reason === r" (click)="reason = r">{{ r }}</button>
    </div>
    <div class="inv-grid">
      <label class="kit-field">Fecha *<input class="rsv-input" type="date" [(ngModel)]="date" [max]="today"></label>
      <label class="kit-field">Proveedor {{ reason === 'Compra' ? '*' : '' }}
        <select class="rsv-input" [(ngModel)]="supplierId" [class.invalid]="tried && reason === 'Compra' && !supplierId">
          <option [ngValue]="null">{{ suppliers.length ? 'Selecciona…' : 'Aún no hay proveedores registrados' }}</option>
          <option *ngFor="let s of suppliers" [ngValue]="s.id">{{ s.name }} · {{ s.docType }} {{ s.docNumber }}</option>
        </select>
        <button type="button" class="inv-link" *ngIf="svc.canCreate && !newSup" (click)="openSupplier()">+ Registrar proveedor</button></label>
      <label class="kit-field">Factura del proveedor<input class="rsv-input" [(ngModel)]="invoice" placeholder="FV-00000"></label>
      <label class="kit-field">Recibió<input class="rsv-input" list="staff" [(ngModel)]="receivedBy">
        <datalist id="staff"><option *ngFor="let n of staff" [value]="n"></option></datalist></label>
    </div>
    <div class="inv-newsup" *ngIf="newSup as s">
      <h3>Nuevo proveedor</h3>
      <div class="inv-grid">
        <label class="kit-field">Nombre o razón social *<input class="rsv-input" [(ngModel)]="s.name"></label>
        <label class="kit-field">Documento<select class="rsv-input" [(ngModel)]="s.docType"><option>NIT</option><option>CC</option><option>CE</option></select></label>
        <label class="kit-field">Número * <small class="kit-muted">(sin dígito de verificación)</small><input class="rsv-input" inputmode="numeric" [(ngModel)]="s.docNumber"></label>
        <label class="kit-field">Teléfono<input class="rsv-input" [(ngModel)]="s.phone"></label>
      </div>
      <p class="kit-error" *ngIf="supError">{{ supError }}</p>
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="newSup = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="saveSupplier()">Guardar proveedor</button>
      </div>
    </div>
  </section>

  <section class="kit-card">
    <div class="inv-head-row">
      <h2 class="kit-card-title">Productos recibidos</h2>
      <div class="inv-picker">
        <input class="rsv-input" [(ngModel)]="pick" (keydown.enter)="pickFirst()" placeholder="+ Agregar producto por código o nombre..." aria-label="Agregar producto">
        <ul *ngIf="pick.trim()">
          <li *ngFor="let p of matches"><button type="button" (click)="add(p)"><span><b class="kit-mono">{{ p.code }}</b> {{ p.name }}</span><span class="kit-muted">{{ qty(p.stock) }} {{ p.unit }}</span></button></li>
          <li *ngIf="!matches.length"><button type="button" (click)="markMissing()">«{{ pick.trim() }}» no existe · anotarlo para registrarlo</button></li>
        </ul>
      </div>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Código</th><th>Producto</th><th class="r">Cantidad</th><th class="r">Costo unit.</th><th class="r">Subtotal</th><th>Existencias</th><th>Resultado</th><th></th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows; let i = index">
            <td class="kit-mono">{{ r.p.code }}</td>
            <td><strong>{{ r.p.name }}</strong><small class="inv-sub">{{ r.p.unit }} · {{ r.p.location }}</small></td>
            <td class="r"><input class="rsv-input inv-qty" type="number" min="0" [step]="frac(r.p) ? 0.5 : 1" [(ngModel)]="r.qty" [class.invalid]="tried && !validQty(r)" [attr.aria-label]="'Cantidad de ' + r.p.name"></td>
            <td class="r"><input class="rsv-input inv-qty" type="number" min="0" step="100" [(ngModel)]="r.cost" [attr.aria-label]="'Costo de ' + r.p.name"></td>
            <td class="r"><strong>{{ money(sub(r)) }}</strong></td>
            <td>{{ qty(r.p.stock) }} → <b class="inv-green">{{ qty(after(r)) }}</b> <small class="kit-muted">(mín. {{ qty(r.p.minStock) }})</small></td>
            <td><span class="rsv-badge" [ngClass]="resolves(r) ? 'rsv-badge--ok' : 'rsv-badge--muted'">{{ resolves(r) ? 'Alerta atendida' : 'Actualizado' }}</span></td>
            <td><button type="button" class="inv-remove" (click)="rows.splice(i, 1)" [attr.aria-label]="'Quitar ' + r.p.name">×</button></td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="8" class="kit-empty">Agrega los productos que llegaron.</td></tr>
          <tr class="en-total" *ngIf="rows.length"><td colspan="4">Total de la entrada · {{ rows.length }} producto{{ rows.length === 1 ? '' : 's' }}</td><td class="r">{{ money(total) }}</td><td colspan="3"></td></tr>
        </tbody>
      </table>
    </div>
    <div class="kit-banner kit-banner--warn" *ngFor="let name of missing" style="margin-top: 12px">
      <svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div><b>«{{ name }}» no existe en el inventario.</b> No se incluye en la entrada. Regístralo primero para poder darle entrada.</div>
      <a class="rsv-btn rsv-btn--outline" routerLink="/dashboard/inventory/products/new">Registrar producto</a>
    </div>
    <label class="kit-field" style="margin-top: 12px">Observaciones<textarea class="rsv-input" rows="2" [(ngModel)]="observations"></textarea></label>
  </section>
  `,
  styles: [`
    .en-total td { background: #EEF5FD; font-weight: 700; color: #0A2540; }
    .inv-link { display: block; margin-top: 4px; border: none; background: none; padding: 0; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; }
    .inv-newsup { margin-top: 14px; padding: 14px; border: 1px solid #D5DEEA; border-radius: 12px; background: #FAFBFD; }
    .inv-newsup h3 { margin: 0 0 10px; font-size: 13.5px; color: #0A2540; }
  `],
})
export class EntriesComponent {
  private hotel = inject(HotelService);
  readonly reasons = ENTRY_REASONS;
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly frac = (p: Product) => allowsFraction(p.unit);
  readonly dmy = dmy;
  readonly today = isoDate(0);

  reason: EntryReason = 'Compra';
  date = isoDate(0);
  supplierId: number | null = null;
  invoice = '';
  receivedBy = '';
  observations = '';
  rows: Row[] = [];
  missing: string[] = [];
  pick = '';
  tried = false;
  saving = false;
  serviceError = '';
  done?: { m: Movement; attended: number };
  newSup?: { name: string; docType: string; docNumber: string; phone: string };
  supError = '';

  constructor(public svc: InventoryService, private users: UsersService, private payroll: PayrollService, route: ActivatedRoute) {
    this.receivedBy = users.actorName();
    // "Solicitar compra" / alertas pueden llegar con ?producto=
    const wanted = route.snapshot.queryParamMap.get('producto');
    const p = wanted ? svc.getProduct(wanted) : undefined;
    if (p && p.categoryInUse) this.add(p);
  }

  /** Proveedores registrados (terceros con NIT o documento). */
  get suppliers(): Supplier[] { return this.svc.supplierList(); }
  /** Personal vigente de Nómina (quién recibe la mercancía). */
  get staff(): string[] { return this.payroll.employeesSnapshot().filter(e => e.status !== 'Retirado').map(e => `${e.firstName} ${e.lastName}`); }

  get matches(): Product[] {
    const q = this.pick.trim().toLowerCase();
    return this.svc.activeProducts().filter(p => !this.rows.some(r => r.p.id === p.id)
      && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 8);
  }

  get total(): number { return this.rows.reduce((s, r) => s + this.sub(r), 0); }

  get errors(): string[] {
    const e: string[] = [];
    if (!this.rows.length) e.push('agrega al menos un producto');
    if (this.reason === 'Compra' && !this.supplierId) e.push('falta el proveedor');
    if (!this.date) e.push('falta la fecha');
    if (this.serviceError) e.push(this.serviceError);
    this.rows.filter(r => !this.validQty(r)).forEach(r => e.push(`revisa la cantidad de ${r.p.name}`));
    return e;
  }

  validQty(r: Row): boolean { const q = +(r.qty ?? 0); return q > 0 && (this.frac(r.p) || Number.isInteger(q)); }
  sub(r: Row): number { return Math.round(+(r.qty ?? 0) * +(r.cost ?? 0)); }
  after(r: Row): number { return Math.round((r.p.stock + +(r.qty ?? 0)) * 100) / 100; }
  resolves(r: Row): boolean { return r.p.counted && r.p.stock <= r.p.minStock && this.after(r) > r.p.minStock; }

  add(p: Product): void {
    this.rows.push({ p, qty: null, cost: p.unitCost || null });
    if (!this.supplierId && p.supplierId) this.supplierId = p.supplierId;
    this.pick = '';
  }

  pickFirst(): void { if (this.matches[0]) this.add(this.matches[0]); else if (this.pick.trim()) this.markMissing(); }

  markMissing(): void {
    const name = this.pick.trim();
    if (name && !this.missing.includes(name)) this.missing.push(name);
    this.pick = '';
  }

  openSupplier(): void { this.supError = ''; this.newSup = { name: '', docType: 'NIT', docNumber: '', phone: '' }; }

  async saveSupplier(): Promise<void> {
    if (!this.newSup) return;
    try {
      const s = await this.svc.addSupplier(this.newSup);
      this.supplierId = s.id;
      this.newSup = undefined;
    } catch (e) {
      this.supError = serverError(e, 'registrar el proveedor');
    }
  }

  async save(): Promise<void> {
    this.tried = true;
    this.serviceError = '';
    if (this.errors.length || this.saving) return;
    this.saving = true;
    try {
      const obs = [this.observations.trim(), this.missing.length ? `No incluidos (no existen): ${this.missing.join(', ')}` : ''].filter(Boolean).join(' · ');
      const res = await this.svc.registerEntry({
        reason: this.reason, date: this.date, supplierId: this.supplierId, invoice: this.invoice, receivedBy: this.receivedBy, observations: obs,
        lines: this.rows.map(r => ({ productId: r.p.id, qty: +(r.qty ?? 0), unitCost: +(r.cost ?? 0) })),
      });
      this.done = { m: res.movement, attended: res.attended };
      this.reset();
    } catch (e) {
      this.done = undefined;
      this.serviceError = serverError(e, 'registrar la entrada');
    } finally {
      this.saving = false;
    }
  }

  reset(): void {
    this.rows = [];
    this.missing = [];
    this.invoice = '';
    this.observations = '';
    this.tried = false;
  }

  print(m: Movement): void { openDocument(`Entrada ${m.number}`, movementHtml(m, this.hotel.name), false); }
}

