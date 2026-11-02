import {
  DocumentType, TravelReason, Country, City, AccommodationType, LodgingUnit, Relationship, UnitType
} from './tra.model';
import { ROOMS, FLOORS, roomsOnFloor, summaryOf } from '../lodging/house';
import { SearchOption } from '../shared/search-select/search-select.component';
import { WORLD_COUNTRIES, FREQUENT_COUNTRY_IDS } from '../shared/countries';
import { CO_DEPARTMENTS } from '../shared/colombia';
import { DANE_CODES } from '../shared/divipola';

// Catálogos de la TRA. Ningún campo codificado es texto libre: el frontend
// muestra la descripción y el backend guarda y envía el código.
// PENDIENTE: validar todos los códigos contra el manual técnico PMS vigente
// de MinCIT antes de producción.

export const DOCUMENT_TYPES: DocumentType[] = [
  { code: 'CC',  label: 'Cédula de ciudadanía' },
  { code: 'CE',  label: 'Cédula de extranjería' },
  { code: 'PA',  label: 'Pasaporte' },
  { code: 'PEP', label: 'Permiso especial de permanencia' },
  { code: 'PPT', label: 'Permiso por protección temporal' },
  { code: 'TI',  label: 'Tarjeta de identidad' },
  { code: 'DNI', label: 'Documento nacional de identidad' },
  { code: 'PC',  label: 'PC (descripción por confirmar con el manual)' },
];

export const TRAVEL_REASONS: TravelReason[] = [
  { id: 1, label: 'Ocio, recreación y vacaciones' },
  { id: 2, label: 'Negocios y actividades profesionales' },
  { id: 3, label: 'Trabajo / empleo contratado localmente' },
  { id: 4, label: 'Tratamiento de salud y médicos' },
  { id: 5, label: 'Educación / información académica' },
  { id: 6, label: 'Asistencia a eventos, ferias o congresos' },
  { id: 7, label: 'Tránsito / escala hacia otro destino' },
  { id: 8, label: 'Visita a familiares y amigos' },
];

// Países: la lista mundial compartida (shared/countries.ts), con su código ISO numérico.
export const COUNTRIES: Country[] = WORLD_COUNTRIES;

// Municipios de Colombia: los 1.122 de la DIVIPOLA con su código DANE (shared/colombia.ts +
// shared/divipola.ts). Las ciudades del exterior no tienen código DANE: se escriben, y estas
// son solo sugerencias del buscador.
const CO_CITIES: City[] = CO_DEPARTMENTS.flatMap(d => d.towns.map(town => {
  const code = DANE_CODES[`${town}|${d.name}`];
  return { id: code, daneCode: code, name: town, department: d.name, countryId: 'CO' };
}));

export const CITIES: City[] = [
  ...CO_CITIES,
  { id: 'US-MIA', name: 'Miami',            department: 'Florida',        countryId: 'US' },
  { id: 'US-NYC', name: 'Nueva York',       department: 'Nueva York',     countryId: 'US' },
  { id: 'ES-MAD', name: 'Madrid',           department: 'Madrid',         countryId: 'ES' },
  { id: 'MX-CMX', name: 'Ciudad de México', department: 'CDMX',           countryId: 'MX' },
  { id: 'EC-UIO', name: 'Quito',            department: 'Pichincha',      countryId: 'EC' },
  { id: 'PE-LIM', name: 'Lima',             department: 'Lima',           countryId: 'PE' },
  { id: 'AR-BUE', name: 'Buenos Aires',     department: 'Buenos Aires',   countryId: 'AR' },
  { id: 'CA-TOR', name: 'Toronto',          department: 'Ontario',        countryId: 'CA' },
];

/** Nombres cortos con que la gente escribe su ciudad: «cali» encuentra Santiago de Cali. */
const CITY_ALIASES: Record<string, string> = {
  '76001': 'Cali', '13001': 'Cartagena', '54001': 'Cúcuta', '11001': 'Bogotá', '13468': 'Mompox Mompós',
  '52835': 'Tumaco', '76111': 'Buga', '05042': 'Santa Fe de Antioquia', '25843': 'Ubaté',
};

