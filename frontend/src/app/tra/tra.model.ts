// Módulo TRA — Tarjeta de Registro de Alojamiento (Res. 409 de 2022).
// La TRA cuelga de la reserva: un registro por reserva, con sus unidades de
// alojamiento (nivel B), sus huéspedes (nivel C) y un envío por huésped.

// ── Catálogos ──────────────────────────────────────────
export interface DocumentType { code: string; label: string; }
export interface TravelReason { id: number; label: string; }
export interface Country      { id: string; name: string; isoNumeric: string; }
export interface City         { id: string; name: string; department: string; countryId: string; daneCode?: string; }
export interface AccommodationType { code: string; label: string; }

export type UnitType = 'HABITACION' | 'PISO' | 'CASA_COMPLETA';

export interface LodgingUnit {
  id:       string;
  name:     string;            // "Piso 2", "Hab. 201", "Casa completa"
  type:     UnitType;
  floors:   number[];
  capacity: number;
  rooms:    string[];          // habitaciones que incluye
  active:   boolean;
}

// ── Estados ────────────────────────────────────────────
// PENDIENTE_VALIDACION del diagrama no se persiste: la validación es inmediata
// y deja la TRA en REQUIERE_CORRECCION o LISTA_PARA_ENVIO.
export type TraStatus = 'BORRADOR' | 'REQUIERE_CORRECCION' | 'LISTA_PARA_ENVIO' | 'ENVIANDO' | 'REPORTADA' | 'ERROR';
/** Estado que muestran las pantallas: incluye las reservas sin TRA (pasadías). */
export type TraViewStatus = TraStatus | 'NO_APLICA';
export type SendStatus = 'PENDIENTE' | 'ENVIANDO' | 'EXITOSO' | 'ERROR' | 'REINTENTO';
export type Endpoint   = 'ONE' | 'TWO';

// ── Huéspedes ──────────────────────────────────────────
export type GuestRole = 'PRINCIPAL' | 'ACOMPANANTE';

export type Relationship = 'Cónyuge' | 'Hijo/a' | 'Padre/Madre' | 'Hermano/a' | 'Otro familiar'
  | 'Amigo/a' | 'Compañero de trabajo' | 'Sin parentesco';

/** Numerales 4.4 a 4.7: se replican del principal salvo que el acompañante tenga los suyos. */
export interface TravelData {
  residenceCountry: string;    // Country.id
  residenceCity:    string;    // City.id
  originCountry:    string;
  originCity:       string;
  reasonId:         number | null;
  checkIn:          string;    // YYYY-MM-DD
  checkOut:         string;
}

/** Verificación de menores: flujo operativo aparte, no es campo TRA. */
export interface MinorCheck {
  verified:     boolean;
  travelsWith:  string;        // "Natalia Gómez (madre, huésped principal)"
  support:      string;        // "Registro civil"
  verifiedBy?:  string;
  verifiedAt?:  string;        // YYYY-MM-DDTHH:mm
}

export interface TraGuest {
  id:          string;
  role:        GuestRole;
  unitId:      string;
  // TRA 4.1 – 4.3
  docType:     string;         // DocumentType.code
  docNumber:   string;
  firstNames:  string;
  lastNames:   string;
  // TRA 4.4 – 4.7
  ownTravel:   boolean;        // el principal siempre true; acompañante false = hereda
  travel:      TravelData;
  // Datos operativos del PMS: no se envían a la TRA
  relationship?: Relationship;
  phone:       string;
  email:       string;
  birthDate:   string;
  minorCheck?: MinorCheck;
}

// ── Unidad de alojamiento (numerales 3.1 a 3.3) ────────
export interface TraUnit {
  unitId:            string;
  accommodationType: string;   // AccommodationType.code
  totalValue:        number;   // total de la estancia en esa unidad, no por noche
}

// ── Envíos y auditoría ─────────────────────────────────
export interface TraSend {
  guestId:     string;
  endpoint:    Endpoint;
  status:      SendStatus;
  attempts:    number;
  attemptAt?:  string;         // YYYY-MM-DDTHH:mm:ss
  httpStatus?: number;
  requestId?:  string;
  mincitId?:   string;         // ID que devuelve /one/
  message?:    string;
  durationMs?: number;
}

export type EventTone = 'ok' | 'info' | 'danger' | 'muted';

export interface TraEvent {
  at:     string;              // YYYY-MM-DDTHH:mm:ss
  title:  string;
  detail: string;
  tone:   EventTone;
}

export interface TraRecord {
  reservationId: string;
  status:        TraStatus;
  units:         TraUnit[];
  guests:        TraGuest[];   // guests[0] es siempre el principal
  sends:         TraSend[];
  history:       TraEvent[];   // más reciente primero
  checkInAt?:    string;
  sentBy?:       string;
  updatedAt:     string;
}

// ── Configuración ──────────────────────────────────────
export interface TraSettings {
  rnt:              string;
  rntEmail:         string;
  tokenLast4:       string;    // el token vive como secreto del servidor (TRA_TOKEN)
  integrationActive: boolean;
  lastSync:         string;
  // Establecimiento (nivel A)
  provider:         string;
  providerType:     string;
  ciiu:             string;
  department:       string;
  municipality:     string;
  address:          string;
  phone:            string;
  email:            string;
  website:          string;
  capacity:         number;
  // Envío y reintentos
  autoRetry:        boolean;
  maxAttempts:      number;
  retryMinutes:     number;
  notifyErrors:     boolean;
}
