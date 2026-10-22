import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { InventoryService } from '../inventory.service';
import { Alert, AlertPriority, AlertType, Product, fmtQty } from '../inventory.model';
import { isoDate } from '../../shared/date-utils';

type Tab = 'Activas' | 'Atendidas' | 'Todas';
interface Row { a: Alert; p: Product; }
const PRIORITY_ORDER: Record<AlertPriority, number> = { Alta: 0, Media: 1, Baja: 2 };

@Component({
  selector: 'app-inventory-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrls: ['../../shared/styles/page-kit.css', '../../shared/styles/kit.css', '../inventory.css'],
  template: `
  <nav class="kit-crumb" aria-label="Ruta"><a routerLink="/dashboard/inventory">Inventarios</a><span>/</span><span>Alertas</span></nav>
  <header class="kit-head">
    <div>
      <h1 class="kit-title">Alertas de inventario</h1>
      <p class="kit-sub">Se generan y se actualizan solas con cada entrada, salida o ajuste. Última actualización: hoy {{ svc.lastUpdate.slice(11, 16) }}.</p>
    </div>
    <button type="button" class="rsv-btn rsv-btn--outline" (click)="configuring = true; days = svc.config.expiryDays">Configurar alertas</button>
  </header>

  <section class="kit-kpis">
    <div class="kit-kpi al-kpi-danger"><span class="kit-kpi-icon kit-kpi-icon--red"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span>
      <div><span>Agotados</span><strong>{{ activeOf('Agotado') }}</strong><small>Prioridad alta</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--amber"><svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg></span>
      <div><span>Stock bajo</span><strong>{{ activeOf('Stock bajo') }}</strong><small>Igual o bajo el mínimo</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--purple"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
      <div><span>Próximos a vencer</span><strong>{{ activeOf('Por vencer') }}</strong><small>En los próximos {{ svc.config.expiryDays }} días</small></div></div>
    <div class="kit-kpi"><span class="kit-kpi-icon kit-kpi-icon--green"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
      <div><span>Atendidas hoy</span><strong>{{ attendedToday.length }}</strong><small>{{ attendedRefs || 'Ninguna todavía' }}</small></div></div>
  </section>

  <section class="kit-card">
    <div class="inv-tabs" role="tablist">
      <button type="button" role="tab" *ngFor="let t of tabs" [class.active]="tab === t" (click)="tab = t; apply()">{{ t }} <span>{{ counts[t] }}</span></button>
    </div>
    <div class="inv-filters" style="margin-bottom: 14px">
      <label class="kit-select"><span>Prioridad</span><select [(ngModel)]="priority" (ngModelChange)="apply()"><option value="">Todas</option><option>Alta</option><option>Media</option><option>Baja</option></select></label>
      <label class="kit-select"><span>Tipo</span><select [(ngModel)]="type" (ngModelChange)="apply()"><option value="">Todos</option><option>Agotado</option><option>Stock bajo</option><option>Por vencer</option></select></label>
      <label class="kit-select"><span>Categoría</span><select [(ngModel)]="category" (ngModelChange)="apply()"><option value="">Todas</option><option *ngFor="let c of categories">{{ c }}</option></select></label>
      <label class="kit-select"><span>Proveedor</span><select [(ngModel)]="supplier" (ngModelChange)="apply()"><option value="">Todos</option><option *ngFor="let s of suppliers">{{ s }}</option></select></label>
    </div>
    <div class="kit-table-wrap">
      <table class="kit-table">
        <thead><tr><th>Prioridad</th><th>Tipo</th><th>Producto</th><th>Disponible</th><th class="r">Mínimo</th><th>Proveedor</th><th>Generada</th><th>Estado</th><th class="r">Acciones</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of rows" [class.al-done]="r.a.status === 'Atendida'">
            <td><span class="al-prio" [ngClass]="'al-prio--' + r.a.priority.toLowerCase()">{{ r.a.priority }}</span></td>
            <td><span class="al-type" [ngClass]="'al-type--' + (r.a.type === 'Agotado' ? 'out' : r.a.type === 'Stock bajo' ? 'low' : 'exp')">{{ r.a.type === 'Por vencer' ? 'Vence ' + dm(r.p.expiryDate) : r.a.type }}</span></td>
            <td><a class="al-name" routerLink="/dashboard/inventory" [queryParams]="{ producto: r.p.id }">{{ r.p.name }}</a><small class="inv-sub kit-mono">{{ r.p.code }} · {{ r.p.category }}</small></td>
            <td><strong>{{ qty(r.p.stock) }} {{ r.p.unit }}</strong></td>
            <td class="r">{{ qty(r.p.minStock) }}</td>
            <td class="kit-muted">{{ r.p.supplier }}</td>
            <td class="kit-muted">{{ dm(r.a.generatedAt) }} {{ r.a.generatedAt.slice(11, 16) }}</td>
            <td>
              <span class="rsv-badge" [ngClass]="r.a.status === 'Activa' ? 'rsv-badge--muted' : 'rsv-badge--ok'">{{ r.a.status === 'Activa' ? 'Activa' : 'Atendida · ' + dm(r.a.attendedAt!) + ' ' + r.a.attendedAt!.slice(11, 16) }}</span>
              <small class="inv-sub" *ngIf="r.a.purchaseRequestedAt && r.a.status === 'Activa'">Compra solicitada</small>
            </td>
            <td class="r al-actions">
              <ng-container *ngIf="r.a.status === 'Activa'; else ref">
                <a *ngIf="r.a.type === 'Por vencer'" class="rsv-btn rsv-btn--outline" routerLink="/dashboard/inventory/exits" [queryParams]="{ producto: r.p.id, motivo: 'Vencimiento' }">Registrar salida</a>
                <button *ngIf="r.a.type !== 'Por vencer'" type="button" class="rsv-btn rsv-btn--outline" [disabled]="!!r.a.purchaseRequestedAt" (click)="svc.requestPurchase(r.p.id)">{{ r.a.purchaseRequestedAt ? 'Solicitada' : 'Solicitar compra' }}</button>
                <button type="button" class="rsv-btn rsv-btn--outline al-attend" (click)="svc.markAttended(r.a.key)">Marcar atendida</button>
              </ng-container>
              <ng-template #ref><span class="kit-mono kit-muted">{{ r.a.attendedRef }}</span></ng-template>
            </td>
          </tr>
          <tr *ngIf="!rows.length"><td colspan="9" class="kit-empty">{{ tab === 'Activas' ? 'No hay alertas activas. ¡Todo en orden!' : 'Sin alertas con estos filtros.' }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="rsv-modal-overlay" *ngIf="configuring" (click)="configuring = false">
    <div class="rsv-modal" role="dialog" aria-modal="true" aria-labelledby="cfg-title" (click)="$event.stopPropagation()">
      <h2 class="rsv-modal-title" id="cfg-title">Configurar alertas</h2>
      <p class="rsv-modal-desc">El stock bajo se activa cuando las existencias quedan iguales o por debajo del mínimo de cada producto (se edita en su ficha).</p>
      <label class="kit-field">Avisar vencimientos con cuántos días de anticipación
        <input class="rsv-input" type="number" min="1" max="60" [(ngModel)]="days"></label>
      <div class="rsv-modal-footer">
        <button type="button" class="rsv-btn rsv-btn--outline" (click)="configuring = false">Cancelar</button>
        <button type="button" class="rsv-btn rsv-btn--primary" [disabled]="!(days >= 1 && days <= 60)" (click)="saveConfig()">Guardar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .al-kpi-danger { border-color: #FCA5A5; }
    .al-prio { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .al-prio--alta { background: #FDE2E2; color: #B91C1C; } .al-prio--media { background: #FEF1D6; color: #B45309; } .al-prio--baja { background: #E3EEFF; color: #1D4ED8; }
    .al-type { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid; white-space: nowrap; }
    .al-type--out { color: #B91C1C; } .al-type--low { color: #B45309; } .al-type--exp { color: #7E22CE; }
    .al-name { color: #0A2540; font-weight: 600; text-decoration: none; }
    .al-name:hover { text-decoration: underline; }
    .al-actions { white-space: nowrap; }
    .al-actions .rsv-btn { height: 32px; padding: 0 12px; font-size: 12px; margin-left: 4px; }
    .al-attend { color: #15803D !important; }
    .al-done td { opacity: 0.65; }
  `],
})
export class AlertsComponent {
  readonly tabs: Tab[] = ['Activas', 'Atendidas', 'Todas'];
  readonly qty = fmtQty;

