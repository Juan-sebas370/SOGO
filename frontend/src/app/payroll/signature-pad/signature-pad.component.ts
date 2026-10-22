import { AfterViewInit, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';

/**
 * Recuadro de firma: el empleado firma con el dedo (celular o tableta) o con el mouse.
 * `value()` entrega la firma como imagen PNG (data URL) para guardarla con el pago.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  template: `
    <div class="sg-box">
      <canvas #canvas width="560" height="180" aria-label="Recuadro para firmar"
        (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="end()" (pointerleave)="end()"></canvas>
      <span class="sg-line">Firme aquí</span>
    </div>
    <button type="button" class="sg-clear" (click)="clear()" [disabled]="empty">Borrar firma</button>
  `,
  styles: [`
    .sg-box { position: relative; border: 1px dashed #94A3B8; border-radius: 10px; background: #fff; }
    canvas { display: block; width: 100%; height: 180px; touch-action: none; cursor: crosshair; }
    .sg-line { position: absolute; left: 16px; right: 16px; bottom: 34px; border-top: 1px solid #CBD5E1; padding-top: 2px;
      font-size: 11px; color: #94A3B8; pointer-events: none; }
    .sg-clear { margin-top: 6px; border: none; background: none; padding: 0; color: #0B6FD0; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .sg-clear:disabled { color: #94A3B8; cursor: default; }
  `],
})
export class SignaturePadComponent implements AfterViewInit {
  @ViewChild('canvas') private canvas!: ElementRef<HTMLCanvasElement>;
  @Output() changed = new EventEmitter<boolean>();   // true = hay firma
  empty = true;
  private drawing = false;
  private strokes = 0;
  private ctx!: CanvasRenderingContext2D;

  ngAfterViewInit(): void {
    this.ctx = this.canvas.nativeElement.getContext('2d')!;
    this.ctx.lineWidth = 2.4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#0A2540';
  }

  private point(e: PointerEvent): [number, number] {
    const c = this.canvas.nativeElement, r = c.getBoundingClientRect();
    return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height];
  }

  start(e: PointerEvent): void {
    this.drawing = true;
    this.canvas.nativeElement.setPointerCapture?.(e.pointerId);
    const [x, y] = this.point(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  move(e: PointerEvent): void {
    if (!this.drawing) return;
    const [x, y] = this.point(e);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.strokes++;
  }

  end(): void {
    if (!this.drawing) return;
    this.drawing = false;
    // Un toque suelto no cuenta como firma
    if (this.empty && this.strokes > 8) { this.empty = false; this.changed.emit(true); }
  }

  clear(): void {
    const c = this.canvas.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.empty = true;
    this.strokes = 0;
    this.changed.emit(false);
  }

  /** Firma como PNG, o '' si está vacía. */
  value(): string {
    return this.empty ? '' : this.canvas.nativeElement.toDataURL('image/png');
  }
}
