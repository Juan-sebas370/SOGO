// =====================================================
// REPORTES AUTOMÁTICOS — modelo
// Un reporte programado se arma en SOGO (mismos cálculos de Reportes) y el
// servidor lo envía por correo en su fecha y hora (ver ScheduleService).
// =====================================================

export type ReportKind = 'General' | 'Ocupación' | 'Reservas' | 'Financieros' | 'Inventario' | 'Alertas de inventario' | 'Indicadores' | 'Nómina';
export const REPORT_KINDS: ReportKind[] = ['General', 'Ocupación', 'Reservas', 'Financieros', 'Inventario', 'Alertas de inventario', 'Indicadores', 'Nómina'];

/** Reportes con información contable o de nómina: solo a usuarios con permiso. */
export const SENSITIVE: Partial<Record<ReportKind, 'Contabilidad' | 'Nómina'>> = {
  General: 'Contabilidad', Financieros: 'Contabilidad', Indicadores: 'Contabilidad', Nómina: 'Nómina',
};

export type Frequency = 'Diaria' | 'Semanal' | 'Mensual';
/** HTML: el reporte en el cuerpo del correo y adjunto para imprimir o guardar como PDF. CSV: resumen en el correo y detalle adjunto para Excel. */
export type ReportFormat = 'HTML' | 'CSV';
export const FORMAT_LABEL: Record<ReportFormat, string> = { HTML: 'Documento (HTML / PDF)', CSV: 'Excel (CSV)' };
/** Programaciones guardadas con los formatos anteriores. */
export const normalizeFormat = (f: string): ReportFormat => f === 'CSV' || f === 'Excel' ? 'CSV' : 'HTML';

export const COVERAGE: Record<Frequency, string[]> = {
  Diaria: ['Día anterior', 'Día en curso'],
  Semanal: ['Semana anterior (lun – dom)', 'Últimos 7 días'],
  Mensual: ['Mes anterior', 'Mes en curso'],
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface Schedule {
  id:           string;
  name:         string;
  report:       ReportKind;
  frequency:    Frequency;
  weekday:      number;        // 0 = domingo (semanal)
  monthDay:     number;        // 1–31 (mensual; si el mes es más corto, el último día)
  time:         string;        // HH:mm
  coverage:     string;
  format:       ReportFormat;
  recipients:   string[];
  subject:      string;
  notifyOnFail: boolean;
  active:       boolean;
  createdBy:    string;
  createdAt:    string;
  pausedAt?:    string;
  ownerLogin?:  string;        // usuario que la creó (recibe el aviso si un envío falla)
  activeSince?: string;        // YYYY-MM-DDTHH:mm: desde cuándo está activa (no se envían horas anteriores)
}

export interface Delivery { email: string; ok: boolean; reason?: string; }

export interface Execution {
  id:          string;
  scheduleId:  string;
  name:        string;
  report:      ReportKind;
  at:          string;         // YYYY-MM-DDTHH:mm
  period:      string;         // "21–27/09"
  format:      ReportFormat;
  deliveries:  Delivery[];
  pages:       number;
  test?:       boolean;        // "Enviar prueba"
  retryOf?:    string;
  note?:       string;
  slot?:       string;         // fecha y hora programada que cubre este envío
  by?:         string;         // sesión de SOGO que lo envió
}

export const failed = (e: Execution) => e.deliveries.filter(d => !d.ok);
export const succeeded = (e: Execution) => e.deliveries.every(d => d.ok);

// ── Fechas ───────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDay = (d: Date) => stamp(d).slice(0, 10);

/** Primera ejecución estrictamente posterior a `after`. */
export function nextRun(s: Pick<Schedule, 'frequency' | 'weekday' | 'monthDay' | 'time'>, after: Date): Date {
  const [h, m] = s.time.split(':').map(Number);
  const at = (d: Date) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  if (s.frequency === 'Mensual') {
    for (let i = 0; i < 3; i++) {
      const first = new Date(after.getFullYear(), after.getMonth() + i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const cand = at(new Date(first.getFullYear(), first.getMonth(), Math.min(s.monthDay, last)));
      if (cand > after) return cand;
    }
  }
  for (let i = 0; i < 8; i++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i);
    if (s.frequency === 'Semanal' && day.getDay() !== s.weekday) continue;
    const cand = at(day);
    if (cand > after) return cand;
  }
  return at(new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1));
}

/** Ejecuciones entre dos fechas (para reconstruir el historial). */
export function runsBetween(s: Schedule, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = nextRun(s, from); d <= to; d = nextRun(s, d)) out.push(d);
  return out;
}

/** Período que cubre una ejecución, en texto corto: "27/09", "21–27/09", "Agosto 2026". */
export function coveredPeriod(s: Pick<Schedule, 'frequency' | 'coverage'>, at: Date): string {
  const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const shift = (n: number) => new Date(at.getFullYear(), at.getMonth(), at.getDate() + n);
  const month = (d: Date) => d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).replace(' de ', ' ').replace(/^./, c => c.toUpperCase());
  switch (s.coverage) {
    case 'Día anterior': return dm(shift(-1));
    case 'Día en curso': return dm(at);
    case 'Últimos 7 días': return `${pad(shift(-7).getDate())}–${dm(shift(-1))}`;
    case 'Semana anterior (lun – dom)': {
      const back = (at.getDay() + 6) % 7 + 7;      // lunes de la semana pasada
      return `${pad(shift(-back).getDate())}–${dm(shift(-back + 6))}`;
    }
    case 'Mes anterior': return month(new Date(at.getFullYear(), at.getMonth() - 1, 1));
    default: return month(at);
  }
}

/** "Diaria · 06:30", "Semanal · lun 07:00", "Mensual · día 1 · 08:00" */
export function frequencyLabel(s: Schedule): string {
  if (s.frequency === 'Diaria') return `Diaria · ${s.time}`;
  if (s.frequency === 'Semanal') return `Semanal · ${WEEKDAYS[s.weekday].slice(0, 3).toLowerCase()} ${s.time}`;
  return `Mensual · día ${s.monthDay} · ${s.time}`;
}

export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export { isoDay };
