import { TraGuest, TraRecord, TraSettings, LodgingUnit } from './tra.model';
import {
  validate, guestIssues, isComplete, travelOf, inherits, isMinor, needsSire, progressOf, nightsBetween,
  overCapacityUnits, totalValue, requiresTra, unitIdsFor, splitName, draftFor, fullName,
} from './tra-rules';
import { Reservation } from '../reservations/reservation.model';

const UNITS: LodgingUnit[] = [
  { id: 'hab-103', name: 'Hab. 103', type: 'HABITACION', floors: [1], capacity: 2, rooms: ['103'], active: true },
  { id: 'piso-1', name: 'Piso 1', type: 'PISO', floors: [1], capacity: 8, rooms: ['101', '102', '103'], active: true },
];

const settings = (over: Partial<TraSettings> = {}): TraSettings => ({
  rnt: '123456', rntEmail: '', tokenLast4: '', integrationActive: false, lastSync: '', provider: 'Hospedaje', providerType: '',
  ciiu: '', department: 'Quindío', municipality: 'Filandia', address: '', phone: '', email: '', website: '', capacity: 10,
  autoRetry: true, maxAttempts: 3, retryMinutes: 15, notifyErrors: true, ...over,
});

const principal = (over: Partial<TraGuest> = {}): TraGuest => ({
  id: 'g1', role: 'PRINCIPAL', unitId: 'hab-103', docType: 'CC', docNumber: '1094123456', firstNames: 'María José', lastNames: 'Gómez',
  ownTravel: true, phone: '', email: '', birthDate: '1990-05-10',
  travel: { residenceCountry: 'CO', residenceCity: '66001', originCountry: 'CO', originCity: '63001', reasonId: 1, checkIn: '2026-10-22', checkOut: '2026-10-24' },
  ...over,
});

const companion = (over: Partial<TraGuest> = {}): TraGuest => ({
  ...principal(), id: 'g2', role: 'ACOMPANANTE', docNumber: '1094999999', firstNames: 'Fernanda', lastNames: 'Gómez', ownTravel: false,
  travel: { residenceCountry: '', residenceCity: '', originCountry: '', originCity: '', reasonId: null, checkIn: '', checkOut: '' }, ...over,
});

const record = (guests: TraGuest[] = [principal(), companion()], over: Partial<TraRecord> = {}): TraRecord => ({
  reservationId: '21', status: 'BORRADOR', units: [{ unitId: 'hab-103', accommodationType: 'HABITACION', totalValue: 220_000 }],
  guests, sends: [], history: [], updatedAt: '', ...over,
});

const reservation = (over: Partial<Reservation> = {}): Reservation => ({
  id: '21', code: 'RSV-2026-00021', guestName: 'María José Gómez', firstName: 'María José', lastName: 'Gómez', docType: 'Cédula de Ciudadanía',
  docNumber: '1094123456', phone: '', email: '', city: 'Colombia - Pereira, Risaralda', reservationType: 'Individual', channel: 'Directo',
  lodgingType: 'Habitación', rooms: ['103'], adults: 2, children: 0, infants: 0, checkIn: '2026-10-22', checkOut: '2026-10-24', nights: 2,
  plan: 'Solo alojamiento', lodgingAmount: 220_000, extrasAmount: 0, payments: [], status: 'Confirmada', observations: '',
  createdAt: '', updatedAt: '', ...over,
});

describe('TRA · validación previa al envío', () => {
  it('una TRA completa queda lista aunque no haya token del MinCIT (se reporta a mano)', () => {
    const v = validate(record(), reservation(), settings({ tokenLast4: '', integrationActive: false }), UNITS);
    expect(v.issues).toEqual([]);
    expect(v.ok).toBeTrue();
    // El token se informa como revisión no superada, pero no bloquea
    expect(v.checks.find(c => c.label === 'Token PMS configurado')!.ok).toBeFalse();
  });

  it('si no está lista, siempre dice por qué (nunca "no lista" sin mensajes)', () => {
    const v = validate(record([principal({ docNumber: '' })]), reservation({ adults: 1 }), settings(), UNITS);
    expect(v.ok).toBeFalse();
    expect(v.issues.length).toBeGreaterThan(0);
  });

  it('exige el RNT del establecimiento', () => {
    const v = validate(record(), reservation(), settings({ rnt: '' }), UNITS);
    expect(v.ok).toBeFalse();
    expect(v.issues.map(i => i.message)).toContain('El RNT no está configurado (Configuración TRA)');
  });

  it('no se cae si la configuración llega con datos vacíos (null)', () => {
    const s = settings({ rnt: null as unknown as string, lastSync: null as unknown as string });
    expect(() => validate(record(), reservation(), s, UNITS)).not.toThrow();
  });

  it('exige registrar a todos los huéspedes que declara la reserva', () => {
    const v = validate(record([principal()]), reservation({ adults: 3 }), settings(), UNITS);
    expect(v.issues.some(i => i.message.startsWith('Faltan 2 acompañantes'))).toBeTrue();
  });

  it('detecta más huéspedes que la capacidad de la unidad', () => {
    const three = [principal(), companion(), companion({ id: 'g3', docNumber: '1' + '0'.repeat(9) })];
    const v = validate(record(three), reservation({ adults: 3 }), settings(), UNITS);
    expect(v.issues.some(i => i.message.includes('capacidad para 2'))).toBeTrue();
  });

  it('el valor del alojamiento debe ser mayor a cero', () => {
    const rec = record(undefined, { units: [{ unitId: 'hab-103', accommodationType: 'HABITACION', totalValue: 0 }] });
    expect(validate(rec, reservation(), settings(), UNITS).issues.map(i => i.message)).toContain('El valor total del alojamiento debe ser mayor a cero');
  });

  it('la salida debe ser posterior a la entrada', () => {
    const p = principal({ travel: { ...principal().travel, checkOut: '2026-10-22' } });
    expect(validate(record([p, companion()]), reservation(), settings(), UNITS).issues.map(i => i.message))
      .toContain('La fecha de salida debe ser posterior a la de entrada');
  });

  it('rechaza una ciudad que no pertenece al país', () => {
    const p = principal({ travel: { ...principal().travel, residenceCountry: 'PE' } });
    expect(validate(record([p, companion()]), reservation(), settings(), UNITS).issues.some(i => i.message.includes('catálogo inválidos'))).toBeTrue();
  });
});

