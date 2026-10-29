import {
  Buyer, Invoice, InvoiceLine, computeTotals, lineDiscount, lineGross, lineNet, taxLabel, invoiceTotal,
  isValidInvoice, nitCheckDigit, validateBuyer, checkCufe, dianLookupUrl, BILLABLE_CATEGORIES, EXTRA_CATEGORIES,
} from './invoice.model';
import { qrSvg } from './qr';

/** Línea de factura con valores por defecto; cada prueba cambia solo lo que le importa. */
const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: 'l1', category: 'Alojamiento', description: 'Alojamiento · Hab. 101', detail: '', dateLabel: '',
  quantity: 2, unitLabel: 'noches', unitValue: 100_000, discountPct: 0, discountLabel: '',
  taxKind: 'IVA', taxRate: 0.19, included: true, ...over,
});

const buyer = (over: Partial<Buyer> = {}): Buyer => ({
  personType: 'Natural', docType: 'CC', docNumber: '1094123456', dv: '', name: 'María Fernanda López',
  fiscalResponsibility: 'R-99-PN · No aplica – Otros', email: 'maria@correo.com', phone: '3001234567',
  country: 'Colombia', department: 'Quindío', city: 'Filandia', address: 'Calle 6 # 5-20', ...over,
});

const CUFE = 'a3f9'.repeat(24); // 96 caracteres hexadecimales

describe('Facturación · cálculo de líneas', () => {
  it('calcula bruto, descuento y neto de una línea', () => {
    const l = line({ discountPct: 10 });
    expect(lineGross(l)).toBe(200_000);
    expect(lineDiscount(l)).toBe(20_000);
    expect(lineNet(l)).toBe(180_000);
  });

  it('redondea el descuento a pesos enteros', () => {
    expect(lineDiscount(line({ quantity: 1, unitValue: 33_333, discountPct: 10 }))).toBe(3_333);
  });

  it('rotula el impuesto (exento cuando la tarifa es 0)', () => {
    expect(taxLabel({ taxKind: 'IVA', taxRate: 0.19 })).toBe('IVA 19%');
    expect(taxLabel({ taxKind: 'INC', taxRate: 0.08 })).toBe('INC 8%');
    expect(taxLabel({ taxKind: 'IVA', taxRate: 0 })).toBe('IVA exento');
  });
});

describe('Facturación · totales e impuestos', () => {
  it('suma subtotal, descuentos, base, IVA e INC por separado', () => {
    const t = computeTotals([
      line(),                                                                            // 200.000 + IVA 19 %
      line({ id: 'l2', category: 'Lavandería', quantity: 1, unitValue: 50_000, discountPct: 20, taxRate: 0.19 }), // 40.000 + IVA
      line({ id: 'l3', category: 'Otro', quantity: 1, unitValue: 10_000, taxKind: 'INC', taxRate: 0.08 }),      // 10.000 + INC
    ]);
    expect(t.count).toBe(3);
    expect(t.subtotal).toBe(260_000);
    expect(t.discounts).toBe(10_000);
    expect(t.base).toBe(250_000);
    expect(t.iva).toBe(Math.round(240_000 * 0.19));
    expect(t.inc).toBe(800);
    expect(t.total).toBe(250_000 + 45_600 + 800);
  });

  it('agrupa los impuestos por tarifa', () => {
    const t = computeTotals([line(), line({ id: 'l2', taxRate: 0 })]);
    expect(t.taxes.map(g => g.label).sort()).toEqual(['IVA 19%', 'IVA exento']);
  });

  it('no cuenta las líneas desmarcadas', () => {
    const t = computeTotals([line(), line({ id: 'l2', included: false, unitValue: 999_999 })]);
    expect(t.count).toBe(1);
    expect(t.total).toBe(238_000);
  });

  it('una factura sin líneas da cero', () => {
    const t = computeTotals([]);
    expect(t.total).toBe(0);
    expect(t.taxes).toEqual([]);
  });

  it('el total de la factura es el de sus líneas', () => {
    const inv = { lines: [line()] } as Invoice;
    expect(invoiceTotal(inv)).toBe(238_000);
  });
});

describe('Facturación · validez para cartera', () => {
  it('borradores y anuladas no cuentan', () => {
    expect(isValidInvoice({ dianStatus: 'Borrador' } as Invoice)).toBeFalse();
    expect(isValidInvoice({ dianStatus: 'Aceptada', annulment: { creditNote: 'NC-1', reason: 'x', at: '' } } as Invoice)).toBeFalse();
    expect(isValidInvoice({ dianStatus: 'En validación' } as Invoice)).toBeTrue();
    expect(isValidInvoice({ dianStatus: 'Aceptada' } as Invoice)).toBeTrue();
  });
});

describe('Facturación · dígito de verificación del NIT (algoritmo DIAN)', () => {
  // NIT públicos conocidos
  it('calcula el DV de NIT reales', () => {
    expect(nitCheckDigit('800197268')).toBe('4');   // DIAN
    expect(nitCheckDigit('890903938')).toBe('8');   // Bancolombia
    expect(nitCheckDigit('899999068')).toBe('1');   // Ecopetrol
  });

  it('ignora puntos y guiones', () => {
    expect(nitCheckDigit('800.197.268')).toBe('4');
  });
});

