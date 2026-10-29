import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest, debounceTime, firstValueFrom } from 'rxjs';
import {
  Account, Entry, EntryKind, PREFIX, isBalanced, entryTotal, monthStart, monthEnd, periodName, shiftMonth, counts,
  setAccounts, accountByCode, activeAccounts, CostCenter, setCostCenters,
} from './accounting.model';
import { DEFAULT_MAPPING } from './accounting-config';
import { buildIntegration, IntegratedDraft, ReviewItem } from './integration';
import { ReservationService } from '../reservations/reservation.service';
import { InvoiceService } from '../billing/invoice.service';
import { ChargeService } from '../billing/charge.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { ConceptCategory } from '../billing/invoice.model';
import { PayrollService } from '../payroll/payroll.service';
import { InventoryService } from '../inventory/inventory.service';
import { UsersService } from '../users/users.service';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { API_URL } from '../api';

const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));
import { SupportFile, UploadFile } from './support-file';

const BASE = `${API_URL}/contabilidad`;

/** Comprobante nuevo: los archivos de soporte van en base64 (el servidor los guarda en la base de datos). */
export type NewEntry = Omit<Entry, 'id' | 'number' | 'origin' | 'createdBy' | 'status' | 'files'> & { draft?: boolean; files?: UploadFile[] };

/** Ajustes contables (configuracion 'contabilidad'). */
export interface AccountingSettings {
  inicio:       string;               // YYYY-MM-DD: desde aquí SOGO integra los módulos
  cerradoHasta: string | null;        // YYYY-MM: ese mes y los anteriores no se modifican
  mapping:      Record<string, string>;
  /** Datos del hospedaje que salen en cada comprobante. */
  emisor?:      Issuer;
}

export interface Issuer { nombre: string; propietario: string; nit: string; direccion: string; telefono: string; }

export interface IntegrationRun {
  at:         string;
  type:       'Manual' | 'Automática';
  user:       string;
  modules:    number;
  integrated: number;
  created:    number;
  updated:    number;
  annulled:   number;
  omitted:    number;
  errors:     number;
}

export interface ExportLog { file: string; period: string; user: string; at: string; }

interface ServerEvent { type: 'Integración' | 'Exportación'; mode?: 'Manual' | 'Automática'; at: string; user: string; detail: any; }

/**
 * Contabilidad conectada a la base de datos: plan de cuentas, comprobantes (manuales e
 * integrados), ajustes e historial vienen del servidor. Los módulos (Reservas, Alojamiento,
 * Nómina, Inventarios) se integran solos: cuando cambian, se calcula el asiento de cada
 * registro y el servidor lo crea, lo actualiza (conserva su número) o lo anula.
 */
@Injectable({ providedIn: 'root' })
export class AccountingService {

  private entries: Entry[] = [];
  private entries$ = new BehaviorSubject<Entry[]>([]);
  private settings: AccountingSettings = { inicio: '2026-09-01', cerradoHasta: null, mapping: { ...DEFAULT_MAPPING } };
  private loading?: Promise<void>;
  private loadedFor = '';
  private syncing: Promise<unknown> = Promise.resolve();
  private lastSent = '';
  private watching = false;

  duplicates: string[] = [];
  review: ReviewItem[] = [];
  /** Asientos que el servidor no pudo integrar (cuenta inexistente, partida descuadrada...). */
  integrationErrors: string[] = [];
  lastSync = '';
  integrationLog: IntegrationRun[] = [];
  exportsLog: ExportLog[] = [];
  loadError = '';

  /** Mes actual: el que se muestra por defecto. */
  readonly openPeriod = isoDate(0).slice(0, 7);

  constructor(
    private http: HttpClient,
    private reservations: ReservationService,
    private invoices: InvoiceService,
    private charges: ChargeService,
    private config: BillingConfigService,
    private payroll: PayrollService,
    private inventory: InventoryService,
    private audit: UsersService,
  ) {}

  // ── Carga ────────────────────────────────────────────

