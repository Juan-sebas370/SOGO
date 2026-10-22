import { Component, inject } from '@angular/core';
import { HotelService } from '../../shared/hotel.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService, serverError } from '../inventory.service';
import { Product, Movement, AdjustReason, ADJUST_REASONS, allowsFraction, fmtQty } from '../inventory.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { openDocument } from '../../shared/documents';
import { isoDate, isoDateTime } from '../../shared/date-utils';
import { movementHtml, dmy } from '../inventory-format';

interface Row { p: Product; counted: number | null; reason: string; note: string; }

@Component({
  selector: 'app-inventory-adjustments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Ajustes de existencias</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Actualizar existencias · {{ type === 'Inventario físico' ? 'conteo físico' : type.toLowerCase() }}</h1>
      <p class="kit-sub">{{ location }} · conteo del {{ dmy(today) }} · compara lo que dice el sistema con lo que hay en bodega.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="saveDraft()">{{ draftAt ? 'Borrador guardado ' + draftAt : 'Guardar borrador' }}</button>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="errors.length > 0 || !changed.length || saving || !svc.canEdit" (click)="confirm()">{{ saving ? "Guardando…" : "Confirmar ajuste" }}</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="done as m" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div><strong>Ajuste {{ m.number }} registrado</strong>{{ m.lines.length }} producto{{ m.lines.length === 1 ? '' : 's' }} ajustado{{ m.lines.length === 1 ? '' : 's' }} · {{ money(value(m)) }} · enviado a Contabilidad y alertas actualizadas.</div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="print(m)">Ver comprobante</button>
  </div>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="inv-head-row">
      <div class="inv-chips" role="radiogroup" aria-label="Tipo de ajuste" style="margin: 0">
        <button type="button" class="kit-chip" role="radio" *ngFor="let t of types" [attr.aria-checked]="type === t" [class.active]="type === t" (click)="type = t">{{ t }}</button>
      </div>
      <label class="kit-select"><span>Ubicación · {{ rows.length }} productos</span>
        <select [(ngModel)]="location" (ngModelChange)="load()"><option *ngFor="let l of locations">{{ l }}</option></select></label>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Producto</th><th class="r">Sistema</th><th>Conteo físico</th><th class="r">Diferencia</th><th>Motivo *</th><th>Observación</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows" [class.inv-row-danger]="invalid(r)">
            <td><strong>{{ r.p.name }}</strong><small class="inv-sub kit-mono">{{ r.p.code }} · {{ r.p.unit }}</small></td>
            <td class="r">{{ qty(r.p.stock) }}</td>
            <td><input class="rsv-input inv-qty" type="number" [step]="frac(r.p) ? 0.5 : 1" [(ngModel)]="r.counted" [class.invalid]="invalid(r)" [attr.aria-label]="'Conteo de ' + r.p.name"></td>
            <td class="r"><b [class.inv-red]="diff(r) < 0" [class.inv-green]="diff(r) > 0">{{ diff(r) > 0 ? '+' : '' }}{{ qty(diff(r)) }}</b></td>
            <td>
              <ng-container *ngIf="diff(r) !== 0; else noDiff">
                <span class="rsv-badge rsv-badge--info" *ngIf="!r.p.counted; else pickReason">Conteo inicial</span>
                <ng-template #pickReason>
                  <select class="rsv-input" [(ngModel)]="r.reason" [class.invalid]="!r.reason" [attr.aria-label]="'Motivo de ' + r.p.name">
                    <option value="">Selecciona…</option><option *ngFor="let m of lineReasons">{{ m }}</option></select>
                </ng-template>
              </ng-container>
              <ng-template #noDiff><span class="kit-muted">{{ r.p.counted ? 'Sin diferencia' : 'Por contar' }}</span></ng-template>
            </td>
            <td><input class="rsv-input" *ngIf="diff(r) !== 0" [(ngModel)]="r.note" placeholder="Opcional" [attr.aria-label]="'Observación de ' + r.p.name"></td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="6" class="kit-empty">No hay productos en esta ubicación.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="kit-banner kit-banner--danger" *ngIf="failMsg" style="margin-top: 12px" role="alert">{{ failMsg }}</div>
    <div class="kit-banner kit-banner--danger" *ngFor="let e of errors" style="margin-top: 12px">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div>{{ e }}</div>
    </div>
  </section>

  <div class="kit-layout">
    <section class="kit-card">
      <h2 class="kit-card-title">Historial de ajustes</h2>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Movimiento</th><th>Fecha</th><th>Producto</th><th class="r">Anterior</th><th class="r">Nueva</th><th>Motivo</th><th>Usuario</th></tr></thead>
          <tbody>
            <tr *ngFor="let h of history"><td class="kit-code">{{ h.m.number }}</td><td>{{ dmy(h.m.date).slice(0, 5) }}</td><td>{{ h.l.name }}</td>
              <td class="r">{{ qty(h.l.before) }}</td><td class="r"><strong>{{ qty(h.l.after) }}</strong></td><td>{{ h.l.reason || h.m.reason }}{{ h.l.note ? ' · ' + h.l.note : '' }}</td><td class="kit-muted">{{ h.m.user }}</td></tr>
            <tr *ngIf="!history.length"><td colspan="7" class="kit-empty">Sin ajustes registrados.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <aside class="kit-card">
      <h2 class="kit-card-title">Resumen del ajuste</h2>
      <div class="kit-sum"><span>Productos con diferencia</span><strong>{{ changed.length }} de {{ rows.length }}</strong></div>
      <div class="kit-sum"><span>Ajuste de valor</span><strong [class.inv-red]="valueDiff < 0" [class.inv-green]="valueDiff > 0">{{ money(valueDiff) }}</strong></div>
      <div class="kit-sum"><span>Movimiento</span><strong class="kit-mono">{{ svc.previewNumber('Ajuste') }}</strong></div>
      <p class="inv-hint">Guarda cantidad anterior, nueva y motivo por producto. Se envía a Contabilidad y actualiza las alertas.</p>
    </aside>
  </div>
  `,
})
export class AdjustmentsComponent {
  private hotel = inject(HotelService);
  readonly types = ADJUST_REASONS;
  readonly lineReasons = ADJUST_REASONS.filter(r => r !== 'Inventario físico');
  get locations(): string[] { return this.svc.locations(); }
  failMsg = '';
  saving = false;
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly dmy = dmy;
  readonly frac = (p: Product) => allowsFraction(p.unit);
  readonly today = isoDate(0);

  type: AdjustReason = 'Inventario físico';
  location = '';
  rows: Row[] = [];
  history: { m: Movement; l: Movement['lines'][number] }[] = [];
  done?: Movement;
  draftAt = '';

  constructor(public svc: InventoryService) {
    svc.getMovements().subscribe(list => {
      this.history = list.filter(m => m.kind === 'Ajuste').sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
        .flatMap(m => m.lines.map(l => ({ m, l }))).slice(0, 8);
    });
    this.location = this.locations.find(l => l.startsWith('Bodega de aseo')) ?? this.locations[0] ?? '';
    this.load();
  }

  load(): void {
    const draft = this.svc.countDrafts[this.location];
    this.draftAt = draft ? draft.at.slice(11, 16) : '';
    this.rows = this.svc.activeProducts().filter(p => p.location === this.location).sort((a, b) => a.code.localeCompare(b.code))
      .map(p => ({ p, counted: draft?.counted[p.id] ?? p.stock, reason: !p.counted ? 'Conteo inicial' : draft?.reasons[p.id] ?? '', note: draft?.notes[p.id] ?? '' }));
  }

  diff(r: Row): number { return r.counted === null || `${r.counted}` === '' ? 0 : Math.round((+r.counted - r.p.stock) * 100) / 100; }
  invalid(r: Row): boolean {
    const c = +(r.counted ?? NaN);
    return r.counted === null || `${r.counted}` === '' || !(c >= 0) || (!this.frac(r.p) && !Number.isInteger(c));
  }

  get changed(): Row[] { return this.rows.filter(r => !this.invalid(r) && this.diff(r) !== 0); }
  get valueDiff(): number { return this.changed.reduce((s, r) => s + Math.round(this.diff(r) * r.p.unitCost), 0); }

  get errors(): string[] {
    const e: string[] = [];
    this.rows.filter(r => this.invalid(r)).forEach(r => e.push(`Cantidad no válida: ${r.p.name} no puede quedar en ${r.counted ?? 'blanco'} ${r.p.unit}. El conteo debe ser 0 o mayor${this.frac(r.p) ? '' : ' y entero'}.`));
    this.changed.filter(r => !r.reason).forEach(r => e.push(`Falta el motivo de la diferencia de ${r.p.name}.`));
    return e;
  }

  saveDraft(): void {
    const at = isoDateTime();
    this.svc.countDrafts[this.location] = {
      counted: Object.fromEntries(this.rows.map(r => [r.p.id, +(r.counted ?? r.p.stock)])),
      reasons: Object.fromEntries(this.rows.map(r => [r.p.id, r.reason])),
      notes: Object.fromEntries(this.rows.map(r => [r.p.id, r.note])), at,
    };
    this.draftAt = at.slice(11, 16);
  }

  async confirm(): Promise<void> {
    if (this.errors.length || !this.changed.length || this.saving) return;
    this.saving = true;
    this.failMsg = '';
    try {
      this.done = await this.svc.registerAdjustment({
        reason: this.type, date: this.today, location: this.location, observations: '',
        lines: this.changed.map(r => ({ productId: r.p.id, counted: +r.counted!, reason: r.reason, note: r.note })),
      });
      delete this.svc.countDrafts[this.location];
      this.load();
    } catch (e) {
      this.failMsg = serverError(e, 'registrar el ajuste');
    } finally {
      this.saving = false;
    }
  }

  value(m: Movement): number { return m.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCost), 0); }
  print(m: Movement): void { openDocument(`Ajuste ${m.number}`, movementHtml(m, this.hotel.name), false); }
}
