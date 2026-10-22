import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import {
  Employee, StandingDeduction, Novelty, EMPTY_NOVELTY, PayLine, PayrollRun, Payslip, YearParams, PayrollRates, PayrollPayment, PaymentReceipt,
  liquidate, workedDays, fullName, missingData, salaryAt, periodEnd, periodLabel, payslipNumber, payslipIndex, runTotals, NEQUI_RE,
  setYearParams, setRates, addMonths, PAYROLL_START,
} from './payroll.model';
import { UsersService } from '../users/users.service';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { API_URL } from '../api';
import { SaveQueue, dropNulls } from '../shared/save-queue';

const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));

export type NewEmployee = Omit<Employee, 'id' | 'code' | 'history' | 'deductions'>;

/** Un pago de nómina a un empleado (para el historial de pagos). */
export interface PaymentRow {
  run:     PayrollRun;
  line:    PayLine;
  payslip?: Payslip;
  number:  string;
  status:  'Pagado' | 'Pendiente' | 'Anulado';
  note?:   string;
}

@Injectable({ providedIn: 'root' })
export class PayrollService {

  private employees: Employee[] = [];
  private runs: PayrollRun[] = [];
  private employees$ = new BehaviorSubject<Employee[]>([]);
  private runs$ = new BehaviorSubject<PayrollRun[]>([]);
  private queue = new SaveQueue('el cambio de nómina', () => this.reload());
  private loading?: Promise<void>;
  private loadedFor = '';

  // Empleados (tabla empleados + salarios y deducciones) y nóminas (tabla nominas) de la
  // base de datos. Las pantallas leen la copia en memoria; cada cambio se guarda en orden.
  constructor(private audit: UsersService, private http: HttpClient) {
    // Desactivar una cuenta en Usuarios retira al empleado en el servidor: se recargan las fichas
    audit.statusSaved$.subscribe(() => this.queue.idle().then(() => this.reload()));
  }

  /** Persona de la sesión: queda en el historial y en quién confirmó, pagó o generó. */
  private user(): string { return this.audit.actorName(); }
  get actor(): string { return this.user(); }

  // Permisos del rol en Nómina (el servidor también los exige)
  get canCreate(): boolean { return this.audit.can('Nómina', 'create'); }
  get canEdit(): boolean { return this.audit.can('Nómina', 'edit'); }
  get canAnnul(): boolean { return this.audit.can('Nómina', 'delete'); }
  get canExport(): boolean { return this.audit.can('Nómina', 'export'); }

  /** Primera carga de la sesión actual (el dashboard la espera antes de abrir cualquier módulo). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load();
    }
    return this.loading;
  }

  reload(): Promise<void> {
    return this.loading = this.load();
  }

  private async load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return;
    try {
      const [employees, runs, params, rates] = await Promise.all([
        firstValueFrom(this.http.get<Employee[]>(`${API_URL}/empleados`)),
        firstValueFrom(this.http.get<PayrollRun[]>(`${API_URL}/nominas`)),
        firstValueFrom(this.http.get<YearParams[]>(`${API_URL}/parametros-nomina`)),
        firstValueFrom(this.http.get<PayrollRates | null>(`${API_URL}/configuracion/nomina_tasas`)),
      ]);
      // Primero las reglas legales: con ellas se liquidan los borradores
      setYearParams(params);
      setRates(rates);
      this.employees = employees.map(e => dropNulls({ ...e, weeklyHours: e.weeklyHours ?? null }) as Employee).map(e => ({ ...e, weeklyHours: e.weeklyHours ?? null }));
      this.runs = runs.sort((a, b) => b.period.localeCompare(a.period));
      this.employees$.next(this.employees);
      this.runs$.next(this.runs);
    } catch (e: any) {
      console.error('No se pudo cargar la nómina', e);
      if (e?.status !== 401) toast.error('No se pudieron cargar los empleados y las nóminas', serverMessage(e));
    }
  }

  // ── Empleados ────────────────────────────────────────

  getEmployees(): Observable<Employee[]> { return this.employees$.asObservable(); }
  employeesSnapshot(): Employee[] { return this.employees; }
  getEmployee(id: string): Employee | undefined { return this.employees.find(e => e.id === id); }

  nextCode(): string {
    const n = Math.max(0, ...this.employees.map(e => Number(e.code.split('-')[1])));
    return `EMP-${String(n + 1).padStart(3, '0')}`;
  }

  findByDoc(doc: string, exceptId?: string): Employee | undefined {
    const d = doc.replace(/\D/g, '');
    return d ? this.employees.find(e => e.id !== exceptId && e.docNumber.replace(/\D/g, '') === d) : undefined;
  }

  findByEmail(email: string, exceptId?: string): Employee | undefined {
    const m = email.trim().toLowerCase();
    return m ? this.employees.find(e => e.id !== exceptId && e.email.toLowerCase() === m) : undefined;
  }

  /** Estado que se muestra: un ingreso futuro se ve como "Nuevo · inicia dd/mm". */
  displayStatus(e: Employee): string {
    if (e.status === 'Retirado') {
      return `Retirado${e.retiredAt ? ' · ' + dm(e.retiredAt) + '/' + e.retiredAt.slice(0, 4) : ''}${e.retirementReason ? ' · ' + e.retirementReason : ''}`;
    }
    if (e.hireDate > isoDate(0)) return `Nuevo · inicia ${dm(e.hireDate)}`;
    return e.status;
  }

