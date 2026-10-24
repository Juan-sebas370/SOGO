import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Account } from '../accounting.model';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MAX = 60;

/**
 * Buscador de cuentas del PUC para las partidas: con números filtra las cuentas cuyo código
 * empieza así (5135 → 513505, 513510…); con letras busca en el nombre. Flechas + Enter para elegir.
 * La lista va en posición fija porque la tabla de partidas tiene scroll horizontal y la recortaría.
 */
@Component({
  selector: 'app-account-picker',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AccountPickerComponent), multi: true }],
  template: `
  <div class="ap" [class.ap--invalid]="invalid" [class.ap--open]="open">
    <input #box class="ap-input" type="text" autocomplete="off" spellcheck="false"
           [value]="open ? query : label" [placeholder]="placeholder" [disabled]="disabled"
           [attr.aria-label]="ariaLabel" role="combobox" aria-autocomplete="list" [attr.aria-expanded]="open"
           (focus)="openList()" (click)="openList()" (input)="onInput(box.value)" (keydown)="onKey($event)" (blur)="onBlur()">
    <button type="button" class="ap-clear" *ngIf="value && !open && !disabled" (mousedown)="$event.preventDefault()" (click)="pick(null)" aria-label="Quitar cuenta">×</button>
  </div>
  <ul class="ap-list" *ngIf="open" role="listbox" [style.top.px]="pos.top" [style.left.px]="pos.left" [style.width.px]="pos.width"
      [style.max-height.px]="pos.maxHeight" (mousedown)="$event.preventDefault()">
    <li *ngFor="let a of results; let i = index" role="option" [attr.aria-selected]="a.code === value"
        [class.ap-active]="i === active" [class.ap-selected]="a.code === value" (mouseenter)="active = i" (click)="pick(a)">
      <span class="ap-code" [innerHTML]="mark(a.code, true)"></span>
      <span class="ap-name" [innerHTML]="mark(a.name, false)"></span>
      <span class="ap-cls">{{ a.cls }}</span>
    </li>
    <li class="ap-empty" *ngIf="!results.length">Ninguna cuenta {{ digits ? 'empieza por' : 'contiene' }} «{{ query }}»</li>
    <li class="ap-more" *ngIf="total > results.length">{{ total - results.length }} más · sigue escribiendo para afinar</li>
  </ul>
  `,
  styles: [`
    :host { display: block; position: relative; }
    .ap { position: relative; }
    /* Mismas medidas que los demás campos de la página (page-kit.css: .rsv-input) */
    .ap-input {
      box-sizing: border-box; width: 100%; height: 40px; margin: 0; padding: 0 28px 0 12px;
      border: 1px solid #D5DEEA; border-radius: 8px; background: #fff;
      font-family: 'Poppins', sans-serif; font-size: 13.5px; color: #1F2937;
      outline: none; text-overflow: ellipsis; transition: border-color .15s, box-shadow .15s;
    }
    .ap-input::placeholder { color: #9CA3AF; }
    .ap-input:disabled { background: #F6F8FB; color: #6B7280; }
    .ap--invalid .ap-input { border-color: #DC2626; background: #FFF8F8; }
    .ap--open .ap-input { border-color: #0B6FD0; box-shadow: 0 0 0 3px rgba(11, 111, 208, .12); }
    .ap-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; border: none; border-radius: 50%; background: transparent; color: #9CA3AF; font-size: 16px; line-height: 1; cursor: pointer; }
    .ap-clear:hover { background: #F3F4F6; color: #374151; }

    .ap-list { position: fixed; z-index: 1000; margin: 4px 0 0; padding: 4px; list-style: none; overflow-y: auto; background: #fff; border: 1px solid #D5DEEA; border-radius: 10px; box-shadow: 0 12px 28px rgba(10, 37, 64, .16); }
    .ap-list li { display: flex; align-items: baseline; gap: 10px; padding: 7px 10px; border-radius: 7px; font-size: 13px; color: #1F2937; cursor: pointer; }
    .ap-list li.ap-active { background: #EEF5FD; }
    .ap-list li.ap-selected .ap-code { color: #0B6FD0; }
    .ap-code { flex-shrink: 0; min-width: 64px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0A2540; }
    .ap-name { flex: 1; min-width: 0; }
    .ap-cls { flex-shrink: 0; font-size: 11px; color: #9CA3AF; }
    .ap-list ::ng-deep mark { background: #FDF0C4; color: inherit; border-radius: 2px; padding: 0 1px; }
    .ap-list li.ap-empty, .ap-list li.ap-more { cursor: default; font-size: 12px; color: #6B7280; }
    .ap-list li.ap-more { justify-content: center; }
  `],
})
export class AccountPickerComponent implements ControlValueAccessor, OnDestroy {
  @Input() accounts: Account[] = [];
  @Input() invalid = false;
  @Input() placeholder = 'Escribe código o nombre…';
  @Input() ariaLabel = 'Cuenta';
  @ViewChild('box', { static: true }) box!: ElementRef<HTMLInputElement>;

