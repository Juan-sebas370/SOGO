import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, map, debounceTime, startWith, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, ReservationChannel, isVoid } from '../reservations/reservation.model';
import { RoomService } from '../lodging/room.service';
import { RoomWithStatus } from '../lodging/room.model';
import { ROOMS } from '../lodging/house';
import { TraService, TraRow } from '../tra/tra.service';
import { InvoiceService } from '../billing/invoice.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { isValidInvoice } from '../billing/invoice.model';
import { PayrollService } from '../payroll/payroll.service';
import { PayLine, PayrollRun, runTotals } from '../payroll/payroll.model';
import { AccountingService } from '../accounting/accounting.service';
import { Entry, balances, balanceSheet, isClosing, sumWhere } from '../accounting/accounting.model';
import { InventoryService } from '../inventory/inventory.service';
import { Movement, Product, ProductStatus, productStatus, lineValue } from '../inventory/inventory.model';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { Role, Module, Action } from '../users/users.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { INDICATORS, IndicatorKey, DEFAULT_VIEW } from './indicators';
import {
  Range, OccupancyFilter, OccupancyReport, ReservationStats, occupancy, reservationStats, addDays, daysBetween, monthEnd, shiftMonth,
} from './reports.model';

// ── Tipos de salida ──────────────────────────────────

/** Cifras comparables de un mes, calculadas con los datos registrados en SOGO. `live` = mes en curso (parcial). */
export interface MonthSummary {
  period: string; live: boolean; range: Range;
  occupancy: number; occupied: number; available: number; stays: number; avgStay: number; adr: number; revpar: number;
  reservations: number; byChannel: Record<ReservationChannel, number>; cancelRate: number; leadDays: number;
  income: number; expenses: number; profit: number; margin: number; staffCost: number; staffRatio: number;
  stockValue: number; rotation: number; consumption: number;   // consumo de inventario al costo
  traOnTime: number;                // %
  receivables: number | null;       // cartera: solo existe "hoy"
}

export interface FinancialFilters { category: string; center: string; origin: string; }
export interface FinancialReport {
  income: number; expenses: number; profit: number; margin: number; cashFlow: number; currentRatio: number;
  sources: { label: string; value: number }[];
  categories: { label: string; value: number }[];
  centers: { center: CostCenter; income: number; expenses: number; profit: number; margin: number }[];
}
export type CostCenter = 'Alojamiento' | 'Pasadías y servicios' | 'Administración';
export const COST_CENTERS: CostCenter[] = ['Alojamiento', 'Pasadías y servicios', 'Administración'];

export interface InventoryFilters { category: string; area: string; status: string; }
export interface InventoryReport {
  products: Product[]; stockValue: number; categories: number;
  entries: number; entryCount: number; consumption: number; exitCount: number;
  shrinkage: number; shrinkCount: number; shrinkShare: number;
  rotation: number; coverDays: number;
  byCategory: { category: string; value: number }[];
  byArea: { area: string; value: number; share: number }[];
  top: { name: string; qty: number; unit: string; value: number }[];
  alerts: { product: Product; status: ProductStatus; daily: number; cover: number; expiry: string }[];
}

export interface PayrollSummary { run?: PayrollRun; lines: PayLine[]; net: number; cost: number; employees: number; status: string; }
export interface TraSummary { due: number; reported: number; pending: number; errors: number; }
export interface BillingSummary { receivables: number; overdue: number; annulled: string[]; rejected: number; pendingInvoices: number; }

// ── Categorías contables ─────────────────────────────

export const INCOME_SOURCES: { label: string; test: (c: string) => boolean }[] = [
  { label: 'Alojamiento', test: c => c.startsWith('414005') },
  { label: 'Pasadías y servicios', test: c => c.startsWith('414095') },
  { label: 'Otros ingresos', test: c => c.startsWith('42') },
];
export const EXPENSE_CATEGORIES: { label: string; test: (c: string) => boolean }[] = [
  { label: 'Personal (nómina)', test: c => c.startsWith('5205') },
  { label: 'Costos de prestación de servicios', test: c => c.startsWith('61') },
  { label: 'Servicios', test: c => c.startsWith('5235') },
  { label: 'Mantenimiento', test: c => c.startsWith('5245') || c.startsWith('5250') },
  { label: 'Honorarios', test: c => c.startsWith('5210') },
  { label: 'Depreciaciones', test: c => c.startsWith('5260') || c.startsWith('5265') },
  { label: 'Diversos, seguros y legales', test: c => ['5220', '5225', '5230', '5240', '5255', '5295', '5299'].includes(c.slice(0, 4)) },
  { label: 'Impuestos', test: c => c.startsWith('5215') },
  { label: 'Gastos bancarios', test: c => c.startsWith('5305') },
  { label: 'Pérdidas y otros no operacionales', test: c => c.startsWith('53') && !c.startsWith('5305') },
];

