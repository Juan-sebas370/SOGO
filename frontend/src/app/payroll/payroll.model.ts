// =====================================================
// NÓMINA — modelo y motor de liquidación (Colombia)
// La liquidación se deriva de los datos del empleado, las novedades del
// período y las reglas vigentes. Al confirmarla se guarda una copia (snapshot)
// para que un cambio posterior de salario no altere una nómina cerrada.
// Los porcentajes deben validarse con el contador antes de producción.
// =====================================================

// ── Reglas legales por fecha ─────────────────────────

export interface PayrollRules {
  smmlv:           number;
  transportAid:    number;
  weeklyHours:     number;      // jornada máxima legal
  extraDay:        number;      // hora extra diurna: +25 %
  extraNight:      number;      // hora extra nocturna: +75 %
  nightSurcharge:  number;      // recargo nocturno: +35 %
  sundaySurcharge: number;      // recargo dominical / festivo (Ley 2466 de 2025)
  sundayFrom:      string;      // desde cuándo aplica ese recargo
}

/**
 * Valores base por año (Configuración › Parámetros de nómina, tabla `parametros_nomina`).
 * Las nóminas confirmadas guardan su copia, así que cambiar un año no altera lo
 * liquidado: solo se recalculan los borradores.
 */
export interface YearParams {
  year: number; smmlv: number; transportAid: number; extraDay: number; extraNight: number; nightSurcharge: number;
  weeklyHours?: number;
  status: 'Cerrado' | 'Vigente' | 'Borrador'; updatedAt: string; updatedBy: string;
}
/** Se llena con lo que hay en la base de datos al iniciar sesión (PayrollService). */
export const YEAR_PARAMS: Record<number, YearParams> = {};

/** Reemplaza los parámetros por año con los de la base de datos. */
export function setYearParams(list: YearParams[]): void {
  Object.keys(YEAR_PARAMS).forEach(k => delete YEAR_PARAMS[+k]);
  list.forEach(p => YEAR_PARAMS[p.year] = p);
}

/** Porcentajes de ley guardados en Configuración (clave `nomina_tasas`). */
export interface PayrollRates {
  employee:  typeof EMPLOYEE_RATES;
  employer:  typeof EMPLOYER_RATES;
  arl:       Record<ArlRisk, number>;
  provision: typeof PROVISION_RATES;
  /** Exoneración art. 114-1 E.T.: sin salud del empleador, SENA ni ICBF para salarios < 10 SMMLV. */
  exempt114?: boolean;
}
/** ¿Aplica la exoneración del art. 114-1? El informe del contador liquida con aportes completos: no. */
export const EXEMPTION = { exempt114: false };
export function setRates(r: Partial<PayrollRates> | null | undefined): void {
  if (!r) return;
  if (r.employee) Object.assign(EMPLOYEE_RATES, r.employee);
  if (r.employer) Object.assign(EMPLOYER_RATES, r.employer);
  if (r.arl) Object.assign(ARL_RATES, r.arl);
  if (r.provision) Object.assign(PROVISION_RATES, r.provision);
  if (typeof r.exempt114 === 'boolean') EXEMPTION.exempt114 = r.exempt114;
  // 8,33 % y 4,17 % son las fracciones de ley redondeadas (días ÷ 360 y ÷ 720): se usa la exacta, como el contador
  const exact = (v: number) => Math.abs(v - 1 / 12) < 1e-4 ? 1 / 12 : Math.abs(v - 1 / 24) < 1e-4 ? 1 / 24 : v;
  (['cesantias', 'prima', 'vacaciones'] as const).forEach(k => PROVISION_RATES[k] = exact(PROVISION_RATES[k]));
}
export const currentRates = (): PayrollRates => ({
  employee: { ...EMPLOYEE_RATES }, employer: { ...EMPLOYER_RATES }, arl: { ...ARL_RATES }, provision: { ...PROVISION_RATES },
  exempt114: EXEMPTION.exempt114,
});

