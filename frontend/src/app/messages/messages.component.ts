import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  MessagesService, ContactMessage, QuickReply, MessageStatus, Channel,
  CATEGORIES, STATUS_LABEL, categoryLabel, fillTemplate, whatsappNumber,
} from './messages.service';

type Tab = 'inbox' | 'templates';
type Filter = 'pendientes' | MessageStatus | 'todos';

const dmyHm = (iso: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}` : '';

/**
 * Mensajes que llegan por el formulario de Contacto de la página web. Se leen, se responden por
 * WhatsApp o por correo (SOGO abre el mensaje ya escrito) y la respuesta queda en la base de datos.
 */
@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../shared/styles/page-kit.css', '../shared/styles/kit.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard">Inicio</a><span>/</span><span>Mensajes</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Mensajes de la página web</h1>
      <p class="kit-sub">Preguntas que llegan por el formulario de Contacto. Respóndelas por WhatsApp o por correo; la respuesta queda registrada.</p>
    </div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="reload()" [disabled]="loading">{{ loading ? 'Actualizando…' : 'Actualizar' }}</button>
  </header>

  <div class="kit-banner kit-banner--danger" *ngIf="svc.loadError" role="alert"><div>{{ svc.loadError }}</div></div>
  <div class="kit-banner kit-banner--danger" *ngIf="error" role="alert"><div>{{ error }}</div></div>
  <div class="kit-banner kit-banner--ok" *ngIf="done" role="status"><div>{{ done }}</div></div>

  <section class="kit-kpis msg-kpis">
    <div class="kit-kpi msg-kpi-main"><div><span>Nuevos</span><strong>{{ count('nuevo') }}</strong><small>Sin leer</small></div></div>
    <div class="kit-kpi"><div><span>Por responder</span><strong>{{ count('nuevo') + count('leido') }}</strong><small>Nuevos y leídos</small></div></div>
    <div class="kit-kpi"><div><span>Respondidos este mes</span><strong>{{ answeredThisMonth }}</strong><small>De {{ receivedThisMonth }} recibidos</small></div></div>
    <div class="kit-kpi"><div><span>Tiempo de respuesta</span><strong>{{ avgResponse }}</strong><small>Promedio de los respondidos</small></div></div>
  </section>

  <div class="msg-tabs" role="tablist">
    <button type="button" role="tab" [class.active]="tab === 'inbox'" (click)="tab = 'inbox'">Bandeja <span>{{ all.length }}</span></button>
    <button type="button" role="tab" [class.active]="tab === 'templates'" (click)="tab = 'templates'">Respuestas rápidas <span>{{ templates.length }}</span></button>
  </div>

  <!-- ── Bandeja ── -->
  <ng-container *ngIf="tab === 'inbox'">
    <section class="kit-card msg-filters">
      <div class="kit-chips">
        <button type="button" class="kit-chip" *ngFor="let f of filters" [class.active]="filter === f.id" (click)="filter = f.id; apply()">{{ f.label }} <small>{{ f.count() }}</small></button>
      </div>
      <label class="kit-select"><span>Asunto</span>
        <select [(ngModel)]="category" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let c of categories" [value]="c">{{ label(c) }}</option></select></label>
      <div class="kit-search msg-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" [(ngModel)]="q" (ngModelChange)="apply()" placeholder="Nombre, correo, teléfono o texto…" aria-label="Buscar mensajes"></div>
    </section>

    <div class="msg-layout">
      <section class="kit-card msg-list" aria-label="Mensajes">
        <button type="button" *ngFor="let m of list" class="msg-item" [class.active]="m.id === selected?.id" [class.unread]="m.status === 'nuevo'" (click)="open(m)">
          <div class="msg-item-top">
            <strong>{{ m.name || 'Sin nombre' }}</strong>
            <span class="msg-date">{{ ago(m.createdAt) }}</span>
          </div>
          <div class="msg-item-mid">
            <span class="msg-cat">{{ label(m.category) }}</span>
            <span class="rsv-badge" [ngClass]="badge(m.status)">{{ status[m.status] }}</span>
            <span class="rsv-badge rsv-badge--danger" *ngIf="m.priority === 'alta'">Prioridad alta</span>
          </div>
          <p>{{ m.message }}</p>
        </button>
        <p class="kit-empty" *ngIf="!list.length">No hay mensajes con estos filtros.</p>
      </section>

      <section class="kit-card msg-detail" *ngIf="selected as m; else nothing">
        <div class="msg-detail-head">
          <div>
            <h2>{{ m.name }}</h2>
            <p class="kit-muted">Recibido el {{ dmyHm(m.createdAt) }} · {{ label(m.category) }}{{ m.readBy ? ' · leído por ' + m.readBy : '' }}</p>
          </div>
          <div class="msg-detail-actions">
            <label class="kit-select msg-priority"><span>Prioridad</span>
              <select [ngModel]="m.priority" (ngModelChange)="setPriority(m, $event)" [disabled]="!svc.canReply">
                <option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label>
            <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="m.status !== 'archivado' && svc.canReply" (click)="setStatus(m, 'archivado')">Archivar</button>
            <button type="button" class="rsv-btn rsv-btn--outline" *ngIf="m.status === 'archivado' || m.status === 'respondido'" [disabled]="!svc.canReply"
                    (click)="setStatus(m, 'leido')">Reabrir</button>
          </div>
        </div>

        <div class="msg-contact">
          <a *ngIf="m.email" [href]="'mailto:' + m.email"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>{{ m.email }}</a>
          <span *ngIf="m.phone"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>{{ m.phone }}</span>
          <span class="kit-muted" *ngIf="!m.phone">Sin teléfono: solo se puede responder por correo</span>
        </div>

        <div class="msg-bubble">
          <span class="msg-bubble-subject">Asunto: {{ label(m.subject || m.category) }}</span>
          <p>{{ m.message }}</p>
        </div>

        <div class="msg-history" *ngIf="m.replies.length">
          <h3>Respuestas enviadas</h3>
          <div class="msg-reply" *ngFor="let r of m.replies">
            <div><strong>{{ r.channel }}</strong><span class="kit-muted"> · {{ r.by || 'SOGO' }} · {{ dmyHm(r.at) }}</span></div>
            <p>{{ r.text }}</p>
          </div>
        </div>

        <div class="msg-compose" *ngIf="svc.canReply; else readonly">
          <h3>{{ m.replies.length ? 'Responder de nuevo' : 'Responder' }}</h3>
          <label class="kit-select msg-template"><span>Respuesta rápida</span>
            <select [(ngModel)]="templateId" (ngModelChange)="useTemplate(m)">
              <option [ngValue]="null">Escribir sin plantilla…</option>
              <optgroup *ngIf="suggested(m).length" [label]="'Sugeridas para ' + label(m.category).toLowerCase()">
                <option *ngFor="let t of suggested(m)" [ngValue]="t.id">{{ t.title }}</option></optgroup>
              <optgroup label="Todas">
                <option *ngFor="let t of activeTemplates" [ngValue]="t.id">{{ t.title }} · {{ label(t.category) }}</option></optgroup>
            </select></label>
          <textarea class="rsv-input msg-text" rows="8" [(ngModel)]="text" placeholder="Escribe la respuesta para {{ m.name.split(' ')[0] || 'el cliente' }}…" aria-label="Respuesta"></textarea>
          <p class="msg-warn" *ngIf="pending.length">Completa lo que está entre corchetes antes de enviar: {{ pending.join(', ') }}</p>
          <div class="msg-send">
            <button type="button" class="rsv-btn msg-wa" [disabled]="!canSend || !m.phone || busy" (click)="send(m, 'WhatsApp')">
              <svg viewBox="0 0 24 24"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.3L2 22l4.8-1.2A11 11 0 1 0 20.5 3.5z"/></svg>Enviar por WhatsApp</button>
            <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!canSend || !m.email || busy" (click)="send(m, 'Correo')">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Enviar por correo</button>
            <button type="button" class="rsv-btn rsv-btn--outline" [disabled]="!canSend || busy" (click)="send(m, 'Llamada')">Registrar (respondí por llamada)</button>
          </div>
          <p class="kit-muted msg-help">WhatsApp y correo se abren en otra pestaña con el mensaje ya escrito: revísalo y pulsa enviar allí. SOGO lo deja registrado como respondido.</p>
        </div>
        <ng-template #readonly><p class="kit-muted">Tu rol puede consultar los mensajes, pero no responderlos.</p></ng-template>
      </section>
      <ng-template #nothing><section class="kit-card msg-detail kit-empty">Selecciona un mensaje para leerlo y responderlo.</section></ng-template>
    </div>
  </ng-container>

  <!-- ── Respuestas rápidas ── -->
  <ng-container *ngIf="tab === 'templates'">
    <section class="kit-card" style="margin-bottom: 18px" *ngIf="form as f">
      <h2 class="kit-card-title">{{ f.id ? 'Editar respuesta rápida' : 'Nueva respuesta rápida' }}</h2>
      <div class="msg-form">
        <label class="kit-field">Título *<input class="rsv-input" [(ngModel)]="f.title" maxlength="120" placeholder="Ej.: Políticas de mascotas"></label>
        <label class="kit-field">Asunto *<select class="rsv-input" [(ngModel)]="f.category"><option *ngFor="let c of categories" [value]="c">{{ label(c) }}</option></select></label>
        <label class="kit-field msg-form-active"><span><input type="checkbox" [(ngModel)]="f.active"> Activa</span></label>
      </div>
      <label class="kit-field">Texto *<textarea class="rsv-input" rows="7" [(ngModel)]="f.text"></textarea></label>
      <p class="kit-muted msg-help">Usa <b>{{ '{' }}nombre{{ '}' }}</b> para el nombre del cliente. Lo que pongas entre <b>[corchetes]</b> lo completa quien responde (SOGO avisa si se queda sin llenar).</p>
      <p class="kit-error" *ngIf="formError">{{ formError }}</p>
      <div class="kit-actions">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="form = undefined">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="busy" (click)="saveTemplate()">Guardar</button>
      </div>
    </section>

    <section class="kit-card">
      <div class="msg-tpl-head">
        <h2 class="kit-card-title">Respuestas rápidas</h2>
        <button type="button" class="rsv-btn rsv-btn--primary" *ngIf="svc.canCreate" (click)="newTemplate()">+ Nueva respuesta rápida</button>
      </div>
      <div class="msg-tpls">
        <article class="msg-tpl" *ngFor="let t of templates" [class.off]="!t.active">
          <div class="msg-tpl-top"><strong>{{ t.title }}</strong><span class="msg-cat">{{ label(t.category) }}</span></div>
          <p>{{ t.text }}</p>
          <div class="msg-tpl-foot">
            <span class="kit-muted">{{ t.active ? 'Activa' : 'Inactiva' }} · usada {{ t.uses || 0 }} {{ t.uses === 1 ? 'vez' : 'veces' }}</span>
            <span>
              <button type="button" class="rsv-btn rsv-btn--outline msg-small" *ngIf="svc.canReply" (click)="editTemplate(t)">Editar</button>
              <button type="button" class="rsv-btn rsv-btn--danger-outline msg-small" *ngIf="svc.canDelete" (click)="toDelete = t">Eliminar</button>
            </span>
          </div>
        </article>
      </div>
      <p class="kit-empty" *ngIf="!templates.length">Aún no hay respuestas rápidas.</p>
    </section>
  </ng-container>

  <div class="rsv-modal-overlay" *ngIf="toDelete as d" (click)="toDelete = undefined">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="tpl-del" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="tpl-del">¿Eliminar «{{ d.title }}»?</h2>
      <p class="rsv-modal-desc">Las respuestas ya enviadas con ella se conservan.</p>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="toDelete = undefined">Volver</button>
        <button type="button" class="rsv-btn rsv-btn--danger" [disabled]="busy" (click)="deleteTemplate(d)">Eliminar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .msg-kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .msg-kpi-main { border-color: #0B6FD0; }
    .msg-tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
    .msg-tabs button { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border: none; border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #1F2937; cursor: pointer; }
    .msg-tabs button span { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; background: #EEF1F5; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
    .msg-tabs button.active { background: #0A3D6D; color: #fff; }
    .msg-tabs button.active span { background: #1F5A8E; }
    .msg-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 14px; }
    .msg-filters .kit-chips { flex: 1 1 100%; }
    .msg-filters .kit-select { min-width: 170px; }
    .msg-search { flex: 1; min-width: 220px; }
    .msg-search input { height: 46px; }
    .msg-layout { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .msg-list { padding: 8px; max-height: 72vh; overflow-y: auto; }
    .msg-item { display: block; width: 100%; text-align: left; border: 1px solid transparent; border-radius: 10px; background: none; padding: 10px 12px; margin-bottom: 4px; font: inherit; cursor: pointer; color: #1F2937; }
    .msg-item:hover { background: #F4F7FB; }
    .msg-item.active { background: #EEF5FD; border-color: #0B6FD0; }
    .msg-item.unread strong::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #0B6FD0; margin-right: 6px; vertical-align: middle; }
    .msg-item-top { display: flex; justify-content: space-between; gap: 8px; }
    .msg-item-top strong { font-size: 13.5px; color: #0A2540; }
    .msg-date { font-size: 11px; color: #6B7280; white-space: nowrap; }
    .msg-item-mid { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
    .msg-item p { margin: 0; font-size: 12px; color: #4B5563; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .msg-cat { font-size: 11px; font-weight: 600; color: #0B6FD0; background: #E3EEFF; padding: 2px 8px; border-radius: 6px; }
    .msg-detail { min-height: 300px; }
    .msg-detail-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .msg-detail-head h2 { margin: 0; font-size: 18px; color: #0A2540; }
    .msg-detail-head p { margin: 2px 0 0; font-size: 12px; }
    .msg-detail-actions { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
    .msg-detail-actions .rsv-btn { height: 40px; }
    .msg-priority { min-width: 130px; }
    .msg-contact { display: flex; gap: 18px; flex-wrap: wrap; margin: 12px 0; font-size: 13px; }
    .msg-contact a, .msg-contact span { display: inline-flex; align-items: center; gap: 6px; color: #0A2540; }
    .msg-contact svg { width: 15px; height: 15px; fill: none; stroke: #0B6FD0; stroke-width: 2; }
    .msg-bubble { background: #F4F7FB; border-radius: 12px; padding: 14px 16px; }
    .msg-bubble-subject { font-size: 11.5px; font-weight: 700; color: #0B6FD0; text-transform: uppercase; letter-spacing: .03em; }
    .msg-bubble p { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.55; color: #1F2937; }
    .msg-history, .msg-compose { margin-top: 18px; }
    .msg-history h3, .msg-compose h3 { margin: 0 0 8px; font-size: 13.5px; color: #0A2540; }
    .msg-reply { border-left: 3px solid #16A34A; background: #F3FBF6; border-radius: 0 10px 10px 0; padding: 10px 14px; margin-bottom: 8px; font-size: 12.5px; }
    .msg-reply p { margin: 4px 0 0; white-space: pre-wrap; }
    .msg-template { display: block; margin-bottom: 8px; }
    .msg-text { width: 100%; box-sizing: border-box; resize: vertical; line-height: 1.5; }
    .msg-warn { margin: 6px 0 0; font-size: 12px; color: #B45309; }
    .msg-send { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .msg-send .rsv-btn { height: 42px; display: inline-flex; align-items: center; gap: 8px; }
    .msg-send svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
    .msg-wa { background: #16A34A; color: #fff; border: none; }
    .msg-wa:disabled { opacity: .5; }
    .msg-help { font-size: 11.5px; margin: 8px 0 0; }
    .msg-form { display: grid; grid-template-columns: 2fr 1fr auto; gap: 14px; align-items: end; }
    .msg-form-active { padding-bottom: 12px; }
    .msg-tpl-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .msg-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .msg-tpl { border: 1px solid #E6EBF2; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .msg-tpl.off { opacity: .6; }
    .msg-tpl-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .msg-tpl-top strong { font-size: 13.5px; color: #0A2540; }
    .msg-tpl p { margin: 0; font-size: 12px; color: #4B5563; white-space: pre-wrap; flex: 1; max-height: 150px; overflow: auto; }
    .msg-tpl-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11.5px; }
    .msg-small { height: 30px; padding: 0 10px; font-size: 12px; margin-left: 4px; }
    @media (max-width: 900px) { .msg-layout { grid-template-columns: 1fr; } .msg-list { max-height: 40vh; } .msg-form { grid-template-columns: 1fr; } }
  `],
})
export class MessagesComponent implements OnDestroy {
  readonly categories = CATEGORIES;
  readonly status = STATUS_LABEL;
  readonly label = categoryLabel;
  readonly dmyHm = dmyHm;

