import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Order, OrderStatus, RestaurantTable, MenuItem } from './restaurant.model';

@Injectable({ providedIn: 'root' })
export class RestaurantService {

  readonly menu: MenuItem[] = [
    { id:'m1',  name:'Hamburguesa Clásica',  category:'Alimentos', price:28000 },
    { id:'m2',  name:'Jugo Natural (Mango)', category:'Bebidas',   price:8000  },
    { id:'m3',  name:'Papas a la Francesa',  category:'Alimentos', price:9000  },
    { id:'m4',  name:'Bandeja Paisa',        category:'Alimentos', price:35000 },
    { id:'m5',  name:'Arroz con Pollo',      category:'Alimentos', price:25000 },
    { id:'m6',  name:'Agua Mineral',         category:'Bebidas',   price:4000  },
    { id:'m7',  name:'Gaseosa',              category:'Bebidas',   price:5000  },
    { id:'m8',  name:'Brownie con Helado',   category:'Postres',   price:12000 },
    { id:'m9',  name:'Ensalada de Frutas',   category:'Postres',   price:10000 },
    { id:'m10', name:'Café Americano',       category:'Bebidas',   price:6000  },
    { id:'m11', name:'Tostadas',             category:'Alimentos', price:7000  },
    { id:'m12', name:'Sopa del Día',         category:'Alimentos', price:15000 },
  ];

  private orders: Order[] = [
    { id:'1', number:'PED-00845', type:'En mesa',  tableNumber:'Mesa 05', clientName:'Ana Gómez',      docNumber:'1234567890', phone:'300 123-4567', waiter:'Juan Camilo', persons:3, items:[{product:'Hamburguesa Clásica',category:'Alimentos',quantity:2,unitPrice:28000,subtotal:56000,status:'Preparando'},{product:'Jugo Natural (Mango)',category:'Bebidas',quantity:2,unitPrice:8000,subtotal:16000,status:'Preparando'},{product:'Papas a la Francesa',category:'Alimentos',quantity:1,unitPrice:9000,subtotal:9000,status:'Preparando'}], subtotal:81000, iva:15390, total:96390, observations:'Sin cebolla en las hamburguesas.', status:'Preparando', dateTime:'2024-05-24T10:25' },
    { id:'2', number:'PED-00844', type:'En mesa',  tableNumber:'Mesa 03', clientName:'Juan Pérez',     docNumber:'9876543210', phone:'310 234-5678', waiter:'María',       persons:2, items:[{product:'Bandeja Paisa',category:'Alimentos',quantity:2,unitPrice:35000,subtotal:70000,status:'Listo'},{product:'Gaseosa',category:'Bebidas',quantity:2,unitPrice:5000,subtotal:10000,status:'Listo'}], subtotal:80000, iva:15200, total:95200, observations:'', status:'En camino', dateTime:'2024-05-24T10:18' },
    { id:'3', number:'PED-00843', type:'Domicilio',tableNumber:'Dom. #32', clientName:'María López',   docNumber:'1122334455', phone:'320 345-6789', waiter:'Carlos',      persons:1, items:[{product:'Arroz con Pollo',category:'Alimentos',quantity:2,unitPrice:25000,subtotal:50000,status:'Preparando'},{product:'Agua Mineral',category:'Bebidas',quantity:2,unitPrice:4000,subtotal:8000,status:'Listo'}], subtotal:58000, iva:11020, total:69020, observations:'', status:'En camino', dateTime:'2024-05-24T10:10' },
    { id:'4', number:'PED-00842', type:'En mesa',  tableNumber:'Mesa 05', clientName:'Carlos Ruiz',   docNumber:'AB123456',   phone:'350 456-7890', waiter:'Juan Camilo', persons:4, items:[{product:'Bandeja Paisa',category:'Alimentos',quantity:4,unitPrice:35000,subtotal:140000,status:'Listo'}], subtotal:140000, iva:26600, total:166600, observations:'', status:'Servido', dateTime:'2024-05-24T09:45' },
    { id:'5', number:'PED-00841', type:'En mesa',  tableNumber:'Mesa 07', clientName:'Luisa Martínez',docNumber:'5566778899', phone:'315 567-8901', waiter:'María',       persons:2, items:[{product:'Sopa del Día',category:'Alimentos',quantity:2,unitPrice:15000,subtotal:30000,status:'Preparando'},{product:'Café Americano',category:'Bebidas',quantity:2,unitPrice:6000,subtotal:12000,status:'Preparando'}], subtotal:42000, iva:7980, total:49980, observations:'', status:'En cocina', dateTime:'2024-05-24T09:30' },
    { id:'6', number:'PED-00840', type:'Domicilio',tableNumber:'Dom. #31', clientName:'Pedro Ramírez',docNumber:'6677889900', phone:'312 678-9012', waiter:'Carlos',      persons:1, items:[{product:'Hamburguesa Clásica',category:'Alimentos',quantity:3,unitPrice:28000,subtotal:84000,status:'Preparando'}], subtotal:84000, iva:15960, total:99960, observations:'', status:'En camino', dateTime:'2024-05-24T08:50' },
  ];

