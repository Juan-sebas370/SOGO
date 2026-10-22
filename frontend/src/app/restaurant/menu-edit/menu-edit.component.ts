import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RestaurantService } from '../restaurant.service';
import { MenuProduct, MenuCategory, MENU_CATEGORIES } from '../restaurant.model';
import { ProductIconComponent } from '../product-icon.component';
import { fmtMoney } from '../../reservations/reservation-format';
import { dayTime, stamp } from '../restaurant-format';

interface Form {
  name: string; category: MenuCategory; price: number | null; description: string;
  details: string;               // "ingrediente, ingrediente · observaciones"
  available: boolean; stock: number | null; minStock: number | null;
}

const EMPTY: Form = { name: '', category: 'Almuerzos', price: null, description: '', details: '', available: true, stock: 0, minStock: 5 };

@Component({
  selector: 'app-menu-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductIconComponent],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', './menu-edit.component.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/restaurant">Restaurante</a><span>/</span><span>Actualizar menú</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Actualizar menú</h1>
      <p class="kit-sub">Modifica productos, precios y disponibilidad. Los cambios se reflejan de inmediato en pedidos y ventas.</p>
    </div>
    <button type="button" class="rsv-btn rsv-btn--primary" (click)="startNew()">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Nuevo producto
    </button>
  </header>

  <div class="kit-banner kit-banner--ok" *ngIf="saved" role="status">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
    <div>{{ saved }}</div>
  </div>

  <div class="kit-layout med-layout">
    <section class="kit-card">
      <div class="med-filters">
        <div class="kit-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" [(ngModel)]="search" placeholder="Buscar producto..." aria-label="Buscar producto">
        </div>
        <label class="kit-select"><span>Categoría</span>
          <select [(ngModel)]="category"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select>
        </label>
      </div>
      <div class="kit-table-wrap">
        <table class="kit-table">
          <thead><tr><th>Producto</th><th>Categoría</th><th class="r">Precio</th><th>Disponible</th><th>Última actualización</th></tr></thead>
          <tbody>
            <tr *ngFor="let p of visible" class="clickable" [class.selected]="editing?.id === p.id" (click)="edit(p)" tabindex="0" (keydown.enter)="edit(p)">
              <td><div class="kit-prod"><app-product-icon [category]="p.category" size="sm"></app-product-icon>
                <div><strong>{{ p.name }}</strong><small class="kit-mono">{{ p.code }}</small></div></div></td>
              <td>{{ p.category }}</td>
              <td class="r"><strong>{{ money(p.price) }}</strong></td>
              <td (click)="$event.stopPropagation()">
                <label class="kit-toggle" [title]="p.stock <= 0 ? 'Sin existencias: se activa al reabastecer' : ''">
                  <input type="checkbox" [checked]="p.available" (change)="toggle(p, $event)" [attr.aria-label]="'Disponible: ' + p.name">
                  <i></i>
                </label>
              </td>
              <td class="kit-muted">{{ dayTime(p.updatedAt) }} · {{ p.updatedBy }}</td>
            </tr>
            <tr *ngIf="!visible.length"><td colspan="5" class="kit-empty">No hay productos con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="kit-aside" *ngIf="panelOpen">
      <form class="kit-card med-panel" (ngSubmit)="save()" novalidate>
        <div class="med-panel-head">
          <app-product-icon [category]="form.category"></app-product-icon>
          <div>
            <span>{{ editing ? 'Editando · ' + editing.code : 'Nuevo producto · ' + nextCode }}</span>
            <h2>{{ form.name || 'Sin nombre' }}</h2>
          </div>
          <button type="button" class="med-close" (click)="closePanel()" aria-label="Cerrar">×</button>
        </div>

        <div class="kit-banner kit-banner--danger med-errors" *ngIf="showErrors && errorCount" role="alert">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div><b>No se puede guardar:</b> revisa {{ errorCount }} campo{{ errorCount === 1 ? '' : 's' }}.</div>
        </div>

        <label class="kit-field">Nombre *
          <input class="rsv-input" name="name" [(ngModel)]="form.name" (blur)="touched.name = true" [class.invalid]="err('name')">
          <span class="kit-error" *ngIf="err('name')">{{ errors.name }}</span>
        </label>
        <div class="kit-row2">
          <label class="kit-field">Categoría *
            <select class="rsv-input" name="category" [(ngModel)]="form.category"><option *ngFor="let c of categories">{{ c }}</option></select>
          </label>
          <label class="kit-field">Precio (COP) *
            <input class="rsv-input" name="price" type="number" step="500" [(ngModel)]="form.price" (blur)="touched.price = true" [class.invalid]="err('price')">
            <span class="kit-error" *ngIf="err('price')">{{ errors.price }}</span>
          </label>
        </div>
        <label class="kit-field">Descripción *
          <textarea class="rsv-input" name="description" rows="3" [(ngModel)]="form.description" (blur)="touched.description = true" [class.invalid]="err('description')"></textarea>
          <span class="kit-error" *ngIf="err('description')">{{ errors.description }}</span>
        </label>
        <label class="kit-field">Ingredientes / observaciones
          <input class="rsv-input" name="details" [(ngModel)]="form.details" placeholder="Trucha, ajo, mantequilla · contiene lácteos">
          <span class="kit-muted med-hint">Separa ingredientes con comas y las observaciones con « · ».</span>
        </label>
        <div class="kit-row2">
          <label class="kit-field">Existencias (porciones)
            <input class="rsv-input" name="stock" type="number" min="0" [(ngModel)]="form.stock" (blur)="touched.stock = true" [class.invalid]="err('stock')">
            <span class="kit-error" *ngIf="err('stock')">{{ errors.stock }}</span>
          </label>
          <label class="kit-field">Mínimo
            <input class="rsv-input" name="minStock" type="number" min="0" [(ngModel)]="form.minStock" (blur)="touched.minStock = true" [class.invalid]="err('minStock')">
            <span class="kit-error" *ngIf="err('minStock')">{{ errors.minStock }}</span>
          </label>
        </div>
        <label class="med-available">
          <span><strong>Disponible para la venta</strong><small>Si se desactiva, no se podrá seleccionar en los pedidos</small></span>
          <span class="kit-toggle"><input type="checkbox" name="available" [(ngModel)]="form.available"><i></i></span>
        </label>

        <div class="med-history" *ngIf="editing">
          <h3>Historial de cambios</h3>
          <p *ngFor="let h of editing.history.slice(0, 4)">{{ stamp(h.at).split(' · ')[0] }} · {{ h.text }} · {{ h.by }}</p>
          <p class="kit-muted">Los pedidos y ventas ya registrados conservan su precio original.</p>
        </div>

        <div class="med-buttons">
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="closePanel()">Cancelar</button>
          <button type="submit" class="rsv-btn rsv-btn--primary" [disabled]="(showErrors && errorCount > 0) || !dirty">{{ editing ? 'Guardar cambios' : 'Crear producto' }}</button>
        </div>
      </form>
    </aside>
  </div>
  `,
})
export class MenuEditComponent {
  readonly categories = MENU_CATEGORIES;
  readonly money = fmtMoney;
  readonly dayTime = dayTime;
  readonly stamp = stamp;

  products: MenuProduct[] = [];
  search = '';
  category: MenuCategory | '' = '';
  editing?: MenuProduct;
  panelOpen = false;
  form: Form = { ...EMPTY };
  private initial = JSON.stringify(EMPTY);
  touched: Partial<Record<keyof Form, boolean>> = {};
  submitted = false;
  saved = '';

  constructor(private svc: RestaurantService) {
    svc.getProducts().subscribe(list => {
      this.products = list;
      if (this.editing) this.editing = list.find(p => p.id === this.editing!.id);
    });
    const trucha = this.products.find(p => p.id === 'ALM-02');
    if (trucha) this.edit(trucha);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closePanel(); }

  get visible(): MenuProduct[] {
    const q = this.search.trim().toLowerCase();
    return this.products.filter(p => (!this.category || p.category === this.category)
      && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q)));
  }

  get nextCode(): string { return this.svc.nextCode(this.form.category); }

  get errors(): Partial<Record<keyof Form, string>> {
    const f = this.form;
    const e: Partial<Record<keyof Form, string>> = {};
    const name = f.name.trim().toLowerCase();
    if (!name) e.name = 'El nombre es obligatorio';
    else if (this.products.some(p => p.id !== this.editing?.id && p.name.toLowerCase() === name)) e.name = 'Ya existe un producto con este nombre';
    if (f.price === null || f.price === undefined || `${f.price}` === '') e.price = 'El precio es obligatorio';
    else if (f.price <= 0) e.price = 'El precio debe ser mayor que 0';
    else if (!Number.isInteger(+f.price)) e.price = 'Usa un valor en pesos sin decimales';
    if (!f.description.trim()) e.description = 'La descripción es obligatoria';
    if (f.stock === null || f.stock < 0 || !Number.isInteger(+f.stock)) e.stock = 'Número entero, 0 o más';
    if (f.minStock === null || f.minStock < 0 || !Number.isInteger(+f.minStock)) e.minStock = 'Número entero, 0 o más';
    return e;
  }

  get errorCount(): number { return Object.keys(this.errors).length; }
  get showErrors(): boolean { return this.submitted || Object.values(this.touched).some(Boolean); }
  get dirty(): boolean { return JSON.stringify(this.form) !== this.initial; }

  err(k: keyof Form): boolean { return !!this.errors[k] && (this.submitted || !!this.touched[k]); }

  edit(p: MenuProduct): void {
    this.editing = p;
    const details = [p.ingredients.join(', '), p.observations].filter(Boolean).join(' · ');
    this.load({ name: p.name, category: p.category, price: p.price, description: p.description, details, available: p.available, stock: p.stock, minStock: p.minStock });
  }

  startNew(): void {
    this.editing = undefined;
    this.load({ ...EMPTY, category: this.category || 'Almuerzos' });
  }

  private load(f: Form): void {
    this.form = { ...f };
    this.initial = JSON.stringify(this.form);
    this.touched = {};
    this.submitted = false;
    this.panelOpen = true;
    this.saved = '';
  }

  closePanel(): void {
    this.panelOpen = false;
    this.editing = undefined;
  }

  save(): void {
    this.submitted = true;
    if (this.errorCount || !this.dirty) return;
    const f = this.form;
    const [ingredients = '', ...obs] = f.details.split('·').map(s => s.trim());
    const product = this.svc.saveProduct(this.editing?.id ?? null, {
      name: f.name.trim(), category: f.category, price: Math.round(+f.price!), description: f.description.trim(),
      ingredients: ingredients.split(',').map(s => s.trim()).filter(Boolean), observations: obs.join(' · '),
      available: f.available && +f.stock! > 0, stock: +f.stock!, minStock: +f.minStock!,
    });
    const msg = `${product.name} ${this.editing ? 'actualizado' : 'creado'}${f.available && +f.stock! <= 0 ? ' · queda no disponible hasta tener existencias' : ''}.`;
    this.edit(product);
    this.saved = msg;
  }

  toggle(p: MenuProduct, e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.checked && p.stock <= 0) {
      // Sin existencias no se puede vender: se abre la ficha para registrarlas
      input.checked = false;
      this.edit(p);
      this.form.available = true;
      this.saved = `${p.name} no tiene existencias: registra las porciones disponibles y guarda para activarlo.`;
      return;
    }
    this.svc.setAvailable(p.id, input.checked);
    this.saved = `${p.name} ${input.checked ? 'activado' : 'desactivado'} para la venta.`;
  }
}
