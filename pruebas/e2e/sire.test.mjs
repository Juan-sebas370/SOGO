// =====================================================================
// SOGO · E2E del flujo de un huésped extranjero: reserva → registro TRA → check-in →
// SIRE (entrada) → check-out → SIRE (salida). Prueba también los buscadores y las
// predicciones (país → pasaporte, huésped conocido, salida al día siguiente).
//
//   QA_WEB=http://localhost:4291 QA_API=http://127.0.0.1:8091 QA_ADMIN=... QA_PASS=... \
//   node --test pruebas/e2e/sire.test.mjs
//
// Deja en pruebas/e2e/capturas/ las capturas 20 a 31 y el TXT de ejemplo (huéspedes ficticios).
// =====================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const WEB = process.env.QA_WEB ?? 'http://localhost:4291';
const API = process.env.QA_API ?? 'http://127.0.0.1:8091';
if (/:4201\b/.test(WEB) || /:8081\b/.test(API)) throw new Error('Las pruebas E2E nunca se corren contra el SOGO real (4201/8081).');
const CHROME = process.env.CHROME_BIN ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
// Credenciales del administrador de PRUEBA: solo por variables de entorno, nunca escritas aquí.
const ADMIN = process.env.QA_ADMIN;
const PASS = process.env.QA_PASS;
if (!ADMIN || !PASS) throw new Error('Define QA_ADMIN y QA_PASS con el usuario administrador de la base de prueba.');

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = local(new Date());
const TOMORROW = local(new Date(Date.now() + 86_400_000));
const DOC = `QA${Date.now().toString().slice(-7)}`;

let browser, page, apiToken = '', reservationId = '';
const errors = [];

const go = (path) => page.goto(WEB + path, { waitUntil: 'networkidle0' });
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const value = (sel) => page.$eval(sel, e => e.value);
const bodyText = () => page.$eval('body', b => b.innerText);
const settle = () => new Promise(r => setTimeout(r, 400));

/** Escribe en un buscador (app-search-select) y elige la primera coincidencia con Tab. */
async function search(sel, text) {
  await page.click(sel);
  await settle();                       // el campo selecciona lo que ya tenía: escribir lo reemplaza
  await page.type(sel, text);
  await page.keyboard.press('Tab');
  await settle();
}

/** Fecha en un <input type="date"> (el formato al teclear depende del idioma del navegador). */
async function setDate(sel, iso) {
  await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, iso);
  await settle();
}

async function clickText(selector, text) {
  const ok = await page.$$eval(selector, (els, t) => {
    const el = els.find(e => e.textContent.trim().includes(t) && !e.disabled);
    if (el) el.click();
    return !!el;
  }, text);
  assert.ok(ok, `No se encontró «${text}» en ${selector}`);
  await settle();
}

async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` }, body: body && JSON.stringify(body) });
  const text = await res.text();
  assert.ok(res.ok, `${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  const login = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN, password: PASS }) });
  apiToken = (await login.json()).token;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1440,900'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => errors.push(`${page.url()} · ${e.message}`));
  page.on('dialog', d => d.accept());
  await go('/');
  await page.type('#lf-user', ADMIN);
  await page.type('#lf-pass', PASS);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
});

after(async () => {
  await browser?.close();
  assert.deepEqual(errors, [], 'Errores de JavaScript en las pantallas');
});

