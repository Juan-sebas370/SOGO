import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConceptCategory, TaxKind } from './invoice.model';
import { isoDate, isoDateTime } from '../shared/date-utils';

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

export type BillingAction =
  'Generar factura' | 'Validar datos fiscales' | 'Consultar facturas' | 'Descargar y enviar' |
  'Generar reportes' | 'Anular con nota crédito' | 'Configurar integración';

export type PermissionRole = 'Admin' | 'Recep.' | 'Contador';

export interface BillingConfig {
  issuer: {
    name:    string;
    nit:     string;
    rnt:     string;
    address: string;
    city:    string;
    phone:   string;
    email:   string;
  };
  provider: {
    name:         string;
    apiUrl:       string;
    environment:  'Habilitación' | 'Producción';
    clientId:     string;
    apiKey:       string;
    lastResponse: string;
    connected:    boolean;
  };
  resolution: {
    number:    string;
    prefix:    string;
    from:      number;
    to:        number;
    validFrom: string;
    validTo:   string;
  };
  taxes: TaxRule[];
  automation: {
    sendOnIssue:   boolean;
    emailOnAccept: boolean;
    retry:         boolean;
  };
  emailSubject: string;
  emailBody:    string;
  permissions:  Record<BillingAction, Record<PermissionRole, boolean>>;
}

export const BILLING_ACTIONS: BillingAction[] = [
  'Generar factura', 'Validar datos fiscales', 'Consultar facturas', 'Descargar y enviar',
  'Generar reportes', 'Anular con nota crédito', 'Configurar integración',
];
export const PERMISSION_ROLES: PermissionRole[] = ['Admin', 'Recep.', 'Contador'];

// Rol del sistema → columna de la matriz de permisos. Gerente usa los permisos de Admin.
const ROLE_COLUMN: Record<string, PermissionRole> = {
  'Administrador': 'Admin', 'Gerente': 'Admin', 'Recepcionista': 'Recep.', 'Contador': 'Contador',
};

const all = (admin: boolean, recep: boolean, contador: boolean) => ({ 'Admin': admin, 'Recep.': recep, 'Contador': contador });

function defaults(): BillingConfig {
  return {
    // Los datos reales del emisor y del proveedor van donde hay corchetes
    issuer: {
      name: 'Hospedaje Sebastián', nit: '[NIT del emisor]', rnt: '[N.º RNT]',
      address: '[Dirección]', city: 'Filandia, Quindío', phone: '[Teléfono]', email: '[Correo]',
    },
    provider: {
      name: '[Proveedor autorizado]', apiUrl: '[URL del proveedor]', environment: 'Producción',
      clientId: '[ID de cliente]', apiKey: 'sk_live_4f8a2c9e0b7d1a3f9C1D',
      lastResponse: `${isoDate(0)}T08:00 · Conexión correcta`, connected: true,
    },
    resolution: {
      number: '[N.º de resolución]', prefix: 'FE', from: 1001, to: 5000,
      validFrom: isoDate(-180), validTo: isoDate(550),
    },
    taxes: [
      { id: 't1', concept: 'Alojamiento', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
      { id: 't2', concept: 'Alojamiento · extranjero no residente', kind: 'IVA', rate: 0, condition: 'Pasaporte y sin residencia en Colombia', status: 'Validar con contador' },
      { id: 't3', concept: 'Restaurante', kind: 'INC', rate: 0.08, condition: 'Impuesto al consumo', status: 'Activo' },
      { id: 't4', concept: 'Minibar', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
      { id: 't5', concept: 'Eventos y pasadías', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
      { id: 't6', concept: 'Lavandería', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
      { id: 't7', concept: 'Otro', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
    ],
    automation: { sendOnIssue: true, emailOnAccept: true, retry: true },
    emailSubject: 'Factura electrónica {número} · Hospedaje Sebastián',
    emailBody: 'Hola {huésped}, gracias por hospedarte con nosotros en Filandia. Adjuntamos la factura electrónica {número} correspondiente a tu estadía del {fechas}. Cualquier inquietud, responde a este correo.',
    permissions: {
      'Generar factura':         all(true, true, true),
      'Validar datos fiscales':  all(true, true, true),
      'Consultar facturas':      all(true, true, true),
      'Descargar y enviar':      all(true, true, true),
      'Generar reportes':        all(true, false, true),
      'Anular con nota crédito': all(true, false, true),
      'Configurar integración':  all(true, false, false),
    },
  };
}

@Injectable({ providedIn: 'root' })
export class BillingConfigService {

  private config$ = new BehaviorSubject<BillingConfig>(defaults());

  get(): BillingConfig { return this.config$.value; }
  changes(): Observable<BillingConfig> { return this.config$.asObservable(); }

  save(config: BillingConfig): void {
    this.config$.next(structuredClone(config));
  }

  /** Tarifa aplicable a un concepto. Los no residentes con pasaporte usan la exención de alojamiento. */
  taxFor(category: ConceptCategory, foreignNonResident = false): TaxRule {
    const taxes = this.get().taxes.filter(t => t.status !== 'Inactivo');
    if (category === 'Alojamiento' && foreignNonResident) {
      const exempt = taxes.find(t => t.concept === 'Alojamiento · extranjero no residente');
      if (exempt) return exempt;
    }
    return taxes.find(t => t.concept === category) ?? taxes.find(t => t.concept === 'Otro')!;
  }

  /** ¿El usuario actual puede hacer esta acción? Según la matriz de permisos por rol. */
  can(action: BillingAction): boolean {
    const column = ROLE_COLUMN[localStorage.getItem('sogo_role') ?? ''];
    return !!column && this.get().permissions[action][column];
  }

  /**
   * Prueba de conexión con el proveedor. Sin backend todavía: se simula la
   * respuesta; aquí es donde el servidor llamará al proveedor real.
   */
  testConnection(): Promise<{ ok: boolean; message: string }> {
    return new Promise(resolve => setTimeout(() => {
      const c = this.get();
      const ok = !!c.provider.clientId.trim() && !!c.provider.apiKey.trim() && !!c.provider.apiUrl.trim();
      const message = ok ? 'Conexión correcta' : 'Faltan credenciales';
      this.save({ ...c, provider: { ...c.provider, connected: ok, lastResponse: `${isoDateTime()} · ${message}` } });
      resolve({ ok, message });
    }, 900));
  }
}
