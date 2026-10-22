// =====================================================
// REPORTES PROGRAMADOS — contenido del correo
// Cada reporte se arma con los mismos cálculos de las pantallas de Reportes
// (ReportsService), para el período que cubre la programación.
// =====================================================

import { ReportsService } from './reports.service';
import { ReportKind, ReportFormat } from './schedule.model';
import { INDICATORS, meetsGoal } from './indicators';
import { Range, money, pct, num, dmy, addDays, monthEnd, monthName } from './reports.model';
import { CHANNELS, totalAmount } from '../reservations/reservation.model';
import { esc, letterheadInfo } from '../shared/documents';

export interface BuiltTable { title: string; head: string[]; rows: (string | number)[][]; right?: number[]; }
export interface BuiltReport { title: string; range: Range; summary: [string, string][]; tables: BuiltTable[]; notes: string[]; }

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Período que cubre un envío hecho en la fecha `at` (según «Período que cubre» de la programación). */
export function coverageRange(coverage: string, at: Date, goLive: string): Range {
  const day = iso(at);
  let r: Range;
  switch (coverage) {
    case 'Día anterior': r = { from: addDays(day, -1), to: addDays(day, -1) }; break;
    case 'Día en curso': r = { from: day, to: day }; break;
    case 'Últimos 7 días': r = { from: addDays(day, -7), to: addDays(day, -1) }; break;
    case 'Semana anterior (lun – dom)': { const monday = addDays(day, -((at.getDay() + 6) % 7) - 7); r = { from: monday, to: addDays(monday, 6) }; break; }
    case 'Mes anterior': { const p = iso(new Date(at.getFullYear(), at.getMonth() - 1, 1)).slice(0, 7); r = { from: `${p}-01`, to: monthEnd(p) }; break; }
    default: r = { from: `${day.slice(0, 7)}-01`, to: day };
  }
  // Antes del inicio de SOGO no hay datos registrados
  if (r.from < goLive) r = { from: goLive > r.to ? r.to : goLive, to: r.to };
  return r;
}

/** Módulos que la sesión debe poder consultar para armar cada reporte con datos completos. */
export const REPORT_NEEDS: Record<ReportKind, ('Reservas' | 'Alojamiento' | 'Contable' | 'Inventario' | 'Nómina')[]> = {
  General: ['Reservas', 'Alojamiento', 'Contable'], Ocupación: ['Reservas', 'Alojamiento'], Reservas: ['Reservas'],
  Financieros: ['Contable'], Inventario: ['Inventario'], 'Alertas de inventario': ['Inventario'], Indicadores: ['Reservas', 'Contable'], Nómina: ['Nómina'],
};

