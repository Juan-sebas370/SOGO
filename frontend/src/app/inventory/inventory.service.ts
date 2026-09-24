import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Product, StockStatus, StockMovement, InventoryEntry, ProductCategory } from './inventory.model';

const calcStatus = (p: Partial<Product>): StockStatus => {
  if (p.expiryDate && new Date(p.expiryDate) < new Date()) return 'Vencido';
  if ((p.stockActual ?? 0) <= 0) return 'Crítico';
  if ((p.stockActual ?? 0) < (p.stockMin ?? 0)) return 'Bajo';
  if ((p.stockActual ?? 0) <= (p.stockMin ?? 0) * 1.2) return 'Bajo';
  return 'Óptimo';
};

@Injectable({ providedIn: 'root' })
export class InventoryService {

  private products: Product[] = [
    { id:'1',  code:'PROD-0001', name:'Arroz Premium 25 kg',       category:'Alimentos', unit:'Bulto',   stockActual:129, stockMin:30,  stockMax:200, unitCost:85000,  salePrice:95000,  location:'Almacén Principal - Estante 1', brand:'La Favorita',   supplier:'Molinos del Valle S.A.S.',  description:'Arroz de grano largo premium.', expiryDate:'2025-06-01', isPerishable:false, status:'Óptimo' },
    { id:'2',  code:'PROD-0002', name:'Leche Entera 1 L',          category:'Alimentos', unit:'Unidad',  stockActual:80,  stockMin:50,  stockMax:300, unitCost:3200,   salePrice:3800,   location:'Almacén Principal - Estante 2', brand:'Alquería',      supplier:'Alquería S.A.',            description:'Leche entera pasteurizada 1 litro.', expiryDate:'2024-06-10', isPerishable:true, status:'Óptimo' },
    { id:'3',  code:'PROD-0003', name:'Café Molido 500 g',         category:'Bebidas',   unit:'Bolsa',   stockActual:45,  stockMin:20,  stockMax:150, unitCost:12500,  salePrice:15000,  location:'Almacén Principal - Estante 3', brand:'Juan Valdez',   supplier:'Café de Colombia Ltda.',   description:'Café molido 100% colombiano.', expiryDate:'2025-03-01', isPerishable:false, status:'Óptimo' },
    { id:'4',  code:'PROD-0004', name:'Azúcar Blanca 1 kg',        category:'Alimentos', unit:'Paquete', stockActual:60,  stockMin:40,  stockMax:250, unitCost:3500,   salePrice:4200,   location:'Almacén Principal - Estante 1', brand:'Manuelita',     supplier:'Manuelita S.A.',           description:'Azúcar blanca refinada.',     expiryDate:'2025-12-01', isPerishable:false, status:'Óptimo' },
    { id:'5',  code:'PROD-0005', name:'Detergente Líquido 1 L',    category:'Limpieza',  unit:'Unidad',  stockActual:25,  stockMin:30,  stockMax:100, unitCost:8500,   salePrice:11000,  location:'Bodega Limpieza - Estante 1',   brand:'Ariel',         supplier:'P&G Colombia',             description:'Detergente líquido multiusos.', expiryDate:'2026-01-01', isPerishable:false, status:'Bajo' },
    { id:'6',  code:'PROD-0006', name:'Aceite Vegetal 1 L',        category:'Alimentos', unit:'Unidad',  stockActual:5,   stockMin:20,  stockMax:100, unitCost:9800,   salePrice:12000,  location:'Almacén Principal - Estante 2', brand:'Gourmet',       supplier:'Aceites del Valle',        description:'Aceite vegetal para cocinar.',expiryDate:'2025-08-01', isPerishable:false, status:'Crítico' },
    { id:'7',  code:'PROD-0007', name:'Aceite Yogurt 5 L',         category:'Alimentos', unit:'Unidad',  stockActual:8,   stockMin:10,  stockMax:80,  unitCost:32000,  salePrice:38000,  location:'Almacén Principal - Estante 2', brand:'Alpina',        supplier:'Alpina S.A.',              description:'Yogurt natural familiar.',   expiryDate:'2024-05-30', isPerishable:true, status:'Vencido' },
    { id:'8',  code:'PROD-0008', name:'Jabón de Manos 500 ml',     category:'Aseo',      unit:'Unidad',  stockActual:18,  stockMin:15,  stockMax:80,  unitCost:7500,   salePrice:9500,   location:'Bodega Aseo - Estante 1',       brand:'Protex',        supplier:'Colgate-Palmolive',        description:'Jabón antibacterial.',       expiryDate:'2026-03-01', isPerishable:false, status:'Óptimo' },
    { id:'9',  code:'PROD-0009', name:'Harina de Trigo 1 kg',      category:'Alimentos', unit:'Paquete', stockActual:5,   stockMin:15,  stockMax:100, unitCost:3850,   salePrice:4500,   location:'Almacén Principal - Estante 3', brand:'Doña Blanca',   supplier:'Molinos del Valle S.A.S.', description:'Harina de trigo fortificada.', expiryDate:'2025-02-01', isPerishable:false, status:'Crítico' },
    { id:'10', code:'PROD-0010', name:'Café Molido 500 g',         category:'Bebidas',   unit:'Bolsa',   stockActual:16,  stockMin:15,  stockMax:80,  unitCost:14000,  salePrice:18000,  location:'Almacén Principal - Estante 3', brand:'Colcafé',       supplier:'Café de Colombia Ltda.',   description:'Café tostado molido.',       expiryDate:'2025-04-01', isPerishable:false, status:'Óptimo' },
  ];

