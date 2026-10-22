// Datos de demostración de Usuarios y Roles. Las personas con cargo en la
// casa son los mismos empleados de Nómina (mismo documento); las fechas
// recientes son relativas a hoy para que "último acceso" y la auditoría
// siempre se vean al día.

import {
  AppUser, Role, RolePermissions, Module, MODULES, AuditEvent, StatusChange, PasswordReset, ExportRecord,
  emptyPermissions, hashPassword, eventHash,
} from './users.model';

const pad = (n: number) => String(n).padStart(2, '0');
export const stampOf = (d: Date, seconds = false) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
const at = (dayOffset: number, h: number, m: number, s = 0) => {
  const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, s, 0); return d;
};

/** Permisos a partir de letras: v ver, c crear, e editar, d eliminar, x exportar. */
function perms(spec: Partial<Record<Module, string>>): RolePermissions {
  const p = emptyPermissions();
  (Object.keys(spec) as Module[]).forEach(m => {
    const s = spec[m]!;
    p[m] = { view: s.includes('v'), create: s.includes('c'), edit: s.includes('e'), delete: s.includes('d'), export: s.includes('x') };
  });
  return p;
}

export function seedRoles(): Role[] {
  const base = { updatedBy: 'administrador', updatedAt: '2026-07-14T09:12' };
  const all = Object.fromEntries(MODULES.map(m => [m, 'vcedx'])) as Record<Module, string>;
  return [
    { ...base, id: 'admin', name: 'Administrador', description: 'Acceso total al sistema, usuarios y configuración.', level: 'Total', color: 'admin',
      parent: null, locked: true, permissions: perms(all), scope: Object.fromEntries(MODULES.map(m => [m, 'Todo'])) },
    { ...base, id: 'consulta', name: 'Consulta', description: 'Solo lectura de la operación diaria.', level: 'Consulta', color: 'cons', parent: null, locked: false,
      permissions: perms({ Reservas: 'v', Alojamiento: 'v', Restaurante: 'v', Inventarios: 'v', Reportes: 'v' }),
      scope: { Reservas: 'Consulta de reservas', Alojamiento: 'Estado de unidades', Restaurante: 'Consulta de pedidos', Inventarios: 'Consulta de existencias', Reportes: 'Ocupación y reservas' } },
    { ...base, id: 'recep', name: 'Recepcionista', description: 'Atiende reservas, check-in/check-out, TRA y facturas de alojamiento.', level: 'Operador', color: 'recep', parent: 'consulta', locked: false,
      permissions: perms({ Reservas: 'vce', Alojamiento: 'vce', TRA: 'vce', Facturación: 'vc' }),
      scope: { Reservas: 'Todas las reservas', Alojamiento: 'Check-in, check-out y estado de unidades', TRA: 'Registrar y enviar tarjetas', Facturación: 'Solo facturas de alojamiento',
        Restaurante: 'Consulta de pedidos', Inventarios: 'Consulta de existencias', Reportes: 'Ocupación y reservas', Usuarios: 'Solo su propio perfil' } },
    { ...base, id: 'rest', name: 'Operador Restaurante', description: 'Pedidos, cuentas y caja del restaurante.', level: 'Operador', color: 'rest', parent: null, locked: false,
      permissions: perms({ Restaurante: 'vce', Inventarios: 'v', Reportes: 'v' }),
      scope: { Restaurante: 'Pedidos, cuentas y caja', Inventarios: 'Consulta de existencias', Reportes: 'Ventas del restaurante' } },
    { ...base, id: 'aloj', name: 'Operador Alojamiento', description: 'Estado, limpieza y mantenimiento de las habitaciones.', level: 'Operador', color: 'aloj', parent: null, locked: false,
      permissions: perms({ Alojamiento: 'vce', Reservas: 'v', Inventarios: 'v' }),
      scope: { Alojamiento: 'Estado de habitaciones', Reservas: 'Llegadas y salidas', Inventarios: 'Insumos de habitaciones' } },
    { ...base, id: 'cont', name: 'Contador', description: 'Facturación, contabilidad y revisión de nómina.', level: 'Operador', color: 'cont', parent: null, locked: false,
      permissions: perms({ Contabilidad: 'vcedx', Facturación: 'vcedx', Nómina: 'vx', Reportes: 'vx', Inventarios: 'v' }),
      scope: { Contabilidad: 'Todo', Facturación: 'Todo', Nómina: 'Consulta y exportación', Reportes: 'Financieros', Inventarios: 'Valorización' } },
    { ...base, id: 'aux', name: 'Aux. Nómina e Inventario', description: 'Liquida la nómina y lleva el inventario.', level: 'Operador', color: 'aux', parent: null, locked: false,
      permissions: perms({ Nómina: 'vce', Inventarios: 'vcex', Reportes: 'vx', Restaurante: 'v' }),
      scope: { Nómina: 'Empleados y liquidación', Inventarios: 'Entradas, salidas y ajustes', Reportes: 'Inventario y nómina', Restaurante: 'Consumo de insumos' } },
  ];
}