export function buildReport(s: ReportsService, kind: ReportKind, range: Range): BuiltReport {
  const out: BuiltReport = { title: `Reporte ${kind.toLowerCase()}`, range, summary: [], tables: [], notes: [] };
  const before = range.to < s.goLive;
  if (before) out.notes.push(`El período es anterior al inicio de SOGO (${dmy(s.goLive)}): no hay datos registrados.`);
  switch (kind) {
    case 'General': {
      const occ = s.occupancy(range), res = s.reservationStats(range), fin = s.financial(range), tra = s.traSummary(range);
      const bill = s.billingSummary(range), pay = s.payrollSummary(range.to.slice(0, 7)), inv = s.inventoryReport(range);
      out.summary = [
        ['Ocupación', `${pct(occ.pct)} · ${occ.occupied} de ${occ.available} noches`],
        ['Reservas creadas', `${num(res.count)} · ${res.voided} canceladas`],
        ['Ingresos', money(fin.income)], ['Egresos', money(fin.expenses)],
        ['Utilidad antes de impuestos', `${money(fin.profit)} · margen ${pct(fin.margin)}`],
        ['TRA reportadas', `${tra.reported} de ${tra.due}${tra.errors ? ` · ${tra.errors} con error` : ''}`],
        ['Cartera por cobrar (hoy)', money(bill.receivables)],
        [`Nómina de ${monthName(range.to.slice(0, 7))}`, pay.run ? `${money(pay.net)} neto · ${pay.status.toLowerCase()}` : 'Sin liquidar'],
        ['Valor en existencias', money(inv.stockValue)],
      ];
      out.tables.push({ title: 'Reservas por canal', head: ['Canal', 'Reservas'], right: [1], rows: CHANNELS.map(c => [c, res.byChannel[c]]) });
      break;
    }
    case 'Ocupación': {
      const occ = s.occupancy(range);
      out.summary = [
        ['Ocupación', pct(occ.pct)], ['Noches ocupadas', `${occ.occupied} de ${occ.available}`], ['Estadías', num(occ.stays)],
        ['Estancia promedio', `${num(occ.avgStay, 1)} noches`], ['Tarifa promedio (ADR)', money(occ.adr)], ['RevPAR', money(occ.revpar)],
      ];
      out.tables.push({ title: 'Por modalidad', head: ['Modalidad', 'Noches', 'Participación'], right: [1, 2], rows: occ.byMode.map(b => [b.mode, b.nights, pct(b.share)]) });
      out.tables.push({ title: 'Por habitación', head: ['Habitación', 'Noches ocupadas', 'Disponibles', 'Ocupación'], right: [1, 2, 3],
        rows: occ.rooms.map(r => [r.room.number, r.occupied, r.available, pct(r.pct)]) });
      if (occ.days.length <= 31) out.tables.push({ title: 'Por día', head: ['Fecha', 'Ocupadas', 'Disponibles', 'Ocupación'], right: [1, 2, 3],
        rows: occ.days.map(d => [dmy(d.date), d.occupied, d.available, pct(d.pct)]) });
      break;
    }
    case 'Reservas': {
      const list = s.createdIn(range), st = s.reservationStats(range);
      out.summary = [
        ['Reservas creadas', num(st.count)], ['Canceladas', `${st.voided} · ${pct(st.cancelRate)}`], ['Valor', money(st.value)],
        ['Anticipación promedio', `${num(st.leadDays)} días`], ['Con saldo pendiente', `${st.pendingPay} · ${money(st.pendingBalance)}`],
      ];
      out.tables.push({ title: 'Por canal', head: ['Canal', 'Reservas'], right: [1], rows: CHANNELS.map(c => [c, st.byChannel[c]]) });
      out.tables.push({ title: 'Reservas creadas en el período', head: ['Código', 'Huésped', 'Canal', 'Llegada', 'Salida', 'Noches', 'Estado', 'Valor'], right: [5, 7],
        rows: [...list].sort((a, b) => a.checkIn.localeCompare(b.checkIn)).map(r => [r.code, r.guestName, r.channel, dmy(r.checkIn), dmy(r.checkOut), r.nights, r.status, money(totalAmount(r))]) });
      break;
    }
    case 'Financieros': {
      const f = s.financial(range);
      out.summary = [
        ['Ingresos', money(f.income)], ['Egresos', money(f.expenses)], ['Utilidad antes de impuestos', money(f.profit)],
        ['Margen', pct(f.margin)], ['Movimiento de caja y bancos', money(f.cashFlow)], ['Razón corriente', num(f.currentRatio, 2)],
      ];
      out.tables.push({ title: 'Ingresos por fuente', head: ['Fuente', 'Valor'], right: [1], rows: f.sources.map(x => [x.label, money(x.value)]) });
      out.tables.push({ title: 'Egresos por categoría', head: ['Categoría', 'Valor'], right: [1], rows: f.categories.filter(c => c.value).map(c => [c.label, money(c.value)]) });
      out.tables.push({ title: 'Por centro de costo', head: ['Centro', 'Ingresos', 'Egresos', 'Utilidad', 'Margen'], right: [1, 2, 3, 4],
        rows: f.centers.map(c => [c.center, money(c.income), money(c.expenses), money(c.profit), pct(c.margin)]) });
      out.notes.push('Cifras tomadas de Contabilidad (comprobantes contabilizados), sin el cierre anual.');
      break;
    }
    case 'Inventario': {
      const r = s.inventoryReport(range);
      out.summary = [
        ['Valor en existencias', money(r.stockValue)], ['Entradas', `${money(r.entries)} · ${r.entryCount} movimientos`],
        ['Consumo al costo', `${money(r.consumption)} · ${r.exitCount} salidas`], ['Pérdidas y bajas', `${money(r.shrinkage)} · ${pct(r.shrinkShare)} del consumo`],
        ['Rotación', num(r.rotation, 2)], ['Cobertura', isFinite(r.coverDays) ? `${num(r.coverDays)} días` : '—'],
      ];
      out.tables.push({ title: 'Valor por categoría', head: ['Categoría', 'Valor'], right: [1], rows: r.byCategory.map(c => [c.category, money(c.value)]) });
      out.tables.push({ title: 'Consumo por área', head: ['Área', 'Valor', 'Participación'], right: [1, 2], rows: r.byArea.map(a => [a.area, money(a.value), pct(a.share)]) });
      out.tables.push({ title: 'Productos más consumidos', head: ['Producto', 'Cantidad', 'Valor'], right: [1, 2], rows: r.top.map(t => [t.name, `${num(t.qty, 2)} ${t.unit}`, money(t.value)]) });
      break;
    }
    case 'Alertas de inventario': {
      const r = s.inventoryReport(range);
      out.summary = [['Productos con alerta', num(r.alerts.length)], ['Agotados', num(r.alerts.filter(a => a.status === 'Agotado').length)],
        ['Bajo el mínimo', num(r.alerts.filter(a => a.status === 'Stock bajo').length)], ['Por vencer', num(r.alerts.filter(a => a.status === 'Por vencer').length)]];
      out.tables.push({ title: 'Alertas', head: ['Código', 'Producto', 'Estado', 'Existencias', 'Mínimo', 'Consumo diario', 'Vence'], right: [3, 4, 5],
        rows: r.alerts.map(a => [a.product.code, a.product.name, a.status, `${num(a.product.stock, 2)} ${a.product.unit}`, num(a.product.minStock, 2), num(a.daily, 2), a.expiry ? dmy(a.expiry) : '—']) });
      break;
    }
    case 'Indicadores': {
      const period = range.to.slice(0, 7);
      const m = s.monthSummary(period);
      out.summary = [['Mes', monthName(period)], ['Corte', dmy(m.range.to)]];
      out.tables.push({ title: `Indicadores de ${monthName(period)}`, head: ['Indicador', 'Valor', 'Meta', 'Cumple'], right: [1, 2],
        rows: INDICATORS.map(def => {
          const v = def.value(m), goal = s.goal(def.key), ok = meetsGoal(def, v, goal);
          return [def.panel, v === null || !isFinite(v) ? '—' : def.format(v), goal === null ? 'Sin meta' : def.goalFormat(goal), ok === null ? '—' : ok ? 'Sí' : 'No'];
        }) });
      out.notes.push('Metas de Configuración › Metas e indicadores.');
      break;
    }
    case 'Nómina': {
      const period = range.to.slice(0, 7);
      const p = s.payrollSummary(period);
      out.summary = [['Período', monthName(period)], ['Estado', p.status], ['Empleados', num(p.employees)], ['Neto a pagar', money(p.net)], ['Costo total (con aportes y provisiones)', money(p.cost)]];
      out.tables.push({ title: 'Liquidación por empleado', head: ['Empleado', 'Cargo', 'Área', 'Días', 'Devengado', 'Deducciones', 'Neto'], right: [3, 4, 5, 6],
        rows: p.lines.map(l => [l.name, l.position, l.area, l.days, money(l.totalEarnings), money(l.totalDeductions), money(l.net)]) });
      if (!p.run) out.notes.push(`La nómina de ${monthName(period)} todavía no está liquidada en SOGO.`);
      break;
    }
  }
  return out;
}

