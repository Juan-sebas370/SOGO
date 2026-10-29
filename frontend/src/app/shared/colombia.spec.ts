import { CO_DEPARTMENTS, townsOf, parsePlace, formatPlace, isColombia, matchColombia } from './colombia';

describe('Catálogo DANE de Colombia', () => {
  it('tiene los 33 departamentos (incluye Bogotá D.C. y San Andrés) y 1.122 municipios', () => {
    expect(CO_DEPARTMENTS.length).toBe(33);
    expect(CO_DEPARTMENTS.reduce((s, d) => s + d.towns.length, 0)).toBe(1122);
    expect(CO_DEPARTMENTS.map(d => d.name)).toEqual(jasmine.arrayContaining(['Bogotá D.C.', 'San Andrés y Providencia']));
  });

  it('no repite departamentos ni municipios dentro de un departamento', () => {
    expect(new Set(CO_DEPARTMENTS.map(d => d.name)).size).toBe(33);
    CO_DEPARTMENTS.forEach(d => expect(new Set(d.towns).size).withContext(d.name).toBe(d.towns.length));
  });

  it('lista los municipios de un departamento', () => {
    expect(townsOf('Quindío')).toEqual(jasmine.arrayContaining(['Armenia', 'Filandia', 'Salento']));
    expect(townsOf('Quindío').length).toBe(12);
    expect(townsOf('No existe')).toEqual([]);
  });
});

describe('Lugar de residencia por partes', () => {
  it('separa el formato guardado "País - Municipio, Departamento"', () => {
    expect(parsePlace('Colombia - Pereira, Risaralda')).toEqual({ country: 'Colombia', department: 'Risaralda', town: 'Pereira' });
  });

  it('entiende registros viejos sin país', () => {
    expect(parsePlace('Pereira, Risaralda')).toEqual({ country: 'Colombia', department: 'Risaralda', town: 'Pereira' });
  });

  it('ajusta tildes y mayúsculas al nombre del catálogo', () => {
    expect(parsePlace('colombia - CALARCA, quindio')).toEqual({ country: 'Colombia', department: 'Quindío', town: 'Calarcá' });
  });

  it('conserva lo escrito para otros países', () => {
    expect(parsePlace('España - Madrid, Comunidad de Madrid')).toEqual({ country: 'España', department: 'Comunidad de Madrid', town: 'Madrid' });
  });

  it('un lugar vacío queda en Colombia sin departamento', () => {
    expect(parsePlace('')).toEqual({ country: 'Colombia', department: '', town: '' });
  });

  it('un municipio que no es del departamento no se inventa', () => {
    expect(parsePlace('Colombia - Pereira, Quindío')).toEqual({ country: 'Colombia', department: 'Quindío', town: '' });
  });

  it('une las partes en el formato que leen Facturación y TRA', () => {
    expect(formatPlace({ country: 'Colombia', department: 'Risaralda', town: 'Pereira' })).toBe('Colombia - Pereira, Risaralda');
    expect(formatPlace({ country: 'Colombia', department: '', town: '' })).toBe('');
    expect(formatPlace({ country: 'Francia', department: '', town: '' })).toBe('Francia');
  });

  it('ida y vuelta: separar y volver a unir da el mismo texto', () => {
    const text = 'Colombia - Filandia, Quindío';
    expect(formatPlace(parsePlace(text))).toBe(text);
  });

  it('reconoce Colombia sin importar tildes o mayúsculas', () => {
    expect(isColombia('COLOMBIA')).toBeTrue();
    expect(isColombia('')).toBeTrue();
    expect(isColombia('Perú')).toBeFalse();
  });

  it('matchColombia devuelve vacío si no está en el catálogo', () => {
    expect(matchColombia('Atlantis', 'Ciudad')).toEqual({ department: '', town: '' });
  });
});
