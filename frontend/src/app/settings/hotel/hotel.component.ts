import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService, HotelProfile } from '../settings.service';
import { DEFAULT_LOGO } from '../../shared/hotel.service';
import { TraService } from '../../tra/tra.service';
import { UsersService } from '../../users/users.service';
import { nitCheckDigit, EMAIL_RE } from '../../billing/invoice.model';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const placeholder = (v: string) => /^\[.*\]$/.test(v.trim());
export const metaText = (m: { at: string; by: string }) => m.at ? `${m.at.slice(8, 10)}/${m.at.slice(5, 7)}/${m.at.slice(0, 4)}${m.by ? ' · ' + m.by : ''}` : 'sin cambios en esta sesión';

@Component({
  selector: 'app-settings-hotel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../config.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/settings">Configuración</a><span>/</span><span>Datos del hospedaje</span></nav>
  <header class="kit-head">
    <div><h1 class="kit-title">Datos del hospedaje</h1><p class="kit-sub">Información legal y de contacto que aparece en facturas, TRA y reportes.</p></div>
    <div class="cf-head-side">
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!dirty" (click)="discard()">Descartar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!dirty || !!errors.length || !canEdit || saving" (click)="save()">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
      <span class="cf-meta"><span class="cf-dirty" *ngIf="dirty">Cambios sin guardar · </span>Última modificación: {{ meta }}</span>
    </div>
  </header>
  <p class="kit-banner kit-banner--ok" *ngIf="saved">{{ saved }}</p>
  <p class="kit-banner kit-banner--danger" *ngIf="touched && errors.length">{{ errors[0] }}</p>

  <div class="cf-grid">
    <div class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Identificación</h2>
        <div class="cf-fields">
          <label class="cf-field">Nombre comercial *<input class="rsv-input" [(ngModel)]="h.commercialName" maxlength="80" [class.invalid]="!h.commercialName.trim()"></label>
          <label class="cf-field">Razón social / titular *<input class="rsv-input" [(ngModel)]="h.legalName" maxlength="80" [class.invalid]="!h.legalName.trim()"></label>
        </div>
        <div class="cf-fields cf-fields--3 cf-mt">
          <label class="cf-field">NIT *<input class="rsv-input" [(ngModel)]="h.nit" maxlength="20" placeholder="900123456-7" [class.invalid]="!!nitError">
            <small class="err" *ngIf="nitError">{{ nitError }}</small><small *ngIf="!nitError && pendingNit">Pendiente: escribe el NIT con dígito de verificación.</small></label>
          <label class="cf-field">Registro Nacional de Turismo (RNT) *<input class="rsv-input" [(ngModel)]="h.rnt" maxlength="20" [class.invalid]="!h.rnt.trim()">
            <small>Obligatorio para vivienda turística; se usa en la TRA.</small></label>
          <label class="cf-field">Tipo de establecimiento<select class="rsv-input" [(ngModel)]="h.establishment">
            <option>Vivienda turística</option><option>Hotel</option><option>Hostal</option><option>Apartahotel</option><option>Finca turística</option><option>Glamping</option></select></label>
        </div>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Ubicación y contacto</h2>
        <div class="cf-fields">
          <label class="cf-field">Dirección *<input class="rsv-input" [(ngModel)]="h.address" maxlength="120" [class.invalid]="!h.address.trim()"></label>
          <label class="cf-field">Municipio<input class="rsv-input" [(ngModel)]="h.municipality" maxlength="80"></label>
        </div>
        <div class="cf-fields cf-fields--3 cf-mt">
          <label class="cf-field">Teléfono principal<input class="rsv-input" [(ngModel)]="h.phone" maxlength="20" inputmode="tel"></label>
          <label class="cf-field">Celular / WhatsApp<input class="rsv-input" [(ngModel)]="h.mobile" maxlength="20" inputmode="tel"></label>
          <label class="cf-field">Correo de contacto<input class="rsv-input" type="email" [(ngModel)]="h.email" maxlength="80" [class.invalid]="!!emailError"><small class="err" *ngIf="emailError">{{ emailError }}</small></label>
          <label class="cf-field">Sitio web<input class="rsv-input" [(ngModel)]="h.website" maxlength="120" placeholder="https://" [class.invalid]="!!webError"><small class="err" *ngIf="webError">{{ webError }}</small></label>
        </div>
      </section>

      <section class="kit-card">
        <h2 class="kit-card-title">Preferencias regionales</h2>
        <div class="cf-fields cf-fields--3">
          <label class="cf-field">Moneda<select class="rsv-input" [(ngModel)]="h.currency"><option>Peso colombiano (COP)</option></select></label>
          <label class="cf-field">Zona horaria<select class="rsv-input" [(ngModel)]="h.timezone"><option>America/Bogota (UTC-5)</option></select></label>
          <label class="cf-field">Formato de fecha<select class="rsv-input" [(ngModel)]="h.dateFormat"><option>dd/mm/aaaa</option></select></label>
          <label class="cf-field">Idioma del sistema<select class="rsv-input" [(ngModel)]="h.language"><option>Español</option></select></label>
          <label class="cf-field">Separador de miles<select class="rsv-input" [(ngModel)]="h.thousands"><option>Punto · $ 1.234.567</option></select></label>
          <label class="cf-field">Primer día de la semana<select class="rsv-input" [(ngModel)]="h.weekStart"><option>Lunes</option><option>Domingo</option></select></label>
        </div>
        <p class="cf-note">SOGO trabaja en pesos colombianos, hora de Bogotá y formato colombiano; por ahora son las únicas opciones disponibles.</p>
      </section>
    </div>

    <aside class="cf-col">
      <section class="kit-card">
        <h2 class="kit-card-title">Logo</h2>
        <div class="ho-drop" (dragover)="$event.preventDefault()" (drop)="drop($event)">
          <span class="ho-mark"><img [src]="logoSrc" alt="Logo del hospedaje"></span>
          <small>{{ h.logo ? h.logo.name + ' · ' + h.logo.width + ' × ' + h.logo.height : 'Logo del hospedaje (monograma HS de la página web)' }}</small>
        </div>
        <div class="ho-btns">
          <label class="rsv-btn rsv-btn--outline ho-file">Cambiar<input type="file" accept="image/png,image/svg+xml" (change)="pick($event)"></label>
          <button type="button" class="rsv-btn rsv-btn--danger-outline" [disabled]="!h.logo" (click)="h.logo = null">Usar el de la web</button>
        </div>
        <p class="cf-note">PNG o SVG con fondo transparente, máximo 1 MB. Se muestra sobre fondo azul: un logo claro se ve mejor.</p>
        <p class="kit-error" *ngIf="logoError">{{ logoError }}</p>
      </section>
      <section class="kit-card ho-preview">
        <p class="cf-meta">Así se verá en facturas y reportes</p>
        <div class="ho-card">
          <span class="ho-mark ho-mark--sm"><img [src]="logoSrc" alt=""></span>
          <div><strong>{{ h.commercialName || 'Nombre comercial' }}</strong>
            <small>NIT {{ h.nit || '—' }} · RNT {{ h.rnt || '—' }}</small><small>{{ h.address || '—' }} · {{ city }}</small>
            <small>{{ [h.phone, h.mobile].filter(nonEmpty).join(' · ') }}{{ h.email ? ' · ' + h.email : '' }}</small></div>
        </div>
      </section>
      <p class="kit-card cf-note ho-uses">Se guardan en la base de datos y se usan en: Facturación (emisor y logo de la factura), Contabilidad (comprobantes), Nómina (desprendibles), TRA (prestador y RNT), Reportes y exportaciones. Cualquier cambio queda en auditoría.</p>
    </aside>
  </div>
  `,
  styles: [`
    .cf-mt { margin-top: 12px; }
    .ho-drop { border: 2px dashed #C9D3E0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; background: #FAFBFD; }
    .ho-drop img { max-width: 120px; max-height: 80px; object-fit: contain; }
    .ho-drop small { font-size: 11.5px; color: #6B7280; }
    .ho-mark { width: 72px; height: 72px; border-radius: 12px; background: #0A3D6D; display: flex; align-items: center; justify-content: center; }
    .ho-mark img { width: 56px; height: 56px; object-fit: contain; }
    .ho-mark--sm { width: 46px; height: 46px; flex-shrink: 0; }
    .ho-mark--sm img { width: 34px; height: 34px; }
    .ho-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .ho-file { position: relative; justify-content: center; cursor: pointer; }
    .ho-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .ho-preview { padding: 0; overflow: hidden; }
    .ho-preview .cf-meta { display: block; padding: 10px 16px; background: #F6F8FB; margin: 0; }
    .ho-card { display: flex; gap: 12px; align-items: center; padding: 14px 16px; }
    .ho-card img { max-width: 42px; max-height: 42px; }
    .ho-card strong { display: block; font-size: 13px; color: #0A2540; }
    .ho-card small { display: block; font-size: 11.5px; color: #6B7280; }
    .ho-uses { margin: 0; }
  `],
})
export class HotelComponent {
  h: HotelProfile;
  private base: HotelProfile;
  touched = false;
  saved = '';
  logoError = '';

  saving = false;
  readonly nonEmpty = (v: string) => !!v;

  constructor(private settings: SettingsService, private tra: TraService, private users: UsersService) {
    this.base = clone(settings.hotel);
    this.h = clone(this.base);
  }

  get logoSrc(): string { return this.h.logo?.dataUrl || DEFAULT_LOGO; }

  get canEdit(): boolean { return this.users.can('Configuración', 'edit'); }
  get meta(): string { return metaText(this.settings.meta.hotel); }
  get dirty(): boolean { return JSON.stringify(this.h) !== JSON.stringify(this.base); }
  get initials(): string { return this.h.commercialName.split(/\s+/).filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'HS'; }
  get city(): string { return this.h.municipality.split('·')[0].trim(); }
  get pendingNit(): boolean { return placeholder(this.h.nit); }

  get nitError(): string {
    const v = this.h.nit.trim();
    if (!v) return 'El NIT es obligatorio.';
    if (placeholder(v)) return '';
    const m = v.replace(/[.\s]/g, '').match(/^(\d{6,10})-?(\d)$/);
    if (!m) return 'Escribe el NIT con su dígito de verificación: 900123456-7.';
    return nitCheckDigit(m[1]) === m[2] ? '' : `El dígito de verificación no corresponde (debería ser ${nitCheckDigit(m[1])}).`;
  }
  get emailError(): string { const e = this.h.email.trim(); return e && !placeholder(e) && !EMAIL_RE.test(e) ? 'Correo no válido.' : ''; }
  get webError(): string { const w = this.h.website.trim(); return w && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(w) ? 'Escribe la dirección completa, con https://' : ''; }
  get errors(): string[] {
    const e: string[] = [];
    if (!this.h.commercialName.trim()) e.push('El nombre comercial es obligatorio.');
    if (!this.h.legalName.trim()) e.push('La razón social o titular es obligatoria.');
    if (this.nitError) e.push(this.nitError);
    if (!this.h.rnt.trim()) e.push('El RNT es obligatorio para vivienda turística.');
    if (!this.h.address.trim()) e.push('La dirección es obligatoria.');
    if (this.emailError) e.push(this.emailError);
    if (this.webError) e.push(this.webError);
    return e;
  }

  discard(): void { this.h = clone(this.base); this.touched = false; this.logoError = ''; }

  pick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.load(file);
  }
  drop(ev: DragEvent): void { ev.preventDefault(); const f = ev.dataTransfer?.files?.[0]; if (f) this.load(f); }

  private load(file: File): void {
    this.logoError = '';
    if (!['image/png', 'image/svg+xml'].includes(file.type)) { this.logoError = 'Solo PNG o SVG.'; return; }
    if (file.size > 1024 * 1024) { this.logoError = `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es 1 MB.`; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => this.h.logo = { dataUrl, name: file.name, width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      img.onerror = () => this.logoError = 'No se pudo leer la imagen.';
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async save(): Promise<void> {
    this.touched = true;
    if (this.errors.length || !this.canEdit || this.saving) return;
    const h = this.h;
    const changed = (Object.keys(h) as (keyof HotelProfile)[]).filter(k => JSON.stringify(h[k]) !== JSON.stringify(this.base[k]));
    this.saving = true;
    try {
      await this.settings.saveHotel(h, `Campos: ${changed.join(', ')}`);
      // TRA: prestador, RNT y ubicación (Facturación, Contabilidad y Nómina leen estos datos directamente)
      const [municipality, department] = this.city.split(',').map(x => x.trim());
      this.tra.updateSettings({ rnt: h.rnt, provider: h.commercialName, providerType: h.establishment, address: h.address, phone: h.phone, email: h.email, website: h.website,
        ...(municipality ? { municipality } : {}), ...(department ? { department } : {}) });
      this.base = clone(h);
      this.saved = 'Datos guardados en la base de datos. Ya se usan en Facturación, Contabilidad, Nómina, TRA y Reportes.';
      this.touched = false;
    } catch {
      // El aviso de error lo muestra el interceptor
    } finally {
      this.saving = false;
    }
  }
}