const isIncome = (c: string) => c[0] === '4';
const isExpense = (c: string) => c[0] === '5' || c[0] === '6';

/** Módulos que puede consultar cada rol (según sus permisos en Usuarios y Roles). */
export const REPORT_MODULES = ['Reservas', 'Alojamiento', 'TRA', 'Facturación', 'Nómina', 'Contable', 'Inventario'] as const;
export type ReportModule = typeof REPORT_MODULES[number];
const PERMISSION_OF: Record<ReportModule, Module> = {
  Reservas: 'Reservas', Alojamiento: 'Alojamiento', TRA: 'TRA', Facturación: 'Facturación',
  Nómina: 'Nómina', Contable: 'Contabilidad', Inventario: 'Inventarios',
};

@Injectable({ providedIn: 'root' })
export class ReportsService {

  /** Inicio de SOGO (Contabilidad › Integración): desde ese día hay datos para los reportes. */
  get goLive(): string { return this.accounting.goLive; }
  /** Mes en curso. */
  readonly livePeriod: string;
  /** Primer mes con datos: el del inicio de SOGO. No hay meses «migrados» ni cifras de ejemplo. */
  get firstPeriod(): string { return this.goLive.slice(0, 7); }
  /** Emite cada vez que cambia algún dato de origen. */
  readonly changes$: Observable<number>;

  private traRows: TraRow[] = [];
  private roles: Role[] = [];
  private summaryCache = new Map<string, MonthSummary>();
  private version = 0;

  constructor(
    private reservations: ReservationService,
    private rooms: RoomService,
    private tra: TraService,
    private invoices: InvoiceService,
    private billingConfig: BillingConfigService,
    private payroll: PayrollService,
    private accounting: AccountingService,
    private inventory: InventoryService,
    private users: UsersService,
    private settings: SettingsService,
    private http: HttpClient,
  ) {
    this.livePeriod = accounting.openPeriod;
    tra.getRows().subscribe(r => this.traRows = r);
    users.getRoles().subscribe(r => this.roles = r);
    this.changes$ = combineLatest([
      reservations.getAll(), rooms.getAll(), tra.getRows(), invoices.getAll(),
      payroll.getRuns(), accounting.getEntries(), inventory.getProducts(), inventory.getMovements(),
    ]).pipe(debounceTime(0), map(() => { this.summaryCache.clear(); return ++this.version; }), startWith(this.version));
  }

  get today(): string { return isoDate(0); }
  get company(): string { return this.settings.hotel.commercialName; }
  /** Nombre de quien está en la sesión (para «generado por»). */
  get user(): string { return this.users.actor(); }
  /** Clave de la vista del panel: los roles de la sesión. */
  get role(): string { return [...this.users.sessionRoles()].sort().join('+'); }
  get isAdmin(): boolean { return this.users.sessionRoles().includes('admin'); }

  // ── Datos de origen ──────────────────────────────────

  reservationList(): Reservation[] { return this.reservations.getSnapshot(); }
  roomList(): RoomWithStatus[] { return this.rooms.getSnapshot(); }
  entries(): Entry[] { return this.accounting.snapshot(); }
  /** Comprobantes sin el cierre anual (que deja en cero ingresos y gastos): para medir resultados. */
  operations(): Entry[] { return this.entries().filter(e => !isClosing(e)); }
  traList(): TraRow[] { return this.traRows; }
  productList(): Product[] { return this.inventory.productsSnapshot(); }
  movementList(): Movement[] { return this.inventory.movementsSnapshot(); }
  get expiryDays(): number { return this.inventory.config.expiryDays; }

  /** Rango de un mes: desde el inicio de SOGO si empezó a mitad de mes, y hasta hoy si es el actual. */
  monthRange(period: string): Range {
    const from = `${period}-01`;
    return { from: from < this.goLive ? this.goLive : from, to: period === this.livePeriod ? this.today : monthEnd(period) };
  }