/** Reglas vigentes al cierre del período (YYYY-MM-DD). */
export function rulesFor(date: string): PayrollRules {
  const y = +date.slice(0, 4);
  const known = Object.keys(YEAR_PARAMS).map(Number).filter(k => k <= y).sort((a, b) => b - a)[0];
  const p = YEAR_PARAMS[y] ?? (known ? YEAR_PARAMS[known] : undefined);
  const smmlv = p?.smmlv ?? 1300000;
  const transportAid = p?.transportAid ?? 162000;
  // Reducción gradual de la jornada (Ley 2101 de 2021): 42 h desde el 15/07/2026
  const weeklyHours = date >= '2026-07-15' ? 42 : date >= '2025-07-15' ? 44 : 46;
  // Recargo dominical: 80 % desde 07/2025, 90 % desde 07/2026, 100 % desde 07/2027
  const [sundaySurcharge, sundayFrom] =
    date >= '2027-07-01' ? [1, '2027-07-01'] : date >= '2026-07-01' ? [0.9, '2026-07-01']
    : date >= '2025-07-01' ? [0.8, '2025-07-01'] : [0.75, '2025-01-01'];
  return { smmlv, transportAid, weeklyHours, extraDay: p?.extraDay ?? 0.25, extraNight: p?.extraNight ?? 0.75, nightSurcharge: p?.nightSurcharge ?? 0.35, sundaySurcharge, sundayFrom };
}

/** Horas ordinarias del mes: jornada semanal ÷ 6 días × 30 días. */
export const monthlyHours = (r: PayrollRules) => (r.weeklyHours / 6) * 30;

export const EMPLOYEE_RATES = { health: 0.04, pension: 0.04, solidarity: 0.01 };
// Aportes del empleador. Salud, SENA e ICBF quedan en 0 si se activa la exoneración (EXEMPTION)
export const EMPLOYER_RATES = { health: 0.085, pension: 0.12, ccf: 0.04, sena: 0.02, icbf: 0.03 };
export const ARL_RATES: Record<ArlRisk, number> = { I: 0.00522, II: 0.01044, III: 0.02436, IV: 0.0435, V: 0.0696 };
// Intereses: 12 % anual ÷ 12 sobre la cesantía del mes (formato del contador). Dotación: provisión sobre el salario
export const PROVISION_RATES = { cesantias: 1 / 12, intereses: 0.01, prima: 1 / 12, vacaciones: 1 / 24, dotacion: 0.025 };

// ── Empleados ────────────────────────────────────────

export type EmployeeStatus = 'Activo' | 'Vacaciones' | 'Retirado';
export type ContractType = 'Término indefinido' | 'Término fijo' | 'Obra o labor' | 'Aprendizaje';
export type ArlRisk = 'I' | 'II' | 'III' | 'IV' | 'V';
// El hospedaje no vende comida: no hay área de restaurante
export type Area = 'Recepción' | 'Alojamiento' | 'Administración' | 'Mantenimiento';

export const AREAS: Area[] = ['Recepción', 'Alojamiento', 'Administración', 'Mantenimiento'];

/** Medios de pago de la nómina. Por ahora solo Nequi (se pueden agregar otros más adelante). */
export type PaymentMethod = 'Nequi';
export const PAYMENT_METHODS: PaymentMethod[] = ['Nequi'];
/** Número Nequi = celular colombiano de 10 dígitos que empieza por 3. */
export const NEQUI_RE = /^3\d{9}$/;
export const nequiFmt = (n: string) => n ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : '';
export const CONTRACT_TYPES: ContractType[] = ['Término indefinido', 'Término fijo', 'Obra o labor', 'Aprendizaje'];

export type RetirementReason = 'Renuncia voluntaria' | 'Despido con justa causa' | 'Despido sin justa causa' | 'Terminación del contrato'
  | 'Mutuo acuerdo' | 'Pensión' | 'Fallecimiento' | 'Otro';
export const RETIREMENT_REASONS: RetirementReason[] = ['Renuncia voluntaria', 'Despido con justa causa', 'Despido sin justa causa',
  'Terminación del contrato', 'Mutuo acuerdo', 'Pensión', 'Fallecimiento', 'Otro'];
export const DOC_TYPES = ['CC · Cédula de ciudadanía', 'CE · Cédula de extranjería', 'PPT · Permiso por protección temporal', 'PA · Pasaporte'];
export const EPS_LIST = ['Nueva EPS', 'EPS Sura', 'Sanitas', 'Salud Total', 'Compensar', 'Famisanar', 'Coosalud'];
export const PENSION_LIST = ['Colpensiones', 'Porvenir', 'Protección', 'Colfondos', 'Skandia'];
export const ARL_LIST = ['Positiva', 'ARL Sura', 'Colmena', 'Seguros Bolívar', 'AXA Colpatria'];
export const CCF_LIST = ['Comfenalco Quindío', 'Comfamiliar Risaralda', 'Confa'];

