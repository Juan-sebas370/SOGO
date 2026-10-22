import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SILENT } from './toast/notify.interceptor';

/** La configuración inicial es automática: no muestra avisos. */
const QUIET = new HttpContext().set(SILENT, true);
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api';
import { UsersService } from '../users/users.service';
import { seedRoles } from '../users/users-seed';

/**
 * Configuración inicial única: completa la descripción de alcance de los roles que aún no la
 * tienen. No crea personas, cuentas ni nóminas: el personal se registra en Usuarios y en
 * Nómina con los datos reales. La marca `importacion_demo` en `configuracion` evita repetirla.
 */
@Injectable({ providedIn: 'root' })
export class DemoImportService {

  private running?: Promise<void>;

  constructor(private http: HttpClient, private users: UsersService) {}

  ensure(): Promise<void> {
    if (localStorage.getItem('sogo_role') !== 'Administrador') return Promise.resolve();
    return this.running ??= this.run().finally(() => this.running = undefined);
  }

  private async run(): Promise<void> {
    const done = await firstValueFrom(this.http.get(`${API_URL}/configuracion/importacion_demo`)).catch(() => true);
    if (done) return;
    try {
      // Alcance de cada rol (texto de la columna "Alcance"), si aún no lo tiene
      for (const seed of seedRoles()) {
        const role = this.users.role(seed.id);
        if (role && !Object.keys(role.scope).length && Object.keys(seed.scope).length) {
          await firstValueFrom(this.http.put(`${API_URL}/roles/${role.id}`, { name: role.name, scope: seed.scope }, { context: QUIET }));
        }
      }
      await firstValueFrom(this.http.put(`${API_URL}/configuracion/importacion_demo`, {
        at: new Date().toISOString(), by: localStorage.getItem('sogo_username'), employees: 0, users: 0, runs: 0,
      }));
      await this.users.reload();
    } catch (e) {
      console.error('No se pudo completar la configuración inicial', e);
    }
  }
}