  /** Meses con datos: del mes de inicio de SOGO al actual. */
  periods(): string[] {
    const out: string[] = [];
    for (let p = this.firstPeriod; p <= this.livePeriod; p = shiftMonth(p, 1)) out.push(p);
    return out;
  }

  /** Últimos `n` meses hasta `period`, sin pasar del mes de inicio de SOGO. */
  monthsUpTo(period: string, n: number): string[] {
    const out: string[] = [];
    for (let p = period, i = 0; i < n && p >= this.firstPeriod; p = shiftMonth(p, -1), i++) out.unshift(p);
    return out;
  }

  // ── Permisos ─────────────────────────────────────────

  /** Permisos de la sesión (todos sus roles) o, si se indica, de un rol por nombre. Vienen de Usuarios y Roles. */
  private allowed(module: Module, action: Action, role?: string): boolean {
    return role ? this.users.roleCan(role, module, action) : this.users.can(module, action);
  }
  canView(module: ReportModule, role?: string): boolean { return this.allowed(PERMISSION_OF[module], 'view', role); }
  canExport(role?: string): boolean { return this.allowed('Reportes', 'export', role); }
  canSchedule(role?: string): boolean { return this.allowed('Reportes', 'create', role); }
  rolesSnapshot(): Role[] { return this.roles; }

  /** Registra en auditoría una generación o exportación. */
  log(action: string, detail: string): void { this.users.addLog(`Reportes: ${action}`, detail); }

  // ── Ocupación y reservas ─────────────────────────────

  occupancy(range: Range, f: OccupancyFilter = {}): OccupancyReport {
    return occupancy(this.reservationList(), ROOMS, range, f);
  }

  createdIn(range: Range): Reservation[] {
    return this.reservationList().filter(r => r.createdAt.slice(0, 10) >= range.from && r.createdAt.slice(0, 10) <= range.to);
  }

  reservationStats(range: Range): ReservationStats { return reservationStats(this.createdIn(range)); }

  // ── Nómina, TRA, facturación ─────────────────────────

  payrollSummary(period: string): PayrollSummary {
    const run = this.payroll.runsSnapshot().find(r => r.period === period && r.status !== 'Anulada');
    if (!run) return { lines: [], net: 0, cost: 0, employees: 0, status: 'Sin liquidar' };
    const lines = this.payroll.effectiveLines(run);
    const t = runTotals(lines);
    return { run, lines, net: t.net, cost: t.earnings + t.employer + t.provisions, employees: t.employees, status: run.status };
  }

  traSummary(range: Range): TraSummary {
    const rows = this.traRows.filter(t => t.status !== 'NO_APLICA' && !isVoid(t.reservation)
      && t.reservation.checkIn >= range.from && t.reservation.checkIn <= range.to && t.reservation.checkIn <= this.today);
    return {
      due: rows.length, reported: rows.filter(t => t.status === 'REPORTADA').length,
      pending: rows.filter(t => t.status !== 'REPORTADA').length, errors: rows.filter(t => t.status === 'ERROR').length,
    };
  }

  billingSummary(range: Range): BillingSummary {
    const valid = this.invoices.getSnapshot().filter(i => isValidInvoice(i));
    const states = valid.map(i => this.invoices.state(i));
    return {
      receivables: valid.reduce((s, i) => s + this.invoices.balance(i), 0),
      overdue: states.filter(s => s === 'Vencida').length,
      pendingInvoices: states.filter(s => s === 'Pendiente' || s === 'Vencida').length,
      annulled: this.invoices.getSnapshot().filter(i => i.annulment && i.annulment.at.slice(0, 10) >= range.from && i.annulment.at.slice(0, 10) <= range.to).map(i => i.number),
      rejected: valid.filter(i => i.dianStatus === 'Rechazada').length,
    };
  }

  // ── Contabilidad ─────────────────────────────────────

  /** Saldo de inventarios (1435) al cierre de un día: desde la entrada en producción coincide con el valor en bodega. */
  stockValueAt(date: string): number {
    return sumWhere(balances(this.entries(), '0000-01-01', date), c => c.startsWith('1435'));
  }