export type DeductionType = 'Préstamo empresa' | 'Libranza' | 'Embargo judicial' | 'Aporte voluntario' | 'Otro descuento autorizado';
export const DEDUCTION_TYPES: DeductionType[] = ['Préstamo empresa', 'Libranza', 'Embargo judicial', 'Aporte voluntario', 'Otro descuento autorizado'];

/** Descuento autorizado por el empleado: se aplica cada mes desde `fromPeriod` hasta completar sus cuotas. */
export interface StandingDeduction {
  id:          string;
  type:        DeductionType;
  description: string;
  amount:      number;          // por período
  installments: number | null;  // null = hasta nueva orden (embargo, aporte voluntario)
  fromPeriod:  string;          // YYYY-MM
}

export interface EmployeeChange { at: string; by: string; text: string; }

export interface Employee {
  id:            string;
  code:          string;        // EMP-001
  firstName:     string;
  lastName:      string;
  birthDate:     string;
  docType:       string;
  docNumber:     string;
  email:         string;
  phone:         string;
  address:       string;
  position:      string;
  area:          Area;
  hireDate:      string;        // YYYY-MM-DD
  status:        EmployeeStatus;
  retiredAt?:    string;
  retirementReason?: RetirementReason;   // por qué salió (despido, renuncia...)
  contractType:  ContractType;
  contractEnd?:  string;        // término fijo / obra
  weeklyHours:   number | null;  // null = tiempo completo (sigue la jornada legal vigente)
  /** Salario por vigencia: el que aplica a una fecha es el último con `from` ≤ fecha. */
  salaries:      { from: string; amount: number }[];
  eps:           string;
  pensionFund:   string;
  arl:           string;
  arlRisk:       ArlRisk;
  ccf:           string;
  bank:          PaymentMethod | string;   // medio de pago: 'Nequi'
  accountType:   string;
  accountNumber: string;                   // número Nequi (celular)
  deductions:    StandingDeduction[];
  history:       EmployeeChange[];
  userId?:       string;        // cuenta de usuario de SOGO vinculada (la pone el servidor)
}

export const fullName = (e: Pick<Employee, 'firstName' | 'lastName'>) => `${e.firstName} ${e.lastName}`.trim();
export const initials = (e: Pick<Employee, 'firstName' | 'lastName'>) => `${e.firstName[0] ?? ''}${e.lastName[0] ?? ''}`.toUpperCase();

export function salaryAt(e: Employee, date: string): number {
  const list = [...e.salaries].sort((a, b) => a.from.localeCompare(b.from));
  return (list.filter(s => s.from <= date).pop() ?? list[0])?.amount ?? 0;
}

/** Datos sin los cuales la planilla de seguridad social no se puede reportar. */
export function missingData(e: Employee): string[] {
  const missing: string[] = [];
  if (!e.docNumber) missing.push('número de documento');
  if (!e.eps) missing.push('EPS');
  if (!e.pensionFund) missing.push('fondo de pensiones');
  if (!e.arl) missing.push('ARL');
  if (!e.ccf) missing.push('caja de compensación');
  if (!NEQUI_RE.test(e.accountNumber ?? '')) missing.push('número Nequi');
  if (!e.address) missing.push('dirección');
  return missing;
}

// ── Períodos ─────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Primer mes que se liquida en SOGO: agosto de 2026 (el informe del contador empieza en septiembre). */
export const PAYROLL_START = '2026-08';

/** "2026-09" → "Septiembre 2026" */
export function periodLabel(p: string): string {
  const m = MONTHS[+p.slice(5, 7) - 1];
  return `${m[0].toUpperCase()}${m.slice(1)} ${p.slice(0, 4)}`;
}
export const monthShort = (p: string) => periodLabel(p).slice(0, 3);
export const periodStart = (p: string) => `${p}-01`;
export function periodEnd(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${p}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}
export function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const monthsBetween = (from: string, to: string) =>
  (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));

/** Días laborados en el período con mes comercial de 30 días. */
export function workedDays(e: Employee, period: string): number {
  const start = periodStart(period), end = periodEnd(period);
  if (e.hireDate > end || (e.retiredAt && e.retiredAt < start)) return 0;
  const from = e.hireDate > start ? Math.min(30, +e.hireDate.slice(8, 10)) : 1;
  const to = e.retiredAt && e.retiredAt < end ? Math.min(30, +e.retiredAt.slice(8, 10)) : 30;
  return Math.max(0, to - from + 1);
}

