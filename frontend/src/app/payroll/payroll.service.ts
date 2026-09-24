import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Payroll, PayrollStatus, Employee, PayrollEmployee } from './payroll.model';

@Injectable({ providedIn: 'root' })
export class PayrollService {

  readonly employees: Employee[] = [
    { id:'e1', name:'María López',    position:'Recepcionista',  baseSalary:1600000, active:true },
    { id:'e2', name:'Juan Camilo',    position:'Mesero',         baseSalary:1300000, active:true },
    { id:'e3', name:'Ana Gómez',      position:'Cocinera',       baseSalary:1500000, active:true },
    { id:'e4', name:'Carlos Ruiz',    position:'Mantenimiento',  baseSalary:1400000, active:true },
    { id:'e5', name:'Laura Martínez', position:'Administrativa', baseSalary:2200000, active:true },
    { id:'e6', name:'Pedro Castro',   position:'Seguridad',      baseSalary:1300000, active:true },
    { id:'e7', name:'Sofía Herrera',  position:'Camarera',       baseSalary:1300000, active:true },
    { id:'e8', name:'Diego Morales',  position:'Barista',        baseSalary:1350000, active:false },
  ];

  readonly conceptsList = [
    'Salario Básico', 'Horas Extras', 'Recargos', 'Bonificaciones',
    'Auxilio de Transporte', 'Auxilio de Alimentación', 'Otros'
  ];

  private buildItems(concepts: string[]): PayrollEmployee[] {
    return this.employees.filter(e => e.active).map(e => {
      const extras     = concepts.includes('Horas Extras')          ? Math.round(e.baseSalary * 0.12) : 0;
      const recargos   = concepts.includes('Recargos')              ? Math.round(e.baseSalary * 0.045) : 0;
      const bonos      = concepts.includes('Bonificaciones')        ? Math.round(e.baseSalary * 0.10) : 0;
      const transporte = concepts.includes('Auxilio de Transporte') ? 162000 : 0;
      const alimento   = concepts.includes('Auxilio de Alimentación') ? 100000 : 0;
      const otros      = concepts.includes('Otros')                 ? 50000 : 0;
      const earnings   = e.baseSalary + extras + recargos + bonos + transporte + alimento + otros;
      const health     = Math.round(earnings * 0.04);
      const pension    = Math.round(earnings * 0.04);
      const deductions = health + pension;
      return { employeeId:e.id, name:e.name, position:e.position, baseSalary:e.baseSalary, earnings, deductions, net: earnings - deductions };
    });
  }

  private data: Payroll[] = [
    { id:'1', period:'Mayo 2024',      startDate:'2024-05-01', endDate:'2024-05-31', workedDays:30, employees:24, concepts:['Salario Básico','Horas Extras','Recargos','Bonificaciones','Auxilio de Transporte','Auxilio de Alimentación'], items:[], totalEarnings:58450000, totalDeductions:17230000, netPayroll:41220000, status:'Completada', observations:'Nómina correspondiente al mes de mayo de 2024.', generatedAt:'2024-05-24T11:35' },
    { id:'2', period:'Abril 2024',     startDate:'2024-04-01', endDate:'2024-04-30', workedDays:30, employees:24, concepts:['Salario Básico','Horas Extras','Bonificaciones','Auxilio de Transporte'], items:[], totalEarnings:55190000, totalDeductions:16270000, netPayroll:38920000, status:'Completada', observations:'', generatedAt:'2024-04-30T14:00' },
    { id:'3', period:'Marzo 2024',     startDate:'2024-03-01', endDate:'2024-03-31', workedDays:31, employees:23, concepts:['Salario Básico','Horas Extras','Recargos','Auxilio de Transporte'], items:[], totalEarnings:54130000, totalDeductions:15370000, netPayroll:38760000, status:'Completada', observations:'', generatedAt:'2024-03-31T15:00' },
    { id:'4', period:'Febrero 2024',   startDate:'2024-02-01', endDate:'2024-02-29', workedDays:29, employees:23, concepts:['Salario Básico','Bonificaciones','Auxilio de Transporte'], items:[], totalEarnings:51990000, totalDeductions:14160000, netPayroll:37830000, status:'Completada', observations:'', generatedAt:'2024-02-29T10:00' },
    { id:'5', period:'Enero 2024',     startDate:'2024-01-01', endDate:'2024-01-31', workedDays:31, employees:22, concepts:['Salario Básico','Horas Extras','Auxilio de Transporte'], items:[], totalEarnings:50070000, totalDeductions:14160000, netPayroll:35910000, status:'Completada', observations:'', generatedAt:'2024-01-31T10:00' },
    { id:'6', period:'Diciembre 2023', startDate:'2023-12-01', endDate:'2023-12-31', workedDays:31, employees:22, concepts:['Salario Básico','Bonificaciones','Horas Extras','Auxilio de Transporte'], items:[], totalEarnings:50210000, totalDeductions:13840000, netPayroll:36370000, status:'Completada', observations:'Incluye prima de servicios.', generatedAt:'2023-12-31T09:00' },
  ];