  createEmployee(data: NewEmployee): Employee {
    const at = isoDateTime();
    const e: Employee = { ...data, id: `e${Date.now()}`, code: this.nextCode(), deductions: [], history: [{ at, by: this.user(), text: 'Empleado registrado' }] };
    this.employees = [...this.employees, e];
    this.employees$.next(this.employees);
    this.queue.run(() => firstValueFrom(this.http.post<Employee>(`${API_URL}/empleados`, e)))
      .then(saved => this.applySaved(saved)).catch(() => undefined);
    this.audit.addLog('Nómina: empleado registrado', `${e.code} · ${fullName(e)} · ${e.position} · ${money(salaryAt(e, e.hireDate))}`);
    return e;
  }

  /**
   * Guarda los cambios y deja el valor anterior en el historial. Un cambio de
   * salario se registra con su fecha de vigencia: las nóminas anteriores a esa
   * fecha se liquidan con el salario anterior.
   */
  updateEmployee(id: string, changes: Partial<NewEmployee>, salary: { amount: number; from: string } | null, summary: string[]): void {
    const prev = this.getEmployee(id);
    if (!prev) return;
    const at = isoDateTime();
    const salaries = salary
      ? [...prev.salaries.filter(s => s.from < salary.from), { from: salary.from, amount: salary.amount }]
      : prev.salaries;
    const history = [...summary.map(text => ({ at, by: this.user(), text })), ...prev.history];
    this.replace({ ...prev, ...changes, salaries, history });
    this.audit.addLog('Nómina: empleado actualizado', `${prev.code} · ${summary.join(' · ')}`);
    // Al retirarlo, el servidor desactiva su cuenta de usuario: se recargan las cuentas para verlo
    if (changes.status === 'Retirado' && prev.status !== 'Retirado') this.queue.idle().then(() => this.audit.reload());
  }

  reactivate(id: string, hireDate: string): void {
    const e = this.getEmployee(id);
    if (!e) return;
    this.replace({ ...e, status: 'Activo', retiredAt: undefined, retirementReason: undefined, hireDate,
      history: [{ at: isoDateTime(), by: this.user(), text: `Reactivado · nuevo ingreso ${dm(hireDate)}/${hireDate.slice(0, 4)}` }, ...e.history] });
    this.audit.addLog('Nómina: empleado reactivado', `${e.code} · ${fullName(e)}`);
  }

