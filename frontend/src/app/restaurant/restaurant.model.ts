export type OrderStatus = 'Preparando' | 'En camino' | 'Servido' | 'Cancelado' | 'En cocina';
export type TableStatus = 'Disponible' | 'Ocupada' | 'Reservada' | 'Sin limpiar';
export type TableZone  = 'Salón Principal' | 'Terraza' | 'Bar' | 'VIP';

export interface OrderItem {
  product:   string;
  category:  string;
  quantity:  number;
  unitPrice: number;
  subtotal:  number;
  status:    'Preparando' | 'Listo';
}

export interface Order {
  id:           string;
  number:       string;        // PED-00845
  type:         'En mesa' | 'Domicilio' | 'Para llevar';
  tableNumber:  string;
  clientName:   string;
  docNumber:    string;
  phone:        string;
  waiter:       string;
  persons:      number;
  items:        OrderItem[];
  subtotal:     number;
  iva:          number;
  total:        number;
  observations: string;
  status:       OrderStatus;
  dateTime:     string;
}

export interface RestaurantTable {
  id:       string;
  number:   number;
  zone:     TableZone;
  capacity: number;
  status:   TableStatus;
  orderId?: string;
  total?:   number;
}

export interface MenuItem {
  id:       string;
  name:     string;
  category: 'Alimentos' | 'Bebidas' | 'Postres' | 'Otros';
  price:    number;
}
