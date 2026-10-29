import { axis, linearTrend, delta, variation, addDays, shiftMonth, monthEnd, lastMonths } from './reports.model';

describe('Reportes · escalas de las gráficas', () => {
  it('usa pasos redondos y máximo 5 líneas de guía', () => {
    const a = axis(17_300_000);
    expect(a.ticks.length).toBe(5);
    expect(a.max).toBeGreaterThanOrEqual(17_300_000);
    expect(a.ticks).toEqual([0, 5_000_000, 10_000_000, 15_000_000, 20_000_000]);
  });

  it('con valores negativos o cero no inventa una escala', () => {
    expect(axis(0)).toEqual({ max: 1, ticks: [0] });
  });

  it('las escalas pequeñas también quedan redondas', () => {
    expect(axis(73).ticks).toEqual([0, 20, 40, 60, 80]);
  });
});

describe('Reportes · tendencia', () => {
  it('la recta de una serie lineal es exacta', () => {
    const t = linearTrend([10, 20, 30, 40]);
    expect(t.slope).toBeCloseTo(10);
    expect(t.at(4)).toBeCloseTo(50);   // proyección del siguiente punto
  });

  it('una serie plana tiene pendiente cero y sin datos no falla', () => {
    expect(linearTrend([5, 5, 5]).slope).toBe(0);
    expect(linearTrend([]).at(3)).toBe(0);
  });
});

describe('Reportes · comparación entre períodos', () => {
  it('variación relativa con signo y en porcentaje', () => {
    expect(variation(110, 100)).toBeCloseTo(10);
    expect(variation(90, 100)).toBeCloseTo(-10);
    expect(Number.isNaN(variation(5, 0))).toBeTrue();
  });

  it('sube y es bueno cuando más es mejor', () => {
    const d = delta(110, 100);
    expect(d.up).toBeTrue();
    expect(d.good).toBeTrue();
    expect(d.none).toBeFalse();
  });

  it('cuando menos es mejor (cancelaciones) subir es malo', () => {
    const d = delta(20, 10, 'pp', false);
    expect(d.up).toBeTrue();
    expect(d.good).toBeFalse();
    expect(d.text).toContain('pp');
  });

  it('sin período de comparación no muestra cambio', () => {
    expect(delta(5, null).none).toBeTrue();
    expect(delta(5, 0).none).toBeTrue();
  });
});

describe('Reportes · fechas', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('desplaza meses y obtiene el último día', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });

  it('últimos meses en orden, del más antiguo al más reciente', () => {
    expect(lastMonths('2026-10', 3)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});
