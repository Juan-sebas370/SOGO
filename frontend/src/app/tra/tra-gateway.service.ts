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
// estos endpoints: este servicio simula sus respuestas. Al implementarlos, solo
// cambia este archivo (HttpClient contra /api/tra/...).
@Injectable({ providedIn: 'root' })
export class TraGatewayService {

  private seq = 0;
  private nextMincitId = 458_400;

  /** POST /one/ · huésped principal. Devuelve el ID del registro TRA. */
  sendPrincipal(): Promise<GatewayResult> {
    return this.respond(() => ({ mincitId: `TRA-${this.nextMincitId++}` }));
  }

  /** POST /two/ · un acompañante, con el ID que devolvió /one/. */
  sendCompanion(_mincitId: string): Promise<GatewayResult> {
    return this.respond(() => ({}));
  }

  /** "Probar conexión": el backend verifica el token contra MinCIT. */
  testConnection(): Promise<GatewayResult> {
    return this.respond(() => ({}));
  }

  private respond(extra: () => Partial<GatewayResult>): Promise<GatewayResult> {
    const durationMs = 300 + Math.round(Math.random() * 300);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const requestId = `req-${pad(now.getDate())}${pad(now.getMonth() + 1)}${pad(now.getHours())}${pad(now.getMinutes())}-${String(++this.seq).padStart(4, '0')}`;
    return new Promise(resolve => setTimeout(
      () => resolve({ httpStatus: 200, requestId, message: 'OK', durationMs, ...extra() }),
      durationMs,
    ));
  }
}
