-- =====================================================================
-- Verificación de la contabilidad (SOLO LECTURA: no cambia nada)
-- Ejecutar completo y revisar cada resultado.
-- =====================================================================
USE hotel_sebastian;

-- 1. Comprobantes por tipo y estado
SELECT tipo, estado, COUNT(*) AS comprobantes, MIN(numero) AS primero, MAX(numero) AS ultimo
FROM asientos GROUP BY tipo, estado ORDER BY tipo, estado;

-- 2. Cada comprobante debe cuadrar (débitos = créditos). Debe salir VACÍO.
SELECT a.numero, a.concepto, SUM(l.debito) AS debitos, SUM(l.credito) AS creditos
FROM asientos a JOIN asiento_lineas l ON l.asiento_id = a.id
GROUP BY a.id HAVING ROUND(SUM(l.debito)) <> ROUND(SUM(l.credito));

-- 3. Líneas con cuentas que no existen en el plan de cuentas. Debe salir VACÍO.
SELECT a.numero, l.cuenta_codigo FROM asiento_lineas l JOIN asientos a ON a.id = l.asiento_id
LEFT JOIN cuentas_puc c ON c.codigo = l.cuenta_codigo WHERE c.codigo IS NULL;

-- 4. Líneas sin centro de costo (deberían ser 0 después del script 21)
SELECT COUNT(*) AS lineas_sin_centro FROM asiento_lineas WHERE centro_costo IS NULL;

-- 5. Comprobantes sin líneas. Debe salir VACÍO.
SELECT a.numero, a.concepto FROM asientos a LEFT JOIN asiento_lineas l ON l.asiento_id = a.id WHERE l.id IS NULL;

-- 6. Números repetidos. Debe salir VACÍO.
SELECT numero, COUNT(*) FROM asientos GROUP BY numero HAVING COUNT(*) > 1;

-- 7. Detalle del comprobante de la imagen (causación de la nómina de octubre)
SELECT a.numero, a.fecha, a.estado, l.cuenta_codigo, c.nombre, l.centro_costo, l.debito, l.credito
FROM asientos a JOIN asiento_lineas l ON l.asiento_id = a.id LEFT JOIN cuentas_puc c ON c.codigo = l.cuenta_codigo
WHERE a.concepto LIKE 'Causación nómina octubre%' ORDER BY l.id;
