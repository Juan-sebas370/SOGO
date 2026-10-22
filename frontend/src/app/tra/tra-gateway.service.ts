import { Injectable } from '@angular/core';

export interface GatewayResult {
  httpStatus: number;
  requestId:  string;
  mincitId?:  string;          // solo /one/: ID del registro que usan los /two/
  message:    string;
  durationMs: number;
}

// Integración PMS → MinCIT. Arquitectura: Angular envía los datos del huésped
// → Spring Boot agrega el token (secreto TRA_TOKEN) → MinCIT. El token nunca
// llega al navegador.
//
// El contrato exacto de /one/ y /two/ (headers, JSON, códigos de error) está
// pendiente del manual técnico PMS vigente, así que el backend aún no expone
// estos endpoints. Mientras tanto NO se simula: cada intento responde que el
// envío automático no está habilitado, la TRA queda en ERROR (nunca «reportada»
// sin serlo) y se registra a mano el número que da la plataforma del MinCIT.
// Al implementarlos, solo cambia este archivo (HttpClient contra /api/tra/...).
@Injectable({ providedIn: 'root' })
export class TraGatewayService {

  /** POST /one/ · huésped principal. Devolvería el ID del registro TRA. */
  sendPrincipal(): Promise<GatewayResult> { return this.notEnabled(); }

  /** POST /two/ · un acompañante, con el ID que devolvió /one/. */
  sendCompanion(_mincitId: string): Promise<GatewayResult> { return this.notEnabled(); }

  /** "Probar conexión": el backend verificaría el token contra MinCIT. */
  testConnection(): Promise<GatewayResult> { return this.notEnabled(); }

  private notEnabled(): Promise<GatewayResult> {
    return Promise.resolve({
      httpStatus: 0, requestId: '', durationMs: 0,
      message: 'El envío automático al MinCIT aún no está habilitado en SOGO: reporta la TRA en la plataforma del MinCIT y registra aquí el número asignado.',
    });
  }
}
