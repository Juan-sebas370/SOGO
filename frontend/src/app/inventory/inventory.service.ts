import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Product, Category, Supplier, Movement, MovementKind, MovementLine, Alert, AlertConfig, movementValue } from './inventory.model';
import { UsersService } from '../users/users.service';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { API_URL } from '../api';

const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));
const API = `${API_URL}/inventario`;

export type NewProduct = Omit<Product, 'id' | 'stock' | 'createdAt' | 'history' | 'counted' | 'categoryInUse'>;
export interface EntryInput { reason: string; date: string; supplierId: number | null; invoice: string; receivedBy: string; observations: string; lines: { productId: string; qty: number; unitCost: number }[]; }
export interface ExitInput { reason: string; date: string; area: string; deliveredTo: string; reference: string; observations: string; lines: { productId: string; qty: number }[]; }
export interface AdjustInput { reason: string; date: string; location: string; observations: string; lines: { productId: string; counted: number; reason: string; note: string }[]; }
export interface ExportLog { file: string; period: string; user: string; at: string; }

/** Mensaje del servidor (validaciones) o uno genérico. */
export const serverError = (e: any, what: string) => e?.error?.message || `No se pudo ${what}. Intenta de nuevo.`;

/**
 * Inventarios desde la base de datos (API /api/inventario). Las pantallas leen la copia en
 * memoria; cada cambio lo valida y calcula el servidor (existencias, costo promedio, número del
 * movimiento y alertas) y luego se recargan los datos.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {

  private products: Product[] = [];
  private movements: Movement[] = [];
  private alerts: Alert[] = [];
  private categories: Category[] = [];
  private supplierRows: Supplier[] = [];
  private nextNumbers: Partial<Record<MovementKind, string>> = {};
  private products$ = new BehaviorSubject<Product[]>([]);
  private movements$ = new BehaviorSubject<Movement[]>([]);
  private alerts$ = new BehaviorSubject<Alert[]>([]);
  private loading?: Promise<void>;
  private loadedFor = '';

  config: AlertConfig = { expiryDays: 7, lowStock: true, unusualPct: 50, maxShrinkPct: 2 };
  /** Conteos físicos guardados como borrador en esta sesión, por ubicación. */
  countDrafts: Record<string, { counted: Record<string, number>; reasons: Record<string, string>; notes: Record<string, string>; at: string }> = {};
  lastUpdate = isoDateTime();

  constructor(private audit: UsersService, private http: HttpClient) {}

  /** Primera carga de la sesión (el dashboard la espera antes de abrir los módulos). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load();
    }
    return this.loading;
  }

  reload(): Promise<void> { return this.loading = this.load(); }

  private async load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return;
    const get = <T>(path: string) => firstValueFrom(this.http.get<T>(`${API}/${path}`));
    try {
      const [products, movements, alerts, categories, suppliers, next, cfg] = await Promise.all([
        get<Product[]>('productos'), get<Movement[]>('movimientos'), get<Alert[]>('alertas'), get<Category[]>('categorias'),
        get<Supplier[]>('proveedores'), get<Partial<Record<MovementKind, string>>>('movimientos/proximos'),
        firstValueFrom(this.http.get<AlertConfig | null>(`${API_URL}/configuracion/inventario_alertas`)),
      ]);
      this.products = products;
      this.movements = movements;
      this.alerts = alerts;
      this.categories = categories;
      this.supplierRows = suppliers;
      this.nextNumbers = next;
      if (cfg) this.config = { ...this.config, ...cfg };
      this.lastUpdate = isoDateTime();
      this.emit();
    } catch (e: any) {
      console.error('No se pudo cargar el inventario', e);
      if (e?.status !== 401) toast.error('No se pudo cargar el inventario', serverMessage(e));
    }
  }

  // ── Lectura ──────────────────────────────────────────

  getProducts(): Observable<Product[]> { return this.products$.asObservable(); }
  productsSnapshot(): Product[] { return this.products; }
  /** Productos que se pueden mover (categorías en uso). */
  activeProducts(): Product[] { return this.products.filter(p => p.categoryInUse); }
  getProduct(id: string): Product | undefined { return this.products.find(p => p.id === id); }
  findByCode(code: string, exceptId?: string): Product | undefined {
    const c = code.trim().toUpperCase();
    return this.products.find(p => p.id !== exceptId && p.code === c);
  }
  findByName(name: string, exceptId?: string): Product | undefined {
    const n = name.trim().toLowerCase();
    return n ? this.products.find(p => p.id !== exceptId && p.name.toLowerCase() === n) : undefined;
  }

  getMovements(): Observable<Movement[]> { return this.movements$.asObservable(); }
  movementsSnapshot(): Movement[] { return this.movements; }
  movementsFor(productId: string): { m: Movement; line: MovementLine }[] {
    return this.movements.flatMap(m => m.lines.filter(l => l.productId === productId).map(line => ({ m, line })))
      .sort((a, b) => `${b.m.date}${b.m.time}`.localeCompare(`${a.m.date}${a.m.time}`));
  }

  getAlerts(): Observable<Alert[]> { return this.alerts$.asObservable(); }
  alertsSnapshot(): Alert[] { return this.alerts; }

  getCategories(): Category[] { return this.categories; }
  /** Nombres de los proveedores registrados (para filtros). */
  suppliers(): string[] { return this.supplierRows.map(s => s.name); }
  supplierList(): Supplier[] { return this.supplierRows; }
  /** Ubicaciones que ya se usan en los productos (para sugerir al escribir). */
  locations(): string[] { return [...new Set(this.products.map(p => p.location).filter(Boolean))].sort(); }

  get canCreate(): boolean { return this.audit.can('Inventarios', 'create'); }
  get canEdit(): boolean { return this.audit.can('Inventarios', 'edit'); }
  /** Persona de la sesión (como en el resto de los módulos). */
  get actorName(): string { return this.audit.actorName(); }

  /** Historial de exportaciones (sale de la auditoría). */
  get exportsLog(): ExportLog[] {
    return this.audit.eventsSnapshot().filter(e => e.module === 'Inventarios' && /^exportaci/i.test(e.action))
      .map(e => { const [file, period] = e.detail.split(' · '); return { file, period: period ?? '', user: e.user, at: e.at }; })
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Resumen de alertas activas para la campana de notificaciones. */
  getAlertSummary() {
    const active = this.alerts.filter(a => a.status === 'Activa');
    return {
      critical: active.filter(a => a.type === 'Agotado').length,
      low: active.filter(a => a.type === 'Stock bajo').length,
      expiring: active.filter(a => a.type === 'Por vencer').length,
    };
  }

  // ── Categorías y proveedores ─────────────────────────

  async addCategory(name: string): Promise<Category> {
    const cat = await firstValueFrom(this.http.post<Category>(`${API}/categorias`, { name: name.trim() }));
    this.categories = [...this.categories, cat];
    this.audit.addLog('Inventarios: categoría creada', `${cat.name} (${cat.prefix})`);
    return cat;
  }

  /** Pone una categoría en pausa (no se usa por ahora) o la vuelve a usar. */
  async setCategoryInUse(c: Category, inUse: boolean): Promise<void> {
    await firstValueFrom(this.http.put(`${API}/categorias/${c.id}`, { inUse }));
    this.audit.addLog('Inventarios: categoría ' + (inUse ? 'en uso' : 'en pausa'), c.name);
    await this.reload();
  }

  async addSupplier(data: { name: string; docType: string; docNumber: string; phone: string }): Promise<Supplier> {
    const s = await firstValueFrom(this.http.post<Supplier>(`${API}/proveedores`, data));
    this.supplierRows = [...this.supplierRows.filter(x => x.id !== s.id), s].sort((a, b) => a.name.localeCompare(b.name));
    this.audit.addLog('Inventarios: proveedor registrado', `${s.name} · ${s.docType} ${s.docNumber}`);
    return s;
  }

  // ── Productos ────────────────────────────────────────

  /** Código sugerido para la categoría (el servidor rechaza duplicados). */
  nextCode(category: string): string {
    const prefix = this.categories.find(c => c.name === category)?.prefix ?? 'GEN';
    const used = this.products.filter(p => p.code.startsWith(prefix + '-')).map(p => Number(p.code.split('-')[1]));
    return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
  }

  previewNumber(kind: MovementKind, date = isoDate(0)): string {
    return this.nextNumbers[kind] ?? `${{ Inicial: 'INI', Entrada: 'ENT', Salida: 'SAL', Ajuste: 'AJU' }[kind]}-${date.slice(0, 4)}-0001`;
  }

  /** Crea el producto; la cantidad inicial queda como su primer movimiento (INI). */
  async createProduct(data: NewProduct, initialQty: number): Promise<{ product: Product; movement?: Movement }> {
    const r = await firstValueFrom(this.http.post<{ product: Product; movement?: Movement }>(`${API}/productos`, { product: data, initialQty }));
    await this.reload();
    this.audit.addLog('Inventarios: producto registrado', `${r.product.code} · ${r.product.name} · ${initialQty} ${r.product.unit}`);
    return { product: this.getProduct(r.product.id) ?? r.product, movement: r.movement };
  }

  /** Actualiza datos del producto (no las existencias) y guarda el resumen en su historial. */
  async updateProduct(id: string, changes: Partial<NewProduct>, summary: string[]): Promise<void> {
    const prev = this.getProduct(id);
    if (!prev || !summary.length) return;
    await firstValueFrom(this.http.put(`${API}/productos/${id}`, { product: { ...prev, ...changes }, summary }));
    await this.reload();
    this.audit.addLog('Inventarios: producto actualizado', `${prev.code} · ${summary.join(' · ')}`);
  }

  // ── Movimientos ──────────────────────────────────────

  async registerEntry(e: EntryInput): Promise<{ movement: Movement; attended: number }> {
    const before = this.activeAlertCount();
    const movement = await this.post({ kind: 'Entrada', ...e });
    const attended = Math.max(0, before - this.activeAlertCount());
    this.audit.addLog('Inventarios: entrada registrada', `${movement.number} · ${e.reason} · ${movement.lines.length} productos · ${money(movementValue(movement))}`);
    return { movement, attended };
  }

  async registerExit(e: ExitInput): Promise<Movement> {
    const movement = await this.post({ kind: 'Salida', ...e });
    this.audit.addLog('Inventarios: salida registrada', `${movement.number} · ${e.reason} · ${e.area} · ${money(-movementValue(movement))}`);
    return movement;
  }

  /** Conteo físico o ajuste: solo las líneas con diferencia generan movimiento (lo decide el servidor). */
  async registerAdjustment(e: AdjustInput): Promise<Movement> {
    const movement = await this.post({ kind: 'Ajuste', ...e });
    this.audit.addLog('Inventarios: ajuste de existencias', `${movement.number} · ${movement.lines.length} productos · ${money(movementValue(movement))}`);
    return movement;
  }

  private async post(body: object): Promise<Movement> {
    const movement = await firstValueFrom(this.http.post<Movement>(`${API}/movimientos`, body));
    await this.reload();
    return movement;
  }

  // ── Alertas ──────────────────────────────────────────

  private activeAlertCount(): number { return this.alerts.filter(a => a.status === 'Activa').length; }

  async markAttended(key: string): Promise<void> {
    const a = [...this.alerts].reverse().find(x => x.key === key && x.status === 'Activa');
    if (!a) return;
    await firstValueFrom(this.http.post(`${API}/alertas/${a.id}/atender`, {}));
    await this.reload();
    this.audit.addLog('Inventarios: alerta atendida', `${a.type} · ${this.getProduct(a.productId)?.code}`);
  }

  async requestPurchase(productId: string): Promise<void> {
    const p = this.getProduct(productId);
    if (!p) return;
    await firstValueFrom(this.http.post(`${API}/productos/${productId}/solicitar-compra`, {}));
    await this.reload();
    this.audit.addLog('Inventarios: solicitud de compra', `${p.code} · ${p.name} · ${p.stock}/${p.minStock} ${p.unit}${p.supplier ? ' · ' + p.supplier : ''}`);
  }

  /** Salidas del día frente al promedio diario de los 30 días anteriores (umbral de consumo inusual). */
  consumptionCheck(date = isoDate(0)): { today: number; average: number; unusual: boolean } {
    const value = (d: string) => this.movements.filter(m => m.kind === 'Salida' && m.date === d).reduce((s, m) => s - movementValue(m), 0);
    let sum = 0;
    for (let i = 1; i <= 30; i++) { const d = new Date(`${date}T12:00`); d.setDate(d.getDate() - i); sum += value(d.toISOString().slice(0, 10)); }
    const average = sum / 30, today = value(date);
    return { today, average, unusual: average > 0 && today > average * (1 + this.config.unusualPct / 100) };
  }

  /** Umbrales de alerta (Configuración › Metas e indicadores): se guardan y se recalculan las alertas. */
  async setConfig(c: Partial<AlertConfig>): Promise<void> {
    const next = { ...this.config, ...c };
    await firstValueFrom(this.http.put(`${API_URL}/configuracion/inventario_alertas`, next));
    await firstValueFrom(this.http.post(`${API}/alertas/recalcular`, {}));
    this.config = next;
    await this.reload();
    this.audit.addLog('Inventarios: configuración de alertas', `Por vencer: ${next.expiryDays} días · stock bajo ${next.lowStock ? 'sí' : 'no'} · consumo inusual ${next.unusualPct} % · merma máx. ${next.maxShrinkPct} %`);
  }

  logExport(file: string, period: string): void {
    this.audit.addLog('Inventarios: exportación', `${file} · ${period}`);
  }

  private emit(): void {
    this.products$.next(this.products);
    this.movements$.next(this.movements);
    this.alerts$.next(this.alerts);
  }
}
