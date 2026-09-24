import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Voucher, VoucherStatus, Account, JournalEntry } from './accounting.model';

@Injectable({ providedIn: 'root' })
export class AccountingService {

  readonly accounts: Account[] = [
    { code:'1105', name:'Caja General',               type:'Activo' },
    { code:'1305', name:'Cuentas por Cobrar',          type:'Activo' },
    { code:'1405', name:'Inventarios',                 type:'Activo' },
    { code:'1520', name:'Maquinaria y Equipo',         type:'Activo' },
    { code:'2105', name:'Obligaciones Financieras',    type:'Pasivo' },
    { code:'2205', name:'Proveedores Nacionales',      type:'Pasivo' },
    { code:'2365', name:'Retenciones y Aportes',       type:'Pasivo' },
    { code:'3105', name:'Capital Social',              type:'Patrimonio' },
    { code:'3605', name:'Utilidad del Ejercicio',      type:'Patrimonio' },
    { code:'4165', name:'Ingresos por Alojamiento',    type:'Ingreso' },
    { code:'4155', name:'Ingresos Restaurante',        type:'Ingreso' },
    { code:'4175', name:'Otros Ingresos',              type:'Ingreso' },
    { code:'5105', name:'Gastos de Personal',          type:'Gasto' },
    { code:'5205', name:'Gastos Generales',            type:'Gasto' },
    { code:'6105', name:'Costo de Alimentos y Bebidas',type:'Costo' },
  ];

  private vouchers: Voucher[] = [
    { id:'1', number:'ING-000123', type:'ING', date:'2024-05-24', concept:'Ingreso por alojamiento', third:'María López',   debit:2450000, credit:0,       status:'Publicado',   tercero:'María López',   numDoc:'ING-000123', centro:'Principal', observations:'Ingreso correspondiente al alojamiento del 24/05/2024.', lines:[{account:'1105',accountName:'Caja General',debit:2450000,credit:0},{account:'4165',accountName:'Ingresos por Alojamiento',debit:0,credit:2450000}] },
    { id:'2', number:'FAC-000982', type:'FAC', date:'2024-05-24', concept:'Factura FE-000162',        third:'María López',   debit:0,       credit:809200,  status:'Publicado',   tercero:'María López',   numDoc:'FAC-000982', centro:'Principal', observations:'',  lines:[{account:'1305',accountName:'Cuentas por Cobrar',debit:809200,credit:0},{account:'4165',accountName:'Ingresos por Alojamiento',debit:0,credit:680000},{account:'2365',accountName:'IVA por Alojamiento',debit:0,credit:129200}] },
    { id:'3', number:'PAG-000567', type:'PAG', date:'2024-05-25', concept:'Pago a proveedor',         third:'ServiLine S.A.S',debit:0,      credit:1250000, status:'Publicado',   tercero:'ServiLine S.A.S',numDoc:'PAG-000567',centro:'Principal', observations:'',  lines:[{account:'2205',accountName:'Proveedores Nacionales',debit:1250000,credit:0},{account:'1105',accountName:'Caja General',debit:0,credit:1250000}] },
    { id:'4', number:'ING-000124', type:'ING', date:'2024-05-25', concept:'Venta restaurante',        third:'Consumidor Final',debit:395200,credit:0,       status:'Publicado',   tercero:'Consumidor Final',numDoc:'ING-000124',centro:'Principal', observations:'',  lines:[{account:'1105',accountName:'Caja General',debit:395200,credit:0},{account:'4155',accountName:'Ingresos Restaurante',debit:0,credit:395200}] },
    { id:'5', number:'EGR-000085', type:'EGR', date:'2024-05-26', concept:'Pago nómina',              third:'Nómina Mayo 2024',debit:0,     credit:41220000,status:'Publicado',   tercero:'Empleados',     numDoc:'EGR-000085', centro:'Principal', observations:'Nómina correspondiente al mes de mayo de 2024.', lines:[{account:'5105',accountName:'Gastos de Personal',debit:41220000,credit:0},{account:'1105',accountName:'Caja General',debit:0,credit:41220000}] },
    { id:'6', number:'ING-000125', type:'ING', date:'2024-05-27', concept:'Ingreso por alojamiento',  third:'Consumidor Final',debit:1365000,credit:0,      status:'En proceso',  tercero:'Consumidor Final',numDoc:'ING-000125',centro:'Principal', observations:'',  lines:[{account:'1105',accountName:'Caja General',debit:1365000,credit:0},{account:'4165',accountName:'Ingresos por Alojamiento',debit:0,credit:1365000}] },
    { id:'7', number:'EGR-000086', type:'EGR', date:'2024-05-28', concept:'Compra insumos',           third:'Alimentos del Eje',debit:0,    credit:1069000, status:'Publicado',   tercero:'Alimentos del Eje',numDoc:'EGR-000086',centro:'Principal',observations:'',  lines:[{account:'6105',accountName:'Costo Alimentos',debit:1069000,credit:0},{account:'2205',accountName:'Proveedores Nacionales',debit:0,credit:1069000}] },
  ];