type SeedUser = Omit<AppUser, 'passwordHash' | 'passwordSetAt' | 'failedAttempts' | 'mustChangePassword' | 'history' | 'lastIp' | 'createdBy' | 'lastAccess'>
  & { ip: string; history?: AppUser['history']; failedAttempts?: number };

const IPS: Record<string, string> = {
  administrador: '181.52.x.x', lcastano: '192.168.1.20', mtoro: '192.168.1.20', jramirez: '192.168.1.22', mherrera: '186.30.x.x',
  amunoz: '192.168.1.31', vquintero: '192.168.1.24', dosorio: '192.168.1.27', carango: '192.168.1.40', sgomez: '192.168.1.31', docampo: '',
};

export function seedUsers(): AppUser[] {
  const rows: SeedUser[] = [
    { id: 'u1', firstName: 'Sebastián', lastName: 'Pinilla', username: 'administrador', email: 'administrador@sogo.com', docType: 'CC', docNumber: '1094321550', phone: '300 123 4567',
      position: 'Administrador', roles: ['admin'], status: 'Activo', createdAt: '2025-01-02T08:00', ip: IPS['administrador'] },
    { id: 'u2', firstName: 'Laura', lastName: 'Castaño Ríos', username: 'lcastano', email: 'recepcion@sogo.com', docType: 'CC', docNumber: '1094556120', phone: '310 455 1020',
      position: 'Recepcionista', employeeId: 'e1', roles: ['recep', 'rest'], status: 'Activo', createdAt: '2025-01-15T09:30', ip: IPS['lcastano'] },
    { id: 'u3', firstName: 'Mariana', lastName: 'Toro Salazar', username: 'mtoro', email: 'mtoro@sogo.com', docType: 'CC', docNumber: '1094230876', phone: '315 601 3342',
      position: 'Recepcionista nocturna', employeeId: 'e7', roles: ['recep'], status: 'Activo', createdAt: '2025-02-03T10:10', ip: IPS['mtoro'] },
    { id: 'u4', firstName: 'Julián', lastName: 'Ramírez Henao', username: 'jramirez', email: 'jramirez@sogo.com', docType: 'CC', docNumber: '1053804229', phone: '320 771 0934',
      position: 'Auxiliar de inventarios y nómina', employeeId: 'e4', roles: ['aux'], status: 'Activo', createdAt: '2024-03-01T08:05', ip: IPS['jramirez'],
      history: [
        { at: '2026-07-14T09:12', field: 'Roles', before: 'Aux. Inventario', after: 'Aux. Nómina e Inventario', reason: 'Asume la liquidación de nómina', by: 'administrador' },
        { at: '2026-02-02T16:40', field: 'Teléfono', before: '311 204 5518', after: '320 771 0934', reason: 'Cambio de número', by: 'administrador' },
        { at: '2024-03-01T08:05', field: 'Cuenta', before: '—', after: 'Creada', reason: 'Ingreso a la empresa', by: 'administrador' },
      ] },
    { id: 'u5', firstName: 'Mónica', lastName: 'Herrera Zuluaga', username: 'mherrera', email: 'contador@sogo.com', docType: 'CC', docNumber: '41938207', phone: '316 220 4471',
      position: 'Contadora (externa)', roles: ['cont'], status: 'Activo', createdAt: '2024-03-10T11:00', ip: IPS['mherrera'] },
    { id: 'u6', firstName: 'Andrés', lastName: 'Muñoz Giraldo', username: 'amunoz', email: 'cocina@sogo.com', docType: 'CC', docNumber: '1097332018', phone: '316 882 4410',
      position: 'Cocinero', employeeId: 'e2', roles: ['rest'], status: 'Activo', createdAt: '2025-02-20T07:30', ip: IPS['amunoz'] },
    { id: 'u7', firstName: 'Valentina', lastName: 'Quintero Mejía', username: 'vquintero', email: 'vquintero@sogo.com', docType: 'CC', docNumber: '1004912337', phone: '314 223 9087',
      position: 'Mesera', employeeId: 'e5', roles: ['rest'], status: 'Activo', createdAt: '2025-05-05T09:00', ip: IPS['vquintero'] },
    { id: 'u8', firstName: 'Diana Patricia', lastName: 'Osorio', username: 'dosorio', email: 'dosorio@sogo.com', docType: 'CC', docNumber: '1094771405', phone: '310 882 1904',
      position: 'Camarera', employeeId: 'e3', roles: ['aloj'], status: 'Activo', createdAt: '2025-01-10T08:20', ip: IPS['dosorio'] },
    { id: 'u9', firstName: 'Carlos', lastName: 'Arango Vélez', username: 'carango', email: 'carango@sogo.com', docType: 'CC', docNumber: '9771203', phone: '311 778 2045',
      position: 'Mantenimiento y jardinería', employeeId: 'e6', roles: ['consulta'], status: 'Bloqueado', createdAt: '2025-04-20T10:00', ip: '190.66.x.x', failedAttempts: 5 },
    { id: 'u10', firstName: 'Samuel', lastName: 'Gómez Arias', username: 'sgomez', email: 'sgomez@sogo.com', docType: 'CC', docNumber: '1094998310', phone: '313 450 6622',
      position: 'Auxiliar de cocina', employeeId: 'e8', roles: ['rest'], status: 'Inactivo', createdAt: '2025-06-12T08:00', ip: IPS['sgomez'] },
    { id: 'u11', firstName: 'Daniela', lastName: 'Ocampo Arias', username: 'docampo', email: 'docampo@sogo.com', docType: 'CC', docNumber: '1094887512', phone: '310 482 7719',
      position: 'Recepcionista', roles: ['recep'], status: 'Pendiente', createdAt: stampOf(new Date(Date.now() - 12 * 60_000)), ip: '' },
  ];
  return rows.map(({ ip, history, failedAttempts, ...u }) => ({
    ...u,
    createdBy: 'administrador', lastAccess: null, lastIp: ip,
    passwordHash: hashPassword(`Demo-${u.username}-2026!`, u.id), passwordSetAt: u.createdAt,
    mustChangePassword: u.status === 'Pendiente', failedAttempts: failedAttempts ?? 0,
    activationExpires: u.status === 'Pendiente' ? stampOf(new Date(Date.now() + 48 * 3_600_000)) : undefined,
    history: history ?? [{ at: u.createdAt, field: 'Cuenta', before: '—', after: 'Creada', reason: u.status === 'Pendiente' ? 'Nueva recepcionista' : 'Ingreso a la empresa', by: 'administrador' }],
  }));
}

