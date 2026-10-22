import { toast } from '../shared/toast/toast.service';
import { serverMessage } from '../shared/toast/notify.interceptor';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import {
  AppUser, Role, RolePermissions, Module, Action, MODULES, ACTIONS, ACTION_LABEL, UserStatus, UserChange, StatusChange, PasswordReset,
  AuditEvent, AuditResult, ExportRecord, SecurityPolicy, AuditFlags, emptyPermissions, eventHash, tempPassword, fullName,
} from './users.model';
import { stampOf } from './users-seed';
import { API_URL } from '../api';
import { SaveQueue, dropNulls } from '../shared/save-queue';

export type NewUser = Pick<AppUser, 'firstName' | 'lastName' | 'username' | 'email' | 'docType' | 'docNumber' | 'phone' | 'position' | 'roles' | 'employeeId'>;

/** Módulo de auditoría según el prefijo con que cada módulo registra sus acciones ("Nómina: …"). */
const PREFIX_MODULE: [RegExp, string][] = [
  [/^Contabilidad/, 'Contabilidad'], [/^Nómina/, 'Nómina'], [/^Inventarios/, 'Inventarios'], [/^(Menú|Restaurante)/, 'Restaurante'],
  [/^Reportes/, 'Reportes'], [/factura|Facturación/i, 'Facturación'], [/^Usuarios/, 'Usuarios'], [/^Sesión/, 'Sesión'],
];

const DEFAULT_POLICY: SecurityPolicy = {
  minLength: 10, requireCase: true, requireNumber: true, requireSymbol: true, expiryDays: 90, history: 5,
  maxAttempts: 5, autoUnlockMinutes: 30, idleMinutes: 15, twoFactorAdmin: true, notifyNewIp: true,
  newAccountStatus: 'Pendiente', activationHours: 48, tempPasswordHours: 24, sso: { provider: 'Ninguno', url: '' },
};
const DEFAULT_AUDIT: AuditFlags = { logQueries: true, logExports: true };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Resultado de restablecer una contraseña: la temporal se muestra una sola vez al administrador. */
export type ResetResult = PasswordReset & { tempPassword?: string };

// Usuarios, roles, auditoría y política de seguridad de SOGO, guardados en la base de datos
// (tablas usuarios, roles, rol_permisos, auditoria, usuario_eventos y configuracion).
// Las pantallas leen la copia en memoria y cada cambio se guarda en el servidor, en orden.
// El inicio de sesión (intentos fallidos, bloqueos, desbloqueo automático, desactivaciones
// programadas) lo resuelve el servidor, que también lo deja en la auditoría.
@Injectable({ providedIn: 'root' })
export class UsersService {

  private readonly base = API_URL;
  private _policy: SecurityPolicy = clone(DEFAULT_POLICY);
  private _auditFlags: AuditFlags = clone(DEFAULT_AUDIT);
  /** Compatibilidad con Configuración › Seguridad (el desbloqueo automático lo aplica el servidor). */
  autoUnlockSince = stampOf(new Date());

  private users: AppUser[] = [];
  private roles: Role[] = [];
  private events: AuditEvent[] = [];
  statusHistory: StatusChange[] = [];
  resets: PasswordReset[] = [];
  exportsLog: ExportRecord[] = [];