  saveDeduction(employeeId: string, d: Omit<StandingDeduction, 'id'> & { id?: string }): void {
    const e = this.getEmployee(employeeId);
    if (!e) return;
    const exists = d.id && e.deductions.some(x => x.id === d.id);
    const deductions = exists
      ? e.deductions.map(x => x.id === d.id ? { ...x, ...d } as StandingDeduction : x)
      : [...e.deductions, { ...d, id: `d${Date.now()}` }];
    const text = `${exists ? 'Deducción actualizada' : 'Deducción agregada'} · ${d.type} ${money(d.amount)}${d.installments ? ` × ${d.installments} cuotas` : ''}`;
    this.replace({ ...e, deductions, history: [{ at: isoDateTime(), by: this.user(), text }, ...e.history] });
    this.audit.addLog('Nómina: deducción autorizada', `${e.code} · ${text}`);
  }

  removeDeduction(employeeId: string, deductionId: string): void {
    const e = this.getEmployee(employeeId);
    const d = e?.deductions.find(x => x.id === deductionId);
    if (!e || !d) return;
    const text = `Deducción retirada · ${d.type} ${money(d.amount)}`;
    this.replace({ ...e, deductions: e.deductions.filter(x => x.id !== deductionId), history: [{ at: isoDateTime(), by: this.user(), text }, ...e.history] });
    this.audit.addLog('Nómina: deducción autorizada', `${e.code} · ${text}`);
  }

  private replace(e: Employee): void {
    this.employees = this.employees.map(x => x.id === e.id ? e : x);
    this.employees$.next(this.employees);
    this.queue.run(() => firstValueFrom(this.http.put<Employee>(`${API_URL}/empleados/${e.id}`, e)))
      .then(saved => this.applySaved(saved)).catch(() => undefined);
    this.runs$.next(this.runs);        // los borradores se recalculan con los datos nuevos
  }

  /**
   * Lo que decide el servidor: el código definitivo (EMP-…, único en la base de datos) y la
   * cuenta de usuario vinculada (se vincula sola si hay un usuario con el mismo documento).
   */
  private applySaved(saved: Employee): void {
    const local = this.getEmployee(saved.id);
    if (!local || (local.code === saved.code && local.userId === saved.userId)) return;
    const linked = !!saved.userId && saved.userId !== local.userId;
    this.employees = this.employees.map(x => x.id === saved.id ? { ...x, code: saved.code, userId: saved.userId } : x);
    this.employees$.next(this.employees);
    if (linked) this.audit.reload();
  }

  /**
   * Cargos para escoger: los roles de Usuarios y los que ya tienen los empleados
   * (salen de la base de datos, no de una lista fija).
   */
  positions(): string[] {
    const fromRoles = this.audit.rolesSnapshot().map(r => r.name).filter(n => !/^(Consulta|Administrador)$/i.test(n));
    return [...new Set([...this.employees.map(e => e.position), ...fromRoles, 'Administrador'].filter(Boolean))].sort();
  }

  /** Cuentas activas o pendientes de Usuarios que aún no tienen ficha de empleado. */
  usersWithoutEmployee() {
    const linked = new Set(this.employees.map(e => e.userId).filter(Boolean));
    const docs = new Set(this.employees.map(e => e.docNumber.replace(/\D/g, '')).filter(Boolean));
    return this.audit.usersSnapshot().filter(u => (u.status === 'Activo' || u.status === 'Pendiente')
      && !linked.has(u.id) && !u.employeeId && !docs.has(u.docNumber.replace(/\D/g, '')));
  }

  /** Cuenta de usuario de SOGO del empleado (vinculada, o la que tiene su mismo documento). */
  accountOf(e: Employee) {
    const doc = e.docNumber.replace(/\D/g, '');
    return this.audit.usersSnapshot().find(u => u.id === e.userId || u.employeeId === e.id)
      ?? (doc ? this.audit.usersSnapshot().find(u => u.docNumber.replace(/\D/g, '') === doc) : undefined);
  }

  // ── Nóminas ──────────────────────────────────────────

  getRuns(): Observable<PayrollRun[]> { return this.runs$.asObservable(); }
  runsSnapshot(): PayrollRun[] { return this.runs; }
  getRun(id: string): PayrollRun | undefined { return this.runs.find(r => r.id === id); }

