// Documentos generados en el navegador (sin backend): HTML imprimible en una
// pestaña nueva ("Descargar PDF" usa el diálogo de impresión: Guardar como PDF)
// y CSV para Excel.

export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function openDocument(title: string, body: string, print: boolean): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:Poppins,Arial,sans-serif;color:#1F2937;margin:40px auto;max-width:760px;padding:0 24px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0B4A8B;padding-bottom:14px;margin-bottom:22px}
  h1{font-size:20px;color:#0A2540;margin:0 0 4px} .muted{color:#6B7280}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#0B4A8B;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse} td,th{padding:7px 8px;border-bottom:1px solid #EEF1F5;text-align:left}
  th{background:#F4F7FB;font-size:12px} .r{text-align:right} .total td{font-weight:700;border-top:2px solid #0A2540}
  .brand{font-weight:700;font-size:18px;color:#0B4A8B;text-align:right}
  @media print{body{margin:0 auto}}
</style></head><body>${body}</body></html>`);
  w.document.close();
  if (print) { w.focus(); w.print(); }
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
