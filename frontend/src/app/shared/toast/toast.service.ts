import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id:       number;
  kind:     ToastKind;
  title:    string;
  detail?:  string;
  at:       number;
  duration: number;
}

const DURATION: Record<ToastKind, number> = { success: 4500, error: 7000, info: 5000 };
/** Dos avisos del mismo tipo casi al tiempo son la misma acción (p. ej. el registro de auditoría y la respuesta del servidor). */
const SAME_ACTION_MS = 1800;
const MAX_VISIBLE = 4;

/**
 * Notificaciones de toda la aplicación (esquina superior derecha): "Reserva creada", "No se pudo
 * guardar…". Es un objeto único para poder usarlo también fuera de Angular (filas de guardado,
 * interceptor). Lo muestra <app-toasts>, que está en el componente raíz.
 */
class ToastCenter {
  readonly items$ = new BehaviorSubject<Toast[]>([]);
  private seq = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(title: string, detail?: string): void { this.push('success', title, detail); }
  error(title: string, detail?: string): void { this.push('error', title, detail); }
  info(title: string, detail?: string): void { this.push('info', title, detail); }

  private push(kind: ToastKind, title: string, detail?: string): void {
    const now = Date.now();
    let list = this.items$.value;
    // La misma acción avisada dos veces: se deja el primer aviso
    if (list.some(t => t.kind === kind && now - t.at < SAME_ACTION_MS)) return;
    // Si lo que se acaba de mostrar como exitoso falló en el servidor, se quita ese aviso
    if (kind === 'error') list.filter(t => t.kind === 'success' && now - t.at < 4000).forEach(t => this.clearTimer(t.id));
    if (kind === 'error') list = list.filter(t => !(t.kind === 'success' && now - t.at < 4000));
    const toast: Toast = { id: ++this.seq, kind, title: clip(title, 90), detail: detail ? clip(detail, 180) : undefined, at: now, duration: DURATION[kind] };
    const next = [toast, ...list];
    next.slice(MAX_VISIBLE).forEach(t => this.clearTimer(t.id));
    this.items$.next(next.slice(0, MAX_VISIBLE));
    this.schedule(toast.id, toast.duration);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.items$.next(this.items$.value.filter(t => t.id !== id));
  }

  /** Al pasar el mouse por encima el aviso no se cierra; al salir, se cierra en 2,5 s. */
  hold(id: number): void { this.clearTimer(id); }
  release(id: number): void { if (this.items$.value.some(t => t.id === id)) this.schedule(id, 2500); }

  private schedule(id: number, ms: number): void {
    this.clearTimer(id);
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
  }

  private clearTimer(id: number): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }
}

const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

export const toast = new ToastCenter();