  private vouchers$ = new BehaviorSubject<Voucher[]>(this.vouchers);

  getAll():    Observable<Voucher[]>         { return this.vouchers$.asObservable(); }
  getById(id:string): Voucher|undefined      { return this.vouchers.find(v => v.id === id); }

  create(v: Omit<Voucher,'id'|'number'>): Voucher {
    const type   = v.type;
    const count  = this.vouchers.filter(x => x.type === type).length + 124;
    const newV: Voucher = { ...v, id: String(Date.now()), number: `${type}-${String(count).padStart(6,'0')}` };
    this.vouchers = [newV, ...this.vouchers];
    this.vouchers$.next(this.vouchers);
    return newV;
  }

  update(id:string, changes: Partial<Voucher>): void {
    this.vouchers = this.vouchers.map(v => v.id === id ? { ...v, ...changes } : v);
    this.vouchers$.next(this.vouchers);
  }

  annul(id:string): void { this.update(id, { status:'Anulado' }); }

  getJournal(from:string, to:string, account:string): JournalEntry[] {
    const entries: JournalEntry[] = [];
    this.vouchers.forEach(v => {
      if (v.date < from || v.date > to) return;
      v.lines.forEach(l => {
        if (account && account !== 'Todas' && l.account !== account) return;
        entries.push({
          date: v.date, voucher: v.number, concept: v.concept,
          account: l.account, accountName: l.accountName,
          description: v.observations || v.concept,
          debit: l.debit, credit: l.credit
        });
      });
    });
    return entries.sort((a,b) => a.date.localeCompare(b.date));
  }

  getIncomeStatement() {
    return {
      period: 'Mayo 2024',
      operationalIncome: {
        alojamiento:  122800000,
        restaurante:   53880000,
        otros:          5170000,
        total:        181850000
      },
      operationalCosts: {
        alimentosBebidas: 28250000,
        personal:         71330000,
        generales:        37820000,
        total:           137400000
      },
      netProfit: 54420000
    };
  }

  getBalanceSheet() {
    return {
      assets: {
        current:    162680000,
        nonCurrent: 203450000,
        total:      366130000
      },
      liabilities: {
        current:    78850000,
        nonCurrent: 42760000,
        total:      121610000
      },
      equity: 244520000,
      indicators: {
        currentRatio:        1.54,
        debtToEquity:        52.0
      }
    };
  }

  getStats() {
    const total    = this.vouchers.length;
    const income   = this.vouchers.filter(v => v.type === 'ING').reduce((a,v) => a + v.debit, 0);
    const expense  = this.vouchers.filter(v => v.type === 'EGR' || v.type === 'PAG').reduce((a,v) => a + v.credit, 0);
    const profit   = income - expense;
    return { total, income, expense, profit };
  }
}
