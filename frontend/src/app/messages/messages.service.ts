import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';

export type MessageStatus = 'nuevo' | 'leido' | 'respondido' | 'archivado';
export type Channel = 'Correo' | 'WhatsApp' | 'Llamada';
export type Category = 'reserva' | 'servicio' | 'precio' | 'evento' | 'queja' | 'sugerencia' | 'otro';

export interface Reply { channel: Channel; text: string; by: string; at: string; }

/** Mensaje del formulario de Contacto de la página web (tabla `contactos`). */
export interface ContactMessage {
  id:         number;
  name:       string;
  email:      string;
  phone:      string;
  subject:    string;
  message:    string;
  category:   string;
  priority:   'baja' | 'normal' | 'alta';
  status:     MessageStatus;
  createdAt:  string;
  readAt:     string;
  readBy:     string;
  answeredAt: string;
  answeredBy: string;
  channel:    string;
  replies:    Reply[];
}

export interface QuickReply { id?: number; title: string; category: Category; text: string; active: boolean; uses?: number; updatedAt?: string; updatedBy?: string; }

/** Lo que eligió la persona en el formulario de la web → nombre para mostrar. */
export const CATEGORY_LABEL: Record<string, string> = {
  reserva: 'Reserva', servicio: 'Servicios', precio: 'Precios y tarifas', evento: 'Eventos', queja: 'Queja', sugerencia: 'Sugerencia', otro: 'Otro',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
export const STATUS_LABEL: Record<MessageStatus, string> = { nuevo: 'Nuevo', leido: 'Leído', respondido: 'Respondido', archivado: 'Archivado' };
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? (c ? c[0].toUpperCase() + c.slice(1) : 'Sin asunto');

/** Número para WhatsApp (solo dígitos, con indicativo; un celular colombiano sin indicativo lleva 57). */
export function whatsappNumber(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  return /^3\d{9}$/.test(d) ? `57${d}` : d;
}

/** Reemplaza {nombre} y {asunto} en el texto de una respuesta rápida. */
export function fillTemplate(text: string, m: Pick<ContactMessage, 'name' | 'subject' | 'category'>): string {
  const first = (m.name || '').trim().split(/\s+/)[0] || '';
  return text.replace(/\{nombre\}/g, first).replace(/\{asunto\}/g, m.subject ? categoryLabel(m.subject).toLowerCase() : categoryLabel(m.category).toLowerCase());
}

/** Mensajes de la página web y respuestas rápidas, desde la base de datos. */
@Injectable({ providedIn: 'root' })
export class MessagesService {
  private readonly base = `${API_URL}/mensajes`;
  readonly messages$ = new BehaviorSubject<ContactMessage[]>([]);
  readonly templates$ = new BehaviorSubject<QuickReply[]>([]);
  /** Mensajes nuevos sin leer (el número que se ve en el menú). */
  readonly unread$ = new BehaviorSubject<number>(0);
  loadError = '';

  constructor(private http: HttpClient, private users: UsersService) {}

  get canView(): boolean { return this.users.can('Mensajes', 'view'); }
  get canReply(): boolean { return this.users.can('Mensajes', 'edit'); }
  get canCreate(): boolean { return this.users.can('Mensajes', 'create'); }
  get canDelete(): boolean { return this.users.can('Mensajes', 'delete'); }

  async load(): Promise<void> {
    try {
      const [messages, templates] = await Promise.all([
        firstValueFrom(this.http.get<ContactMessage[]>(this.base)),
        firstValueFrom(this.http.get<QuickReply[]>(`${this.base}/plantillas`)),
      ]);
      this.messages$.next(messages);
      this.templates$.next(templates);
      this.unread$.next(messages.filter(m => m.status === 'nuevo').length);
      this.loadError = '';
    } catch (e: any) {
      console.error('No se pudieron cargar los mensajes', e);
      this.loadError = e?.status === 403 ? 'Tu rol no tiene permiso para ver Mensajes.'
        : `No se pudieron cargar los mensajes${e?.error?.message ? ': ' + e.error.message : ''}. Verifica que se ejecutó el script 17_mensajes.sql.`;
    }
  }

  /** Solo el número de nuevos (para el menú, cada pocos minutos). */
  async refreshUnread(): Promise<void> {
    if (!this.canView || !localStorage.getItem('sogo_token')) return;
    try {
      const r = await firstValueFrom(this.http.get<{ count: number }>(`${this.base}/nuevos`));
      this.unread$.next(r.count);
    } catch { /* sin conexión o sin el script: el menú no muestra el número */ }
  }

  private replace(m: ContactMessage): ContactMessage {
    const list = this.messages$.value.map(x => x.id === m.id ? m : x);
    this.messages$.next(list);
    this.unread$.next(list.filter(x => x.status === 'nuevo').length);
    return m;
  }

  async markRead(id: number): Promise<ContactMessage> {
    return this.replace(await firstValueFrom(this.http.post<ContactMessage>(`${this.base}/${id}/leido`, {})));
  }

  async update(id: number, changes: { status?: MessageStatus; priority?: string }): Promise<ContactMessage> {
    const m = this.replace(await firstValueFrom(this.http.put<ContactMessage>(`${this.base}/${id}`, changes)));
    this.users.addLog('Mensajes: mensaje actualizado', `#${id} · ${m.name}${changes.status ? ' · ' + STATUS_LABEL[changes.status] : ''}${changes.priority ? ' · prioridad ' + changes.priority : ''}`);
    return m;
  }

  async reply(id: number, channel: Channel, text: string, templateId?: number): Promise<ContactMessage> {
    const m = this.replace(await firstValueFrom(this.http.post<ContactMessage>(`${this.base}/${id}/responder`, { channel, text, templateId: templateId ?? null })));
    this.users.addLog('Mensajes: mensaje respondido', `#${id} · ${m.name} · ${channel}`);
    if (templateId) this.templates$.next(this.templates$.value.map(t => t.id === templateId ? { ...t, uses: (t.uses ?? 0) + 1 } : t));
    return m;
  }

  async saveTemplate(t: QuickReply): Promise<void> {
    await firstValueFrom(this.http.put<QuickReply>(`${this.base}/plantillas`, t));
    this.templates$.next(await firstValueFrom(this.http.get<QuickReply[]>(`${this.base}/plantillas`)));
    this.users.addLog('Mensajes: respuesta rápida', `${t.id ? 'Editada' : 'Creada'} · ${t.title}`);
  }

  async deleteTemplate(t: QuickReply): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/plantillas/${t.id}`));
    this.templates$.next(this.templates$.value.filter(x => x.id !== t.id));
    this.users.addLog('Mensajes: respuesta rápida', `Eliminada · ${t.title}`);
  }
}
