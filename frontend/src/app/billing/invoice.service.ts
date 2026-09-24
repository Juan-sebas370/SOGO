import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Invoice, InvoiceStatus } from './invoice.model';

const EVENTS_GEN = [
  { label: 'Factura generada',              date: '24/05/2024 10:32 a.m.' },
  { label: 'Factura firmada electrónicamente', date: '24/05/2024 10:32 a.m.' },
  { label: 'Factura enviada a la DIAN',      date: '24/05/2024 10:32 a.m.' },
  { label: 'Aceptada por la DIAN',           date: '24/05/2024 10:32 a.m.' },
  { label: 'Correo enviado al cliente',      date: '24/05/2024 10:33 a.m.' },
];

@Injectable({ providedIn: 'root' })
export class InvoiceService {

  private data: Invoice[] = [
    { id:'1', number:'FE-000162', clientName:'María López',    docType:'Cédula de Ciudadanía', docNumber:'1234567890', email:'maria.lopez@email.com', phone:'300 123-4567', issueDate:'2024-05-24', dueDate:'2024-05-24', paymentMethod:'Tarjeta de Crédito', concepts:[{description:'Alojamiento',quantity:4,unitValue:150000,total:600000},{description:'Desayuno',quantity:4,unitValue:20000,total:80000}], subtotal:680000, iva:129200, total:809200, observations:'Servicio de alojamiento del 20/05/2024 al 24/05/2024.', status:'Pagada',    cufe:'9f7c2ef56abc1c3a7e0b74efa9f7c2ef56', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', sentAt:'2024-05-24T10:33', events:[...EVENTS_GEN] },
    { id:'2', number:'FE-000161', clientName:'Juan Pérez',     docType:'Cédula de Ciudadanía', docNumber:'9876543210', email:'juan.perez@email.com',   phone:'310 234-5678', issueDate:'2024-05-24', dueDate:'2024-05-26', paymentMethod:'Efectivo',           concepts:[{description:'Alojamiento',quantity:1,unitValue:280000,total:280000}],                                                                                subtotal:280000, iva:53200,  total:333200, observations:'', status:'Pagada',    cufe:'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', sentAt:'2024-05-24T11:10', events:[...EVENTS_GEN] },
    { id:'3', number:'FE-000160', clientName:'Ana Gómez',      docType:'Cédula de Ciudadanía', docNumber:'1122334455', email:'ana.gomez@email.com',    phone:'320 345-6789', issueDate:'2024-05-25', dueDate:'2024-05-28', paymentMethod:'Transferencia',      concepts:[{description:'Alojamiento',quantity:2,unitValue:160000,total:320000},{description:'Desayuno',quantity:2,unitValue:18000,total:36000}],      subtotal:356000, iva:67640,  total:423640, observations:'', status:'Pendiente', cufe:'', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', events:[] },
    { id:'4', number:'FE-000159', clientName:'Carlos Ruiz',    docType:'Pasaporte',            docNumber:'AB123456',   email:'carlos.ruiz@email.com',  phone:'350 456-7890', issueDate:'2024-05-26', dueDate:'2024-05-28', paymentMethod:'Tarjeta de Débito',  concepts:[{description:'Alojamiento',quantity:2,unitValue:340000,total:680000}],                                                                                subtotal:680000, iva:129200, total:809200, observations:'', status:'Pagada',    cufe:'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', sentAt:'2024-05-26T13:30', events:[...EVENTS_GEN] },
    { id:'5', number:'FE-000158', clientName:'Luisa Martínez', docType:'Cédula de Ciudadanía', docNumber:'5566778899', email:'luisa.m@email.com',       phone:'315 567-8901', issueDate:'2024-05-27', dueDate:'2024-05-29', paymentMethod:'Efectivo',           concepts:[{description:'Alojamiento',quantity:2,unitValue:160000,total:320000}],                                                                                subtotal:320000, iva:60800,  total:380800, observations:'', status:'Pendiente', cufe:'', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', events:[] },
    { id:'6', number:'FE-000157', clientName:'Pedro Ramírez',  docType:'Cédula de Ciudadanía', docNumber:'6677889900', email:'pedro.r@email.com',       phone:'312 678-9012', issueDate:'2024-05-22', dueDate:'2024-05-22', paymentMethod:'Tarjeta de Crédito', concepts:[{description:'Alojamiento',quantity:1,unitValue:280000,total:280000}],                                                                                subtotal:280000, iva:53200,  total:333200, observations:'', status:'Rechazada', cufe:'', techProvider:'Factuatech S.A.S.', dianResolution:'18764321246676 de 09/21/2024', events:[] },
  ];

  private invoices$ = new BehaviorSubject<Invoice[]>(this.data);

  getAll():    Observable<Invoice[]> { return this.invoices$.asObservable(); }
  getById(id: string): Invoice | undefined { return this.data.find(i => i.id === id); }

  create(inv: Omit<Invoice,'id'|'number'|'cufe'|'events'|'sentAt'>): Invoice {
    const n = this.data.length + 157;
    const newInv: Invoice = {
      ...inv,
      id: String(Date.now()),
      number: `FE-${String(n).padStart(6,'0')}`,
      cufe: Math.random().toString(36).substring(2, 38),
      events: [
        { label:'Factura generada',              date: new Date().toLocaleString() },
        { label:'Factura firmada electrónicamente', date: new Date().toLocaleString() },
        { label:'Factura enviada a la DIAN',      date: new Date().toLocaleString() },
        { label:'Aceptada por la DIAN',           date: new Date().toLocaleString() },
      ]
    };
    this.data = [newInv, ...this.data];
    this.invoices$.next(this.data);
    return newInv;
  }

  update(id: string, changes: Partial<Invoice>): void {
    this.data = this.data.map(i => i.id === id ? { ...i, ...changes } : i);
    this.invoices$.next(this.data);
  }

  send(id: string, email: string): void {
    this.update(id, {
      sentAt: new Date().toISOString(),
      status: 'Pagada',
      events: [
        ...(this.getById(id)?.events ?? []),
        { label: 'Correo enviado al cliente', date: new Date().toLocaleString() }
      ]
    });
  }

  annul(id: string): void { this.update(id, { status: 'Anulada' }); }

  getStats() {
    const total   = this.data.length;
    const paid    = this.data.filter(i => i.status === 'Pagada').length;
    const pending = this.data.filter(i => i.status === 'Pendiente').length;
    const annulled= this.data.filter(i => i.status === 'Anulada').length;
    const rejected= this.data.filter(i => i.status === 'Rechazada').length;
    const income  = this.data.filter(i => i.status === 'Pagada').reduce((a,i) => a + i.total, 0);
    const pendingAmount = this.data.filter(i => i.status === 'Pendiente').reduce((a,i) => a + i.total, 0);
    return { total, paid, pending, annulled, rejected, income, pendingAmount };
  }

  // Ingresos agrupados por fecha real de emisión (no es una serie de "últimos N días":
  // son las fechas que efectivamente existen en los datos), para un gráfico honesto.
  getIncomeByDate(): { date: string; amount: number }[] {
    const byDate = new Map<string, number>();
    this.data.filter(i => i.status === 'Pagada').forEach(i => {
      byDate.set(i.issueDate, (byDate.get(i.issueDate) ?? 0) + i.total);
    });
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
  }
}