  private tables: RestaurantTable[] = [
    { id:'t1',  number:1,  zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t2',  number:2,  zone:'Salón Principal', capacity:4, status:'Ocupada',    orderId:'1', total:96390  },
    { id:'t3',  number:3,  zone:'Salón Principal', capacity:6, status:'Disponible' },
    { id:'t4',  number:4,  zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t5',  number:5,  zone:'Salón Principal', capacity:2, status:'Reservada',  total:10500 },
    { id:'t6',  number:6,  zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t7',  number:7,  zone:'Salón Principal', capacity:4, status:'Ocupada',    orderId:'5', total:49980 },
    { id:'t8',  number:8,  zone:'Salón Principal', capacity:6, status:'Disponible' },
    { id:'t9',  number:9,  zone:'Salón Principal', capacity:4, status:'Sin limpiar' },
    { id:'t10', number:10, zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t11', number:11, zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t12', number:12, zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t13', number:13, zone:'Salón Principal', capacity:4, status:'Reservada'  },
    { id:'t14', number:14, zone:'Salón Principal', capacity:4, status:'Disponible' },
    { id:'t15', number:15, zone:'Salón Principal', capacity:2, status:'Disponible' },
    { id:'t16', number:1,  zone:'Terraza',         capacity:4, status:'Disponible' },
    { id:'t17', number:2,  zone:'Terraza',         capacity:4, status:'Ocupada'    },
    { id:'t18', number:3,  zone:'Terraza',         capacity:4, status:'Disponible' },
    { id:'t19', number:1,  zone:'Bar',             capacity:2, status:'Disponible' },
    { id:'t20', number:2,  zone:'Bar',             capacity:2, status:'Ocupada'    },
    { id:'t21', number:1,  zone:'VIP',             capacity:6, status:'Reservada'  },
    { id:'t22', number:2,  zone:'VIP',             capacity:6, status:'Disponible' },
  ];

  private orders$ = new BehaviorSubject<Order[]>(this.orders);
  private tables$ = new BehaviorSubject<RestaurantTable[]>(this.tables);

  getOrders():  Observable<Order[]>          { return this.orders$.asObservable(); }
  getTables():  Observable<RestaurantTable[]> { return this.tables$.asObservable(); }
  getOrderById(id: string): Order | undefined { return this.orders.find(o => o.id === id); }

  createOrder(o: Omit<Order,'id'|'number'>): Order {
    const n = this.orders.length + 840;
    const newO: Order = { ...o, id: String(Date.now()), number: `PED-${String(n).padStart(5,'0')}` };
    this.orders = [newO, ...this.orders];
    this.orders$.next(this.orders);
    return newO;
  }

  updateOrder(id: string, changes: Partial<Order>): void {
    this.orders = this.orders.map(o => o.id === id ? { ...o, ...changes } : o);
    this.orders$.next(this.orders);
  }

  updateTableStatus(id: string, status: RestaurantTable['status']): void {
    this.tables = this.tables.map(t => t.id === id ? { ...t, status } : t);
    this.tables$.next(this.tables);
  }

  getStats() {
    const sales   = this.orders.filter(o => o.status !== 'Cancelado').reduce((a,o) => a + o.total, 0);
    const total   = this.orders.length;
    const active  = this.tables.filter(t => t.status === 'Ocupada').length;
    const products= this.orders.reduce((a,o) => a + o.items.reduce((b,i) => b + i.quantity, 0), 0);
    const avgTicket = total > 0 ? Math.round(sales / total) : 0;
    const byCategory = {
      Alimentos: 68, Bebidas: 20, Postres: 8, Otros: 4
    };
    return { sales, total, active, products, avgTicket, byCategory };
  }
}
