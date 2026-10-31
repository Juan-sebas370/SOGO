// =====================================================================
// Genera database/produccion/: los scripts de SOGO listos para la base de producción (Aiven).
//   node database/generar-paquete-produccion.mjs
//
// · No trae nombre de base: se elige al conectarse (mysql ... NOMBRE_BASE < archivo).
// · Deja por fuera lo que era propio de la base local:
//     00 y 22  verificaciones (00 va aparte, como revisión previa)
//     01b      reparación manual de una falla pasada
//     01d      traduce ids de habitaciones: se decide al ver los datos reales
//     03       usuario local; en Aiven se crea desde su panel
//     05       administrador: va aparte, porque hay que elegir el correo
//     09 10 12 limpian personas y correos de la demostración de la base local
// · Del 11 solo toma la tabla nomina_pagos: lo demás limpia datos locales y crea copias sin clave primaria.
// =====================================================================
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'produccion');
const FUERA = /^(00|01b|01d|03|05|09|10|12|22)_/;

const sinBase = (sql) => sql
  .replace(/^\s*USE hotel_sebastian;\s*$/gim, '')
  .replace(/'hotel_sebastian'/g, 'DATABASE()');

function soloNominaPagos(sql) {
  const m = sql.match(/CREATE TABLE IF NOT EXISTS nomina_pagos \([\s\S]*?\)[^;]*;/);
  if (!m) throw new Error('No se encontró nomina_pagos en el script 11');
  return m[0];
}

const scripts = readdirSync(DIR).filter(f => /^\d.*\.sql$/.test(f) && !FUERA.test(f)).sort();
const partes = scripts.map(f => {
  const sql = readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  return `\n-- ─────────────────────────────── ${f}\n${sinBase(f.startsWith('11_') ? soloNominaPagos(sql) : sql)}`;
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, '1_estructura_sogo.sql'),
  `-- GENERADO con database/generar-paquete-produccion.mjs: no editar a mano.\n-- Agrega a la base de la página web las tablas y columnas de SOGO. Se ejecuta UNA vez, después de un respaldo.\n${partes.join('\n')}\n`);

const admin = sinBase(readFileSync(join(DIR, '05_crear_administrador.sql'), 'utf8').replace(/\r\n/g, '\n'))
  .replace(/SET @sogo_url = '[^']*';/, "SET @sogo_url = 'https://sogo.hospedajesebastianfilandia.com';");
writeFileSync(join(OUT, '2_administrador.sql'), `-- GENERADO. Revisa el correo y el nombre antes de ejecutar: esa cuenta será la administradora de SOGO.\n${admin}`);

writeFileSync(join(OUT, '0_revision_previa.sql'), `-- GENERADO. Cada consulta debe devolver 0 filas antes de aplicar 1_estructura_sogo.sql.\n${sinBase(readFileSync(join(DIR, '00_verificar_antes.sql'), 'utf8').replace(/\r\n/g, '\n'))}`);

console.log(`Paquete generado con ${scripts.length} scripts:\n  ${scripts.join('\n  ')}`);
