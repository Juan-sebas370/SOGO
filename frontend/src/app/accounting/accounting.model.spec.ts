import {
  Entry, EntryLine, balances, pnl, isBalanced, entryTotal, mainAccount, counts, isClosing, CLOSING, debitNature,
  periodName, monthEnd, shiftMonth, setAccounts, activeAccounts, isLeaf,
} from './accounting.model';

const l = (account: string, debit: number, credit: number): EntryLine => ({ account, detail: '', third: '', debit, credit });

const entry = (over: Partial<Entry>): Entry => ({
  id: 'e', number: 'X-1', kind: 'Ingreso', date: '2026-10-10', time: '10:00', concept: '', third: '', lines: [],
  origin: 'Manual', status: 'Contabilizado', supports: [], observations: '', createdBy: 'pruebas', ...over,
});

/** Octubre 2026: un ingreso de alojamiento, la nómina, servicios públicos y un borrador que no debe contar. */
const OCTOBER: Entry[] = [
  entry({ id: '1', lines: [l('111005', 1_190_000, 0), l('414005', 0, 1_000_000), l('240805', 0, 190_000)] }),     // ingreso + IVA
  entry({ id: '2', kind: 'Egreso', lines: [l('510506', 800_000, 0), l('111005', 0, 800_000)] }),                // nómina
  entry({ id: '3', kind: 'Egreso', lines: [l('513525', 150_000, 0), l('111005', 0, 150_000)] }),                // servicios
  entry({ id: '4', kind: 'Egreso', status: 'Borrador', lines: [l('519595', 999_000, 0), l('111005', 0, 999_000)] }),
  entry({ id: '5', date: '2026-09-30', lines: [l('111005', 500_000, 0), l('414005', 0, 500_000)] }),             // septiembre
];

describe('Contabilidad · saldos y estado de resultados', () => {
  it('suma cada cuenta en su naturaleza (activos y gastos al débito, ingresos al crédito)', () => {
    const b = balances(OCTOBER, '2026-10-01', '2026-10-31');
    expect(b.get('414005')).toBe(1_000_000);
    expect(b.get('510506')).toBe(800_000);
    expect(b.get('111005')).toBe(1_190_000 - 800_000 - 150_000);
  });

  it('no cuenta borradores ni movimientos fuera del período', () => {
    const b = balances(OCTOBER, '2026-10-01', '2026-10-31');
    expect(b.has('519595')).toBeFalse();
    expect(b.get('111005')).not.toBe(240_000 + 500_000);
  });

  it('calcula ingresos, gastos y utilidad del mes', () => {
    const r = pnl(OCTOBER, '2026-10-01', '2026-10-31');
    expect(r.income).toBe(1_000_000);
    expect(r.opExpenses).toBe(950_000);
    expect(r.profit).toBe(50_000);
    expect(r.net).toBe(50_000);
  });

  it('la utilidad de septiembre solo toma septiembre', () => {
    expect(pnl(OCTOBER, '2026-09-01', '2026-09-30').income).toBe(500_000);
  });
});

describe('Contabilidad · comprobantes', () => {
  it('un comprobante cuadra cuando débitos y créditos son iguales y mayores a cero', () => {
    expect(isBalanced(OCTOBER[0].lines)).toBeTrue();
    expect(isBalanced([l('111005', 100, 0), l('414005', 0, 90)])).toBeFalse();
    expect(isBalanced([])).toBeFalse();
  });

  it('el total del comprobante es la suma de los débitos', () => {
    expect(entryTotal(OCTOBER[0])).toBe(1_190_000);
  });

  it('la cuenta principal es la de ingreso o gasto', () => {
    expect(mainAccount(OCTOBER[0])).toBe('414005');
    expect(mainAccount(OCTOBER[1])).toBe('510506');
  });

  it('solo cuentan contabilizados y provisionales', () => {
    expect(counts(entry({ status: 'Contabilizado' }))).toBeTrue();
    expect(counts(entry({ status: 'Provisional' }))).toBeTrue();
    expect(counts(entry({ status: 'Borrador' }))).toBeFalse();
    expect(counts(entry({ status: 'Anulado' }))).toBeFalse();
  });

  it('reconoce el comprobante de cierre del ejercicio', () => {
    expect(isClosing({ category: CLOSING })).toBeTrue();
    expect(isClosing({ category: 'Alojamiento' })).toBeFalse();
  });

  it('naturaleza débito: clases 1, 5, 6 y 7', () => {
    expect(['1105', '5105', '6140', '7205'].every(debitNature)).toBeTrue();
    expect(['2105', '3105', '4140'].some(debitNature)).toBeFalse();
  });
});

describe('Contabilidad · plan de cuentas', () => {
  beforeEach(() => setAccounts([
    { code: '1105', name: 'Caja', cls: 'Activo' },
    { code: '110505', name: 'Caja general', cls: 'Activo' },
    { code: '110510', name: 'Cajas menores', cls: 'Activo', active: false },
    { code: '513525', name: 'Acueducto y alcantarillado', cls: 'Gasto' },
  ]));
  afterEach(() => setAccounts([]));

  it('una cuenta con subcuentas no es de último nivel', () => {
    expect(isLeaf('1105')).toBeFalse();
    expect(isLeaf('110505')).toBeTrue();
  });

  it('en los comprobantes solo se ofrecen cuentas activas de último nivel', () => {
    expect(activeAccounts().map(a => a.code)).toEqual(['110505', '513525']);
  });
});

describe('Contabilidad · períodos', () => {
  it('nombra, desplaza y cierra meses (incluye bisiestos)', () => {
    expect(periodName('2026-10')).toBe('Octubre 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
  });
});