  /** Primera carga de la sesión (la esperan las rutas de Contabilidad). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load().then(() => this.watch());
    }
    return this.loading;
  }

  private async load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return;
    try {
      const [accounts, settings, entries, events, centers] = await Promise.all([
        firstValueFrom(this.http.get<Account[]>(`${BASE}/cuentas`)),
        firstValueFrom(this.http.get<AccountingSettings>(`${BASE}/ajustes`)),
        firstValueFrom(this.http.get<Entry[]>(`${BASE}/asientos`)),
        firstValueFrom(this.http.get<ServerEvent[]>(`${BASE}/eventos`)),
        firstValueFrom(this.http.get<CostCenter[]>(`${BASE}/centros`)).catch(() => [] as CostCenter[]),
      ]);
      setAccounts(accounts);
      setCostCenters(centers);
      this.settings = { ...settings, mapping: { ...settings.mapping } };
      this.setEntries(entries);
      this.setEvents(events);
      this.loadError = '';
    } catch (e: any) {
      console.error('No se pudo cargar la contabilidad', e);
      this.loadError = e?.status === 403 ? 'Tu rol no tiene permiso para consultar Contabilidad.'
        : e?.status === 0 ? 'No hay conexión con el servidor.'
        : `No se pudo cargar la contabilidad${e?.error?.message ? ': ' + e.error.message : ''}. Verifica que se ejecutó el script 14_contabilidad.sql.`;
    }
  }

  private async reloadEntries(): Promise<void> {
    const [entries, events] = await Promise.all([
      firstValueFrom(this.http.get<Entry[]>(`${BASE}/asientos`)),
      firstValueFrom(this.http.get<ServerEvent[]>(`${BASE}/eventos`)),
    ]);
    this.setEntries(entries);
    this.setEvents(events);
  }

  private setEntries(list: Entry[]): void {
    this.entries = list.map(e => ({ ...e, supports: e.supports ?? [], files: e.files ?? [], lines: e.lines ?? [] }));
    this.entries$.next(this.entries);
  }

  private setEvents(events: ServerEvent[]): void {
    this.integrationLog = events.filter(e => e.type === 'Integración').map(e => ({
      at: e.at, type: e.mode ?? 'Automática', user: e.user || 'Sistema', modules: e.detail?.modules ?? 0, integrated: e.detail?.integrated ?? 0,
      created: e.detail?.created ?? 0, updated: e.detail?.updated ?? 0, annulled: e.detail?.annulled ?? 0, omitted: e.detail?.omitted ?? 0,
      errors: (e.detail?.errors?.length ?? 0) + (e.detail?.review ?? 0),
    }));
    this.exportsLog = events.filter(e => e.type === 'Exportación').map(e => ({ file: e.detail?.file ?? '', period: e.detail?.period ?? '', user: e.user, at: e.at }));
  }

  /** Integración en tiempo real: cada cambio en los módulos actualiza sus asientos. */
  private watch(): void {
    if (this.watching || this.loadError) return;
    this.watching = true;
    combineLatest([this.reservations.getAll(), this.invoices.getAll(), this.payroll.getRuns(), this.inventory.getMovements()])
      .pipe(debounceTime(1200))
      .subscribe(() => this.integrate(null).catch(() => undefined));
  }

  // ── Consultas ────────────────────────────────────────

  getEntries(): Observable<Entry[]> { return this.entries$.asObservable(); }
  snapshot(): Entry[] { return this.entries; }
  getById(id: string): Entry | undefined { return this.entries.find(e => e.id === id); }
  getMapping(): Record<string, string> { return { ...this.settings.mapping }; }
  getSettings(): AccountingSettings { return { ...this.settings, mapping: { ...this.settings.mapping } }; }

  get actor(): string { return this.audit.actorName(); }
  /** Razón social del emisor (Facturación › Impuestos y DIAN) para encabezados y documentos. */
  get company(): string { return this.config.get().issuer.name; }
  get canCreate(): boolean { return this.audit.can('Contabilidad', 'create'); }
  get canEdit(): boolean { return this.audit.can('Contabilidad', 'edit'); }
  get canAnnul(): boolean { return this.audit.can('Contabilidad', 'delete'); }
  get canExport(): boolean { return this.audit.can('Contabilidad', 'export'); }

  /** Fecha desde la que SOGO lleva la contabilidad (lo anterior entra con los saldos iniciales). */
  get goLive(): string { return this.settings.inicio; }
  get closedThrough(): string | null { return this.settings.cerradoHasta; }
  get year(): string { return this.openPeriod.slice(0, 4); }
  isClosed(date: string): boolean { return !!this.settings.cerradoHasta && date.slice(0, 7) <= this.settings.cerradoHasta; }

  /** Primer día en que se puede registrar: después del inicio y de los meses cerrados. */
  get minDate(): string {
    const afterClose = this.settings.cerradoHasta ? monthStart(shiftMonth(this.settings.cerradoHasta, 1)) : '';
    return afterClose > this.goLive ? afterClose : this.goLive;
  }
  get maxDate(): string { return monthEnd(this.openPeriod); }