  private payrolls$ = new BehaviorSubject<Payroll[]>(this.data);

  getAll():    Observable<Payroll[]>          { return this.payrolls$.asObservable(); }
  getById(id: string): Payroll | undefined    { return this.data.find(p => p.id === id); }

  create(p: Omit<Payroll,'id'|'items'|'totalEarnings'|'totalDeductions'|'netPayroll'>): Payroll {
    const items = this.buildItems(p.concepts);
    const totalEarnings   = items.reduce((a,i) => a + i.earnings, 0);
    const totalDeductions = items.reduce((a,i) => a + i.deductions, 0);
    const newP: Payroll = {
      ...p, id: String(Date.now()),
      items, employees: items.length,
      totalEarnings, totalDeductions,
      netPayroll: totalEarnings - totalDeductions,
      status: 'En proceso'
    };
    this.data = [newP, ...this.data];
    this.payrolls$.next(this.data);
    return newP;
  }

  updateStatus(id: string, status: PayrollStatus, generatedAt?: string): void {
    this.data = this.data.map(p => p.id === id ? { ...p, status, ...(generatedAt ? { generatedAt } : {}) } : p);
    this.payrolls$.next(this.data);
  }

  getActiveEmployees(): Employee[] { return this.employees.filter(e => e.active); }

  buildPreview(id: string): Payroll | undefined {
    const p = this.getById(id);
    if (!p) return undefined;
    const items = this.buildItems(p.concepts);
    return { ...p, items };
  }

  getConceptBreakdown(id: string) {
    const p = this.getById(id);
    if (!p) return [];
    const active = this.getActiveEmployees();
    const n = active.length;
    return [
      { name:'Salario Básico',         earnings: active.reduce((a,e) => a + e.baseSalary, 0),      deductions: 0 },
      { name:'Horas Extras',           earnings: p.concepts.includes('Horas Extras')  ? n * 180000  : 0, deductions: 0 },
      { name:'Recargos',               earnings: p.concepts.includes('Recargos')      ? n * 58500   : 0, deductions: 0 },
      { name:'Bonificaciones',         earnings: p.concepts.includes('Bonificaciones')? n * 145000  : 0, deductions: 0 },
      { name:'Auxilio de Transporte',  earnings: p.concepts.includes('Auxilio de Transporte')   ? n * 162000 : 0, deductions: 0 },
      { name:'Auxilio de Alimentación',earnings: p.concepts.includes('Auxilio de Alimentación') ? n * 100000 : 0, deductions: 0 },
      { name:'Salud (4%)',             earnings: 0, deductions: Math.round(p.totalEarnings * 0.04 * 0.5) },
      { name:'Pensión (4%)',           earnings: 0, deductions: Math.round(p.totalEarnings * 0.04 * 0.5) },
    ].filter(c => c.earnings > 0 || c.deductions > 0);
  }
}
