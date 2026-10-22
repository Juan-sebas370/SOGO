import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  MenuProduct, MenuCategory, RestaurantOrder, OrderItem, OrderTarget, OrderStatus, RestaurantInvoice,
  SalePaymentMethod, CATEGORY_PREFIX, canSell, isRoomCharge, itemsTotals, orderTotals, itemsSummary, shortNumber, stockState,
} from './restaurant.model';
import { ReservationService } from '../reservations/reservation.service';
import { Reservation, isInHouse } from '../reservations/reservation.model';
import { ChargeService } from '../billing/charge.service';
import { InvoiceService } from '../billing/invoice.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { UsersService } from '../users/users.service';
import { isoDate, isoDateTime } from '../shared/date-utils';

const user = () => localStorage.getItem('sogo_role') || 'Usuario';
const money = (v: number) => '$ ' + new Intl.NumberFormat('es-CO').format(v);

/** Hora de hoy para los datos de demostración, sin quedar en el futuro. */
function todayAt(hhmm: string, minutesAgo = 5): string {
  const at = `${isoDate(0)}T${hhmm}`;
  const now = isoDateTime();
  return at <= now ? at : isoDateTime(new Date(Date.now() - minutesAgo * 60000));
}

/** CUFE simulado (en producción lo devuelve el proveedor tecnológico). */
function fakeCufe(): string {
  return Array.from({ length: 96 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

/** "Hab. 204", "Hab. 102, 103", "Piso 1", "Casa completa", "Pasadía" */
export function unitLabelFor(r: Reservation): string {
  if (r.nights === 0) return 'Pasadía';
  if (r.lodgingType === 'Casa completa') return 'Casa completa';
  if (r.lodgingType === 'Piso') return `Piso ${r.floor}`;
  return `Hab. ${r.rooms.join(', ')}`;
}

export interface NewOrderInput {
  target:       OrderTarget;
  table:        string;
  clientName:   string;
  clientDoc:    string;
  reservation?: Reservation;
  items:        { productId: string; quantity: number }[];
  observations: string;
}

export interface BillingData { clientName: string; clientDoc: string; method: SalePaymentMethod; email: string; }

@Injectable({ providedIn: 'root' })
export class RestaurantService {

  private products: MenuProduct[] = [];
  private orders: RestaurantOrder[] = [];
  private products$ = new BehaviorSubject<MenuProduct[]>([]);
  private orders$ = new BehaviorSubject<RestaurantOrder[]>([]);
  /** Pedido en preparación (productos agregados desde el menú): id de producto → cantidad. */
  private draft$ = new BehaviorSubject<Record<string, number>>({});
  private orderSeq = 0;

  constructor(
    private reservations: ReservationService,
    private charges: ChargeService,
    private invoices: InvoiceService,
    private config: BillingConfigService,
    private audit: UsersService,
  ) {
    this.products = seedProducts();
    // El hospedaje no vende comidas ni bebidas (presta la cocina): sin pedidos de
    // demostración, que aparecían como ventas en Contabilidad, Reportes e Inicio.
    // El módulo está oculto del menú y sus rutas desactivadas.
    this.products$.next(this.products);
    this.orders$.next(this.orders);
  }

  // ── Menú ─────────────────────────────────────────────

  getProducts(): Observable<MenuProduct[]> { return this.products$.asObservable(); }
  productsSnapshot(): MenuProduct[] { return this.products; }
  getProduct(id: string): MenuProduct | undefined { return this.products.find(p => p.id === id); }

  /** Módulo retirado (no se venden comidas): sus tiquetes no consumen la numeración DIAN de Facturación. */
  private tickets = 0;
  private nextTicket(): string { return `TQ-${String(++this.tickets).padStart(4, "0")}`; }

  get taxRate(): number { return this.config.taxFor('Restaurante').rate; }

  nextCode(category: MenuCategory): string {
    const prefix = CATEGORY_PREFIX[category];
    const used = this.products.filter(p => p.code.startsWith(prefix)).map(p => Number(p.code.split('-')[1]));
    return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
  }

  /** Crea (id null) o actualiza un producto; cada cambio queda en su historial. */
  saveProduct(id: string | null, data: Omit<MenuProduct, 'id' | 'code' | 'updatedAt' | 'updatedBy' | 'history' | 'lastMovement'>): MenuProduct {
    const at = isoDateTime();
    const by = user();
    if (!id) {
      const created: MenuProduct = {
        ...data, id: `p${Date.now()}`, code: this.nextCode(data.category), updatedAt: at, updatedBy: by,
        history: [{ at, by, text: 'Producto creado' }],
      };
      this.products = [...this.products, created];
      this.products$.next(this.products);
      this.audit.addLog('Menú: producto creado', `${created.code} · ${created.name} · ${money(created.price)}`);
      return created;
    }
    const prev = this.getProduct(id)!;
    const changes: string[] = [];
    if (prev.name !== data.name) changes.push(`Nombre "${prev.name}" → "${data.name}"`);
    if (prev.category !== data.category) changes.push(`Categoría ${prev.category} → ${data.category}`);
    if (prev.price !== data.price) changes.push(`Precio ${money(prev.price)} → ${money(data.price)}`);
    if (prev.description !== data.description) changes.push('Descripción actualizada');
    if (prev.ingredients.join() !== data.ingredients.join() || prev.observations !== data.observations) changes.push('Ingredientes / observaciones actualizados');
    if (prev.stock !== data.stock) changes.push(`Existencias ${prev.stock} → ${data.stock}`);
    if (prev.minStock !== data.minStock) changes.push(`Mínimo ${prev.minStock} → ${data.minStock}`);
    if (prev.available !== data.available) changes.push(data.available ? 'Activado para la venta' : 'Desactivado para la venta');
    if (!changes.length) return prev;
    const updated: MenuProduct = {
      ...prev, ...data, updatedAt: at, updatedBy: by,
      history: [...changes.map(text => ({ at, by, text })), ...prev.history],
    };
    this.replaceProduct(updated);
    this.audit.addLog('Menú: producto actualizado', `${updated.code} · ${changes.join(' · ')}`);
    return updated;
  }

  setAvailable(id: string, available: boolean): void {
    const p = this.getProduct(id);
    if (p) this.saveProduct(id, { ...p, available });
  }

  requestRestock(products: MenuProduct[]): void {
    this.audit.addLog('Restaurante: solicitud de abastecimiento', products.map(p => `${p.code} ${p.name} (${p.stock}/${p.minStock})`).join(' · '));
  }

  private replaceProduct(p: MenuProduct): void {
    this.products = this.products.map(x => x.id === p.id ? p : x);
    this.products$.next(this.products);
  }

  /** Mueve existencias (negativo = sale) y deja el último movimiento. */
  private moveStock(productId: string, delta: number, text: string, at: string): void {
    const p = this.getProduct(productId);
    if (p) this.replaceProduct({ ...p, stock: Math.max(0, p.stock + delta), lastMovement: { at, text } });
  }

  // ── Pedido en preparación ────────────────────────────

  getDraft(): Observable<Record<string, number>> { return this.draft$.asObservable(); }
  draftSnapshot(): Record<string, number> { return this.draft$.value; }

  addToDraft(productId: string, qty = 1): void {
    const p = this.getProduct(productId);
    if (!p || !canSell(p)) return;
    const current = this.draft$.value[productId] ?? 0;
    this.setDraftQty(productId, Math.min(p.stock, current + qty));
  }

  setDraftQty(productId: string, qty: number): void {
    const next = { ...this.draft$.value };
    if (qty > 0) next[productId] = qty; else delete next[productId];
    this.draft$.next(next);
  }

  clearDraft(): void { this.draft$.next({}); }

  // ── Pedidos ──────────────────────────────────────────

  getOrders(): Observable<RestaurantOrder[]> { return this.orders$.asObservable(); }
  ordersSnapshot(): RestaurantOrder[] { return this.orders; }
  getOrder(id: string): RestaurantOrder | undefined { return this.orders.find(o => o.id === id); }

  nextOrderNumber(): string {
    return `PED-${new Date().getFullYear()}-${String(this.orderSeq + 1).padStart(4, '0')}`;
  }

  /** Estadías con check-in hecho y sin check-out: las únicas que admiten cargos. */
  activeStays(): Reservation[] {
    return this.reservations.getSnapshot().filter(isInHouse);
  }

  /**
   * Registra el pedido: valida existencias, las descuenta y, si va a una
   * estadía, carga el consumo a su cuenta (queda en la factura del check-out).
   */
  createOrder(input: NewOrderInput): RestaurantOrder {
    const items = input.items.filter(i => i.quantity > 0).map<OrderItem>(i => {
      const p = this.getProduct(i.productId);
      if (!p || !canSell(p)) throw new Error(`${p?.name ?? 'Producto'} no está disponible`);
      if (i.quantity > p.stock) throw new Error(`Solo quedan ${p.stock} de ${p.name}`);
      return { productId: p.id, name: p.name, category: p.category, unitPrice: p.price, quantity: i.quantity };
    });
    if (!items.length) throw new Error('Agrega al menos un producto');
    const r = input.reservation;
    if (r && !isInHouse(r)) throw new Error('La estadía no está activa');

    const order = this.buildOrder({
      at: isoDateTime(), target: input.target, table: r ? '' : input.table,
      clientName: r ? r.guestName : (input.clientName.trim() || 'Consumidor final'),
      clientDoc: r ? r.docNumber : (input.clientDoc.trim() || '222222222222'),
      reservation: r, items, observations: input.observations.trim(),
    });
    this.orders = [order, ...this.orders];
    this.orders$.next(this.orders);
    this.audit.addLog('Restaurante: pedido registrado',
      `${order.number} · ${r ? `${order.unitLabel} · ${r.guestName}` : `${order.table} · ${order.clientName}`} · ${money(orderTotals(order).total)}`);
    return order;
  }

  private buildOrder(o: {
    at: string; target: OrderTarget; table: string; clientName: string; clientDoc: string;
    reservation?: Reservation; items: OrderItem[]; observations: string; status?: OrderStatus; chargeId?: string;
  }): RestaurantOrder {
    const number = `PED-${o.at.slice(0, 4)}-${String(++this.orderSeq).padStart(4, '0')}`;
    const r = o.reservation;
    const order: RestaurantOrder = {
      id: `o${this.orderSeq}`, number, createdAt: o.at, createdBy: user(),
      target: o.target, table: o.table, clientName: o.clientName, clientDoc: o.clientDoc,
      reservationId: r?.id, reservationCode: r?.code, unitLabel: r ? unitLabelFor(r) : undefined,
      items: o.items, observations: o.observations, taxRate: this.taxRate, status: o.status ?? 'Pendiente',
      chargeId: o.chargeId,
    };
    const movement = `${r ? 'Consumo' : 'Venta'} ${shortNumber(number)}`;
    if (!o.status) o.items.forEach(i => this.moveStock(i.productId, -i.quantity, movement, o.at));
    if (r && !o.chargeId) {
      const t = itemsTotals(o.items, 0);
      order.chargeId = this.charges.add({
        reservationId: r.id, category: 'Restaurante', description: `Restaurante · ${shortNumber(number)}`,
        detail: itemsSummary(order), date: o.at.slice(0, 10), quantity: 1, unitValue: t.subtotal,
      }).id;
    }
    return order;
  }

  /** Anula un pedido abierto: devuelve existencias y retira el cargo de la estadía. */
  annulOrder(id: string, reason: string): void {
    const o = this.getOrder(id);
    if (!o || o.status !== 'Pendiente') return;
    const at = isoDateTime();
    o.items.forEach(i => this.moveStock(i.productId, i.quantity, `Anulación ${shortNumber(o.number)}`, at));
    if (o.chargeId) this.charges.remove(o.chargeId);
    this.patch([id], x => ({ ...x, status: 'Anulada', chargeId: undefined, annulment: { at, by: user(), reason } }));
    this.audit.addLog('Restaurante: pedido anulado', `${o.number} · ${reason}`);
  }

  // ── Cuentas ──────────────────────────────────────────

  /** Pedidos abiertos de una estadía (la cuenta de consumos de la habitación). */
  openOrdersFor(reservationId: string): RestaurantOrder[] {
    return this.orders.filter(o => o.reservationId === reservationId && o.status === 'Pendiente')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Cierra la cuenta dejando los consumos en la cuenta de la habitación (se cobran al check-out). */
  closeToRoom(orderIds: string[]): void {
    const at = isoDateTime();
    this.patch(orderIds, o => ({ ...o, status: 'Facturada', closedAt: at, closedBy: user() }));
    const first = this.getOrder(orderIds[0]);
    this.audit.addLog('Restaurante: cuenta cerrada', `${first?.unitLabel} · ${orderIds.length} pedido(s) cargados a la habitación`);
  }

  /** Reabre una cuenta cerrada a la habitación mientras su factura del check-out no se haya emitido. */
  reopen(orderIds: string[]): void {
    const ids = orderIds.filter(id => { const o = this.getOrder(id); return o?.status === 'Facturada' && !this.invoiceNumber(o); });
    this.patch(ids, o => ({ ...o, status: 'Pendiente', closedAt: undefined, closedBy: undefined }));
    if (ids.length) this.audit.addLog('Restaurante: cuenta reabierta', `${ids.length} pedido(s)`);
  }

  /**
   * Emite la factura electrónica del restaurante para uno o varios pedidos y
   * los deja pagados. Si estaban cargados a una estadía, el cargo sale de su
   * cuenta para no cobrarse dos veces.
   */
  invoiceOrders(orderIds: string[], data: BillingData): RestaurantInvoice {
    const at = isoDateTime();
    const invoice: RestaurantInvoice = {
      number: this.nextTicket(), at, method: data.method,
      clientName: data.clientName.trim() || 'Consumidor final', clientDoc: data.clientDoc.trim() || '222222222222',
      email: data.email.trim(), cufe: fakeCufe(), orderIds: [...orderIds],
    };
    orderIds.forEach(id => { const c = this.getOrder(id)?.chargeId; if (c) this.charges.remove(c); });
    this.patch(orderIds, o => ({ ...o, status: 'Pagada', chargeId: undefined, closedAt: at, closedBy: user(), invoice }));
    const total = orderIds.map(id => orderTotals(this.getOrder(id)!).total).reduce((s, v) => s + v, 0);
    this.audit.addLog('Restaurante: factura emitida', `${invoice.number} · ${invoice.clientName} · ${money(total)} · ${data.method}`);
    return invoice;
  }

  sendInvoice(orderIds: string[], email: string): void {
    this.patch(orderIds, o => o.invoice ? { ...o, invoice: { ...o.invoice, email, sentTo: email } } : o);
    this.audit.addLog('Restaurante: factura enviada', `${this.getOrder(orderIds[0])?.invoice?.number} · ${email}`);
  }

  /** Factura del pedido: la del restaurante o, si se cobró con la estadía, la del check-out. */
  invoiceNumber(o: RestaurantOrder): string {
    if (o.invoice) return o.invoice.number;
    return o.chargeId ? this.invoices.invoiceForCharge(o.chargeId)?.number ?? '' : '';
  }

  private patch(ids: string[], fn: (o: RestaurantOrder) => RestaurantOrder): void {
    this.orders = this.orders.map(o => ids.includes(o.id) ? fn(o) : o);
    this.orders$.next(this.orders);
  }

  // ── Resumen para Inicio ──────────────────────────────

  getStats() {
    const today = isoDate(0);
    const valid = this.orders.filter(o => o.status !== 'Anulada');
    const todays = valid.filter(o => o.createdAt.startsWith(today));
    return {
      sales: todays.reduce((s, o) => s + orderTotals(o).total, 0),
      ordersToday: todays.length,
      openAccounts: new Set(valid.filter(o => o.status === 'Pendiente').map(o => o.reservationId ?? o.id)).size,
      outOfStock: this.products.filter(p => stockState(p) === 'Agotado').length,
      lowStock: this.products.filter(p => stockState(p) === 'Existencias bajas').length,
    };
  }

  // ── Datos de demostración ────────────────────────────
  // Historial de ~4 semanas con fechas relativas a hoy. Los cargos a habitación
  // usan estadías reales de ReservationService: los de Valentina Castro y
  // Laura Torres son los consumos c1/c2 que ya están en sus facturas; los de
  // Diego Ramírez (Hab. 204, alojado) quedan abiertos para cerrar su cuenta.
  private seedOrders(): RestaurantOrder[] {
    const rand = mulberry32(2026);
    const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
    const byCat = (c: MenuCategory) => this.products.filter(p => p.category === c && p.id !== 'CEN-01' && p.id !== 'POS-01');
    const item = (id: string, quantity: number): OrderItem => {
      const p = this.getProduct(id)!;
      return { productId: p.id, name: p.name, category: p.category, unitPrice: p.price, quantity };
    };

    type Spec = { at: string; items: OrderItem[]; table?: string; client?: string; doc?: string; resId?: string;
                  chargeId?: string; status: OrderStatus; closedAt?: string; method?: SalePaymentMethod; annul?: string };
    const specs: Spec[] = [];

    // Ventas directas de días anteriores
    const methods: SalePaymentMethod[] = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Nequi', 'Efectivo', 'Daviplata'];
    for (let d = -27; d <= -1; d++) {
      const count = 2 + Math.floor(rand() * 3);
      const hours = [7, 8, 9, 12, 13, 14, 16, 19, 20].sort(() => rand() - 0.5).slice(0, count).sort((a, b) => a - b);
      hours.forEach(h => {
        const meal: MenuCategory[] = h < 11 ? ['Desayunos', 'Bebidas'] : h < 16 ? ['Almuerzos', 'Bebidas', 'Postres'] : h < 18 ? ['Snacks', 'Bebidas'] : ['Cenas', 'Bebidas', 'Snacks'];
        const lines = new Map<string, number>();
        meal.slice(0, 1 + Math.floor(rand() * meal.length)).forEach(c => {
          const p = pick(byCat(c));
          if (p) lines.set(p.id, (lines.get(p.id) ?? 0) + 1 + Math.floor(rand() * 3));
        });
        specs.push({
          at: `${isoDate(d)}T${String(h).padStart(2, '0')}:${String(Math.floor(rand() * 50) + 5).padStart(2, '0')}`,
          items: [...lines].map(([id, q]) => item(id, q)), table: pick(['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Barra']),
          status: 'Pagada', method: pick(methods),
        });
      });
    }

    // Cargos ya facturados con la estadía (consumos c1 y c2 de ChargeService)
    specs.push({ at: `${isoDate(-20)}T20:00`, resId: '1', chargeId: 'c1', status: 'Facturada', closedAt: `${isoDate(-18)}T10:40`,
                 items: [item('ALM-01', 5), item('BEB-04', 1)] });
    specs.push({ at: `${isoDate(-1)}T08:10`, resId: '9', chargeId: 'c2', status: 'Facturada', closedAt: todayAt('09:30', 20),
                 items: [item('DES-03', 3), item('BEB-01', 3)] });

    // Cuenta abierta de Diego Ramírez (Hab. 204)
    specs.push({ at: `${isoDate(-1)}T19:40`, resId: '10', status: 'Pendiente', items: [item('ALM-02', 1), item('BEB-06', 2)] });
    specs.push({ at: `${isoDate(-1)}T20:30`, resId: '10', status: 'Pendiente', items: [item('CEN-02', 1), item('POS-02', 2)] });
    specs.push({ at: todayAt('07:10', 40), resId: '10', status: 'Pendiente', items: [item('DES-02', 2), item('BEB-01', 2)] });

    // Anulada ayer · venta pagada y venta por cobrar de hoy
    specs.push({ at: `${isoDate(-1)}T17:45`, table: 'Mesa 1', status: 'Anulada', annul: 'El cliente se retiró antes de servir', items: [item('ALM-03', 1)] });
    specs.push({ at: todayAt('08:20', 25), table: 'Mesa 4', status: 'Pagada', method: 'Tarjeta débito',
                 items: [item('DES-03', 2), item('BEB-01', 3), item('SNA-03', 6)] });
    specs.push({ at: todayAt('09:05', 10), table: 'Mesa 2', status: 'Pendiente', items: [item('DES-01', 2), item('BEB-03', 2)] });

    // Numeración en orden cronológico (pedidos y facturas)
    this.orderSeq = 200;
    const list: RestaurantOrder[] = [];
    // Los pedidos de demostración cargados a una habitación (resId) se omiten: las reservas
    // ahora son las reales de la base de datos y esos ids apuntarían a estadías de verdad.
    specs.filter(s => s.items.length && !s.resId).sort((a, b) => a.at.localeCompare(b.at)).forEach(s => {
      // Con estado explícito no se mueven existencias (ya están descontadas); las abiertas sin chargeId cargan su consumo
      const o = this.buildOrder({
        at: s.at, target: 'Venta directa', table: s.table ?? '',
        clientName: 'Consumidor final', clientDoc: '222222222222',
        reservation: undefined, items: s.items, observations: '', status: s.status, chargeId: s.chargeId,
      });
      if (s.closedAt) { o.closedAt = s.closedAt; o.closedBy = 'Administrador'; }
      if (s.annul) o.annulment = { at: s.at.replace(/T.*/, 'T18:05'), by: 'Administrador', reason: s.annul };
      if (s.status === 'Pagada') {
        o.closedAt = o.createdAt;
        o.invoice = {
          number: this.nextTicket(), at: o.createdAt, method: s.method ?? 'Efectivo',
          clientName: o.clientName, clientDoc: o.clientDoc, email: '', cufe: fakeCufe(), orderIds: [o.id],
        };
      }
      o.createdBy = 'Administrador';
      list.push(o);
      o.items.forEach(i => {
        const p = this.getProduct(i.productId)!;
        p.lastMovement = { at: o.createdAt, text: `Venta ${shortNumber(o.number)}` };
      });
    });
    // Los agotados muestran cuándo se acabaron
    this.getProduct('CEN-01')!.lastMovement = { at: `${isoDate(-1)}T21:10`, text: 'Agotado' };
    this.getProduct('POS-01')!.lastMovement = { at: `${isoDate(-1)}T20:15`, text: 'Agotado' };
    return list.reverse();
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SeedProduct = [code: string, name: string, price: number, stock: number, min: number, description: string, ingredients: string, observations?: string];

const SEED: Record<MenuCategory, SeedProduct[]> = {
  Bebidas: [
    ['BEB-01', 'Café de origen Quindío', 6000, 180, 40, 'Tinto o americano, grano de fincas de Filandia', 'Café'],
    ['BEB-02', 'Capuchino', 8000, 95, 30, 'Espresso con leche espumada', 'Café, Leche', 'Contiene lácteos.'],
    ['BEB-03', 'Jugo natural', 9000, 18, 10, 'Mora, lulo, maracuyá o guanábana, en agua o leche', 'Fruta, Azúcar'],
    ['BEB-04', 'Limonada de coco', 10000, 22, 10, 'Limonada cremosa con leche de coco', 'Limón, Coco, Hielo'],
    ['BEB-05', 'Chocolate caliente', 7000, 40, 15, 'Chocolate de mesa en leche, con queso', 'Chocolate, Leche, Queso', 'Contiene lácteos.'],
    ['BEB-06', 'Cerveza artesanal', 12000, 4, 12, 'Cervecería local, 330 ml', 'Cebada, Lúpulo', 'Venta solo a mayores de edad.'],
  ],
  Desayunos: [
    ['DES-01', 'Desayuno típico', 25000, 20, 8, 'Calentado de frijoles, huevos al gusto, arepa de maíz, queso campesino y chocolate caliente.', 'Frijol, Arroz, Huevo, Arepa, Queso, Chocolate', 'Contiene lácteos y huevo. Se sirve de 6:30 a 10:30 a. m.'],
    ['DES-02', 'Desayuno americano', 22000, 16, 8, 'Huevos, tocineta, pan tostado, fruta y café', 'Huevo, Tocineta, Pan, Fruta, Café', 'Contiene gluten y huevo.'],
    ['DES-03', 'Huevos pericos con arepa', 14000, 24, 8, 'Huevos con tomate y cebolla, arepa y queso', 'Huevo, Tomate, Cebolla, Arepa', 'Contiene huevo.'],
  ],
  Almuerzos: [
    ['ALM-01', 'Bandeja paisa', 38000, 12, 5, 'Frijoles, arroz, chicharrón, carne molida, huevo, maduro y aguacate', 'Frijol, Arroz, Chicharrón, Carne, Huevo, Plátano, Aguacate'],
    ['ALM-02', 'Trucha al ajillo', 42000, 3, 5, 'Trucha de la región con patacón y ensalada', 'Trucha, Ajo, Mantequilla, Limón', 'Contiene lácteos.'],
    ['ALM-03', 'Menú del día', 25000, 30, 10, 'Sopa, principio, proteína, arroz y jugo', 'Varía cada día'],
    ['ALM-04', 'Sancocho de gallina', 30000, 10, 5, 'Sancocho de gallina criolla con arroz y aguacate', 'Gallina, Papa, Yuca, Plátano, Mazorca'],
  ],
  Cenas: [
    ['CEN-01', 'Churrasco', 48000, 0, 4, '300 g con papa criolla y chimichurri', 'Res, Papa criolla, Chimichurri'],
    ['CEN-02', 'Pasta con pollo', 32000, 9, 4, 'Salsa de champiñones y parmesano', 'Pasta, Pollo, Champiñones, Crema', 'Contiene gluten y lácteos.'],
  ],
  Postres: [
    ['POS-01', 'Postre de natas', 10000, 0, 4, 'Receta tradicional', 'Leche, Azúcar, Canela', 'Contiene lácteos.'],
    ['POS-02', 'Brownie con helado', 12000, 7, 4, 'Brownie tibio con helado de vainilla', 'Chocolate, Harina, Helado', 'Contiene gluten y lácteos.'],
  ],
  Snacks: [
    ['SNA-01', 'Patacones con hogao', 14000, 14, 5, 'Porción para compartir', 'Plátano verde, Tomate, Cebolla'],
    ['SNA-02', 'Empanadas (3)', 9000, 30, 10, 'Empanadas de papa y carne con ají', 'Maíz, Papa, Carne, Ají'],
    ['SNA-03', 'Pandebono', 4000, 25, 12, 'Recién horneado', 'Almidón de yuca, Queso', 'Contiene lácteos.'],
  ],
};

function seedProducts(): MenuProduct[] {
  const monthStart = `${isoDate(-27)}T09:00`;
  const today = todayAt('06:40', 60);
  return (Object.keys(SEED) as MenuCategory[]).flatMap(category => SEED[category].map(([code, name, price, stock, minStock, description, ingredients, observations]) => {
    const p: MenuProduct = {
      // El id es el código inicial: estable para los datos de demostración
      id: code, code, name, category, price, stock, minStock, description,
      ingredients: ingredients.split(',').map(s => s.trim()), observations: observations ?? '',
      available: stock > 0, updatedAt: monthStart, updatedBy: 'Administrador',
      history: [{ at: monthStart, by: 'Administrador', text: 'Producto creado' }],
    };
    if (code === 'ALM-02') {
      p.history.unshift(
        { at: `${isoDate(-26)}T16:20`, by: 'Empleado restaurante', text: 'Descripción actualizada' },
        { at: `${isoDate(-3)}T11:05`, by: 'Administrador', text: 'Precio $ 40.000 → $ 42.000' });
      p.history.sort((a, b) => b.at.localeCompare(a.at));
      p.updatedAt = `${isoDate(-3)}T11:05`;
    }
    if (!p.available) {
      p.history.unshift({ at: today, by: 'Administrador', text: 'Desactivado para la venta' });
      p.updatedAt = today;
    }
    return p;
  }));
}
