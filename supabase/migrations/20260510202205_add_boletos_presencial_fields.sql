ALTER TABLE boletos ALTER COLUMN comprador_id DROP NOT NULL;
ALTER TABLE boletos ADD COLUMN pasajero_nombre TEXT;
ALTER TABLE boletos ADD COLUMN pasajero_cedula TEXT;
ALTER TABLE boletos ADD COLUMN pasajero_telefono TEXT;