  currentPeriod(): string { return isoDate(0).slice(0, 7); }

  /**
   * Mes en el que se trabaja en Nómina: lo fija Liquidar nómina (o el selector de cada pantalla)
   * y las demás pantallas del módulo abren en él. Se recuerda durante la sesión del navegador.
   */
  workPeriod(): string {
    try {
      const p = sessionStorage.getItem('sogo_nomina_periodo');
      if (p && /^\d{4}-\d{2}$/.test(p)) return p;
    } catch { /* sin almacenamiento: mes actual */ }
    return this.currentPeriod();
  }
  setWorkPeriod(period: string): void {
    try { sessionStorage.setItem('sogo_nomina_periodo', period); } catch { /* solo conveniencia */ }
  }
  /** Nómina vigente (no anulada) del mes de trabajo, sin crearla. */
  workRun(): PayrollRun | undefined {
    const p = this.workPeriod();
    return this.runs.find(r => r.period === p && r.status !== 'Anulada');
  }

  /**
   * Guarda los parámetros legales en la base de datos (los años modificados y los porcentajes
   * de ley). Los borradores se recalculan; las nóminas confirmadas guardan su copia.
   */
  async saveParams(years: YearParams[], rates: PayrollRates | null, detail: string): Promise<void> {
    for (const p of years) await firstValueFrom(this.http.put(`${API_URL}/parametros-nomina/${p.year}`, p));
    if (rates) await firstValueFrom(this.http.put(`${API_URL}/configuracion/nomina_tasas`, rates));
    setYearParams(await firstValueFrom(this.http.get<YearParams[]>(`${API_URL}/parametros-nomina`)));
    setRates(rates);
    this.runs$.next([...this.runs]);
    this.audit.addLog('Nómina: parámetros legales actualizados', detail);
  }

  /**
   * Nómina del período actual. Si no existe y el rol puede crear nóminas, se abre en borrador;
   * si no, se muestra la más reciente (solo consulta).
   */
  currentRun(): PayrollRun | undefined {
    return this.openRun(this.currentPeriod());
  }

  /**
   * Meses que se pueden liquidar: desde agosto de 2026 (PAYROLL_START)
   * hasta el actual, más los que ya tengan nómina. El más reciente primero.
   */
  liquidablePeriods(): string[] {
    const list = new Set(this.runs.map(r => r.period));
    for (let p = PAYROLL_START; p <= this.currentPeriod(); p = addMonths(p, 1)) list.add(p);
    return [...list].sort().reverse();
  }

  /**
   * Nómina vigente de un mes (actual o anterior). Si no existe y el rol puede crear nóminas, se
   * abre en borrador; si no, se muestra la más reciente (solo consulta).
   */
  openRun(period: string): PayrollRun | undefined {
    const existing = this.runs.find(r => r.period === period && r.status !== 'Anulada');
    if (existing) return existing;
    if (!this.canCreate || period > this.currentPeriod()) return this.runs.find(r => r.status !== 'Anulada') ?? this.runs[0];
    // Si el período tuvo una nómina anulada, la nueva lleva otro id (la anulada se conserva)
    const base = `n${period}`;
    const id = this.runs.some(r => r.id === base) ? `${base}-${Date.now().toString(36)}` : base;
    const run: PayrollRun = {
      id, period, payDate: periodEnd(period), status: 'Borrador', novelties: {}, payslips: {},
      createdAt: isoDateTime(), createdBy: this.user(),
    };
    this.runs = [run, ...this.runs].sort((a, b) => b.period.localeCompare(a.period));
    this.runs$.next(this.runs);
    this.saveRun(run.id);
    return run;
  }

  /** Empleados que se liquidan en el período (laboran al menos un día). */
  employeesFor(period: string): Employee[] {
    return this.employees.filter(e => workedDays(e, period) > 0).sort((a, b) => a.code.localeCompare(b.code));
  }

