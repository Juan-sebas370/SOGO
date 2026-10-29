import { Component, OnDestroy } from '@angular/core';
import { ReportNavComponent } from '../report-nav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportsService, ReportModule, SavedFilter } from '../reports.service';
import { Range, money, pct, num, dmy, dm, rangeLabel } from '../reports.model';
import { CHANNELS, isVoid, lodgingLabel, totalAmount } from '../../reservations/reservation.model';
import { productStatus, fmtQty } from '../../inventory/inventory.model';
import { ENTRY_KINDS, entryTotal } from '../../accounting/accounting.model';
import { EXPENSE_CATEGORIES as ACC_EXPENSES, INCOME_CATEGORIES as ACC_INCOME } from '../../accounting/accounting-config';
import { AREAS as PAYROLL_AREAS } from '../../payroll/payroll.model';
import { downloadCsvFile } from '../../shared/documents';

interface Field { key: string; label: string; kind: 'radio' | 'select'; options: string[]; }
interface Def { module: string; perm: ReportModule; dates: string; fields: Field[]; value: string; columns: { label: string; right?: boolean }[]; }
interface Row { cells: string[]; link?: string[]; }
interface Kpi { label: string; value: string; sub: string; }
interface Result { rows: Row[]; kpis: Kpi[]; total: number; }

const DEFS: Def[] = [
  { module: 'Reservas', perm: 'Reservas', dates: 'Fecha de llegada', value: 'Valor de la reserva',
    fields: [
      { key: 'type', label: 'Tipo de unidad', kind: 'radio', options: ['Habitación', 'Piso', 'Casa completa'] },
      { key: 'channel', label: 'Canal', kind: 'select', options: CHANNELS },
      { key: 'status', label: 'Estado', kind: 'select', options: ['Confirmada', 'Pendiente', 'Finalizada', 'Cancelada', 'No presentada'] },
    ],
    columns: [{ label: 'Código' }, { label: 'Huésped' }, { label: 'Unidad' }, { label: 'Estadía' }, { label: 'Noches', right: true }, { label: 'Valor', right: true }] },
  { module: 'Inventario', perm: 'Inventario', dates: '', value: 'Valor en existencias',
    fields: [
      { key: 'status', label: 'Estado', kind: 'radio', options: ['Agotado', 'Stock bajo', 'Por vencer', 'Disponible'] },
      { key: 'category', label: 'Categoría', kind: 'select', options: [] },
      { key: 'location', label: 'Ubicación', kind: 'select', options: [] },
    ],
    columns: [{ label: 'Código' }, { label: 'Producto' }, { label: 'Categoría' }, { label: 'Existencias', right: true }, { label: 'Estado' }, { label: 'Valor', right: true }] },
  { module: 'Contable', perm: 'Contable', dates: 'Fecha del movimiento', value: 'Valor del movimiento',
    fields: [
      { key: 'kind', label: 'Tipo', kind: 'select', options: ENTRY_KINDS },
      { key: 'category', label: 'Categoría', kind: 'select', options: [...ACC_INCOME.map(c => c.name), ...ACC_EXPENSES.map(c => c.name)] },
      { key: 'origin', label: 'Origen', kind: 'select', options: ['Manual', 'Reservas', 'Facturación', 'Nómina', 'Inventarios'] },
    ],
    columns: [{ label: 'Número' }, { label: 'Fecha' }, { label: 'Concepto' }, { label: 'Tipo' }, { label: 'Origen' }, { label: 'Valor', right: true }] },
  { module: 'Nómina', perm: 'Nómina', dates: 'Período liquidado', value: 'Neto a pagar',
    fields: [
      { key: 'area', label: 'Área', kind: 'select', options: PAYROLL_AREAS },
      { key: 'contract', label: 'Contrato', kind: 'select', options: ['Término indefinido', 'Término fijo', 'Obra o labor', 'Aprendizaje'] },
    ],
    columns: [{ label: 'Período' }, { label: 'Empleado' }, { label: 'Cargo' }, { label: 'Área' }, { label: 'Devengado', right: true }, { label: 'Neto', right: true }] },
];

const PAGE = 6;