export function seedStatusHistory(): StatusChange[] {
  return [
    { at: stampOf(at(-2, 7, 12)), username: 'carango', from: 'Activo', to: 'Bloqueado', reason: '5 intentos fallidos de contraseña (automático)', note: '', by: 'Sistema' },
    { at: stampOf(at(-28, 23, 0)), username: 'sgomez', from: 'Activo', to: 'Inactivo', reason: 'Terminación de contrato', note: 'Retiro registrado en Nómina.', by: 'administrador' },
  ];
}

export function seedResets(): PasswordReset[] {
  return [
    { at: stampOf(at(-16, 8, 14)), username: 'mtoro', method: 'Temporal generada', reason: 'Olvidó la contraseña', note: '', by: 'administrador',
      channels: ['Correo'], expiresAt: stampOf(at(-15, 8, 14)), changedAt: stampOf(at(-16, 8, 31)) },
    { at: stampOf(at(-56, 19, 40)), username: 'amunoz', method: 'Temporal generada', reason: 'Sospecha de acceso ajeno', note: '', by: 'administrador',
      channels: ['Correo', 'Mensaje interno'], expiresAt: stampOf(at(-55, 19, 40)), changedAt: stampOf(at(-56, 19, 52)) },
  ];
}

export function seedExports(): ExportRecord[] {
  const d = new Date();
  const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', ' ');
  return [
    { file: `Auditoría seguridad ${prevMonth}.pdf`, content: 'Sesiones y permisos', user: 'administrador', at: stampOf(new Date(d.getFullYear(), d.getMonth(), 1, 8, 40)) },
    { file: 'Usuarios y roles.csv', content: 'Usuarios, roles', user: 'administrador', at: '2026-07-14T09:20' },
  ];
}

