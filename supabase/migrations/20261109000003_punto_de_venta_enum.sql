-- Punto de venta (tarjeta de débito en la taquilla) como forma de pago presencial.
-- Va sola: un valor nuevo de un enum no se puede usar en la misma transacción que lo crea, y
-- 20261109000008_punto_de_venta.sql lo usa (columna, restricciones y RPC).
-- Re-ejecutable.
ALTER TYPE public.tipo_metodo_pago ADD VALUE IF NOT EXISTS 'PUNTO_DE_VENTA';