@Component({
  selector: 'app-reports-filter',
  standalone: true,
  imports: [ReportNavComponent, CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../reports.css'],
  template: `
  <rp-nav></rp-nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Filtrar información estadística</h1>
      <p class="kit-sub">Combina filtros para consultar solo lo que necesitas · los resultados se actualizan al aplicar.</p>
    </div>
    <div class="kit-actions">
      <button type="button" class="rsv-btn rsv-btn--outline" (click)="saving = true; saveName = ''">Guardar filtro</button>
      <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!svc.canExport() || !result.rows.length" (click)="export()">Exportar resultados</button>
    </div>
  </header>

  <div class="fl-layout">
    <aside class="kit-card fl-filters" aria-label="Filtros">
      <h2 class="kit-card-title">Filtros</h2>
      <label class="kit-select"><span>Módulo</span><select [(ngModel)]="draft.module" (ngModelChange)="onModule()"><option *ngFor="let d of defs" [value]="d.module">{{ d.module }}</option></select></label>
      <ng-container *ngIf="def(draft.module).dates as dl">
        <p class="fl-label">{{ dl }}</p>
        <div class="fl-dates">
          <label class="kit-select"><span>Desde</span><input type="date" [(ngModel)]="draft.from" [max]="draft.to"></label>
          <label class="kit-select"><span>Hasta</span><input type="date" [(ngModel)]="draft.to" [min]="draft.from"></label>
        </div>
      </ng-container>
      <ng-container *ngFor="let fd of def(draft.module).fields">
        <ng-container *ngIf="fd.kind === 'radio'">
          <p class="fl-label">{{ fd.label }}</p>
          <label class="fl-radio"><input type="radio" [name]="fd.key" value="" [(ngModel)]="draft.values[fd.key]"> Todas</label>
          <label class="fl-radio" *ngFor="let o of options(fd)"><input type="radio" [name]="fd.key" [value]="o" [(ngModel)]="draft.values[fd.key]"> {{ o }}</label>
        </ng-container>
        <label class="kit-select fl-mt" *ngIf="fd.kind === 'select'"><span>{{ fd.label }}</span>
          <select [(ngModel)]="draft.values[fd.key]"><option value="">Todos</option><option *ngFor="let o of options(fd)">{{ o }}</option></select></label>
      </ng-container>
      <p class="fl-label">{{ def(draft.module).value }}</p>
      <div class="fl-dates">
        <label class="kit-select"><span>Mínimo</span><input type="number" min="0" [(ngModel)]="draft.min" placeholder="$ 0"></label>
        <label class="kit-select"><span>Máximo</span><input type="number" min="0" [(ngModel)]="draft.max" placeholder="Sin límite"></label>
      </div>
      <p class="kit-error" *ngIf="draftError">{{ draftError }}</p>
      <button type="button" class="rsv-btn rsv-btn--primary fl-btn" [disabled]="!!draftError" (click)="apply()">Aplicar filtros</button>
      <button type="button" class="rsv-btn rsv-btn--outline fl-btn" (click)="resetAll()">Restablecer filtros</button>
    </aside>

    <div class="fl-main">
      <section class="kit-card fl-chips">
        <span class="rp-muted">Filtros activos ({{ chips.length }}):</span>
        <span class="fl-chip" *ngFor="let c of chips">{{ c.label }}<button type="button" *ngIf="c.remove" (click)="c.remove()" [attr.aria-label]="'Quitar ' + c.label">×</button></span>
        <button type="button" class="fl-link" (click)="resetAll()">Restablecer todo</button>
      </section>

      <section class="kit-kpis rp-kpis">
        <div class="rp-kpi" *ngFor="let k of result.kpis"><span>{{ k.label }}</span><strong>{{ k.value }}</strong><small>{{ k.sub }}</small></div>
      </section>

      <section class="kit-card" *ngIf="result.rows.length">
        <div class="rp-card-head"><h2 class="kit-card-title">Resultados</h2><span class="rp-muted">{{ result.rows.length }} registro{{ result.rows.length === 1 ? '' : 's' }} · mostrando {{ pageRows.length }}</span></div>
        <div class="kit-table-wrap">
          <table class="kit-table rp-table">
            <thead><tr><th *ngFor="let c of def(applied.module).columns" [class.r]="c.right">{{ c.label }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of pageRows">
                <td *ngFor="let c of r.cells; let i = index" [class.r]="def(applied.module).columns[i].right">
                  <a *ngIf="i === 0 && r.link; else plain" class="rp-code" [routerLink]="r.link">{{ c }}</a>
                  <ng-template #plain><strong *ngIf="def(applied.module).columns[i].right; else txt">{{ c }}</strong><ng-template #txt>{{ c }}</ng-template></ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav class="rp-pager" *ngIf="pages > 1" aria-label="Páginas">
          <button type="button" *ngFor="let p of pageList" [class.active]="p === page" (click)="page = p">{{ p + 1 }}</button>
          <button type="button" [disabled]="page >= pages - 1" (click)="page = page + 1">Siguiente</button>
        </nav>
      </section>

      <section class="fl-empty" *ngIf="!result.rows.length">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8.5 11h5"/></svg>
        <div><strong>Sin resultados</strong>
          <p>«No hay información para los filtros seleccionados: {{ chipText }}. Quita un filtro o amplía el rango de fechas.»</p></div>
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="resetAll()">Restablecer filtros</button>
      </section>
    </div>

    <aside class="fl-side">
      <section class="kit-card">
        <h2 class="kit-card-title">Filtros guardados</h2>
        <div class="fl-saved" *ngFor="let f of saved">
          <button type="button" (click)="load(f)" [disabled]="!canUse(f.module)"><strong>{{ f.name }}</strong><small>{{ f.module }} · {{ f.createdBy }}{{ canUse(f.module) ? '' : ' · sin permiso' }}</small></button>
          <button type="button" class="fl-del" *ngIf="svc.canDeleteFilter(f)" [disabled]="busy" (click)="remove(f)" [attr.aria-label]="'Eliminar ' + f.name">×</button>
        </div>
        <p class="rp-muted" *ngIf="!saved.length">{{ savedError || (savedLoaded ? 'Aún no hay filtros guardados.' : 'Cargando…') }}</p>
      </section>
      <section class="kit-card">
        <h2 class="kit-card-title">Acceso por rol</h2>
        <p class="rp-muted">Los filtros solo muestran los módulos que tu rol puede consultar (según Usuarios y Roles).</p>
        <div class="kit-table-wrap">
          <table class="fl-access">
            <thead><tr><th>Información</th><th *ngFor="let r of accessRoles">{{ r.short }}</th></tr></thead>
            <tbody><tr *ngFor="let row of access"><td>{{ row.label }}</td><td *ngFor="let c of row.cells" [ngClass]="c.cls">{{ c.text }}</td></tr></tbody>
          </table>
        </div>
        <p class="rp-muted fl-roles">{{ rolesLegend }}. La exportación y el envío de reportes sensibles quedan en auditoría.</p>
      </section>
    </aside>
  </div>

  <div class="rsv-modal-overlay" *ngIf="saving" (click)="saving = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="save-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="save-title">Guardar filtro</h2>
      <p class="rsv-modal-desc">Se guardan el módulo, los filtros y el rango de valores. Las fechas se guardan como «mes en curso» para que el filtro siga sirviendo.</p>
      <label class="kit-field">Nombre *<input class="rsv-input" [(ngModel)]="saveName" maxlength="60" placeholder="Ej.: Booking · habitaciones"></label>
      <p class="kit-error" *ngIf="saveName.trim() && nameTaken">Ya existe un filtro con ese nombre.</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="saving = false">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!saveName.trim() || nameTaken" (click)="save()">Guardar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .fl-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr) 280px; gap: 16px; align-items: start; }
    .fl-filters .kit-select { min-width: 0; }
    .fl-label { margin: 14px 0 6px; font-size: 12.5px; font-weight: 600; color: #374151; }
    .fl-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .fl-radio { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: #1F2937; cursor: pointer; }
    .fl-radio input { accent-color: #1565C0; width: 16px; height: 16px; }
    .fl-mt { margin-top: 10px; }
    .fl-btn { width: 100%; margin-top: 10px; height: 44px; }
    .fl-btn.rsv-btn--primary { margin-top: 16px; }
    .fl-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; padding: 14px 16px; }
    .fl-chip { display: inline-flex; align-items: center; gap: 6px; background: #E3EEFB; color: #0B4A8B; font-size: 12.5px; font-weight: 600; padding: 5px 8px 5px 12px; border-radius: 999px; }
    .fl-chip button { border: none; background: rgba(11,74,139,.14); color: #0B4A8B; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; line-height: 1; padding: 0; }
    .fl-link { margin-left: auto; border: none; background: none; color: #0B6FD0; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .fl-empty { display: flex; align-items: center; gap: 14px; border: 1.5px dashed #D5DEEA; border-radius: 14px; padding: 18px; background: #FAFBFD; }
    .fl-empty svg { width: 26px; height: 26px; flex-shrink: 0; fill: none; stroke: #6B7280; stroke-width: 2; stroke-linecap: round; }
    .fl-empty div { flex: 1; font-size: 13px; }
    .fl-empty p { margin: 4px 0 0; color: #4B5563; font-size: 12.5px; }
    .fl-side { display: flex; flex-direction: column; gap: 14px; }
    .fl-saved { display: flex; align-items: center; border-bottom: 1px solid #EEF1F5; }
    .fl-saved > button:first-child { flex: 1; text-align: left; border: none; background: none; padding: 10px 0; cursor: pointer; font: inherit; }
    .fl-saved > button:first-child:disabled { cursor: not-allowed; opacity: .55; }
    .fl-saved strong { display: block; font-size: 13px; color: #0B4A8B; }
    .fl-saved small { font-size: 11.5px; color: #6B7280; }
    .fl-del { border: none; background: none; color: #9AA5B4; font-size: 16px; cursor: pointer; }
    .fl-access { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    .fl-access th, .fl-access td { padding: 6px 4px; border-bottom: 1px solid #EEF1F5; text-align: center; }
    .fl-access th:first-child, .fl-access td:first-child { text-align: left; }
    .fl-access .yes { color: #1F8A5B; font-weight: 700; }
    .fl-access .no { color: #9AA5B4; }
    .fl-access .ltd { color: #B45309; font-weight: 600; font-size: 10.5px; }
    .fl-roles { margin-top: 10px; line-height: 1.5; }
    @media (max-width: 1250px) { .fl-layout { grid-template-columns: 230px minmax(0, 1fr); } .fl-side { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; } }
    @media (max-width: 820px) { .fl-layout { grid-template-columns: 1fr; } .fl-side { grid-template-columns: 1fr; } }
  `],
})
export class FilterComponent implements OnDestroy {
  defs: Def[];
  draft: { module: string; from: string; to: string; values: Record<string, string>; min: number | null; max: number | null };
  applied: FilterComponent['draft'];
  result: Result = { rows: [], kpis: [], total: 0 };
  chips: { label: string; remove?: () => void }[] = [];
  page = 0;
  saved: SavedFilter[] = [];
  savedLoaded = false;
  savedError = '';
  busy = false;
  saving = false;
  saveName = '';
  access: { label: string; cells: { text: string; cls: string }[] }[] = [];
  accessRoles: { name: string; short: string }[] = [];
  rolesLegend = '';
  private sub: Subscription;

