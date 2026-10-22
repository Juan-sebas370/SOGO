// Gráficos SVG de Reportes. Los colores y las fuentes van como atributos en
// línea (no en CSS) para que el SVG se pueda descargar como PNG o PDF tal cual.

import { Component, ElementRef, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { axis, COLORS } from '../reports.model';

export interface Series { name: string; color: string; values: (number | null)[]; dashed?: boolean; area?: boolean; colors?: string[]; }
export interface Goal { value: number; color: string; label: string; }
export interface Slice { label: string; value: number; color: string; }

const FONT = 'Poppins, Arial, sans-serif';
const W = 600, LEFT = 44, RIGHT = 14, TOP = 26, BOTTOM = 28;

/** Mide aproximadamente el ancho de un texto a 11 px. */
const textWidth = (s: string) => s.length * 6.1;

// ── Barras ───────────────────────────────────────────

@Component({
  selector: 'rp-bars',
  standalone: true,
  imports: [CommonModule],
  template: `
  <svg [attr.viewBox]="'0 0 ' + W + ' ' + height" width="100%" [attr.font-family]="font" role="img" [attr.aria-label]="aria" (mouseleave)="hover = -1">
    <g *ngFor="let t of ticks">
      <line [attr.x1]="LEFT" [attr.x2]="W - RIGHT" [attr.y1]="y(t)" [attr.y2]="y(t)" [attr.stroke]="C.grid" stroke-width="1"/>
      <text [attr.x]="LEFT - 8" [attr.y]="y(t) + 4" font-size="10" [attr.fill]="C.text" text-anchor="end">{{ tick(t) }}</text>
    </g>
    <g *ngFor="let l of labels; let i = index" (mouseenter)="hover = i" style="cursor: default">
      <rect [attr.x]="LEFT + i * group" y="0" [attr.width]="group" [attr.height]="base" fill="transparent"/>
      <ng-container *ngFor="let s of series; let k = index">
        <rect *ngIf="s.values[i] !== null" [attr.x]="bx(i, k)" [attr.y]="y(s.values[i] || 0)" [attr.width]="bw" [attr.height]="base - y(s.values[i] || 0)" rx="4"
              [attr.fill]="s.colors?.[i] || s.color" [attr.opacity]="hover >= 0 && hover !== i ? 0.55 : 1"><title>{{ s.name }} · {{ l }}: {{ valueLabel(s.values[i] || 0) }}</title></rect>
        <text *ngIf="showValue(i, k)" [attr.x]="bx(i, k) + bw / 2" [attr.y]="y(s.values[i] || 0) - 6" font-size="10.5" font-weight="700" [attr.fill]="C.navy" text-anchor="middle">{{ valueLabel(s.values[i] || 0) }}</text>
      </ng-container>
      <text [attr.x]="LEFT + i * group + group / 2" [attr.y]="height - 8" font-size="11" [attr.fill]="C.text" text-anchor="middle">{{ l }}</text>
    </g>
    <g *ngFor="let g of goals">
      <line [attr.x1]="LEFT" [attr.x2]="W - RIGHT" [attr.y1]="y(g.value)" [attr.y2]="y(g.value)" [attr.stroke]="g.color" stroke-width="2" stroke-dasharray="6 5"/>
    </g>
    <g *ngIf="hover >= 0 && tooltip" pointer-events="none">
      <rect [attr.x]="tipX" [attr.y]="TOP - 20" [attr.width]="tipW" [attr.height]="18 + tipLines.length * 15" rx="7" [attr.fill]="C.navy"/>
      <text *ngFor="let t of tipLines; let j = index" [attr.x]="tipX + 10" [attr.y]="TOP - 3 + j * 15" font-size="11" [attr.font-weight]="j === 0 ? 700 : 400" fill="#FFFFFF">{{ t }}</text>
    </g>
  </svg>`,
})
export class BarsComponent implements OnChanges {
  @Input() labels: string[] = [];
  @Input() series: Series[] = [];
  @Input() height = 250;
  @Input() goals: Goal[] = [];
  @Input() valuesShown: 'all' | 'last' | 'none' | 'max' = 'none';
  @Input() tick: (v: number) => string = v => String(v);
  @Input() valueLabel: (v: number) => string = v => String(v);
  @Input() tooltip?: (i: number) => string[];
  @Input() aria = 'Gráfico de barras';

  readonly W = W; readonly LEFT = LEFT; readonly RIGHT = RIGHT; readonly TOP = TOP;
  readonly C = COLORS; readonly font = FONT;
  hover = -1;
  ticks: number[] = [];
  private max = 1;

  constructor(public el: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const all = this.series.flatMap(s => s.values.filter((v): v is number => v !== null));
    const a = axis(Math.max(0, ...all, ...this.goals.map(g => g.value)) * 1.08);
    this.max = a.max; this.ticks = a.ticks;
  }

  get base(): number { return this.height - BOTTOM; }
  get group(): number { return (W - LEFT - RIGHT) / Math.max(1, this.labels.length); }
  get bw(): number { return Math.min(46, this.group * 0.72 / Math.max(1, this.series.length)); }
  bx(i: number, k: number): number {
    const total = this.bw * this.series.length + (this.series.length - 1) * 6;
    return LEFT + i * this.group + (this.group - total) / 2 + k * (this.bw + 6);
  }
  y(v: number): number { return this.base - Math.max(0, v) / this.max * (this.base - TOP); }
  showValue(i: number, k: number): boolean {
    const v = this.series[k].values[i];
    if (v === null || this.valuesShown === 'none') return false;
    if (this.valuesShown === 'all') return true;
    if (this.valuesShown === 'last') return i === this.labels.length - 1;
    return v === Math.max(...this.series[k].values.map(x => x ?? 0));
  }
  get tipLines(): string[] { return this.tooltip && this.hover >= 0 ? this.tooltip(this.hover) : []; }
  get tipW(): number { return Math.max(...this.tipLines.map(textWidth)) + 20; }
  get tipX(): number { return Math.min(W - RIGHT - this.tipW, Math.max(LEFT, LEFT + this.hover * this.group + this.group / 2 - this.tipW / 2)); }
}

// ── Líneas ───────────────────────────────────────────

@Component({
  selector: 'rp-lines',
  standalone: true,
  imports: [CommonModule],
  template: `
  <svg [attr.viewBox]="'0 0 ' + W + ' ' + height" width="100%" [attr.font-family]="font" role="img" [attr.aria-label]="aria" (mouseleave)="hover = -1">
    <g *ngFor="let t of ticks">
      <line [attr.x1]="LEFT" [attr.x2]="W - RIGHT" [attr.y1]="y(t)" [attr.y2]="y(t)" [attr.stroke]="C.grid" stroke-width="1"/>
      <text [attr.x]="LEFT - 8" [attr.y]="y(t) + 4" font-size="10" [attr.fill]="C.text" text-anchor="end">{{ tick(t) }}</text>
    </g>
    <line [attr.x1]="LEFT" [attr.x2]="W - RIGHT" [attr.y1]="base" [attr.y2]="base" stroke="#C9D3E0" stroke-width="1"/>
    <g *ngFor="let l of labels; let i = index">
      <text *ngIf="showLabel(i)" [attr.x]="x(i)" [attr.y]="height - 8" font-size="11" [attr.fill]="C.text" text-anchor="middle">{{ l }}</text>
    </g>
    <g *ngFor="let s of series">
      <path *ngIf="s.area" [attr.d]="areaPath(s)" [attr.fill]="s.color" fill-opacity="0.1" stroke="none"/>
      <path [attr.d]="linePath(s)" fill="none" [attr.stroke]="s.color" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" [attr.stroke-dasharray]="s.dashed ? '7 6' : null"/>
      <ng-container *ngIf="points">
        <ng-container *ngFor="let v of s.values; let i = index">
          <circle *ngIf="v !== null && !s.dashed" [attr.cx]="x(i)" [attr.cy]="y(v)" r="4" fill="#FFFFFF" [attr.stroke]="s.color" stroke-width="2"/>
        </ng-container>
      </ng-container>
      <ng-container *ngFor="let v of s.values; let i = index">
        <text *ngIf="v !== null && labelAt(s, i)" [attr.x]="x(i)" [attr.y]="y(v) - 10" font-size="10.5" font-weight="700" [attr.fill]="C.navy" [attr.text-anchor]="i === labels.length - 1 ? 'end' : 'middle'">{{ valueLabel(v) }}</text>
      </ng-container>
    </g>
    <g *ngFor="let g of goals">
      <line [attr.x1]="LEFT" [attr.x2]="W - RIGHT" [attr.y1]="y(g.value)" [attr.y2]="y(g.value)" [attr.stroke]="g.color" stroke-width="2" stroke-dasharray="6 5"/>
    </g>
    <g *ngIf="tooltip">
      <rect *ngFor="let l of labels; let i = index" [attr.x]="x(i) - step / 2" [attr.y]="TOP" [attr.width]="step" [attr.height]="base - TOP" fill="transparent" (mouseenter)="hover = i"/>
    </g>
    <g *ngIf="hover >= 0 && tooltip" pointer-events="none">
      <line [attr.x1]="x(hover)" [attr.x2]="x(hover)" [attr.y1]="TOP" [attr.y2]="base" stroke="#9AA5B4" stroke-dasharray="3 3"/>
      <rect [attr.x]="tipX" [attr.y]="TOP - 20" [attr.width]="tipW" [attr.height]="18 + tipLines.length * 15" rx="7" [attr.fill]="C.navy"/>
      <text *ngFor="let t of tipLines; let j = index" [attr.x]="tipX + 10" [attr.y]="TOP - 3 + j * 15" font-size="11" [attr.font-weight]="j === 0 ? 700 : 400" fill="#FFFFFF">{{ t }}</text>
    </g>
  </svg>`,
})
export class LinesComponent implements OnChanges {
  @Input() labels: string[] = [];
  @Input() series: Series[] = [];
  @Input() height = 250;
  @Input() goals: Goal[] = [];
  @Input() yMax: number | null = null;
  @Input() points = true;
  /** Qué puntos llevan su valor escrito: índices, 'last', 'max' o 'none'. */
  @Input() valuesShown: 'last' | 'max' | 'maxlast' | 'none' = 'none';
  @Input() labelEvery = 0;
  @Input() tick: (v: number) => string = v => String(v);
  @Input() valueLabel: (v: number) => string = v => String(v);
  @Input() tooltip?: (i: number) => string[];
  @Input() aria = 'Gráfico de líneas';

  readonly W = W; readonly LEFT = LEFT; readonly RIGHT = RIGHT; readonly TOP = TOP;
  readonly C = COLORS; readonly font = FONT;
  hover = -1;
  ticks: number[] = [];
  private max = 1;

  constructor(public el: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const all = this.series.flatMap(s => s.values.filter((v): v is number => v !== null));
    const a = this.yMax !== null ? { max: this.yMax, ticks: [0, 1, 2, 3, 4].map(i => i * this.yMax! / 4) } : axis(Math.max(0, ...all, ...this.goals.map(g => g.value)) * 1.1);
    this.max = a.max; this.ticks = a.ticks;
  }

  get base(): number { return this.height - BOTTOM; }
  get step(): number { return (W - LEFT - RIGHT - 20) / Math.max(1, this.labels.length - 1); }
  x(i: number): number { return this.labels.length === 1 ? (W + LEFT - RIGHT) / 2 : LEFT + 10 + i * this.step; }
  y(v: number): number { return this.base - Math.max(0, Math.min(v, this.max)) / this.max * (this.base - TOP); }
  showLabel(i: number): boolean {
    const every = this.labelEvery || Math.ceil(this.labels.length / 10);
    return i % every === 0 || i === this.labels.length - 1 && (this.labels.length - 1) % every > every / 2;
  }
  private pts(s: Series): [number, number][] {
    return s.values.map((v, i) => [v, i] as const).filter((p): p is [number, number] => p[0] !== null).map(([v, i]) => [this.x(i), this.y(v)]);
  }
  linePath(s: Series): string { return this.pts(s).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '); }
  areaPath(s: Series): string {
    const p = this.pts(s);
    return p.length ? `${this.linePath(s)} L${p[p.length - 1][0].toFixed(1)},${this.base} L${p[0][0].toFixed(1)},${this.base} Z` : '';
  }
  labelAt(s: Series, i: number): boolean {
    if (s.dashed || this.valuesShown === 'none') return false;
    const vals = s.values.map(v => v ?? -Infinity);
    const last = s.values.length - 1 - [...s.values].reverse().findIndex(v => v !== null);
    const max = vals.indexOf(Math.max(...vals));
    if (this.valuesShown === 'last') return i === last;
    if (this.valuesShown === 'max') return i === max;
    return i === last || i === max;
  }
  get tipLines(): string[] { return this.tooltip && this.hover >= 0 ? this.tooltip(this.hover) : []; }
  get tipW(): number { return Math.max(...this.tipLines.map(textWidth)) + 20; }
  get tipX(): number { return Math.min(W - RIGHT - this.tipW, Math.max(LEFT, this.x(this.hover) - this.tipW / 2)); }
}

// ── Anillo (circular) ────────────────────────────────

@Component({
  selector: 'rp-donut',
  standalone: true,
  imports: [CommonModule],
  template: `
  <svg viewBox="0 0 200 200" width="100%" [attr.font-family]="font" role="img" [attr.aria-label]="aria">
    <circle cx="100" cy="100" r="74" fill="none" [attr.stroke]="C.grid" stroke-width="30"/>
    <path *ngFor="let a of arcs" [attr.d]="a.d" fill="none" [attr.stroke]="a.color" stroke-width="30"><title>{{ a.label }}</title></path>
    <text x="100" y="98" font-size="22" font-weight="700" [attr.fill]="C.navy" text-anchor="middle">{{ center }}</text>
    <text x="100" y="118" font-size="11" [attr.fill]="C.text" text-anchor="middle">{{ sub }}</text>
  </svg>`,
})
export class DonutComponent implements OnChanges {
  @Input() slices: Slice[] = [];
  @Input() center = '';
  @Input() sub = '';
  @Input() aria = 'Gráfico circular';
  readonly C = COLORS; readonly font = FONT;
  arcs: { d: string; color: string; label: string }[] = [];

  constructor(public el: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const total = this.slices.reduce((s, x) => s + Math.max(0, x.value), 0);
    let start = -Math.PI / 2;
    const gap = this.slices.filter(s => s.value > 0).length > 1 ? 0.025 : 0;
    this.arcs = this.slices.filter(s => s.value > 0 && total).map(s => {
      const angle = s.value / total * Math.PI * 2;
      const a0 = start + gap / 2, a1 = start + Math.max(angle - gap / 2, gap / 2 + 0.001);
      start += angle;
      const r = 74, p = (a: number) => `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
      const d = angle >= Math.PI * 2 - 0.0001 ? `M${p(0)} A${r},${r} 0 1 1 ${p(Math.PI)} A${r},${r} 0 1 1 ${p(0)}` : `M${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
      return { d, color: s.color, label: s.label };
    });
  }
}

// ── Minigráfico ──────────────────────────────────────

@Component({
  selector: 'rp-spark',
  standalone: true,
  imports: [CommonModule],
  template: `
  <svg viewBox="0 0 120 34" width="100%" height="34" preserveAspectRatio="none" aria-hidden="true">
    <path [attr.d]="path" fill="none" [attr.stroke]="color" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle *ngIf="last" [attr.cx]="last[0]" [attr.cy]="last[1]" r="3" [attr.fill]="color"/>
  </svg>`,
})
export class SparkComponent implements OnChanges {
  @Input() values: number[] = [];
  @Input() color = COLORS.blue;
  path = '';
  last: [number, number] | null = null;

  ngOnChanges(): void {
    const v = this.values.filter(x => isFinite(x));
    if (v.length < 2) { this.path = ''; this.last = null; return; }
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const pts = v.map((x, i) => [4 + i * 112 / (v.length - 1), 30 - (x - min) / span * 26] as [number, number]);
    this.path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    this.last = pts[pts.length - 1];
  }
}

export const CHARTS = [BarsComponent, LinesComponent, DonutComponent, SparkComponent] as const;