  private movements: StockMovement[] = [
    { id:'1', date:'2024-05-24', type:'Entrada', product:'Arroz Premium 25 kg',    quantity:50, user:'María López', reference:'FV-0001288' },
    { id:'2', date:'2024-05-24', type:'Salida',  product:'Leche Entera 1 L',       quantity:30, user:'Juan Pérez',  reference:'Consumo interno' },
    { id:'3', date:'2024-05-23', type:'Entrada', product:'Detergente Líquido 1 L', quantity:45, user:'Ana Gómez',   reference:'FV-0001255' },
    { id:'4', date:'2024-05-23', type:'Salida',  product:'Café Molido 500 g',      quantity:12, user:'Juan Pérez',  reference:'Restaurante' },
    { id:'5', date:'2024-05-22', type:'Ajuste',  product:'Café Molido 500 g',      quantity:5,  user:'Carlos Ruiz', reference:'Ajuste conteo' },
  ];

  private products$ = new BehaviorSubject<Product[]>(this.products);

  getAll():    Observable<Product[]> { return this.products$.asObservable(); }
  getById(id: string): Product | undefined { return this.products.find(p => p.id === id); }

  getMovements(): StockMovement[] { return this.movements; }

  create(p: Omit<Product,'id'|'code'|'status'>): Product {
    const n = this.products.length + 1;
    const newP: Product = {
      ...p,
      id: String(Date.now()),
      code: `PROD-${String(n).padStart(4,'0')}`,
      status: calcStatus(p)
    };
    this.products = [newP, ...this.products];
    this.products$.next(this.products);
    return newP;
  }

  update(id: string, changes: Partial<Product>): void {
    this.products = this.products.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...changes };
      updated.status = calcStatus(updated);
      return updated;
    });
    this.products$.next(this.products);
  }

  addEntry(entry: Omit<InventoryEntry,'id'|'number'|'totalItems'|'totalQty'|'totalValue'>): InventoryEntry {
    // Actualizar stocks
    entry.items.forEach(item => {
      const prod = this.products.find(p => p.id === item.productId);
      if (prod) this.update(prod.id, { stockActual: prod.stockActual + item.quantity, unitCost: item.unitCost });
    });
    const totalQty   = entry.items.reduce((a,i) => a + i.quantity, 0);
    const totalValue = entry.items.reduce((a,i) => a + i.total, 0);
    const newEntry: InventoryEntry = {
      ...entry, id: String(Date.now()),
      number: `FV-${String(Date.now()).slice(-7)}`,
      totalItems: entry.items.length, totalQty, totalValue
    };
    // Registrar movimientos
    entry.items.forEach(item => {
      this.movements.unshift({ id: String(Date.now()), date: entry.date, type:'Entrada', product: item.product, quantity: item.quantity, user: 'Administrador', reference: entry.invoice });
    });
    return newEntry;
  }

  getAlerts() {
    const low      = this.products.filter(p => p.status === 'Bajo').length;
    const critical = this.products.filter(p => p.status === 'Crítico').length;
    const expiring = this.products.filter(p => {
      if (!p.expiryDate) return false;
      const days = (new Date(p.expiryDate).getTime() - Date.now()) / 86400000;
      return days > 0 && days <= 30;
    }).length;
    return { low, critical, expiring };
  }

  getValuationReport() {
    const byCategory: Record<string, { products:number; units:number; costValue:number; saleValue:number }> = {};
    this.products.forEach(p => {
      if (!byCategory[p.category]) byCategory[p.category] = { products:0, units:0, costValue:0, saleValue:0 };
      byCategory[p.category].products++;
      byCategory[p.category].units      += p.stockActual;
      byCategory[p.category].costValue  += p.stockActual * p.unitCost;
      byCategory[p.category].saleValue  += p.stockActual * p.salePrice;
    });
    const totals = Object.values(byCategory).reduce((a,c) => ({
      products: a.products + c.products,
      units:    a.units    + c.units,
      costValue:a.costValue+ c.costValue,
      saleValue:a.saleValue+ c.saleValue,
    }), { products:0, units:0, costValue:0, saleValue:0 });
    return { byCategory, totals };
  }

  getStats() {
    const total      = this.products.length;
    const totalValue = this.products.reduce((a,p) => a + p.stockActual * p.unitCost, 0);
    const totalUnits = this.products.reduce((a,p) => a + p.stockActual, 0);
    const lowStock   = this.products.filter(p => p.status === 'Bajo' || p.status === 'Crítico').length;
    const expiring   = this.products.filter(p => p.status === 'Vencido').length;
    return { total, totalValue, totalUnits, lowStock, expiring };
  }
}
