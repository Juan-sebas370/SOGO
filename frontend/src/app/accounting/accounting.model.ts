import { SupportFile } from './support-file';

// =====================================================
// CONTABILIDAD — modelo
// Todo sale de los asientos: saldos, balance, estado de resultados e
// indicadores se calculan sumando débitos y créditos; nunca se guardan aparte.
// Cuentas según el PUC colombiano (validar la parametrización con el contador).
// =====================================================

export type AccountClass = 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' | 'Costo';

export interface Account {
  code:    string;           // 1110 (cuenta) o 110505 (subcuenta)
  name:    string;
  cls:     AccountClass;
  current?: boolean;          // activo / pasivo corriente
  contra?: boolean;           // cuenta de naturaleza contraria (depreciación acumulada)
  active?: boolean;           // inactiva: se conserva en lo registrado, pero no se usa en comprobantes nuevos
  system?: boolean;           // la usa SOGO al integrar (solo se le cambia el nombre; no se elimina)
  uses?:   number;            // líneas de comprobantes que la usan (lo informa el servidor)
}

/** Nombres de los grupos de 4 dígitos (para el balance a nivel de grupo). */
export const GROUPS: Record<string, string> = {
  '1105': 'Caja', '1110': 'Bancos', '1305': 'Clientes', '1330': 'Anticipos y avances', '1435': 'Inventarios',
  '1504': 'Terrenos', '1516': 'Construcciones y edificaciones', '1524': 'Muebles y enseres', '1520': 'Equipo de cocina',
  '1528': 'Equipo de cómputo', '1592': 'Depreciación acumulada',
  '2105': 'Obligaciones financieras', '2205': 'Proveedores', '2365': 'Retención en la fuente', '2370': 'Retenciones y aportes de nómina',
  '2380': 'Acreedores varios', '2408': 'IVA por pagar', '2495': 'Impuesto al consumo por pagar', '2505': 'Salarios por pagar',
  '2610': 'Prestaciones sociales por pagar', '2805': 'Anticipos y avances recibidos', '2810': 'Depósitos recibidos',
  '3115': 'Aportes sociales', '3305': 'Reservas obligatorias', '3605': 'Utilidad del ejercicio', '3610': 'Pérdida del ejercicio', '3705': 'Utilidades acumuladas', '3710': 'Pérdidas acumuladas',
  '4140': 'Hoteles y restaurantes', '4210': 'Ingresos financieros', '4250': 'Recuperaciones',
  '5205': 'Gastos de personal', '5210': 'Honorarios', '5215': 'Impuestos', '5220': 'Arrendamientos', '5230': 'Seguros', '5235': 'Servicios',
  '5240': 'Gastos legales', '5245': 'Mantenimiento y reparaciones', '5250': 'Adecuación e instalación', '5255': 'Gastos de viaje', '5265': 'Amortizaciones',
  '5260': 'Depreciaciones', '5295': 'Diversos', '5299': 'Provisiones', '5305': 'Gastos financieros', '5310': 'Pérdida en venta y retiro de bienes',
  '5315': 'Gastos extraordinarios', '5395': 'Gastos diversos', '6140': 'Costo hoteles y restaurantes',
};

/**
 * Plan de cuentas (tabla `cuentas_puc`). Se llena con la base de datos al abrir Contabilidad
 * (AccountingService); el contador agrega cuentas en Contabilidad › Plan de cuentas.
 */
export const ACCOUNTS: Account[] = [];

export function setAccounts(list: Account[]): void { ACCOUNTS.splice(0, ACCOUNTS.length, ...list); }

/** ¿Es una cuenta de detalle? (las cuentas título, como 41 o 4140, solo agrupan a sus subcuentas) */
export const isLeaf = (code: string) => !ACCOUNTS.some(a => a.code !== code && a.code.startsWith(code));

/** Cuentas que se pueden usar en comprobantes nuevos: activas y de detalle. */
export const activeAccounts = () => ACCOUNTS.filter(a => a.active !== false && isLeaf(a.code));

export const accountByCode = (code: string) => ACCOUNTS.find(a => a.code === code);
export const accountLabel = (code: string) => `${code} · ${accountByCode(code)?.name ?? GROUPS[code.slice(0, 4)] ?? 'Cuenta'}`;

/** Débito aumenta activos, gastos y costos (5, 6 y 7); crédito aumenta pasivos, patrimonio e ingresos. */
export const debitNature = (code: string) => ['1', '5', '6', '7'].includes(code[0]);

// ── Asientos ─────────────────────────────────────────