  /** Meses de la contabilidad en SOGO (del mes de inicio al actual), el más reciente primero. */
  periods(): string[] {
    const out: string[] = [];
    const first = [this.goLive.slice(0, 7), ...this.entries.map(e => e.date.slice(0, 7))].sort()[0];
    for (let p = first; p <= this.openPeriod; p = shiftMonth(p, 1)) out.push(p);
    return out.reverse();
  }

  /** ¿Ya se registraron los saldos iniciales (comprobante de apertura vigente)? */
  get hasOpening(): boolean { return this.entries.some(e => e.kind === 'Apertura' && e.status === 'Contabilizado'); }

  /** Número aproximado del próximo comprobante (el definitivo lo asigna el servidor al guardar). */
  previewNumber(kind: EntryKind, date = isoDate(0)): string {
    const key = `${PREFIX[kind]}-${(date || isoDate(0)).slice(0, 4)}`;
    const re = new RegExp(`^${key}(\\d{3,})$`);
    const last = Math.max(0, ...this.entries.map(e => re.exec(e.number)?.[1]).filter(Boolean).map(n => +n!));
    return `${key}${String(last + 1).padStart(3, '0')}`;
  }

  /**
   * Datos del hospedaje para los comprobantes: salen de Configuración › Datos del hospedaje (una sola
   * fuente para facturas, comprobantes y nómina). Lo que se guardó antes en Integración solo se usa
   * para un dato que Datos del hospedaje aún no tenga.
   */
  get issuer(): Issuer {
    const h = this.config.get().issuer, e = this.settings.emisor;
    return {
      nombre: h.name || e?.nombre || '',
      propietario: h.legalName || e?.propietario || '',
      nit: h.nit || e?.nit || '',
      direccion: [h.address, h.city].filter(Boolean).join(', ') || e?.direccion || '',
      telefono: h.phone || e?.telefono || '',
    };
  }

  async saveCostCenter(c: CostCenter): Promise<void> {
    setCostCenters(await firstValueFrom(this.http.put<CostCenter[]>(`${BASE}/centros`, c)));
    this.entries$.next(this.entries);
    this.audit.addLog('Contabilidad: centro de costo', `${c.code} · ${c.name}${c.active ? '' : ' (inactivo)'}`);
  }

  // ── Registro manual ──────────────────────────────────

  /** Validación previa (el servidor vuelve a validar al guardar). */
  validate(e: NewEntry): string[] {
    const errors: string[] = [];
    if (!e.date) errors.push('falta la fecha');
    else if (e.date < this.goLive) errors.push(`la fecha es anterior al inicio de la contabilidad en SOGO (${this.goLive.split('-').reverse().join('/')})`);
    else if (this.isClosed(e.date)) errors.push(`el período ${periodName(e.date.slice(0, 7)).toLowerCase()} está cerrado (los meses están cerrados hasta ${periodName(this.settings.cerradoHasta!).toLowerCase()}; se reabre en Contabilidad › Integración › Meses cerrados hasta)`);
    else if (e.date > this.maxDate) errors.push('la fecha es posterior al mes actual');
    if (!e.concept.trim()) errors.push('falta el concepto');
    if (e.lines.length < 2) errors.push('se necesitan al menos dos partidas');
    if (e.lines.some(l => !l.account)) errors.push('hay partidas sin cuenta');
    const active = new Set(activeAccounts().map(a => a.code));
    if (e.lines.some(l => l.account && !active.has(l.account))) errors.push('hay cuentas inactivas, cuentas título (que agrupan subcuentas) o que no existen en el plan de cuentas');
    if (e.lines.some(l => (l.debit > 0) === (l.credit > 0))) errors.push('cada partida lleva valor solo en débito o solo en crédito');
    if (e.lines.some(l => l.debit < 0 || l.credit < 0)) errors.push('no se permiten valores negativos');
    if (!isBalanced(e.lines)) errors.push('débitos y créditos no suman igual');
    return errors;
  }

  async register(e: NewEntry): Promise<Entry> {
    const errors = this.validate(e);
    if (errors.length) throw new Error(errors.join(', '));
    const body = { ...e, lines: e.lines.map(l => ({ ...l, debit: Math.round(l.debit), credit: Math.round(l.credit) })) };
    const saved = await firstValueFrom(this.http.post<Entry>(`${BASE}/asientos`, body));
    this.upsert(saved);
    this.audit.addLog(`Contabilidad: ${e.draft ? 'borrador guardado' : 'comprobante registrado'}`, `${saved.number} · ${saved.concept} · ${money(entryTotal(saved))}`);
    return saved;
  }

  // ── Documentos soporte (archivos en la base de datos) ──