// ── Liquidación ──────────────────────────────────────

/** Novedades del período para un empleado (horas y bonificaciones). */
export interface Novelty {
  extraDay:        number;     // horas extra diurnas
  extraNight:      number;     // horas extra nocturnas
  nightHours:      number;     // horas ordinarias nocturnas (recargo)
  sundayHours:     number;     // horas ordinarias en dominical / festivo (recargo)
  bonusSalary:     number;     // bonificación salarial (hace parte del IBC)
  bonusNonSalary:  number;     // bonificación no salarial (art. 128 CST)
}
export const EMPTY_NOVELTY: Novelty = { extraDay: 0, extraNight: 0, nightHours: 0, sundayHours: 0, bonusSalary: 0, bonusNonSalary: 0 };

export interface EarningLine { concept: string; detail: string; value: number; ibc: boolean; kind: 'salary' | 'extra' | 'bonus' | 'transport'; }
export interface DeductionLine { concept: string; kind: 'Legal' | 'Autorizada'; calc: string; value: number; deductionId?: string; }

export interface PayLine {
  employeeId:   string;
  code:         string;
  name:         string;
  docNumber:    string;
  position:     string;
  area:         Area;
  contractType: ContractType;
  weeklyHours:  number;
  baseSalary:   number;
  days:         number;
  hourValue:    number;
  earnings:     EarningLine[];
  deductions:   DeductionLine[];
  ibc:          number;
  totalEarnings: number;
  totalDeductions: number;
  net:          number;
  // health, sena, icbf y dotacion no están en las nóminas confirmadas antes de agregarlos (cuentan 0)
  employer:     { health?: number; pension: number; arl: number; ccf: number; sena?: number; icbf?: number; total: number };
  provisions:   { cesantias: number; intereses: number; prima: number; vacaciones: number; dotacion?: number; total: number };
  account:      string;          // "Nequi 310 482 7719"
  payTo?:       string;          // número Nequi al que se paga (congelado al confirmar)
  issues:       string[];        // datos faltantes (la línea queda "Revisar")
  note?:        string;          // "Liquidación final · retiro 31/08"
}

const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(Math.round(v));
const hours = (n: number, what: string) => `${n} h ${what}`;

