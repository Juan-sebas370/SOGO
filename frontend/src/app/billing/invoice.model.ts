// =====================================================
// FACTURACIÓN ELECTRÓNICA — modelo
// Una factura nace siempre de una reserva: el alojamiento y los consumos
// cargados a esa estadía se convierten en líneas. Totales, impuestos y
// estado de pago se derivan; nunca se guardan aparte.
// =====================================================

// Daños y faltantes: dotación que el huésped perdió o dañó (Inventarios › Dotación de la casa).
// Restaurante y Minibar quedan por compatibilidad: el hospedaje no vende comidas ni bebidas.
export type ConceptCategory = 'Alojamiento' | 'Daños y faltantes' | 'Restaurante' | 'Minibar' | 'Lavandería' | 'Eventos y pasadías' | 'Otro';
export type TaxKind = 'IVA' | 'INC';
export type DianStatus = 'Borrador' | 'En validación' | 'Aceptada' | 'Rechazada';
/** Estado que ve el usuario en el listado (combina emisión, pagos y anulación). */
export type InvoiceState = 'Borrador' | 'Emitida' | 'Pendiente' | 'Pagada' | 'Vencida' | 'Anulada';

export type PersonType = 'Natural' | 'Jurídica';
export type BuyerDocType = 'CC' | 'CE' | 'NIT' | 'PA' | 'TI';

export interface Buyer {
  personType:           PersonType;
  docType:              BuyerDocType;
  docNumber:            string;
  dv:                   string;        // dígito de verificación (solo NIT)
  name:                 string;        // nombre o razón social
  fiscalResponsibility: string;        // código del catálogo DIAN
  email:                string;
  phone:                string;
  country:              string;
  department:           string;
  city:                 string;
  address:              string;
}

export interface InvoiceLine {
  id:            string;
  category:      ConceptCategory;
  description:   string;             // "Alojamiento · Casa completa"
  detail:        string;             // "Reserva RSV-2026-00118", "Piso 2 · check-out"...
  dateLabel:     string;             // "22–25/09"
  quantity:      number;
  unitLabel:     string;             // "noches", "" ...
  unitValue:     number;
  discountPct:   number;             // 0–100
  discountLabel: string;             // "temporada"
  taxKind:       TaxKind;
  taxRate:       number;             // 0.19, 0.08, 0 (exento)
  included:      boolean;            // desmarcada = no se factura (p. ej. cobrada aparte en caja)
  chargeId?:     string;             // consumo de origen (dotación, lavandería, manual)
}

export interface InvoiceEvent {
  at:     string;                    // YYYY-MM-DDTHH:mm:ss
  label:  string;
  detail: string;
  tone:   'info' | 'ok' | 'danger' | 'muted';
}

export interface Invoice {
  id:                 string;
  number:             string;        // "" mientras es borrador; el servidor lo asigna al emitir (prefijo-consecutivo)
  reservationId:      string;
  reservationCode:    string;
  billTo:             'Huésped' | 'Empresa';
  buyer:              Buyer;
  lines:              InvoiceLine[];
  paymentTerm:        'Contado' | 'Crédito';
  dueDate:            string;        // YYYY-MM-DD
  dianStatus:         DianStatus;
  issuedAt?:          string;
  issuedBy?:          string;
  createdBy?:         string;
  dianValidatedAt?:   string;        // fecha en que se registró la aceptación de la DIAN
  fiscalValidatedAt?: string;
  cufe?:              string;
  rejectionReason?:   string;
  sentVia?:           { channel: 'Correo' | 'WhatsApp'; at: string; to: string };
  annulment?:         { creditNote: string; reason: string; at: string; by?: string };
  events:             InvoiceEvent[];
}

// ── Cálculos ─────────────────────────────────────────

export function lineGross(l: InvoiceLine): number {
  return l.quantity * l.unitValue;
}

export function lineDiscount(l: InvoiceLine): number {
  return Math.round(lineGross(l) * l.discountPct / 100);
}

/** Valor de la línea antes de impuestos y después de descuento. */
export function lineNet(l: InvoiceLine): number {
  return lineGross(l) - lineDiscount(l);
}

export function taxLabel(l: Pick<InvoiceLine, 'taxKind' | 'taxRate'>): string {
  return l.taxRate === 0 ? 'IVA exento' : `${l.taxKind} ${Math.round(l.taxRate * 100)}%`;
}

