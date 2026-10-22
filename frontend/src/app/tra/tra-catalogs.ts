import {
  DocumentType, TravelReason, Country, City, AccommodationType, LodgingUnit, Relationship, UnitType
} from './tra.model';
import { ROOMS, FLOORS, roomsOnFloor, summaryOf } from '../lodging/house';

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

// Código ISO 3166-1 numérico
export const COUNTRIES: Country[] = [
  { id: 'CO', name: 'Colombia',       isoNumeric: '170' },
  { id: 'AR', name: 'Argentina',      isoNumeric: '032' },
  { id: 'CA', name: 'Canadá',         isoNumeric: '124' },
  { id: 'CL', name: 'Chile',          isoNumeric: '152' },
  { id: 'EC', name: 'Ecuador',        isoNumeric: '218' },
  { id: 'ES', name: 'España',         isoNumeric: '724' },
  { id: 'US', name: 'Estados Unidos', isoNumeric: '840' },
  { id: 'FR', name: 'Francia',        isoNumeric: '250' },
  { id: 'MX', name: 'México',         isoNumeric: '484' },
  { id: 'PA', name: 'Panamá',         isoNumeric: '591' },
  { id: 'PE', name: 'Perú',           isoNumeric: '604' },
];

// Ciudades de Colombia con código DANE (Divipola). Las del exterior no tienen
// código DANE: el código que exige la integración queda pendiente del manual.
export const CITIES: City[] = [
  { id: '11001', daneCode: '11001', name: 'Bogotá',        department: 'Bogotá D.C.',     countryId: 'CO' },
  { id: '05001', daneCode: '05001', name: 'Medellín',      department: 'Antioquia',       countryId: 'CO' },
  { id: '76001', daneCode: '76001', name: 'Cali',          department: 'Valle del Cauca', countryId: 'CO' },
  { id: '08001', daneCode: '08001', name: 'Barranquilla',  department: 'Atlántico',       countryId: 'CO' },
  { id: '13001', daneCode: '13001', name: 'Cartagena',     department: 'Bolívar',         countryId: 'CO' },
  { id: '68001', daneCode: '68001', name: 'Bucaramanga',   department: 'Santander',       countryId: 'CO' },
  { id: '66001', daneCode: '66001', name: 'Pereira',       department: 'Risaralda',       countryId: 'CO' },
  { id: '66170', daneCode: '66170', name: 'Dosquebradas',  department: 'Risaralda',       countryId: 'CO' },
  { id: '63001', daneCode: '63001', name: 'Armenia',       department: 'Quindío',         countryId: 'CO' },
  { id: '63130', daneCode: '63130', name: 'Calarcá',       department: 'Quindío',         countryId: 'CO' },
  { id: '63272', daneCode: '63272', name: 'Filandia',      department: 'Quindío',         countryId: 'CO' },
  { id: '63690', daneCode: '63690', name: 'Salento',       department: 'Quindío',         countryId: 'CO' },
  { id: '17001', daneCode: '17001', name: 'Manizales',     department: 'Caldas',          countryId: 'CO' },
  { id: '73001', daneCode: '73001', name: 'Ibagué',        department: 'Tolima',          countryId: 'CO' },
  { id: '41001', daneCode: '41001', name: 'Neiva',         department: 'Huila',           countryId: 'CO' },
  { id: '52001', daneCode: '52001', name: 'Pasto',         department: 'Nariño',          countryId: 'CO' },
  { id: '47001', daneCode: '47001', name: 'Santa Marta',   department: 'Magdalena',       countryId: 'CO' },
  { id: '54001', daneCode: '54001', name: 'Cúcuta',        department: 'Norte de Santander', countryId: 'CO' },
  { id: 'US-MIA', name: 'Miami',            department: 'Florida',        countryId: 'US' },
  { id: 'US-NYC', name: 'Nueva York',       department: 'Nueva York',     countryId: 'US' },
  { id: 'ES-MAD', name: 'Madrid',           department: 'Madrid',         countryId: 'ES' },
  { id: 'MX-CMX', name: 'Ciudad de México', department: 'CDMX',           countryId: 'MX' },
  { id: 'EC-UIO', name: 'Quito',            department: 'Pichincha',      countryId: 'EC' },
  { id: 'PE-LIM', name: 'Lima',             department: 'Lima',           countryId: 'PE' },
  { id: 'AR-BUE', name: 'Buenos Aires',     department: 'Buenos Aires',   countryId: 'AR' },
  { id: 'CA-TOR', name: 'Toronto',          department: 'Ontario',        countryId: 'CA' },
];

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
export const accommodationLabel = (code: string) => ACCOMMODATION_TYPES.find(a => a.code === code)?.label ?? '';