/** Liquida un empleado para un período. Todos los valores se redondean al peso. */
export function liquidate(e: Employee, period: string, nov: Novelty = EMPTY_NOVELTY): PayLine {
  const end = periodEnd(period);
  const rules = rulesFor(end);
  const base = salaryAt(e, end);
  const days = workedDays(e, period);
  const weekly = e.weeklyHours ?? rules.weeklyHours;
  const hourValue = base / monthlyHours({ ...rules, weeklyHours: weekly });
  const round = Math.round;

  const earnings: EarningLine[] = [{ concept: 'Salario básico', detail: `${days} días`, value: round(base * days / 30), ibc: true, kind: 'salary' }];
  // Extra: hora completa + recargo · recargo nocturno / dominical: solo el recargo (la hora ya está en el salario)
  const extra = (n: number, rate: number, concept: string) => {
    if (n > 0) earnings.push({ concept, detail: `${n} h × ${money(hourValue * rate)}`, value: round(n * hourValue * rate), ibc: true, kind: 'extra' });
  };
  extra(nov.extraDay, 1 + rules.extraDay, `Hora extra diurna (${Math.round(rules.extraDay * 100)} %)`);
  extra(nov.extraNight, 1 + rules.extraNight, `Hora extra nocturna (${Math.round(rules.extraNight * 100)} %)`);
  extra(nov.nightHours, rules.nightSurcharge, `Recargo nocturno (${Math.round(rules.nightSurcharge * 100)} %)`);
  extra(nov.sundayHours, rules.sundaySurcharge, `Recargo dominical (${Math.round(rules.sundaySurcharge * 100)} %)`);
  if (nov.bonusSalary > 0) earnings.push({ concept: 'Bonificación salarial', detail: '', value: round(nov.bonusSalary), ibc: true, kind: 'bonus' });
  if (nov.bonusNonSalary > 0) earnings.push({ concept: 'Bonificación no salarial', detail: 'Art. 128 CST', value: round(nov.bonusNonSalary), ibc: false, kind: 'bonus' });
  // Auxilio de transporte: salarios de hasta 2 SMMLV, proporcional a los días
  if (base <= 2 * rules.smmlv && days > 0) {
    earnings.push({ concept: 'Auxilio de transporte', detail: `${days} días`, value: round(rules.transportAid * days / 30), ibc: false, kind: 'transport' });
  }

  const ibc = earnings.filter(x => x.ibc).reduce((s, x) => s + x.value, 0);
  const totalEarnings = earnings.reduce((s, x) => s + x.value, 0);
  const pct = (r: number) => `${Math.round(r * 100)}% × ${money(ibc)}`;
  const deductions: DeductionLine[] = [
    { concept: 'Salud', kind: 'Legal', calc: pct(EMPLOYEE_RATES.health), value: round(ibc * EMPLOYEE_RATES.health) },
    { concept: 'Pensión', kind: 'Legal', calc: pct(EMPLOYEE_RATES.pension), value: round(ibc * EMPLOYEE_RATES.pension) },
    ibc >= 4 * rules.smmlv
      ? { concept: 'Fondo de solidaridad pensional', kind: 'Legal', calc: pct(EMPLOYEE_RATES.solidarity), value: round(ibc * EMPLOYEE_RATES.solidarity) }
      : { concept: 'Fondo de solidaridad pensional', kind: 'Legal', calc: 'No aplica · IBC menor a 4 SMMLV', value: 0 },
  ];
  e.deductions.forEach(d => {
    const n = monthsBetween(d.fromPeriod, period) + 1;
    if (n < 1 || (d.installments !== null && n > d.installments) || days === 0) return;
    const calc = d.installments === null ? d.description || 'Mensual' : `Cuota ${n} de ${d.installments} · saldo ${money(d.amount * (d.installments - n))}`;
    deductions.push({ concept: d.type, kind: 'Autorizada', calc, value: d.amount, deductionId: d.id });
  });
  const totalDeductions = deductions.reduce((s, x) => s + x.value, 0);

  const arl = round(ibc * ARL_RATES[e.arlRisk]);
  const exempt = EXEMPTION.exempt114 && ibc < 10 * rules.smmlv;
  const employer = {
    health: exempt ? 0 : round(ibc * EMPLOYER_RATES.health), pension: round(ibc * EMPLOYER_RATES.pension), arl, ccf: round(ibc * EMPLOYER_RATES.ccf),
    sena: exempt ? 0 : round(ibc * EMPLOYER_RATES.sena), icbf: exempt ? 0 : round(ibc * EMPLOYER_RATES.icbf), total: 0,
  };
  employer.total = employer.health + employer.pension + employer.arl + employer.ccf + employer.sena + employer.icbf;
  const transport = earnings.find(x => x.kind === 'transport')?.value ?? 0;
  const prestBase = ibc + transport;
  const salaryEarned = base * days / 30;
  const cesantias = round(prestBase * PROVISION_RATES.cesantias);
  // Como el informe del contador: la doceava parte del 12 % anual sobre la cesantía del mes
  const provisions = {
    cesantias, intereses: round(cesantias * PROVISION_RATES.intereses),
    prima: round(prestBase * PROVISION_RATES.prima), vacaciones: round(salaryEarned * PROVISION_RATES.vacaciones),
    dotacion: round(salaryEarned * PROVISION_RATES.dotacion), total: 0,
  };
  provisions.total = provisions.cesantias + provisions.intereses + provisions.prima + provisions.vacaciones + provisions.dotacion;

  return {
    employeeId: e.id, code: e.code, name: fullName(e), docNumber: e.docNumber, position: e.position, area: e.area,
    contractType: e.contractType, weeklyHours: weekly, baseSalary: base, days, hourValue: round(hourValue),
    earnings, deductions, ibc, totalEarnings, totalDeductions, net: totalEarnings - totalDeductions,
    employer, provisions,
    account: NEQUI_RE.test(e.accountNumber ?? '') ? `Nequi ${nequiFmt(e.accountNumber)}` : 'Sin número Nequi',
    payTo: NEQUI_RE.test(e.accountNumber ?? '') ? e.accountNumber : '',
    issues: missingData(e),
    note: e.retiredAt && e.retiredAt <= end && e.retiredAt >= periodStart(period) ? `Retiro ${e.retiredAt.slice(8, 10)}/${e.retiredAt.slice(5, 7)} · prestaciones se liquidan aparte` : undefined,
  };
}