  private users$ = new BehaviorSubject<AppUser[]>([]);
  private roles$ = new BehaviorSubject<Role[]>([]);
  private events$ = new BehaviorSubject<AuditEvent[]>([]);
  private queue = new SaveQueue('el cambio de usuarios', () => this.reload());
  /** Una cuenta cambió de estado y ya se guardó (Nómina se recarga: el servidor retira o reintegra al empleado). */
  readonly statusSaved$ = new Subject<void>();
  private auditQueue = new SaveQueue('el registro de auditoría');
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient) {}

  // ── Carga ────────────────────────────────────────────

  /** Primera carga de la sesión actual (el dashboard la espera antes de abrir cualquier módulo). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = this.load();
    }
    return this.loading;
  }

  reload(): Promise<void> {
    return this.loading = this.load();
  }

  private async load(): Promise<void> {
    if (!localStorage.getItem('sogo_token')) return;
    try {
      const get = <T>(path: string) => firstValueFrom(this.http.get<T>(`${this.base}/${path}`));
      const [users, roles, events, history, policy, audit] = await Promise.all([
        get<AppUser[]>('usuarios'), get<Role[]>('roles'), get<AuditEvent[]>('auditoria'),
        get<{ statusHistory: StatusChange[]; resets: PasswordReset[]; exports: ExportRecord[] }>('usuario-eventos'),
        get<SecurityPolicy | null>('configuracion/seguridad'), get<AuditFlags | null>('configuracion/auditoria'),
      ]);
      this.users = users.map(u => dropNulls({ ...u, lastAccess: u.lastAccess ?? null }) as AppUser).map(u => ({ ...u, lastAccess: u.lastAccess ?? null }));
      this.roles = roles.map(r => ({ ...r, parent: r.parent ?? null }));
      this.events = events.map(e => dropNulls(e));
      this.statusHistory = history.statusHistory;
      this.resets = history.resets;
      this.exportsLog = history.exports;
      this._policy = { ...clone(DEFAULT_POLICY), ...(policy ?? {}) };
      this._auditFlags = { ...clone(DEFAULT_AUDIT), ...(audit ?? {}) };
      this.users$.next(this.users);
      this.roles$.next(this.roles);
      this.events$.next(this.events);
    } catch (e: any) {
      console.error('No se pudieron cargar los usuarios', e);
      if (e?.status !== 401) toast.error('No se pudieron cargar los usuarios y roles', serverMessage(e));
    }
  }

  // ── Política (Configuración › Seguridad y Auditoría) ─

  get policy(): SecurityPolicy { return this._policy; }
  set policy(p: SecurityPolicy) {
    this._policy = clone(p);
    this.queue.run(() => firstValueFrom(this.http.put(`${this.base}/configuracion/seguridad`, this._policy)));
  }

  get auditFlags(): AuditFlags { return this._auditFlags; }
  set auditFlags(f: AuditFlags) {
    this._auditFlags = clone(f);
    this.queue.run(() => firstValueFrom(this.http.put(`${this.base}/configuracion/auditoria`, this._auditFlags)));
  }

  // ── Consultas ────────────────────────────────────────

  getUsers(): Observable<AppUser[]> { return this.users$.asObservable(); }
  usersSnapshot(): AppUser[] { return this.users; }
  getUser(id: string): AppUser | undefined { return this.users.find(u => u.id === id); }
  byUsername(username: string): AppUser | undefined { return this.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()); }
  byEmail(email: string): AppUser | undefined { return this.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()); }

  getRoles(): Observable<Role[]> { return this.roles$.asObservable(); }
  rolesSnapshot(): Role[] { return this.roles; }
  role(id: string): Role | undefined { return this.roles.find(r => r.id === id); }
  roleByName(name: string): Role | undefined { return this.roles.find(r => r.name === name); }
  roleNames(ids: string[]): string[] { return ids.map(id => this.role(id)?.name ?? id); }
  usersWithRole(id: string): AppUser[] { return this.users.filter(u => u.roles.includes(id)); }

  getEvents(): Observable<AuditEvent[]> { return this.events$.asObservable(); }
  eventsSnapshot(): AuditEvent[] { return this.events; }
  /** Compatibilidad: lista de eventos de auditoría. */
  getLogs(): AuditEvent[] { return this.events; }

  usernameTaken(username: string, exceptId?: string): AppUser | undefined {
    return this.users.find(u => u.id !== exceptId && u.username.toLowerCase() === username.trim().toLowerCase());
  }
  emailTaken(email: string, exceptId?: string): AppUser | undefined {
    return this.users.find(u => u.id !== exceptId && u.email.toLowerCase() === email.trim().toLowerCase());
  }
  docTaken(doc: string, exceptId?: string): AppUser | undefined {
    const d = doc.replace(/\D/g, '');
    return d ? this.users.find(u => u.id !== exceptId && u.docNumber === d) : undefined;
  }

  // ── Permisos ─────────────────────────────────────────

  /** Permisos efectivos de un rol: los propios más los heredados de su cadena de roles padre. */
  effective(roleId: string, seen = new Set<string>()): RolePermissions {
    const r = this.role(roleId);
    const p = emptyPermissions();
    if (!r || seen.has(roleId)) return p;
    seen.add(roleId);
    const parent = r.parent ? this.effective(r.parent, seen) : emptyPermissions();
    MODULES.forEach(m => ACTIONS.forEach(a => p[m][a] = !!r.permissions[m]?.[a] || parent[m][a]));
    return p;
  }

  /** De dónde viene un permiso: propio, heredado o ninguno. */
  source(roleId: string, m: Module, a: Action): 'own' | 'inherited' | null {
    const r = this.role(roleId);
    if (!r) return null;
    if (r.permissions[m]?.[a]) return 'own';
    return r.parent && this.effective(r.parent)[m][a] ? 'inherited' : null;
  }

  /** Unión de los permisos de varios roles. */
  permissionsFor(roleIds: string[]): RolePermissions {
    const p = emptyPermissions();
    roleIds.forEach(id => { const e = this.effective(id); MODULES.forEach(m => ACTIONS.forEach(a => p[m][a] ||= e[m][a])); });
    return p;
  }

  modulesWithAccess(u: Pick<AppUser, 'roles'>): Module[] {
    const p = this.permissionsFor(u.roles);
    return MODULES.filter(m => p[m].view);
  }

  roleCan(roleName: string, module: Module, action: Action = 'view'): boolean {
    const r = this.roleByName(roleName);
    return !!r && this.effective(r.id)[module][action];
  }

  // ── Sesión ───────────────────────────────────────────

  /** Usuario del sistema que tiene la sesión abierta (por correo o nombre de usuario del inicio de sesión). */
  sessionUser(): AppUser | undefined {
    const email = localStorage.getItem('sogo_email') || '';
    const username = localStorage.getItem('sogo_username') || '';
    return (email && this.byEmail(email)) || (username && this.byUsername(username)) || undefined;
  }

  /**
   * Roles de la sesión. Si la cuenta del servidor no existe en Usuarios se usa
   * el rol que envió el servidor; un rol desconocido queda en solo lectura.
   */
  sessionRoles(): string[] {
    const u = this.sessionUser();
    if (u) return u.roles;
    const name = localStorage.getItem('sogo_role') || '';
    return [this.roleByName(name)?.id ?? 'consulta'];
  }

  can(module: Module, action: Action = 'view'): boolean {
    return this.permissionsFor(this.sessionRoles())[module][action];
  }

  actor(): string {
    return this.sessionUser()?.username || localStorage.getItem('sogo_username') || 'sistema';
  }

  /** Nombre de la persona de la sesión («Nombre Apellido»), el mismo que registra el servidor. */
  actorName(): string {
    const u = this.sessionUser();
    return (u && fullName(u).trim()) || this.actor();
  }

  /**
   * El servidor ya validó la cuenta (estado, bloqueo, activación) y registró el
   * ingreso en la auditoría: aquí solo se confirma.
   */
  recordLogin(_info: { username: string; email: string }): { ok: boolean; message: string } {
    return { ok: true, message: '' };
  }

  /** Los intentos fallidos los cuenta y bloquea el servidor (y quedan en la auditoría). */
  recordFailedLogin(_identifier: string): void {}

  recordLogout(): void {
    this.record({ user: this.actor(), module: 'Sesión', action: 'Cerró sesión', detail: '' });
  }

  // ── Usuarios ─────────────────────────────────────────

  createUser(data: NewUser, opts: { password: string; mustChange: boolean; status: 'Activo' | 'Pendiente' }): AppUser {
    const id = `u${Date.now().toString(36)}`;
    const now = stampOf(new Date());
    const u: AppUser = {
      ...data, id, docNumber: data.docNumber.replace(/\D/g, ''), username: data.username.trim().toLowerCase(), email: data.email.trim().toLowerCase(),
      status: opts.status, createdAt: now, createdBy: this.actor(), lastAccess: null, lastIp: '',
      passwordHash: '', passwordSetAt: now, mustChangePassword: opts.mustChange, failedAttempts: 0,
      activationExpires: opts.status === 'Pendiente' ? stampOf(new Date(Date.now() + this.policy.activationHours * 3_600_000)) : undefined,
      history: [{ at: now, field: 'Cuenta', before: '—', after: 'Creada', reason: 'Registro de usuario', by: this.actor() }],
    };
    this.users = [...this.users, u];
    this.users$.next(this.users);
    // La contraseña solo viaja al servidor, que la guarda cifrada (BCrypt)
    this.queue.run(async () => {
      const saved = await firstValueFrom(this.http.post<AppUser>(`${this.base}/usuarios`,
        { user: u, password: opts.password, mustChange: opts.mustChange, status: opts.status }));
      this.replaceUser(saved);
    });
    this.record({ module: 'Usuarios', action: `Registró usuario ${u.username}`, object: `Usuario «${u.username}»`,
      detail: `${this.roleNames(u.roles).join(', ')} · ${opts.status === 'Pendiente' ? 'pendiente de activación' : 'activo'}` });
    return u;
  }

  /** Cambios de datos, cargo o roles con motivo: queda cada campo en el historial y en auditoría. */
  updateUser(id: string, changes: Partial<NewUser>, labels: { field: string; before: string; after: string }[], reason: string): void {
    const u = this.getUser(id);
    if (!u || !labels.length) return;
    const now = stampOf(new Date());
    const entries: UserChange[] = labels.map(l => ({ at: now, ...l, reason, by: this.actor() }));
    this.patch(id, { ...changes, history: [...entries, ...u.history] });
    this.record({ module: 'Usuarios', action: `Modificó usuario ${u.username}`, object: `Usuario «${u.username}»`, detail: labels.map(l => l.field).join(', '),
      changes: labels.map(l => ({ label: l.field, before: l.before, after: l.after })), reason });
  }

  setStatus(id: string, to: UserStatus, reason: string, note = ''): void {
    const u = this.getUser(id);
    if (!u || u.status === to) return;
    this.guardLastAdmin(u, to);
    this.statusChange(u, to, reason, note, this.actor());
    this.patch(id, { status: to, scheduledDeactivation: undefined, ...(to === 'Activo' ? { failedAttempts: 0, activationExpires: undefined } : {}) });
    const verb = to === 'Activo' ? (u.status === 'Bloqueado' ? 'Desbloqueó' : 'Activó') : to === 'Inactivo' ? 'Desactivó' : 'Cambió el estado de';
    this.record({ module: 'Usuarios', action: `${verb} la cuenta de ${u.username}`, object: `Usuario «${u.username}»`, detail: reason, reason,
      changes: [{ label: 'Estado', before: u.status, after: to }] });
    this.queue.idle().then(() => this.statusSaved$.next());
  }

  scheduleDeactivation(id: string, when: string, reason: string, note: string): void {
    const u = this.getUser(id);
    if (!u) return;
    this.guardLastAdmin(u, 'Inactivo');
    this.patch(id, { scheduledDeactivation: { at: when, reason, note, by: this.actor() } });
    this.record({ module: 'Usuarios', action: `Programó la desactivación de ${u.username}`, object: `Usuario «${u.username}»`, detail: `${when.replace('T', ' ')} · ${reason}`, reason });
  }

  cancelScheduled(id: string): void {
    const u = this.getUser(id);
    if (!u?.scheduledDeactivation) return;
    this.patch(id, { scheduledDeactivation: undefined });
    this.record({ module: 'Usuarios', action: `Canceló la desactivación programada de ${u.username}`, object: `Usuario «${u.username}»`, detail: '' });
  }

  resendActivation(id: string): void {
    const u = this.getUser(id);
    if (!u || u.status !== 'Pendiente') return;
    this.patch(id, { activationExpires: stampOf(new Date(Date.now() + this.policy.activationHours * 3_600_000)) });
    this.record({ module: 'Usuarios', action: `Reenvió el enlace de activación a ${u.username}`, object: `Usuario «${u.username}»`, detail: u.email });
  }

  /**
   * Restablece la contraseña en el servidor (BCrypt). Como SOGO no tiene servidor de
   * correo, la temporal se devuelve para mostrarla UNA vez al administrador.
   */
  resetPassword(id: string, o: { mode: 'temp' | 'manual'; password?: string; unlock: boolean; channels: string[]; reason: string; note: string }): ResetResult | null {
    const u = this.getUser(id);
    if (!u) return null;
    const pw = o.mode === 'temp' ? tempPassword(12) : o.password!;
    const now = new Date();
    const unlock = o.unlock && u.status === 'Bloqueado';
    if (unlock) this.statusChange(u, 'Activo', 'Desbloqueo al restablecer la contraseña', o.reason, this.actor());
    this.setLocal(id, { passwordSetAt: stampOf(now), mustChangePassword: true, failedAttempts: 0, ...(unlock ? { status: 'Activo' as UserStatus } : {}) });
    this.queue.run(() => firstValueFrom(this.http.post(`${this.base}/usuarios/${id}/clave`, { password: pw, mustChange: true, unlock })));
    const r: PasswordReset = {
      at: stampOf(now), username: u.username, method: o.mode === 'temp' ? 'Temporal generada' : 'Definida por el administrador', reason: o.reason, note: o.note,
      by: this.actor(), channels: o.channels, expiresAt: o.mode === 'temp' ? stampOf(new Date(now.getTime() + this.policy.tempPasswordHours * 3_600_000)) : null, changedAt: null,
    };
    this.resets = [r, ...this.resets];
    this.saveEvent('clave', r);
    this.record({ module: 'Usuarios', action: `Restableció contraseña de ${u.username}`, object: `Usuario «${u.username}»`, reason: o.reason,
      detail: `${r.method} · aviso por ${o.channels.join(', ') || 'ningún canal'}${unlock ? ' · cuenta desbloqueada' : ''}` });
    return o.mode === 'temp' ? { ...r, tempPassword: pw } : r;
  }

  // ── Roles ────────────────────────────────────────────

  createRole(data: Pick<Role, 'name' | 'description' | 'level' | 'parent'>): Role {
    const r: Role = { ...data, id: `r${Date.now().toString(36)}`, color: 'custom', permissions: emptyPermissions(), scope: {}, locked: false,
      updatedAt: stampOf(new Date()), updatedBy: this.actor() };
    this.roles = [...this.roles, r];
    this.roles$.next(this.roles);
    this.queue.run(async () => this.replaceRole(await firstValueFrom(this.http.post<Role>(`${this.base}/roles`, r))));
    this.record({ module: 'Usuarios', action: `Creó el rol ${r.name}`, object: `Rol «${r.name}»`, detail: r.parent ? `Hereda de ${this.role(r.parent)?.name}` : '' });
    return r;
  }

  updateRole(id: string, data: Pick<Role, 'name' | 'description' | 'level' | 'parent'>): string {
    const r = this.role(id);
    if (!r) return 'El rol no existe.';
    if (data.parent && this.inheritsFrom(data.parent, id)) return 'Ese rol padre crearía un ciclo de herencia.';
    if (this.roles.some(x => x.id !== id && x.name.toLowerCase() === data.name.trim().toLowerCase())) return 'Ya existe un rol con ese nombre.';
    this.roles = this.roles.map(x => x.id === id ? { ...x, ...data, name: data.name.trim(), updatedAt: stampOf(new Date()), updatedBy: this.actor() } : x);
    this.roles$.next(this.roles);
    this.saveRole(id);
    this.record({ module: 'Usuarios', action: `Editó el rol ${data.name}`, object: `Rol «${r.name}»`, detail: '' });
    return '';
  }

  deleteRole(id: string): string {
    const r = this.role(id);
    if (!r) return 'El rol no existe.';
    if (r.locked) return `«${r.name}» es un rol crítico protegido.`;
    const holders = this.usersWithRole(id);
    if (holders.length) return `No se puede eliminar: ${holders.length} usuario(s) lo tienen asignado (${holders.map(u => u.username).join(', ')}).`;
    const children = this.roles.filter(x => x.parent === id);
    if (children.length) return `No se puede eliminar: ${children.map(c => c.name).join(', ')} hereda(n) de este rol.`;
    this.roles = this.roles.filter(x => x.id !== id);
    this.roles$.next(this.roles);
    this.queue.run(() => firstValueFrom(this.http.delete(`${this.base}/roles/${id}`)));
    this.record({ module: 'Usuarios', action: `Eliminó el rol ${r.name}`, object: `Rol «${r.name}»`, detail: '' });
    return '';
  }

  /** Aplica los permisos propios de un rol. El Administrador no puede perder Usuarios ni Configuración. */
  savePermissions(id: string, next: RolePermissions, reason: string): string {
    const r = this.role(id);
    if (!r) return 'El rol no existe.';
    if (r.locked && (['Usuarios', 'Configuración'] as Module[]).some(m => ACTIONS.some(a => !next[m][a]))) {
      return '«Administrador» no puede perder permisos sobre Usuarios y Configuración.';
    }
    const changes: { label: string; before: string; after: string }[] = [];
    MODULES.forEach(m => ACTIONS.forEach(a => {
      if (!!r.permissions[m]?.[a] !== next[m][a]) changes.push({ label: `${m} › ${ACTION_LABEL[a]}`, before: r.permissions[m]?.[a] ? 'Sí' : 'No', after: next[m][a] ? 'Sí' : 'No' });
    }));
    if (!changes.length) return '';
    this.roles = this.roles.map(x => x.id === id ? { ...x, permissions: clone(next), updatedAt: stampOf(new Date()), updatedBy: this.actor() } : x);
    this.roles$.next(this.roles);
    this.saveRole(id);
    this.record({ module: 'Usuarios', action: `Modificó permisos del rol ${r.name}`, object: `Rol «${r.name}»`, detail: `${changes.length} cambio(s) · afecta a ${this.usersWithRole(id).length} usuario(s)`,
      changes, reason });
    return '';
  }

  inheritsFrom(roleId: string, ancestorId: string): boolean {
    for (let r = this.role(roleId), i = 0; r && i < 20; r = r.parent ? this.role(r.parent) : undefined, i++) if (r.id === ancestorId) return true;
    return false;
  }

  // ── Auditoría ────────────────────────────────────────

  /** Registro de auditoría usado por todos los módulos ("Nómina: liquidación confirmada", detalle). */
  addLog(action: string, detail: string, extra: { result?: AuditResult; object?: string; reason?: string } = {}): void {
    notifyAction(action, detail, extra.result);
    // Consultas y exportaciones se registran según la política de Configuración (los rechazos siempre)
    if ((extra.result ?? 'Exitoso') === 'Exitoso') {
      if (!this.auditFlags.logQueries && /consult|generó reporte|reporte .*generado|indicadores consultados/i.test(action)) return;
      if (!this.auditFlags.logExports && /export|descarg/i.test(action)) return;
    }
    const [, prefix, rest] = action.match(/^([^:]+):\s*(.+)$/) ?? [];
    const module = PREFIX_MODULE.find(([re]) => re.test(action))?.[1] ?? 'Sistema';
    const text = rest ? rest[0].toUpperCase() + rest.slice(1) : action;
    this.record({ module, action: prefix && module === prefix.trim() ? text : action, detail, ...extra });
  }

  logExport(file: string, content: string): void {
    const x: ExportRecord = { file, content, user: this.actor(), at: stampOf(new Date()) };
    this.exportsLog = [x, ...this.exportsLog];
    this.saveEvent('exportacion', x);
    if (this.auditFlags.logExports) this.record({ module: 'Usuarios', action: `Exportó ${file}`, detail: content });
  }

  /**
   * Verifica la cadena de hashes que firmó el servidor: si alguien alteró un evento en la
   * base de datos, falla desde ahí. Los eventos aún sin firmar (recién registrados) se omiten.
   */
  verifyChain(): { ok: boolean; brokenAt?: string } {
    const signed = this.events.filter(e => e.hash);
    let prev = signed[0]?.prevHash ?? '0'.repeat(16);
    for (const e of signed) {
      const { hash, ...rest } = e;
      if (e.prevHash !== prev || eventHash(rest) !== hash) return { ok: false, brokenAt: e.id };
      prev = hash;
    }
    return { ok: true };
  }

  getStats() {
    const count = (s: UserStatus) => this.users.filter(u => u.status === s).length;
    return { total: this.users.length, active: count('Activo'), pending: count('Pendiente'), blocked: count('Bloqueado'), inactive: count('Inactivo'),
      roles: new Set(this.users.flatMap(u => u.roles)).size };
  }

  // ── Interno ──────────────────────────────────────────

  /**
   * Agrega el evento a la vista de inmediato (sin firma) y lo envía al servidor, que lo
   * numera, lo firma y lo encadena. La respuesta firmada reemplaza a la provisional.
   */
  private record(e: { user?: string; module: string; action: string; detail: string; result?: AuditResult; object?: string; reason?: string; changes?: AuditEvent['changes'] }): void {
    const user = e.user ?? this.actor();
    const draft: AuditEvent = {
      id: `EVT-${Date.now().toString(36)}`, at: stampOf(new Date(), true), user, ip: '', device: navigatorLabel(),
      module: e.module, action: e.action, detail: e.detail, result: e.result ?? 'Exitoso',
      object: e.object, reason: e.reason, changes: e.changes, prevHash: '', hash: '',
    };
    this.events = [...this.events, draft];
    this.events$.next(this.events);
    if (!localStorage.getItem('sogo_token')) return;
    this.auditQueue.run(async () => {
      const saved = dropNulls(await firstValueFrom(this.http.post<AuditEvent>(`${this.base}/auditoria`, {
        user: user === 'sistema' ? 'sistema' : undefined, module: draft.module, action: draft.action, detail: draft.detail,
        object: draft.object, result: draft.result, changes: draft.changes, reason: draft.reason, device: draft.device,
      })));
      this.events = this.events.map(x => x === draft ? saved : x);
      this.events$.next(this.events);
    });
  }

  /** Cambia la copia local y guarda la cuenta completa en el servidor. */
  private patch(id: string, changes: Partial<AppUser>): void {
    this.setLocal(id, changes);
    const u = this.getUser(id);
    if (!u) return;
    const body = { ...u };
    this.queue.run(async () => this.replaceUser(await firstValueFrom(this.http.put<AppUser>(`${this.base}/usuarios/${id}`, body))));
  }

  private setLocal(id: string, changes: Partial<AppUser>): void {
    this.users = this.users.map(u => u.id === id ? { ...u, ...changes } : u);
    this.users$.next(this.users);
  }

  private replaceUser(saved: AppUser): void {
    const u = { ...dropNulls(saved), lastAccess: saved.lastAccess ?? null } as AppUser;
    this.users = this.users.some(x => x.id === u.id) ? this.users.map(x => x.id === u.id ? u : x) : [...this.users, u];
    this.users$.next(this.users);
  }

  private saveRole(id: string): void {
    const r = this.role(id);
    if (!r) return;
    const body = { ...r };
    this.queue.run(async () => this.replaceRole(await firstValueFrom(this.http.put<Role>(`${this.base}/roles/${id}`, body))));
  }

  private replaceRole(saved: Role): void {
    const r = { ...saved, parent: saved.parent ?? null };
    this.roles = this.roles.some(x => x.id === r.id) ? this.roles.map(x => x.id === r.id ? r : x) : [...this.roles, r];
    this.roles$.next(this.roles);
  }

  private saveEvent(tipo: 'estado' | 'clave' | 'exportacion', datos: unknown): void {
    this.queue.run(() => firstValueFrom(this.http.post(`${this.base}/usuario-eventos`, { tipo, datos })));
  }

  private statusChange(u: AppUser, to: UserStatus, reason: string, note: string, by: string): void {
    const s: StatusChange = { at: stampOf(new Date()), username: u.username, from: u.status, to, reason, note, by };
    this.statusHistory = [s, ...this.statusHistory];
    this.saveEvent('estado', s);
  }

  /** Nunca queda el sistema sin un administrador activo. */
  private guardLastAdmin(u: AppUser, to: UserStatus): void {
    if (to === 'Activo' || !u.roles.includes('admin')) return;
    const others = this.users.filter(x => x.id !== u.id && x.status === 'Activo' && x.roles.includes('admin'));
    if (!others.length) throw new Error(`${fullName(u)} es el único administrador activo: el sistema quedaría sin quién lo administre.`);
  }
}

/** "Chrome, Windows" a partir del navegador (para la columna Dispositivo de la auditoría). */
function navigatorLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser}, ${os}` : browser;
}

/**
 * Aviso (esquina superior derecha) para las acciones que quedan en auditoría: "Nómina: liquidación
 * confirmada" → "Liquidación confirmada". Las consultas y el inicio o cierre de sesión no avisan.
 * Lo que se guarda en el servidor ya avisa desde NotifyInterceptor; si coinciden, se ve un solo aviso.
 */
const QUIET = /consult|generó reporte|reporte (de )?\w* ?generado|reporte generado|balance generado|indicadores|^Sesión|reporte de ventas|^Reporte de|integración$/i;

function notifyAction(action: string, detail: string, result: AuditResult = 'Exitoso'): void {
  const text = (action.match(/^[^:]+:\s*(.+)$/)?.[1] ?? action).trim();
  const title = text[0].toUpperCase() + text.slice(1);
  if (result !== 'Exitoso') { toast.error(title, detail); return; }
  if (QUIET.test(action)) return;
  toast.success(title, detail);
}