describe('Facturación · validación del adquiriente', () => {
  const failing = (b: Buyer) => validateBuyer(b).filter(c => !c.ok).map(c => c.key);

  it('un adquiriente completo pasa las 7 comprobaciones', () => {
    expect(failing(buyer())).toEqual([]);
  });

  it('exige que el DV corresponda al NIT', () => {
    expect(failing(buyer({ personType: 'Jurídica', docType: 'NIT', docNumber: '800197268', dv: '4' }))).toEqual([]);
    expect(failing(buyer({ personType: 'Jurídica', docType: 'NIT', docNumber: '800197268', dv: '5' }))).toContain('doc');
  });

  it('rechaza cédulas con letras o muy cortas', () => {
    expect(failing(buyer({ docNumber: '12AB45' }))).toContain('doc');
    expect(failing(buyer({ docNumber: '123' }))).toContain('doc');
  });

  it('acepta pasaportes alfanuméricos', () => {
    expect(failing(buyer({ docType: 'PA', docNumber: 'AB1234567', country: 'Estados Unidos', department: 'Florida', city: 'Miami' }))).toEqual([]);
  });

  it('valida el formato del correo', () => {
    expect(failing(buyer({ email: 'maria@correo' }))).toContain('email');
    expect(failing(buyer({ email: '' }))).toContain('email');
  });

  it('en Colombia el municipio debe existir en el catálogo DANE de su departamento', () => {
    expect(failing(buyer({ department: 'Quindío', city: 'Pereira' }))).toContain('place');   // Pereira es de Risaralda
    expect(failing(buyer({ department: 'Risaralda', city: 'Pereira' }))).toEqual([]);
  });

  it('en el extranjero la ciudad es libre', () => {
    expect(failing(buyer({ country: 'España', department: 'Madrid', city: 'Alcobendas' }))).toEqual([]);
  });

  it('marca los campos obligatorios vacíos', () => {
    expect(failing(buyer({ address: '' }))).toEqual(jasmine.arrayContaining(['address', 'required']));
  });
});

describe('Facturación · CUFE', () => {
  it('acepta un CUFE de 96 caracteres hexadecimales', () => {
    expect(checkCufe(CUFE)).toEqual({ value: CUFE, error: '' });
  });

  it('quita espacios y saltos de línea y lo pasa a minúsculas', () => {
    const r = checkCufe(` ${CUFE.slice(0, 40).toUpperCase()}\n${CUFE.slice(40)} `);
    expect(r).toEqual({ value: CUFE, error: '' });
  });

  it('extrae el CUFE del enlace del código QR de la DIAN', () => {
    expect(checkCufe(dianLookupUrl(CUFE) + '&otro=1').value).toBe(CUFE);
  });

  it('explica cuántos caracteres faltan o sobran', () => {
    expect(checkCufe(CUFE.slice(0, 90)).error).toContain('faltan 6');
    expect(checkCufe(CUFE + 'ab').error).toContain('sobran 2');
  });

  it('toma el CUFE de un texto copiado que lo trae separado', () => {
    expect(checkCufe(`CUFE:${CUFE};fecha:2026-10-24`).value).toBe(CUFE);
  });

  it('no recorta en silencio un CUFE con caracteres de más pegados (error encontrado por esta prueba)', () => {
    const r = checkCufe(CUFE + 'ab');
    expect(r.value).not.toBe(CUFE);
    expect(r.error).toContain('sobran 2');
  });

  it('rechaza texto que no es un CUFE (un mensaje escrito)', () => {
    expect(checkCufe('Aceptada y lista').error).toContain('caracteres que no van');
  });

  it('un campo vacío no da error (todavía no se ha pegado nada)', () => {
    expect(checkCufe('')).toEqual({ value: '', error: '' });
  });
});

describe('Facturación · catálogos', () => {
  it('no ofrece comidas ni bebidas (el hospedaje solo vende alojamiento)', () => {
    expect(BILLABLE_CATEGORIES).not.toContain('Restaurante');
    expect(BILLABLE_CATEGORIES).not.toContain('Minibar');
  });

  it('el alojamiento sale de la reserva, no se agrega a mano', () => {
    expect(EXTRA_CATEGORIES).not.toContain('Alojamiento');
  });
});

describe('Facturación · código QR', () => {
  it('genera un SVG con módulos y fondo blanco', () => {
    const svg = qrSvg(dianLookupUrl(CUFE), 110);
    expect(svg.startsWith('<svg')).toBeTrue();
    expect(svg).toContain('width="110"');
    expect(svg).toMatch(/<path d="M\d/);
  });

  it('el mismo texto produce siempre el mismo QR', () => {
    expect(qrSvg('SOGO')).toBe(qrSvg('SOGO'));
    expect(qrSvg('SOGO')).not.toBe(qrSvg('SOGO 2'));
  });
});