/** "4 h extra diurna · 16 h dominicales" (resumen de la columna Extras y recargos). */
export function extrasSummary(nov: Novelty): string {
  return [
    nov.extraDay ? hours(nov.extraDay, 'extra diurna') : '', nov.extraNight ? hours(nov.extraNight, 'extra nocturna') : '',
    nov.nightHours ? hours(nov.nightHours, 'nocturnas') : '', nov.sundayHours ? hours(nov.sundayHours, 'dominicales') : '',
  ].filter(Boolean).join(' · ');
}

export const extrasTotal = (l: PayLine) => l.earnings.filter(x => x.kind === 'extra').reduce((s, x) => s + x.value, 0);
export const bonusTotal = (l: PayLine) => l.earnings.filter(x => x.kind === 'bonus').reduce((s, x) => s + x.value, 0);
export const transportOf = (l: PayLine) => l.earnings.find(x => x.kind === 'transport')?.value ?? 0;
export const legalDeductions = (l: PayLine) => l.deductions.filter(d => d.kind === 'Legal').reduce((s, d) => s + d.value, 0);

// ── Nóminas (corridas por período) ───────────────────

/**
 * Borrador: editable. Confirmada: cerrada, pendiente de pago (se generan comprobantes).
 * Pagada: pago registrado. Anulada: no cuenta.
 */
export type RunStatus = 'Borrador' | 'Confirmada' | 'Pagada' | 'Anulada';
export type PayslipStatus = 'Generado' | 'Anulado';

export interface Payslip {
  number:       string;         // CP-2026-09-003
  generatedAt:  string;
  generatedBy:  string;
  status:       PayslipStatus;
  replacedBy?:  string;
  reason?:      string;
  sentTo?:      string;
}

/** Firma de recibido del empleado (constancia de que le llegó el pago). */
export interface PaymentReceipt { at: string; name: string; signature: string; }

/** Pago de la nómina a un empleado (por ahora, transferencia Nequi). */
export interface PayrollPayment {
  method:    PaymentMethod;
  to:        string;            // número Nequi
  amount:    number;            // neto de su liquidación
  reference: string;            // n.º de la transacción Nequi
  paidAt:    string;
  paidBy:    string;
  receipt?:  PaymentReceipt;
}

export interface PayrollRun {
  id:           string;
  period:       string;         // YYYY-MM (nómina mensual)
  payDate:      string;         // fecha de pago programada
  status:       RunStatus;
  novelties:    Record<string, Novelty>;
  lines?:       PayLine[];      // copia al confirmar
  payslips:     Record<string, Payslip>;       // por employeeId
  corrections?: { employeeId: string; line: PayLine; payslip: Payslip }[];
  payments?:    Record<string, PayrollPayment>;  // por employeeId
  createdAt:    string;
  createdBy:    string;
  confirmedAt?: string;
  confirmedBy?: string;
  paidAt?:      string;
  paidBy?:      string;
  annulment?:   { at: string; by: string; reason: string };
}

export interface RunTotals { employees: number; base: number; extras: number; transport: number; bonus: number; earnings: number; deductions: number; net: number; employer: number; provisions: number; }

export function runTotals(lines: PayLine[]): RunTotals {
  return lines.reduce((t, l) => ({
    employees: t.employees + 1, base: t.base + l.baseSalary, extras: t.extras + extrasTotal(l), transport: t.transport + transportOf(l),
    bonus: t.bonus + bonusTotal(l), earnings: t.earnings + l.totalEarnings, deductions: t.deductions + l.totalDeductions,
    net: t.net + l.net, employer: t.employer + l.employer.total, provisions: t.provisions + l.provisions.total,
  }), { employees: 0, base: 0, extras: 0, transport: 0, bonus: 0, earnings: 0, deductions: 0, net: 0, employer: 0, provisions: 0 });
}

export const RUN_BADGE: Record<RunStatus, string> = {
  'Borrador': 'rsv-badge--warn', 'Confirmada': 'rsv-badge--info', 'Pagada': 'rsv-badge--ok', 'Anulada': 'rsv-badge--muted',
};

export const payslipNumber = (period: string, index: number) => `CP-${period}-${String(index).padStart(3, '0')}`;
/** Consecutivo de un número de comprobante (CP-2026-09-003 → 3). */
export const payslipIndex = (n: string) => +(n.split('-').pop() ?? 0) || 0;
