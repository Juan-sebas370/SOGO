import { TraGuest, TraRecord } from './tra.model';
import { Reservation } from '../reservations/reservation.model';
import { sireDefaults, sireIssues, sireMovements, sireFormFields, splitLastNames, isDue, dmy } from './sire-rules';

const guest = (over: Partial<TraGuest> = {}): TraGuest => ({
  id: 'g1', role: 'PRINCIPAL', unitId: 'hab-103', docType: 'PA', docNumber: 'A01325877', firstNames: 'Larry', lastNames: 'Waytt Cost',
  ownTravel: true, phone: '', email: '', birthDate: '1980-03-15',
  travel: { residenceCountry: 'US', residenceCity: 'US-MIA', originCountry: 'US', originCity: 'US-MIA', reasonId: 1, checkIn: '2026-11-02', checkOut: '2026-11-04' },
  ...over,
});

const record = (guests: TraGuest[] = [guest()], over: Partial<TraRecord> = {}): TraRecord => ({
  reservationId: '7', status: 'REPORTADA', units: [], guests, sends: [], history: [], updatedAt: '', ...over,
});

const reservation = (over: Partial<Reservation> = {}): Reservation => ({
  id: '7', code: 'RSV-2026-00007', guestName: 'Larry Waytt', firstName: 'Larry', lastName: 'Waytt', docType: 'Pasaporte',
  docNumber: 'A01325877', phone: '', email: '', city: '', reservationType: 'Individual', channel: 'Directo',
  lodgingType: 'Habitación', rooms: ['103'], adults: 1, children: 0, infants: 0, checkIn: '2026-11-02', checkOut: '2026-11-04', nights: 2,
  plan: 'Solo alojamiento', lodgingAmount: 200_000, extrasAmount: 0, payments: [], status: 'Confirmada', observations: '',
  createdAt: '2026-10-01T10:00', updatedAt: '2026-10-01T10:00', ...over,
} as Reservation);

/** Datos SIRE completos guardados para g1. */
const withSire = (over: Partial<TraRecord> = {}) => record([guest()], {
  sire: { guests: { g1: { ...sireDefaults(record(), guest()), nationality: 'US' } }, reports: [] }, ...over,
});

describe('SIRE · reglas', () => {
  it('solo los documentos extranjeros generan movimientos', () => {
    const rec = record([guest(), guest({ id: 'g2', role: 'ACOMPANANTE', docType: 'CC', docNumber: '1094' })]);
    const ms = sireMovements(rec, reservation({ checkedInAt: '2026-11-02T15:00' }), '2026-11-02');
    expect(ms.map(m => m.guestId)).toEqual(['g1', 'g1']);
  });

  it('antes del check-in la entrada y la salida están programadas', () => {
    const ms = sireMovements(withSire(), reservation(), '2026-11-01');
    expect(ms.map(m => m.status)).toEqual(['PROGRAMADO', 'PROGRAMADO']);
    expect(ms.some(isDue)).toBeFalse();
  });

  it('la entrada se reporta el día del check-in real y vence al día siguiente', () => {
    const r = reservation({ checkedInAt: '2026-11-02T15:00' });
    expect(sireMovements(withSire(), r, '2026-11-02')[0]).toEqual(jasmine.objectContaining({ type: 'ENTRADA', date: '2026-11-02', status: 'PENDIENTE' }));
    expect(sireMovements(withSire(), r, '2026-11-03')[0].status).toBe('VENCIDO');
  });

  it('la salida usa la fecha real del check-out, aunque sea anticipada', () => {
    const r = reservation({ checkedInAt: '2026-11-02T15:00', checkedOutAt: '2026-11-03T09:30' });
    const salida = sireMovements(withSire(), r, '2026-11-03')[1];
    expect(salida).toEqual(jasmine.objectContaining({ type: 'SALIDA', date: '2026-11-03', status: 'PENDIENTE' }));
  });

  it('con datos faltantes queda INCOMPLETO y dice qué falta', () => {
    const ms = sireMovements(record(), reservation({ checkedInAt: '2026-11-02T15:00' }), '2026-11-02');
    expect(ms[0].status).toBe('INCOMPLETO');
    expect(ms[0].issues).toContain('Falta la nacionalidad');
  });

  it('un movimiento marcado como reportado queda REPORTADO con su fecha', () => {
    const rec = withSire();
    rec.sire!.reports = [{ guestId: 'g1', type: 'ENTRADA', movementDate: '2026-11-02', reportedAt: '2026-11-02T16:00:00', reportedBy: 'recepcion' }];
    const ms = sireMovements(rec, reservation({ checkedInAt: '2026-11-02T15:00' }), '2026-11-05');
    expect(ms[0].status).toBe('REPORTADO');
    expect(ms[0].report?.reportedBy).toBe('recepcion');
  });

  it('una reserva anulada sin check-in no tiene nada que reportar', () => {
    expect(sireMovements(withSire(), reservation({ status: 'Cancelada' }), '2026-11-02')).toEqual([]);
  });

  it('separa los apellidos para el SIRE', () => {
    expect(splitLastNames('Waytt Cost')).toEqual(['Waytt', 'Cost']);
    expect(splitLastNames('Smith')).toEqual(['Smith', '']);
  });

  it('no deduce la nacionalidad de la residencia y no acepta Colombia', () => {
    expect(sireDefaults(record(), guest()).nationality).toBe('');
    const d = { ...sireDefaults(record(), guest()), nationality: 'CO' };
    expect(sireIssues(record(), guest(), d).some(i => i.includes('Colombia'))).toBeTrue();
  });

  it('el segundo apellido puede ir vacío', () => {
    const g = guest({ lastNames: 'Smith' });
    const d = { ...sireDefaults(record([g]), g), nationality: 'GB' };
    expect(sireIssues(record([g]), g, d)).toEqual([]);
  });

  it('entrega los campos en el orden del formulario de Alojamiento y Hospedaje', () => {
    const fields = sireFormFields(withSire(), guest(), { type: 'ENTRADA', date: '2026-04-02' }, 'Pasaporte');
    expect(fields.map(f => f.label)).toEqual([
      'Tipo de movimiento', 'Fecha de movimiento', 'Tipo de documento', 'Número de documento', 'Fecha de nacimiento',
      'Primer apellido', 'Segundo apellido', 'Nombres', 'Nacionalidad', 'País de procedencia', 'País próximo destino',
    ]);
    expect(fields.map(f => f.value)).toEqual([
      'Entrada', '2/4/2026', 'PASAPORTE', 'A01325877', '15/3/1980', 'WAYTT', 'COST', 'LARRY', 'ESTADOS UNIDOS', 'ESTADOS UNIDOS', 'ESTADOS UNIDOS',
    ]);
  });

  it('formatea fechas como el calendario del SIRE', () => {
    expect(dmy('2023-04-02')).toBe('2/4/2023');
    expect(dmy('')).toBe('');
  });
});
