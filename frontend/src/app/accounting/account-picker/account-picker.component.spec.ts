import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccountPickerComponent } from './account-picker.component';
import { Account } from '../accounting.model';

const ACCOUNTS: Account[] = [
  { code: '110505', name: 'Caja general', cls: 'Activo' },
  { code: '111005', name: 'Bancos nacionales', cls: 'Activo' },
  { code: '513505', name: 'Aseo y vigilancia', cls: 'Gasto' },
  { code: '513525', name: 'Acueducto y alcantarillado', cls: 'Gasto' },
  { code: '513530', name: 'Energía eléctrica', cls: 'Gasto' },
  { code: '414005', name: 'Alojamiento', cls: 'Ingreso' },
];

describe('Contabilidad · buscador de cuentas (componente)', () => {
  let fixture: ComponentFixture<AccountPickerComponent>;
  let c: AccountPickerComponent;
  let changed: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AccountPickerComponent] });
    fixture = TestBed.createComponent(AccountPickerComponent);
    c = fixture.componentInstance;
    c.accounts = ACCOUNTS;
    changed = [];
    c.registerOnChange(v => changed.push(v));
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('con números muestra solo las cuentas que empiezan por esos dígitos', () => {
    c.onInput('5135');
    expect(c.results.map(a => a.code)).toEqual(['513505', '513525', '513530']);
    c.onInput('51352');
    expect(c.results.map(a => a.code)).toEqual(['513525']);
  });

  it('con letras busca en el nombre sin importar tildes ni mayúsculas', () => {
    c.onInput('ENERGIA');
    expect(c.results.map(a => a.code)).toEqual(['513530']);
  });

  it('varias palabras deben aparecer todas', () => {
    c.onInput('acueducto alcan');
    expect(c.results.map(a => a.code)).toEqual(['513525']);
    c.onInput('acueducto caja');
    expect(c.results).toEqual([]);
  });

  it('Enter elige la cuenta resaltada y avisa al formulario', () => {
    c.onInput('5135');
    c.onKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    c.onKey(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(changed).toEqual(['513525']);
    expect(c.open).toBeFalse();
  });

  it('al salir del campo con un código exacto lo selecciona', () => {
    c.openList();
    c.onInput('414005');
    c.onBlur();
    expect(changed).toEqual(['414005']);
  });

  it('muestra "código · nombre" de la cuenta elegida', () => {
    c.writeValue('110505');
    expect(c.label).toBe('110505 · Caja general');
  });

  it('resalta lo buscado sin permitir inyectar HTML', () => {
    c.onInput('513');
    expect(c.mark('513505', true)).toBe('<mark>513</mark>505');
    c.onInput('caja');
    expect(c.mark('<b>Caja</b>', false)).not.toContain('<b>');
  });

  it('el campo usa la misma altura que los demás campos (40 px)', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(getComputedStyle(input).height).toBe('40px');
  });
});