  value = '';
  query = '';
  open = false;
  active = 0;
  disabled = false;
  results: Account[] = [];
  total = 0;
  pos = { top: 0, left: 0, width: 360, maxHeight: 320 };

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly reposition = () => this.open && this.place();

  constructor(private host: ElementRef<HTMLElement>) {
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  get label(): string {
    const a = this.accounts.find(x => x.code === this.value);
    return a ? `${a.code} · ${a.name}` : this.value;
  }

  get digits(): boolean { return /^\d+$/.test(this.query.trim()); }

  // ── ControlValueAccessor ──
  writeValue(v: string | null): void { this.value = v ?? ''; }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  // ── Búsqueda ──
  openList(): void {
    if (this.open || this.disabled) return;
    this.query = '';
    this.open = true;
    this.filter();
    this.place();
    // Al abrir se marca la cuenta elegida para seguir desde ahí con las flechas
    const i = this.results.findIndex(a => a.code === this.value);
    this.active = i >= 0 ? i : 0;
    setTimeout(() => this.scrollActive());
  }

  onInput(text: string): void {
    this.query = text;
    if (!this.open) { this.open = true; this.place(); }
    this.filter();
    this.active = 0;
  }

  private filter(): void {
    const q = this.query.trim();
    let list: Account[];
    if (!q) list = this.accounts;
    else if (/^\d+$/.test(q)) list = this.accounts.filter(a => a.code.startsWith(q));
    else {
      // Varias palabras: todas deben aparecer en el código o el nombre ("gasto aseo")
      const words = norm(q).split(/\s+/);
      list = this.accounts.filter(a => { const t = norm(`${a.code} ${a.name}`); return words.every(w => t.includes(w)); });
    }
    this.total = list.length;
    this.results = list.slice(0, MAX);
  }

  pick(a: Account | null): void {
    this.value = a?.code ?? '';
    this.onChange(this.value);
    this.onTouched();
    this.close();
    if (!a) setTimeout(() => this.box.nativeElement.focus());
  }

  onKey(e: KeyboardEvent): void {
    if (!this.open && (e.key === 'ArrowDown' || e.key === 'Enter')) { this.openList(); e.preventDefault(); return; }
    if (!this.open) return;
    if (e.key === 'ArrowDown') { this.active = Math.min(this.active + 1, this.results.length - 1); this.scrollActive(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this.active = Math.max(this.active - 1, 0); this.scrollActive(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (this.results[this.active]) this.pick(this.results[this.active]); e.preventDefault(); }
    else if (e.key === 'Escape') { this.close(); e.preventDefault(); }
    else if (e.key === 'Tab' && this.query.trim() && this.results.length === 1) this.pick(this.results[0]);
  }

  onBlur(): void {
    // Si lo escrito es exactamente un código válido, se toma; si no, se conserva la cuenta anterior
    const exact = this.accounts.find(a => a.code === this.query.trim());
    if (this.open && exact) this.pick(exact);
    else this.close();
    this.onTouched();
  }

  private close(): void { this.open = false; this.query = ''; }

  @HostListener('document:mousedown', ['$event'])
  outside(e: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  private place(): void {
    const r = this.box.nativeElement.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const maxHeight = Math.min(320, Math.max(below, above));
    const width = Math.max(r.width, 380);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    const top = below >= 200 || below >= above ? r.bottom : r.top - maxHeight - 8;
    this.pos = { top, left: Math.max(8, left), width, maxHeight };
  }

  private scrollActive(): void {
    const el = this.host.nativeElement.querySelectorAll('.ap-list li')[this.active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }

  /** Resalta lo buscado: el prefijo en el código, o las palabras en el nombre. */
  mark(text: string, isCode: boolean): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const q = this.query.trim();
    if (!q) return esc(text);
    if (this.digits) return isCode && text.startsWith(q) ? `<mark>${esc(q)}</mark>${esc(text.slice(q.length))}` : esc(text);
    const n = norm(text);
    const ranges: [number, number][] = [];
    norm(q).split(/\s+/).filter(Boolean).forEach(w => { const i = n.indexOf(w); if (i >= 0) ranges.push([i, i + w.length]); });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '', at = 0;
    for (const [s, e] of ranges) { if (s < at) continue; out += esc(text.slice(at, s)) + `<mark>${esc(text.slice(s, e))}</mark>`; at = e; }
    return out + esc(text.slice(at));
  }
}
