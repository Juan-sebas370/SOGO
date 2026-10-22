import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api';

/** Estado del correo de SOGO: la cuenta de Gmail de backend/correo.local.properties (la clave nunca llega aquí). */
export interface MailStatus {
  configured: boolean;
  account:    string;
  host:       string;
  sender:     string;   // nombre que ve quien recibe (Datos del hospedaje)
  missing:    string;   // qué falta para poder enviar
  lastError:  string;   // motivo del último envío fallido
}

/** Un aviso de alerta enviado por correo (lo registra el servidor). */
export interface AlertMailLog { at: string; key: string; label: string; count: number; summary: string; sentTo: string[]; failed: string[]; }
export interface AlertMailHistory { log: AlertMailLog[]; dailyAt: string; mailReady: boolean; }

@Injectable({ providedIn: 'root' })
export class MailService {
  constructor(private http: HttpClient) {}

  status(): Promise<MailStatus> {
    return firstValueFrom(this.http.get<MailStatus>(`${API_URL}/correo/estado`));
  }

  /** Últimos avisos de alertas enviados por correo. */
  alertHistory(): Promise<AlertMailHistory> {
    return firstValueFrom(this.http.get<AlertMailHistory>(`${API_URL}/correo/alertas`));
  }

  /** Revisa las alertas ya en el servidor y envía lo pendiente. */
  checkAlerts(): Promise<AlertMailHistory> {
    return firstValueFrom(this.http.post<AlertMailHistory>(`${API_URL}/correo/alertas/revisar`, {}));
  }

  /** Envía un correo real de prueba desde el servidor. */
  test(to: string): Promise<void> {
    return firstValueFrom(this.http.post(`${API_URL}/correo/prueba`, { to })).then(() => undefined);
  }
}
