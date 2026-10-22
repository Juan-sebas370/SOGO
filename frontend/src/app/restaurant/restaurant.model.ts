// =====================================================
// RESTAURANTE Y CAFETERÍA — modelo
// Un pedido es una venta directa (mesa / consumidor final) o un cargo a una
// estadía activa. Totales e impuestos se derivan de sus líneas; cada línea
// guarda el precio con el que se vendió, así un cambio de menú no la altera.
// =====================================================

export type MenuCategory = 'Bebidas' | 'Desayunos' | 'Almuerzos' | 'Cenas' | 'Postres' | 'Snacks';

export const MENU_CATEGORIES: MenuCategory[] = ['Bebidas', 'Desayunos', 'Almuerzos', 'Cenas', 'Postres', 'Snacks'];

export const CATEGORY_PREFIX: Record<MenuCategory, string> = {
  Bebidas: 'BEB', Desayunos: 'DES', Almuerzos: 'ALM', Cenas: 'CEN', Postres: 'POS', Snacks: 'SNA',
};

export interface ProductChange {
  at:   string;                 // YYYY-MM-DDTHH:mm
  by:   string;
  text: string;                 // "Precio $ 40.000 → $ 42.000"
}

export interface MenuProduct {
  id:           string;
  code:         string;         // BEB-01
  name:         string;
  category:     MenuCategory;
  price:        number;         // antes de INC
  description:  string;
  ingredients:  string[];
  observations: string;         // "Contiene lácteos…"
  available:    boolean;        // disponible para la venta (interruptor del menú)
  stock:        number;         // porciones / unidades en existencia
  minStock:     number;
  updatedAt:    string;
  updatedBy:    string;
  history:      ProductChange[];
  lastMovement?: { at: string; text: string };
}

export type StockState = 'Disponible' | 'Existencias bajas' | 'Agotado' | 'No disponible';

export function stockState(p: MenuProduct): StockState {
  if (p.stock <= 0) return 'Agotado';
  if (!p.available) return 'No disponible';
  return p.stock < p.minStock ? 'Existencias bajas' : 'Disponible';
}

/** Solo se puede pedir lo que está activo en el menú y tiene existencias. */
export function canSell(p: MenuProduct): boolean {
  return p.available && p.stock > 0;
}

export const STOCK_BADGE: Record<StockState, string> = {
  'Disponible': 'rsv-badge--ok', 'Existencias bajas': 'rsv-badge--warn',
  'Agotado': 'rsv-badge--danger', 'No disponible': 'rsv-badge--muted',
};

// ── Pedidos ──────────────────────────────────────────

export type OrderTarget = 'Huésped' | 'Habitación' | 'Venta directa';
export type SaleType = 'Venta directa' | 'Cargo a habitación';
/**
 * Pendiente: abierto (sin cobrar o cargado a una cuenta abierta).
 * Facturada: cuenta de habitación cerrada; se cobra con la factura del check-out.
 * Pagada: cobrada con una factura electrónica del restaurante.
 */
export type OrderStatus = 'Pendiente' | 'Facturada' | 'Pagada' | 'Anulada';
export type SalePaymentMethod = 'Efectivo' | 'Tarjeta débito' | 'Tarjeta crédito' | 'Nequi' | 'Daviplata' | 'Transferencia';

export const PAYMENT_METHODS: SalePaymentMethod[] = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Nequi', 'Daviplata', 'Transferencia'];

export const ORDER_BADGE: Record<OrderStatus, string> = {
  'Pendiente': 'rsv-badge--warn', 'Facturada': 'rsv-badge--info', 'Pagada': 'rsv-badge--ok', 'Anulada': 'rsv-badge--muted',
};

export interface OrderItem {
  productId: string;
  name:      string;
  category:  MenuCategory;
  unitPrice: number;
  quantity:  number;
}

export interface RestaurantInvoice {
  number:     string;           // FE-1052 (numeración compartida con Facturación)
  at:         string;
  method:     SalePaymentMethod;
  clientName: string;
  clientDoc:  string;
  email:      string;
  cufe:       string;
  orderIds:   string[];         // una factura puede consolidar varios pedidos (cuenta de habitación)
  sentTo?:    string;
}

export interface RestaurantOrder {
  id:               string;
  number:           string;     // PED-2026-0345
  createdAt:        string;     // YYYY-MM-DDTHH:mm
  createdBy:        string;
  target:           OrderTarget;
  table:            string;     // venta directa: "Mesa 4", "Barra"...
  clientName:       string;
  clientDoc:        string;
  reservationId?:   string;     // cargo a una estadía activa
  reservationCode?: string;
  unitLabel?:       string;     // "Hab. 204", "Piso 1", "Casa completa"
  items:            OrderItem[];
  observations:     string;
  taxRate:          number;     // INC vigente al registrar
  status:           OrderStatus;
  chargeId?:        string;     // consumo cargado a la cuenta de la estadía
  closedAt?:        string;
  closedBy?:        string;
  invoice?:         RestaurantInvoice;
  annulment?:       { at: string; by: string; reason: string };
}

export interface OrderTotals { units: number; subtotal: number; tax: number; total: number; }

export function itemsTotals(items: Pick<OrderItem, 'unitPrice' | 'quantity'>[], taxRate: number): OrderTotals {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const tax = Math.round(subtotal * taxRate);
  return { units: items.reduce((s, i) => s + i.quantity, 0), subtotal, tax, total: subtotal + tax };
}

export function orderTotals(o: RestaurantOrder): OrderTotals {
  return itemsTotals(o.items, o.taxRate);
}

export function sumTotals(orders: RestaurantOrder[]): OrderTotals {
  return orders.map(orderTotals).reduce(
    (a, t) => ({ units: a.units + t.units, subtotal: a.subtotal + t.subtotal, tax: a.tax + t.tax, total: a.total + t.total }),
    { units: 0, subtotal: 0, tax: 0, total: 0 });
}

export const isRoomCharge = (o: RestaurantOrder): boolean => !!o.reservationId;
export const saleType = (o: RestaurantOrder): SaleType => isRoomCharge(o) ? 'Cargo a habitación' : 'Venta directa';

/** "Desayuno típico ×2, Café de origen Quindío ×2" */
export function itemsSummary(o: RestaurantOrder): string {
  return o.items.map(i => `${i.name} ×${i.quantity}`).join(', ');
}

/** "PED-2026-0344" → "PED-0344" */
export const shortNumber = (n: string): string => n.replace(/^PED-\d{4}-/, 'PED-');

export const TABLES = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Barra', 'Terraza', 'Para llevar'];
