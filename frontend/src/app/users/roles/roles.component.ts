import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { UsersService } from '../users.service';
import { AppUser, Role, RoleLevel, RolePermissions, Module, Action, MODULES, ACTIONS, ACTION_LABEL } from '../users.model';
import { dmy, fold } from '../users-ui';

interface Pending { module: Module; action: Action; on: boolean; }
type RoleForm = { name: string; description: string; level: RoleLevel; parent: string };

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../users.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/users">Usuarios</a><span>/</span><span>Roles y permisos</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Roles y permisos</h1>
      <p class="kit-sub">Define qué puede hacer cada rol en cada módulo. Los cambios aplican de inmediato al confirmar.</p>
    </div>
    <div class="kit-actions"><button type="button" class="rsv-btn rsv-btn--primary" *ngIf="canEdit" (click)="openForm(null)">+ Nuevo rol</button></div>
  </header>

  <div class="ro-layout">
    <aside class="kit-card ro-list">
      <label class="ro-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" [(ngModel)]="q" placeholder="Buscar rol" aria-label="Buscar rol"></label>
      <button type="button" class="ro-item" *ngFor="let r of filtered" [class.active]="r.id === selId" (click)="select(r.id)">
        <span class="ur-role" [ngClass]="'ur-role--' + r.color">{{ r.name }}</span>
        <small>{{ holders(r.id).length }} usuario{{ holders(r.id).length === 1 ? '' : 's' }} · {{ r.level }}</small>
        <svg *ngIf="r.locked" class="ro-lock" viewBox="0 0 24 24" aria-label="Rol protegido"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      </button>
      <p class="kit-error" *ngIf="switchWarn">Confirma o descarta los cambios de «{{ sel?.name }}» antes de cambiar de rol.</p>
    </aside>

    <div *ngIf="sel as r">
      <section class="kit-card ro-head">
        <div class="ro-title">
          <div><h2>{{ r.name }} <span class="rsv-badge rsv-badge--muted">Nivel: {{ r.level }}</span></h2><p class="rp-muted">{{ r.description }}</p></div>
          <div class="kit-actions" *ngIf="canEdit">
            <button type="button" class="rsv-btn rsv-btn--outline" (click)="openForm(r)">Editar rol</button>
            <button type="button" class="rsv-btn rsv-btn--danger-outline" [disabled]="r.locked" (click)="confirmDelete = true">Eliminar</button>
          </div>
        </div>
        <div class="ro-meta">
          <div class="kit-select"><span>Hereda permisos de (rol padre)</span><strong>{{ parentName(r) }}</strong></div>
          <div class="kit-select"><span>Usuarios con este rol</span><strong>{{ holders(r.id).length }}{{ holders(r.id).length ? ' · ' + holderNames(r.id) : '' }}</strong></div>
          <div class="kit-select"><span>Última modificación</span><strong>{{ dmy(r.updatedAt) }} · {{ r.updatedBy }}</strong></div>
        </div>
        <div class="kit-banner kit-banner--danger ro-mt" *ngIf="confirmDelete">
          <div>¿Eliminar el rol «{{ r.name }}»? {{ holders(r.id).length ? 'No se puede: tiene usuarios asignados.' : 'Esta acción queda en auditoría.' }}</div>
          <button type="button" class="rsv-btn rsv-btn--outline" (click)="confirmDelete = false">Cancelar</button>
          <button type="button" class="rsv-btn rsv-btn--danger" (click)="remove(r)">Eliminar</button>
        </div>
        <p class="kit-error" *ngIf="error">{{ error }}</p>
      </section>

      <section class="kit-card">
        <div class="ro-legend">
          <h2 class="kit-card-title">Permisos por módulo</h2>
          <span><i class="cb own"></i>Propio</span>
          <span *ngIf="r.parent"><i class="cb inh"></i>Heredado de {{ parentName(r) }}</span>
          <span><i class="cb"></i>Sin permiso</span>
          <span><i class="cb pend"></i>Cambio pendiente</span>
        </div>
        <div class="kit-table-wrap">
          <table class="kit-table ro-matrix">
            <thead><tr><th>Módulo</th><th *ngFor="let a of actions">{{ label[a] }}</th><th>Alcance</th></tr></thead>
            <tbody>
              <tr *ngFor="let m of modules" [class.off]="!effective(m, 'view')">
                <td><strong>{{ m }}</strong></td>
                <td *ngFor="let a of actions">
                  <button type="button" class="cb" [ngClass]="cellClass(m, a)" [disabled]="!editable(m, a)" (click)="toggle(m, a)"
                          [attr.aria-pressed]="effective(m, a)" [attr.aria-label]="m + ' · ' + label[a]" [title]="cellTitle(m, a)">
                    <svg *ngIf="effective(m, a)" viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></button>
                </td>
                <td class="rp-muted">{{ r.scope[m] || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="ro-pending" *ngIf="pending.length">
        <div>
          <strong>{{ pending.length }} cambio{{ pending.length === 1 ? '' : 's' }} pendiente{{ pending.length === 1 ? '' : 's' }} en «{{ r.name }}»</strong>
          <p><ng-container *ngFor="let p of pending; let last = last"><span [class.up]="p.on" [class.down]="!p.on">{{ p.on ? '+' : '−' }} {{ label[p.action] }}</span> en {{ p.module }}{{ last ? '' : ' · ' }}</ng-container>
            · afecta a {{ affected }} usuario{{ affected === 1 ? '' : 's' }}</p>
        </div>
        <small>Se registrará fecha, hora, administrador y detalle de cada permiso modificado.</small>
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" (click)="reviewing = true">Revisar y confirmar</button>
      </section>

      <p class="kit-banner kit-banner--ok ro-mt" *ngIf="savedMsg">{{ savedMsg }}</p>
      <p class="kit-banner kit-banner--danger ro-mt">
        <span><strong>Rol crítico protegido:</strong> «Administrador» no se puede eliminar ni perder el permiso sobre Usuarios y Configuración, porque el sistema quedaría sin quién lo administre.</span>
      </p>
    </div>
  </div>

  <!-- Confirmación de permisos -->
  <div class="rsv-modal-overlay" *ngIf="reviewing" (click)="reviewing = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="rv-title">Confirmar permisos de «{{ sel?.name }}»</h2>
      <p class="rsv-modal-desc">Se aplican de inmediato a {{ affected }} usuario{{ affected === 1 ? '' : 's' }}{{ childRoles.length ? ' y a los roles que heredan: ' + childRoles.join(', ') : '' }}.</p>
      <div class="ro-rv" *ngFor="let p of pending"><span>{{ p.module }} › {{ label[p.action] }}</span><span class="ur-pill-change" [ngClass]="p.on ? 'up' : 'down'">{{ p.on ? 'No → Sí' : 'Sí → No' }}</span></div>
      <label class="kit-field ro-mt">Motivo *<textarea class="rsv-input" rows="2" [(ngModel)]="reason" maxlength="200"></textarea></label>
      <p class="kit-error" *ngIf="error">{{ error }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="reviewing = false">Seguir editando</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!reason.trim()" (click)="confirm()">Confirmar cambios</button>
      </div>
    </div>
  </div>

  <!-- Nuevo / editar rol -->
  <div class="rsv-modal-overlay" *ngIf="form" (click)="form = null">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="rf-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="rf-title">{{ formId ? 'Editar rol' : 'Nuevo rol' }}</h2>
      <label class="kit-field">Nombre *<input class="rsv-input" [(ngModel)]="form.name" maxlength="40" [disabled]="!!formId && !!sel?.locked"></label>
      <label class="kit-field">Descripción<input class="rsv-input" [(ngModel)]="form.description" maxlength="120"></label>
      <div class="ur-grid-2">
        <label class="kit-field">Nivel<select class="rsv-input" [(ngModel)]="form.level"><option>Operador</option><option>Consulta</option><option>Total</option></select></label>
        <label class="kit-field">Hereda permisos de<select class="rsv-input" [(ngModel)]="form.parent"><option value="">Ninguno</option>
          <option *ngFor="let r of parentOptions" [value]="r.id">{{ r.name }}</option></select></label>
      </div>
      <p class="rsv-modal-desc">{{ formId ? '' : 'El rol nuevo empieza sin permisos propios; los defines en la matriz después de crearlo.' }}</p>
      <p class="kit-error" *ngIf="formError">{{ formError }}</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="form = null">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!form.name.trim()" (click)="saveForm()">{{ formId ? 'Guardar' : 'Crear rol' }}</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .ro-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
    .ro-list { display: flex; flex-direction: column; gap: 8px; }
    .ro-search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: 1px solid #D5DEEA; border-radius: 10px; margin-bottom: 4px; }
    .ro-search svg { width: 16px; height: 16px; fill: none; stroke: #6B7280; stroke-width: 2; }
    .ro-search input { border: none; outline: none; flex: 1; font: inherit; font-size: 13px; background: transparent; }
    .ro-item { position: relative; text-align: left; border: 1px solid transparent; background: none; border-radius: 12px; padding: 10px 12px; cursor: pointer; font: inherit; }
    .ro-item small { display: block; font-size: 11.5px; color: #6B7280; margin-top: 5px; }
    .ro-item .ur-role { display: block; width: fit-content; }
    .ro-item.active { border-color: #1565C0; background: #F2F7FD; }
    .ro-lock { position: absolute; right: 12px; top: 13px; width: 14px; height: 14px; fill: none; stroke: #6B7280; stroke-width: 2; }
    .ro-head { margin-bottom: 16px; }
    .ro-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .ro-title h2 { margin: 0 0 4px; font-size: 18px; color: #0A2540; display: flex; align-items: center; gap: 8px; }
    .ro-title p { margin: 0; }
    .ro-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
    .ro-meta .kit-select { height: auto; padding: 8px 12px; }
    .ro-meta strong { font-size: 13px; color: #0A2540; font-weight: 500; }
    .ro-mt { margin-top: 12px; }
    .kit-banner .rsv-btn { flex-shrink: 0; }
    .ro-legend { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; font-size: 12px; color: #374151; }
    .ro-legend .kit-card-title { margin: 0 auto 0 0; }
    .ro-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .cb { width: 20px; height: 20px; border-radius: 5px; border: 1.5px solid #C9D3E0; background: #fff; display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; vertical-align: middle; }
    i.cb { cursor: default; }
    .cb svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .cb.own { background: #1565C0; border-color: #1565C0; color: #fff; }
    .cb.inh { background: #EEF5FD; border-color: #1565C0; color: #1565C0; }
    .cb.pend { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #D98A0B; }
    .cb:disabled { cursor: not-allowed; }
    .cb:disabled:not(.own):not(.inh) { opacity: .45; }
    .ro-matrix th, .ro-matrix td { text-align: center; }
    .ro-matrix th:first-child, .ro-matrix td:first-child, .ro-matrix th:last-child, .ro-matrix td:last-child { text-align: left; }
    .ro-matrix tr.off td:first-child strong { color: #9AA5B4; }
    .ro-pending { position: sticky; bottom: 12px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: #FFFBF3; border: 2px solid #D98A0B; border-radius: 14px; padding: 14px 18px; margin-top: 16px; box-shadow: 0 8px 20px rgba(15,23,42,.08); }
    .ro-pending > div { flex: 1; min-width: 240px; font-size: 13px; }
    .ro-pending p { margin: 4px 0 0; font-size: 12px; color: #4B5563; }
    .ro-pending .up { color: #1F8A5B; font-weight: 700; } .ro-pending .down { color: #C62828; font-weight: 700; }
    .ro-pending > small { max-width: 260px; font-size: 11.5px; color: #6B7280; }
    .ro-rv { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #EEF1F5; font-size: 13px; }
    @media (max-width: 1000px) { .ro-layout { grid-template-columns: 1fr; } .ro-meta { grid-template-columns: 1fr; } }
  `],
})
export class RolesComponent implements OnDestroy {
  readonly modules = MODULES; readonly actions = ACTIONS; readonly label = ACTION_LABEL; readonly dmy = dmy;
  roles: Role[] = [];
  users: AppUser[] = [];
  selId = 'recep';
  draft!: RolePermissions;
  q = '';
  reviewing = false;
  reason = '';
  error = ''; savedMsg = ''; switchWarn = false; confirmDelete = false;
  form: RoleForm | null = null;
  formId: string | null = null;
  formError = '';
  private sub: Subscription;

  constructor(private svc: UsersService) {
    this.sub = combineLatest([svc.getRoles(), svc.getUsers()]).subscribe(([r, u]) => {
      this.roles = r; this.users = u;
      if (!r.some(x => x.id === this.selId)) this.selId = r[0]?.id ?? '';
      if (!this.draft || !this.pending.length) this.resetDraft();
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get canEdit(): boolean { return this.svc.can('Usuarios', 'edit'); }
  get sel(): Role | undefined { return this.roles.find(r => r.id === this.selId); }
  get filtered(): Role[] { const q = fold(this.q.trim()); return this.roles.filter(r => !q || fold(r.name).includes(q)); }
  get parentOptions(): Role[] { return this.roles.filter(r => !this.formId || (r.id !== this.formId && !this.svc.inheritsFrom(r.id, this.formId))); }
  get childRoles(): string[] { return this.roles.filter(r => r.parent === this.selId).map(r => r.name); }
  /** Usuarios afectados: los del rol y los de roles que heredan de él. */
  get affected(): number {
    const ids = this.roles.filter(r => this.svc.inheritsFrom(r.id, this.selId)).map(r => r.id);
    return this.users.filter(u => u.roles.some(r => ids.includes(r))).length;
  }
  get pending(): Pending[] {
    const r = this.sel;
    if (!r || !this.draft) return [];
    return MODULES.flatMap(m => ACTIONS.filter(a => r.permissions[m][a] !== this.draft[m][a]).map(a => ({ module: m, action: a, on: this.draft[m][a] })));
  }

  holders(id: string): AppUser[] { return this.users.filter(u => u.roles.includes(id)); }
  holderNames(id: string): string { return this.holders(id).map(u => u.firstName.split(' ')[0]).join(', '); }
  parentName(r: Role): string { return r.parent ? this.roles.find(x => x.id === r.parent)?.name ?? '—' : 'Ninguno'; }

  private inherited(m: Module, a: Action): boolean {
    const r = this.sel;
    return !!r?.parent && this.svc.effective(r.parent)[m][a];
  }
  effective(m: Module, a: Action): boolean { return !!this.draft?.[m][a] || this.inherited(m, a); }
  editable(m: Module, a: Action): boolean {
    const r = this.sel;
    if (!r || !this.canEdit) return false;
    if (r.locked && (m === 'Usuarios' || m === 'Configuración')) return false;
    return !(this.inherited(m, a) && !this.draft[m][a]);
  }
  cellClass(m: Module, a: Action): Record<string, boolean> {
    const own = !!this.draft?.[m][a];
    return { own, inh: !own && this.inherited(m, a), pend: !!this.sel && this.sel.permissions[m][a] !== own };
  }
  cellTitle(m: Module, a: Action): string {
    if (this.sel?.locked && (m === 'Usuarios' || m === 'Configuración')) return 'Protegido: el Administrador conserva este permiso';
    if (this.inherited(m, a) && !this.draft[m][a]) return `Heredado de ${this.parentName(this.sel!)}: se cambia en el rol padre`;
    return '';
  }

  toggle(m: Module, a: Action): void {
    if (!this.editable(m, a)) return;
    const on = !this.draft[m][a];
    this.draft[m][a] = on;
    // Sin "Ver" no tiene sentido lo demás; y cualquier acción implica "Ver"
    if (a === 'view' && !on) ACTIONS.forEach(x => this.draft[m][x] = false);
    if (a !== 'view' && on && !this.effective(m, 'view')) this.draft[m].view = true;
    this.savedMsg = ''; this.error = '';
  }

  select(id: string): void {
    if (id === this.selId) return;
    if (this.pending.length) { this.switchWarn = true; return; }
    this.switchWarn = false; this.confirmDelete = false; this.error = ''; this.savedMsg = '';
    this.selId = id;
    this.resetDraft();
  }

  resetDraft(): void { const r = this.sel; if (r) this.draft = JSON.parse(JSON.stringify(r.permissions)); }
  discard(): void { this.resetDraft(); this.switchWarn = false; }

  confirm(): void {
    const n = this.pending.length, name = this.sel!.name;
    this.error = this.svc.savePermissions(this.selId, this.draft, this.reason.trim());
    if (this.error) return;
    this.reviewing = false; this.reason = ''; this.switchWarn = false;
    this.resetDraft();
    this.savedMsg = `${n} permiso${n === 1 ? '' : 's'} de «${name}» actualizado${n === 1 ? '' : 's'}. Ya aplican a ${this.affected} usuario${this.affected === 1 ? '' : 's'}.`;
  }

  remove(r: Role): void {
    this.error = this.svc.deleteRole(r.id);
    this.confirmDelete = false;
    if (!this.error) { this.selId = this.roles[0]?.id ?? ''; this.resetDraft(); }
  }

  openForm(r: Role | null): void {
    this.formId = r?.id ?? null;
    this.form = r ? { name: r.name, description: r.description, level: r.level, parent: r.parent ?? '' } : { name: '', description: '', level: 'Operador', parent: '' };
    this.formError = '';
  }

  saveForm(): void {
    const f = this.form!;
    const data = { name: f.name.trim(), description: f.description.trim(), level: f.level, parent: f.parent || null };
    if (this.formId) {
      this.formError = this.svc.updateRole(this.formId, data);
      if (this.formError) return;
    } else {
      if (this.roles.some(r => r.name.toLowerCase() === data.name.toLowerCase())) { this.formError = 'Ya existe un rol con ese nombre.'; return; }
      const created = this.svc.createRole(data);
      this.selId = created.id;
      this.resetDraft();
    }
    this.form = null;
  }
}