// Venta: causación de una factura o consumo (cuenta por cobrar). Apertura: saldos iniciales / migración.
export type EntryKind = 'Ingreso' | 'Egreso' | 'Ajuste' | 'Provisión' | 'Pago' | 'Cobro' | 'Traslado' | 'Causación' | 'Venta' | 'Apertura'
  | 'Nota crédito' | 'Nota débito';
export type EntryStatus = 'Borrador' | 'Provisional' | 'Contabilizado' | 'Anulado';
export type Origin = 'Manual' | 'Reservas' | 'Alojamiento' | 'Facturación' | 'Nómina' | 'Inventarios';

export const ENTRY_KINDS: EntryKind[] = ['Ingreso', 'Egreso', 'Ajuste', 'Provisión', 'Pago', 'Cobro', 'Traslado', 'Apertura', 'Nota crédito', 'Nota débito'];
/** Nombre que ve el usuario (la apertura es el registro de los saldos iniciales). */
export const kindLabel = (k: EntryKind) => k === 'Apertura' ? 'Saldos iniciales' : k;

/**
 * Prefijo del comprobante (formato del contador): RC recibo de caja, CE comprobante de egreso,
 * NCO nota de contabilidad, NC nota crédito, ND nota débito, FV venta integrada. Número: RC-2026001.
 */
export const PREFIX: Record<EntryKind, string> = {
  Ingreso: 'RC', Cobro: 'RC', Egreso: 'CE', Pago: 'CE', Venta: 'FV', Ajuste: 'NCO', Provisión: 'NCO', Causación: 'NCO', Traslado: 'NCO', Apertura: 'NCO',
  'Nota crédito': 'NC', 'Nota débito': 'ND',
};

export interface EntryLine {
  account: string;
  detail:  string;
  costCenter?: string;   // CC-01 Alojamiento, CC-02 Restaurante y cafetería, CC-03 Administración
  thirdDoc?:   string;   // NIT o CC del tercero de la línea
  third:   string;
  debit:   number;
  credit:  number;
}

export interface Entry {
  id:           string;
  number:       string;          // RC-2026001
  kind:         EntryKind;
  date:         string;          // YYYY-MM-DD
  time:         string;          // HH:mm
  concept:      string;
  third:        string;
  thirdDoc?:     string;        // NIT o CC del tercero
  invoiceRef?:   string;        // factura que afecta (notas crédito y débito)
  noteReason?:   string;        // Error | Devolución | Rebaja | Anulación | Cobro adicional
  category?:    string;          // categoría del ingreso / egreso
  method?:      string;          // método de pago
  lines:        EntryLine[];
  origin:       Origin;
  sourceKey?:   string;          // clave del registro de origen (evita duplicados)
  sourceRef?:   string;          // "RSV-2026-00012", "Nómina septiembre 2026"...
  status:       EntryStatus;
  supports:     string[];        // referencias de soporte sin archivo (las pone la integración: "Recibo 123", "FE-1.pdf")
  files?:       SupportFile[];   // archivos de soporte guardados en la base de datos
  observations: string;
  createdBy:    string;
  createdAt?:   string;          // YYYY-MM-DDTHH:mm (lo pone el servidor)
  annulment?:   { at: string; by: string; reason: string };
}

export const entryTotal = (e: Pick<Entry, 'lines'>) => e.lines.reduce((s, l) => s + l.debit, 0);
export const isBalanced = (lines: EntryLine[]) => {
  const d = lines.reduce((s, l) => s + l.debit, 0), c = lines.reduce((s, l) => s + l.credit, 0);
  return d > 0 && Math.round(d) === Math.round(c);
};

/** Cuenta principal que se muestra en listados: el primer ingreso/gasto, o la primera línea. */
export function mainAccount(e: Entry): string {
  const pl = e.lines.find(l => ['4', '5', '6'].includes(l.account[0]));
  return (pl ?? e.lines[0])?.account ?? '';
}

/** Asientos que cuentan para saldos (lo provisional se incluye con aviso). */
export const counts = (e: Entry) => e.status === 'Contabilizado' || e.status === 'Provisional';

export const STATUS_BADGE: Record<EntryStatus, string> = {
  Borrador: 'rsv-badge--warn', Provisional: 'rsv-badge--warn', Contabilizado: 'rsv-badge--ok', Anulado: 'rsv-badge--muted',
};

export const ORIGIN_BADGE: Record<Origin, string> = {
  Manual: 'rsv-badge--muted', Reservas: 'rsv-badge--info', Alojamiento: 'rsv-badge--info', Facturación: 'rsv-badge--info',
  Nómina: 'rsv-badge--info', Inventarios: 'rsv-badge--info',
};

