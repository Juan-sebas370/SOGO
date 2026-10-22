// Documentos generados en el navegador (sin backend): HTML imprimible en una
// pestaña nueva ("Descargar PDF" usa el diálogo de impresión: Guardar como PDF)
// y CSV para Excel.

export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Membrete del hospedaje ───────────────────────────
// Datos de Configuración › Datos del hospedaje. Los fija HotelService al cargar y al guardar,
// así todos los documentos (comprobantes, reportes, exportaciones) llevan el mismo membrete.

export interface Letterhead {
  name: string; legalName: string; nit: string; rnt: string;
  address: string; city: string; phones: string; email: string;
  logo: string;    // data URL o ruta del logo (assets/brand/...)
}

let letterhead: Letterhead | null = null;

export function setLetterhead(l: Letterhead): void { letterhead = l; }

/** Ruta absoluta del logo: la pestaña del documento no conoce la dirección de SOGO. */
export function letterheadLogo(): string {
  const src = letterhead?.logo || 'assets/brand/hospedaje-logo.png';
  return src.startsWith('data:') ? src : new URL(src, document.baseURI).href;
}

/** El logo del hospedaje es claro: va sobre un recuadro azul. */
export function logoTile(size = 56): string {
  return `<span class="lh-logo" style="width:${size}px;height:${size}px"><img src="${esc(letterheadLogo())}" alt="" style="width:${Math.round(size * 0.78)}px;height:${Math.round(size * 0.78)}px"></span>`;
}

/** Membrete: logo, nombre, razón social, NIT, RNT, dirección y contacto (lo que esté diligenciado). */
export function letterheadHtml(): string {
  const l = letterhead;
  if (!l) return '';
  const join = (...v: string[]) => v.filter(Boolean).map(esc).join(' · ');
  const legal = join(l.legalName && l.legalName !== l.name ? l.legalName : '', l.nit ? `NIT ${l.nit}` : '', l.rnt ? `RNT ${l.rnt}` : '');
  const contact = join(l.address, l.city, l.phones, l.email);
  return `<div class="lh">${logoTile()}<div><strong>${esc(l.name)}</strong>${legal ? `<span>${legal}</span>` : ''}${contact ? `<span>${contact}</span>` : ''}</div></div>`;
}

/** Nombre y una línea con NIT, dirección y contacto (para correos, sin imágenes). */
export function letterheadInfo(): { name: string; line: string } {
  const l = letterhead;
  if (!l) return { name: '', line: '' };
  return { name: l.name, line: [l.nit ? `NIT ${l.nit}` : '', l.rnt ? `RNT ${l.rnt}` : '', l.address, l.city, l.phones, l.email].filter(Boolean).join(' · ') };
}

/** El logo como data URL, para documentos que se abren fuera de SOGO (adjuntos de correo). */
export async function letterheadLogoDataUrl(): Promise<string> {
  const src = letterheadLogo();
  if (src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
  } catch { return ''; }
}

/**
 * Abre el documento en una pestaña nueva con el membrete del hospedaje arriba.
 * `letterhead: false` para documentos que ya traen al emisor en su propio encabezado.
 */
/**
 * `landscape`: hoja horizontal (tablas anchas como la auditoría).
 */
export function openDocument(title: string, body: string, print: boolean, opts: { letterhead?: boolean; landscape?: boolean } = {}): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(documentHtml(title, body, opts));
  w.document.close();
  if (!print) return;
  // Se imprime cuando el logo ya cargó (máximo 2 s), para que no salga en blanco
  const images = Array.from(w.document.images);
  const loaded = images.map(img => img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = img.onerror = () => res(); }));
  Promise.race([Promise.all(loaded), new Promise(res => setTimeout(res, 2000))]).then(() => { w.focus(); w.print(); });
}

/** Página completa del documento (membrete + estilos de impresión). `logo` reemplaza la ruta del logo (p. ej. un data URL). */
export function documentHtml(title: string, body: string, opts: { letterhead?: boolean; landscape?: boolean; logo?: string } = {}): string {
  // El rótulo "SOGO" de los encabezados se reemplaza por el membrete del hospedaje
  const own = opts.letterhead === false || body.includes('data-own-letterhead');
  let content = (own ? '' : letterheadHtml()) + body.replace(/<div class="brand">SOGO<\/div>/g, '');
  if (opts.logo) content = content.split(esc(letterheadLogo())).join(opts.logo);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:Poppins,Arial,sans-serif;color:#1F2937;margin:40px auto;max-width:760px;padding:0 24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0B4A8B;padding-bottom:14px;margin-bottom:22px}
  h1{font-size:20px;color:#0A2540;margin:0 0 4px} .muted{color:#6B7280}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#0B4A8B;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse} td,th{padding:7px 8px;border-bottom:1px solid #EEF1F5;text-align:left}
  th{background:#F4F7FB;font-size:12px} .r{text-align:right} .total td{font-weight:700;border-top:2px solid #0A2540}
  .brand{font-weight:700;font-size:18px;color:#0B4A8B;text-align:right}
  .lh{display:flex;align-items:center;gap:14px;margin-bottom:18px}
  .lh strong{display:block;font-size:16px;color:#0A2540}
  .lh span:not(.lh-logo){display:block;font-size:11.5px;color:#4B5563;margin-top:2px}
  .lh-logo{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:12px;background:#0A3D6D}
  .lh-logo img{object-fit:contain}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead{display:table-header-group} tr{break-inside:avoid;page-break-inside:avoid} h2{break-after:avoid;page-break-after:avoid}
  .wrap td{word-break:break-word;overflow-wrap:anywhere} .num{text-align:right;white-space:nowrap} .small{font-size:10.5px;color:#4B5563}
  @page{size:A4 ${opts.landscape ? 'landscape' : 'portrait'};margin:14mm}
  @media print{body{margin:0 auto;max-width:none;padding:0}}
  ${opts.landscape ? 'body{max-width:1060px;font-size:12px} td,th{padding:5px 6px;font-size:11px}' : ''}
</style></head><body>${content}</body></html>`;
}

/** Texto del CSV (punto y coma + BOM), para descargar o adjuntar. */
export function csvText(rows: unknown[][]): string {
  return '﻿' + rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

/** CSV que Excel en español abre en columnas y con tildes correctas (punto y coma + BOM). */
export function downloadCsvFile(rows: unknown[][], fileName: string): void {
  const csv = '\uFEFF' + rows
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
