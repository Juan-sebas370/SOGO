import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DotacionService } from '../dotacion.service';
import { DOTACION_CATEGORIES, DotacionCategory, DotacionItem, annualOn, qtyOn, totalQty } from '../dotacion.model';
import { FLOORS } from '../../lodging/house';
import { fmtMoney } from '../../reservations/reservation-format';
import { fmtQty } from '../inventory.model';

/** Fila en edición: copia del artículo con las cantidades por piso como mapa. */
interface Draft {
  id?: number;
  category: DotacionCategory;
  name: string;
  unitPrice: number;
  chargeable: boolean;
  qty: Record<number, number>;
  annual: Record<number, number>;
}

@Component({
  selector: 'app-dotacion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span aria-hidden="true">›</span><span>Dotación de la casa</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Dotación de la casa</h1>
      <p class="kit-sub">Lo que hay en cada piso. El precio unitario es lo que se le cobra al huésped si pierde o daña una unidad al salir.</p>
    </div>
    <div class="kit-actions" *ngIf="isAdmin">
      <button type="button" class="rsv-btn rsv-btn--primary" (click)="startNew()" [disabled]="!!draft">+ Nuevo artículo</button>
    </div>
  </header>

  <section class="kit-kpis inv-kpis">
    <div class="kit-kpi"><div><span>Artículos</span><strong>{{ items.length }}</strong><small>{{ categories.length }} categorías</small></div></div>
    <div class="kit-kpi" *ngFor="let f of floors"><div><span>Valor piso {{ f }}</span><strong>{{ money(floorValue(f)) }}</strong><small>Precio × cantidad</small></div></div>
    <div class="kit-kpi"><div><span>Valor total de la dotación</span><strong>{{ money(totalValue) }}</strong><small>Sin amenities</small></div></div>
  </section>

  <section class="kit-card" style="margin-bottom: 18px">
    <div class="inv-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let c of categories" [class.active]="category === c" (click)="setCategory(c)">{{ c }} <span>{{ countIn(c) }}</span></button>
    </div>
    <div class="inv-filters">
      <div class="kit-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="search" placeholder="Buscar artículo..." aria-label="Buscar artículo"></div>
      <label class="kit-select"><span>Piso</span>
        <select [(ngModel)]="floorFilter">
          <option [ngValue]="0">Todos</option>
          <option *ngFor="let f of floors" [ngValue]="f">Piso {{ f }}</option>
        </select></label>
    </div>
  </section>

  <p class="kit-banner kit-banner--info" *ngIf="isAmenities">
    Los amenities se entregan al huésped para que los use: no se cobran. Las cifras son el consumo anual estimado con una ocupación del 60 %.
  </p>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert">{{ error }}</div>
  <p class="kit-muted" *ngIf="!isAdmin" style="margin-bottom: 10px">Solo el administrador puede cambiar precios y cantidades.</p>

  <section class="kit-card">
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead>
          <tr>
            <th>Artículo</th>
            <th class="r">{{ isAmenities ? 'Costo unitario' : 'Precio unitario (cobro)' }}</th>
            <th class="r" *ngFor="let f of floors">{{ isAmenities ? 'Consumo anual piso ' + f : 'Piso ' + f }}</th>
            <th class="r">{{ isAmenities ? 'Consumo anual' : 'Total unidades' }}</th>
            <th class="r">{{ isAmenities ? 'Costo anual' : 'Valor total' }}</th>
            <th *ngIf="isAdmin"></th>
          </tr>
        </thead>
        <tbody>
          <!-- Artículo nuevo -->
          <tr *ngIf="draft && !draft.id">
            <ng-container *ngTemplateOutlet="editRow"></ng-container>
          </tr>
          <tr *ngFor="let i of shown">
            <ng-container *ngIf="draft?.id === i.id; else view">
              <ng-container *ngTemplateOutlet="editRow"></ng-container>
            </ng-container>
            <ng-template #view>
              <td>
                <strong>{{ i.name }}</strong>
                <span class="rsv-badge rsv-badge--muted" *ngIf="!i.chargeable && !isAmenities" style="margin-left: 6px">No se cobra</span>
                <br *ngIf="i.updatedAt"><small class="kit-muted" *ngIf="i.updatedAt">Actualizado {{ i.updatedAt.replace('T', ' ') }}</small>
              </td>
              <td class="r">{{ money(i.unitPrice) }}</td>
              <td class="r" *ngFor="let f of floors">{{ qty(isAmenities ? annual(i, f) : qtyOf(i, f)) }}</td>
              <td class="r">{{ qty(units(i)) }}</td>
              <td class="r"><strong>{{ money(units(i) * i.unitPrice) }}</strong></td>
              <td *ngIf="isAdmin" class="r" style="white-space: nowrap">
                <ng-container *ngIf="retiring !== i.id; else confirmRetire">
                  <button type="button" class="rsv-btn rsv-btn--outline" (click)="edit(i)" [disabled]="!!draft">Editar</button>
                  <button type="button" class="rsv-btn rsv-btn--outline" (click)="retiring = i.id" [disabled]="!!draft" style="margin-left: 6px">Retirar</button>
                </ng-container>
                <ng-template #confirmRetire>
                  <span class="kit-muted">¿Retirar del catálogo?</span>
                  <button type="button" class="rsv-btn rsv-btn--primary" (click)="retire(i)" style="margin-left: 6px">Sí, retirar</button>
                  <button type="button" class="rsv-btn rsv-btn--outline" (click)="retiring = null" style="margin-left: 6px">No</button>
                </ng-template>
              </td>
            </ng-template>
          </tr>
          <tr *ngIf="!shown.length && !(draft && !draft.id)"><td [attr.colspan]="floors.length + 4 + (isAdmin ? 1 : 0)" class="kit-empty">No hay artículos con estos filtros.</td></tr>
        </tbody>
        <tfoot *ngIf="shown.length">
          <tr>
            <td><strong>Total {{ category }}</strong></td>
            <td></td>
            <td class="r" *ngFor="let f of floors"><strong>{{ money(sectionValue(f)) }}</strong></td>
            <td></td>
            <td class="r"><strong>{{ money(sectionValue(0)) }}</strong></td>
            <td *ngIf="isAdmin"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>

  <!-- Fila editable (artículo nuevo o existente) -->
  <ng-template #editRow>
    <td>
      <input class="rsv-input" [(ngModel)]="draft!.name" placeholder="Nombre del artículo" aria-label="Nombre">
      <label *ngIf="!isAmenities" style="display: flex; gap: 6px; align-items: center; margin-top: 6px; font-size: 12px">
        <input type="checkbox" [(ngModel)]="draft!.chargeable"> Se cobra al huésped si lo pierde o daña
      </label>
    </td>
    <td class="r"><input type="number" min="0" step="1000" class="rsv-input" style="max-width: 140px" [(ngModel)]="draft!.unitPrice" aria-label="Precio unitario"></td>
    <td class="r" *ngFor="let f of floors">
      <input *ngIf="!isAmenities" type="number" min="0" step="1" class="rsv-input" style="max-width: 90px" [(ngModel)]="draft!.qty[f]" [attr.aria-label]="'Cantidad piso ' + f">
      <input *ngIf="isAmenities" type="number" min="0" step="1" class="rsv-input" style="max-width: 100px" [(ngModel)]="draft!.annual[f]" [attr.aria-label]="'Consumo anual piso ' + f">
    </td>
    <td></td>
    <td></td>
    <td class="r" style="white-space: nowrap">
      <button type="button" class="rsv-btn rsv-btn--primary" (click)="saveDraft()" [disabled]="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="draft = null; error = ''" [disabled]="saving" style="margin-left: 6px">Cancelar</button>
    </td>
  </ng-template>
  `
})
export class DotacionComponent implements OnInit, OnDestroy {

  readonly categories = DOTACION_CATEGORIES;
  readonly floors = FLOORS;
  readonly money = fmtMoney;
  readonly qty = fmtQty;
  readonly qtyOf = qtyOn;
  readonly annual = annualOn;
  readonly isAdmin = localStorage.getItem('sogo_role') === 'Administrador';

  items: DotacionItem[] = [];
  category: DotacionCategory = 'Muebles y enseres';
  search = '';
  floorFilter = 0;
  draft: Draft | null = null;
  retiring: number | null = null;
  saving = false;
  error = '';
  private sub?: Subscription;

  constructor(private svc: DotacionService) {}

  ngOnInit(): void {
    this.sub = this.svc.getAll().subscribe(list => this.items = list);
    this.svc.ready();
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  get isAmenities(): boolean { return this.category === 'Amenities'; }

  get shown(): DotacionItem[] {
    const q = this.search.trim().toLowerCase();
    return this.items.filter(i => i.category === this.category
      && (!q || i.name.toLowerCase().includes(q))
      && (!this.floorFilter || (this.isAmenities ? annualOn(i, this.floorFilter) : qtyOn(i, this.floorFilter)) > 0));
  }

  /** Unidades que cuentan para el valor: existencias, o consumo anual en amenities. */
  units(i: DotacionItem): number {
    return i.category === 'Amenities' ? i.floors.reduce((s, f) => s + (f.annualUse ?? 0), 0) : totalQty(i);
  }

  countIn(c: DotacionCategory): number { return this.items.filter(i => i.category === c).length; }

  floorValue(floor: number): number {
    return this.items.filter(i => i.category !== 'Amenities').reduce((s, i) => s + qtyOn(i, floor) * i.unitPrice, 0);
  }

  get totalValue(): number { return this.floors.reduce((s, f) => s + this.floorValue(f), 0); }

  /** Valor de la categoría visible en un piso (0 = todos). */
  sectionValue(floor: number): number {
    return this.shown.reduce((s, i) => {
      const n = floor === 0 ? this.units(i) : this.isAmenities ? annualOn(i, floor) : qtyOn(i, floor);
      return s + n * i.unitPrice;
    }, 0);
  }

  setCategory(c: DotacionCategory): void {
    this.category = c;
    this.retiring = null;
    if (this.draft && !this.draft.id) this.draft = null;
  }

  startNew(): void {
    this.error = '';
    this.draft = { category: this.category, name: '', unitPrice: 0, chargeable: !this.isAmenities, qty: {}, annual: {} };
  }

  edit(i: DotacionItem): void {
    this.error = '';
    this.retiring = null;
    this.draft = {
      id: i.id, category: i.category, name: i.name, unitPrice: i.unitPrice, chargeable: i.chargeable,
      qty: Object.fromEntries(this.floors.map(f => [f, qtyOn(i, f)])),
      annual: Object.fromEntries(this.floors.map(f => [f, annualOn(i, f)])),
    };
  }

  async saveDraft(): Promise<void> {
    const d = this.draft!;
    if (!d.name.trim()) { this.error = 'Escribe el nombre del artículo.'; return; }
    if (!(+d.unitPrice >= 0)) { this.error = 'El precio no puede ser negativo.'; return; }
    const amen = d.category === 'Amenities';
    const item = {
      category: d.category, name: d.name.trim(), unitPrice: Math.round(+d.unitPrice), chargeable: amen ? false : d.chargeable,
      order: d.id ? this.svc.getById(d.id)!.order : 999,
      floors: this.floors.map(f => ({ floor: f, quantity: amen ? 0 : +(d.qty[f] || 0), ...(amen ? { annualUse: +(d.annual[f] || 0) } : {}) })),
    };
    if (item.floors.some(f => f.quantity < 0 || (f.annualUse ?? 0) < 0)) { this.error = 'Las cantidades no pueden ser negativas.'; return; }
    this.saving = true;
    this.error = '';
    try {
      if (d.id) await this.svc.save({ ...item, id: d.id });
      else await this.svc.create(item);
      this.draft = null;
    } catch (e: any) {
      this.error = e?.error?.message || 'No se pudo guardar el artículo.';
    } finally {
      this.saving = false;
    }
  }

  async retire(i: DotacionItem): Promise<void> {
    try {
      await this.svc.retire(i.id);
    } catch (e: any) {
      this.error = e?.error?.message || 'No se pudo retirar el artículo.';
    }
    this.retiring = null;
  }
}
