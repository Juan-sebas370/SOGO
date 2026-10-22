// Descarga de gráficos: PNG (lienzo del navegador) y PDF (documento imprimible).
import { esc, openDocument } from '../../shared/documents';

/** SVG serializado, con tamaño explícito y sin elementos interactivos (tooltip). */
export function svgMarkup(host: Element, width = 600): string {
  const svg = host.querySelector('svg');
  if (!svg) return '';
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const [, , w, h] = (clone.getAttribute('viewBox') ?? `0 0 ${width} 250`).split(' ').map(Number);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(Math.round(width * h / w)));
  clone.querySelectorAll('[pointer-events="none"]').forEach(n => n.remove());
  return new XMLSerializer().serializeToString(clone);
}

/** Descarga el gráfico como imagen PNG con título, período y fecha de generación. */
export function downloadPng(host: Element, fileName: string, title: string, subtitle: string): void {
  const markup = svgMarkup(host, 1200);
  if (!markup) return;
  const img = new Image();
  img.onload = () => {
    const pad = 40, head = 90;
    const canvas = document.createElement('canvas');
    canvas.width = img.width + pad * 2;
    canvas.height = img.height + head + pad;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0A2540';
    ctx.font = 'bold 30px Poppins, Arial, sans-serif';
    ctx.fillText(title, pad, 52);
    ctx.fillStyle = '#6B7280';
    ctx.font = '20px Poppins, Arial, sans-serif';
    ctx.fillText(subtitle, pad, 80);
    ctx.drawImage(img, pad, head);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = fileName;
    a.click();
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
}

/** Documento con uno o varios gráficos, listo para "Guardar como PDF". */
export function chartsPdf(docTitle: string, company: string, generated: string, items: { title: string; sub: string; host: Element }[]): void {
  openDocument(docTitle, `
    <header><div><h1>${esc(docTitle)}</h1><div class="muted">${esc(company)} · generado ${esc(generated)}</div></div><div class="brand">SOGO</div></header>
    ${items.map(i => `<section style="page-break-inside:avoid;margin-bottom:26px"><h2>${esc(i.title)}</h2><div class="muted" style="margin-bottom:8px">${esc(i.sub)}</div>${svgMarkup(i.host, 700)}</section>`).join('')}`, true);
}