// ── Auditoría de demostración ────────────────────────

/** Acciones típicas por usuario (módulo, acción). */
const ACTIVITY: Record<string, [string, string][]> = {
  administrador: [['Reportes', 'Generó reporte general'], ['Usuarios', 'Consultó usuarios'], ['Contabilidad', 'Consultó balance financiero'], ['Configuración', 'Consultó configuración'], ['Reservas', 'Consultó reservas']],
  lcastano: [['Reservas', 'Registró reserva'], ['Alojamiento', 'Check-in de huéspedes'], ['Alojamiento', 'Check-out de huéspedes'], ['TRA', 'Envió TRA al MinCIT'], ['Facturación', 'Emitió factura de alojamiento'], ['Restaurante', 'Registró pedido']],
  mtoro: [['Reservas', 'Registró reserva'], ['Alojamiento', 'Check-in de huéspedes'], ['TRA', 'Registró huéspedes en TRA'], ['Reservas', 'Registró pago de reserva']],
  jramirez: [['Inventarios', 'Registró entrada de inventario'], ['Inventarios', 'Registró salida de inventario'], ['Nómina', 'Registró novedades de nómina'], ['Reportes', 'Generó reporte de inventario']],
  mherrera: [['Contabilidad', 'Consultó estado de resultados'], ['Contabilidad', 'Registró comprobante de egreso'], ['Facturación', 'Consultó facturas']],
  amunoz: [['Restaurante', 'Registró pedido'], ['Restaurante', 'Actualizó disponibilidad del menú'], ['Inventarios', 'Consultó existencias']],
  vquintero: [['Restaurante', 'Registró pedido'], ['Restaurante', 'Registró venta'], ['Restaurante', 'Cargó consumo a habitación']],
  dosorio: [['Alojamiento', 'Marcó habitación en limpieza'], ['Alojamiento', 'Habitación disponible'], ['Inventarios', 'Consultó insumos de habitaciones']],
};
/** Turnos: hora de entrada y salida, y cuántas veces vuelve a iniciar sesión en el día. */
const SHIFTS: Record<string, [number, number, number]> = {
  administrador: [8, 17, 5], lcastano: [7, 15, 5], mtoro: [22, 6, 4], jramirez: [8, 17, 4], mherrera: [9, 12, 1],
  amunoz: [6, 14, 4], vquintero: [11, 20, 5], dosorio: [8, 16, 4],
};

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Draft = Omit<AuditEvent, 'id' | 'hash' | 'prevHash'>;

