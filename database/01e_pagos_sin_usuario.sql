-- =====================================================================
-- Pagos desde la web sin usuario.
-- La página no tiene login de clientes y nunca llena pagos.usuario_id,
-- pero la columna quedó NOT NULL de una versión anterior del código:
-- MySQL rechazaba TODOS los pagos de Wompi ("Column 'usuario_id' cannot
-- be null"). La entidad Pago de la web ya la declara opcional; aquí se
-- ajusta la tabla para que coincida. La llave foránea a usuarios se
-- conserva (SOGO sí llenará usuario_id con quien registra el pago).
-- =====================================================================
USE hotel_sebastian;

ALTER TABLE pagos MODIFY usuario_id BIGINT NULL;

-- Verificación: IS_NULLABLE debe decir YES
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'hotel_sebastian' AND table_name = 'pagos' AND column_name = 'usuario_id';
