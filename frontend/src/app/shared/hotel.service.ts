import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { setLetterhead } from './documents';

/** Datos del hospedaje (configuracion 'hospedaje'): los usan Facturación, Contabilidad, Nómina, TRA y Reportes. */
export interface HotelProfile {
  commercialName: string; legalName: string; nit: string; rnt: string; establishment: string;
  address: string; municipality: string; phone: string; mobile: string; email: string; website: string;
  logo: { dataUrl: string; name: string; width: number; height: number } | null;
  currency: string; timezone: string; dateFormat: string; language: string; thousands: string; weekStart: string;
}

/** Logo del hospedaje (monograma HS, blanco: va sobre fondo azul) cuando no se ha subido otro. */
export const DEFAULT_LOGO = 'assets/brand/hospedaje-logo.png';

/** Estructura vacía mientras carga o si aún no se ha ejecutado el script 23. */
function empty(): HotelProfile {
  return {
    commercialName: '', legalName: '', nit: '', rnt: '', establishment: 'Vivienda turística',
    address: '', municipality: '', phone: '', mobile: '', email: '', website: '', logo: null,
    currency: 'Peso colombiano (COP)', timezone: 'America/Bogota (UTC-5)', dateFormat: 'dd/mm/aaaa', language: 'Español',
    thousands: 'Punto · $ 1.234.567', weekStart: 'Lunes',
  };
}

@Injectable({ providedIn: 'root' })
export class HotelService {

  private readonly url = `${API_URL}/configuracion/hospedaje`;
  private profile$ = new BehaviorSubject<HotelProfile>(empty());
  private loading?: Promise<void>;
  private loadedFor = '';

  constructor(private http: HttpClient) {
    // Membrete de todos los documentos impresos: se actualiza con cada cambio de los datos
    this.profile$.subscribe(() => setLetterhead({
      name: this.name, legalName: this.get().legalName, nit: this.get().nit, rnt: this.get().rnt,
      address: this.get().address, city: this.city, phones: this.phones, email: this.get().email, logo: this.logoSrc,
    }));
  }

  /** Primera carga de la sesión (el guard del dashboard la espera). */
  ready(): Promise<void> {
    const token = localStorage.getItem('sogo_token') || '';
    if (!this.loading || token !== this.loadedFor) {
      this.loadedFor = token;
      this.loading = token
        ? firstValueFrom(this.http.get<Partial<HotelProfile> | null>(this.url))
            .then(v => this.profile$.next({ ...empty(), ...(v ?? {}) }))
            .catch(e => console.error('No se pudieron cargar los datos del hospedaje', e))
        : Promise.resolve();
    }
    return this.loading;
  }

  get(): HotelProfile { return this.profile$.value; }
  changes(): Observable<HotelProfile> { return this.profile$.asObservable(); }

  async save(h: HotelProfile): Promise<void> {
    const saved = await firstValueFrom(this.http.put<HotelProfile>(this.url, h));
    this.profile$.next({ ...empty(), ...saved });
  }

  /** Nombre que encabeza facturas y reportes. */
  get name(): string { const h = this.get(); return h.commercialName || h.legalName || 'Hospedaje'; }
  /** Municipio y departamento ("Filandia, Quindío"), sin el país. */
  get city(): string { return this.get().municipality.split('·')[0].trim(); }
  get logoSrc(): string { return this.get().logo?.dataUrl || DEFAULT_LOGO; }
  /** Teléfonos de contacto en una línea. */
  get phones(): string { const h = this.get(); return [h.phone, h.mobile].filter(Boolean).join(' · '); }
}
