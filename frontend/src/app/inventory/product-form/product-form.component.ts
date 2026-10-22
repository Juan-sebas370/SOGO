import { AfterViewInit, Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService, NewProduct, serverError } from '../inventory.service';
import { Product, Category, Supplier, UNITS, allowsFraction, fmtQty, Movement, MovementLine } from '../inventory.model';
import { fmtMoney } from '../../reservations/reservation-format';
import { isoDate } from '../../shared/date-utils';

interface Form {
  code: string; name: string; category: string; description: string; unit: string; initial: number | null; minStock: number | null;
  location: string; supplierId: number | null; unitCost: number | null; refPrice: number | null; tracksExpiry: boolean; expiryDate: string;
}
type Key = keyof Form;
const LABELS: Partial<Record<Key, string>> = {
  name: 'Nombre', category: 'Categoría', description: 'Descripción', unit: 'Unidad de medida', minStock: 'Nivel mínimo', location: 'Ubicación',
  supplierId: 'Proveedor', unitCost: 'Costo unitario', refPrice: 'Precio de referencia', tracksExpiry: 'Controla vencimiento', expiryDate: 'Fecha de vencimiento',
};

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>{{ original?.code ?? 'Nuevo producto' }}</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">{{ original ? 'Actualizar producto' : 'Registrar producto' }}</h1>
      <p class="kit-sub">{{ original ? original.code + ' · el código no cambia. Las existencias solo cambian con entradas, salidas o ajustes.' : 'Los campos con * son obligatorios. La cantidad inicial crea el primer movimiento de inventario.' }}</p>
    </div>
    <div class="kit-actions">
      <a routerLink="/dashboard/inventory" class="rsv-btn rsv-btn--outline">Cancelar</a>
      <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="(tried && errorCount > 0) || (original && !diffs.length) || saving || !(original ? svc.canEdit : svc.canCreate)" (click)="save()">{{ saving ? 'Guardando…' : original ? 'Guardar cambios' : 'Guardar producto' }}</button>
    </div>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="tried && errorCount" role="alert">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div><b>No se puede guardar:</b> {{ dup ? 'el código ' + f.code.toUpperCase() + ' ya pertenece a «' + dup.name + '». El siguiente código disponible en ' + f.category + ' es ' + suggested + '.' : 'revisa ' + errorCount + ' campo' + (errorCount === 1 ? '' : 's') + '.' }}</div>
    <button type="button" class="rsv-btn rsv-btn--danger-outline" *ngIf="dup" (click)="f.code = suggested">Usar {{ suggested }}</button>
  </div>
  <div class="kit-banner kit-banner--danger" *ngIf="failMsg" role="alert"><div>{{ failMsg }}</div></div>
  <div class="kit-banner kit-banner--ok" *ngIf="saved" role="status"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg><div>{{ saved }}</div></div>

  <div class="kit-layout">
    <div class="kit-stack">
      <section class="kit-card">
        <h2 class="inv-section-title">Identificación</h2>
        <div class="inv-grid">
          <label class="kit-field">Código *
            <input class="rsv-input kit-mono" [(ngModel)]="f.code" [readonly]="!!original" (blur)="touch('code')" [class.invalid]="bad('code')" [class.inv-ok]="good('code')">
            <span class="kit-error" *ngIf="bad('code')">{{ errors.code }}</span></label>
          <label class="kit-field wide-2">Nombre *
            <input class="rsv-input" [(ngModel)]="f.name" (blur)="touch('name')" [class.invalid]="bad('name')" [class.inv-ok]="good('name')">
            <span class="kit-error" *ngIf="bad('name')">{{ errors.name }}</span>
            <span class="inv-was" *ngIf="was('name')">Antes: {{ original!.name }}</span></label>
        </div>
        <p class="kit-field">Categoría *</p>
        <div class="inv-chips" role="radiogroup" aria-label="Categoría">
          <button type="button" class="kit-chip" role="radio" *ngFor="let c of cats" [attr.aria-checked]="f.category === c.name" [class.active]="f.category === c.name" [disabled]="!c.inUse && f.category !== c.name" [title]="c.inUse ? '' : 'En pausa: no se usa por ahora'" (click)="setCategory(c.name)">{{ c.name }}{{ c.inUse ? '' : ' · en pausa' }}</button>
          <ng-container *ngIf="!newCat; else catInput"><button type="button" class="kit-chip" *ngIf="svc.canCreate" (click)="newCat = ' '">+ Nueva categoría</button></ng-container>
          <ng-template #catInput>
            <input class="rsv-input pf-cat" [(ngModel)]="newCat" placeholder="Nombre de la categoría" (keydown.enter)="addCategory()" aria-label="Nueva categoría">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="addCategory()" [disabled]="!newCat.trim()">Agregar</button>
          </ng-template>
        </div>
        <label class="kit-field">Descripción<input class="rsv-input" [(ngModel)]="f.description" placeholder="Ej.: para baños de las habitaciones"></label>
      </section>

      <section class="kit-card">
        <h2 class="inv-section-title">Existencias, costos y proveedor</h2>
        <div class="inv-grid">
          <label class="kit-field">Unidad de medida *
            <input class="rsv-input" list="units" [(ngModel)]="f.unit" (blur)="touch('unit')" [class.invalid]="bad('unit')" [class.inv-ok]="good('unit')">
            <datalist id="units"><option *ngFor="let u of units" [value]="u"></option></datalist>
            <span class="kit-error" *ngIf="bad('unit')">{{ errors.unit }}</span></label>
          <label class="kit-field" *ngIf="!original">Cantidad inicial *
            <input class="rsv-input" type="number" min="0" [(ngModel)]="f.initial" (blur)="touch('initial')" [class.invalid]="bad('initial')" [class.inv-ok]="good('initial')">
            <span class="kit-error" *ngIf="bad('initial')">{{ errors.initial }}</span></label>
          <label class="kit-field" *ngIf="original as o">Existencias
            <input class="rsv-input" [value]="qty(o.stock) + ' ' + o.unit" readonly>
            <a class="inv-hint" routerLink="/dashboard/inventory/adjustments">Corregir con un ajuste</a></label>
          <label class="kit-field">Nivel mínimo *
            <input class="rsv-input" type="number" min="0" [(ngModel)]="f.minStock" (blur)="touch('minStock')" [class.invalid]="bad('minStock')">
            <span class="kit-error" *ngIf="bad('minStock')">{{ errors.minStock }}</span>
            <span class="inv-hint" *ngIf="!bad('minStock') && f.minStock !== null">Genera alerta al llegar a {{ qty(+f.minStock) }}</span>
            <span class="inv-was" *ngIf="was('minStock')">Antes: {{ qty(original!.minStock) }}</span></label>
          <label class="kit-field">Ubicación<input class="rsv-input" list="locs" [(ngModel)]="f.location" placeholder="Ej.: Bodega de aseo"><datalist id="locs"><option *ngFor="let l of locations" [value]="l"></option></datalist></label>
          <label class="kit-field wide-2">Proveedor habitual
            <select class="rsv-input" [(ngModel)]="f.supplierId">
              <option [ngValue]="null">{{ suppliers.length ? 'Sin proveedor fijo' : 'Aún no hay proveedores (se registran en Entradas)' }}</option>
              <option *ngFor="let s of suppliers" [ngValue]="s.id">{{ s.name }} · {{ s.docType }} {{ s.docNumber }}</option>
            </select>
            <span class="inv-was" *ngIf="was('supplierId')">Antes: {{ original!.supplier || 'sin proveedor' }}</span></label>
          <label class="kit-field">Costo unitario {{ costRequired ? '*' : '' }}
            <input class="rsv-input" type="number" min="0" step="100" [(ngModel)]="f.unitCost" (blur)="touch('unitCost')" [class.invalid]="bad('unitCost')" [class.inv-ok]="good('unitCost')">
            <span class="kit-error" *ngIf="bad('unitCost')">{{ errors.unitCost }}</span>
            <span class="inv-was" *ngIf="was('unitCost')">Antes: {{ money(original!.unitCost) }}</span></label>
          <label class="kit-field">Precio de referencia
            <input class="rsv-input" type="number" min="0" step="100" [(ngModel)]="f.refPrice" placeholder="Solo si se cobra (p. ej. daño)" [class.invalid]="bad('refPrice')">
            <span class="kit-error" *ngIf="bad('refPrice')">{{ errors.refPrice }}</span></label>
        </div>
        <div class="pf-expiry">
          <label class="kit-toggle"><input type="checkbox" [(ngModel)]="f.tracksExpiry"><i></i></label>
          <div><strong>Controlar fecha de vencimiento</strong><small>Genera alerta {{ svc.config.expiryDays }} días antes</small></div>
          <input *ngIf="f.tracksExpiry" class="rsv-input pf-date" type="date" [(ngModel)]="f.expiryDate" (blur)="touch('expiryDate')" [class.invalid]="bad('expiryDate')" aria-label="Fecha de vencimiento">
        </div>
        <span class="kit-error" *ngIf="bad('expiryDate')">{{ errors.expiryDate }}</span>
      </section>

      <section class="kit-card" id="movimientos" *ngIf="original">
        <h2 class="kit-card-title">Movimientos del producto</h2>
        <div class="kit-table-wrap">
          <table class="kit-table">
            <thead><tr><th>Movimiento</th><th>Fecha</th><th>Tipo</th><th class="r">Cantidad</th><th class="r">Antes</th><th class="r">Después</th><th>Usuario</th></tr></thead>
            <tbody>
              <tr *ngFor="let x of moves">
                <td class="kit-code">{{ x.m.number }}</td><td>{{ dm(x.m.date) }} {{ x.m.time }}</td>
                <td>{{ x.m.kind }} · {{ x.line.reason || x.m.reason }}<small class="inv-sub" *ngIf="x.line.note">{{ x.line.note }}</small></td>
                <td class="r" [class.inv-green]="x.line.qty > 0" [class.inv-red]="x.line.qty < 0">{{ x.line.qty > 0 ? '+' : '' }}{{ qty(x.line.qty) }}</td>
                <td class="r">{{ qty(x.line.before) }}</td><td class="r"><strong>{{ qty(x.line.after) }}</strong></td><td class="kit-muted">{{ x.m.user }}</td>
              </tr>
              <tr *ngIf="!moves.length"><td colspan="7" class="kit-empty">Sin movimientos registrados.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="kit-aside">
      <section class="kit-card" *ngIf="!original">
        <h2 class="kit-card-title">Validación</h2>
        <p class="inv-check" *ngFor="let c of checks" [class.ok]="c.ok" [class.bad]="!c.ok">
          <svg *ngIf="c.ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
          <svg *ngIf="!c.ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ c.label }}<small *ngIf="!c.ok && c.detail">{{ c.detail }}</small></span>
        </p>
      </section>
      <section class="kit-card" *ngIf="!original">
        <h2 class="kit-card-title">Al guardar</h2>
        <div class="kit-sum"><span>Existencias iniciales</span><strong>{{ qty(+(f.initial ?? 0)) }} {{ f.unit }}</strong></div>
        <div class="kit-sum"><span>Valor inicial</span><strong>{{ money(+(f.initial ?? 0) * +(f.unitCost ?? 0)) }}</strong></div>
        <div class="kit-sum"><span>Movimiento</span><strong class="kit-mono">{{ +(f.initial ?? 0) > 0 ? svc.previewNumber('Inicial') : 'Sin movimiento' }}</strong></div>
        <p class="inv-hint">Disponible de inmediato en Reportes y Contabilidad. Se registran fecha, hora y usuario. Si aún no conoces la cantidad, deja 0 y cárgala con el conteo físico.</p>
      </section>
      <section class="kit-card" *ngIf="original as o">
        <h2 class="kit-card-title">Historial de modificaciones</h2>
        <ul class="pf-timeline"><li *ngFor="let h of o.history.slice(0, 8)"><strong>{{ h.text }}</strong><span>{{ dm(h.at) }}/{{ h.at.slice(0, 4) }} · {{ h.by }}</span></li></ul>
      </section>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="confirming" (click)="confirming = false">
    <div class="rsv-modal pf-modal" role="dialog" aria-modal="true" aria-labelledby="pf-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="pf-title">Confirma los cambios de {{ original!.code }}</h2>
      <p class="rsv-modal-desc">{{ original!.name }} · se guardará el valor anterior en el historial.</p>
      <table class="kit-table">
        <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead>
        <tbody><tr *ngFor="let d of diffs"><td><strong>{{ d.field }}</strong></td><td><s class="kit-muted">{{ d.before || '—' }}</s></td><td><b class="pf-new">{{ d.after || '—' }}</b></td></tr></tbody>
      </table>
      <p class="kit-banner kit-banner--info pf-note">Los cambios se reflejan de inmediato en Reportes y Contabilidad.{{ alertNote }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirming = false">Seguir editando</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="saving" (click)="commit()">Confirmar y guardar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .wide-2 { grid-column: span 2; }
    .pf-cat { width: 200px; height: 34px; }
    .pf-expiry { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #E6EBF2; border-radius: 10px; flex-wrap: wrap; }
    .pf-expiry div { flex: 1; min-width: 180px; }
    .pf-expiry strong { display: block; font-size: 12.5px; color: #0A2540; }
    .pf-expiry small { font-size: 11px; color: #6B7280; }
    .pf-date { width: 170px; }
    .pf-timeline { list-style: none; margin: 0; padding: 0; }
    .pf-timeline li { position: relative; padding: 0 0 12px 18px; font-size: 12px; }
    .pf-timeline li::before { content: ''; position: absolute; left: 0; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: #94A3B8; }
    .pf-timeline li:first-child::before { background: #0B6FD0; }
    .pf-timeline strong { display: block; color: #0A2540; }
    .pf-timeline span { color: #6B7280; font-size: 11.5px; }
    .pf-modal { max-width: 560px; }
    .pf-modal .rsv-modal-title, .pf-modal .rsv-modal-desc { text-align: left; }
    .pf-new { color: #0B6FD0; }
    .pf-note { margin: 14px 0 0; font-size: 12px; }
    @media (max-width: 700px) { .wide-2 { grid-column: auto; } }
  `],
})
export class ProductFormComponent implements AfterViewInit {
  readonly units = UNITS;
  readonly money = fmtMoney;
  readonly qty = fmtQty;

  original?: Product;
  f!: Form;
  private initial!: Form;
  newCat = '';
  touched: Partial<Record<Key, boolean>> = {};
  tried = false;
  confirming = false;
  saving = false;
  saved = '';
  failMsg = '';
  moves: { m: Movement; line: MovementLine }[] = [];

  constructor(public svc: InventoryService, route: ActivatedRoute, private router: Router, private host: ElementRef<HTMLElement>) {
    const id = route.snapshot.paramMap.get('id');
    this.original = id ? svc.getProduct(id) : undefined;
    if (id && !this.original) { router.navigate(['/dashboard/inventory']); return; }
    this.f = this.original ? this.fromProduct(this.original) : this.blank();
    this.initial = { ...this.f };
    if (this.original) this.moves = svc.movementsFor(this.original.id);
  }

  // Categorías, proveedores y ubicaciones salen de la base de datos
  get cats(): Category[] { return this.svc.getCategories(); }
  get suppliers(): Supplier[] { return this.svc.supplierList(); }
  get locations(): string[] { return this.svc.locations(); }
  /** El costo es obligatorio si entra mercancía al registrar (cantidad inicial mayor que 0). */
  get costRequired(): boolean { return !this.original && +(this.f.initial ?? 0) > 0; }

  ngAfterViewInit(): void {
    // "Ver historial" llega con #movimientos
    if (location.hash === '#movimientos') setTimeout(() => this.host.nativeElement.querySelector('#movimientos')?.scrollIntoView({ behavior: 'smooth' }));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.confirming = false; }

  get dup(): Product | undefined { return this.original ? undefined : this.svc.findByCode(this.f.code); }
  get suggested(): string { return this.svc.nextCode(this.f.category); }

  get errors(): Partial<Record<Key, string>> {
    const f = this.f, e: Partial<Record<Key, string>> = {};
    if (!this.original) {
      const cat = this.cats.find(c => c.name === f.category);
      if (!f.code.trim()) e.code = 'Campo obligatorio';
      else if (this.dup) e.code = 'Código duplicado';
      else if (!new RegExp(`^${cat?.prefix}-\\d{3}$`, 'i').test(f.code.trim())) e.code = `Usa el formato ${cat?.prefix}-000`;
      if (cat && !cat.inUse) e.category = `${cat.name} está en pausa: no se usa por ahora`;
    }
    if (f.name.trim().length < 3) e.name = 'Campo obligatorio';
    else if (this.svc.findByName(f.name, this.original?.id)) e.name = `Ya existe «${this.svc.findByName(f.name, this.original?.id)!.name}» (${this.svc.findByName(f.name, this.original?.id)!.code})`;
    if (!f.category) e.category = 'Elige una categoría';
    if (!f.unit.trim()) e.unit = 'Campo obligatorio';
    const initial = +(f.initial ?? NaN);
    if (!this.original && (f.initial === null || `${f.initial}` === '' || !(initial >= 0))) e.initial = 'Campo obligatorio (0 o más)';
    else if (!this.original && !allowsFraction(f.unit) && !Number.isInteger(initial)) e.initial = 'Esta unidad se cuenta en enteros';
    if (f.minStock === null || `${f.minStock}` === '' || +f.minStock < 0) e.minStock = 'Campo obligatorio (0 o más)';
    if (this.costRequired && !(+(f.unitCost ?? 0) > 0)) e.unitCost = 'Indica el costo de lo que entra';
    else if (f.unitCost !== null && `${f.unitCost}` !== '' && +f.unitCost < 0) e.unitCost = 'No puede ser negativo';
    if (f.refPrice !== null && `${f.refPrice}` !== '' && +f.refPrice <= 0) e.refPrice = 'Déjalo vacío si no se cobra';
    if (f.tracksExpiry && !f.expiryDate) e.expiryDate = 'Indica la fecha de vencimiento';
    else if (f.tracksExpiry && !this.original && f.expiryDate < isoDate(0)) e.expiryDate = 'La fecha ya pasó';
    return e;
  }

  get errorCount(): number { return Object.keys(this.errors).length; }

  get checks() {
    const e = this.errors;
    return [
      { label: 'Código único', ok: !e.code, detail: this.dup ? `${this.f.code.toUpperCase()} ya existe` : e.code },
      { label: 'Nombre', ok: !e.name, detail: e.name }, { label: 'Categoría en uso', ok: !e.category, detail: e.category }, { label: 'Unidad de medida', ok: !e.unit },
      { label: 'Cantidad inicial', ok: !e.initial, detail: e.initial }, { label: 'Costo unitario', ok: !e.unitCost, detail: e.unitCost },
    ];
  }

  get diffs(): { field: string; before: string; after: string }[] {
    if (!this.original) return [];
    const show = (k: Key, v: unknown) => v === null || v === '' ? '' : k === 'unitCost' || k === 'refPrice' ? this.money(+(v as number))
      : k === 'supplierId' ? (this.suppliers.find(s => s.id === v)?.name ?? '')
      : k === 'tracksExpiry' ? (v ? 'Sí' : 'No') : k === 'expiryDate' ? `${String(v).slice(8)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : String(v);
    return (Object.keys(LABELS) as Key[]).filter(k => String(this.f[k] ?? '') !== String(this.initial[k] ?? ''))
      .map(k => ({ field: LABELS[k]!, before: show(k, this.initial[k]), after: show(k, this.f[k]) }));
  }

  /** Cómo queda la alerta de stock bajo con el nuevo mínimo. */
  get alertNote(): string {
    const o = this.original!, min = +(this.f.minStock ?? 0);
    if (min === o.minStock || !o.counted) return '';
    const low = o.stock <= min;
    return ` Con el nuevo mínimo, la alerta de stock bajo ${low ? (o.stock <= o.minStock ? 'sigue activa' : 'se activa') : o.stock <= o.minStock ? 'se cierra' : 'no aplica'} (${fmtQty(o.stock)} de ${fmtQty(min)}).`;
  }

  touch(k: Key): void { this.touched[k] = true; }
  bad(k: Key): boolean { return !!this.errors[k] && (this.tried || !!this.touched[k]); }
  good(k: Key): boolean { return !this.errors[k] && !!this.touched[k]; }
  was(k: Key): boolean { return !!this.original && String(this.f[k] ?? '') !== String(this.initial[k] ?? ''); }
  dm(iso: string): string { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }

  setCategory(c: string): void {
    const autoCode = !this.original && (!this.f.code || this.f.code === this.svc.nextCode(this.f.category));
    this.f.category = c;
    if (autoCode) this.f.code = this.svc.nextCode(c);
  }

  async addCategory(): Promise<void> {
    this.failMsg = '';
    try {
      const cat = await this.svc.addCategory(this.newCat);
      this.newCat = '';
      this.setCategory(cat.name);
    } catch (e) {
      this.failMsg = serverError(e, 'crear la categoría');
    }
  }

  async save(): Promise<void> {
    this.tried = true;
    if (this.errorCount || this.saving) return;
    if (this.original) { this.confirming = true; return; }
    this.saving = true;
    this.failMsg = '';
    try {
      const { product } = await this.svc.createProduct(this.toData(), +(this.f.initial ?? 0));
      this.router.navigate(['/dashboard/inventory'], { queryParams: { producto: product.id } });
    } catch (e) {
      this.failMsg = serverError(e, 'registrar el producto');
    } finally {
      this.saving = false;
    }
  }

  async commit(): Promise<void> {
    const summary = this.diffs.map(d => `${d.field} ${d.before || '—'} → ${d.after || '—'}`);
    this.saving = true;
    this.failMsg = '';
    try {
      await this.svc.updateProduct(this.original!.id, this.toData(), summary);
      this.confirming = false;
      this.original = this.svc.getProduct(this.original!.id);
      this.f = this.fromProduct(this.original!);
      this.initial = { ...this.f };
      this.saved = `${this.original!.code} actualizado · ${summary.length} cambio${summary.length === 1 ? '' : 's'} en el historial.`;
    } catch (e) {
      this.confirming = false;
      this.failMsg = serverError(e, 'guardar los cambios');
    } finally {
      this.saving = false;
    }
  }

  private toData(): NewProduct {
    const f = this.f;
    const supplier = this.suppliers.find(s => s.id === f.supplierId);
    return {
      code: f.code.trim().toUpperCase(), name: f.name.trim(), category: f.category, description: f.description.trim(), unit: f.unit.trim(),
      minStock: +(f.minStock ?? 0), location: f.location.trim(), supplierId: f.supplierId, supplier: supplier?.name ?? '', unitCost: Math.round(+(f.unitCost ?? 0)),
      refPrice: f.refPrice === null || `${f.refPrice}` === '' ? null : Math.round(+f.refPrice), tracksExpiry: f.tracksExpiry, expiryDate: f.tracksExpiry ? f.expiryDate : '',
    };
  }

  private blank(): Form {
    const cat = this.svc.getCategories().find(c => c.inUse)?.name ?? '';
    return { code: cat ? this.svc.nextCode(cat) : '', name: '', category: cat, description: '', unit: 'und', initial: null, minStock: null,
      location: '', supplierId: null, unitCost: null, refPrice: null, tracksExpiry: false, expiryDate: '' };
  }

  private fromProduct(p: Product): Form {
    return { code: p.code, name: p.name, category: p.category, description: p.description, unit: p.unit, initial: null, minStock: p.minStock,
      location: p.location, supplierId: p.supplierId, unitCost: p.unitCost, refPrice: p.refPrice, tracksExpiry: p.tracksExpiry, expiryDate: p.expiryDate };
  }
}
