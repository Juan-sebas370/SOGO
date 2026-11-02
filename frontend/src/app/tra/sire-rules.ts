import { Reservation, isVoid } from '../reservations/reservation.model';
import { isoDate } from '../shared/date-utils';
import { TraRecord, TraGuest, SireGuestData, SireMovement, SireMovementType, SireReport, SireStatus } from './tra.model';
import { country } from './tra-catalogs';
import { needsSire, travelOf, splitName } from './tra-rules';

// Reglas del SIRE (Migración Colombia) como funciones puras.
// - Se reportan solo los huéspedes con documento extranjero (needsSire).
// - Dos movimientos por huésped: ENTRADA el día del check-in y SALIDA el día del
//   check-out, aunque sean el mismo día.
// - Plazo: el mismo día del movimiento (Res. 2357 de 2020, art. 6); al día
//   siguiente el movimiento queda VENCIDO, pero se puede seguir reportando.
// - Formulario de Alojamiento y Hospedaje: todos los campos son obligatorios y
//   los registros que se guardan juntos deben tener la misma fecha de movimiento.

/** El SIRE se abre desde el banner SIRE del portal de Migración Colombia (cartilla, numeral 1). */
export const SIRE_PORTAL = 'https://www.migracioncolombia.gov.co';

/**
 * Datos SIRE prellenados desde la TRA: apellidos separados, procedencia de la TRA y destino = residencia.
 * La nacionalidad no se deduce (residir en un país no es tener su nacionalidad): se copia del pasaporte.
 */
export function sireDefaults(rec: TraRecord, g: TraGuest): SireGuestData {
  const t = travelOf(rec, g);
  const [first, second] = splitLastNames(g.lastNames ?? '');
  return {
    firstLastName: first, secondLastName: second, birthDate: g.birthDate ?? '', nationality: '',
    originCountry: t.originCountry, nextDestination: t.residenceCountry,
  };
}

/** "Waytt Cost" → ["Waytt", "Cost"]; un solo apellido deja el segundo vacío. */
export function splitLastNames(lastNames: string): [string, string] {
  const words = lastNames.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] ?? '', ''];
  return words.length === 2 ? [words[0], words[1]] : splitName(lastNames);
}

/** Lo guardado para el huésped, o los valores prellenados si aún no se ha guardado nada. */
export function sireDataOf(rec: TraRecord, g: TraGuest): SireGuestData {
  return { ...sireDefaults(rec, g), ...(rec.sire?.guests[g.id] ?? {}) };
}

/** Lo que impide diligenciar el formulario SIRE. El segundo apellido puede ir vacío (no lo tienen todos). */
export function sireIssues(rec: TraRecord, g: TraGuest, d = sireDataOf(rec, g)): string[] {
  const out: string[] = [];
  if (!g.docType || !(g.docNumber ?? '').trim()) out.push('Falta el documento');
  if (!(g.firstNames ?? '').trim())             out.push('Faltan los nombres');
  if (!d.firstLastName.trim())                  out.push('Falta el primer apellido');
  if (!d.birthDate)                             out.push('Falta la fecha de nacimiento');
  else if (d.birthDate > isoDate(0))           out.push('La fecha de nacimiento es posterior a hoy');
  if (!d.nationality)                           out.push('Falta la nacionalidad');
  else if (d.nationality === 'CO')              out.push('La nacionalidad no puede ser Colombia: el SIRE es solo para extranjeros');
  if (!d.originCountry)                         out.push('Falta el país de procedencia');
  if (!d.nextDestination)                       out.push('Falta el país de próximo destino');
  return out;
}

export const foreignersOf = (rec: TraRecord): TraGuest[] => rec.guests.filter(needsSire);

export function reportOf(rec: TraRecord, guestId: string, type: SireMovementType): SireReport | undefined {
  return rec.sire?.reports.find(x => x.guestId === guestId && x.type === type);
}