  /** Líneas de la nómina: la copia guardada si está cerrada, o el cálculo vivo si es borrador. */
  linesFor(run: PayrollRun): PayLine[] {
    if (run.lines) return run.lines;
    return this.employeesFor(run.period).map(e => liquidate(e, run.period, run.novelties[e.id] ?? EMPTY_NOVELTY));
  }

  /** Líneas vigentes: un comprobante anulado y corregido se reemplaza por su corrección. */
  effectiveLines(run: PayrollRun): PayLine[] {
    const fixes = new Map((run.corrections ?? []).map(c => [c.employeeId, c.line]));
    return this.linesFor(run).map(l => fixes.get(l.employeeId) ?? l);
  }

  /** Empleados que no se liquidan este período y por qué (para el resumen). */
  excludedFor(period: string): string[] {
    return this.employees.filter(e => workedDays(e, period) === 0).map(e =>
      e.status === 'Retirado' ? `${e.code} retirado` : e.hireDate > periodEnd(period) ? `${e.code} inicia en ${periodLabel(e.hireDate.slice(0, 7)).toLowerCase()}` : `${e.code} sin días`);
  }

  setNovelty(runId: string, employeeId: string, nov: Novelty): void {
    this.patch(runId, r => r.status !== 'Borrador' ? r : { ...r, novelties: { ...r.novelties, [employeeId]: { ...nov } } });
  }

  saveDraft(runId: string): void {
    const run = this.getRun(runId);
    if (run) this.audit.addLog('Nómina: borrador guardado', `${periodLabel(run.period)} · ${money(runTotals(this.linesFor(run)).net)} neto`);
  }

  /** Cierra la liquidación: guarda la copia, contabiliza y deja la nómina pendiente de pago. */
  confirm(runId: string): void {
    const run = this.getRun(runId);
    if (!run || run.status !== 'Borrador') return;
    const lines = this.linesFor(run);
    if (lines.some(l => l.issues.length)) throw new Error('Hay empleados con datos incompletos');
    const t = runTotals(lines);
    const at = isoDateTime();
    // Contabilidad integra la causación a partir de la nómina confirmada (no se crea aquí)
    this.patch(runId, r => ({ ...r, status: 'Confirmada', lines, confirmedAt: at, confirmedBy: this.user() }));
    this.audit.addLog('Nómina: liquidación confirmada', `${periodLabel(run.period)} · ${t.employees} empleados · neto ${money(t.net)}`);
  }

  /** Genera (numera) los comprobantes de una nómina cerrada. */
  generatePayslips(runId: string, employeeIds?: string[]): number {
    const run = this.getRun(runId);
    if (!run || run.status === 'Borrador' || run.status === 'Anulada') return 0;
    const at = isoDateTime();
    const payslips = { ...run.payslips };
    let count = 0;
    this.linesFor(run).forEach(l => {
      if (payslips[l.employeeId] || (employeeIds && !employeeIds.includes(l.employeeId))) return;
      payslips[l.employeeId] = { number: this.payslipFor(run, l.employeeId).number, generatedAt: at, generatedBy: this.user(), status: 'Generado' };
      count++;
    });
    this.patch(runId, r => ({ ...r, payslips }));
    if (count) this.audit.addLog('Nómina: comprobantes generados', `${periodLabel(run.period)} · ${count} comprobante(s)`);
    return count;
  }

  /**
   * Número que tendrá (o tiene) el comprobante de un empleado. El consecutivo es por período
   * y sigue después de los ya usados, incluso los de una nómina anulada del mismo mes: un
   * número nunca se repite (en la base de datos es único).
   */
  payslipFor(run: PayrollRun, employeeId: string): { number: string; payslip?: Payslip } {
    const fix = run.corrections?.find(c => c.employeeId === employeeId);
    if (fix) return { number: fix.payslip.number, payslip: fix.payslip };
    const p = run.payslips[employeeId];
    if (p) return { number: p.number, payslip: p };
    const pending = this.linesFor(run).filter(l => !run.payslips[l.employeeId]);
    const k = pending.findIndex(l => l.employeeId === employeeId);
    return { number: payslipNumber(run.period, this.lastPayslip(run.period) + Math.max(0, k) + 1) };
  }

