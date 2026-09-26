import { Reservation } from '../reservations/reservation.model';
import { isoDate, isoDateTime } from '../shared/date-utils';
import { TraRecord, TraGuest, TraStatus, TraSend, TraEvent, TraSettings, LodgingUnit, Relationship } from './tra.model';
import { draftFor, fullName, isMinor, splitName } from './tra-rules';
import { ROOMS, summaryOf } from '../lodging/house';

// Datos de demostración: cada TRA apunta a una reserva real de ReservationService
// (RSV-<año>-00108…) con sus mismas fechas, unidades y valores, y entre todas
// cubren cada estado del flujo (borrador, corrección, lista, error y reportada).

type Person = [docType: string, docNumber: string, firstNames: string, lastNames: string, relationship: Relationship, birthDate: string];

interface Spec {
  status:      TraStatus;
  reason:      number;                 // motivo de viaje del grupo
  origin?:     string;                 // ciudad de procedencia (por defecto, la de residencia)
  lastNames?:  string;                 // apellidos completos del principal
  birthDate?:  string;
  companions:  Person[] | 'auto';      // 'auto': se generan según adultos/niños de la reserva
  registered?: number;                 // con 'auto': cuántos acompañantes ya se registraron
}

const SPECS: Record<number, Spec> = {
  108: { status: 'REPORTADA', reason: 1, companions: 'auto' },
  109: { status: 'REPORTADA', reason: 2, origin: '11001', companions: 'auto' },
  110: { status: 'REPORTADA', reason: 2, companions: [] },
  111: { status: 'REPORTADA', reason: 1, companions: 'auto' },
  116: { status: 'REPORTADA', reason: 2, companions: [['CC', '1100887766', 'Andrés', 'Torres Gil', 'Cónyuge', '1994-06-02']] },
  117: { status: 'REPORTADA', reason: 8, companions: [
    ['CC', '1110998877', 'Paula', 'Arango Ruiz', 'Cónyuge', '1988-11-20'],
    ['TI', '1111223344', 'Samuel', 'Ramírez Arango', 'Hijo/a', '2014-04-09'],
  ] },
  118: { status: 'ERROR', reason: 1, lastNames: 'Pinilla', companions: [
    ['CC', '1120556677', 'Carolina', 'Mejía Ríos', 'Cónyuge', '1993-02-14'],
    ['TI', '1121334455', 'Tomás', 'Pinilla Mejía', 'Hijo/a', '2015-08-30'],
    ['TI', '1121445566', 'Sara', 'Pinilla Mejía', 'Hijo/a', '2017-12-03'],
  ] },
  119: { status: 'REQUIERE_CORRECCION', reason: 1, origin: '11001', companions: [['CC', '', 'Felipe', 'Duque Álvarez', 'Amigo/a', '1991-05-17']] },
  120: { status: 'LISTA_PARA_ENVIO', reason: 2, companions: [] },
  121: { status: 'BORRADOR', reason: 1, companions: [] },
  122: { status: 'BORRADOR', reason: 6, companions: 'auto', registered: 5 },
  123: { status: 'BORRADOR', reason: 1, lastNames: 'Gómez Restrepo', birthDate: '1988-03-14', companions: [
    ['CC', '1094332118', 'Andrés', 'Gómez Ríos', 'Cónyuge', '1986-07-22'],
    ['TI', '1092884551', 'Sofía', 'Gómez Gómez', 'Hijo/a', '2012-10-05'],
    ['TI', '', 'Martín', 'Gómez Gómez', 'Hijo/a', '2015-01-19'],
    ['PA', 'X4821773', 'Lucía', 'Herrera Smith', 'Amigo/a', '1990-03-08'],
  ] },
};

const ADULTS   = ['Camila', 'Andrés', 'Paola', 'Julián', 'Marcela', 'Santiago', 'Liliana', 'Esteban', 'Carolina', 'Mauricio', 'Juliana', 'Ricardo', 'Sandra', 'Hernán'];
const MINORS   = ['Tomás', 'Sara', 'Samuel', 'Mariana', 'Jerónimo', 'Isabela', 'Simón', 'Martina'];
const SURNAMES = ['García', 'Rodríguez', 'López', 'Hernández', 'Moreno', 'Muñoz', 'Díaz', 'Vargas', 'Osorio', 'Castaño', 'Quintero', 'Cardona', 'Ospina', 'Arias'];

