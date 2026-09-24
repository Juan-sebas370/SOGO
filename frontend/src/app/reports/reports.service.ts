import { Injectable } from '@angular/core';

export type ReportType = 'Ventas' | 'Financieros' | 'Ocupación' | 'Restaurante' | 'Nómina' | 'Inventarios' | 'Contables' | 'Personalizados';

export interface GeneratedReport {
  id:        string;
  name:      string;
  period:    string;
  generated: string;
  format:    string;
  size:      string;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {

  getKpis() {
    return {
      totalIncome:    234850000,
      totalExpense:   152430000,
      netProfit:       82420000,
      transactions:      1248,
      incomeGrowth:      10.9,
      expenseGrowth:     8.2,
      profitGrowth:      4.2,
      transGrowth:       9.1,
      occupancyRate:      72,
      avgTicketRest:   62893,
      operationalCost: 137430000,
      profitMargin:      35.1,
    };
  }

  getIncomeVsExpense() {
    return [
      { month:'Dic', income:180, expense:120 },
      { month:'Ene', income:195, expense:130 },
      { month:'Feb', income:210, expense:140 },
      { month:'Mar', income:220, expense:148 },
      { month:'Abr', income:225, expense:150 },
      { month:'May', income:235, expense:152 },
    ];
  }

  getByModule() {
    return [
      { name:'Alojamiento', pct:42, color:'#0E5A9C' },
      { name:'Restaurante', pct:22, color:'#23B57B' },
      { name:'Facturación', pct:16, color:'#F59E0B' },
      { name:'Otros',       pct:20, color:'#EF4444' },
    ];
  }

  getRecentReports(): GeneratedReport[] {
    return [
      { id:'1', name:'Estado de Resultados',     period:'Abr 2024', generated:'24/05/2024', format:'PDF',   size:'1.2 MB' },
      { id:'2', name:'Reporte de Ventas',         period:'Abr 2024', generated:'24/05/2024', format:'Excel', size:'0.8 MB' },
      { id:'3', name:'Planilla Integrada de Nómina', period:'Abr 2024', generated:'23/05/2024', format:'PDF', size:'2.1 MB' },
      { id:'4', name:'Inventario Valorizado',     period:'May 2024', generated:'25/05/2024', format:'Excel', size:'0.5 MB' },
    ];
  }

  getKeyIndicators() {
    return [
      { label:'Ocupación Promedio',      value:'72%',           trend: +3.2 },
      { label:'RevPAR',                  value:'$ 216.000',     trend: +5.1 },
      { label:'Ticket Promedio Restaurante', value:'$ 62.893',  trend: -1.2 },
      { label:'Costo Operacional',       value:'$ 137.430.000', trend: +2.8 },
    ];
  }

  getTop5() {
    return [
      { rank:1, service:'Alojamiento',          qty:546,  value:35180000, pct:45 },
      { rank:2, service:'Restaurante y Bebidas', qty:680,  value:17360000, pct:22 },
      { rank:3, service:'Servicios Adicionales', qty:240,  value:11040000, pct:14 },
      { rank:4, service:'Eventos y Salones',     qty:120,  value:6380000,  pct:8  },
      { rank:5, service:'Otros Servicios',       qty:210,  value:5045000,  pct:6  },
    ];
  }

  getHistoricalReports(): GeneratedReport[] {
    return [
      { id:'1', name:'Ventas',                period:'01/05/2024 - 31/05/2024', generated:'24/05/2024 11:35 a.m.',  format:'PDF',   size:'1.1 MB' },
      { id:'2', name:'Estado de Resultados',  period:'01/04/2024 - 30/04/2024', generated:'30/04/2024 04:26 a.m.',  format:'Excel', size:'0.9 MB' },
      { id:'3', name:'Inventario Valorizado', period:'01/05/2024 - 31/05/2024', generated:'25/05/2024 08:10 a.m.',  format:'PDF',   size:'0.6 MB' },
    ];
  }

  getAnnualComparison() {
    return [
      { month:'Dic', y2023:170, y2024:180 },
      { month:'Ene', y2023:185, y2024:195 },
      { month:'Feb', y2023:200, y2024:210 },
      { month:'Mar', y2023:210, y2024:220 },
      { month:'Abr', y2023:215, y2024:225 },
      { month:'May', y2023:0,   y2024:235 },
    ];
  }
}
