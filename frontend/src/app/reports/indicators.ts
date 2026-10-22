// Indicadores de desempeño: definición y sentido (si más es mejor). Las metas no vienen escritas
// aquí: las define el Administrador en Configuración › Metas e indicadores y se guardan en la base.
import type { MonthSummary } from './reports.service';
import { money, pct, num, millions } from './reports.model';

export type IndicatorKey = 'occupancy' | 'adr' | 'revpar' | 'income' | 'margin' | 'cancelRate' | 'staffRatio'
  | 'avgStay' | 'receivables' | 'rotation' | 'traOnTime';

export interface IndicatorDef {
  key: IndicatorKey;
  label: string;          // título de la tarjeta
  panel: string;          // nombre en "Personalizar panel"
  higher: boolean;        // true: la meta es un mínimo
  kind: 'pp' | 'rel';     // cómo se expresa el cambio frente al período anterior
  unit: string;           // unidad de la meta en el formulario
  value: (s: MonthSummary) => number | null;
  format: (v: number) => string;
  goalFormat: (v: number) => string;
}

const thousands = (v: number) => `${num(v / 1000)} mil`;

export const INDICATORS: IndicatorDef[] = [
  { key: 'occupancy', label: 'Ocupación', panel: 'Ocupación', higher: true, kind: 'pp', unit: '%',
    value: s => s.occupancy, format: v => pct(v), goalFormat: v => `${num(v)} %` },
  { key: 'adr', label: 'Tarifa promedio', panel: 'Tarifa promedio (ADR)', higher: true, kind: 'rel', unit: '$',
    value: s => s.adr, format: money, goalFormat: thousands },
  { key: 'revpar', label: 'RevPAR', panel: 'RevPAR', higher: true, kind: 'rel', unit: '$',
    value: s => s.revpar, format: money, goalFormat: thousands },
  { key: 'income', label: 'Ingresos totales', panel: 'Ingresos totales', higher: true, kind: 'rel', unit: '$',
    value: s => s.income, format: v => millions(v), goalFormat: v => millions(v) },
  { key: 'margin', label: 'Margen', panel: 'Margen antes de imp.', higher: true, kind: 'pp', unit: '%',
    value: s => s.margin, format: v => pct(v), goalFormat: v => `${num(v)} %` },
  { key: 'cancelRate', label: 'Tasa de cancelación', panel: 'Tasa de cancelación', higher: false, kind: 'pp', unit: '%',
    value: s => s.cancelRate, format: v => pct(v), goalFormat: v => `${num(v)} %` },
  { key: 'staffRatio', label: 'Personal / ingresos', panel: 'Costo de personal / ingresos', higher: false, kind: 'pp', unit: '%',
    value: s => s.staffRatio, format: v => pct(v), goalFormat: v => `${num(v)} %` },
  { key: 'avgStay', label: 'Estancia promedio', panel: 'Estancia promedio', higher: true, kind: 'rel', unit: 'noches',
    value: s => s.avgStay, format: v => `${num(v, 1)} noches`, goalFormat: v => `${num(v, 1)} noches` },
  { key: 'receivables', label: 'Cartera por cobrar', panel: 'Cartera por cobrar', higher: false, kind: 'rel', unit: '$',
    value: s => s.receivables, format: money, goalFormat: v => millions(v) },
  { key: 'rotation', label: 'Rotación de inventario', panel: 'Rotación de inventario', higher: true, kind: 'rel', unit: 'veces',
    value: s => s.rotation, format: v => `${num(v, 2)} veces`, goalFormat: v => `${num(v, 1)} veces` },
  { key: 'traOnTime', label: 'TRA reportadas a tiempo', panel: 'TRA reportadas a tiempo', higher: true, kind: 'pp', unit: '%',
    value: s => s.traOnTime, format: v => pct(v), goalFormat: v => `${num(v)} %` },
];

export const indicator = (key: IndicatorKey) => INDICATORS.find(i => i.key === key)!;

export const DEFAULT_VIEW: { order: IndicatorKey[]; active: IndicatorKey[] } = {
  order: INDICATORS.map(i => i.key),
  active: ['occupancy', 'adr', 'revpar', 'income', 'margin', 'cancelRate', 'staffRatio', 'traOnTime'],
};

/** ¿Cumple la meta? null si no hay dato o si la meta aún no se ha definido. */
export const meetsGoal = (def: IndicatorDef, value: number | null, goal: number | null) =>
  value === null || !isFinite(value) || goal === null ? null : def.higher ? value >= goal : value <= goal;
