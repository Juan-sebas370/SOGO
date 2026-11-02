// =====================================================================
// SOGO · E2E del flujo de un huésped extranjero: reserva → registro TRA → check-in →
// SIRE (entrada) → check-out → SIRE (salida). Prueba también los buscadores y las
// predicciones (país → pasaporte, huésped conocido, salida al día siguiente).
//
//   QA_WEB=http://localhost:4291 QA_API=http://127.0.0.1:8091 node --test pruebas/e2e/sire.test.mjs
// =====================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const WEB = process.env.QA_WEB ?? 'http://localhost:4291';
const API = process.env.QA_API ?? 'http://127.0.0.1:8091';
if (/:4201\b/.test(WEB) || /:8081\b/.test(API)) throw new Error('Las pruebas E2E nunca se corren contra el SOGO real (4201/8081).');
const CHROME = process.env.CHROME_BIN ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
const ADMIN = process.env.QA_ADMIN ?? 'sebastian@gmail.com';
const PASS = process.env.QA_PASS ?? 'Prueba#2026';

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
  });
});
