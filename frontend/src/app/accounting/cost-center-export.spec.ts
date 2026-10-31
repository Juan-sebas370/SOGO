import { CLOSING, COST_CENTERS, Entry, EntryLine } from './accounting.model';
import { NO_CENTER, ccTotal, costCenterHtml, costCenterReport, costCenterRows } from './cost-center-export';

const l = (account: string, debit: number, credit: number, costCenter?: string): EntryLine => ({ account, detail: '', third: '', costCenter, debit, credit });

const entry = (over: Partial<Entry>): Entry => ({
  id: 'e', number: 'X-1', kind: 'Ingreso', date: '2026-10-10', time: '10:00', concept: '', third: '', lines: [],
  origin: 'Manual', status: 'Contabilizado', supports: [], observations: '', createdBy: 'pruebas', ...over,
});

/** Octubre 2026: alojamiento vende, la cafetería compra y vende, administración paga nómina. */
const OCTOBER: Entry[] = [
  entry({ number: 'RC-1', lines: [l('111005', 1_000_000, 0, 'CC-01'), l('414005', 0, 1_000_000, 'CC-01')] }),
  entry({ number: 'RC-2', lines: [l('111005', 300_000, 0, 'CC-02'), l('414095', 0, 300_000, 'CC-02')] }),
  entry({ number: 'CE-1', kind: 'Egreso', lines: [l('613505', 120_000, 0, 'CC-02'), l('111005', 0, 120_000, 'CC-02')] }),
  entry({ number: 'CE-2', kind: 'Egreso', lines: [l('510506', 800_000, 0, 'CC-03'), l('111005', 0, 800_000, 'CC-03')] }),
  entry({ number: 'CE-3', kind: 'Egreso', status: 'Borrador', lines: [l('513525', 999_000, 0, 'CC-01'), l('111005', 0, 999_000)] }),
  entry({ number: 'RC-0', date: '2026-09-30', lines: [l('111005', 500_000, 0, 'CC-01'), l('414005', 0, 500_000, 'CC-01')] }),
];

const report = (list = OCTOBER) => costCenterReport(list, '2026-10-01', '2026-10-31', COST_CENTERS);

describe('Contabilidad · informe por centros de costo', () => {
  it('trae siempre los 3 centros, en su orden', () => {
    expect(report().map(c => c.code)).toEqual(['CC-01', 'CC-02', 'CC-03']);
  });

  it('suma ingresos, costos y gastos de cada centro según la línea del comprobante', () => {
    const [aloj, rest, adm] = report();
    expect([aloj.income, aloj.costs, aloj.expenses, aloj.result]).toEqual([1_000_000, 0, 0, 1_000_000]);
    expect([rest.income, rest.costs, rest.result]).toEqual([300_000, 120_000, 180_000]);
    expect(rest.margin).toBeCloseTo(0.6);
    expect([adm.expenses, adm.result, adm.margin]).toEqual([800_000, -800_000, null]);
  });

  it('no cuenta borradores, otros meses ni cuentas de balance', () => {
    const aloj = report()[0];
    expect(aloj.accounts.map(a => a.code)).toEqual(['414005']);
    expect(aloj.accounts[0].lines.length).toBe(1);
  });

  it('no cuenta el comprobante de cierre del ejercicio', () => {
    const closing = entry({ category: CLOSING, lines: [l('414005', 1_000_000, 0, 'CC-01'), l('360505', 0, 1_000_000, 'CC-03')] });
    expect(report([...OCTOBER, closing])[0].income).toBe(1_000_000);
  });

  it('muestra aparte las líneas sin centro para corregirlas', () => {
    const loose = entry({ lines: [l('111005', 50_000, 0), l('414005', 0, 50_000)] });
    const r = report([...OCTOBER, loose]);
    expect(r.map(c => c.code)).toEqual(['CC-01', 'CC-02', 'CC-03', NO_CENTER]);
    expect(r[3].income).toBe(50_000);
  });

  it('el total consolidado coincide con la suma de los centros', () => {
    const t = ccTotal(report());
    expect([t.income, t.costs, t.expenses, t.result]).toEqual([1_300_000, 120_000, 800_000, 380_000]);
  });

  it('el Excel trae una fila por cuenta y el resultado de cada centro', () => {
    const rows = costCenterRows(report(), false);
    expect(rows[0][0]).toBe('Centro de costo');
    expect(rows[0].length).toBe(5);
    expect(rows.filter(r => r[1] === 'Resultado').map(r => r[4])).toEqual([1_000_000, 180_000, -800_000]);
    const detailed = costCenterRows(report(), true);
    expect(detailed[0].length).toBe(11);
    expect(detailed.some(r => r[5] === 'CE-1')).toBeTrue();
    expect(detailed.filter(r => r[1] === 'Resultado').map(r => r[10])).toEqual([1_000_000, 180_000, -800_000]);
  });

  it('el PDF incluye el comparativo y el detalle de cada centro', () => {
    const html = costCenterHtml(report(), { company: 'Hospedaje', period: 'octubre', user: 'pruebas', withLines: false });
    expect(html).toContain('Comparativo de centros');
    expect(html).toContain('CC-02 Restaurante y cafetería');
    expect(html).not.toContain('Sin centro asignado');
  });
});
