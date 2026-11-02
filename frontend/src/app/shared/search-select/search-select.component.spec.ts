import { SearchSelectComponent, SearchOption } from './search-select.component';

const OPTIONS: SearchOption[] = [
  { value: 'CO', label: 'Colombia', hint: 'CO', keywords: '170' },
  { value: 'CL', label: 'Chile', hint: 'CL', keywords: '152' },
  { value: 'CN', label: 'China', hint: 'CN', keywords: '156' },
  { value: 'KR', label: 'Corea del Sur', hint: 'KR', keywords: '410' },
  { value: 'US', label: 'Estados Unidos', hint: 'US', keywords: '840' },
  { value: 'PE', label: 'Perú', hint: 'PE', keywords: '604' },
];

function make(over: Partial<SearchSelectComponent> = {}): { c: SearchSelectComponent; changes: string[] } {
  const c = new SearchSelectComponent();
  Object.assign(c, { options: OPTIONS, ...over });
  const changes: string[] = [];
  c.registerOnChange(v => changes.push(v));
  return { c, changes };
}

const key = (k: string) => new KeyboardEvent('keydown', { key: k });

describe('Buscador (app-search-select)', () => {
  it('filtra mientras se escribe, sin tildes ni mayúsculas', () => {
    const { c } = make();
    c.onFocus();
    c.onInput('PERU');
    expect(c.shown.map(o => o.label)).toEqual(['Perú']);
    c.onInput('chi');
    expect(c.shown.map(o => o.label)).toEqual(['Chile', 'China']);
  });

  it('primero lo que empieza por la búsqueda, luego por palabra', () => {
    const { c } = make();
    c.onFocus();
    c.onInput('su');
    expect(c.shown.map(o => o.label)).toEqual(['Corea del Sur']);
  });

  it('encuentra por código ISO alfabético o numérico', () => {
    const { c } = make();
    c.onFocus();
    c.onInput('152');
    expect(c.shown[0].value).toBe('CL');
    c.onInput('us');
    expect(c.shown[0].value).toBe('US');
  });

  it('flechas y Enter eligen la opción', () => {
    const { c, changes } = make();
    c.onFocus();
    c.onInput('chi');
    c.onKey(key('ArrowDown'));
    c.onKey(key('Enter'));
    expect(changes).toEqual(['CN']);
    expect(c.open).toBeFalse();
  });

  it('Tab con una búsqueda escrita toma la primera coincidencia', () => {
    const { c, changes } = make();
    c.onFocus();
    c.onInput('chil');
    c.onKey(key('Tab'));
    expect(changes).toEqual(['CL']);
  });

  it('con el campo vacío salen primero los frecuentes', () => {
    const { c } = make({ pinned: ['US', 'PE'] });
    c.onFocus();
    expect(c.shown.slice(0, 2).map(o => o.value)).toEqual(['US', 'PE']);
    expect(c.shown.length).toBe(OPTIONS.length);
  });

  it('con allowFree acepta un texto que no está en la lista', () => {
    const { c, changes } = make({ options: [], allowFree: true });
    c.onFocus();
    c.onInput('Valparaíso');
    c.onKey(key('Enter'));
    expect(changes).toEqual(['Valparaíso']);
    expect(c.text).toBe('Valparaíso');
  });

  it('sin allowFree, salir del campo no guarda texto suelto', () => {
    const { c, changes } = make();
    c.writeValue('CO');
    c.onFocus();
    c.onInput('xyz');
    c.onBlur();
    expect(changes).toEqual([]);
    expect(c.text).toBe('Colombia');
  });
});

describe('Buscador · al volver a un campo con valor', () => {
  it('muestra lo elegido (no queda vacío) y la lista completa', () => {
    const { c } = make();
    c.writeValue('CL');
    c.onFocus();
    expect(c.text).toBe('Chile');
    expect(c.shown.length).toBe(OPTIONS.length);
    expect(c.shown[c.active].value).toBe('CL');
  });

  it('pasar con Tab sin escribir no cambia el valor, ni siquiera un texto libre', () => {
    const { c, changes } = make({ allowFree: true });
    c.writeValue('Valparaíso');
    c.onFocus();
    c.onKey(key('Tab'));
    c.onBlur();
    expect(changes).toEqual([]);
  });
});
