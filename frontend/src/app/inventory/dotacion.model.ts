// =====================================================================
// DOTACIÓN DE LA CASA — modelo
// Lo que hay en cada piso (camas, lencería, equipos, cocina...). El precio
// unitario es lo que se le cobra al huésped si pierde o daña una unidad; el
// hospedaje no vende comidas ni bebidas: presta la cocina con su dotación.
// =====================================================================

export const DOTACION_CATEGORIES = [
  'Muebles y enseres', 'Lencería', 'Equipos eléctricos y de comunicación', 'Dotación de cocina', 'Amenities',
] as const;
export type DotacionCategory = typeof DOTACION_CATEGORIES[number];

export type DamageReason = 'Faltante' | 'Dañado';
export const DAMAGE_REASONS: DamageReason[] = ['Faltante', 'Dañado'];

export interface FloorQty {
  floor:      number;
  quantity:   number;
  annualUse?: number;   // solo amenities: consumo anual estimado (no son existencias)
}

export interface DotacionItem {
  id:         number;
  category:   DotacionCategory;
  name:       string;
  unitPrice:  number;   // cobro al huésped por unidad perdida o dañada
  chargeable: boolean;  // false: equipos del personal y amenities
  order:      number;
  floors:     FloorQty[];
  updatedAt?: string;
}

export const qtyOn = (item: DotacionItem, floor: number): number =>
  item.floors.find(f => f.floor === floor)?.quantity ?? 0;

export const annualOn = (item: DotacionItem, floor: number): number =>
  item.floors.find(f => f.floor === floor)?.annualUse ?? 0;

export const totalQty = (item: DotacionItem): number =>
  item.floors.reduce((s, f) => s + f.quantity, 0);
