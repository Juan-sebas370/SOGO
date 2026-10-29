// =====================================================================
// SOGO · Pruebas de integración y seguridad de la API (node:test)
//
// Corren contra un backend de PRUEBA con su propia base de datos (nunca la real):
//   QA_API=http://127.0.0.1:8091  QA_RESET_TOKEN=<reset_token del admin de prueba>
//   node --test pruebas/api/
// El token de restablecimiento lo deja el script 05_crear_administrador.sql en la base de prueba.
// =====================================================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const API = process.env.QA_API ?? 'http://127.0.0.1:8091';
if (/:8081\b|:3306\b/.test(API)) throw new Error('Estas pruebas escriben datos: nunca se corren contra el SOGO real (8081).');

const ADMIN_EMAIL = process.env.QA_ADMIN ?? 'sebastian@sogo.com';
const ADMIN_PASS = 'Prueba#2026';
let token = '';

async function call(method, path, body, auth = token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const b64url = (s) => Buffer.from(s).toString('base64url');
/** JWT firmado con una clave dada (HS384, como lo hace jjwt con una clave de 48 bytes). */
function forgeJwt(secret, payload) {
  const head = b64url(JSON.stringify({ alg: 'HS384' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha384', Buffer.from(secret)).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const today = new Date();
const iso = (d) => new Date(today.getTime() + d * 86_400_000).toISOString().slice(0, 10);

before(async () => {
  const reset = process.env.QA_RESET_TOKEN;
  assert.ok(reset, 'Falta QA_RESET_TOKEN (reset_token del administrador de prueba)');
  const r = await call('POST', '/api/auth/reset', { token: reset, password: ADMIN_PASS }, '');
  assert.equal(r.status, 200, `No se pudo fijar la clave del admin de prueba: ${JSON.stringify(r.data)}`);
  const login = await call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: ADMIN_PASS }, '');
  assert.equal(login.status, 200, JSON.stringify(login.data));
  token = login.data.token;
});

// ── Seguridad ─────────────────────────────────────────────────────────
describe('Seguridad · autenticación', () => {
  test('sin sesión, la API responde 401', async () => {
    assert.equal((await call('GET', '/api/reservas', undefined, '')).status, 401);
  });

  test('con «Bearer» vacío responde 401 (no un error 500)', async () => {
    const res = await fetch(API + '/api/reservas', { headers: { Authorization: 'Bearer ' } });
    assert.equal(res.status, 401);
  });

  test('un token inventado se rechaza', async () => {
    assert.equal((await call('GET', '/api/reservas', undefined, 'abc.def.ghi')).status, 401);
  });

  test('contraseña incorrecta → 401 sin revelar si el usuario existe', async () => {
    const a = await call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: 'mala' }, '');
    const b = await call('POST', '/api/auth/login', { username: 'noexiste@x.com', password: 'mala' }, '');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.error, b.data.error);
  });

  test('inyección SQL en el inicio de sesión no da acceso', async () => {
    const r = await call('POST', '/api/auth/login', { username: "' OR '1'='1' -- ", password: "' OR '1'='1" }, '');
    assert.equal(r.status, 401);
  });

  test('restablecer clave con un enlace falso no funciona', async () => {
    assert.equal((await call('POST', '/api/auth/reset', { token: 'falso', password: 'Otra#2026' }, '')).status, 400);
  });

  test('el enlace de restablecimiento sirve una sola vez', async () => {
    const r = await call('POST', '/api/auth/reset', { token: process.env.QA_RESET_TOKEN, password: 'Otra#2026' }, '');
    assert.equal(r.status, 400);
  });

  test('renovar la sesión entrega un token nuevo y válido', async () => {
    const r = await call('POST', '/api/auth/refresh', {});
    assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/habitaciones', undefined, r.data.token)).status, 200);
  });

  test('renovar sin sesión → 401', async () => {
    assert.equal((await call('POST', '/api/auth/refresh', {}, '')).status, 401);
  });

  test('HALLAZGO: la clave de firma por defecto (publicada en el repositorio) no debería servir para fabricar sesiones', async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = forgeJwt('change-me-dev-secret-change-me-dev-secret-123456', { sub: ADMIN_EMAIL, role: 'ADMIN', iat: now, exp: now + 600 });
    const r = await call('GET', '/api/usuarios', undefined, forged);
    assert.notEqual(r.status, 200, 'Con la clave publicada en GitHub se puede fabricar una sesión de administrador');
  });
});

