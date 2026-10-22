// Documentos soporte de los comprobantes: se guardan en la base de datos (asiento_soportes).

/** Archivo listo para enviar al servidor (contenido en base64). */
export interface UploadFile { name: string; type: string; size: number; data: string; }

/** Archivo ya guardado en un comprobante. */
export interface SupportFile { id: string; name: string; type: string; size: number; at: string; by: string; }

export const SUPPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const SUPPORT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export const SUPPORT_MAX_MB = 5;

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Lee el archivo elegido en un <input type="file">. Rechaza tipos y tamaños no permitidos. */
export function readSupport(ev: Event): Promise<UploadFile | null> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';   // permite volver a elegir el mismo archivo
  if (!file) return Promise.resolve(null);
  if (!SUPPORT_TYPES.includes(file.type)) return Promise.reject(new Error(`«${file.name}» no es PDF, JPG, PNG ni WEBP.`));
  if (file.size > SUPPORT_MAX_MB * 1024 * 1024) return Promise.reject(new Error(`«${file.name}» pesa ${fileSize(file.size)}; el máximo es ${SUPPORT_MAX_MB} MB.`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data: String(reader.result).split(',')[1] ?? '' });
    reader.onerror = () => reject(new Error(`No se pudo leer «${file.name}».`));
    reader.readAsDataURL(file);
  });
}
