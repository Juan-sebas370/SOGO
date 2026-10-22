// =====================================================
// TARIFAS Y TEMPORADAS — la misma regla que usa la página web
// La web y SOGO leen las mismas tarifas (tabla `tarifas_reserva`) y el mismo
// calendario de temporadas (configuracion 'temporadas'). Si cambias esta
// regla, cambia también TarifaService.java y reserva.catalogo.ts de la web.
// =====================================================

export type Season = 'baja' | 'media' | 'alta';
export type RateType = 'individual' | 'familiar' | 'pasadia' | 'grupal';

/** Tarifa POR PERSONA de un tipo de reserva en cada temporada. */
export interface Rate { type: RateType; name: string; low: number; mid: number; high: number; }

/** Periodo que se repite cada año (MM-DD). Si «hasta» es menor que «desde», cruza el año (12-15 → 01-15). */
export interface YearlyRange { nombre: string; desde: string; hasta: string; }
/** Fechas de un año concreto con su temporada (ferias, eventos del pueblo...). */
export interface SpecialRange { nombre: string; desde: string; hasta: string; temporada: Season; }

export interface SeasonCalendar {
  alta:          YearlyRange[];
  media:         YearlyRange[];
  semanaSanta:   boolean;          // Sábado antes de Ramos al Domingo de Pascua = alta
  finesDeSemana: boolean;          // sábados y domingos = media
  festivosMedia: boolean;          // festivos = media
  festivos:      string[];         // YYYY-MM-DD
  especiales:    SpecialRange[];   // mandan sobre todo lo demás
}

export const SEASON_LABEL: Record<Season, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };
export const RATE_TYPES: { type: RateType; name: string; perDay: boolean; reservation: string }[] = [
  { type: 'individual', name: 'Hospedaje individual', perDay: false, reservation: 'Individual' },
  { type: 'familiar', name: 'Familia o grupo', perDay: false, reservation: 'Grupo familiar' },
  { type: 'pasadia', name: 'Pasadía', perDay: true, reservation: 'Evento / Pasadía' },
  { type: 'grupal', name: 'Grupo de trabajo', perDay: true, reservation: 'Grupo de trabajo' },
];
/** Niños de 4 a 10 años pagan este porcentaje; de 0 a 3 años no pagan. */
export const CHILD_FACTOR = 0.6;

/** Tipo de reserva de SOGO → tarifa. */
export function rateTypeOf(reservationType: string): RateType {
  return RATE_TYPES.find(t => t.reservation === reservationType)?.type ?? 'individual';
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const parseIso = (s: string) => new Date(`${s}T12:00:00`);

/** Domingo de Pascua (algoritmo de Meeus/Butcher), igual que la web. */
export function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}

/** Festivos de Colombia de un año (Ley 51 de 1983: los trasladables pasan al lunes siguiente). */
export function colombianHolidays(y: number): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  const add = (d: Date, name: string) => out.push({ date: iso(d), name });
  const monday = (d: Date) => { const w = d.getDay(); return w === 1 ? d : addDays(d, (8 - w) % 7); };
  const fixed = (m: number, day: number) => new Date(y, m - 1, day, 12);
  const e = easter(y);
  add(fixed(1, 1), 'Año Nuevo');
  add(monday(fixed(1, 6)), 'Reyes Magos');
  add(monday(fixed(3, 19)), 'San José');
  add(addDays(e, -3), 'Jueves Santo');
  add(addDays(e, -2), 'Viernes Santo');
  add(fixed(5, 1), 'Día del Trabajo');
  add(addDays(e, 43), 'Ascensión del Señor');
  add(addDays(e, 64), 'Corpus Christi');
  add(addDays(e, 71), 'Sagrado Corazón');
  add(monday(fixed(6, 29)), 'San Pedro y San Pablo');
  add(fixed(7, 20), 'Independencia de Colombia');
  add(fixed(8, 7), 'Batalla de Boyacá');
  add(monday(fixed(8, 15)), 'Asunción de la Virgen');
  add(monday(fixed(10, 12)), 'Día de la Raza');
  add(monday(fixed(11, 1)), 'Todos los Santos');
  add(monday(fixed(11, 11)), 'Independencia de Cartagena');
  add(fixed(12, 8), 'Inmaculada Concepción');
  add(fixed(12, 25), 'Navidad');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Calendario de fábrica: el mismo que tenía la web, con los festivos de Colombia de este año y el siguiente. */
export function defaultCalendar(): SeasonCalendar {
  const y = new Date().getFullYear();
  return {
    alta: [{ nombre: 'Fin y comienzo de año', desde: '12-15', hasta: '01-15' }, { nombre: 'Vacaciones de mitad de año', desde: '06-15', hasta: '07-15' }],
    media: [], semanaSanta: true, finesDeSemana: true, festivosMedia: true,
    festivos: [...colombianHolidays(y), ...colombianHolidays(y + 1)].map(h => h.date), especiales: [],
  };
}

function inYearly(md: string, r: YearlyRange): boolean {
  return r.desde <= r.hasta ? md >= r.desde && md <= r.hasta : md >= r.desde || md <= r.hasta;
}

/** Temporada de un día y por qué. */
export function seasonOf(date: string, c: SeasonCalendar): { season: Season; reason: string } {
  const special = c.especiales.find(s => date >= s.desde && date <= s.hasta);
  if (special) return { season: special.temporada, reason: special.nombre || 'Fecha especial' };
  const md = date.slice(5);
  const alta = c.alta.find(r => inYearly(md, r));
  if (alta) return { season: 'alta', reason: alta.nombre || 'Temporada alta' };
  if (c.semanaSanta) {
    const d = parseIso(date), e = easter(d.getFullYear());
    if (d >= addDays(e, -8) && d <= addDays(e, 0)) return { season: 'alta', reason: 'Semana Santa' };
  }
  const media = c.media.find(r => inYearly(md, r));
  if (media) return { season: 'media', reason: media.nombre || 'Temporada media' };
  if (c.festivosMedia && c.festivos.includes(date)) return { season: 'media', reason: 'Festivo' };
  const w = parseIso(date).getDay();
  if (c.finesDeSemana && (w === 0 || w === 6)) return { season: 'media', reason: 'Fin de semana' };
  return { season: 'baja', reason: 'Día entre semana' };
}

export interface Quote { season: Season; reason: string; perPerson: number; perNight: number; units: number; perDay: boolean; total: number; }

/**
 * Lo mismo que cobra la web: tarifa por persona de la temporada del día de llegada ×
 * (adultos + niños de 11 o más) + 60 % por cada niño de 4 a 10 años, × noches
 * (pasadía y grupo de trabajo: × 1 día). Los de 0 a 3 años no pagan.
 */
export function quote(rate: Rate | undefined, checkIn: string, nights: number, adults: number, children4to10: number, c: SeasonCalendar): Quote {
  const { season, reason } = seasonOf(checkIn, c);
  const perPerson = !rate ? 0 : season === 'alta' ? rate.high : season === 'media' ? rate.mid : rate.low;
  const perDay = RATE_TYPES.find(t => t.type === rate?.type)?.perDay ?? false;
  const perNight = Math.max(0, adults) * perPerson + Math.max(0, children4to10) * perPerson * CHILD_FACTOR;
  const units = perDay ? 1 : Math.max(1, nights);
  return { season, reason, perPerson, perNight, units, perDay, total: Math.round(perNight * units) };
}