  /** Último consecutivo de comprobante usado en el período (todas sus nóminas). */
  private lastPayslip(period: string): number {
    return Math.max(0, ...this.runs.filter(r => r.period === period).flatMap(r => [
      ...Object.values(r.payslips).map(p => payslipIndex(p.number)),
      ...(r.corrections ?? []).map(c => payslipIndex(c.payslip.number)),
    ]));
  }

  sendPayslip(runId: string, employeeId: string, email: string): void {
    this.patch(runId, r => {
      const p = r.payslips[employeeId];
      return p ? { ...r, payslips: { ...r.payslips, [employeeId]: { ...p, sentTo: email } } } : r;
    });
    this.audit.addLog('Nómina: comprobante enviado', `${this.getRun(runId)?.payslips[employeeId]?.number} · ${email}`);
  }

  /**
   * Registra el pago Nequi de un empleado (después de transferirle desde la app de Nequi):
   * su neto exacto, al número de su ficha, con la referencia de la transacción. Se genera su
   * comprobante. Cuando todos los empleados tienen su pago, la nómina queda Pagada.
   */
  registerPayment(runId: string, employeeId: string, reference: string): string {
    const run = this.getRun(runId);
    if (!run || run.status !== 'Confirmada') return 'La nómina debe estar confirmada para registrar pagos.';
    const line = this.effectiveLines(run).find(l => l.employeeId === employeeId);
    if (!line) return 'El empleado no hace parte de esta nómina.';
    if (run.payments?.[employeeId]) return 'Este pago ya está registrado.';
    const to = line.payTo || this.getEmployee(employeeId)?.accountNumber || '';
    if (!NEQUI_RE.test(to)) return `${line.name} no tiene un número Nequi válido en su ficha.`;
    const ref = reference.trim();
    if (ref.length < 4) return 'Escribe la referencia de la transferencia Nequi (aparece en el comprobante de la app).';
    const used = this.runs.some(r => Object.values(r.payments ?? {}).some(p => p.reference === ref));
    if (used) return `La referencia ${ref} ya se registró en otro pago.`;

    this.generatePayslips(runId, [employeeId]);
    const payment: PayrollPayment = { method: 'Nequi', to, amount: line.net, reference: ref, paidAt: isoDateTime(), paidBy: this.user() };
    this.patch(runId, r => {
      const payments = { ...(r.payments ?? {}), [employeeId]: payment };
      const all = this.effectiveLines(r).every(l => payments[l.employeeId]);
      return all ? { ...r, payments, status: 'Pagada', paidAt: isoDateTime(), paidBy: this.user() } : { ...r, payments };
    });
    this.audit.addLog('Nómina: pago registrado', `${periodLabel(run.period)} · ${line.name} · Nequi ${to} · ${money(line.net)} · ref. ${ref}`);
    return '';
  }

  /** Firma de recibido del empleado: confirma que le llegó el pago. Se registra una sola vez. */
  signReceipt(runId: string, employeeId: string, name: string, signature: string): string {
    const run = this.getRun(runId);
    const p = run?.payments?.[employeeId];
    if (!run || !p) return 'Primero se registra el pago.';
    if (p.receipt) return 'La firma ya quedó registrada.';
    if (name.trim().length < 3) return 'Escribe el nombre de quien firma.';
    const receipt: PaymentReceipt = { at: isoDateTime(), name: name.trim(), signature };
    this.patch(runId, r => ({ ...r, payments: { ...r.payments, [employeeId]: { ...r.payments![employeeId], receipt } } }));
    this.audit.addLog('Nómina: firma de recibido', `${periodLabel(run.period)} · ${name.trim()} · ref. ${p.reference}`);
    return '';
  }

  /** Cuántos empleados de la nómina tienen pago registrado y cuántos firmaron. */
  paymentProgress(run: PayrollRun): { total: number; paid: number; signed: number } {
    const lines = this.effectiveLines(run);
    const pays = run.payments ?? {};
    return { total: lines.length, paid: lines.filter(l => pays[l.employeeId]).length, signed: lines.filter(l => pays[l.employeeId]?.receipt).length };
  }