describe('TRA · huéspedes', () => {
  it('lista exactamente lo que le falta a un huésped', () => {
    const g = principal({ docNumber: '', travel: { ...principal().travel, reasonId: null } });
    expect(guestIssues(record([g]), g)).toEqual(['Falta número de documento del huésped principal', 'Motivo de viaje no seleccionado del huésped principal']);
  });

  it('el acompañante hereda residencia, procedencia y fechas del principal', () => {
    const rec = record();
    expect(inherits(rec.guests[1])).toBeTrue();
    expect(travelOf(rec, rec.guests[1])).toEqual(rec.guests[0].travel);
    expect(isComplete(rec, rec.guests[1])).toBeTrue();
  });

  it('identifica menores por tarjeta de identidad o por edad', () => {
    const rec = record();
    expect(isMinor(rec, companion({ docType: 'TI' }))).toBeTrue();
    expect(isMinor(rec, companion({ birthDate: '2015-01-01' }))).toBeTrue();
    expect(isMinor(rec, companion({ birthDate: '1990-01-01' }))).toBeFalse();
  });

  it('los documentos de extranjero se reportan también al SIRE', () => {
    expect(needsSire(principal({ docType: 'PA' }))).toBeTrue();
    expect(needsSire(principal({ docType: 'CC' }))).toBeFalse();
  });

  it('el progreso cuenta huéspedes completos frente a los declarados', () => {
    expect(progressOf(record(), reservation())).toEqual({ done: 2, expected: 2, pct: 100 });
    expect(progressOf(record([principal()]), reservation({ adults: 4 })).pct).toBe(25);
  });

  it('nombre completo sin espacios de más y tolerante a vacíos', () => {
    expect(fullName(principal())).toBe('María José Gómez');
    expect(fullName(principal({ firstNames: null as unknown as string, lastNames: 'Gómez' }))).toBe('Gómez');
  });
});

describe('TRA · utilidades', () => {
  it('cuenta noches entre dos fechas', () => {
    expect(nightsBetween('2026-10-22', '2026-10-24')).toBe(2);
    expect(nightsBetween('', '2026-10-24')).toBe(0);
  });

  it('suma el valor total de las unidades', () => {
    expect(totalValue(record())).toBe(220_000);
  });

  it('no reporta exceso de capacidad cuando cabe', () => {
    expect(overCapacityUnits(record(), UNITS)).toEqual([]);
  });

  it('una pasadía no genera TRA', () => {
    expect(requiresTra(reservation({ reservationType: 'Evento / Pasadía' }))).toBeFalse();
    expect(requiresTra(reservation())).toBeTrue();
  });

  it('elige la unidad según el tipo de alojamiento', () => {
    expect(unitIdsFor(reservation())).toEqual(['hab-103']);
    expect(unitIdsFor(reservation({ lodgingType: 'Piso', floor: 1 }))).toEqual(['piso-1']);
    expect(unitIdsFor(reservation({ lodgingType: 'Casa completa' }))).toEqual(['casa']);
  });

  it('separa nombres y apellidos', () => {
    expect(splitName('Juan Sebastián Pinilla Arcila')).toEqual(['Juan Sebastián', 'Pinilla Arcila']);
  });

  it('el borrador toma el huésped y la residencia de la reserva', () => {
    const d = draftFor(reservation(), UNITS, '2026-10-22T10:00');
    expect(d.status).toBe('BORRADOR');
    expect(d.guests[0].firstNames).toBe('María José');
    expect(d.guests[0].travel.residenceCountry).toBe('CO');
    expect(d.guests[0].travel.residenceCity).toBe('66001');   // Pereira, del catálogo TRA
  });
});