// ── Saldos y estados ─────────────────────────────────

/** Categoría del comprobante de cierre anual (cancela ingresos, gastos y costos contra 3605 / 3610). */
export const CLOSING = 'Cierre del ejercicio';
export const isClosing = (e: Pick<Entry, 'category'>) => e.category === CLOSING;

/** Saldo por cuenta (en su naturaleza: positivo = saldo normal). */
export function balances(entries: Entry[], from: string, to: string): Map<string, number> {
  const map = new Map<string, number>();
  entries.filter(e => counts(e) && e.date >= from && e.date <= to).forEach(e => e.lines.forEach(l => {
    const signed = debitNature(l.account) ? l.debit - l.credit : l.credit - l.debit;
    map.set(l.account, (map.get(l.account) ?? 0) + signed);
  }));
  return map;
}

export const sumWhere = (b: Map<string, number>, pred: (code: string) => boolean) =>
  [...b].filter(([c]) => pred(c)).reduce((s, [, v]) => s + v, 0);

/** ¿Cuenta de resultados? (ingresos 4, gastos 5 sin la 59 de cierre, costos 6 y 7) */
export const isResultAccount = (c: string) => ['4', '5', '6', '7'].includes(c[0]) && !c.startsWith('59');

export interface PnL {
  income: number; operational: number; nonOperational: number; costs: number; expenses: number; opExpenses: number; financial: number;
  /** Utilidad antes de impuestos. */ profit: number;
  /** Impuesto de renta (54). */ tax: number;
  /** Utilidad neta (después de impuestos). */ net: number;
}

/**
 * Estado de resultados de un rango. Por defecto no cuenta el comprobante de cierre (que deja
 * en cero las cuentas de resultados): así el estado de resultados del año sigue mostrando lo
 * que pasó. `withClosing` lo incluye (para saber qué quedó sin cerrar).
 */
export function pnl(entries: Entry[], from: string, to: string, withClosing = false): PnL {
  const b = balances(withClosing ? entries : entries.filter(e => !isClosing(e)), from, to);
  const operational = sumWhere(b, c => c.startsWith('41'));
  const nonOperational = sumWhere(b, c => c.startsWith('42'));
  const costs = sumWhere(b, c => c[0] === '6' || c[0] === '7');
  const opExpenses = sumWhere(b, c => c.startsWith('51') || c.startsWith('52'));
  const financial = sumWhere(b, c => c.startsWith('53'));
  const tax = sumWhere(b, c => c.startsWith('54'));
  const income = operational + nonOperational;
  const expenses = costs + opExpenses + financial;
  const profit = income - expenses;
  return { income, operational, nonOperational, costs, expenses, opExpenses, financial, profit, tax, net: profit - tax };
}

export interface BalanceSheet {
  lines: { code: string; name: string; value: number; cls: AccountClass; current: boolean }[];
  currentAssets: number; nonCurrentAssets: number; assets: number;
  currentLiabilities: number; nonCurrentLiabilities: number; liabilities: number;
  equityBase: number;
  /** Resultados de años anteriores que no se han cerrado (sin comprobante de cierre). */ priorResults: number;
  /** Utilidad (o pérdida) del ejercicio en curso hasta el corte, aún sin cerrar. */ profit: number;
  equity: number;
}

/**
 * Balance general a la fecha de corte. Las cuentas de resultados que no se han cerrado se
 * presentan en el patrimonio: la utilidad del año en curso y la de años anteriores sin cierre.
 * Con el comprobante de cierre esos saldos ya están en 3605 / 3610 y no se suman dos veces.
 * Así el balance siempre cuadra: Activo = Pasivo + Patrimonio.
 * `level` 4 agrupa por cuenta (1105, 1110...), 6 muestra cada subcuenta y auxiliar.
 */
