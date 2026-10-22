// =====================================================
// USUARIOS Y ROLES — modelo
// Un usuario puede tener varios roles; sus permisos son la unión de los de
// cada rol. Un rol puede heredar de otro (rol padre): sus permisos efectivos
// son los propios más los heredados. La auditoría es de solo lectura y cada
// evento guarda el hash del anterior, así cualquier alteración se detecta.
// =====================================================

export type UserStatus = 'Activo' | 'Pendiente' | 'Bloqueado' | 'Inactivo';
export const USER_STATUSES: UserStatus[] = ['Activo', 'Pendiente', 'Bloqueado', 'Inactivo'];

export const MODULES = ['Reservas', 'Alojamiento', 'TRA', 'Facturación', 'Restaurante', 'Inventarios', 'Reportes', 'Nómina', 'Contabilidad', 'Mensajes', 'Usuarios', 'Configuración'] as const;
export type Module = typeof MODULES[number];

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export';
export const ACTIONS: Action[] = ['view', 'create', 'edit', 'delete', 'export'];
export const ACTION_LABEL: Record<Action, string> = { view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar', export: 'Exportar' };

export type ModulePermission = Record<Action, boolean>;
export type RolePermissions = Record<Module, ModulePermission>;

export type RoleLevel = 'Total' | 'Operador' | 'Consulta';

export interface Role {
  id:          string;
  name:        string;
  description: string;
  level:       RoleLevel;
  color:       string;          // clase de insignia: admin, recep, rest, aloj, cont, aux, cons, custom
  parent:      string | null;   // id del rol del que hereda
  permissions: RolePermissions; // solo los propios
  scope:       Partial<Record<Module, string>>;
  locked:      boolean;         // rol crítico (Administrador)
  updatedAt:   string;
  updatedBy:   string;
}

export interface UserChange { at: string; field: string; before: string; after: string; reason: string; by: string; }

export interface AppUser {
  id:          string;
  firstName:   string;
  lastName:    string;
  username:    string;
  email:       string;
  docType:     string;
  docNumber:   string;          // solo dígitos
  phone:       string;
  position:    string;          // cargo
  employeeId?: string;          // empleado de Nómina vinculado
  roles:       string[];        // ids de rol
  status:      UserStatus;
  createdAt:   string;          // YYYY-MM-DDTHH:mm
  createdBy:   string;
  lastAccess:  string | null;
  lastIp:      string;
  passwordHash: string;         // nunca se muestra
  passwordSetAt: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  activationExpires?: string;   // cuentas pendientes
  scheduledDeactivation?: { at: string; reason: string; note: string; by: string };
  history:     UserChange[];
}

export interface StatusChange { at: string; username: string; from: UserStatus; to: UserStatus; reason: string; note: string; by: string; }

export interface PasswordReset {
  at: string; username: string; method: 'Temporal generada' | 'Definida por el administrador'; reason: string; note: string; by: string;
  channels: string[]; expiresAt: string | null; changedAt: string | null;
}

export type AuditResult = 'Exitoso' | 'Denegado' | 'Fallido';

export interface AuditEvent {
  id:       string;             // EVT-2026-0918342
  at:       string;             // YYYY-MM-DDTHH:mm:ss
  user:     string;             // nombre de usuario
  ip:       string;
  device:   string;
  module:   string;             // Usuarios, Sesión, Restaurante...
  action:   string;
  detail:   string;
  object?:  string;
  result:   AuditResult;
  changes?: { label: string; before: string; after: string }[];
  reason?:  string;
  hash:     string;
  prevHash: string;
}

export interface ExportRecord { file: string; content: string; user: string; at: string; }

export interface SecurityPolicy {
  minLength: number; requireCase: boolean; requireNumber: boolean; requireSymbol: boolean;
  expiryDays: number;              // 0 = no vence
  history: number;                 // contraseñas anteriores que no se pueden repetir
  maxAttempts: number;
  autoUnlockMinutes: number;       // 0 = solo el administrador desbloquea
  idleMinutes: number;             // cierre de sesión por inactividad (0 = nunca)
  twoFactorAdmin: boolean; notifyNewIp: boolean;
  newAccountStatus: 'Activo' | 'Pendiente';
  activationHours: number; tempPasswordHours: number;
  sso: { provider: 'Ninguno' | 'Microsoft Entra ID' | 'Google Workspace' | 'LDAP'; url: string };
}

/** Qué se registra en la auditoría (Configuración › Auditoría y respaldos). */
export interface AuditFlags { logQueries: boolean; logExports: boolean; }

// ── Utilidades ───────────────────────────────────────

export const fullName = (u: Pick<AppUser, 'firstName' | 'lastName'>) => `${u.firstName} ${u.lastName}`.trim();
export const initials = (u: Pick<AppUser, 'firstName' | 'lastName'>) => `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();
export const docLabel = (u: Pick<AppUser, 'docType' | 'docNumber'>) => `${u.docType} ${Number(u.docNumber).toLocaleString('es-CO')}`;
export const maskedDoc = (u: Pick<AppUser, 'docType' | 'docNumber'>) => `${u.docType} ••••${u.docNumber.slice(-3)}`;

export function emptyPermissions(): RolePermissions {
  return Object.fromEntries(MODULES.map(m => [m, { view: false, create: false, edit: false, delete: false, export: false }])) as RolePermissions;
}

/** Reglas de la política de contraseñas (se muestran como lista de chequeo). */
export function passwordRules(pw: string, policy: SecurityPolicy, username = '', doc = ''): { label: string; ok: boolean }[] {
  const low = pw.toLowerCase();
  return [
    { label: `Mínimo ${policy.minLength} caracteres`, ok: pw.length >= policy.minLength },
    ...(policy.requireCase ? [{ label: 'Una mayúscula', ok: /[A-ZÁÉÍÓÚÑ]/.test(pw) }, { label: 'Una minúscula', ok: /[a-záéíóúñ]/.test(pw) }] : []),
    ...(policy.requireNumber ? [{ label: 'Un número', ok: /\d/.test(pw) }] : []),
    ...(policy.requireSymbol ? [{ label: 'Un símbolo (!@#…)', ok: /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(pw) }] : []),
    { label: 'Distinta al usuario y al documento', ok: !!pw && (!username || !low.includes(username.toLowerCase())) && (!doc || !pw.includes(doc)) },
  ];
}

export function passwordStrength(pw: string, policy: SecurityPolicy): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' };
  const rules = passwordRules(pw, policy);
  const missing = rules.filter(r => !r.ok).length;
  const variety = [/[A-Z]/, /[a-z]/, /d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
  const score = missing > 1 ? 1 : missing === 1 ? 2 : pw.length >= policy.minLength + 4 && variety >= 3 ? 4 : 3;
  return { score, label: ['', 'débil', 'regular', 'buena', 'muy buena'][score] };
}

/**
 * Hash de demostración: en el navegador no hay bcrypt. Se guarda una huella
 * irreversible con prefijo $2b$ para dejar claro dónde iría el hash real del
 * servidor; la contraseña en texto plano nunca se guarda.
 */
export function hashPassword(pw: string, salt: string): string {
  return `$2b$10$${digest(`${salt}:${pw}`)}${digest(`${pw}:${salt}`)}`;
}

/** Huella FNV-1a de 64 bits en hexadecimal (encadenamiento de auditoría). */
export function digest(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export const eventHash = (e: Omit<AuditEvent, 'hash'>) =>
  digest(`${e.prevHash}|${e.id}|${e.at}|${e.user}|${e.module}|${e.action}|${e.detail}|${e.result}`);

/** Genera una contraseña temporal que cumple la política. */
export function tempPassword(length = 12): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const rand = (n: number) => {
    const c = globalThis.crypto;
    if (c?.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  };
  const chars = sets.map(s => s[rand(s.length)]);
  const all = sets.join('');
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
