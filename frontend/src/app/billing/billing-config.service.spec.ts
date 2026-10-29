import { of } from 'rxjs';
import { BillingConfigService, BillingConfig, TaxRule } from './billing-config.service';

const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

const TAXES: TaxRule[] = [
  { id: 't1', concept: 'Alojamiento', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
  { id: 't2', concept: 'Alojamiento · extranjero no residente', kind: 'IVA', rate: 0, condition: 'Exento (art. 481 E.T.)', status: 'Activo' },
  { id: 't3', concept: 'Lavandería', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Inactivo' },
  { id: 't4', concept: 'Otro', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' },
];

/** Servicio con la configuración y los datos del hospedaje que cada prueba necesita (sin servidor). */
async function service(cfg: Partial<BillingConfig>, nit = '900123456', can = true): Promise<BillingConfigService> {
  localStorage.setItem('sogo_token', 'prueba');
  const http = { get: () => of(cfg) } as any;
  const users = { can: () => can } as any;
  const hotel = { get: () => ({ nit, legalName: 'Hospedaje S.A.S.', rnt: '1', establishment: '', address: '', email: '', website: '' }), name: 'Hospedaje', city: 'Filandia', phones: '', logoSrc: '' } as any;
  const s = new BillingConfigService(http, users, hotel);
  await s.ready();
  return s;
}

describe('Facturación · configuración (servicio)', () => {
  afterEach(() => localStorage.removeItem('sogo_token'));

  it('aplica la tarifa activa del concepto', async () => {
    const s = await service({ taxes: TAXES });
    expect(s.taxFor('Alojamiento').rate).toBe(0.19);
  });

  it('el extranjero no residente usa la exención del alojamiento', async () => {
    const s = await service({ taxes: TAXES });
    expect(s.taxFor('Alojamiento', true).rate).toBe(0);
  });

  it('un concepto con tarifa inactiva usa la de "Otro"', async () => {
    const s = await service({ taxes: TAXES });
    expect(s.taxFor('Lavandería').id).toBe('t4');
  });

  it('sin ninguna tarifa no inventa impuesto: 0 % y marcado para validar', async () => {
    const s = await service({ taxes: [] });
    const t = s.taxFor('Alojamiento');
    expect(t.rate).toBe(0);
    expect(t.status).toBe('Validar con contador');
  });

  it('lista lo que falta para poder emitir', async () => {
    const s = await service({ taxes: [] }, '');
    const b = s.issueBlockers();
    expect(b).toContain('Falta el NIT del hospedaje (Configuración › Datos del hospedaje).');
    expect(b).toContain('Falta el número de la resolución de facturación DIAN.');
    expect(b).toContain('No hay tarifas de impuestos configuradas.');
  });

  it('una resolución vencida impide emitir', async () => {
    const s = await service({ taxes: TAXES, resolution: { number: '18760000001', prefix: 'SEB', from: 1, to: 5000, validFrom: iso(-400), validTo: iso(-1), technicalKey: '', creditPrefix: 'NC' } });
    expect(s.issueBlockers()).toContain('La resolución de facturación no está vigente.');
  });

  it('con todo configurado no hay impedimentos', async () => {
    const s = await service({ taxes: TAXES, resolution: { number: '18760000001', prefix: 'SEB', from: 1, to: 5000, validFrom: iso(-10), validTo: iso(300), technicalKey: '', creditPrefix: 'NC' } });
    expect(s.issueBlockers()).toEqual([]);
  });

  it('el emisor sale de Datos del hospedaje', async () => {
    const s = await service({});
    expect(s.issuer.nit).toBe('900123456');
    expect(s.issuer.name).toBe('Hospedaje');
  });

  it('los permisos de Facturación salen del rol del usuario', async () => {
    expect((await service({}, '900123456', true)).can('Generar factura')).toBeTrue();
    expect((await service({}, '900123456', false)).can('Generar factura')).toBeFalse();
  });
});