  /** Participación de cada centro de costo en la nómina de los meses del rango (según el área del empleado). */
  private payrollShares(range: Range): Record<CostCenter, number> {
    const shares: Record<CostCenter, number> = { Alojamiento: 0, 'Pasadías y servicios': 0, Administración: 0 };
    for (let p = range.from.slice(0, 7); p <= range.to.slice(0, 7); p = shiftMonth(p, 1)) {
      this.payrollSummary(p).lines.forEach(l => {
        const center: CostCenter = l.area === 'Administración' ? 'Administración' : 'Alojamiento';
        shares[center] += l.totalEarnings;
      });
    }
    const total = Object.values(shares).reduce((s, v) => s + v, 0);
    COST_CENTERS.forEach(c => shares[c] = total ? shares[c] / total : c === 'Alojamiento' ? 1 : 0);
    return shares;
  }

  /** Reparto de una cuenta entre centros de costo (reglas fijas, visibles en el reporte). */
  private allocate(code: string, value: number, payroll: Record<CostCenter, number>): [CostCenter, number][] {
    if (code.startsWith('414005')) return [['Alojamiento', value]];
    if (code.startsWith('414095')) return [['Pasadías y servicios', value]];
    if (code.startsWith('5205')) return COST_CENTERS.map(c => [c, value * payroll[c]]);
    if (code.startsWith('5235')) return [['Alojamiento', value * 0.85], ['Pasadías y servicios', value * 0.15]];
    if (code.startsWith('5245') || code.startsWith('5250') || code.startsWith('5260') || code === '529525') return [['Alojamiento', value]];
    return [['Administración', value]];
  }

  financial(range: Range, f: FinancialFilters = { category: '', center: '', origin: '' }): FinancialReport {
    const entries = f.origin ? this.operations().filter(e => e.origin === f.origin) : this.operations();
    const b = balances(entries, range.from, range.to);
    const cat = [...INCOME_SOURCES, ...EXPENSE_CATEGORIES].find(c => c.label === f.category);
    const shares = this.payrollShares(range);
    const centers = new Map(COST_CENTERS.map(c => [c, { income: 0, expenses: 0 }]));
    let income = 0, expenses = 0;
    b.forEach((value, code) => {
      if ((!isIncome(code) && !isExpense(code)) || (cat && !cat.test(code))) return;
      this.allocate(code, value, shares).forEach(([center, v]) => {
        if (f.center && center !== f.center) return;
        const slot = centers.get(center)!;
        if (isIncome(code)) { slot.income += v; income += v; } else { slot.expenses += v; expenses += v; }
      });
    });
    const inCenter = (code: string, v: number) => f.center ? this.allocate(code, v, shares).filter(([c]) => c === f.center).reduce((s, [, x]) => s + x, 0) : v;
    const sumCat = (test: (c: string) => boolean) => [...b].filter(([c]) => test(c) && (!cat || cat.test(c))).reduce((s, [c, v]) => s + inCenter(c, v), 0);
    const all = balances(this.entries(), range.from, range.to);
    const sheet = balanceSheet(this.entries(), range.to);
    return {
      income, expenses, profit: income - expenses, margin: income ? (income - expenses) / income * 100 : 0,
      cashFlow: sumWhere(all, c => c.startsWith('1105') || c.startsWith('1110')),
      currentRatio: sheet.currentLiabilities ? sheet.currentAssets / sheet.currentLiabilities : 0,
      sources: INCOME_SOURCES.map(s => ({ label: s.label, value: sumCat(s.test) })),
      categories: EXPENSE_CATEGORIES.map(c => ({ label: c.label, value: sumCat(c.test) })).sort((x, y) => y.value - x.value),
      centers: COST_CENTERS.filter(c => !f.center || c === f.center).map(center => {
        const v = centers.get(center)!;
        return { center, income: v.income, expenses: v.expenses, profit: v.income - v.expenses, margin: v.income ? (v.income - v.expenses) / v.income * 100 : NaN };
      }),
    };
  }

  // ── Inventario ───────────────────────────────────────