/** Historial de los últimos 30 días, más los eventos concretos del escenario (bloqueo de carango, etc.). */
export function seedAudit(): AuditEvent[] {
  const rand = mulberry32(911);
  const now = new Date();
  const drafts: Draft[] = [];
  const ev = (d: Date, user: string, module: string, action: string, detail = '', extra: Partial<Draft> = {}) =>
    drafts.push({ at: stampOf(d, true), user, ip: IPS[user] || '192.168.1.50', device: user === 'administrador' || user === 'mherrera' ? 'Chrome, Windows' : 'Chrome, Android',
      module, action, detail, result: 'Exitoso', ...extra });

  for (let day = -30; day <= 0; day++) {
    for (const [user, [start, end, sessions]] of Object.entries(SHIFTS)) {
      if (user === 'mherrera' && ![1, 3, 5].includes(at(day, 12, 0).getDay())) continue;   // la contadora viene lun, mié y vie
      if (user === 'vquintero' && day < -60) continue;
      const hours = end > start ? end - start : 24 - start + end;
      for (let s = 0; s < sessions; s++) {
        const h = start + Math.floor((s / sessions) * hours);
        const login = at(day, h % 24, Math.floor(rand() * 50), Math.floor(rand() * 60));
        if (h >= 24) login.setDate(login.getDate() + 1);
        if (login > now) continue;
        ev(login, user, 'Sesión', 'Inició sesión');
        const acts = 3 + Math.floor(rand() * 6);
        for (let a = 0; a < acts; a++) {
          const t = new Date(login.getTime() + (a + 1) * (4 + rand() * 14) * 60_000);
          if (t > now) break;
          const [module, action] = ACTIVITY[user][Math.floor(rand() * ACTIVITY[user].length)];
          ev(t, user, module, action);
        }
        const out = new Date(login.getTime() + (acts + 2) * 15 * 60_000);
        if (out < now) ev(out, user, 'Sesión', 'Cerró sesión');
      }
    }
  }
  // Escenario: carango se bloquea por 5 intentos fallidos desde una IP nueva
  for (let i = 0; i < 5; i++) {
    ev(at(-2, 7, 8 + i, 41), 'carango', 'Sesión', i === 4 ? 'Inicio de sesión (5.º intento) · cuenta bloqueada' : 'Inicio de sesión · contraseña incorrecta', '',
      { ip: '190.66.x.x', device: 'Chrome, Android', result: 'Fallido' });
  }
  // Último turno de sgomez antes de su retiro
  ev(at(-28, 16, 2, 11), 'sgomez', 'Sesión', 'Inició sesión');
  ev(at(-28, 19, 40, 3), 'sgomez', 'Restaurante', 'Registró pedido');
  ev(at(-28, 22, 15, 20), 'sgomez', 'Sesión', 'Inició sesión');
  ev(at(-28, 22, 31, 9), 'sgomez', 'Sesión', 'Cerró sesión');
  ev(at(-28, 23, 0), 'administrador', 'Usuarios', 'Desactivó la cuenta de sgomez', 'Terminación de contrato', { object: 'Usuario «sgomez»' });
  ev(at(-16, 8, 14), 'administrador', 'Usuarios', 'Restableció contraseña de mtoro', 'Olvidó la contraseña', { object: 'Usuario «mtoro»' });
  ev(at(-3, 9, 30, 15), 'administrador', 'Usuarios', 'Restableció contraseña de mtoro', 'Olvidó la contraseña (segunda vez)', { object: 'Usuario «mtoro»' });
  ev(at(0, Math.min(14, now.getHours()), 21, 9), 'amunoz', 'Inventarios', 'Intentó ajustar existencias', 'Sin permiso de edición en Inventarios', { result: 'Denegado', object: 'Ajuste de existencias' });
  ev(new Date(now.getTime() - 29 * 60_000), 'administrador', 'Usuarios', 'Modificó permisos del rol Operador Restaurante', 'Solo el administrador anula ventas', {
    object: 'Rol «Operador Restaurante»', reason: 'Solo el administrador anula ventas',
    changes: [{ label: 'Restaurante › Anular venta', before: 'Sí', after: 'No' }, { label: 'Inventarios › Registrar salida', before: 'No', after: 'Sí' }],
  });
  ev(new Date(now.getTime() - 12 * 60_000), 'administrador', 'Usuarios', 'Registró usuario docampo', 'Recepcionista · pendiente de activación', { object: 'Usuario «docampo»' });

  const year = now.getFullYear();
  let prev = '0'.repeat(16);
  return drafts.filter(d => d.at <= stampOf(now, true)).sort((a, b) => a.at.localeCompare(b.at)).map((d, i) => {
    const e = { ...d, id: `EVT-${year}-${String(917000 + i).padStart(7, '0')}`, prevHash: prev };
    const hash = eventHash(e);
    prev = hash;
    return { ...e, hash };
  });
}