describe('Nueva reserva · buscadores y predicciones', () => {
  test('país con buscador: «chi» + Tab = Chile, y el documento pasa a pasaporte', async () => {
    await go('/dashboard/reservations/new');
    await page.waitForSelector('#country');
    await search('#country', 'chi');
    assert.equal(await value('#country'), 'Chile');
    assert.equal(await value('#docType'), 'Pasaporte');
    assert.match(await bodyText(), /Sugerido porque el país es Chile/);
  });

  test('al poner la entrada, la salida queda al día siguiente', async () => {
    await setDate('#checkIn', TODAY);
    assert.equal(await value('#checkOut'), TOMORROW);
  });

  test('se guarda la reserva del huésped extranjero', async () => {
    await page.type('#docNumber', DOC);
    await page.type('#firstName', 'Larry');
    await page.type('#lastName', 'Waytt Cost');
    await page.type('#phone', '+56 9 1234 5678');
    await page.$eval('#adults', e => { e.value = '2'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.rsv-room-chip:not([disabled])');
    await settle();
    if (+(await value('#lodgingAmount')) <= 0) await page.type('#lodgingAmount', '240000');
    const consent = await page.$('label.rsv-consent:not(.rsv-consent--inline) input[type="checkbox"]');
    if (consent) await consent.click();
    await shot('20-reserva-extranjero');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.rsv-form-footer .rsv-btn--primary')]);
    const m = page.url().match(/reservations\/(\d+)/);
    assert.ok(m, `No abrió la reserva creada: ${page.url()} · ${await page.$eval('.rsv-form-error', e => e.textContent).catch(() => '')}`);
    reservationId = m[1];
  });

  test('huésped conocido: con su documento se completan sus datos', async () => {
    await go('/dashboard/reservations/new');
    await page.waitForSelector('#docNumber');
    await page.type('#docNumber', DOC);
    await page.keyboard.press('Tab');
    await settle();
    assert.equal(await value('#firstName'), 'Larry');
    assert.equal(await value('#lastName'), 'Waytt Cost');
    assert.equal(await value('#docType'), 'Pasaporte');
    assert.match(await bodyText(), /Huésped conocido/);
    await shot('21-huesped-conocido');
  });
});

describe('Registro TRA · predicciones', () => {
  test('residencia en Chile: ciudad escrita, procedencia copiada y acompañante con pasaporte', async () => {
    await go(`/dashboard/tra/${reservationId}/registro`);
    await page.waitForSelector('input[id$="-rc"]');
    if ((await value('input[id$="-rc"]')) !== 'Chile') await search('input[id$="-rc"]', 'chile');
    await search('input[id$="-rci"]', 'Valparaíso');
    assert.equal(await value('input[id$="-oc"]'), 'Chile', 'La procedencia debe copiarse de la residencia');
    assert.equal(await value('input[id$="-oci"]'), 'Valparaíso');
    await page.select('select[id$="-mv"]', await page.$eval('select[id$="-mv"] option:nth-child(2)', o => o.value));
    await setDate('#p-birth', '1980-03-15');
    assert.equal(await page.$eval('select[id$="-dt"]', e => e.value), 'PA');

    await clickText('button', 'Agregar acompañante');
    const docs = await page.$$eval('select[id$="-dt"]', els => els.map(e => e.value));
    assert.equal(docs[1], 'PA', 'El acompañante debe llegar con pasaporte');
    const dn = await page.$$('input[id$="-dn"]'), fn = await page.$$('input[id$="-fn"]'), ln = await page.$$('input[id$="-ln"]');
    await dn[1].type(`${DOC}B`); await fn[1].type('Mary'); await ln[1].type('Waytt');
    await shot('22-registro-tra-extranjero');
    await clickText('button', 'Guardar borrador');
  });
});

describe('SIRE', () => {
  test('tras el check-in, las dos entradas quedan por reportar con datos faltantes', async () => {
    const r = await api('GET', `/api/reservas/${reservationId}`);
    await api('PUT', `/api/reservas/${reservationId}`, { ...r, checkedInAt: `${TODAY}T15:00`, status: 'Confirmada' });
    await go('/dashboard/tra/sire');
    await page.waitForSelector('.ts-group');
    const text = await bodyText();
    assert.match(text, /Larry Waytt Cost/);
    assert.match(text, /Mary Waytt/);
    assert.match(text, /Faltan datos/);
    await shot('23-sire-por-reportar');
  });

  test('la ficha propone la nacionalidad y entrega los campos para copiar', async () => {
    const rows = await page.$$('.ts-group tbody tr');
    const row = (await Promise.all(rows.map(async r => [r, await r.evaluate(e => e.innerText)]))).find(([, t]) => t.includes('Larry') && t.includes(DOC) && !t.includes(`${DOC}B`))[0];
    await (await row.$('button')).click();
    await page.waitForSelector('.ts-modal');
    await clickText('.ts-suggest', 'Chile');
    const copy = await page.$$eval('.ts-copy li', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    assert.ok(copy.some(t => t.includes('Primer apellido') && t.includes('WAYTT')), copy.join(' | '));
    assert.ok(copy.some(t => t.includes('Segundo apellido') && t.includes('COST')));
    assert.ok(copy.some(t => t.includes('Nacionalidad') && t.includes('CHILE')));
    assert.ok(copy.some(t => t.includes('Tipo de documento') && t.includes('PASAPORTE')));
    // Sin barra horizontal en la ficha
    assert.ok(await page.$eval('.ts-modal', e => e.scrollWidth <= e.clientWidth + 1), 'La ficha se desborda a lo ancho');
    await shot('24-ficha-sire');
    await clickText('.ts-foot button', 'marcar como reportado');
    await page.waitForFunction(() => !document.querySelector('.ts-modal'));
  });

  test('marcado como reportado sale de «Por reportar»; el otro sigue pendiente', async () => {
    const rows = () => page.$$eval('.ts-group tbody tr', els => els.map(e => e.innerText));
    const larry = (list) => list.filter(t => t.includes(DOC) && !t.includes(`${DOC}B`)).length;
    const mary = (list) => list.filter(t => t.includes(`${DOC}B`)).length;
    assert.equal(larry(await rows()), 0, 'Larry sigue en «Por reportar»');
    assert.equal(mary(await rows()), 1, 'Mary debe seguir pendiente');
    await clickText('.rsv-tab', 'Reportados');
    assert.equal(larry(await rows()), 1, 'Larry debe estar en Reportados');
    await shot('26-sire-reportados');
  });

  test('tras el check-out aparece la salida', async () => {
    const r = await api('GET', `/api/reservas/${reservationId}`);
    await api('PUT', `/api/reservas/${reservationId}`, { ...r, checkedOutAt: `${TODAY}T18:00` });
    await go('/dashboard/tra/sire');
    await page.waitForSelector('.ts-group');
    const salidas = await page.$$eval('.ts-move--out', els => els.length);
    assert.ok(salidas >= 2, `Se esperaban las salidas de los dos huéspedes, hay ${salidas}`);
    await shot('25-sire-salidas');
  });

  test('el detalle de la reserva muestra el estado SIRE de cada movimiento', async () => {
    await go(`/dashboard/tra/${reservationId}`);
    await page.waitForSelector('.td-sire-list');
    const items = await page.$$eval('.td-sire-list li', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
    assert.ok(items.some(t => /Entrada · Larry.*Reportado/.test(t)), items.join(' | '));
    assert.ok(items.some(t => /Salida · Mary/.test(t)));
    await page.$eval('.td-sire-list', e => e.scrollIntoView({ block: 'center' }));
    await shot('27-tra-detalle-reportado');
  });

  test('«Desmarcar reportado» devuelve el movimiento a «Por reportar»', async () => {
    await go('/dashboard/tra/sire');
    await page.waitForSelector('.ts-group');
    await clickText('.rsv-tab', 'Reportados');
    await openRow(t => t.includes(DOC) && !t.includes(`${DOC}B`) && t.includes('Entrada'));
    await clickText('.ts-foot button', 'Desmarcar reportado');      // el confirm() lo acepta page.on('dialog')
    await clickText('.ts-foot button', 'Cerrar');
    await clickText('.rsv-tab', 'Por reportar');
    const rows = await page.$$eval('.ts-group tbody tr', els => els.map(e => e.innerText));
    assert.ok(rows.some(t => t.includes(DOC) && !t.includes(`${DOC}B`) && t.includes('Entrada')), 'La entrada de Larry debe volver a «Por reportar»');
    await shot('28-sire-desmarcado');
  });
});

describe('SIRE · códigos y archivo TXT', () => {
  test('Configuración TRA trae el código SIRE del establecimiento y el de la ciudad', async () => {
    await go('/dashboard/tra/config');
    await page.waitForSelector('#s-hotel');
    assert.equal(await value('#s-hotel'), '94131');
    assert.match(await value('#s-city'), /^\d+$/, 'El código de ciudad debe ser numérico (DANE sin el cero inicial)');
    const card = (await page.evaluateHandle(() => document.querySelector('#s-hotel').closest('section'))).asElement();
    await card.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await card.screenshot({ path: join(SHOTS, '29-config-sire.png') });
  });

  test('el TXT trae las 13 columnas y avisa el movimiento que quedó por fuera', async () => {
    // Mary con nacionalidad Sudán del Sur: sus datos están completos, pero ese país no tiene código en el SIRE.
    await go('/dashboard/tra/sire');
    await page.waitForSelector('.ts-group');
    await openRow(t => t.includes(`${DOC}B`) && t.includes('Entrada'));
    await search('#ts-nat', 'Sudán del Sur');
    await setDate('#ts-bd', '1982-07-20');
    await clickText('.ts-foot button', 'Guardar datos');
    await clickText('.ts-foot button', 'Cerrar');

    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SHOTS });
    const file = join(SHOTS, `SIRE_94131_${TODAY}.txt`);
    await rm(file, { force: true });
    const group = (await page.evaluateHandle(d => [...document.querySelectorAll('.ts-group')]
      .find(g => g.querySelector('tbody')?.innerText.includes(d)), DOC)).asElement();
    assert.ok(group, 'No aparece el grupo con los movimientos de hoy');
    await (await group.$('.ts-group-actions button')).click();
    for (let i = 0; i < 50 && !(await exists(file)); i++) await settle();

    const note = await group.$eval('.ts-txt-note', e => e.textContent);
    assert.match(note, /Quedaron por fuera/);
    assert.match(note, /Mary Waytt \(entrada\): falta código de nacionalidad/i);
    await group.evaluate(e => e.scrollIntoView({ block: 'start' }));
    await shot('30-txt-movimiento-omitido');

    const lines = latin1(await readFile(file)).split('\r\n').filter(Boolean);
    const larry = lines.map(l => l.split('\t')).find(c => c[3] === DOC && c[8] === 'S');
    assert.ok(larry, `Falta la salida de Larry en el TXT:\n${lines.join('\n')}`);
    assert.equal(larry.length, 13);
    assert.deepEqual([larry[0], larry[2], larry[4], larry[5], larry[6], larry[7]], ['94131', '3', '211', 'WAYTT', 'COST', 'LARRY']);
    assert.ok(!lines.some(l => l.includes(`${DOC}B`)), 'Mary no debía entrar al archivo');
    await copyFile(file, join(SHOTS, 'SIRE_ejemplo.txt'));
    await rm(file, { force: true });
    await showTxt(lines, '31-txt-sire');
  });
});

/** Abre la ficha SIRE de la primera fila que cumpla la condición. */
async function openRow(match) {
  const rows = await page.$$('.ts-group tbody tr');
  const found = (await Promise.all(rows.map(async r => [r, await r.evaluate(e => e.innerText)]))).find(([, t]) => match(t));
  assert.ok(found, 'No se encontró la fila buscada en la pantalla SIRE');
  await (await found[0].$('button')).click();
  await page.waitForSelector('.ts-modal');
}

const exists = (f) => stat(f).then(() => true, () => false);
const latin1 = (buf) => new TextDecoder('windows-1252').decode(buf);

/** Captura del TXT como lo vería un editor: una línea por movimiento y las 13 columnas con su nombre. */
async function showTxt(lines, name) {
  const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const head = SIRE_COLUMNS.map(c => `<th>${esc(c)}</th>`).join('');
  const body = lines.map(l => `<tr>${l.split('\t').map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const raw = esc(lines.join('\n')).replace(/\t/g, '<span class="tab">→</span>');
  const view = await browser.newPage();
  await view.setViewport({ width: 1440, height: 600 });
  await view.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await view.setContent(`<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    html,body{background:#fff} body{font:14px system-ui;margin:24px;color:#222} td{color:#222} h2{font-size:16px;margin:0 0 8px}
    pre{background:#f6f6f6;border:1px solid #ddd;padding:12px;font:13px Consolas,monospace;white-space:pre}
    .tab{color:#c33} table{border-collapse:collapse;font:12px Consolas,monospace;margin-top:16px}
    th,td{border:1px solid #ccc;padding:4px 6px;text-align:left} th{background:#eee;font:600 11px system-ui}
  </style><h2>SIRE_ejemplo.txt · ANSI (Windows-1252) · → = TAB · huéspedes ficticios</h2>
  <pre>${raw}</pre><table><tr>${head}</tr>${body}</table>`);
  await view.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  await view.close();
}

const SIRE_COLUMNS = ['Código hotel', 'Código ciudad', 'Tipo doc.', 'Número doc.', 'Nacionalidad', 'Primer apellido',
  'Segundo apellido', 'Nombres', 'Movimiento', 'Fecha movimiento', 'Procedencia', 'Destino', 'Fecha nacimiento'];