const periodText = (r: Range) => r.from === r.to ? dmy(r.from) : `${dmy(r.from)} – ${dmy(r.to)}`;

/** Cuerpo del correo: estilos en línea (los clientes de correo ignoran las hojas de estilo). */
export function emailHtml(b: BuiltReport, meta: { generated: string; by: string; format: ReportFormat; attachment: string }): string {
  const l = letterheadInfo();
  const td = 'padding:6px 8px;border-bottom:1px solid #EEF1F5;font-size:13px';
  const table = (t: BuiltTable) => `<h3 style="font-size:13px;color:#0B4A8B;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.03em">${esc(t.title)}</h3>
    ${t.rows.length ? `<table style="border-collapse:collapse;width:100%"><thead><tr>${t.head.map((h, i) => `<th style="${td};background:#F4F7FB;text-align:${t.right?.includes(i) ? 'right' : 'left'};font-size:12px">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td style="${td};text-align:${t.right?.includes(i) ? 'right' : 'left'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<p style="color:#6B7280;font-size:13px;margin:0">Sin registros en el período.</p>'}`;
  return `<div style="font-family:Arial,sans-serif;color:#1F2937;max-width:760px;margin:0 auto">
  <div style="border-bottom:2px solid #0B4A8B;padding-bottom:10px;margin-bottom:16px">
    <div style="font-size:16px;font-weight:700;color:#0A2540">${esc(l.name)}</div>
    ${l.line ? `<div style="font-size:12px;color:#4B5563">${esc(l.line)}</div>` : ''}
  </div>
  <h2 style="font-size:19px;color:#0A2540;margin:0 0 2px">${esc(b.title)}</h2>
  <div style="font-size:12.5px;color:#6B7280;margin-bottom:14px">Período ${periodText(b.range)} · generado ${esc(meta.generated)} desde SOGO</div>
  <table style="border-collapse:collapse;width:100%">${b.summary.map(([k, v]) => `<tr><td style="${td};color:#4B5563">${esc(k)}</td><td style="${td};font-weight:700;text-align:right">${esc(v)}</td></tr>`).join('')}</table>
  ${meta.format === 'CSV' ? `<p style="font-size:13px;margin-top:16px">El detalle completo va en el archivo adjunto <strong>${esc(meta.attachment)}</strong> (se abre en Excel).</p>` : b.tables.map(table).join('')}
  ${b.notes.map(n => `<p style="font-size:12px;color:#6B7280;margin:12px 0 0">${esc(n)}</p>`).join('')}
  <p style="font-size:11.5px;color:#9CA3AF;margin-top:22px;border-top:1px solid #EEF1F5;padding-top:10px">Reporte programado en SOGO › Reportes › Programados${meta.format === 'HTML' ? `. El adjunto ${esc(meta.attachment)} se puede abrir en el navegador e imprimir o guardar como PDF` : ''}.</p>
</div>`;
}

/** Texto plano para clientes de correo sin HTML. */
export function emailText(b: BuiltReport): string {
  return [`${b.title} · ${periodText(b.range)}`, '', ...b.summary.map(([k, v]) => `${k}: ${v}`), '', ...b.notes].join('\n');
}

/** Filas para el CSV adjunto (mismo formato que las exportaciones de SOGO). */
export function csvRows(b: BuiltReport): (string | number)[][] {
  const rows: (string | number)[][] = [[b.title], [`Período ${periodText(b.range)}`], [], ...b.summary.map(([k, v]) => [k, v])];
  b.tables.forEach(t => rows.push([], [t.title], t.head, ...t.rows));
  if (b.notes.length) rows.push([], ...b.notes.map(n => [n]));
  return rows;
}

/** Cuerpo del documento adjunto (HTML imprimible, con el membrete). */
export function documentBody(b: BuiltReport, generated: string): string {
  const table = (t: BuiltTable) => `<h2>${esc(t.title)}</h2>${t.rows.length
    ? `<table><thead><tr>${t.head.map((h, i) => `<th${t.right?.includes(i) ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td${t.right?.includes(i) ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="muted">Sin registros en el período.</p>'}`;
  return `<header><div><h1>${esc(b.title)}</h1><div class="muted">Período ${periodText(b.range)} · generado ${esc(generated)}</div></div></header>
    <table>${b.summary.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
    ${b.tables.map(table).join('')}${b.notes.map(n => `<p class="muted small">${esc(n)}</p>`).join('')}`;
}
