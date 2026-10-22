import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService, AuditPolicy, Backup } from '../settings.service';
import { UsersService } from '../../users/users.service';
import { ReservationService } from '../../reservations/reservation.service';
import { HotelService } from '../../shared/hotel.service';
import { metaText } from '../hotel/hotel.component';
import { stampOf } from '../../users/users-seed';
import { serverMessage } from '../../shared/toast/notify.interceptor';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

@Component({
  selector: 'app-settings-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Auditoría y respaldos</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Auditoría y respaldos</h1><p class="kit-sub">Qué se registra, protección de datos personales y copias de seguridad de la base de datos.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!error || !canEdit || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="error && dirty">{{ error }}</p>
  <p class="kit-banner kit-banner--warn" *ngIf="!settings.auditSaved">Aún no se ha guardado la política de datos y respaldos: revísala y pulsa «Guardar cambios». Mientras tanto no hay respaldo automático.</p>

  <div class="cf-two">
    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Registro de auditoría</h2>
        <div class="cf-row"><div><strong>Registrar consultas de información</strong><small>Además de creaciones, cambios y eliminaciones.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="a.logQueries"><i></i></label></div>
        <div class="cf-row"><div><strong>Registrar exportaciones y descargas</strong></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="a.logExports"><i></i></label></div>
        <div class="cf-row"><div><strong>Conservar historial de actividad</strong><small>Los eventos no se pueden editar ni borrar desde SOGO.</small></div>
          <select class="rsv-input" [(ngModel)]="a.retentionYears"><option [ngValue]="2">2 años</option><option [ngValue]="5">5 años</option><option [ngValue]="10">10 años</option></select></div>
        <div class="cf-row"><div><strong>Firma de integridad</strong><small>El servidor encadena cada evento con el anterior (hash). Siempre activa. {{ chainText }}</small></div>
          <label class="kit-toggle" title="No se puede desactivar"><input type="checkbox" checked disabled><i></i></label></div>
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="verify()">Verificar integridad ahora</button>
        <p class="cf-note" *ngIf="!a.logQueries || !a.logExports">Aunque se apague, los accesos denegados y los intentos fallidos siempre se registran.</p>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Protección de datos personales</h2>
        <div class="cf-row"><div><strong>Ocultar documentos en exportaciones</strong><small>Solo los últimos 3 dígitos (Ley 1581 de 2012). Aplica en <a routerLink="/dashboard/users/export">Usuarios › Exportar</a>.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="a.maskDocs"><i></i></label></div>
        <div class="cf-row"><div><strong>Pedir autorización de tratamiento de datos</strong><small>Al registrar reservas se pide la aceptación del huésped.</small></div><label class="kit-toggle"><input type="checkbox" [(ngModel)]="a.askConsent"><i></i></label></div>
        <div class="cf-row"><div><strong>Anonimizar huéspedes antiguos</strong><small>Plazo de la política. {{ oldGuests }}</small></div>
          <select class="rsv-input" [(ngModel)]="a.anonymizeAfterYears"><option [ngValue]="0">Nunca</option><option [ngValue]="2">Después de 2 años</option><option [ngValue]="5">Después de 5 años</option><option [ngValue]="10">Después de 10 años</option></select></div>
        <div class="cf-row"><div><strong>Responsable del tratamiento *</strong><small>Persona o empresa responsable de los datos (Ley 1581).</small></div><input class="rsv-input au-name" [(ngModel)]="a.controller" maxlength="80" [class.invalid]="!a.controller.trim()" placeholder="Nombre del responsable"></div>
        <p class="cf-note">SOGO todavía no borra ni anonimiza datos de forma automática: el plazo y la conservación quedan registrados como política del hospedaje.</p>
      </section>
    </div>

    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Copias de seguridad</h2>
        <div class="cf-row"><div><strong>Respaldo automático</strong><small>Lo hace el servidor de SOGO, si está encendido a esa hora.</small></div>
          <select class="rsv-input" [(ngModel)]="a.backupSchedule"><option>Diario · 02:00</option><option>Diario · 23:00</option><option>Semanal · domingo 02:00</option><option>Apagado</option></select></div>
        <div class="cf-row"><div><strong>Conservar</strong><small>Los respaldos más viejos se borran.</small></div>
          <span class="cf-unit"><input type="number" min="1" max="365" [(ngModel)]="a.backupKeep"><span>respaldos</span></span></div>
        <div class="cf-row"><div><strong>Carpeta</strong><small>En el equipo donde corre el backend.</small></div><code class="au-folder">{{ folder || '—' }}</code></div>
        <p class="kit-banner kit-banner--warn" *ngIf="a.backupSchedule === 'Apagado'">Sin respaldo automático, un daño del equipo puede hacer perder información.</p>
        <p class="cf-note">Copia con frecuencia esa carpeta (o descarga los respaldos) a un disco externo o a tu nube: si el equipo se daña, los respaldos que solo estén ahí también se pierden.</p>
      </section>

      <section class="kit-card">
        <div class="cf-card-head"><h2 class="kit-card-title">Respaldos</h2><button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!canEdit || working" (click)="backupNow()">{{ working ? 'Respaldando…' : 'Respaldar ahora' }}</button></div>
        <p class="kit-banner" *ngIf="last?.at && last as l" [ngClass]="l.ok ? 'kit-banner--ok' : 'kit-banner--danger'">
          Último respaldo {{ l.kind?.toLowerCase() }} {{ when(l.at!) }}: {{ l.ok ? 'correcto' : 'falló · ' + l.detail }}</p>
        <p class="kit-banner kit-banner--danger" *ngIf="loadError">{{ loadError }}</p>
        <table class="kit-table cf-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th class="r">Tamaño</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let b of backups">
              <td>{{ when(b.at) }}</td><td>{{ b.kind }}</td><td class="r">{{ size(b.bytes) }}</td>
              <td class="r"><button type="button" class="au-link" [disabled]="!canEdit" (click)="download(b)">Descargar</button></td>
            </tr>
            <tr *ngIf="!backups.length && !loadError"><td colspan="4" class="kit-empty">Todavía no hay respaldos. Pulsa «Respaldar ahora».</td></tr>
          </tbody>
        </table>
        <p class="cf-note">Cada respaldo es una copia completa de la base de datos (SOGO y la página web: reservas, facturas, contabilidad con sus soportes, nómina, inventario, usuarios y configuración) en un archivo <code>.sql.gz</code>. Contiene datos personales: guárdalo en un lugar seguro.
          Para restaurar: MySQL Workbench › Server › Data Import con el archivo descomprimido (reemplaza las tablas).</p>
      </section>
    </div>
  </div>
  `,
  styles: [`.au-name { width: 220px; } .au-link { border: none; background: none; color: #0B6FD0; font: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; }
    .au-folder { font-size: 11px; color: #374151; max-width: 240px; overflow-wrap: anywhere; text-align: right; }`],
})
export class AuditComponent {
  a: AuditPolicy;
  private base = '';
  saved = ''; chainText = ''; working = false; saving = false; loadError = '';
  backups: Backup[] = [];
  folder = '';
  last?: { at?: string; kind?: string; ok?: boolean; detail?: string };

  constructor(public settings: SettingsService, private users: UsersService, private reservations: ReservationService, private hotel: HotelService) {
    this.a = { ...clone(settings.audit), ...users.auditFlags };
    // Responsable sugerido: el titular de Datos del hospedaje (hasta que se guarde uno)
    if (!this.a.controller.trim()) this.a.controller = hotel.get().legalName || '';
    this.base = JSON.stringify({ ...this.a, controller: settings.audit.controller });
    this.verify(false);
    this.refresh();
  }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.audit); }
  get dirty(): boolean { return JSON.stringify(this.a) !== this.base || !this.settings.auditSaved; }
  get error(): string {
    if (!this.a.controller.trim()) return 'Escribe el responsable del tratamiento de datos.';
    if (!(+this.a.backupKeep >= 1 && +this.a.backupKeep <= 365)) return 'Indica cuántos respaldos conservar (de 1 a 365).';
    return '';
  }
  get oldGuests(): string {
    if (!this.a.anonymizeAfterYears) return 'Desactivado.';
    const limit = new Date(); limit.setFullYear(limit.getFullYear() - this.a.anonymizeAfterYears);
    const n = this.reservations.getSnapshot().filter(r => r.checkOut < stampOf(limit).slice(0, 10)).length;
    return `Hoy hay ${n} reserva${n === 1 ? '' : 's'} en ese caso.`;
  }

  when(at: string): string { return `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} ${at.slice(11, 16)}`; }
  size(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  private async refresh(): Promise<void> {
    if (!this.canEdit) return;
    try {
      const r = await this.settings.listBackups();
      this.backups = r.backups; this.folder = r.folder; this.last = r.last; this.loadError = '';
    } catch (e) {
      this.loadError = serverMessage(e);
    }
  }

  verify(log = true): void {
    const r = this.users.verifyChain();
    const n = this.users.eventsSnapshot().length.toLocaleString('es-CO');
    this.chainText = r.ok ? `Verificado: ${n} eventos íntegros.` : `¡Alerta! La cadena está alterada desde ${r.brokenAt}.`;
    if (log) this.users.addLog('Configuración: verificación de integridad', r.ok ? `${n} eventos íntegros` : `Cadena alterada desde ${r.brokenAt}`, { result: r.ok ? 'Exitoso' : 'Fallido' });
  }

  discard(): void { this.a = { ...JSON.parse(this.base) }; if (!this.a.controller) this.a.controller = this.hotel.get().legalName || ''; }

  async save(): Promise<void> {
    if (!this.canEdit || this.error || this.saving) return;
    const before = JSON.parse(this.base) as AuditPolicy;
    const changed = (Object.keys(this.a) as (keyof AuditPolicy)[]).filter(k => this.a[k] !== before[k]);
    this.saving = true;
    try {
      this.users.auditFlags = { logQueries: this.a.logQueries, logExports: this.a.logExports };
      await this.settings.saveAudit({ ...this.a, controller: this.a.controller.trim(), backupKeep: Math.round(+this.a.backupKeep) }, `Cambios: ${changed.join(', ') || 'política guardada'}`);
      this.base = JSON.stringify(this.a);
      this.saved = 'Política guardada en la base de datos. El servidor hará los respaldos automáticos con este horario.';
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.saving = false;
    }
  }

  /** Respaldo real de la base de datos, hecho por el servidor. */
  async backupNow(): Promise<void> {
    this.working = true;
    this.saved = '';
    try {
      const b = await this.settings.backupNow();
      this.saved = `Respaldo creado: ${b.name} (${this.size(b.bytes)}).`;
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.working = false;
      this.refresh();
    }
  }

  download(b: Backup): void {
    this.settings.downloadBackup(b).catch(e => this.loadError = serverMessage(e));
  }
}