  all: Row[] = [];
  rows: Row[] = [];
  counts = {} as Record<Tab, number>;
  tab: Tab = 'Activas';
  priority = '';
  type = '';
  category = '';
  supplier = '';
  categories: string[] = [];
  suppliers: string[] = [];
  attendedToday: Row[] = [];
  attendedRefs = '';
  configuring = false;
  days = 7;

  constructor(public svc: InventoryService) {
    combineLatest([svc.getAlerts(), svc.getProducts()]).subscribe(([alerts]) => {
      this.all = alerts.map(a => ({ a, p: svc.getProduct(a.productId)! })).filter(r => r.p)
        .sort((x, y) => (x.a.status === 'Activa' ? 0 : 1) - (y.a.status === 'Activa' ? 0 : 1) || PRIORITY_ORDER[x.a.priority] - PRIORITY_ORDER[y.a.priority]
          || y.a.generatedAt.localeCompare(x.a.generatedAt));
      this.categories = [...new Set(this.all.map(r => r.p.category))].sort();
      this.suppliers = [...new Set(this.all.map(r => r.p.supplier))].sort();
      this.attendedToday = this.all.filter(r => r.a.status === 'Atendida' && r.a.attendedAt?.startsWith(isoDate(0)));
      this.attendedRefs = [...new Set(this.attendedToday.map(r => r.a.attendedRef))].join(', ');
      this.apply();
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.configuring = false; }

  activeOf(t: AlertType): number { return this.all.filter(r => r.a.status === 'Activa' && r.a.type === t).length; }
  dm(iso: string): string { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; }

  apply(): void {
    const base = this.all.filter(r => (!this.priority || r.a.priority === this.priority) && (!this.type || r.a.type === this.type)
      && (!this.category || r.p.category === this.category) && (!this.supplier || r.p.supplier === this.supplier));
    const inTab = (r: Row, t: Tab) => t === 'Todas' || (t === 'Activas' ? r.a.status === 'Activa' : r.a.status === 'Atendida');
    this.tabs.forEach(t => this.counts[t] = base.filter(r => inTab(r, t)).length);
    this.rows = base.filter(r => inTab(r, this.tab));
  }

  saveConfig(): void {
    this.svc.setConfig({ expiryDays: Math.round(this.days) });
    this.configuring = false;
  }
}