  tab: Tab = 'inbox';
  all: ContactMessage[] = [];
  list: ContactMessage[] = [];
  templates: QuickReply[] = [];
  selected?: ContactMessage;
  filter: Filter = 'pendientes';
  category = '';
  q = '';
  text = '';
  templateId: number | null = null;
  loading = false;
  busy = false;
  error = '';
  done = '';
  form?: QuickReply;
  formError = '';
  toDelete?: QuickReply;
  private subs: Subscription[] = [];
  private timer?: ReturnType<typeof setInterval>;

  readonly filters: { id: Filter; label: string; count: () => number }[] = [
    { id: 'pendientes', label: 'Por responder', count: () => this.count('nuevo') + this.count('leido') },
    { id: 'nuevo', label: 'Nuevos', count: () => this.count('nuevo') },
    { id: 'respondido', label: 'Respondidos', count: () => this.count('respondido') },
    { id: 'archivado', label: 'Archivados', count: () => this.count('archivado') },
    { id: 'todos', label: 'Todos', count: () => this.all.length },
  ];

  constructor(public svc: MessagesService, route: ActivatedRoute) {
    const wanted = Number(route.snapshot.queryParamMap.get('id')) || 0;
    this.subs.push(svc.messages$.subscribe(list => {
      this.all = list;
      this.selected = list.find(m => m.id === (this.selected?.id ?? wanted)) ?? this.selected;
      this.apply();
    }));
    this.subs.push(svc.templates$.subscribe(t => this.templates = t));
    this.reload().then(() => { if (wanted) { const m = this.all.find(x => x.id === wanted); if (m) this.open(m); } });
    // Los mensajes nuevos de la web aparecen solos cada minuto
    this.timer = setInterval(() => this.svc.load(), 60_000);
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); if (this.timer) clearInterval(this.timer); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.toDelete = undefined; }

  async reload(): Promise<void> {
    this.loading = true;
    await this.svc.load();
    this.loading = false;
  }

  count(s: MessageStatus): number { return this.all.filter(m => m.status === s).length; }

  get receivedThisMonth(): number { const p = new Date().toISOString().slice(0, 7); return this.all.filter(m => m.createdAt.startsWith(p)).length; }
  get answeredThisMonth(): number { const p = new Date().toISOString().slice(0, 7); return this.all.filter(m => m.answeredAt.startsWith(p)).length; }
  get avgResponse(): string {
    const hours = this.all.filter(m => m.answeredAt && m.createdAt)
      .map(m => (new Date(m.answeredAt).getTime() - new Date(m.createdAt).getTime()) / 36e5).filter(h => h >= 0);
    if (!hours.length) return '—';
    const avg = hours.reduce((s, h) => s + h, 0) / hours.length;
    return avg < 1 ? `${Math.max(1, Math.round(avg * 60))} min` : avg < 48 ? `${avg.toFixed(1).replace('.', ',')} h` : `${Math.round(avg / 24)} días`;
  }

  apply(): void {
    const q = this.q.trim().toLowerCase();
    this.list = this.all.filter(m =>
      (this.filter === 'todos' || (this.filter === 'pendientes' ? m.status === 'nuevo' || m.status === 'leido' : m.status === this.filter))
      && (!this.category || m.category === this.category)
      && (!q || [m.name, m.email, m.phone, m.message, m.subject].some(v => (v || '').toLowerCase().includes(q))));
  }

  badge(s: MessageStatus): string {
    return { nuevo: 'rsv-badge--info', leido: 'rsv-badge--warn', respondido: 'rsv-badge--ok', archivado: 'rsv-badge--muted' }[s];
  }

  ago(iso: string): string {
    if (!iso) return '';
    const min = (Date.now() - new Date(iso).getTime()) / 60000;
    if (min < 60) return `hace ${Math.max(1, Math.round(min))} min`;
    if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  async open(m: ContactMessage): Promise<void> {
    this.selected = m;
    this.text = '';
    this.templateId = null;
    this.error = this.done = '';
    if (m.status === 'nuevo') {
      try { this.selected = await this.svc.markRead(m.id); } catch { /* se marca la próxima vez */ }
    }
  }

  get activeTemplates(): QuickReply[] { return this.templates.filter(t => t.active); }
  suggested(m: ContactMessage): QuickReply[] { return this.activeTemplates.filter(t => t.category === m.category); }

  useTemplate(m: ContactMessage): void {
    const t = this.templates.find(x => x.id === this.templateId);
    if (t) this.text = fillTemplate(t.text, m);
  }

  /** Partes de la plantilla sin completar: [fecha], [valor]... */
  get pending(): string[] { return [...new Set(this.text.match(/\[[^\]]+\]/g) ?? [])]; }
  get canSend(): boolean { return this.text.trim().length >= 5 && !this.pending.length; }

  async send(m: ContactMessage, channel: Channel): Promise<void> {
    const text = this.text.trim();
    if (!this.canSend) return;
    // Se abre de inmediato (si espera al servidor, el navegador bloquea la ventana nueva)
    if (channel === 'WhatsApp') {
      window.open(`https://wa.me/${whatsappNumber(m.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } else if (channel === 'Correo') {
      const subject = `Re: ${categoryLabel(m.subject || m.category)} · Hospedaje Sebastián`;
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
    this.busy = true;
    this.error = this.done = '';
    try {
      this.selected = await this.svc.reply(m.id, channel, text, this.templateId ?? undefined);
      this.done = channel === 'Llamada' ? `Respuesta a ${m.name} registrada.` : `Respuesta a ${m.name} registrada. Termina de enviarla en ${channel === 'WhatsApp' ? 'WhatsApp' : 'Gmail'}.`;
      this.text = '';
      this.templateId = null;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la respuesta.';
    } finally {
      this.busy = false;
    }
  }

  async setStatus(m: ContactMessage, status: MessageStatus): Promise<void> {
    try { this.selected = await this.svc.update(m.id, { status }); }
    catch (e: any) { this.error = e?.error?.message ?? 'No se pudo actualizar el mensaje.'; }
  }

  async setPriority(m: ContactMessage, priority: string): Promise<void> {
    try { this.selected = await this.svc.update(m.id, { priority }); }
    catch (e: any) { this.error = e?.error?.message ?? 'No se pudo cambiar la prioridad.'; }
  }

  // ── Respuestas rápidas ──
  newTemplate(): void { this.formError = ''; this.form = { title: '', category: 'reserva', text: 'Hola {nombre}, ', active: true }; }
  editTemplate(t: QuickReply): void { this.formError = ''; this.form = { ...t }; window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async saveTemplate(): Promise<void> {
    const f = this.form!;
    f.title = f.title.trim();
    f.text = f.text.trim();
    if (f.title.length < 3) { this.formError = 'Escribe un título.'; return; }
    if (f.text.length < 10) { this.formError = 'Escribe el texto de la respuesta.'; return; }
    this.busy = true;
    try {
      await this.svc.saveTemplate(f);
      this.done = `Respuesta rápida «${f.title}» guardada.`;
      this.form = undefined;
    } catch (e: any) {
      this.formError = e?.error?.message ?? 'No se pudo guardar.';
    } finally {
      this.busy = false;
    }
  }

  async deleteTemplate(t: QuickReply): Promise<void> {
    this.busy = true;
    try { await this.svc.deleteTemplate(t); this.done = `Respuesta rápida «${t.title}» eliminada.`; }
    catch (e: any) { this.error = e?.error?.message ?? 'No se pudo eliminar.'; }
    finally { this.busy = false; this.toDelete = undefined; }
  }
}

