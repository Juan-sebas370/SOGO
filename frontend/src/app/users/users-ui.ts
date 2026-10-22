// Formatos compartidos de las pantallas de Usuarios y Roles.
import { AppUser, UserStatus, AuditResult } from './users.model';

const AVATAR = ['#1565C0', '#0F7A5A', '#6D3FC8', '#9A4B00', '#9D174D', '#0E7490', '#475569', '#166534', '#B45309', '#7C2D12'];

export function avatarColor(u: Pick<AppUser, 'username'>): string {
  let h = 0;
  for (const c of u.username) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export const STATUS_BADGE: Record<UserStatus, string> = {
  Activo: 'rsv-badge--ok', Pendiente: 'rsv-badge--warn', Bloqueado: 'rsv-badge--danger', Inactivo: 'rsv-badge--muted',
};
export const RESULT_BADGE: Record<AuditResult, string> = { Exitoso: 'rsv-badge--ok', Denegado: 'rsv-badge--warn', Fallido: 'rsv-badge--danger' };

const pad = (n: number) => String(n).padStart(2, '0');
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** "Hoy 16:50", "Ayer 17:40", "26/09 07:12" o "Nunca". */
export function when(stamp: string | null): string {
  if (!stamp) return 'Nunca';
  const d = stamp.slice(0, 10), t = stamp.slice(11, 16);
  if (d === day(0)) return `Hoy ${t}`;
  if (d === day(-1)) return `Ayer ${t}`;
  return `${stamp.slice(8, 10)}/${stamp.slice(5, 7)}${d.slice(0, 4) === day(0).slice(0, 4) ? '' : '/' + d.slice(0, 4)} ${t}`;
}

export const dmy = (stamp: string) => `${stamp.slice(8, 10)}/${stamp.slice(5, 7)}/${stamp.slice(0, 4)}`;
export const dmyTime = (stamp: string) => `${dmy(stamp)} ${stamp.slice(11, 16)}`;
export const today = () => day(0);
export const dayOffset = day;

/** Quita tildes y pasa a minúsculas para buscar. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