// Numeral 3.1: el catálogo oficial está pendiente de cargar. Estos valores son
// provisionales para poder operar; se reemplazan al sincronizar con MinCIT.
export const ACCOMMODATION_TYPES: AccommodationType[] = [
  { code: 'HABITACION',    label: 'Habitación (provisional)' },
  { code: 'PISO',          label: 'Piso / apartamento (provisional)' },
  { code: 'CASA_COMPLETA', label: 'Vivienda completa (provisional)' },
];
export const ACCOMMODATION_CATALOG_PROVISIONAL = true;

export const RELATIONSHIPS: Relationship[] = [
  'Cónyuge', 'Hijo/a', 'Padre/Madre', 'Hermano/a', 'Otro familiar', 'Amigo/a', 'Compañero de trabajo', 'Sin parentesco',
];

// Documentos de personas extranjeras: el huésped también debe reportarse al SIRE.
export const FOREIGN_DOCUMENTS = ['CE', 'PA', 'PEP', 'PPT', 'DNI'];

// Unidades de alojamiento: las habitaciones de la casa (lodging/house.ts)
// agrupadas como se alquilan: habitación, piso completo o casa completa.
const unit = (id: string, name: string, type: UnitType, rooms: string[]): LodgingUnit => ({
  id, name, type, rooms, active: true,
  floors: [...new Set(ROOMS.filter(r => rooms.includes(r.number)).map(r => r.floor))],
  capacity: summaryOf(rooms).capacity,
});

export const DEFAULT_UNITS: LodgingUnit[] = [
  unit('casa', 'Casa completa', 'CASA_COMPLETA', ROOMS.map(r => r.number)),
  ...FLOORS.map(f => unit(`piso-${f}`, `Piso ${f}`, 'PISO', roomsOnFloor(f))),
  ...ROOMS.map(r => unit(`hab-${r.number}`, `Hab. ${r.number}`, 'HABITACION', [r.number])),
];

export const UNIT_TYPES: UnitType[] = ['HABITACION', 'PISO', 'CASA_COMPLETA'];

// ── Búsquedas ──
export const docTypeLabel  = (code: string) => DOCUMENT_TYPES.find(d => d.code === code)?.label ?? '';
export const reasonLabel   = (id: number | null) => TRAVEL_REASONS.find(r => r.id === id)?.label ?? '';
export const country       = (id: string) => COUNTRIES.find(c => c.id === id);
export const city          = (id: string) => CITIES.find(c => c.id === id);
export const citiesOf      = (countryId: string) => CITIES.filter(c => c.countryId === countryId);
/** Colombia elige la ciudad del catálogo DANE; en el exterior se escribe (no hay código DANE). */
export const usesCityCatalog = (countryId: string) => countryId === 'CO';
/** Nombre de la ciudad: la del catálogo, o el texto escrito para una ciudad del exterior. */
export const cityLabel     = (value: string) => city(value)?.name ?? value;

// ── Opciones para los buscadores (app-search-select) ──
/** País con su código ISO de pista; también se encuentra por el código numérico ("152" → Chile). */
export const COUNTRY_OPTIONS: SearchOption[] = COUNTRIES.map(c => ({ value: c.id, label: c.name, hint: c.id, keywords: c.isoNumeric }));
/** Los que más llegan: salen primero con el campo vacío. */
export const FREQUENT_COUNTRIES = FREQUENT_COUNTRY_IDS;

const cityOptionsCache = new Map<string, SearchOption[]>();
/** Ciudades del catálogo de un país, con el departamento de pista. */
export function cityOptions(countryId: string): SearchOption[] {
  if (!cityOptionsCache.has(countryId)) {
    cityOptionsCache.set(countryId, citiesOf(countryId).map(c => ({ value: c.id, label: c.name, hint: c.department, keywords: `${c.daneCode ?? ''} ${CITY_ALIASES[c.id] ?? ''} ${c.department}` })));
  }
  return cityOptionsCache.get(countryId)!;
}
export const accommodationLabel = (code: string) => ACCOMMODATION_TYPES.find(a => a.code === code)?.label ?? '';
