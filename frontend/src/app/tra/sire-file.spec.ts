import { TraGuest, TraRecord } from './tra.model';
import { SIRE_TXT_COLUMNS, SireCodes, sireColumns, sireTxt, missingCodes } from './sire-file';
import { sireCodes, sireCityCode, SIRE_DOC_CODES, SIRE_COUNTRY_CODES } from './sire-codes';
import { ansi } from './tra-sire/tra-sire.component';

const guest: TraGuest = {
  id: 'g1', role: 'PRINCIPAL', unitId: 'hab-103', docType: 'PA', docNumber: ' A01325877 ', firstNames: 'Larry', lastNames: 'Waytt Cost',
  ownTravel: true, phone: '', email: '', birthDate: '1980-03-15',
  travel: { residenceCountry: 'US', residenceCity: 'Miami', originCountry: 'US', originCity: 'Miami', reasonId: 1, checkIn: '2026-11-02', checkOut: '2026-11-04' },
};
const rec: TraRecord = {
  reservationId: '7', status: 'REPORTADA', units: [], guests: [guest], sends: [], history: [], updatedAt: '',
  sire: { guests: { g1: { firstLastName: 'Waytt', secondLastName: 'Cost', birthDate: '1980-03-15', nationality: 'US', originCountry: 'US', nextDestination: 'US' } }, reports: [] },
};

/** Códigos de ejemplo SOLO para la prueba: los reales salen del paquete de guía del SIRE. */
const codes: SireCodes = {
  hotel: 'H1', city: 'C1', docType: c => `D-${c}`, country: id => `P-${id}`, movement: t => t[0], date: iso => `F-${iso}`,
};

describe('SIRE · archivo plano', () => {
  it('tiene las 13 columnas del instructivo, en su orden', () => {
    expect(SIRE_TXT_COLUMNS.length).toBe(13);
    expect(sireColumns({ rec, guest, type: 'ENTRADA', date: '2026-11-02' }, codes)).toEqual([
      'H1', 'C1', 'D-PA', 'A01325877', 'P-US', 'WAYTT', 'COST', 'LARRY', 'E', 'F-2026-11-02', 'P-US', 'P-US', 'F-1980-03-15',
    ]);
  });

  it('separa con TAB y una línea por movimiento', () => {
    const txt = sireTxt([{ rec, guest, type: 'ENTRADA', date: '2026-11-02' }, { rec, guest, type: 'SALIDA', date: '2026-11-04' }], codes);
    const lines = txt.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines[0].split('\t').length).toBe(13);
    expect(lines[1].split('\t')[8]).toBe('S');
  });

  it('un TAB dentro de un dato no corre las columnas', () => {
    const g = { ...guest, firstNames: 'Larry\tJohn' };
    expect(sireTxt([{ rec, guest: g, type: 'ENTRADA', date: '2026-11-02' }], codes).trim().split('\t').length).toBe(13);
  });

  it('avisa qué códigos faltan en lugar de dejar columnas vacías', () => {
    const sinPaises: SireCodes = { ...codes, country: () => '' };
    expect(missingCodes({ rec, guest, type: 'ENTRADA', date: '2026-11-02' }, sinPaises))
      .toEqual(['Código de Nacionalidad', 'Lugar de Procedencia', 'Lugar de Destino']);
  });
});

describe('SIRE · códigos del paquete de guía', () => {
  it('traduce documento, movimiento, países, ciudad y fechas como el archivo de ejemplo', () => {
    const c = sireCodes('94131', sireCityCode('Filandia', 'Quindío'));
    expect(c.city).toBe('63272');
    expect(sireCityCode('Medellín', 'Antioquia')).toBe('5001');
    expect(sireColumns({ rec, guest, type: 'ENTRADA', date: '2026-11-02' }, c)).toEqual([
      '94131', '63272', '3', 'A01325877', '249', 'WAYTT', 'COST', 'LARRY', 'E', '02/11/2026', '249', '249', '15/03/1980',
    ]);
  });

  it('códigos de documento y país del SIRE (no son los ISO)', () => {
    expect(SIRE_DOC_CODES).toEqual({ PA: '3', CE: '5', DNI: '10', PPT: '52' });
    expect(SIRE_COUNTRY_CODES['CL']).toBe('211');
    expect(SIRE_COUNTRY_CODES['CO']).toBe('169');
    expect(SIRE_COUNTRY_CODES['VE']).toBe('850');
    expect(SIRE_COUNTRY_CODES['SS']).toBeUndefined();
  });

  it('el PEP no tiene código en el SIRE: se avisa en lugar de inventarlo', () => {
    const c = sireCodes('94131', '63272');
    expect(missingCodes({ rec, guest: { ...guest, docType: 'PEP' }, type: 'ENTRADA', date: '2026-11-02' }, c)).toEqual(['Tipo de Documento']);
  });

  it('el archivo va en ANSI: la Ñ ocupa un byte', () => {
    expect([...ansi('PEÑA')]).toEqual([80, 69, 0xD1, 65]);
    expect([...ansi('Ő')]).toEqual([79]);   // fuera de ANSI: la letra sin la tilde
  });
});
