// =====================================================================
// SOGO · Prueba de carga básica de la API (solo contra el entorno de PRUEBA).
//   QA_API=http://127.0.0.1:8091 QA_TOKEN=<jwt> node pruebas/rendimiento/carga.mjs
// Simula N usuarios simultáneos consultando las pantallas más usadas y mide
// tiempos de respuesta (promedio, p50, p95, p99, máximo), rendimiento y errores.
// =====================================================================
const API = process.env.QA_API ?? 'http://127.0.0.1:8091';
if (/:8081\b/.test(API)) throw new Error('La prueba de carga nunca se corre contra el SOGO real (8081).');
const TOKEN = process.env.QA_TOKEN;
if (!TOKEN) throw new Error('Falta QA_TOKEN');

const USERS = +(process.env.QA_USERS ?? 20);        // usuarios simultáneos
const PER_USER = +(process.env.QA_REQUESTS ?? 25);  // peticiones por usuario
const ENDPOINTS = ['/api/reservas', '/api/habitaciones', '/api/facturacion/facturas', '/api/contabilidad/asientos', '/api/inventario/productos', '/api/tra/registros'];

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)];

async function hit(path) {
  const t0 = performance.now();
  try {
    const r = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
    await r.arrayBuffer();
    return { path, ms: performance.now() - t0, ok: r.ok, status: r.status };
  } catch (e) {
    return { path, ms: performance.now() - t0, ok: false, status: 0 };
  }
}

async function user(id) {
  const out = [];
  for (let i = 0; i < PER_USER; i++) out.push(await hit(ENDPOINTS[(id + i) % ENDPOINTS.length]));
  return out;
}

const start = performance.now();
const results = (await Promise.all(Array.from({ length: USERS }, (_, i) => user(i)))).flat();
const seconds = (performance.now() - start) / 1000;

const summary = (rows) => {
  const ms = rows.map(r => r.ms).sort((a, b) => a - b);
  return {
    peticiones: rows.length, errores: rows.filter(r => !r.ok).length,
    promedio_ms: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    p50_ms: Math.round(pct(ms, 50)), p95_ms: Math.round(pct(ms, 95)), p99_ms: Math.round(pct(ms, 99)), max_ms: Math.round(ms[ms.length - 1]),
  };
};

console.log(`\nCarga: ${USERS} usuarios simultáneos × ${PER_USER} peticiones = ${results.length} peticiones en ${seconds.toFixed(1)} s`);
console.log(`Rendimiento: ${(results.length / seconds).toFixed(1)} peticiones/segundo\n`);
const table = { TOTAL: summary(results) };
for (const e of ENDPOINTS) table[e] = summary(results.filter(r => r.path === e));
console.table(table);

// Criterios de aceptación de la prueba
const total = table.TOTAL;
const ok = total.errores === 0 && total.p95_ms < 1000;
console.log(ok ? '\nRESULTADO: CUMPLE (0 errores y p95 < 1 s)' : '\nRESULTADO: NO CUMPLE (hay errores o p95 ≥ 1 s)');
process.exitCode = ok ? 0 : 1;
