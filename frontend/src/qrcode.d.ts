// Tipos mínimos de la librería `qrcode` (solo lo que usa billing/qr.ts). No se instala
// @types/qrcode porque arrastra un @types/node más nuevo que el TypeScript del proyecto.
declare module 'qrcode' {
  export interface QRCodeModules { size: number; get(row: number, col: number): number | boolean; }
  export function create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: QRCodeModules };
}
