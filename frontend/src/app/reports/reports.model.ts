// =====================================================
// REPORTES Y ESTADÍSTICAS — cálculos puros
// Todo se deriva de los datos de los módulos: ninguna cifra se guarda aparte.
// Una noche-habitación está ocupada si una reserva vigente (no cancelada ni
// no presentada) incluye la habitación y la noche cae entre su llegada
// (incluida) y su salida (excluida). Las pasadías no ocupan noches.
// =====================================================

import { Reservation, ReservationChannel, LodgingType, CHANNELS, isVoid, totalAmount, balance } from '../reservations/reservation.model';
import { Room } from '../lodging/room.model';

export interface Range { from: string; to: string; }

// ── Fechas ───────────────────────────────────────────

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00`).getTime() - new Date(`${from}T12:00`).getTime()) / 86_400_000);

export function eachDay(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const rangeLabel = (r: Range) => r.from.slice(0, 4) === r.to.slice(0, 4)
  ? `${dm(r.from)} – ${dmy(r.to)}` : `${dmy(r.from)} – ${dmy(r.to)}`;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (p: string) => MONTHS[+p.slice(5, 7) - 1];
export const monthLabel = (p: string) => `${monthName(p)[0].toUpperCase()}${monthName(p).slice(1)} ${p.slice(0, 4)}`;
export const monthShort = (p: string) => `${monthName(p)[0].toUpperCase()}${monthName(p).slice(1, 3)}`;
export function shiftMonth(p: string, n: number): string {
  const d = new Date(+p.slice(0, 4), +p.slice(5, 7) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const monthEnd = (p: string) => `${p}-${String(new Date(+p.slice(0, 4), +p.slice(5, 7), 0).getDate()).padStart(2, '0')}`;
/** Últimos `n` meses terminando en `last` (incluido), del más antiguo al más reciente. */
export const lastMonths = (last: string, n: number) => Array.from({ length: n }, (_, i) => shiftMonth(last, i - n + 1));

// ── Formatos ─────────────────────────────────────────

const nf = (digits: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const money = (v: number) => (v < 0 ? '- ' : '') + '$ ' + nf(0).format(Math.abs(Math.round(v)));
export const pct = (v: number, digits = 1) => isFinite(v) ? `${nf(digits).format(v)} %` : '—';
export const num = (v: number, digits = 0) => isFinite(v) ? nf(digits).format(v) : '—';
export const millions = (v: number, digits = 1) => `${nf(digits).format(v / 1_000_000)} M`;
/** Variación relativa en %, o NaN si no hay base. */
export const variation = (cur: number, prev: number) => prev ? ((cur - prev) / Math.abs(prev)) * 100 : NaN;

/** Cambio frente a la comparación: "8,6 %" o "8,9 pp", con su sentido. */
export interface Delta { text: string; up: boolean; good: boolean; none: boolean; }
export function delta(cur: number, prev: number | null, kind: 'rel' | 'pp' = 'rel', higherIsBetter = true): Delta {
  if (prev === null || !isFinite(prev) || !isFinite(cur) || (kind === 'rel' && !prev)) return { text: '—', up: false, good: true, none: true };
  const v = kind === 'pp' ? cur - prev : variation(cur, prev);
  const up = v >= 0;
  return { text: kind === 'pp' ? `${nf(1).format(Math.abs(v))} pp` : pct(Math.abs(v)), up, good: up === higherIsBetter || Math.abs(v) < 0.05, none: false };
}

// ── Ocupación ────────────────────────────────────────

/** Tarifa por noche-habitación de una reserva: el valor del alojamiento repartido. */
export const roomNightRate = (r: Reservation) => r.nights > 0 && r.rooms.length ? r.lodgingAmount / r.nights / r.rooms.length : 0;

export const occupiesNight = (r: Reservation, night: string) => !isVoid(r) && r.nights > 0 && r.checkIn <= night && night < r.checkOut;

export interface OccupancyFilter { lodgingType?: LodgingType | ''; room?: string; }

export interface DayOccupancy { date: string; occupied: number; available: number; pct: number; }
export interface RoomOccupancy { room: Room; occupied: number; available: number; pct: number; stays: number; avgStay: number; }

export interface OccupancyReport {
  days: DayOccupancy[];
  occupied: number; available: number; pct: number;
  stays: number; avgStay: number;
  revenue: number; adr: number; revpar: number;
  rooms: RoomOccupancy[];
  byMode: { mode: LodgingType; nights: number; share: number }[];
}

export function occupancy(reservations: Reservation[], rooms: Room[], range: Range, f: OccupancyFilter = {}): OccupancyReport {
  const list = reservations.filter(r => !isVoid(r) && r.nights > 0 && (!f.lodgingType || r.lodgingType === f.lodgingType));
  const scope = f.room ? rooms.filter(r => r.number === f.room) : rooms;
  const nights = eachDay(range);
  let revenue = 0;
  const perRoom = new Map(scope.map(r => [r.number, 0]));
  const byMode = new Map<LodgingType, number>();
  const days = nights.map(date => {
    let occupied = 0;
    list.filter(r => occupiesNight(r, date)).forEach(r => r.rooms.filter(n => perRoom.has(n)).forEach(n => {
      occupied++;
      perRoom.set(n, perRoom.get(n)! + 1);
      revenue += roomNightRate(r);
      byMode.set(r.lodgingType, (byMode.get(r.lodgingType) ?? 0) + 1);
    }));
    return { date, occupied, available: scope.length, pct: scope.length ? occupied / scope.length * 100 : 0 };
  });
  // Estadías: reservas con al menos una noche dentro del rango y en las unidades del filtro
  const staysIn = (numbers: string[]) => list.filter(r => r.rooms.some(n => numbers.includes(n)) && r.checkIn <= range.to && r.checkOut > range.from);
  const stays = staysIn(scope.map(r => r.number));
  const occupied = days.reduce((s, d) => s + d.occupied, 0);
  const available = scope.length * nights.length;
  return {
    days, occupied, available, pct: available ? occupied / available * 100 : 0,
    stays: stays.length, avgStay: stays.length ? stays.reduce((s, r) => s + r.nights, 0) / stays.length : 0,
    revenue, adr: occupied ? revenue / occupied : 0, revpar: available ? revenue / available : 0,
    rooms: scope.map(room => {
      const st = staysIn([room.number]);
      const occ = perRoom.get(room.number)!;
      return { room, occupied: occ, available: nights.length, pct: nights.length ? occ / nights.length * 100 : 0,
        stays: st.length, avgStay: st.length ? st.reduce((s, r) => s + r.nights, 0) / st.length : 0 };
    }),
    byMode: (['Habitación', 'Piso', 'Casa completa'] as LodgingType[]).map(mode => ({
      mode, nights: byMode.get(mode) ?? 0, share: occupied ? (byMode.get(mode) ?? 0) / occupied * 100 : 0,
    })),
  };
}

// ── Reservas ─────────────────────────────────────────

export interface ReservationStats {
  count: number; byChannel: Record<ReservationChannel, number>;
  voided: number; cancelRate: number; value: number; leadDays: number;
  pendingPay: number; pendingBalance: number;
}

/** Estadísticas de un conjunto de reservas (normalmente las creadas en el período). */
export function reservationStats(list: Reservation[]): ReservationStats {
  const valid = list.filter(r => !isVoid(r));
  const byChannel = Object.fromEntries(CHANNELS.map(c => [c, list.filter(r => r.channel === c).length])) as Record<ReservationChannel, number>;
  const owing = valid.filter(r => balance(r) > 0 && r.status !== 'Finalizada');
  return {
    count: list.length, byChannel,
    voided: list.length - valid.length, cancelRate: list.length ? (list.length - valid.length) / list.length * 100 : 0,
    value: valid.reduce((s, r) => s + totalAmount(r), 0),
    leadDays: valid.length ? valid.reduce((s, r) => s + Math.max(0, daysBetween(r.createdAt.slice(0, 10), r.checkIn)), 0) / valid.length : 0,
    pendingPay: owing.length, pendingBalance: owing.reduce((s, r) => s + balance(r), 0),
  };
}

// ── Gráficos ─────────────────────────────────────────

/** Máximo "redondo" del eje y sus marcas (4 divisiones). */
export function axis(maxValue: number, divisions = 4): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: 1, ticks: [0] };
  const raw = maxValue / divisions;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find(m => m * pow >= raw) ?? 10) * pow;
  return { max: step * divisions, ticks: Array.from({ length: divisions + 1 }, (_, i) => i * step) };
}

/** Recta de mínimos cuadrados sobre los puntos (x = índice). */
export function linearTrend(values: number[]): { slope: number; intercept: number; at: (x: number) => number } {
  const n = values.length;
  if (!n) return { slope: 0, intercept: 0, at: () => 0 };
  const mx = (n - 1) / 2, my = values.reduce((s, v) => s + v, 0) / n;
  const sxx = values.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const slope = sxx ? values.reduce((s, v, i) => s + (i - mx) * (v - my), 0) / sxx : 0;
  const intercept = my - slope * mx;
  return { slope, intercept, at: x => intercept + slope * x };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Colores de la paleta de Reportes (los gráficos llevan el color en línea para poder exportarse). */
export const COLORS = {
  blue: '#1565C0', amber: '#D98A0B', purple: '#7C4DDB', gray: '#9AA5B4', green: '#1F8A5B', red: '#C62828',
  navy: '#0A2540', light: '#9CC0E6', grid: '#E6EBF2', text: '#6B7280',
};
export const CHANNEL_COLORS: Record<ReservationChannel, string> = { Web: COLORS.green, Directo: COLORS.blue, Booking: COLORS.amber, Airbnb: COLORS.purple, 'Walk-in': COLORS.gray };
