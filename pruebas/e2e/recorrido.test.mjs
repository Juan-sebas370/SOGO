// =====================================================================
// SOGO · Pruebas de extremo a extremo (E2E) con un navegador real.
// Recorre las pantallas como lo haría un usuario y guarda capturas como evidencia.
//
//   QA_WEB=http://localhost:4291 QA_ADMIN=... QA_PASS=... node --test pruebas/e2e/
// Usa el Chrome instalado (puppeteer-core) contra el frontend y backend de PRUEBA.
// =====================================================================
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const WEB = process.env.QA_WEB ?? 'http://localhost:4291';
if (/:4201\b/.test(WEB)) throw new Error('Las pruebas E2E nunca se corren contra el SOGO real (4201).');
const CHROME = process.env.CHROME_BIN ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');

let browser, page;
const errors = [];

async function go(path) {
  await page.goto(WEB + path, { waitUntil: 'networkidle0' });
}
async function shot(name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}
const texts = (sel) => page.$$eval(sel, els => els.map(e => e.textContent.trim()));

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1440,900'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => errors.push(`${page.url()} · ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${page.url()} · ${m.text()}`); });
});

after(async () => { await browser?.close(); });

describe('Inicio de sesión', () => {
  test('la pantalla de ingreso ofrece Google y ya no Microsoft', async () => {
    await go('/');
    const body = await page.$eval('body', b => b.innerText);
    assert.ok(body.includes('Google'));
    assert.ok(!body.includes('Microsoft'), 'Todavía aparece el ingreso con Microsoft');
    await shot('01-login');
  });

  test('con usuario y clave correctos entra al panel', async () => {
    await page.type('input[placeholder="usuario@hospedaje.com"]', process.env.QA_ADMIN ?? 'sebastian@gmail.com');
    await page.type('input[placeholder="••••••••"]', process.env.QA_PASS ?? 'Prueba#2026');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button.primary')]);
    assert.match(page.url(), /\/dashboard/);
  });
});

describe('Panel de inicio', () => {
  test('muestra los 6 indicadores y los accesos rápidos', async () => {
    await go('/dashboard');
    await page.waitForSelector('.dh-kpi');
    assert.equal((await page.$$('.dh-kpi')).length, 6);
    assert.ok((await page.$$('.dh-quick-btn')).length > 0);
    const quick = await texts('.dh-quick-btn');
    assert.ok(!quick.some(t => /consumo/i.test(t)), 'Sigue el acceso al restaurante');
    await shot('02-inicio');
  });
});

describe('Reservas', () => {
  test('el lugar de residencia va separado y el municipio depende del departamento', async () => {
    await go('/dashboard/reservations/new');
    await page.waitForSelector('#country');
    assert.equal(await page.$eval('#country', e => e.value), 'Colombia');
    assert.equal(await page.$('#plan'), null, 'Sigue apareciendo Plan / tarifa');
    assert.ok(await page.$eval('#town', e => e.disabled), 'El municipio debe esperar al departamento');
    await page.select('#department', 'Quindío');
    const towns = await page.$$eval('#town option', os => os.map(o => o.textContent.trim()));
    assert.ok(towns.includes('Filandia'));
    assert.equal(towns.length - 1, 12);
    await shot('03-nueva-reserva');
  });
});

describe('Alojamiento', () => {
  test('Llegadas y salidas muestra las dos columnas', async () => {
    await go('/dashboard/lodging/recepcion');
    await page.waitForSelector('.fd-col');
    assert.equal((await page.$$('.fd-col')).length, 2);
    await shot('04-llegadas-salidas');
  });

  test('la dirección antigua del check-in lleva al tablero', async () => {
    await go('/dashboard/lodging/checkin');
    assert.match(page.url(), /\/lodging\/recepcion/);
  });
});

describe('Contabilidad', () => {
  test('el buscador de cuentas filtra por los dígitos escritos', async () => {
    await go('/dashboard/accounting/movement');
    await page.waitForSelector('app-account-picker input');
    await page.click('app-account-picker input');
    await page.type('app-account-picker input', '1105');
    await page.waitForSelector('.ap-list li');
    const codes = await page.$$eval('.ap-list .ap-code', els => els.map(e => e.textContent.trim()));
    assert.ok(codes.length > 0);
    assert.ok(codes.every(c => c.startsWith('1105')), `Aparecen cuentas que no empiezan por 1105: ${codes.join(', ')}`);
    await shot('05-buscador-cuentas');
  });

  test('el buscador mide lo mismo que los demás campos', async () => {
    const h = await page.$eval('app-account-picker input', e => getComputedStyle(e).height);
    assert.equal(h, '40px');
  });

  test('las gráficas de indicadores usan máximo 6 líneas de guía (antes eran cientos)', async () => {
    await go('/dashboard/accounting/indicators');
    await page.waitForSelector('.ind-plot svg');
    const ticks = await page.$$eval('.ind-plot svg', svgs => svgs.map(s => s.querySelectorAll('.ind-tick').length));
    assert.ok(ticks.length >= 2);
    assert.ok(ticks.every(n => n > 0 && n <= 6), `Líneas de guía por gráfica: ${ticks.join(', ')}`);
    await shot('06-indicadores-financieros');
  });
});

describe('Facturación', () => {
  test('el listado de facturas carga', async () => {
    await go('/dashboard/billing');
    await page.waitForSelector('.inv-table');
    await shot('07-facturas');
  });

  test('en Reportes la etiqueta del filtro no se monta sobre el valor', async () => {
    await go('/dashboard/billing/reports');
    await page.waitForSelector('.rep-filters-grid .bil-select select');
    const overlap = await page.$$eval('.rep-filters-grid .bil-select', boxes => boxes.filter(b => b.querySelector('select')).map(b => {
      const label = b.querySelector('.bil-select-label').getBoundingClientRect();
      // El texto del select va centrado en su área de contenido: se compara contra donde se dibuja de verdad
      const sel = b.querySelector('select'), r = sel.getBoundingClientRect(), cs = getComputedStyle(sel);
      const padTop = parseFloat(cs.paddingTop), padBottom = parseFloat(cs.paddingBottom), font = parseFloat(cs.fontSize);
      const textTop = r.top + padTop + (r.height - padTop - padBottom - font) / 2;
      return label.bottom <= textTop;
    }));
    assert.ok(overlap.length >= 3 && overlap.every(Boolean), 'Hay etiquetas montadas sobre el valor');
    await shot('08-reportes-facturacion');
  });

  test('Impuestos y DIAN tiene el título del menú', async () => {
    await go('/dashboard/billing/settings');
    assert.equal(await page.$eval('h1.bil-title', e => e.textContent.trim()), 'Impuestos y DIAN');
  });
});

describe('Reportes', () => {
  test('las 9 pestañas del módulo abren su pantalla', async () => {
    await go('/dashboard/reports');
    await page.waitForSelector('rp-nav .rpn-tab');
    const tabs = await page.$$eval('rp-nav .rpn-tab', as => as.map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') })));
    assert.equal(tabs.length, 9);
    for (const [i, t] of tabs.entries()) {
      await go(t.href);
      await page.waitForSelector('h1');
      assert.equal(await page.$eval('rp-nav .rpn-tab.on', a => a.textContent.trim()), t.label, `La pestaña activa no es ${t.label}`);
      await shot(`09-reportes-${String(i + 1).padStart(2, '0')}-${t.label.normalize('NFD').replace(/[0300-036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-')}`);
    }
  });
});

describe('Estabilidad', () => {
  test('ninguna pantalla recorrida dejó errores de JavaScript', () => {
    assert.deepEqual(errors, []);
  });
});