/** Acompañantes coherentes con los adultos y niños de la reserva. */
function crowd(r: Reservation, code: number): Person[] {
  const family = r.reservationType === 'Grupo familiar';
  const surname = splitName(r.guestName)[1];
  const s = (i: number) => SURNAMES[(code + i) % SURNAMES.length];
  const adults: Person[] = Array.from({ length: r.adults - 1 }, (_, i) => [
    'CC', String(1_000_000_000 + ((code * 997 + i * 7919) % 99_999_999)), ADULTS[(code + i) % ADULTS.length], `${s(i)} ${s(i + 5)}`,
    family ? (i === 0 ? 'Cónyuge' : 'Otro familiar') : 'Compañero de trabajo', `${1975 + ((code + i * 7) % 20)}-0${1 + (i % 9)}-1${i % 9}`,
  ]);
  const minors: Person[] = Array.from({ length: r.children + r.infants }, (_, i) => [
    'TI', String(1_100_000_000 + ((code * 613 + i * 104_729) % 9_999_999)), MINORS[(code + i) % MINORS.length], `${surname} ${s(i + 2)}`,
    family ? 'Hijo/a' : 'Otro familiar', `${2010 + ((code + i * 3) % 12)}-0${1 + (i % 9)}-2${i % 9}`,
  ]);
  return [...adults, ...minors];
}

