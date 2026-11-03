import { TraRecord, TraGuest, SireMovementType } from './tra.model';
import { sireDataOf } from './sire-rules';

// Archivo plano del SIRE · Alojamiento y Hospedaje (Instructivo MVI.50 de Migración Colombia,
// 2024, numeral 4.7.1): texto delimitado por tabuladores, un extranjero por línea y 13 columnas
// en este orden exacto. Los valores codificados (ciudad, documento, nacionalidad, movimiento,
// países y formato de fecha) salen del «paquete de guía» que se descarga en el SIRE (códigos de
// ciudades, códigos de países y archivo de ejemplo): por eso llegan en `SireCodes` y nunca se
// inventan aquí.

export const SIRE_TXT_COLUMNS = [
  'Código del Hotel', 'Código de Ciudad', 'Tipo de Documento', 'Número de Identificación', 'Código de Nacionalidad',
  'Primer Apellido del Extranjero', 'Segundo Apellido del Extranjero', 'Nombres del Extranjero', 'Tipo Movimiento',
  'Fecha del Movimiento', 'Lugar de Procedencia', 'Lugar de Destino', 'Fecha de Nacimiento',
] as const;

/** Traducción a los códigos del paquete de guía del SIRE. Devuelven '' cuando no hay código. */
export interface SireCodes {
  hotel:     string;                              // Código SIRE del establecimiento
  city:      string;                              // Código de ciudad del establecimiento
  docType:   (traCode: string) => string;         // CC, CE, PA… → código SIRE
  country:   (countryId: string) => string;       // ISO alfa-2 → código de país SIRE
  movement:  (type: SireMovementType) => string;  // ENTRADA / SALIDA → código SIRE
  date:      (iso: string) => string;             // YYYY-MM-DD → formato del ejemplo
}

export interface SireLine { rec: TraRecord; guest: TraGuest; type: SireMovementType; date: string; }

/** Columnas de una línea, en el orden del SIRE. */
export function sireColumns(l: SireLine, codes: SireCodes): string[] {
  const d = sireDataOf(l.rec, l.guest);
  const text = (v: string) => clean(v).toUpperCase();
  return [
    codes.hotel, codes.city, codes.docType(l.guest.docType), clean(l.guest.docNumber), codes.country(d.nationality),
    text(d.firstLastName), text(d.secondLastName), text(l.guest.firstNames), codes.movement(l.type),
    codes.date(l.date), codes.country(d.originCountry), codes.country(d.nextDestination), codes.date(d.birthDate),
  ];
}

/** Qué columnas quedarían vacías por falta de código (el segundo apellido puede ir vacío). */
export function missingCodes(l: SireLine, codes: SireCodes): string[] {
  return sireColumns(l, codes)
    .map((v, i) => (v ? '' : SIRE_TXT_COLUMNS[i]))
    .filter(c => c && c !== 'Segundo Apellido del Extranjero');
}

/** Contenido del archivo: columnas separadas por TAB, una línea por movimiento. */
export function sireTxt(lines: SireLine[], codes: SireCodes): string {
  return lines.map(l => sireColumns(l, codes).join('\t')).join('\r\n') + (lines.length ? '\r\n' : '');
}

/** Un TAB o un salto de línea dentro de un dato correría las columnas: se cambian por espacios. */
const clean = (v?: string) => (v ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
