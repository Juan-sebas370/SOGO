import { Injectable } from '@angular/core';
import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { toast } from './toast.service';

/**
 * Aviso para cada acción que se guarda en la base de datos. `ok` es el título del aviso de éxito
 * ('' = sin aviso: guardados automáticos o internos); `what` completa el aviso de error:
 * "No se pudo {what}".
 */
/** Guardados automáticos que no deben avisar: `http.put(url, body, { context: new HttpContext().set(SILENT, true) })`. */
export const SILENT = new HttpContextToken<boolean>(() => false);

interface Rule { method: string; url: RegExp; ok: string | ((body: any) => string); what: string; }

const R = (method: string, url: RegExp, ok: Rule['ok'], what: string): Rule => ({ method, url, ok, what });

const RULES: Rule[] = [
  // Sesión y procesos internos: sin aviso de éxito
  R('POST', /\/auth\//, '', 'completar la solicitud'),
  R('POST', /\/usuario-eventos$/, '', 'registrar el evento'),
  R('POST', /\/auditoria$/, '', 'registrar la auditoría'),
  R('PUT', /\/configuracion\/importacion_demo$/, '', 'completar la configuración inicial'),
  R('POST', /\/inventario\/alertas\/recalcular$/, '', 'recalcular las alertas'),
  R('POST', /\/mensajes\/\d+\/leido$/, '', 'marcar el mensaje como leído'),
  R('POST', /\/contabilidad\/eventos\/exportacion$/, '', 'registrar la exportación'),
  R('POST', /\/contabilidad\/integracion$/, b => b?.mode === 'Manual' ? 'Integración contable completada' : '', 'integrar la contabilidad'),
  // Nómina: se guarda sola con cada cambio; los avisos los da cada acción (confirmar, pagar...)
  R('PUT', /\/nominas\/[^/]+$/, '', 'guardar la nómina'),
  R('PUT', /\/parametros-nomina\//, '', 'guardar los parámetros de nómina'),
  R('PUT', /\/configuracion\/nomina_tasas$/, 'Parámetros de nómina guardados', 'guardar los porcentajes de nómina'),

  // Reservas y alojamiento
  R('POST', /\/reservas$/, 'Reserva creada exitosamente', 'crear la reserva'),
  R('POST', /\/reservas\/[^/]+\/pagos$/, 'Pago registrado exitosamente', 'registrar el pago'),
  R('PUT', /\/reservas\/[^/]+$/, b => b?.status === 'Cancelada' ? 'Reserva cancelada'
    : b?.status === 'Finalizada' ? 'Check-out registrado exitosamente' : 'Reserva actualizada exitosamente', 'actualizar la reserva'),
  R('PUT', /\/habitaciones\/[^/]+\/estado$/, 'Estado de la habitación actualizado', 'cambiar el estado de la habitación'),
  R('PUT', /\/habitaciones\/[^/]+$/, 'Habitación actualizada exitosamente', 'guardar la habitación'),
  R('POST', /\/consumos$/, 'Consumo agregado a la cuenta', 'guardar el consumo'),
  R('DELETE', /\/consumos\//, 'Consumo eliminado', 'eliminar el consumo'),
  R('POST', /\/dotacion$/, 'Artículo de dotación registrado', 'registrar el artículo'),
  R('PUT', /\/dotacion\//, 'Dotación actualizada exitosamente', 'guardar la dotación'),
  R('DELETE', /\/dotacion\//, 'Artículo de dotación eliminado', 'eliminar el artículo'),

  // Inventarios
  R('POST', /\/inventario\/categorias$/, 'Categoría creada exitosamente', 'crear la categoría'),
  R('PUT', /\/inventario\/categorias\//, 'Categoría actualizada', 'actualizar la categoría'),
  R('POST', /\/inventario\/proveedores$/, 'Proveedor registrado exitosamente', 'registrar el proveedor'),
  R('POST', /\/inventario\/productos$/, 'Producto registrado exitosamente', 'registrar el producto'),
  R('POST', /\/inventario\/productos\/[^/]+\/solicitar-compra$/, 'Solicitud de compra enviada', 'solicitar la compra'),
  R('PUT', /\/inventario\/productos\//, 'Producto actualizado exitosamente', 'actualizar el producto'),
  R('POST', /\/inventario\/movimientos$/, b => ({ Entrada: 'Entrada registrada exitosamente', Salida: 'Salida registrada exitosamente',
    Ajuste: 'Ajuste de inventario registrado', Inicial: 'Inventario inicial registrado' } as Record<string, string>)[b?.kind] ?? 'Movimiento registrado', 'registrar el movimiento'),
  R('POST', /\/inventario\/alertas\/[^/]+\/atender$/, 'Alerta atendida', 'atender la alerta'),
  R('PUT', /\/configuracion\/inventario_alertas$/, 'Configuración de alertas guardada', 'guardar la configuración de alertas'),

  // Nómina
  R('POST', /\/empleados$/, 'Empleado registrado exitosamente', 'registrar el empleado'),
  R('PUT', /\/empleados\//, 'Datos del empleado guardados', 'guardar los datos del empleado'),

  // Usuarios y configuración
  R('POST', /\/usuarios$/, 'Usuario creado exitosamente', 'crear el usuario'),
  R('POST', /\/usuarios\/[^/]+\/clave$/, 'Contraseña actualizada', 'cambiar la contraseña'),
  R('PUT', /\/usuarios\//, 'Usuario actualizado exitosamente', 'actualizar el usuario'),
  R('POST', /\/roles$/, 'Rol creado exitosamente', 'crear el rol'),
  R('PUT', /\/roles\//, 'Rol actualizado exitosamente', 'actualizar el rol'),
  R('DELETE', /\/roles\//, 'Rol eliminado', 'eliminar el rol'),
  R('PUT', /\/configuracion\/seguridad$/, 'Política de seguridad guardada', 'guardar la política de seguridad'),
  R('PUT', /\/configuracion\/auditoria$/, 'Configuración de auditoría guardada', 'guardar la configuración de auditoría'),

  // Contabilidad
  R('POST', /\/contabilidad\/asientos$/, b => b?.draft ? 'Borrador guardado' : 'Comprobante registrado exitosamente', 'registrar el comprobante'),
  R('POST', /\/contabilidad\/asientos\/[^/]+\/contabilizar$/, 'Comprobante contabilizado', 'contabilizar el comprobante'),
  R('POST', /\/contabilidad\/asientos\/[^/]+\/anular$/, 'Comprobante anulado', 'anular el comprobante'),
  R('PUT', /\/contabilidad\/cuentas$/, 'Cuenta guardada exitosamente', 'guardar la cuenta'),
  R('DELETE', /\/contabilidad\/cuentas\//, 'Cuenta eliminada', 'eliminar la cuenta'),
  R('POST', /\/contabilidad\/asientos\/[^/]+\/soportes$/, 'Soporte guardado', 'guardar el soporte'),
  R('DELETE', /\/contabilidad\/asientos\/[^/]+\/soportes\//, 'Soporte quitado', 'quitar el soporte'),
  R('PUT', /\/contabilidad\/ajustes$/, 'Ajustes contables guardados', 'guardar los ajustes contables'),

  // Facturación y datos del hospedaje
  R('POST', /\/facturacion\/facturas$/, 'Borrador guardado', 'guardar el borrador'),
  R('DELETE', /\/facturacion\/facturas\/[^/]+$/, 'Borrador eliminado', 'eliminar el borrador'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/emitir$/, '', 'emitir la factura'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/respuesta-dian$/, '', 'registrar la respuesta de la DIAN'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/corregir$/, 'Factura corregida: queda pendiente de validación DIAN', 'corregir la factura'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/correo$/, 'Factura enviada por correo', 'enviar la factura por correo'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/(envio|descarga|pago)$/, '', 'registrar la acción en el historial de la factura'),
  R('POST', /\/facturacion\/facturas\/[^/]+\/anular$/, 'Factura anulada con nota crédito', 'anular la factura'),
  R('PUT', /\/facturacion\/config$/, 'Configuración de facturación guardada', 'guardar la configuración de facturación'),
  R('POST', /\/facturacion\/config\/probar$/, '', 'probar la conexión con el proveedor'),
  R('PUT', /\/configuracion\/politica_datos$/, 'Política de datos y respaldos guardada', 'guardar la política de datos y respaldos'),
  R('POST', /\/respaldos$/, 'Respaldo creado', 'crear el respaldo'),
  R('PUT', /\/configuracion\/metas$/, 'Metas guardadas', 'guardar las metas'),
  R('PUT', /\/configuracion\/notificaciones$/, 'Notificaciones guardadas', 'guardar las notificaciones'),
  R('PUT', /\/reportes\/programados$/, 'Programación de reportes guardada', 'guardar la programación de reportes'),
  R('POST', /\/reportes\/filtros$/, 'Filtro guardado', 'guardar el filtro'),
  R('DELETE', /\/reportes\/filtros\//, 'Filtro eliminado', 'eliminar el filtro'),
  R('POST', /\/correo\/alertas\/revisar$/, 'Alertas revisadas', 'revisar las alertas'),
  R('POST', /\/correo\/prueba$/, 'Correo de prueba enviado', 'enviar el correo de prueba'),
  R('PUT', /\/configuracion\/politicas_reserva$/, 'Políticas de reserva guardadas', 'guardar las políticas de reserva'),
  R('PUT', /\/configuracion\/tra$/, 'Configuración de la TRA guardada', 'guardar la configuración de la TRA'),
  R('PUT', /\/tra\/registros\/[^/]+$/, '', 'guardar la TRA'),
  R('PUT', /\/configuracion\/hospedaje$/, 'Datos del hospedaje guardados', 'guardar los datos del hospedaje'),

  // Mensajes de la página web
  R('POST', /\/mensajes\/[^/]+\/responder$/, 'Respuesta registrada exitosamente', 'registrar la respuesta'),
  R('PUT', /\/mensajes\/plantillas$/, 'Respuesta rápida guardada', 'guardar la respuesta rápida'),
  R('DELETE', /\/mensajes\/plantillas\//, 'Respuesta rápida eliminada', 'eliminar la respuesta rápida'),
  R('PUT', /\/mensajes\/[^/]+$/, b => b?.status === 'archivado' ? 'Mensaje archivado' : b?.status ? 'Mensaje reabierto' : 'Prioridad actualizada', 'actualizar el mensaje'),
];

/** Avisa el resultado de lo que se guarda (POST, PUT, DELETE). Las consultas (GET) no avisan. */
@Injectable({ providedIn: 'root' })
export class NotifyInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (req.method === 'GET' || req.context.get(SILENT)) return next.handle(req);
    const path = req.url.split('?')[0];
    const rule = RULES.find(r => r.method === req.method && r.url.test(path));
    return next.handle(req).pipe(tap({
      next: ev => {
        if (!(ev instanceof HttpResponse) || !rule) return;
        const title = typeof rule.ok === 'function' ? rule.ok(req.body) : rule.ok;
        if (title) toast.success(title);
      },
      error: (e: HttpErrorResponse) => {
        // Sesión vencida: el AuthInterceptor lleva al inicio de sesión. El login muestra su propio error.
        if (e.status === 401 || /\/auth\//.test(path)) return;
        const what = rule?.what ?? 'guardar los cambios';
        toast.error(`No se pudo ${what}`, serverMessage(e));
      },
    }));
  }
}

/** Mensaje que explica el error, en español. */
export function serverMessage(e: any): string {
  if (e?.status === 0) return 'No hay conexión con el servidor. Verifica que SOGO esté iniciado.';
  if (e?.status === 403) return e?.error?.message || 'Tu rol no tiene permiso para esta acción.';
  const m = e?.error?.message;
  return typeof m === 'string' && m.trim() ? m : 'Intenta de nuevo. Si el problema sigue, avisa al administrador.';
}
