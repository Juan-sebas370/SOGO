import { create } from 'qrcode';

/**
 * Código QR como SVG (texto), calculado en el momento: así está listo antes de imprimir
 * (la página de impresión abre el diálogo enseguida). Corrección de errores media, como la DIAN.
 */
export function qrSvg(text: string, size = 120): string {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, quiet = 2, total = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (modules.get(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
