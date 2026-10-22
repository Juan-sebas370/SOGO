import { Reservation, totalGuests } from '../reservations/reservation.model';
import { fmtMoney } from '../reservations/reservation-format';
import {
  TraRecord, TraGuest, TravelData, TraViewStatus, SendStatus, TraSettings, LodgingUnit
} from './tra.model';
import {
  DOCUMENT_TYPES, TRAVEL_REASONS, ACCOMMODATION_TYPES, FOREIGN_DOCUMENTS, COUNTRIES, CITIES, city, country
} from './tra-catalogs';

// Reglas de negocio de la TRA como funciones puras: las usan el servicio,
// el registro, el resumen y el panel, así que una regla vive en un solo lugar.

// ── Huéspedes ──────────────────────────────────────────
export const principalOf  = (rec: TraRecord): TraGuest => rec.guests[0];
export const companionsOf = (rec: TraRecord): TraGuest[] => rec.guests.slice(1);
export const fullName     = (g: TraGuest): string => `${g.firstNames} ${g.lastNames}`.trim();

/** RN-03: residencia, procedencia, motivo y fechas se heredan del principal salvo que el acompañante tenga los suyos. */
export function travelOf(rec: TraRecord, g: TraGuest): TravelData {
  return g.role === 'PRINCIPAL' || g.ownTravel ? g.travel : principalOf(rec).travel;
}

export const inherits = (g: TraGuest): boolean => g.role === 'ACOMPANANTE' && !g.ownTravel;

/** "Principal" o "Acompañante 3" */
export function roleLabel(rec: TraRecord, g: TraGuest, short = false): string {
  if (g.role === 'PRINCIPAL') return 'Principal';
  return `${short ? 'Acomp.' : 'Acompañante'} ${rec.guests.indexOf(g)}`;
}