  inventoryReport(range: Range, f: InventoryFilters = { category: '', area: '', status: '' }): InventoryReport {
    const today = this.today;
    const st = (p: Product) => productStatus(p, today, this.expiryDays);
    const all = this.productList();
    const products = all.filter(p => (!f.category || p.category === f.category) && (!f.status || st(p) === f.status));
    const ids = new Set(products.map(p => p.id));
    const moves = this.movementList().filter(m => m.kind !== 'Inicial' && m.date >= range.from && m.date <= range.to)
      .map(m => ({ ...m, lines: m.lines.filter(l => ids.has(l.productId)) })).filter(m => m.lines.length);
    const exits = moves.filter(m => m.kind === 'Salida' && (!f.area || m.area === f.area));
    const value = (ms: Movement[], pred: (q: number) => boolean = () => true) =>
      ms.reduce((s, m) => s + m.lines.filter(l => pred(l.qty)).reduce((a, l) => a + Math.abs(lineValue(l)), 0), 0);
    const isLoss = (m: Movement) => ['Pérdida', 'Vencimiento', 'Baja', 'Daño'].includes(m.reason);
    const negAdjust = moves.filter(m => m.kind === 'Ajuste' && m.lines.some(l => l.qty < 0));
    const lossExits = exits.filter(isLoss);
    const consumption = value(exits);
    const shrinkage = value(negAdjust, q => q < 0) + value(lossExits);
    const stockValue = products.reduce((s, p) => s + p.stock * p.unitCost, 0);
    // Rotación: consumo al costo sobre el inventario promedio (saldo de 1435 al inicio y al cierre)
    const fullScope = !f.category && !f.status;
    const opening = fullScope ? this.stockValueAt(addDays(range.from, -1)) : stockValue;
    const avg = (opening + stockValue) / 2;
    const days = daysBetween(range.from, range.to) + 1;
    const rotation = avg ? consumption / avg : 0;

    const qtyOut = new Map<string, number>();
    exits.forEach(m => m.lines.forEach(l => qtyOut.set(l.productId, (qtyOut.get(l.productId) ?? 0) - l.qty)));
    const areas = new Map<string, number>();
    exits.forEach(m => areas.set(m.area || 'Sin área', (areas.get(m.area || 'Sin área') ?? 0) + value([m])));
    const byProduct = new Map<string, { name: string; qty: number; unit: string; value: number }>();
    exits.forEach(m => m.lines.forEach(l => {
      const cur = byProduct.get(l.productId) ?? { name: l.name, qty: 0, unit: l.unit, value: 0 };
      byProduct.set(l.productId, { ...cur, qty: cur.qty - l.qty, value: cur.value + Math.abs(lineValue(l)) });
    }));
    const cats = [...new Set(products.map(p => p.category))];
    return {
      products, stockValue, categories: cats.length,
      entries: value(moves.filter(m => m.kind === 'Entrada')), entryCount: moves.filter(m => m.kind === 'Entrada').length,
      consumption, exitCount: exits.length,
      shrinkage, shrinkCount: negAdjust.length + lossExits.length, shrinkShare: consumption ? shrinkage / consumption * 100 : 0,
      rotation, coverDays: rotation ? days / rotation : NaN,
      byCategory: cats.map(category => ({ category, value: products.filter(p => p.category === category).reduce((s, p) => s + p.stock * p.unitCost, 0) }))
        .sort((a, b) => b.value - a.value),
      byArea: [...areas].map(([area, v]) => ({ area, value: v, share: consumption ? v / consumption * 100 : 0 })).sort((a, b) => b.value - a.value),
      top: [...byProduct.values()].sort((a, b) => b.value - a.value).slice(0, 6),
      alerts: products.filter(p => st(p) !== 'Disponible').map(p => {
        const daily = (qtyOut.get(p.id) ?? 0) / days;
        return { product: p, status: st(p), daily, cover: daily ? p.stock / daily : NaN, expiry: p.tracksExpiry ? p.expiryDate : '' };
      }).sort((a, b) => a.product.code.localeCompare(b.product.code)),
    };
  }

  // ── Resumen mensual comparable ───────────────────────

  monthSummary(period: string): MonthSummary {
    const cached = this.summaryCache.get(period);
    if (cached) return cached;
    const range = this.monthRange(period);
    const live = period === this.livePeriod;
    const b = balances(this.operations(), range.from, range.to);
    const pl = this.financial(range);
    // Mientras la nómina del mes no se confirma, Contabilidad no la tiene: se usa el costo liquidado en Nómina
    const posted = sumWhere(b, c => c.startsWith('5205'));
    const staffCost = posted || this.payrollSummary(period).cost;
    const occ = this.occupancy(range);
    const rs = this.reservationStats(range);
    const tra = this.traSummary(range);
    const inv = this.inventoryReport(range);
    const s: MonthSummary = {
      period, live, range, income: pl.income, expenses: pl.expenses, profit: pl.profit, margin: pl.margin,
      staffCost, staffRatio: pl.income ? staffCost / pl.income * 100 : 0, stockValue: this.stockValueAt(range.to),
      occupancy: occ.pct, occupied: occ.occupied, available: occ.available, stays: occ.stays, avgStay: occ.avgStay,
      adr: occ.adr, revpar: occ.revpar, reservations: rs.count, byChannel: rs.byChannel, cancelRate: rs.cancelRate, leadDays: rs.leadDays,
      rotation: inv.rotation, consumption: inv.consumption,
      traOnTime: tra.due ? tra.reported / tra.due * 100 : 100,
      // La cartera es un saldo de hoy: no se reconstruye para meses pasados
      receivables: live ? this.billingSummary(range).receivables : null,
    };
    this.summaryCache.set(period, s);
    return s;
  }