export interface TaxGroup { label: string; kind: TaxKind; rate: number; base: number; amount: number; }

export interface InvoiceTotals {
  count:     number;
  subtotal:  number;
  discounts: number;
  base:      number;
  taxes:     TaxGroup[];
  iva:       number;
  inc:       number;
  total:     number;
}

export function computeTotals(lines: InvoiceLine[]): InvoiceTotals {
  const included = lines.filter(l => l.included);
  const groups = new Map<string, TaxGroup>();
  included.forEach(l => {
    const label = taxLabel(l);
    const g = groups.get(label) ?? { label, kind: l.taxKind, rate: l.taxRate, base: 0, amount: 0 };
    g.base += lineNet(l);
    groups.set(label, g);
  });
  const taxes = [...groups.values()].map(g => ({ ...g, amount: Math.round(g.base * g.rate) }));
  const subtotal = included.reduce((s, l) => s + lineGross(l), 0);
  const discounts = included.reduce((s, l) => s + lineDiscount(l), 0);
  const iva = taxes.filter(t => t.kind === 'IVA').reduce((s, t) => s + t.amount, 0);
  const inc = taxes.filter(t => t.kind === 'INC').reduce((s, t) => s + t.amount, 0);
  return { count: included.length, subtotal, discounts, base: subtotal - discounts, taxes, iva, inc, total: subtotal - discounts + iva + inc };
}

export function invoiceTotal(inv: Invoice): number {
  return computeTotals(inv.lines).total;
}

/** Factura que cuenta para cartera e ingresos (emitida y no anulada). */
export function isValidInvoice(inv: Invoice): boolean {
  return inv.dianStatus !== 'Borrador' && !inv.annulment;
}

// ── Validaciones fiscales ────────────────────────────

