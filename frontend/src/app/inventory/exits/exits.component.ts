import { Component, inject } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InventoryService, serverError } from '../inventory.service';
import { Product, Movement, ExitReason, EXIT_REASONS, AREAS, allowsFraction, fmtQty } from '../inventory.model';
import { PayrollService } from '../../payroll/payroll.service';
import { fullName } from '../../payroll/payroll.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate } from '../../shared/date-utils';
import { movementHtml, dmy } from '../inventory-format';

interface Row { p: Product; qty: number | null; }
type Check = 'OK' | 'Quedará bajo el mínimo' | 'Quedará agotado' | 'Insuficiente' | 'Cantidad no válida';

@Component({
  selector: 'app-inventory-exits',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Salidas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Registrar salida</h1>
      <p class="kit-sub">Consumo interno, uso en habitaciones, daños, pérdidas, vencimientos, transferencias o bajas.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="reset()">Cancelar</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="errors.length > 0 || saving || !svc.canEdit" (click)="save()">{{ saving ? "Guardando…" : "Registrar salida" }}</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="failMsg" role="alert"><div>{{ failMsg }}</div></div>
  <div class="kit-banner kit-banner--ok" *ngIf="done as m" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Salida {{ m.number }} registrada</strong>{{ m.lines.length }} producto{{ m.lines.length === 1 ? '' : 's' }} · {{ money(-value(m)) }} · {{ m.area }}. Registro: {{ m.user }} · {{ dmy(m.date) }} {{ m.time }}.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(m)">Ver comprobante</button>
  </div>

  <section class="kit-card" style="margin-bottom: 18px">
    <p class="kit-field">Motivo de la salida *</p>
    <div class="inv-chips" role="radiogroup" aria-label="Motivo de la salida">
      <button type="button" class="kit-chip" role="radio" *ngFor="let r of reasons" [attr.aria-checked]="reason === r" [class.active]="reason === r" (click)="setReason(r)">{{ r }}</button>
    </div>
    <div class="inv-grid">
      <label class="kit-field">Fecha *<input class="rsv-input" type="date" [(ngModel)]="date" [max]="today"></label>
      <label class="kit-field">Área responsable *<select class="rsv-input" [(ngModel)]="area"><option *ngFor="let a of areas">{{ a }}</option></select></label>
      <label class="kit-field">Entregado a<input class="rsv-input" list="staff" [(ngModel)]="deliveredTo"><datalist id="staff"><option *ngFor="let s of staff" [value]="s"></option></datalist></label>
      <label class="kit-field">Referencia<input class="rsv-input" [(ngModel)]="reference" placeholder="Ej.: alistamiento casa completa · RSV-…"></label>
    </div>
  </section>

  <div class="kit-layout">
    <section class="kit-card">
      <div class="inv-head-row">
        <h2 class="kit-card-title">Productos que salen</h2>
        <div class="inv-picker">
          <input class="rsv-input" [(ngModel)]="pick" (keydown.enter)="matches[0] && add(matches[0])" placeholder="+ Agregar producto" aria-label="Agregar producto">
          <ul *ngIf="pick.trim()">
            <li *ngFor="let p of matches"><button type="button" (click)="add(p)"><span><b class="kit-mono">{{ p.code }}</b> {{ p.name }}</span><span class="kit-muted">{{ qty(p.stock) }} {{ p.unit }}</span></button></li>
            <li class="none" *ngIf="!matches.length">Sin productos con existencias para «{{ pick.trim() }}».</li>
          </ul>
        </div>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Producto</th><th>Disponible</th><th class="r">Cantidad</th><th>Queda</th><th>Validación</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index" [class.inv-row-danger]="check(r) === 'Insuficiente'">
              <td><strong>{{ r.p.name }}</strong><small class="inv-sub kit-mono">{{ r.p.code }} · {{ r.p.unit }}</small></td>
              <td>{{ qty(r.p.stock) }} {{ r.p.unit }}</td>
              <td class="r"><input class="rsv-input inv-qty" type="number" min="0" [step]="frac(r.p) ? 0.5 : 1" [(ngModel)]="r.qty"
                  [class.invalid]="check(r) === 'Insuficiente' || check(r) === 'Cantidad no válida'" [attr.aria-label]="'Cantidad de ' + r.p.name"></td>
              <td><b [class.inv-red]="left(r) < 0">{{ qty(left(r)) }}</b> <small class="kit-muted">(mín. {{ qty(r.p.minStock) }})</small></td>
              <td><span class="rsv-badge" [ngClass]="tone(r)">{{ check(r) }}</span></td>
              <td><button type="button" class="inv-remove" (click)="rows.splice(i, 1)" [attr.aria-label]="'Quitar ' + r.p.name">×</button></td>
            </tr>
            <tr *ngIf="!rows.length"><td colspan="6" class="kit-empty">Agrega los productos que salen de bodega.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="kit-banner kit-banner--danger" *ngFor="let r of insufficient" style="margin-top: 12px">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div><b>No hay existencias suficientes:</b> {{ r.p.name }} tiene {{ qty(r.p.stock) }} {{ r.p.unit }} y se piden {{ qty(+(r.qty ?? 0)) }}. Ajusta la cantidad o registra una entrada primero.</div>
      </div>
      <label class="kit-field" style="margin-top: 12px">Observaciones<textarea class="rsv-input" rows="2" [(ngModel)]="observations"></textarea></label>
    </section>

    <aside class="kit-aside">
      <section class="kit-card">
        <h2 class="kit-card-title">Resumen</h2>
        <div class="kit-sum"><span>Productos</span><strong>{{ rows.length }}</strong></div>
        <div class="kit-sum"><span>Valor{{ insufficient.length ? ' (sin los insuficientes)' : '' }}</span><strong>{{ money(value_) }}</strong></div>
        <div class="kit-sum"><span>Movimiento</span><strong class="kit-mono">{{ svc.previewNumber('Salida') }}</strong></div>
        <div class="kit-sum"><span>Genera alertas nuevas</span><strong [class.inv-red]="newAlerts.length">{{ newAlerts.length ? newAlerts.length + ' · ' + newAlerts.join(', ') : 'Ninguna' }}</strong></div>
        <p class="inv-hint">Se registran fecha, hora y usuario. El valor se envía a Contabilidad como {{ accountingNote }}.</p>
      </section>
      <p class="kit-banner kit-banner--danger" *ngIf="errors.length && rows.length" style="font-size:12px">{{ errors.join(' · ') }}</p>
    </aside>
  </div>
  `,
})
export class ExitsComponent {
  private hotel = inject(HotelService);
  readonly reasons = EXIT_REASONS;
  readonly areas = AREAS;
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly dmy = dmy;
  readonly frac = (p: Product) => allowsFraction(p.unit);
  readonly today = isoDate(0);

  reason: ExitReason = 'Consumo interno';
  date = isoDate(0);
  area = 'Alojamiento';
  deliveredTo = '';
  reference = '';
  observations = '';
  rows: Row[] = [];
  pick = '';
  staff: string[] = [];
  done?: Movement;

  constructor(public svc: InventoryService, payroll: PayrollService, route: ActivatedRoute) {
    this.staff = payroll.employeesSnapshot().filter(e => e.status !== 'Retirado').map(fullName).sort();
    const wanted = route.snapshot.queryParamMap.get('producto');
    const p = wanted ? svc.getProduct(wanted) : undefined;
    if (p) {
      this.add(p);
      if (route.snapshot.queryParamMap.get('motivo') === 'Vencimiento') this.setReason('Vencimiento');
    }
  }

  get matches(): Product[] {
    const q = this.pick.trim().toLowerCase();
    return this.svc.activeProducts().filter(p => p.stock > 0 && !this.rows.some(r => r.p.id === p.id)
      && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 8);
  }

  get insufficient(): Row[] { return this.rows.filter(r => this.check(r) === 'Insuficiente'); }
  get value_(): number { return this.rows.filter(r => this.check(r) !== 'Insuficiente').reduce((s, r) => s + Math.round(+(r.qty ?? 0) * r.p.unitCost), 0); }
  get newAlerts(): string[] {
    return this.rows.filter(r => ['Quedará bajo el mínimo', 'Quedará agotado'].includes(this.check(r)) && r.p.stock > r.p.minStock).map(r => r.p.name);
  }
  get accountingNote(): string {
    return ['Daño', 'Pérdida', 'Vencimiento', 'Baja'].includes(this.reason) ? 'pérdida de inventario'
      : `consumo de ${this.area.split(' ·')[0]}`;
  }

  get errors(): string[] {
    const e: string[] = [];
    if (!this.rows.length) e.push('agrega al menos un producto');
    if (!this.date) e.push('falta la fecha');
    this.rows.forEach(r => {
      const c = this.check(r);
      if (c === 'Insuficiente') e.push(`${r.p.name}: existencias insuficientes`);
      if (c === 'Cantidad no válida') e.push(`${r.p.name}: cantidad no válida`);
    });
    return e;
  }

  left(r: Row): number { return Math.round((r.p.stock - +(r.qty ?? 0)) * 100) / 100; }

  check(r: Row): Check {
    const q = +(r.qty ?? 0);
    if (!(q > 0) || (!this.frac(r.p) && !Number.isInteger(q))) return 'Cantidad no válida';
    if (q > r.p.stock) return 'Insuficiente';
    if (this.left(r) === 0) return 'Quedará agotado';
    return this.left(r) <= r.p.minStock ? 'Quedará bajo el mínimo' : 'OK';
  }

  tone(r: Row): string {
    return { 'OK': 'rsv-badge--ok', 'Quedará bajo el mínimo': 'rsv-badge--warn', 'Quedará agotado': 'rsv-badge--warn', 'Insuficiente': 'rsv-badge--danger', 'Cantidad no válida': 'rsv-badge--muted' }[this.check(r)];
  }

  setReason(r: ExitReason): void {
    this.reason = r;
    if (r === 'Uso en habitaciones') this.area = 'Alojamiento';
  }

  add(p: Product): void {
    this.rows.push({ p, qty: null });
    this.pick = '';
  }

  value(m: Movement): number { return m.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCost), 0); }

  saving = false;
  failMsg = '';

  async save(): Promise<void> {
    if (this.errors.length || this.saving) return;
    this.saving = true;
    this.failMsg = '';
    try {
      this.done = await this.svc.registerExit({
        reason: this.reason, date: this.date, area: this.area, deliveredTo: this.deliveredTo, reference: this.reference, observations: this.observations,
        lines: this.rows.map(r => ({ productId: r.p.id, qty: +(r.qty ?? 0) })),
      });
      this.reset();
    } catch (e) {
      this.failMsg = serverError(e, 'registrar la salida');
    } finally {
      this.saving = false;
    }
  }

  reset(): void {
    this.rows = [];
    this.reference = '';
    this.observations = '';
  }

  print(m: Movement): void { openDocument(`Salida ${m.number}`, movementHtml(m, this.hotel.name), false); }
}
