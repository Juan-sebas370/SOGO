// =====================================================
// INVENTARIOS — modelo
// Las existencias solo cambian con movimientos (inicial, entrada, salida,
// ajuste) que calcula el servidor; cada línea guarda la cantidad antes y
// después, así el historial siempre explica el saldo. Todo viene de la base
// de datos (productos, categorías, proveedores, movimientos y alertas).
// =====================================================
import { AREAS as STAFF_AREAS } from '../payroll/payroll.model';

/** Categoría (tabla categorias_inventario). En pausa = no se usa por ahora (Alimentos, Bebidas). */
export interface Category { id?: number; name: string; prefix: string; inUse: boolean; products?: number; }

/** Proveedor (tabla terceros, es_proveedor = 1). */
export interface Supplier { id: number; name: string; docType: string; docNumber: string; phone: string; }

/** Unidades de medida (catálogo estándar, no son datos del negocio). */
export const UNITS = ['und', 'kg', 'litro', 'galón', 'paca x12', 'cubeta x30', 'kit', 'rollo', 'juego', 'resma', 'botella 3 L', 'caja'];
/** Unidades que admiten cantidades con decimales. */
export const FRACTIONAL_UNITS = ['kg', 'litro', 'galón'];

export interface ProductChange { at: string; by: string; text: string; }

export interface Product {
  id:          string;
  code:        string;          // ASE-004
  name:        string;
  category:    string;
  categoryInUse: boolean;       // false = categoría en pausa
  description: string;
  unit:        string;
  stock:       number;
  minStock:    number;
  location:    string;
  supplierId:  number | null;
  supplier:    string;
  unitCost:    number;          // costo promedio ponderado
  refPrice:    number | null;   // precio de referencia (null = uso interno)
  tracksExpiry: boolean;
  expiryDate:  string;          // YYYY-MM-DD ('' si no controla vencimiento)
  createdAt:   string;
  counted:     boolean;         // ya tiene existencias registradas (al menos un movimiento)
  history:     ProductChange[];
}

export type ProductStatus = 'Agotado' | 'Stock bajo' | 'Por vencer' | 'Disponible' | 'Por contar' | 'En pausa';

export const STATUS_BADGE: Record<ProductStatus, string> = {
  'Agotado': 'rsv-badge--danger', 'Stock bajo': 'rsv-badge--warn', 'Por vencer': 'rsv-badge--partial', 'Disponible': 'rsv-badge--ok',
  'Por contar': 'rsv-badge--info', 'En pausa': 'rsv-badge--muted',
};

/** Días que faltan para vencer (null si no controla vencimiento). */
export function daysToExpiry(p: Product, today: string): number | null {
  if (!p.tracksExpiry || !p.expiryDate) return null;
  return Math.round((Date.parse(p.expiryDate) - Date.parse(today)) / 86400000);
}

export function productStatus(p: Product, today: string, expiryDays = 7): ProductStatus {
  if (!p.categoryInUse) return 'En pausa';
  if (!p.counted) return 'Por contar';
  if (p.stock <= 0) return 'Agotado';
  if (p.stock <= p.minStock) return 'Stock bajo';
  const d = daysToExpiry(p, today);
  return d !== null && d <= expiryDays ? 'Por vencer' : 'Disponible';
}

/** Orden de prioridad para listados (lo urgente primero). */
export const STATUS_ORDER: Record<ProductStatus, number> = { 'Agotado': 0, 'Stock bajo': 1, 'Por vencer': 2, 'Por contar': 3, 'Disponible': 4, 'En pausa': 5 };

export const allowsFraction = (unit: string) => FRACTIONAL_UNITS.includes(unit);
export const fmtQty = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

// ── Movimientos ──────────────────────────────────────

export type MovementKind = 'Inicial' | 'Entrada' | 'Salida' | 'Ajuste';
export type EntryReason = 'Compra' | 'Devolución' | 'Reposición' | 'Donación' | 'Ajuste positivo';
// El hospedaje no vende productos ni tiene restaurante: las salidas son de uso interno
export type ExitReason = 'Consumo interno' | 'Uso en habitaciones' | 'Daño' | 'Pérdida' | 'Vencimiento' | 'Transferencia' | 'Baja';
export type AdjustReason = 'Inventario físico' | 'Pérdida' | 'Deterioro' | 'Error de registro' | 'Otro autorizado';

export const ENTRY_REASONS: EntryReason[] = ['Compra', 'Devolución', 'Reposición', 'Donación', 'Ajuste positivo'];
export const EXIT_REASONS: ExitReason[] = ['Consumo interno', 'Uso en habitaciones', 'Daño', 'Pérdida', 'Vencimiento', 'Transferencia', 'Baja'];
export const ADJUST_REASONS: AdjustReason[] = ['Inventario físico', 'Pérdida', 'Deterioro', 'Error de registro', 'Otro autorizado'];
/** Áreas responsables = las áreas de trabajo de Nómina. */
export const AREAS: string[] = [...STAFF_AREAS];

export const PREFIX: Record<MovementKind, string> = { Inicial: 'INI', Entrada: 'ENT', Salida: 'SAL', Ajuste: 'AJU' };

export interface MovementLine {
  productId: string;
  code:      string;
  name:      string;
  unit:      string;
  qty:       number;          // con signo: + entra, − sale
  unitCost:  number;
  before:    number;
  after:     number;
  reason?:   string;          // motivo por línea (ajustes)
  note?:     string;
}

export interface Movement {
  id:           string;
  number:       string;       // ENT-2026-0184
  kind:         MovementKind;
  reason:       string;       // tipo de entrada / motivo de salida / tipo de ajuste
  date:         string;
  time:         string;
  user:         string;
  lines:        MovementLine[];
  supplier?:    string;
  invoice?:     string;
  receivedBy?:  string;
  area?:        string;
  deliveredTo?: string;
  reference?:   string;
  location?:    string;
  observations: string;
}

export const lineValue = (l: MovementLine) => Math.round(l.qty * l.unitCost);
export const movementValue = (m: Movement) => m.lines.reduce((s, l) => s + lineValue(l), 0);

// ── Alertas ──────────────────────────────────────────

export type AlertType = 'Agotado' | 'Stock bajo' | 'Por vencer';
export type AlertPriority = 'Alta' | 'Media' | 'Baja';

export interface Alert {
  id:            number;
  key:           string;      // tipo + producto
  type:          AlertType;
  productId:     string;
  priority:      AlertPriority;
  generatedAt:   string;
  status:        'Activa' | 'Atendida';
  attendedAt?:   string;
  attendedBy?:   string;
  attendedRef?:  string;      // movimiento que la resolvió o "Manual"
  purchaseRequestedAt?: string;
}

/** Stock bajo = existencias iguales o menores al mínimo; por vencer = dentro de `expiryDays`. */
/** Umbrales de alerta (Configuración › Metas e indicadores). */
export interface AlertConfig { expiryDays: number; lowStock: boolean; unusualPct: number; maxShrinkPct: number; }
