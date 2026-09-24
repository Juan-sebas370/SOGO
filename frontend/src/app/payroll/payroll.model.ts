export type PayrollStatus = 'En proceso' | 'Preparando' | 'En validación' | 'Completada';

export interface Employee {
  id:         string;
  name:       string;
  position:   string;
  baseSalary: number;
  active:     boolean;
}

export interface PayrollConcept {
  name:        string;
  type:        'Devengado' | 'Deducción';
  amount:      number;
}

export interface PayrollEmployee {
  employeeId:   string;
  name:         string;
  position:     string;
  baseSalary:   number;
  earnings:     number;
  deductions:   number;
  net:          number;
}

export interface Payroll {
  id:            string;
  period:        string;         // Mayo 2024
  startDate:     string;
  endDate:       string;
  workedDays:    number;
  employees:     number;
  concepts:      string[];       // nombres de conceptos activados
  items:         PayrollEmployee[];
  totalEarnings: number;
  totalDeductions: number;
  netPayroll:    number;
  status:        PayrollStatus;
  observations:  string;
  generatedAt?:  string;
}
