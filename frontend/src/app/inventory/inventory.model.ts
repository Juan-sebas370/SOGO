export type StockStatus = 'Óptimo' | 'Bajo' | 'Crítico' | 'Vencido';
export type MovementType = 'Entrada' | 'Salida' | 'Ajuste';
export type ProductCategory = 'Alimentos' | 'Bebidas' | 'Limpieza' | 'Aseo' | 'Otros';

export interface Product {
  id:           string;
  code:         string;         // PROD-0001
  name:         string;
  category:     ProductCategory;
  unit:         string;
  stockActual:  number;
  stockMin:     number;
  stockMax:     number;
  unitCost:     number;
  salePrice:    number;
  location:     string;
  brand:        string;
  supplier:     string;
  description:  string;
  expiryDate:   string;
  isPerishable: boolean;
  status:       StockStatus;
  image?:       string;
}

export interface StockMovement {
  id:        string;
  date:      string;
  type:      MovementType;
  product:   string;
  quantity:  number;
  user:      string;
  reference: string;
}

export interface InventoryEntry {
  id:          string;
  number:      string;
  date:        string;
  supplier:    string;
  invoice:     string;
  observations:string;
  items:       EntryItem[];
  totalItems:  number;
  totalQty:    number;
  totalValue:  number;
}

export interface EntryItem {
  productId:  string;
  product:    string;
  unit:       string;
  quantity:   number;
  unitCost:   number;
  total:      number;
}