  constructor(public svc: ReportsService) {
    this.defs = DEFS.filter(d => svc.canView(d.perm));
    this.draft = this.blank(this.defs[0]?.module ?? 'Reservas');
    this.applied = clone(this.draft);
    this.reloadSaved();
    this.sub = svc.changes$.subscribe(() => { this.run(); this.buildAccess(); });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  private reloadSaved(): void {
    this.svc.loadFilters()
      .then(l => { this.saved = l; this.savedError = ''; })
      .catch(() => this.savedError = 'No se pudieron cargar los filtros guardados.')
      .finally(() => this.savedLoaded = true);
  }

  def(module: string): Def { return this.defs.find(d => d.module === module) ?? DEFS[0]; }
  canUse(module: string): boolean { return this.defs.some(d => d.module === module); }
  get pages(): number { return Math.ceil(this.result.rows.length / PAGE); }
  get pageList(): number[] { return Array.from({ length: this.pages }, (_, i) => i); }
  get pageRows(): Row[] { return this.result.rows.slice(this.page * PAGE, this.page * PAGE + PAGE); }
  get chipText(): string { return this.chips.slice(1).map(c => c.label).join(' · ') || 'sin filtros'; }
  get nameTaken(): boolean { return this.saved.some(f => f.name.toLowerCase() === this.saveName.trim().toLowerCase()); }
  get draftError(): string {
    const d = this.draft;
    if (this.def(d.module).dates && (!d.from || !d.to || d.from > d.to)) return 'Revisa el rango de fechas.';
    if (d.min !== null && d.max !== null && +d.min > +d.max) return 'El valor mínimo no puede ser mayor que el máximo.';
    return '';
  }

  options(f: Field): string[] {
    if (f.options.length) return f.options;
    const products = this.svc.productList();
    return [...new Set(products.map(p => f.key === 'category' ? p.category : p.location))].sort();
  }

  private blank(module: string): FilterComponent['draft'] {
    const r = this.svc.monthRange(this.svc.livePeriod);
    return { module, from: r.from, to: r.to, values: Object.fromEntries(this.def(module).fields.map(f => [f.key, ''])), min: null, max: null };
  }

  onModule(): void { this.draft = { ...this.blank(this.draft.module), from: this.draft.from, to: this.draft.to }; }

  apply(): void {
    this.applied = clone(this.draft);
    this.page = 0;
    this.run();
    this.svc.log('consulta filtrada', `${this.applied.module} · ${this.chips.slice(1).map(c => c.label).join(' · ') || 'sin filtros'} · ${this.result.rows.length} registros`);
  }

  resetAll(): void {
    this.draft = this.blank(this.defs[0]?.module ?? 'Reservas');
    this.applied = clone(this.draft);
    this.page = 0;
    this.run();
  }

  load(f: SavedFilter): void {
    const b = this.blank(f.module);
    const range = f.range === 'month' ? { from: b.from, to: b.to } : f.range;
    this.draft = { ...b, ...range, values: { ...b.values, ...f.values }, min: f.min ?? null, max: f.max ?? null };
    this.apply();
  }

  async save(): Promise<void> {
    const a = this.applied;
    if (this.busy || !this.saveName.trim() || this.nameTaken) return;
    this.busy = true;
    try {
      const f = await this.svc.saveFilter({ name: this.saveName.trim(), module: a.module, values: Object.fromEntries(Object.entries(a.values).filter(([, v]) => v)), range: 'month', min: a.min, max: a.max });
      this.saved = [f, ...this.saved];
      this.saving = false;
      this.saveName = '';
    } catch { /* el aviso de error lo muestra el interceptor */ } finally { this.busy = false; }
  }

  async remove(f: SavedFilter): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.svc.deleteFilter(f);
      this.saved = this.saved.filter(x => x.id !== f.id);
    } catch { /* aviso del interceptor */ } finally { this.busy = false; }
  }

  export(): void {
    const a = this.applied;
    downloadCsvFile([
      [`Consulta filtrada · ${a.module}`, this.chips.slice(1).map(c => c.label).join(' · ')], [],
      this.def(a.module).columns.map(c => c.label), ...this.result.rows.map(r => r.cells),
    ], `consulta-${a.module.toLowerCase()}-${a.from}_${a.to}.csv`);
    this.svc.log('exportación', `Consulta filtrada ${a.module}.csv · ${this.result.rows.length} registros`);
  }

  private run(): void {
    const a = this.applied;
    const range: Range = { from: a.from, to: a.to };
    const d = this.def(a.module);
    const inValue = (v: number) => (a.min === null || (a.min as unknown) === '' || v >= +a.min) && (a.max === null || (a.max as unknown) === '' || v <= +a.max);
    const v = a.values;
    this.result = this.query(a.module, range, v, inValue);

    // Chips de filtros activos (cada uno se puede quitar)
    const chips: FilterComponent['chips'] = [];
    if (d.dates) chips.push({ label: `${dmy(a.from)} – ${dmy(a.to)}`, remove: () => { const b = this.blank(a.module); this.applied.from = this.draft.from = b.from; this.applied.to = this.draft.to = b.to; this.run(); } });
    chips.unshift({ label: a.module });
    d.fields.filter(f => v[f.key]).forEach(f => chips.push({ label: v[f.key], remove: () => { this.applied.values[f.key] = this.draft.values[f.key] = ''; this.run(); } }));
    if (a.min !== null && (a.min as unknown) !== '') chips.push({ label: `≥ ${money(+a.min)}`, remove: () => { this.applied.min = this.draft.min = null; this.run(); } });
    if (a.max !== null && (a.max as unknown) !== '') chips.push({ label: `≤ ${money(+a.max)}`, remove: () => { this.applied.max = this.draft.max = null; this.run(); } });
    this.chips = chips;
    this.page = Math.min(this.page, Math.max(0, this.pages - 1));
  }

  private query(module: string, range: Range, v: Record<string, string>, inValue: (n: number) => boolean): Result {
    const s = this.svc;
    const inRange = (date: string) => date >= range.from && date <= range.to;
    if (module === 'Reservas') {
      const period = s.reservationList().filter(r => inRange(r.checkIn));
      const list = period.filter(r => (!v['type'] || r.lodgingType === v['type']) && (!v['channel'] || r.channel === v['channel'])
        && (!v['status'] || r.status === v['status']) && inValue(totalAmount(r))).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
      const valid = list.filter(r => !isVoid(r));
      const nights = valid.reduce((t, r) => t + r.nights, 0), value = valid.reduce((t, r) => t + totalAmount(r), 0);
      const lodging = s.financial(range).sources.find(x => x.label === 'Alojamiento')?.value ?? 0;
      return {
        total: list.length,
        kpis: [
          { label: 'Reservas', value: num(list.length), sub: `de ${period.length} en el período` },
          { label: 'Noches', value: num(nights), sub: `Estancia prom. ${num(valid.length ? nights / valid.length : 0, 1)}` },
          { label: 'Valor', value: money(value), sub: lodging ? `${pct(value / lodging * 100)} del alojamiento facturado` : 'Sin ingresos de alojamiento' },
          { label: 'Tarifa prom.', value: money(nights ? valid.reduce((t, r) => t + r.lodgingAmount, 0) / nights : 0), sub: 'Por noche' },
        ],
        rows: list.map(r => ({ cells: [r.code, r.guestName, lodgingLabel(r), `${dm(r.checkIn)} – ${dm(r.checkOut)}`, String(r.nights), money(totalAmount(r))], link: ['/dashboard/reservations', r.id] })),
      };
    }
    if (module === 'Inventario') {
      const all = s.productList();
      const st = (p: typeof all[number]) => productStatus(p, s.today, s.expiryDays);
      const list = all.filter(p => (!v['status'] || st(p) === v['status']) && (!v['category'] || p.category === v['category'])
        && (!v['location'] || p.location === v['location']) && inValue(p.stock * p.unitCost)).sort((a, b) => a.code.localeCompare(b.code));
      return {
        total: list.length,
        kpis: [
          { label: 'Productos', value: num(list.length), sub: `de ${all.length} en el catálogo` },
          { label: 'Valor', value: money(list.reduce((t, p) => t + p.stock * p.unitCost, 0)), sub: 'Al costo promedio' },
          { label: 'Agotados', value: num(list.filter(p => st(p) === 'Agotado').length), sub: 'Sin existencias' },
          { label: 'Por vencer', value: num(list.filter(p => st(p) === 'Por vencer').length), sub: `En ${s.expiryDays} días o menos` },
        ],
        rows: list.map(p => ({ cells: [p.code, p.name, p.category, `${fmtQty(p.stock)} ${p.unit}`, st(p), money(p.stock * p.unitCost)], link: ['/dashboard/inventory/products', p.id] })),
      };
    }
    if (module === 'Contable') {
      const period = s.entries().filter(e => inRange(e.date) && e.status !== 'Borrador' && e.kind !== 'Apertura');
      const list = period.filter(e => (!v['kind'] || e.kind === v['kind']) && (!v['category'] || e.category === v['category'])
        && (!v['origin'] || e.origin === v['origin']) && inValue(entryTotal(e))).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
      const sum = (k: string) => list.filter(e => e.kind === k && e.status !== 'Anulado').reduce((t, e) => t + entryTotal(e), 0);
      return {
        total: list.length,
        kpis: [
          { label: 'Movimientos', value: num(list.length), sub: `de ${period.length} en el período` },
          { label: 'Valor total', value: money(list.filter(e => e.status !== 'Anulado').reduce((t, e) => t + entryTotal(e), 0)), sub: 'Sin anulados' },
          { label: 'Ingresos', value: money(sum('Ingreso') + sum('Venta')), sub: 'Recibos y ventas' },
          { label: 'Egresos', value: money(sum('Egreso')), sub: 'Comprobantes de egreso' },
        ],
        rows: list.map(e => ({ cells: [e.number || 'Provisional', dmy(e.date), e.concept, e.kind, e.origin, money(entryTotal(e))] })),
      };
    }
    // Nómina: líneas de las liquidaciones cuyo período cae en el rango
    const lines = s.periods().filter(p => p >= range.from.slice(0, 7) && p <= range.to.slice(0, 7))
      .flatMap(p => s.payrollSummary(p).lines.map(l => ({ p, l, status: s.payrollSummary(p).status })));
    const list = lines.filter(x => (!v['area'] || x.l.area === v['area']) && (!v['contract'] || x.l.contractType === v['contract']) && inValue(x.l.net));
    return {
      total: list.length,
      kpis: [
        { label: 'Liquidaciones', value: num(list.length), sub: `${new Set(list.map(x => x.l.employeeId)).size} empleados` },
        { label: 'Devengado', value: money(list.reduce((t, x) => t + x.l.totalEarnings, 0)), sub: 'Salario, extras y auxilios' },
        { label: 'Neto', value: money(list.reduce((t, x) => t + x.l.net, 0)), sub: 'Después de deducciones' },
        { label: 'Costo empleador', value: money(list.reduce((t, x) => t + x.l.employer.total + x.l.provisions.total, 0)), sub: 'Aportes y provisiones' },
      ],
      rows: list.map(x => ({ cells: [`${x.p}${x.status === 'Borrador' ? ' (borrador)' : ''}`, x.l.name, x.l.position, x.l.area, money(x.l.totalEarnings), money(x.l.net)] })),
    };
  }

  private buildAccess(): void {
    // Los roles creados en Usuarios y Roles (abreviados en la cabecera de la tabla)
    const roles = this.svc.rolesSnapshot();
    this.accessRoles = roles.map(r => ({ name: r.name, short: r.name.length > 6 ? `${r.name.slice(0, 4)}.` : r.name }));
    this.rolesLegend = this.accessRoles.map(r => `${r.short} ${r.name}`).join(' · ');
    const cell = (ok: boolean) => ok ? { text: '✓', cls: 'yes' } : { text: '—', cls: 'no' };
    const views = (role: string, ms: ReportModule[]) => ms.every(m => this.svc.canView(m, role));
    const rows: { label: string; mods?: ReportModule[]; fn?: (role: string) => { text: string; cls: string } }[] = [
      { label: 'Reservas · TRA', mods: ['Reservas', 'TRA'] }, { label: 'Facturación', mods: ['Facturación'] },
      { label: 'Nómina', mods: ['Nómina'] }, { label: 'Contable', mods: ['Contable'] }, { label: 'Inventario', mods: ['Inventario'] },
      { label: 'Exportar', fn: role => !this.svc.canExport(role) ? cell(false)
          : (['Nómina', 'Contable', 'Inventario', 'Reservas'] as ReportModule[]).every(m => this.svc.canView(m, role)) ? cell(true) : { text: 'Limitado', cls: 'ltd' } },
      { label: 'Programar', fn: role => cell(this.svc.canSchedule(role)) },
    ];
    this.access = rows.map(r => ({ label: r.label, cells: this.accessRoles.map(role => r.fn ? r.fn(role.name) : cell(views(role.name, r.mods!))) }));
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