export function balanceSheet(entries: Entry[], cut: string, level: 4 | 6 = 4): BalanceSheet {
  const b = balances(entries, '0000-01-01', cut);
  const yearStart = `${cut.slice(0, 4)}-01-01`;
  const prevEnd = `${+cut.slice(0, 4) - 1}-12-31`;
  const profit = pnl(entries, yearStart, cut, true).net;
  const priorResults = pnl(entries, '0000-01-01', prevEnd, true).net;
  const grouped = new Map<string, number>();
  // Las cuentas de naturaleza contraria (depreciación acumulada, provisiones) quedan negativas y restan
  [...b].filter(([c]) => ['1', '2', '3'].includes(c[0])).forEach(([c, v]) => {
    const key = level === 4 ? c.slice(0, 4) : c;
    grouped.set(key, (grouped.get(key) ?? 0) + v);
  });
  const lines = [...grouped].filter(([, v]) => Math.round(v) !== 0).sort(([a], [b2]) => a.localeCompare(b2)).map(([code, value]) => {
    const acc = ACCOUNTS.find(a => a.code === code) ?? ACCOUNTS.find(a => a.code.startsWith(code)) ?? ACCOUNTS.find(a => code.startsWith(a.code));
    const cls: AccountClass = acc?.cls ?? (code[0] === '1' ? 'Activo' : code[0] === '2' ? 'Pasivo' : 'Patrimonio');
    return { code, name: (level === 4 ? GROUPS[code] : undefined) ?? acc?.name ?? code, value, cls, current: !!acc?.current };
  });
  const sum = (p: (l: BalanceSheet['lines'][number]) => boolean) => lines.filter(p).reduce((s, l) => s + l.value, 0);
  const currentAssets = sum(l => l.cls === 'Activo' && l.current);
  const nonCurrentAssets = sum(l => l.cls === 'Activo' && !l.current);
  const currentLiabilities = sum(l => l.cls === 'Pasivo' && l.current);
  const nonCurrentLiabilities = sum(l => l.cls === 'Pasivo' && !l.current);
  const equityBase = sum(l => l.cls === 'Patrimonio');
  return {
    lines, currentAssets, nonCurrentAssets, assets: currentAssets + nonCurrentAssets,
    currentLiabilities, nonCurrentLiabilities, liabilities: currentLiabilities + nonCurrentLiabilities,
    equityBase, priorResults, profit, equity: equityBase + priorResults + profit,
  };
}

// ── Períodos ─────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function periodName(p: string): string { const m = MONTHS[+p.slice(5, 7) - 1]; return `${m[0].toUpperCase()}${m.slice(1)} ${p.slice(0, 4)}`; }
export const monthAbbr = (p: string) => periodName(p).slice(0, 3);
export const monthStart = (p: string) => `${p}-01`;
export function monthEnd(p: string): string { const [y, m] = p.split('-').map(Number); return `${p}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; }
export function shiftMonth(p: string, n: number): string { const [y, m] = p.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

// ── Documentos y centros de costo ────────────────────

/** Nombre del documento que se imprime según el tipo de comprobante. */
export function docTitle(k: EntryKind): string {
  if (k === 'Ingreso' || k === 'Cobro') return 'Recibo de caja';
  if (k === 'Egreso' || k === 'Pago') return 'Comprobante de egreso';
  if (k === 'Nota crédito') return 'Nota crédito';
  if (k === 'Nota débito') return 'Nota débito';
  if (k === 'Venta') return 'Factura de venta';
  return 'Nota de contabilidad';
}

export interface CostCenter { code: string; name: string; active: boolean; }
/** Centros de costo (tabla `centros_costo`). Se llena con la base de datos al abrir Contabilidad. */
export const COST_CENTERS: CostCenter[] = [
  { code: 'CC-01', name: 'Alojamiento', active: true }, { code: 'CC-02', name: 'Restaurante y cafetería', active: true },
  { code: 'CC-03', name: 'Administración', active: true },
];
export function setCostCenters(list: CostCenter[]): void { if (list.length) COST_CENTERS.splice(0, COST_CENTERS.length, ...list); }
export const costCenterLabel = (code?: string) => !code ? '—' : `${code} ${COST_CENTERS.find(c => c.code === code)?.name ?? ''}`.trim();

export const NOTE_REASONS_CREDIT = ['Error', 'Devolución', 'Rebaja', 'Anulación'];

/**
 * Renglones de resultados sin cerrar que el balance presenta dentro del patrimonio:
 * 3705 / 3710 (años anteriores) y 3605 / 3610 (ejercicio en curso), según sea utilidad o pérdida.
 */
export function equityResultRows(s: BalanceSheet): [string, string, number][] {
  const rows: [string, string, number][] = [];
  if (Math.round(s.priorResults)) rows.push(s.priorResults >= 0 ? ['3705', 'Utilidades acumuladas (años sin cerrar)', s.priorResults] : ['3710', 'Pérdidas acumuladas (años sin cerrar)', s.priorResults]);
  rows.push(s.profit >= 0 ? ['3605', 'Utilidad del ejercicio', s.profit] : ['3610', 'Pérdida del ejercicio', s.profit]);
  return rows;
}
