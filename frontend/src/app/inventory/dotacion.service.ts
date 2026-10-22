import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { DotacionItem } from './dotacion.model';
import { API_URL } from '../api';

/** Dotación de la casa (tablas `dotacion` y `dotacion_cantidades`). */
@Injectable({ providedIn: 'root' })
export class DotacionService {

  private readonly base = `${API_URL}/dotacion`;
  private items$ = new BehaviorSubject<DotacionItem[]>([]);
  private loading?: Promise<void>;

  constructor(private http: HttpClient) {}

  /** Carga una vez por sesión (las pantallas la piden al abrirse). */
  ready(): Promise<void> {
    return this.loading ??= this.reload();
  }

  reload(): Promise<void> {
    return this.loading = firstValueFrom(this.http.get<DotacionItem[]>(this.base))
      .then(list => this.items$.next(list.map(clean)))
      .catch(e => console.error('No se pudo cargar la dotación', e));
  }

  getAll(): Observable<DotacionItem[]> { return this.items$.asObservable(); }
  getSnapshot(): DotacionItem[] { return this.items$.value; }
  getById(id: number): DotacionItem | undefined { return this.items$.value.find(i => i.id === id); }

  /** Solo el administrador (el servidor lo verifica). Devuelve el artículo guardado. */
  async save(item: DotacionItem): Promise<DotacionItem> {
    const saved = clean(await firstValueFrom(this.http.put<DotacionItem>(`${this.base}/${item.id}`, item)));
    this.items$.next(this.items$.value.map(i => i.id === saved.id ? saved : i));
    return saved;
  }

  async create(item: Omit<DotacionItem, 'id'>): Promise<DotacionItem> {
    const saved = clean(await firstValueFrom(this.http.post<DotacionItem>(this.base, item)));
    this.items$.next([...this.items$.value, saved]);
    return saved;
  }

  async retire(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/${id}`));
    this.items$.next(this.items$.value.filter(i => i.id !== id));
  }
}

function clean(i: DotacionItem): DotacionItem {
  return { ...i, floors: i.floors.map(f => ({ floor: f.floor, quantity: f.quantity, ...(f.annualUse != null ? { annualUse: f.annualUse } : {}) })) };
}
