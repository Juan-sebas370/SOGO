import { Component, ElementRef, HostListener, Input, ViewChild, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;               // texto secundario: código ISO, departamento…
  keywords?: string;           // texto extra que también encuentra la opción
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Lista con búsqueda: se escribe y se filtra al instante (sin tildes ni mayúsculas, también por
 * código). Flechas para moverse, Enter para elegir, Esc para cerrar. Se usa con [(ngModel)] como
 * un <select>: el valor es el `value` de la opción. Con `allowFree` acepta un texto que no está en
 * la lista (p. ej. una ciudad del exterior).
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelectComponent), multi: true }],
  template: `
  <div class="ss" [class.open]="open" [class.invalid]="invalid" [class.disabled]="disabled">
    <input #box type="text" class="ss-input" [id]="inputId" [value]="text" [placeholder]="placeholder" [disabled]="disabled"
           role="combobox" aria-autocomplete="list" [attr.aria-expanded]="open" [attr.aria-controls]="inputId + '-list'"
           [attr.aria-activedescendant]="open && shown[active] ? inputId + '-opt-' + active : null"
           autocomplete="off" spellcheck="false" maxlength="80"
           (focus)="onFocus()" (input)="onInput(box.value)" (keydown)="onKey($event)" (blur)="onBlur()">
    <button type="button" class="ss-clear" *ngIf="value && !disabled" (mousedown)="$event.preventDefault()" (click)="clear()" aria-label="Borrar">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <svg class="ss-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>

    <ul class="ss-list" *ngIf="open" role="listbox" [id]="inputId + '-list'" #list>
      <li *ngFor="let o of shown; let i = index" role="option" [id]="inputId + '-opt-' + i"
          [class.active]="i === active" [class.selected]="o.value === value" [attr.aria-selected]="o.value === value"
          (mousedown)="$event.preventDefault()" (click)="pick(o)" (mouseenter)="active = i">
        <span class="ss-label">{{ o.label }}</span><span class="ss-hint" *ngIf="o.hint">{{ o.hint }}</span>
      </li>
      <li class="ss-free" *ngIf="allowFree && query.trim() && !exact" role="option"
          [class.active]="active === shown.length" (mousedown)="$event.preventDefault()" (click)="pickFree()" (mouseenter)="active = shown.length">
        Usar «{{ query.trim() }}»
      </li>
      <li class="ss-empty" *ngIf="!shown.length && !(allowFree && query.trim())">Sin resultados para «{{ query }}»</li>
    </ul>
  </div>
  `,
  styles: [`
    :host { display: block; position: relative; }
    .ss { position: relative; }
    .ss-input {
      width: 100%; height: 40px; padding: 0 56px 0 12px; box-sizing: border-box;
      border: 1px solid #D5DEEA; border-radius: 8px; background: #fff;
      font-family: 'Poppins', sans-serif; font-size: 13.5px; color: #1F2937; outline: none;
      text-overflow: ellipsis; transition: border-color .15s, box-shadow .15s;
    }
    .ss-input::placeholder { color: #9CA3AF; }
    .ss-input:focus { border-color: #0B6FD0; box-shadow: 0 0 0 3px rgba(11,111,208,.12); }
    .ss-input:disabled { background: #F3F4F6; color: #6B7280; cursor: not-allowed; }
    .ss.invalid .ss-input { border-color: #F87171; background: #FFFBFB; }
    .ss-chevron { position: absolute; right: 12px; top: 50%; width: 16px; height: 16px; margin-top: -8px;
      stroke: #6B7280; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; transition: transform .15s; }
    .ss.open .ss-chevron { transform: rotate(180deg); }
    .ss-clear { position: absolute; right: 32px; top: 50%; width: 22px; height: 22px; margin-top: -11px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
    .ss-clear:hover { background: #F3F4F6; }
    .ss-clear svg { width: 13px; height: 13px; stroke: #9CA3AF; fill: none; stroke-width: 2.4; stroke-linecap: round; }
    .ss-list {
      position: absolute; z-index: 50; left: 0; right: 0; top: calc(100% + 4px);
      max-height: 248px; overflow-y: auto; margin: 0; padding: 4px; list-style: none;
      background: #fff; border: 1px solid #D5DEEA; border-radius: 10px; box-shadow: 0 12px 32px rgba(10,37,64,.14);
    }
    .ss-list li {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 8px 10px; border-radius: 7px; font-size: 13px; color: #1F2937; cursor: pointer;
    }
    .ss-list li.active { background: #EEF5FD; }
    .ss-list li.selected .ss-label { font-weight: 600; color: #0B6FD0; }
    .ss-label { min-width: 0; overflow-wrap: anywhere; }
    .ss-hint { flex: none; font-size: 11px; color: #9CA3AF; font-family: ui-monospace, Consolas, monospace; }
    .ss-free { color: #0B6FD0 !important; font-weight: 500; }
    .ss-empty { color: #9CA3AF !important; cursor: default !important; font-style: italic; }
  `],
})
export class SearchSelectComponent implements ControlValueAccessor {
  @Input() options: SearchOption[] = [];
  @Input() placeholder = 'Escribe para buscar…';
  @Input() inputId = `ss-${Math.random().toString(36).slice(2, 9)}`;
  @Input() invalid = false;
  @Input() allowFree = false;
  /** Opciones que salen primero cuando el campo está vacío (p. ej. los países más frecuentes). */
  @Input() pinned: string[] = [];

