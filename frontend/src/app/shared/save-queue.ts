import { toast } from './toast/toast.service';
import { serverMessage } from './toast/notify.interceptor';

/**
 * Fila de escrituras al servidor: los cambios se ven de inmediato en pantalla y se
 * guardan uno tras otro, en el orden en que se hicieron. Si uno falla se avisa y se
 * llama a `onError` (normalmente, recargar los datos reales del servidor).
 */
export class SaveQueue {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly what: string, private readonly onError?: () => void) {}

  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(job);
    this.chain = next.catch(e => {
      console.error(`No se pudo guardar ${this.what}`, e);
      if (e?.status !== 401) toast.error(`No se pudo guardar ${this.what}`, serverMessage(e));
      this.onError?.();
    });
    return next;
  }

  /** Espera a que terminen las escrituras pendientes. */
  idle(): Promise<void> {
    return this.chain.then(() => undefined);
  }
}

/** El servidor envía null en los campos vacíos; los modelos los esperan ausentes (undefined). */
export function dropNulls<T>(o: T): T {
  return Object.fromEntries(Object.entries(o as object).filter(([, v]) => v !== null)) as T;
}