  annulRun(runId: string, reason: string): void {
    const run = this.getRun(runId);
    if (!run || run.status === 'Pagada' || run.status === 'Anulada') return;
    if (Object.keys(run.payments ?? {}).length) return;   // ya salió dinero: no se anula
    const at = isoDateTime();
    this.patch(runId, r => ({ ...r, status: 'Anulada', annulment: { at, by: this.user(), reason } }));
    this.audit.addLog('Nómina: liquidación anulada', `${periodLabel(run.period)} · ${reason}`);
  }

  /** Pagos de un empleado en todas las nóminas (incluye comprobantes anulados y corregidos). */
  paymentsFor(employeeId: string): PaymentRow[] {
    const rows: PaymentRow[] = [];
    this.runs.forEach(run => {
      const line = this.linesFor(run).find(l => l.employeeId === employeeId);
      if (!line) return;
      const original = run.payslips[employeeId];
      const status: PaymentRow['status'] = run.status === 'Anulada' || original?.status === 'Anulado' ? 'Anulado'
        : run.payments?.[employeeId] ? 'Pagado' : 'Pendiente';
      rows.push({ run, line, payslip: original, number: this.payslipFor({ ...run, corrections: [] }, employeeId).number, status,
        note: original?.status === 'Anulado' ? `Reemplazado por ${original.replacedBy} · ${original.reason}` : undefined });
      const fix = run.corrections?.find(c => c.employeeId === employeeId);
      if (fix) rows.push({ run, line: fix.line, payslip: fix.payslip, number: fix.payslip.number, status: run.status === 'Pagada' ? 'Pagado' : 'Pendiente', note: 'Corregido' });
    });
    return rows.sort((a, b) => b.run.period.localeCompare(a.run.period) || (a.status === 'Anulado' ? 1 : -1));
  }

  private patch(runId: string, fn: (r: PayrollRun) => PayrollRun): void {
    this.runs = this.runs.map(r => r.id === runId ? fn(r) : r);
    this.runs$.next(this.runs);
    if (this.getRun(runId)) this.saveRun(runId);
  }

  /**
   * Se envía la versión más reciente al momento de guardar y se toma lo que decide el servidor
   * (quién y cuándo pagó, confirmó, firmó...), para que la siguiente escritura coincida con él.
   */
  private saveRun(runId: string): void {
    this.queue.run(() => {
      const run = this.getRun(runId);
      return run ? firstValueFrom(this.http.put<PayrollRun>(`${API_URL}/nominas/${runId}`, run)) : Promise.resolve(undefined);
    }).then(saved => saved && this.applyServerRun(saved)).catch(() => undefined);
  }

  private applyServerRun(saved: PayrollRun): void {
    this.runs = this.runs.map(r => {
      if (r.id !== saved.id) return r;
      const payments: Record<string, PayrollPayment> = { ...(r.payments ?? {}) };
      Object.entries(saved.payments ?? {}).forEach(([k, p]) => payments[k] = { ...p, receipt: p.receipt ?? r.payments?.[k]?.receipt });
      return { ...r, createdBy: saved.createdBy, confirmedBy: saved.confirmedBy ?? r.confirmedBy, paidBy: saved.paidBy ?? r.paidBy,
        annulment: saved.annulment ?? r.annulment, payments };
    });
    this.runs$.next(this.runs);
  }

  // ── Resumen ──────────────────────────────────────────

  getStats() {
    const today = isoDate(0);
    const active = this.employees.filter(e => e.status !== 'Retirado');
    const soon = isoDate(60);
    return {
      active: active.length,
      monthlyBase: active.reduce((s, e) => s + salaryAt(e, today), 0),
      incomplete: active.filter(e => missingData(e).length),
      expiring: active.filter(e => e.contractEnd && e.contractEnd >= today && e.contractEnd <= soon),
    };
  }

}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