  /** Agrega un archivo a un comprobante (también a los integrados). */
  async addSupport(id: string, f: UploadFile): Promise<void> {
    const saved = await firstValueFrom(this.http.post<Entry>(`${BASE}/asientos/${id}/soportes`, f));
    this.upsert(saved);
    this.audit.addLog('Contabilidad: soporte agregado', `${saved.number} · ${f.name}`);
  }

  /** Abre el archivo en otra pestaña (o lo descarga si el navegador no lo puede mostrar). */
  async openSupport(entryId: string, file: SupportFile): Promise<void> {
    const tab = window.open('', '_blank');
    const blob = await firstValueFrom(this.http.get(`${BASE}/asientos/${entryId}/soportes/${file.id}`, { responseType: 'blob' }));
    const url = URL.createObjectURL(new Blob([blob], { type: file.type }));
    if (tab) tab.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async removeSupport(entryId: string, file: SupportFile): Promise<void> {
    const saved = await firstValueFrom(this.http.delete<Entry>(`${BASE}/asientos/${entryId}/soportes/${file.id}`));
    this.upsert(saved);
    this.audit.addLog('Contabilidad: soporte quitado', `${saved.number} · ${file.name}`);
  }

  async post(id: string): Promise<void> {
    const saved = await firstValueFrom(this.http.post<Entry>(`${BASE}/asientos/${id}/contabilizar`, {}));
    this.upsert(saved);
    this.audit.addLog('Contabilidad: borrador contabilizado', `${saved.number} · ${saved.concept}`);
  }

  /** Anula un comprobante manual. Los integrados se anulan en su módulo de origen. */
  async annul(id: string, reason: string): Promise<void> {
    const saved = await firstValueFrom(this.http.post<Entry>(`${BASE}/asientos/${id}/anular`, { reason }));
    this.upsert(saved);
    this.audit.addLog('Contabilidad: comprobante anulado', `${saved.number} · ${reason}`);
  }

  private upsert(e: Entry): void {
    const exists = this.entries.some(x => x.id === e.id);
    this.setEntries(exists ? this.entries.map(x => x.id === e.id ? e : x) : [...this.entries, e]);
  }

  // ── Integración ──────────────────────────────────────

  private compute() {
    return buildIntegration({
      reservations: this.reservations.getSnapshot(), invoices: this.invoices.getSnapshot(), charges: this.charges.all(),
      runs: this.payroll.runsSnapshot().map(run => ({ run, lines: this.payroll.effectiveLines(run) })),
      inventory: this.inventory.movementsSnapshot(), stock: this.inventory.productsSnapshot(), mapping: this.settings.mapping,
      taxFor: (c: string, foreign?: boolean) => this.config.taxFor(c as ConceptCategory, foreign),
    }, this.goLive, isoDate(0));
  }

  /**
   * Calcula los asientos de los módulos y los guarda en la base de datos. `mode` null =
   * sincronización automática: solo se envía si algo cambió y no queda en el historial salvo
   * que el servidor cree, actualice o anule algo.
   */
  integrate(mode: 'Manual' | null): Promise<IntegrationRun | undefined> {
    const job = this.syncing.then(async () => {
      if (this.loadError) return undefined;
      const result = this.compute();
      this.duplicates = result.duplicates;
      this.review = result.review;
      this.lastSync = isoDateTime();
      const sig = JSON.stringify(result.entries.map(signature));
      if (!mode && (sig === this.lastSent || this.inSync(result.entries))) {
        this.lastSent = sig;
        this.entries$.next(this.entries);
        return undefined;
      }
      const r = await firstValueFrom(this.http.post<any>(`${BASE}/integracion`, {
        mode: mode ?? 'Automática', entries: result.entries, review: result.review.length, modules: 5,
      }));
      this.lastSent = sig;
      this.integrationErrors = r.errors ?? [];
      await this.reloadEntries();
      const run: IntegrationRun = {
        at: this.lastSync, type: mode ?? 'Automática', user: mode ? this.actor : 'Sistema', modules: r.modules, integrated: r.integrated,
        created: r.created, updated: r.updated, annulled: r.annulled, omitted: r.omitted, errors: this.integrationErrors.length + result.review.length,
      };
      if (mode) this.audit.addLog('Contabilidad: integración', `${r.integrated} integrados · ${r.created} nuevos · ${r.updated} actualizados · ${r.annulled} anulados · ${run.errors} por revisar`);
      return run;
    });
    this.syncing = job.catch(e => console.error('No se pudo integrar la contabilidad', e));
    return job;
  }

  /** ¿La base de datos ya tiene exactamente estos asientos integrados? */
  private inSync(drafts: IntegratedDraft[]): boolean {
    const stored = new Map(this.entries.filter(e => e.sourceKey).map(e => [e.sourceKey!, e]));
    for (const d of drafts) {
      const s = stored.get(d.sourceKey!);
      if (!s) { if (d.status !== 'Anulado') return false; continue; }
      if (signature(s) !== signature(d)) return false;
      stored.delete(d.sourceKey!);
    }
    return [...stored.values()].every(e => e.status === 'Anulado');
  }

  // ── Ajustes y plan de cuentas ────────────────────────

  async saveSettings(changes: Partial<AccountingSettings>, detail: string): Promise<void> {
    const saved = await firstValueFrom(this.http.put<AccountingSettings>(`${BASE}/ajustes`, changes));
    this.settings = { ...saved, mapping: { ...saved.mapping } };
    this.audit.addLog('Contabilidad: ajustes', detail);
    await this.integrate('Manual');
  }

  /** Asigna la cuenta de ingresos de una categoría de consumo y vuelve a integrar. */
  assignAccount(category: string, account: string): Promise<void> {
    return this.saveSettings({ mapping: { ...this.settings.mapping, [category]: account } }, `Categoría «${category}» → ${account}`);
  }

  /**
   * Crea una cuenta (sin `originalCode`) o la edita. Si cambia el código, el servidor pasa sus
   * movimientos al código nuevo: se recargan los comprobantes.
   */
  async saveAccount(a: Account, originalCode?: string): Promise<void> {
    const before = originalCode ? accountByCode(originalCode) : undefined;
    const { system, uses, ...data } = a;
    await firstValueFrom(this.http.put<Account>(`${BASE}/cuentas`, { ...data, originalCode: originalCode ?? '' }));
    setAccounts(await firstValueFrom(this.http.get<Account[]>(`${BASE}/cuentas`)));
    if (before && before.code !== a.code) await this.reloadEntries();
    else this.entries$.next(this.entries);
    const what = !before ? 'Cuenta creada'
      : before.code !== a.code ? `Cuenta ${before.code} pasa a ${a.code}` : 'Cuenta actualizada';
    this.audit.addLog('Contabilidad: plan de cuentas', `${what} · ${a.code} ${a.name} · ${a.cls}${a.active === false ? ' (inactiva)' : ''}`);
  }

  /** Elimina una cuenta creada por error (el servidor lo impide si tiene movimientos o la usa SOGO). */
  async deleteAccount(code: string): Promise<void> {
    const a = accountByCode(code);
    await firstValueFrom(this.http.delete(`${BASE}/cuentas/${code}`));
    setAccounts(await firstValueFrom(this.http.get<Account[]>(`${BASE}/cuentas`)));
    this.entries$.next(this.entries);
    this.audit.addLog('Contabilidad: plan de cuentas', `Cuenta eliminada · ${code} ${a?.name ?? ''}`);
  }

  /** Movimientos integrados del período por módulo (tarjetas de Integración). */
  moduleCounts(period = this.openPeriod): Record<string, number> {
    const out: Record<string, number> = {};
    this.entries.filter(e => e.date.startsWith(period) && e.origin !== 'Manual' && e.status !== 'Anulado')
      .forEach(e => out[e.origin] = (out[e.origin] ?? 0) + 1);
    return out;
  }

  async logExport(file: string, period: string): Promise<void> {
    this.audit.addLog('Contabilidad: exportación', `${file} · ${period}`);
    try {
      await firstValueFrom(this.http.post(`${BASE}/eventos/exportacion`, { file, period }));
      this.exportsLog = [{ file, period, user: this.actor, at: isoDateTime() }, ...this.exportsLog];
    } catch (e) { console.error('No se pudo registrar la exportación', e); }
  }

  /** Asientos con valores provisionales (módulos aún en borrador). */
  provisional(): Entry[] { return this.entries.filter(e => e.status === 'Provisional' && counts(e)); }
}

/** Lo que define un asiento integrado (igual que en el servidor) para saber si cambió. */
function signature(e: Pick<Entry, 'kind' | 'date' | 'time' | 'concept' | 'third' | 'thirdDoc' | 'category' | 'method' | 'origin' | 'sourceRef' | 'status' | 'lines' | 'supports'>): string {
  return [e.kind, e.date, e.time, e.concept, e.third ?? '', e.thirdDoc ?? '', e.category ?? '', e.method ?? '', e.origin, e.sourceRef ?? '', e.status,
    ...e.lines.map(l => `${l.account};${l.detail ?? ''};${l.third ?? ''};${l.costCenter ?? ''};${Math.round(l.debit)};${Math.round(l.credit)}`), (e.supports ?? []).join(',')].join('|');
}
