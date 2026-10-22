// Parametrización contable: categorías de ingreso y egreso, métodos de pago,
// impuestos y retenciones. Los porcentajes deben validarse con el contador.

export interface IncomeCategory { name: string; account: string; tax: 'IVA' | 'INC' | null; rate: number; }
export const INCOME_CATEGORIES: IncomeCategory[] = [
  { name: 'Alojamiento', account: '414005', tax: 'IVA', rate: 0.19 },
  { name: 'Eventos y pasadías', account: '41409595', tax: 'IVA', rate: 0.19 },
  { name: 'Servicios adicionales', account: '41409595', tax: 'IVA', rate: 0.19 },
  { name: 'Ingresos financieros', account: '421005', tax: null, rate: 0 },
];

export interface ExpenseCategory { name: string; accounts: string[]; iva: boolean; retention: string; integrated?: string; }
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { name: 'Compras', accounts: ['529525', '529530'], iva: true, retention: 'Compras 2,5%' },
  { name: 'Nómina', accounts: [], iva: false, retention: 'Ninguna', integrated: 'La nómina se contabiliza automáticamente desde el módulo de Nómina al liquidarla.' },
  { name: 'Inventario', accounts: [], iva: false, retention: 'Ninguna', integrated: 'Las compras de inventario se contabilizan automáticamente al registrar la entrada en Inventarios.' },
  { name: 'Servicios públicos', accounts: ['523530', '523525', '523535', '523555'], iva: false, retention: 'Ninguna' },
  { name: 'Mantenimiento', accounts: ['524510', '524515', '524520', '524525', '525015'], iva: true, retention: 'Servicios 4%' },
  { name: 'Proveedores', accounts: ['220505'], iva: false, retention: 'Ninguna' },
  { name: 'Impuestos', accounts: ['521505', '521515', '521530', '240805', '249505'], iva: false, retention: 'Ninguna' },
  { name: 'Honorarios', accounts: ['521030', '521025', '521035', '521095'], iva: false, retention: 'Honorarios 11%' },
  { name: 'Otros', accounts: ['523520', '523560', '530505', '529595'], iva: false, retention: 'Ninguna' },
];

export const RETENTIONS: { name: string; rate: number; account: string }[] = [
  { name: 'Ninguna', rate: 0, account: '' },
  { name: 'Servicios 4%', rate: 0.04, account: '236525' },
  { name: 'Honorarios 11%', rate: 0.11, account: '236515' },
  { name: 'Compras 2,5%', rate: 0.025, account: '236540' },
];

export const PAYMENT_METHODS: { name: string; account: string }[] = [
  { name: 'Efectivo', account: '110505' },
  { name: 'Transferencia', account: '1110' },
  { name: 'Tarjeta débito', account: '1110' },
  { name: 'Tarjeta crédito', account: '1110' },
  { name: 'Nequi', account: '1110' },
  { name: 'Daviplata', account: '1110' },
];
export const INCOME_METHODS = [...PAYMENT_METHODS, { name: 'Crédito (por cobrar)', account: '130505' }];
export const EXPENSE_METHODS = [...PAYMENT_METHODS.filter(m => m.name !== 'Tarjeta débito'), { name: 'Crédito del proveedor', account: '220505' }];

/** Cuenta de caja o bancos según el método con que se recibió / pagó. */
export const cashAccount = (method: string) => method === 'Efectivo' ? '110505' : '1110';

/**
 * Cuenta de ingreso por categoría de consumo, mientras se cargan los ajustes de la base de datos
 * (configuracion 'contabilidad'; se cambian en Contabilidad › Integración). '' = queda por revisar.
 */
export const DEFAULT_MAPPING: Record<string, string> = {
  'Alojamiento': '414005', 'Eventos y pasadías': '41409595', 'Minibar': '41409595', 'Lavandería': '41409501', 'Daños y faltantes': '425050', 'Otro': '41409595',
};