/** Dígito de verificación del NIT (algoritmo DIAN, módulo 11). */
export function nitCheckDigit(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.replace(/\D/g, '').split('').reverse();
  const sum = digits.reduce((s, d, i) => s + Number(d) * (weights[i] ?? 0), 0);
  const r = sum % 11;
  return String(r > 1 ? 11 - r : r);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface FiscalCheck { key: string; label: string; ok: boolean; detail: string; field?: keyof Buyer; }

/** Las 7 comprobaciones del paso "Validar datos fiscales" (CU04). */
export function validateBuyer(b: Buyer): FiscalCheck[] {
  const digits = b.docNumber.replace(/\D/g, '');
  const docOk =
    b.docType === 'NIT' ? digits.length >= 8 && digits.length <= 10 && b.dv === nitCheckDigit(digits)
    : b.docType === 'PA' ? /^[A-Z0-9]{5,12}$/i.test(b.docNumber.trim())
    : /^\d{6,10}$/.test(digits) && digits === b.docNumber.trim();
  const docDetail =
    !b.docNumber.trim() ? 'Campo obligatorio vacío'
    : docOk ? `${b.docType} válido · ${b.docType === 'PA' ? b.docNumber.trim().length + ' caracteres' : digits.length + ' dígitos'}`
    : b.docType === 'NIT' ? (b.dv && b.dv !== nitCheckDigit(digits) ? 'El DV no corresponde al NIT' : 'NIT de 8 a 10 dígitos con su DV')
    : b.docType === 'PA' ? 'Pasaporte de 5 a 12 caracteres'
    : 'Solo números, de 6 a 10 dígitos';
  const emailOk = EMAIL_RE.test(b.email.trim());
  const required: (keyof Buyer)[] = ['name', 'docNumber', 'fiscalResponsibility', 'email', 'country', 'department', 'city', 'address'];
  const empty = required.filter(k => !String(b[k]).trim()).length;

  return [
    { key: 'name', field: 'name', label: 'Nombre o razón social', ok: b.name.trim().length >= 3, detail: b.name.trim().length >= 3 ? 'Completo' : 'Campo obligatorio vacío' },
    { key: 'doc', field: 'docNumber', label: 'Tipo y número de identificación', ok: docOk, detail: docDetail },
    { key: 'resp', field: 'fiscalResponsibility', label: 'Responsabilidad fiscal', ok: !!b.fiscalResponsibility, detail: b.fiscalResponsibility ? 'Código del catálogo DIAN' : 'Selecciona una responsabilidad' },
    { key: 'email', field: 'email', label: 'Correo de facturación', ok: emailOk, detail: emailOk ? 'Formato válido' : !b.email.trim() ? 'Campo obligatorio vacío' : 'Formato no válido' },
    { key: 'address', field: 'address', label: 'Dirección', ok: !!b.address.trim(), detail: b.address.trim() ? 'Completa' : 'Campo obligatorio vacío' },
    { key: 'place', label: 'País, departamento y ciudad', ok: !!(b.country && b.department && b.city), detail: b.country && b.department && b.city ? 'Códigos del catálogo' : 'Completa la ubicación' },
    { key: 'required', label: 'Campos obligatorios', ok: empty === 0, detail: empty ? `${empty} campo${empty === 1 ? '' : 's'} vacío${empty === 1 ? '' : 's'}` : 'Todos diligenciados' },
  ];
}

export const DOC_TYPES: { code: BuyerDocType; label: string }[] = [
  { code: 'CC',  label: 'CC · Cédula de ciudadanía' },
  { code: 'CE',  label: 'CE · Cédula de extranjería' },
  { code: 'NIT', label: 'NIT · Número de identificación tributaria' },
  { code: 'PA',  label: 'PA · Pasaporte' },
  { code: 'TI',  label: 'TI · Tarjeta de identidad' },
];

export const FISCAL_RESPONSIBILITIES = [
  'R-99-PN · No aplica – Otros',
  'O-13 · Gran contribuyente',
  'O-15 · Autorretenedor',
  'O-23 · Agente de retención IVA',
  'O-47 · Régimen simple de tributación',
];

/** Catálogo reducido de ubicación (se amplía cuando se conecte el catálogo DIAN completo). */
export const LOCATIONS: Record<string, string[]> = {
  'Quindío':         ['Armenia', 'Calarcá', 'Circasia', 'Filandia', 'La Tebaida', 'Montenegro', 'Quimbaya', 'Salento'],
  'Risaralda':       ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal'],
  'Caldas':          ['Manizales', 'Chinchiná', 'Villamaría'],
  'Antioquia':       ['Medellín', 'Envigado', 'Itagüí', 'Rionegro'],
  'Bogotá D.C.':     ['Bogotá'],
  'Cundinamarca':    ['Chía', 'Soacha', 'Zipaquirá', 'Fusagasugá'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Tuluá', 'Buga'],
  'Santander':       ['Bucaramanga', 'Floridablanca', 'Girón'],
  'Tolima':          ['Ibagué', 'Espinal'],
  'Bolívar':         ['Cartagena'],
  'Atlántico':       ['Barranquilla', 'Soledad'],
  'Huila':           ['Neiva', 'Pitalito'],
  'Nariño':          ['Pasto', 'Ipiales'],
};

// ── CUFE ─────────────────────────────────────────────

/** Consulta pública de una factura en la DIAN (la misma dirección del código QR). */
export const dianLookupUrl = (cufe: string) => `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;

/**
 * CUFE tal como se pega (el servidor hace lo mismo): sin espacios ni saltos de línea, en minúsculas;
 * si se pega el enlace del código QR de la DIAN (…?documentkey=CUFE) se toma solo el CUFE.
 * Devuelve el CUFE limpio y, si no sirve, por qué.
 */
export function checkCufe(text: string): { value: string; error: string } {
  let t = (text ?? '').replace(/\s+/g, '');
  const k = t.toLowerCase().indexOf('documentkey=');
  if (k >= 0) t = t.slice(k + 'documentkey='.length).split('&')[0];
  const found = t.length > 96 ? t.match(/[0-9a-f]{96}/i)?.[0] : undefined;
  const value = (found ?? t).toLowerCase();
  if (!value) return { value, error: '' };
  const bad = [...new Set(value.replace(/[0-9a-f]/g, '').split(''))];
  if (bad.length) return { value, error: `Tiene caracteres que no van en un CUFE (${bad.slice(0, 5).join(' ')}): solo se usan números 0-9 y letras a-f.` };
  if (value.length < 96) return { value, error: `Le faltan ${96 - value.length} caracteres: el CUFE tiene exactamente 96. Revisa que lo hayas copiado completo.` };
  if (value.length > 96) return { value, error: `Le sobran ${value.length - 96} caracteres: el CUFE tiene exactamente 96. Copia solo el código.` };
  return { value, error: '' };
}