/** Marca de tiempo local YYYY-MM-DDTHH:mm:ss */
const at = (date: string, time: string) => `${date}T${time}`;
function ago(minutes: number, plusSeconds = 0): string {
  const d = new Date(Date.now() - minutes * 60_000 + plusSeconds * 1000);
  return `${isoDateTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
}
const addSeconds = (stamp: string, s: number) => {
  const d = new Date(stamp);
  d.setSeconds(d.getSeconds() + s);
  return `${isoDateTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const ev = (stamp: string, title: string, detail: string, tone: TraEvent['tone']): TraEvent => ({ at: stamp, title, detail, tone });

function build(r: Reservation, code: number, spec: Spec, units: LodgingUnit[]): TraRecord {
  const rec = draftFor(r, units, `${r.checkIn}T09:00`);
  const principal = rec.guests[0];
  const home = principal.travel.residenceCity;
  principal.lastNames = spec.lastNames ?? principal.lastNames;
  principal.birthDate = spec.birthDate ?? '';
  principal.travel = { ...principal.travel, originCountry: 'CO', originCity: spec.origin ?? home, reasonId: spec.reason };

  const people = spec.companions === 'auto' ? crowd(r, code).slice(0, spec.registered) : spec.companions;
  const unitIds = rec.units.map(u => u.unitId);
  rec.guests.push(...people.map(([docType, docNumber, firstNames, lastNames, relationship, birthDate], i): TraGuest => ({
    id: `${r.id}-g${i + 2}`, role: 'ACOMPANANTE',
    // Con varias habitaciones, los niños quedan en la segunda
    unitId: unitIds.length > 1 && docType === 'TI' ? unitIds[1] : unitIds[0],
    docType, docNumber, firstNames, lastNames, relationship, birthDate,
    ownTravel: false, travel: { ...principal.travel }, phone: '', email: '',
  })));

  // Menores ya verificados en los grupos que llegaron o están por reportarse
  rec.guests.filter(g => g.role === 'ACOMPANANTE' && isMinor(rec, g)).forEach(g => g.minorCheck = {
    verified: true, travelsWith: `${fullName(principal)} (huésped principal)`, support: 'Registro civil',
    verifiedBy: 'Administrador', verifiedAt: `${isoDate(-1)}T18:20`,
  });

  rec.status = spec.status;
  rec.history = [ev(at(r.checkIn < isoDate(0) ? r.checkIn : isoDate(0), '08:30:00'), 'Pre-registro iniciado', 'Datos del huésped principal tomados de la reserva', 'muted')];
  return rec;
}

/** Envío completo y exitoso el día del check-in. */
function reported(rec: TraRecord, r: Reservation, code: number): void {
  const start = at(r.checkIn, '15:12:02');
  const mincitId = `TRA-${458_100 + code}`;
  const req = (i: number) => `req-${r.checkIn.slice(8, 10)}${r.checkIn.slice(5, 7)}1512-${String(i + 1).padStart(4, '0')}`;
  rec.checkInAt = at(r.checkIn, '15:10:00');
  rec.sentBy = 'Administrador';
  rec.sends = rec.guests.map((g, i): TraSend => ({
    guestId: g.id, endpoint: i === 0 ? 'ONE' : 'TWO', status: 'EXITOSO', attempts: 1,
    attemptAt: addSeconds(start, 2 + i), httpStatus: 200, requestId: req(i), mincitId, message: 'OK', durationMs: 380 + (i * 37) % 120,
  }));
  rec.history = [
    ev(addSeconds(at(r.checkIn, '18:22:00'), -2 * 86_400), 'Registro de huéspedes completado', 'Administrador', 'muted'),
    ev(rec.checkInAt, 'Check-in confirmado', 'Administrador', 'info'),
    ev(start, 'Validación previa: 8 de 8', 'Todo correcto', 'info'),
    ...rec.sends.map((s, i) => ev(s.attemptAt!, `POST /${i === 0 ? 'one' : 'two'}/ · ${fullName(rec.guests[i])} · 200`, i === 0 ? `ID ${mincitId}` : 'Con ID del principal', 'ok' as const)),
    ev(rec.sends[rec.sends.length - 1].attemptAt!, 'TRA reportada', `${rec.sends.length} de ${rec.sends.length} exitosos`, 'ok'),
  ].reverse();
  rec.updatedAt = rec.history[0].at;
}

/** Check-in de hoy: /one/ salió bien, pero el acompañante 2 recibió HTTP 500 dos veces. */
function failed(rec: TraRecord): void {
  const first = ago(20), retry = ago(5);
  const mincitId = 'TRA-458291';
  rec.checkInAt = ago(22);
  rec.sentBy = 'Administrador';
  rec.sends = rec.guests.map((g, i): TraSend => i === 2
    ? { guestId: g.id, endpoint: 'TWO', status: 'ERROR', attempts: 2, attemptAt: retry, httpStatus: 500, requestId: 'req-auto-0007', message: 'Error interno del servidor de MinCIT', durationMs: 1210 }
    : { guestId: g.id, endpoint: i === 0 ? 'ONE' : 'TWO', status: 'EXITOSO', attempts: 1, attemptAt: addSeconds(first, i), httpStatus: 200,
        requestId: `req-auto-000${i + 1}`, mincitId, message: 'OK', durationMs: 400 + i * 21 });
  const name = (i: number) => fullName(rec.guests[i]);
  rec.history = [
    ev(ago(95), 'Registro de huéspedes completado', 'Administrador', 'muted'),
    ev(rec.checkInAt, 'Check-in confirmado', 'Administrador', 'info'),
    ev(addSeconds(first, -2), 'Validación previa: 8 de 8', 'Todo correcto', 'info'),
    ev(first, `POST /one/ · ${name(0)} · 200`, `ID ${mincitId}`, 'ok'),
    ev(addSeconds(first, 1), `POST /two/ · ${name(1)} · 200`, 'Con ID del principal', 'ok'),
    ev(addSeconds(first, 2), `POST /two/ · ${name(2)} · 500`, 'Error interno del servidor de MinCIT', 'danger'),
    ev(addSeconds(first, 3), `POST /two/ · ${name(3)} · 200`, 'Con ID del principal', 'ok'),
    ev(addSeconds(first, 4), 'Error de envío', '3 de 4 exitosos · la TRA local queda guardada', 'danger'),
    ev(retry, `Reintento automático · POST /two/ · ${name(2)} · 500`, 'Intento 2', 'danger'),
  ].reverse();
  rec.updatedAt = retry;
}

export function seedRecords(reservations: Reservation[], units: LodgingUnit[]): TraRecord[] {
  return reservations.flatMap(r => {
    const code = Number(r.code.split('-').pop());
    const spec = SPECS[code];
    if (!spec) return [];
    const rec = build(r, code, spec, units);

    if (spec.status === 'REPORTADA') reported(rec, r, code);
    if (spec.status === 'ERROR') failed(rec);
    if (spec.status === 'LISTA_PARA_ENVIO' || spec.status === 'REQUIERE_CORRECCION') {
      const ok = spec.status === 'LISTA_PARA_ENVIO';
      rec.history.unshift(ev(ago(40), `Validación previa: ${ok ? 8 : 7} de 8`, ok ? 'Lista para enviar en el check-in' : 'Falta número de documento del acompañante 1', ok ? 'info' : 'danger'));
    }

    if (code === 123) {
      // Menor con verificación pendiente y la acompañante extranjera con su propio viaje
      const [, , sofia, martin, lucia] = rec.guests;
      sofia.minorCheck = { ...sofia.minorCheck!, travelsWith: 'Natalia Gómez (madre, huésped principal)', verifiedAt: `${isoDate(-1)}T11:05` };
      martin.minorCheck = { verified: false, travelsWith: '', support: '' };
      lucia.ownTravel = true;
      lucia.travel = { ...lucia.travel, residenceCountry: 'US', residenceCity: 'US-MIA', originCountry: 'CO', originCity: '11001', reasonId: 8 };
    }
    return [rec];
  });
}

export function defaultSettings(): TraSettings {
  return {
    rnt: 'DEMO-00000', rntEmail: 'rnt@hospedaje-demo.co', tokenLast4: '4F2A', integrationActive: true,
    lastSync: `${isoDate(0)}T07:35`,
    provider: 'Hospedaje Sebastián', providerType: 'Vivienda turística', ciiu: '',
    department: 'Quindío', municipality: 'Filandia', address: '', phone: '', email: '', website: '',
    capacity: summaryOf(ROOMS.map(r => r.number)).capacity,
    autoRetry: true, maxAttempts: 3, retryMinutes: 15, notifyErrors: true,
  };
}