  generatedStamp(): string { return isoDateTime(); }

  // ── Metas y panel de indicadores ─────────────────────

  /** Meta del indicador (Configuración › Metas e indicadores); null si aún no se definió. */
  goal(key: IndicatorKey): number | null {
    const v = this.settings.goals.goals[key];
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  /** Nivel de alerta: por debajo (o por encima, si menos es mejor) el indicador se marca crítico. */
  alertLevel(key: IndicatorKey): number | null {
    const v = this.settings.goals.alerts[key];
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  /** Solo el Administrador define metas: se guardan en la base y quedan en auditoría. */
  async setGoal(key: IndicatorKey, value: number | null): Promise<void> {
    if (this.goal(key) === value) return;
    const def = INDICATORS.find(i => i.key === key)!;
    const goals = { ...this.settings.goals.goals };
    if (value === null) delete goals[key]; else goals[key] = value;
    await this.settings.saveGoals(goals, { ...this.settings.goals.alerts }, `${def.panel}: meta ${value === null ? 'sin definir' : def.goalFormat(value)}`);
    this.log('meta actualizada', `${def.panel}: ${value === null ? 'sin definir' : def.goalFormat(value)}`);
  }

  /** Vista del panel: preferencia de cada rol en este navegador. */
  panelView(): { order: IndicatorKey[]; active: IndicatorKey[] } {
    try {
      const saved = JSON.parse(localStorage.getItem(`sogo_indicators_${this.role}`) || 'null');
      if (saved && Array.isArray(saved.order) && Array.isArray(saved.active)) {
        const known = new Set(INDICATORS.map(i => i.key));
        const order = [...saved.order.filter((k: IndicatorKey) => known.has(k)), ...DEFAULT_VIEW.order.filter(k => !saved.order.includes(k))];
        return { order, active: saved.active.filter((k: IndicatorKey) => known.has(k)) };
      }
    } catch { /* sin almacenamiento: vista por defecto */ }
    return { order: [...DEFAULT_VIEW.order], active: [...DEFAULT_VIEW.active] };
  }

  savePanelView(view: { order: IndicatorKey[]; active: IndicatorKey[] }): boolean {
    try {
      localStorage.setItem(`sogo_indicators_${this.role}`, JSON.stringify(view));
      return true;
    } catch { return false; }
  }

  // ── Filtros guardados ────────────────────────────────

  // Guardados en la base (/api/reportes/filtros): los ve todo el equipo que consulta Reportes.

  loadFilters(): Promise<SavedFilter[]> {
    return firstValueFrom(this.http.get<SavedFilter[]>(`${API_URL}/reportes/filtros`)).then(l => l ?? []);
  }

  async saveFilter(f: Omit<SavedFilter, 'id' | 'createdBy'>): Promise<SavedFilter> {
    const saved = await firstValueFrom(this.http.post<SavedFilter>(`${API_URL}/reportes/filtros`, f));
    this.log('filtro guardado', `${saved.name} · ${saved.module}`);
    return saved;
  }

  async deleteFilter(f: SavedFilter): Promise<void> {
    await firstValueFrom(this.http.delete(`${API_URL}/reportes/filtros/${encodeURIComponent(f.id)}`));
    this.log('filtro eliminado', f.name);
  }

  /** Quien guardó el filtro, o quien puede crear en Reportes, lo puede eliminar. */
  canDeleteFilter(f: SavedFilter): boolean {
    return this.canSchedule() || (!!f.createdByLogin && f.createdByLogin.toLowerCase() === (localStorage.getItem('sogo_username') || '').toLowerCase());
  }
}

export interface SavedFilter {
  id: string; name: string; module: string; values: Record<string, string>;
  /** 'month' = mes en curso al aplicarlo; si no, el rango guardado. */
  range: 'month' | Range; min?: number | null; max?: number | null; createdBy: string;
  createdByLogin?: string; createdAt?: string;
}