  @ViewChild('box') box?: ElementRef<HTMLInputElement>;
  @ViewChild('list') list?: ElementRef<HTMLUListElement>;

  value = '';
  query = '';
  open = false;
  active = 0;
  disabled = false;
  shown: SearchOption[] = [];

  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** Lo que muestra la caja: la búsqueda mientras se escribe, si no la opción elegida. */
  get text(): string { return this.open ? this.query : this.labelOf(this.value); }
  get exact(): boolean { return this.shown.some(o => norm(o.label) === norm(this.query)); }

  writeValue(v: string | null): void { this.value = v ?? ''; }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  onFocus(): void {
    // Se ve lo elegido, seleccionado: escribir lo reemplaza y Tab lo conserva
    this.query = this.labelOf(this.value);
    this.open = true;
    this.filter();
    // La opción elegida queda resaltada para seguir con flechas desde ahí
    const i = this.shown.findIndex(o => o.value === this.value);
    this.active = i >= 0 ? i : 0;
    this.scrollToActive();
    setTimeout(() => this.box?.nativeElement.select());
  }

  onInput(q: string): void {
    this.query = q;
    this.open = true;
    this.filter();
    this.active = 0;
    this.scrollToActive();
  }

  onKey(e: KeyboardEvent): void {
    const last = this.shown.length - (this.allowFree && this.query.trim() && !this.exact ? 0 : 1);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!this.open) this.onFocus(); else this.active = Math.min(this.active + 1, last); this.scrollToActive(); break;
      case 'ArrowUp':   e.preventDefault(); this.active = Math.max(this.active - 1, 0); this.scrollToActive(); break;
      case 'Enter':
        if (!this.open) return;
        e.preventDefault();
        if (this.shown[this.active]) this.pick(this.shown[this.active]);
        else if (this.allowFree && this.query.trim()) this.pickFree();
        break;
      case 'Tab':
        // Tab con una búsqueda escrita toma la primera coincidencia: escribir «chi» + Tab = Chile
        if (this.open && this.query.trim() && norm(this.query) !== norm(this.labelOf(this.value)) && this.shown[this.active]) this.pick(this.shown[this.active], false);
        break;
      case 'Escape': if (this.open) { e.preventDefault(); this.open = false; } break;
    }
  }

  onBlur(): void {
    // Texto libre: lo escrito queda guardado al salir; si coincide con una opción, se toma la opción
    if (this.open && this.allowFree && this.query.trim()) {
      const same = this.options.find(o => norm(o.label) === norm(this.query));
      if (same) this.set(same.value); else this.pickFree(false);
    }
    this.open = false;
    this.onTouched();
  }

  pick(o: SearchOption, blur = true): void {
    this.set(o.value);
    this.open = false;
    if (blur) this.box?.nativeElement.blur();
  }

  pickFree(blur = true): void {
    this.set(this.query.trim());
    this.open = false;
    if (blur) this.box?.nativeElement.blur();
  }

  clear(): void {
    this.set('');
    this.query = '';
    this.box?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  close(): void { this.open = false; }

  private set(v: string): void {
    if (v === this.value) return;
    this.value = v;
    this.onChange(v);
  }

  private labelOf(v: string): string {
    return this.options.find(o => o.value === v)?.label ?? v;
  }

  /** Primero lo que empieza por la búsqueda, luego lo que la contiene (por nombre, código o palabra clave). */
  private filter(): void {
    const q = norm(this.query);
    // Sin búsqueda, o con el nombre de lo ya elegido (al entrar al campo): la lista completa
    if (!q || q === norm(this.labelOf(this.value))) {
      const pinned = this.pinned.map(v => this.options.find(o => o.value === v)).filter((o): o is SearchOption => !!o);
      this.shown = [...pinned, ...this.options.filter(o => !this.pinned.includes(o.value))];
      return;
    }
    const starts: SearchOption[] = [], words: SearchOption[] = [], contains: SearchOption[] = [];
    this.options.forEach(o => {
      const label = norm(o.label);
      const extra = norm(`${o.value} ${o.hint ?? ''} ${o.keywords ?? ''}`);
      if (label.startsWith(q) || norm(o.value) === q) starts.push(o);
      else if (label.split(/[\s(-]+/).some(w => w.startsWith(q))) words.push(o);
      else if (label.includes(q) || extra.includes(q)) contains.push(o);
    });
    this.shown = [...starts, ...words, ...contains];
  }

  private scrollToActive(): void {
    setTimeout(() => this.list?.nativeElement.querySelector('li.active')?.scrollIntoView({ block: 'nearest' }));
  }
}
