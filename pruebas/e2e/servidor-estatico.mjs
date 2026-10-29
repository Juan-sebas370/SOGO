// Sirve una compilación del frontend para las pruebas E2E (por defecto en el puerto 4291).
//   node pruebas/e2e/servidor-estatico.mjs <carpeta-compilada> [puerto]
// Las rutas de Angular (/dashboard/...) responden index.html, como en producción.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2];
const port = +(process.argv[3] ?? 4291);
if (!root) throw new Error('Falta la carpeta compilada');
if (port === 4201) throw new Error('El 4201 es el SOGO real: usa otro puerto para pruebas.');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '');
  for (const file of [join(root, path), join(root, 'index.html')]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch { /* siguiente opción */ }
  }
  res.writeHead(404).end();
}).listen(port, '127.0.0.1', () => console.log(`Frontend de prueba en http://localhost:${port}`));
