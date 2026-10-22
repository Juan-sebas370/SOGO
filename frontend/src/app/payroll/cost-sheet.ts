// =====================================================
// INFORME DE COSTOS DE NÓMINA (formato del contador)
// Por empleado o consolidado: cada concepto con su base, lo que asume el
// trabajador y lo que asume el empleador. Los porcentajes se leen de la
// liquidación (valor ÷ base), así una nómina confirmada muestra los que
// tenía al confirmarse aunque después cambien los parámetros.
// =====================================================

import { PayLine, bonusTotal, extrasTotal, transportOf } from './payroll.model';

export interface CostRow {
  concept:   string;
  notes:     string;          // "(4) (5)"
  base:      number | null;
  workerPct: string;
  worker:    number | null;
  employerPct: string;
  employer:  number | null;
  group:     'pago' | 'prestacion' | 'aporte' | 'otro';
}

export interface CostSheet {
  rows:        CostRow[];
  employerMonth: number;      // valores asumidos por el empleador en el mes
  earnings:    number;        // devengado (11)
  deductions:  number;
  net:         number;
  salary:      number;
  /** En el año, como el informe del contador: 12 meses sin los intereses a las cesantías. */
  employerYear: number;
  netYear:     number;
  /** Por cada $1 de salario, cuánto asume la empresa en total. */
  factor:      number;
}

/** Notas al pie del informe, numeradas como en el formato del contador. */
export const COST_NOTES: [string, string][] = [
  ['1', 'Salario básico proporcional a los días laborados del mes (30 días comerciales).'],
  ['2', 'Auxilio de transporte: solo para salarios de hasta 2 SMMLV. No es base de aportes, sí de prima y cesantías.'],
  ['3', 'Prestaciones sociales: provisión mensual a cargo del empleador. Prima y cesantías sobre salario + auxilio; intereses: 12 % anual ÷ 12 sobre la cesantía del mes; vacaciones sobre el salario.'],
  ['4', 'Salud del empleador, SENA e ICBF: se liquidan en 0 si en Parámetros de nómina se activa la exoneración del art. 114-1 E.T.'],
  ['5', 'Salud y pensión del trabajador se descuentan del pago; las del empleador no.'],
  ['6', 'Fondo de solidaridad pensional: 1 % adicional al trabajador con IBC desde 4 SMMLV.'],
  ['7', 'Retención en la fuente: SOGO no la calcula. Si el contador la determina, se registra como deducción autorizada del empleado.'],
  ['8', 'ARL según la clase de riesgo del empleado (riesgo I = 0,522 %).'],
  ['9', 'ARL, SENA, ICBF y caja de compensación los paga solo el empleador.'],
  ['10', 'Dotación: provisión mensual para la dotación (uniformes y calzado) que se entrega al personal.'],
  ['11', 'Devengado: salario + auxilio + horas extra, recargos y bonificaciones; es lo que gana el empleado antes de deducciones.'],
];

const pctText = (value: number, base: number | null): string => {
  if (!base || !value) return '';
  const p = value / base * 100;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: p < 1 ? 3 : 2 }).format(p)} %`;
};

/** Suma por concepto de una o varias liquidaciones. */
export function costSheet(lines: PayLine[]): CostSheet {
  const sum = (f: (l: PayLine) => number) => lines.reduce((s, l) => s + (f(l) || 0), 0);
  const ded = (concept: string) => (l: PayLine) => l.deductions.filter(d => d.concept === concept).reduce((s, d) => s + d.value, 0);

  const salary = sum(l => l.earnings.filter(e => e.kind === 'salary').reduce((s, e) => s + e.value, 0));
  const extras = sum(extrasTotal), bonus = sum(bonusTotal), transport = sum(transportOf);
  const ibc = sum(l => l.ibc);
  const prestBase = ibc + transport;
  const cesantias = sum(l => l.provisions.cesantias);
  const authorized = sum(l => l.deductions.filter(d => d.kind === 'Autorizada').reduce((s, d) => s + d.value, 0));

  const row = (concept: string, notes: string, group: CostRow['group'], base: number | null, worker: number | null, employer: number | null): CostRow =>
    ({ concept, notes, group, base, worker, employer, workerPct: worker === null ? '' : pctText(worker, base), employerPct: employer === null || group === 'pago' ? '' : pctText(employer, base) });

  const intereses = sum(l => l.provisions.intereses);
  const rows: CostRow[] = [
    row('Salario', '(1)', 'pago', salary, null, salary),
    ...(extras ? [row('Horas extra y recargos', '(1)', 'pago', extras, null, extras)] : []),
    ...(bonus ? [row('Bonificaciones', '(1)', 'pago', bonus, null, bonus)] : []),
    row('Auxilio de transporte', '(2)', 'pago', transport, null, transport),
    row('Prima de servicios', '(3)', 'prestacion', prestBase, 0, sum(l => l.provisions.prima)),
    row('Cesantías', '(3)', 'prestacion', prestBase, 0, cesantias),
    { ...row('Intereses a las cesantías', '(3)', 'prestacion', cesantias, 0, intereses), employerPct: pctText(intereses * 12, cesantias) },   // tasa anual, como el formato
    row('Vacaciones', '(3)', 'prestacion', salary, 0, sum(l => l.provisions.vacaciones)),
    row('Salud', '(4) (5)', 'aporte', ibc, sum(ded('Salud')), sum(l => l.employer.health ?? 0)),
    row('Pensión', '(5)', 'aporte', ibc, sum(ded('Pensión')), sum(l => l.employer.pension)),
    row('Fondo de Solidaridad Pensional', '(6)', 'aporte', ibc, sum(ded('Fondo de solidaridad pensional')), null),
    row('Retención en la fuente', '(7)', 'otro', null, null, null),
    row('ARL', '(8) (9)', 'aporte', ibc, null, sum(l => l.employer.arl)),
    row('SENA', '(4) (9)', 'aporte', ibc, null, sum(l => l.employer.sena ?? 0)),
    row('ICBF', '(4) (9)', 'aporte', ibc, null, sum(l => l.employer.icbf ?? 0)),
    row('Caja de compensación', '(9)', 'aporte', ibc, null, sum(l => l.employer.ccf)),
    row('Dotación', '(10)', 'prestacion', salary, null, sum(l => l.provisions.dotacion ?? 0)),
    ...(authorized ? [row('Préstamos, libranzas y otros descuentos', '', 'otro', null, authorized, null)] : []),
  ];
  // Un aporte que no aplica (FSP bajo 4 SMMLV, SENA exonerado...) queda en blanco, como en el formato
  rows.forEach(r => { if (r.group === 'aporte' && !r.worker && !r.employer) r.base = r.worker = r.employer = null; });

  const earnings = sum(l => l.totalEarnings);
  const employerMonth = earnings + sum(l => l.employer.total) + sum(l => l.provisions.total);
  return {
    rows, employerMonth, earnings, deductions: sum(l => l.totalDeductions), net: sum(l => l.net), salary,
    employerYear: (employerMonth - intereses) * 12, netYear: sum(l => l.net) * 12,
    factor: salary ? employerMonth / salary : 0,
  };
}
