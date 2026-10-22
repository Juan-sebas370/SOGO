import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { ConceptCategory, TaxKind } from './invoice.model';
import { UsersService } from '../users/users.service';
import { HotelService } from '../shared/hotel.service';
import { API_URL } from '../api';

export type TaxConcept = ConceptCategory | 'Alojamiento · extranjero no residente';
export type TaxRuleStatus = 'Activo' | 'Validar con contador' | 'Inactivo';

export interface TaxRule {
  id:        string;
  concept:   TaxConcept;
  kind:      TaxKind;
  rate:      number;            // 0.19 · 0.08 · 0 (exento)
  condition: string;
  status:    TaxRuleStatus;
}

/** Acciones de Facturación. Se autorizan con los permisos del módulo en Usuarios y roles. */
export type BillingAction =
  'Generar factura' | 'Validar datos fiscales' | 'Consultar facturas' | 'Descargar y enviar' |
  'Generar reportes' | 'Anular con nota crédito' | 'Configurar integración';

/** Acción de Facturación → [módulo, permiso] de Usuarios y roles (el servidor exige lo mismo). */
export const ACTION_PERMISSION: Record<BillingAction, [string, 'view' | 'create' | 'edit' | 'delete' | 'export']> = {
  'Consultar facturas':      ['Facturación', 'view'],
  'Generar factura':         ['Facturación', 'create'],
  'Validar datos fiscales':  ['Facturación', 'edit'],
  'Descargar y enviar':      ['Facturación', 'export'],
  'Generar reportes':        ['Facturación', 'export'],
  'Anular con nota crédito': ['Facturación', 'delete'],
  'Configurar integración':  ['Configuración', 'edit'],
};

/** Datos del emisor en facturas y documentos: salen de Configuración › Datos del hospedaje. */
export interface Issuer {
  name: string; legalName: string; nit: string; rnt: string; establishment: string;
  address: string; city: string; phone: string; email: string; website: string; logo: string;
}

export interface BillingConfig {
  provider: {
    name:         string;
    apiUrl:       string;
    environment:  'Habilitación' | 'Producción';
    clientId:     string;
    apiKey:       string;       // solo para escribir una nueva: el servidor nunca la devuelve
    apiKeySet?:   boolean;
    lastResponse: string;
    connected:    boolean;
  };
  resolution: {
    number:       string;
    prefix:       string;
    from:         number;
    to:           number;
    validFrom:    string | null;
    validTo:      string | null;
    technicalKey: string;
    creditPrefix: string;       // prefijo de las notas crédito electrónicas
  };
  taxes: TaxRule[];
  automation: { emailOnAccept: boolean };
  emailSubject: string;
  emailBody:    string;
}

/** Configuración con el emisor (Datos del hospedaje) ya resuelto, para quien la lee. */
export type BillingView = BillingConfig & { issuer: Issuer };

/** Estructura vacía mientras carga o si aún no se ha ejecutado el script 23: nada inventado. */
function empty(): BillingConfig {
  return {
    provider: { name: '', apiUrl: '', environment: 'Habilitación', clientId: '', apiKey: '', apiKeySet: false, lastResponse: '', connected: false },
    resolution: { number: '', prefix: 'FE', from: 1, to: 1, validFrom: null, validTo: null, technicalKey: '', creditPrefix: 'NCE' },
    taxes: [], automation: { emailOnAccept: true }, emailSubject: '', emailBody: '',
  };
}

function merge(v: Partial<BillingConfig> | null): BillingConfig {
  const e = empty();
  return {
    ...e, ...(v ?? {}),
    provider: { ...e.provider, ...(v?.provider ?? {}) },
    resolution: { ...e.resolution, ...(v?.resolution ?? {}) },
    automation: { ...e.automation, ...(v?.automation ?? {}) },
    taxes: v?.taxes ?? [],
  };
}

@Injectable({ providedIn: 'root' })
export class BillingConfigService {

  private readonly base = `${API_URL}/facturacion/config`;
  private config$ = new BehaviorSubject<BillingConfig>(empty());
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient, private users: UsersService, private hotel: HotelService) {}

  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token
        ? firstValueFrom(this.http.get<Partial<BillingConfig> | null>(this.base))
            .then(v => this.config$.next(merge(v)))
            .catch(e => console.error('No se pudo cargar la configuración de facturación', e))
        : Promise.resolve();
    }
    return this.loading;
  }

  /** Configuración + emisor. */
  get(): BillingView { return { ...this.config$.value, issuer: this.issuer }; }
  /** Solo lo que se guarda (para editar). */
  raw(): BillingConfig { return structuredClone(this.config$.value); }
  changes(): Observable<BillingConfig> { return this.config$.asObservable(); }

  get issuer(): Issuer {
    const h = this.hotel.get();
    return {
      name: this.hotel.name, legalName: h.legalName, nit: h.nit, rnt: h.rnt, establishment: h.establishment,
      address: h.address, city: this.hotel.city, phone: this.hotel.phones, email: h.email, website: h.website, logo: this.hotel.logoSrc,
    };
  }

  /** Guarda en el servidor (que valida rango, prefijos y tarifas). */
  async save(config: BillingConfig): Promise<void> {
    const saved = await firstValueFrom(this.http.put<BillingConfig>(this.base, config));
    this.config$.next(merge(saved));
  }

  /** Tarifa aplicable a un concepto. Los no residentes con pasaporte usan la exención de alojamiento. */
  taxFor(category: ConceptCategory, foreignNonResident = false): TaxRule {
    const taxes = this.config$.value.taxes.filter(t => t.status !== 'Inactivo');
    if (category === 'Alojamiento' && foreignNonResident) {
      const exempt = taxes.find(t => t.concept === 'Alojamiento · extranjero no residente');
      if (exempt) return exempt;
    }
    // Sin tarifa configurada: 0 % con aviso (la pantalla de emisión lo muestra como pendiente)
    return taxes.find(t => t.concept === category) ?? taxes.find(t => t.concept === 'Otro')
      ?? { id: '', concept: category, kind: 'IVA', rate: 0, condition: 'Sin tarifa configurada', status: 'Validar con contador' };
  }

  /** ¿El usuario actual puede hacer esta acción? Según sus permisos en Usuarios y roles. */
  can(action: BillingAction): boolean {
    const [module, perm] = ACTION_PERMISSION[action];
    return this.users.can(module as any, perm);
  }

  /** Prueba real de conexión: la hace el servidor contra la URL del proveedor. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const r = await firstValueFrom(this.http.post<{ ok: boolean; message: string; config: BillingConfig }>(`${this.base}/probar`, {}));
    this.config$.next(merge(r.config));
    return { ok: r.ok, message: r.message };
  }

  // ── Estado de la resolución ──

  /** Problemas de la configuración que impiden emitir (vacío = lista). */
  issueBlockers(): string[] {
    const c = this.config$.value, h = this.hotel.get(), today = new Date().toISOString().slice(0, 10);
    const out: string[] = [];
    if (!h.nit.trim()) out.push('Falta el NIT del hospedaje (Configuración › Datos del hospedaje).');
    if (!c.resolution.number.trim()) out.push('Falta el número de la resolución de facturación DIAN.');
    if (!c.resolution.validFrom || !c.resolution.validTo) out.push('Falta la vigencia de la resolución.');
    else if (today < c.resolution.validFrom || today > c.resolution.validTo) out.push('La resolución de facturación no está vigente.');
    if (!c.taxes.some(t => t.status !== 'Inactivo')) out.push('No hay tarifas de impuestos configuradas.');
    return out;
  }
}