export function ageOn(birthDate: string, onDate: string): number | undefined {
  if (!birthDate) return undefined;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Menor de edad: tarjeta de identidad o fecha de nacimiento del PMS. */
export function isMinor(rec: TraRecord, g: TraGuest): boolean {
  const age = ageOn(g.birthDate, principalOf(rec).travel.checkIn);
  return g.docType === 'TI' || (age !== undefined && age < 18);
}

/** Extranjero: además de la TRA, se reporta al SIRE (módulo aparte). */
export const needsSire = (g: TraGuest): boolean => FOREIGN_DOCUMENTS.includes(g.docType);

// ── Completitud por huésped ────────────────────────────
function who(rec: TraRecord, g: TraGuest): string {
  return g.role === 'PRINCIPAL' ? 'del huésped principal' : `del acompañante ${rec.guests.indexOf(g)}`;
}

/** Mensajes concretos de lo que falta, p. ej. "Falta número de documento del acompañante 3". */
export function guestIssues(rec: TraRecord, g: TraGuest): string[] {
  const of = who(rec, g);
  const out: string[] = [];
  if (!g.docType)            out.push(`Falta tipo de documento ${of}`);
  if (!g.docNumber.trim())   out.push(`Falta número de documento ${of}`);
  if (!g.firstNames.trim())  out.push(`Faltan nombres ${of}`);
  if (!g.lastNames.trim())   out.push(`Faltan apellidos ${of}`);
  if (inherits(g)) return out;

  const t = g.travel;
  if (!t.residenceCountry || !t.residenceCity) out.push(`Falta país o ciudad de residencia ${of}`);
  if (!t.originCountry || !t.originCity)       out.push(`Falta país o ciudad de procedencia ${of}`);
  if (!t.reasonId)                             out.push(`Motivo de viaje no seleccionado ${of}`);
  if (!t.checkIn || !t.checkOut)               out.push(`Faltan fechas de entrada y salida ${of}`);
  return out;
}

export const isComplete = (rec: TraRecord, g: TraGuest): boolean => guestIssues(rec, g).length === 0;

/** Campos TRA 4.1–4.7 del principal: 10 datos (tipo, número, nombres, apellidos, 2 residencia, 2 procedencia, motivo, fechas). */
export function principalFieldsDone(rec: TraRecord): number {
  const g = principalOf(rec);
  const t = g.travel;
  return [g.docType, g.docNumber.trim(), g.firstNames.trim(), g.lastNames.trim(), t.residenceCountry, t.residenceCity,
    t.originCountry, t.originCity, t.reasonId, t.checkIn && t.checkOut].filter(Boolean).length;
}

// ── Progreso del registro ──────────────────────────────
export interface Progress { done: number; expected: number; pct: number; }

/** Huéspedes completos frente a los que declara la reserva (RN-01: se registra a cada huésped). */
export function progressOf(rec: TraRecord, r: Reservation): Progress {
  const expected = Math.max(totalGuests(r), rec.guests.length);
  const done = rec.guests.filter(g => isComplete(rec, g)).length;
  return { done, expected, pct: expected ? Math.round((done / expected) * 100) : 0 };
}

export function nightsBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00`), b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Unidades con más huéspedes asignados que su capacidad (personas según camas dobles y camarotes). */
export function overCapacityUnits(rec: TraRecord, units: LodgingUnit[]): { unit: LodgingUnit; guests: number }[] {
  return rec.units.flatMap(u => {
    const unit = units.find(x => x.id === u.unitId);
    const guests = rec.guests.filter(g => g.unitId === u.unitId).length;
    return unit && guests > unit.capacity ? [{ unit, guests }] : [];
  });
}

export const totalValue = (rec: TraRecord): number => rec.units.reduce((s, u) => s + (+u.totalValue || 0), 0);

// ── Validación previa al envío (sección 6, en orden) ───
export interface Check { label: string; ok: boolean; detail: string; }
export interface Issue { guestId?: string; message: string; }
export interface Validation { checks: Check[]; issues: Issue[]; passed: number; ok: boolean; }

export function validate(rec: TraRecord, r: Reservation, settings: TraSettings, units: LodgingUnit[]): Validation {
  const issues: Issue[] = [];
  const principal = principalOf(rec);
  const companions = companionsOf(rec);
  const unitOf = (id: string) => units.find(u => u.id === id);

  // 1–2. Integración
  const rnt = !!settings.rnt.trim();
  const token = !!settings.tokenLast4 && settings.integrationActive;
  if (!rnt) issues.push({ message: 'El RNT no está configurado (Configuración TRA)' });
  if (!token) issues.push({ message: 'El token PMS no está configurado o la integración está inactiva' });

  // 3. Principal
  const principalIssues = guestIssues(rec, principal);
  principalIssues.forEach(message => issues.push({ guestId: principal.id, message }));

  // 4. Acompañantes: completos y todos registrados
  const missing = Math.max(0, totalGuests(r) - rec.guests.length);
  const incomplete = companions.filter(g => !isComplete(rec, g));
  incomplete.forEach(g => guestIssues(rec, g).forEach(message => issues.push({ guestId: g.id, message })));
  if (missing) issues.push({ message: `Falta${missing === 1 ? '' : 'n'} ${missing} acompañante${missing === 1 ? '' : 's'} por registrar (la reserva declara ${totalGuests(r)} huéspedes)` });
  const expectedCompanions = companions.length + missing;
  const companionsOk = !incomplete.length && !missing;

  // 5. Unidad: definida, con tipo de acomodación y con huéspedes que caben en su capacidad
  const defined = rec.units.length > 0
    && rec.units.every(u => unitOf(u.unitId) && u.accommodationType)
    && rec.guests.every(g => rec.units.some(u => u.unitId === g.unitId));
  if (!defined) issues.push({ message: 'Falta definir la unidad de alojamiento, su tipo de acomodación o la unidad de algún huésped' });
  const overCapacity = overCapacityUnits(rec, units);
  overCapacity.forEach(o => issues.push({ message: `${o.unit.name} tiene capacidad para ${o.unit.capacity} personas y hay ${o.guests} huéspedes asignados` }));
  const unitsOk = defined && !overCapacity.length;

  // 6. Fechas
  const datesOk = rec.guests.every(g => { const t = travelOf(rec, g); return !!t.checkIn && t.checkOut > t.checkIn; });
  if (!datesOk) issues.push({ message: 'La fecha de salida debe ser posterior a la de entrada' });

  // 7. Valor total
  const valueOk = rec.units.every(u => +u.totalValue > 0);
  if (!valueOk) issues.push({ message: 'El valor total del alojamiento debe ser mayor a cero' });

  // 8. Catálogos: códigos válidos y ciudad que pertenece al país
  const place = (countryId: string, cityId: string) => !countryId || !cityId || (!!country(countryId) && city(cityId)?.countryId === countryId);
  const codesOk = rec.guests.every(g => {
    const t = travelOf(rec, g);
    return (!g.docType || DOCUMENT_TYPES.some(d => d.code === g.docType))
      && place(t.residenceCountry, t.residenceCity) && place(t.originCountry, t.originCity)
      && (!t.reasonId || TRAVEL_REASONS.some(m => m.id === t.reasonId));
  }) && rec.units.every(u => !u.accommodationType || ACCOMMODATION_TYPES.some(a => a.code === u.accommodationType));
  if (!codesOk) issues.push({ message: 'Hay códigos de catálogo inválidos (documento, país, ciudad, motivo o acomodación)' });

  const nights = nightsBetween(principal.travel.checkIn, principal.travel.checkOut);
  const rooms = rec.units.flatMap(u => unitOf(u.unitId)?.rooms ?? []);
  const firstIncomplete = incomplete[0];

  const checks: Check[] = [
    { label: 'RNT configurado', ok: rnt, detail: rnt ? `${settings.provider} · RNT ${settings.rnt}` : 'Configúralo en Configuración TRA' },
    { label: 'Token PMS configurado', ok: token, detail: token ? `Última prueba de conexión: ${settings.lastSync.replace('T', ' ').slice(0, 16)}` : 'Sin token activo' },
    { label: 'Huésped principal completo', ok: !principalIssues.length, detail: `${fullName(principal) || 'Sin nombre'} · ${principalFieldsDone(rec)} de 10 campos` },
    { label: 'Acompañantes completos', ok: companionsOk,
      detail: expectedCompanions === 0 ? 'La reserva no tiene acompañantes'
        : `${companions.length - incomplete.length} de ${expectedCompanions}` +
          (firstIncomplete ? ` · ${guestIssues(rec, firstIncomplete)[0].replace(/ del acompañante \d+$/, '').toLowerCase()} de ${fullName(firstIncomplete) || roleLabel(rec, firstIncomplete)}`
            : missing ? ` · falta${missing === 1 ? '' : 'n'} ${missing} por registrar` : '') },
    { label: 'Unidad definida', ok: unitsOk,
      detail: unitsOk ? `${rec.units.map(u => unitOf(u.unitId)!.name).join(' + ')} · habitaciones ${rooms.join(', ')} · capacidad ${rec.units.reduce((s, u) => s + unitOf(u.unitId)!.capacity, 0)}`
        : overCapacity.length ? `${overCapacity[0].unit.name}: ${overCapacity[0].guests} huéspedes para ${overCapacity[0].unit.capacity} plazas` : 'Revisa la unidad de alojamiento' },
    { label: 'Fechas válidas', ok: datesOk, detail: datesOk ? `Salida posterior a la entrada · ${nights} noche${nights === 1 ? '' : 's'}` : 'La salida no es posterior a la entrada' },
    { label: 'Valor de alojamiento válido', ok: valueOk, detail: valueOk ? `${fmtMoney(totalValue(rec))} (total de la estancia)` : 'Debe ser mayor a cero' },
    { label: 'Códigos de catálogo válidos', ok: codesOk, detail: codesOk ? 'Documento, país, ciudad, motivo y acomodación' : 'Revisa los catálogos' },
  ];
  const passed = checks.filter(c => c.ok).length;
  return { checks, issues, passed, ok: passed === checks.length };
}

// ── Borrador a partir de la reserva ────────────────────
/** Una pasadía no pernocta: no genera TRA. */
export const requiresTra = (r: Reservation): boolean => r.reservationType !== 'Evento / Pasadía';

/** Unidades que ocupa la reserva: la casa, un piso o cada habitación suelta. */
export function unitIdsFor(r: Reservation): string[] {
  if (r.lodgingType === 'Casa completa') return ['casa'];
  if (r.lodgingType === 'Piso') return [`piso-${r.floor}`];
  return r.rooms.map(n => `hab-${n}`);
}

const DOC_FROM_RESERVATION: Record<string, string> = {
  'Cédula de Ciudadanía': 'CC', 'Cédula de Extranjería': 'CE', 'Pasaporte': 'PA', 'Tarjeta de Identidad': 'TI',
};

/** "Juan Sebastián Pinilla" → ["Juan Sebastián", "Pinilla"]; con 4 palabras, 2 nombres y 2 apellidos. */
export function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  const n = words.length <= 2 ? 1 : words.length === 3 ? 2 : Math.ceil(words.length / 2);
  return [words.slice(0, n).join(' '), words.slice(n).join(' ')];
}

/** "Colombia - Neiva, Huila" → { country: 'CO', city: '41001' } si están en el catálogo. */
function placeFrom(text: string): { country: string; city: string } {
  const [countryName = '', rest = ''] = text.split(' - ');
  const cityName = rest.split(',')[0].trim();
  const c = COUNTRIES.find(x => x.name === countryName.trim());
  return { country: c?.id ?? '', city: CITIES.find(x => x.name === cityName && x.countryId === c?.id)?.id ?? '' };
}

/** TRA en borrador con el huésped principal y la unidad tomados de la reserva. */
export function draftFor(r: Reservation, units: LodgingUnit[], now: string): TraRecord {
  const ids = unitIdsFor(r);
  const share = Math.floor(r.lodgingAmount / ids.length);
  const [firstNames, lastNames] = splitName(r.guestName);
  const home = placeFrom(r.city);
  return {
    reservationId: r.id,
    status: 'BORRADOR',
    units: ids.map((unitId, i) => ({
      unitId,
      accommodationType: units.find(u => u.id === unitId)?.type ?? '',
      totalValue: i === ids.length - 1 ? r.lodgingAmount - share * (ids.length - 1) : share,
    })),
    guests: [{
      id: `${r.id}-g1`, role: 'PRINCIPAL', unitId: ids[0],
      docType: DOC_FROM_RESERVATION[r.docType] ?? '', docNumber: r.docNumber, firstNames, lastNames,
      ownTravel: true,
      travel: { residenceCountry: home.country, residenceCity: home.city, originCountry: '', originCity: '', reasonId: null, checkIn: r.checkIn, checkOut: r.checkOut },
      phone: r.phone, email: r.email, birthDate: '',
    }],
    sends: [],
    history: [],
    updatedAt: now,
  };
}

/** Acompañante vacío: hereda el viaje del principal (casilla marcada por defecto). */
export function newCompanion(rec: TraRecord, id: string): TraGuest {
  const p = principalOf(rec);
  return {
    id, role: 'ACOMPANANTE', unitId: p.unitId, docType: '', docNumber: '', firstNames: '', lastNames: '',
    ownTravel: false, travel: { ...p.travel }, phone: '', email: '', birthDate: '',
  };
}

// ── Formato ────────────────────────────────────────────
const STATUS: Record<TraViewStatus, { label: string; badge: string }> = {
  BORRADOR:            { label: 'Borrador',            badge: 'rsv-badge--muted' },
  REQUIERE_CORRECCION: { label: 'Requiere corrección', badge: 'rsv-badge--warn' },
  LISTA_PARA_ENVIO:    { label: 'Lista para envío',    badge: 'rsv-badge--info' },
  ENVIANDO:            { label: 'Enviando',            badge: 'rsv-badge--info' },
  REPORTADA:           { label: 'Reportada',           badge: 'rsv-badge--ok' },
  ERROR:               { label: 'Error',               badge: 'rsv-badge--danger' },
  NO_APLICA:           { label: 'No aplica',           badge: 'rsv-badge--muted' },
};
export const statusLabel = (s: TraViewStatus) => STATUS[s].label;
export const statusBadge = (s: TraViewStatus) => STATUS[s].badge;
export const TRA_VIEW_STATUSES = Object.keys(STATUS) as TraViewStatus[];

const SEND: Record<SendStatus, string> = {
  PENDIENTE: 'rsv-badge--muted', ENVIANDO: 'rsv-badge--info', EXITOSO: 'rsv-badge--ok', ERROR: 'rsv-badge--danger', REINTENTO: 'rsv-badge--warn',
};
export const sendBadge = (s: SendStatus) => SEND[s];

/** 1094556782 → 1.094.556.782 (los pasaportes alfanuméricos quedan igual) */
export const fmtDoc = (n: string): string => /^\d+$/.test(n) ? Number(n).toLocaleString('es-CO') : n;

/** YYYY-MM-DDTHH:mm[:ss] → "22/09 15:12" */
export function fmtStamp(iso?: string, withSeconds = false): string {
  if (!iso) return '';
  const [date, time = ''] = iso.split('T');
  const [, m, d] = date.split('-');
  return `${d}/${m} ${time.slice(0, withSeconds ? 8 : 5)}`.trim();
}