// ── Funcional: catálogo y reservas ────────────────────────────────────
describe('Reservas · flujo completo', () => {
  let room = '';
  let reservation;

  test('las habitaciones de la casa están cargadas', async () => {
    const r = await call('GET', '/api/habitaciones');
    assert.equal(r.status, 200);
    assert.ok(r.data.length > 0);
    room = String(r.data[0].number ?? r.data[0].numero);
    assert.ok(room);
  });

  test('crear una reserva le asigna código RSV-AAAA-#####', async () => {
    const r = await call('POST', '/api/reservas', {
      guestName: 'Prueba Integración', firstName: 'Prueba', lastName: 'Integración', docType: 'Cédula de Ciudadanía', docNumber: '1094000001',
      phone: '3000000000', email: 'qa@sogo.test', city: 'Colombia - Pereira, Risaralda', reservationType: 'Individual', channel: 'Directo',
      lodgingType: 'Habitación', rooms: [room], adults: 1, children: 0, infants: 0, checkIn: iso(30), checkOut: iso(32), nights: 2,
      plan: 'Solo alojamiento', lodgingAmount: 200000, extrasAmount: 0, payments: [], status: 'Pendiente', observations: 'QA',
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.code, /^RSV-\d{4}-\d{5}$/);
    reservation = r.data;
  });

  test('la reserva se puede consultar por su id', async () => {
    const r = await call('GET', `/api/reservas/${reservation.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.code, reservation.code);
    assert.equal(r.data.city, 'Colombia - Pereira, Risaralda');
  });

  test('registrar un abono queda en los pagos de la reserva', async () => {
    const r = await call('POST', `/api/reservas/${reservation.id}/pagos`, { date: `${iso(0)}T10:00`, method: 'Nequi', amount: 50000, receipt: 'QA-1' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.payments.length, 1);
    assert.equal(r.data.payments[0].amount, 50000);
  });

  test('editar la reserva conserva su código', async () => {
    const r = await call('PUT', `/api/reservas/${reservation.id}`, { ...reservation, observations: 'QA editada', payments: [] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.code, reservation.code);
    assert.equal(r.data.observations, 'QA editada');
  });

  test('una reserva con salida antes de la entrada se rechaza', async () => {
    const r = await call('POST', '/api/reservas', { ...reservation, id: null, code: null, checkIn: iso(40), checkOut: iso(38) });
    assert.ok(r.status >= 400 && r.status < 500, `Se aceptó una reserva con fechas invertidas (HTTP ${r.status})`);
  });
});

// ── Funcional: facturación electrónica ────────────────────────────────
describe('Facturación · emisión, DIAN y anulación', () => {
  const CUFE = 'a3f9'.repeat(24);
  let resv;
  let invoice;

  before(async () => {
    const cfg = (await call('GET', '/api/facturacion/config')).data ?? {};
    const put = await call('PUT', '/api/facturacion/config', {
      ...cfg,
      provider: { name: 'Proveedor QA', apiUrl: '', environment: 'Habilitación', clientId: '', apiKey: '' },
      resolution: { number: '18760000001', prefix: 'QA', from: 1, to: 100, validFrom: iso(-10), validTo: iso(300), technicalKey: '', creditPrefix: 'NCQ' },
      taxes: [{ id: 't1', concept: 'Alojamiento', kind: 'IVA', rate: 0.19, condition: 'General', status: 'Activo' }],
      automation: { emailOnAccept: false }, emailSubject: '', emailBody: '',
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    // El NIT del emisor sale de Datos del hospedaje
    const hotel = (await call('GET', '/api/configuracion/hospedaje')).data ?? {};
    await call('PUT', '/api/configuracion/hospedaje', { ...hotel, nit: '900123456', legalName: 'Hospedaje QA S.A.S.', commercialName: 'Hospedaje QA' });
    const list = (await call('GET', '/api/reservas')).data;
    resv = list.find(r => r.observations === 'QA editada') ?? list[0];
  });

  const body = () => ({
    id: '', reservationId: resv.id, billTo: 'Huésped', paymentTerm: 'Contado', dueDate: iso(0), fiscalValidatedAt: `${iso(0)}T10:00:00`,
    buyer: { personType: 'Natural', docType: 'CC', docNumber: '1094000001', dv: '', name: 'Prueba Integración', fiscalResponsibility: 'R-99-PN',
      email: 'qa@sogo.test', phone: '3000000000', country: 'Colombia', department: 'Risaralda', city: 'Pereira', address: 'Calle 1 # 2-3' },
    lines: [{ id: 'l-1', category: 'Alojamiento', description: 'Alojamiento QA', detail: '', dateLabel: '', quantity: 2, unitLabel: 'noches',
      unitValue: 100000, discountPct: 0, discountLabel: '', taxKind: 'IVA', taxRate: 0.19, included: true }],
  });

  test('una configuración inválida se rechaza (prefijo en minúscula)', async () => {
    const cfg = (await call('GET', '/api/facturacion/config')).data;
    const r = await call('PUT', '/api/facturacion/config', { ...cfg, resolution: { ...cfg.resolution, prefix: 'qa' } });
    assert.equal(r.status, 400);
  });

  test('la clave del proveedor nunca se devuelve al navegador', async () => {
    const r = await call('GET', '/api/facturacion/config');
    assert.equal(r.data.provider.apiKey, '');
  });

  test('emitir asigna el primer número del rango y queda en validación DIAN', async () => {
    const r = await call('POST', '/api/facturacion/facturas/0/emitir', body());
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.number, 'QA-1');
    assert.equal(r.data.dianStatus, 'En validación');
    invoice = r.data;
  });

  test('no se puede facturar dos veces la misma reserva', async () => {
    const r = await call('POST', '/api/facturacion/facturas/0/emitir', body());
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.data), /ya tiene una factura vigente/);
  });

  test('un crédito con vencimiento de hoy no se emite', async () => {
    // Reserva propia de esta prueba, para que siempre se ejecute
    const other = await call('POST', '/api/reservas', { ...resv, id: null, code: null, payments: [], checkIn: iso(60), checkOut: iso(61), nights: 1 });
    assert.equal(other.status, 201, JSON.stringify(other.data));
    const r = await call('POST', '/api/facturacion/facturas/0/emitir', { ...body(), reservationId: other.data.id, paymentTerm: 'Crédito', dueDate: iso(0) });
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.data), /crédito/);
  });

  test('un mensaje en el campo del CUFE se rechaza', async () => {
    const r = await call('POST', `/api/facturacion/facturas/${invoice.id}/respuesta-dian`, { accepted: true, cufe: 'Aceptada y lista' });
    assert.equal(r.status, 400);
  });

  test('con un CUFE válido queda aceptada y guarda la nota en el historial', async () => {
    const r = await call('POST', `/api/facturacion/facturas/${invoice.id}/respuesta-dian`, { accepted: true, cufe: CUFE, note: 'Validada en QA' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.dianStatus, 'Aceptada');
    assert.equal(r.data.cufe, CUFE);
    assert.ok(r.data.events.some(e => e.detail.includes('Validada en QA')));
  });

  test('una factura emitida no se elimina', async () => {
    assert.equal((await call('DELETE', `/api/facturacion/facturas/${invoice.id}`)).status, 409);
  });

  test('anular emite una nota crédito numerada', async () => {
    const r = await call('POST', `/api/facturacion/facturas/${invoice.id}/anular`, { reason: 'Error en los valores o conceptos' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.annulment.creditNote, 'NCQ-1');
  });

  test('no se anula dos veces', async () => {
    assert.equal((await call('POST', `/api/facturacion/facturas/${invoice.id}/anular`, { reason: 'Otra vez' })).status, 409);
  });

  test('tras anular, la reserva se puede volver a facturar con el siguiente número', async () => {
    const r = await call('POST', '/api/facturacion/facturas/0/emitir', body());
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.number, 'QA-2');
  });
});

// ── Funcional: contabilidad ───────────────────────────────────────────
describe('Contabilidad · comprobantes', () => {
  let center = '';
  before(async () => {
    const centers = (await call('GET', '/api/contabilidad/centros')).data ?? [];
    center = (centers.find?.(c => c.active !== false) ?? centers[0])?.code ?? 'CC-01';
  });

  const voucher = (lines, over = {}) => ({
    kind: 'Ingreso', date: iso(0), time: '10:00', concept: 'Prueba QA', third: 'Cliente QA', thirdDoc: '1094000001', category: 'Otros ingresos',
    method: 'Efectivo', lines, supports: [], files: [], observations: '', ...over,
  });
  const line = (account, debit, credit) => ({ account, detail: 'QA', third: 'Cliente QA', thirdDoc: '1094000001', costCenter: center, debit, credit });

  test('el plan de cuentas está cargado', async () => {
    const r = await call('GET', '/api/contabilidad/cuentas');
    assert.equal(r.status, 200);
    assert.ok(r.data.length > 50);
  });

  test('un comprobante descuadrado se rechaza', async () => {
    const r = await call('POST', '/api/contabilidad/asientos', voucher([line('110505', 100000, 0), line('414095', 0, 90000)]));
    assert.equal(r.status, 400, JSON.stringify(r.data));
  });

  test('un comprobante cuadrado se registra SIN documento soporte (ahora es opcional)', async () => {
    const r = await call('POST', '/api/contabilidad/asientos', voucher([line('110505', 100000, 0), line('414095', 0, 100000)]));
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.data));
    assert.equal(r.data.status, 'Contabilizado');
  });

  test('un ingreso sin tercero se rechaza', async () => {
    const r = await call('POST', '/api/contabilidad/asientos', voucher([line('110505', 1000, 0), line('414095', 0, 1000)], { third: '', thirdDoc: '' }));
    assert.equal(r.status, 400);
  });
});

// ── Funcional: consultas de los demás módulos ─────────────────────────
describe('Módulos · consultas básicas', () => {
  for (const path of ['/api/inventario/productos', '/api/dotacion', '/api/empleados', '/api/tarifas', '/api/roles', '/api/usuarios', '/api/tra/registros', '/api/auditoria', '/api/reportes/programados']) {
    test(`GET ${path} responde 200`, async () => {
      const r = await call('GET', path);
      assert.equal(r.status, 200, JSON.stringify(r.data)?.slice(0, 200));
    });
  }
});