/**
 * Movimientos SIRE de una reserva. La ENTRADA existe desde el check-in real y la SALIDA desde el
 * check-out real; antes de eso quedan PROGRAMADOS con la fecha de la reserva. Una reserva anulada
 * solo conserva lo que alcanzó a ocurrir.
 */
export function sireMovements(rec: TraRecord, r: Reservation, today = isoDate(0)): SireMovement[] {
  const out: SireMovement[] = [];
  foreignersOf(rec).forEach(g => {
    const issues = sireIssues(rec, g);
    const add = (type: SireMovementType, happened: string | undefined, planned: string) => {
      if (!happened && isVoid(r)) return;
      const report = reportOf(rec, g.id, type);
      const date = report?.movementDate ?? happened?.slice(0, 10) ?? planned;
      out.push({ reservationId: r.id, guestId: g.id, type, date, issues, report,
        status: statusOf(!!happened, date, issues, report, today) });
    };
    add('ENTRADA', r.checkedInAt, r.checkIn);
    add('SALIDA', r.checkedOutAt, r.checkOut);
  });
  return out;
}

function statusOf(happened: boolean, date: string, issues: string[], report: SireReport | undefined, today: string): SireStatus {
  if (report) return 'REPORTADO';
  if (!happened) return 'PROGRAMADO';
  if (date < today) return 'VENCIDO';
  return issues.length ? 'INCOMPLETO' : 'PENDIENTE';
}

/** Debe reportarse ya (pendiente, incompleto o vencido). */
export const isDue = (m: SireMovement): boolean => m.status === 'PENDIENTE' || m.status === 'INCOMPLETO' || m.status === 'VENCIDO';

export function sireStatusLabel(s: SireStatus): string {
  return { PROGRAMADO: 'Programado', INCOMPLETO: 'Faltan datos', PENDIENTE: 'Por reportar hoy', VENCIDO: 'Vencido', REPORTADO: 'Reportado' }[s];
}

export function sireStatusBadge(s: SireStatus): string {
  return { PROGRAMADO: 'rsv-badge--muted', INCOMPLETO: 'rsv-badge--warn', PENDIENTE: 'rsv-badge--info', VENCIDO: 'rsv-badge--danger', REPORTADO: 'rsv-badge--ok' }[s];
}

/** Nombre del país como aparece en las listas del SIRE (mayúsculas). */
export const sireCountry = (id: string): string => (country(id)?.name ?? '').toUpperCase();

/** Campos en el orden del formulario de Alojamiento y Hospedaje, listos para copiar. */
export function sireFormFields(rec: TraRecord, g: TraGuest, m: Pick<SireMovement, 'type' | 'date'>, docLabel: string): { label: string; value: string }[] {
  const d = sireDataOf(rec, g);
  return [
    { label: 'Tipo de movimiento',     value: m.type === 'ENTRADA' ? 'Entrada' : 'Salida' },
    { label: 'Fecha de movimiento',    value: dmy(m.date) },
    { label: 'Tipo de documento',      value: docLabel.toUpperCase() },
    { label: 'Número de documento',    value: (g.docNumber ?? '').trim() },
    { label: 'Fecha de nacimiento',    value: dmy(d.birthDate) },
    { label: 'Primer apellido',        value: d.firstLastName.trim().toUpperCase() },
    { label: 'Segundo apellido',       value: d.secondLastName.trim().toUpperCase() },
    { label: 'Nombres',                value: (g.firstNames ?? '').trim().toUpperCase() },
    { label: 'Nacionalidad',           value: sireCountry(d.nationality) },
    { label: 'País de procedencia',    value: sireCountry(d.originCountry) },
    { label: 'País próximo destino',   value: sireCountry(d.nextDestination) },
  ];
}

/** YYYY-MM-DD → D/M/YYYY, como lo muestra el calendario del SIRE. */
export function dmy(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${y}`;
}
