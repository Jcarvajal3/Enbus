-- Carga de buses de "Transporte Barinas C.A" (una sola vez; se puede repetir sin duplicar).
--   Fuente: "Listado de unidades activas ruta larga 2026" (foto del listado impreso).
--   Todas las unidades tienen 31 asientos. Se carga el chofer encargado; el socio y el modelo
--   del carro no se guardan.
--   Como los guarda el panel (Buses → guardarBus): placa en mayúsculas sin separadores y
--   teléfono "0424-1234567".
--   Unidades 26 y 29: el listado trae dos teléfonos con el primero cortado en la foto; se
--   guarda el que se lee completo. La 29 tiene dos choferes y quedan los dos en el nombre.
--   Si la cooperativa no existe, no inserta nada y avisa.
BEGIN;

DO $$
DECLARE
  v_coop uuid;
  v_n    integer := 0;
  r      record;
BEGIN
  SELECT id INTO v_coop
    FROM public.cooperativas
   WHERE lower(btrim(nombre)) = lower('Transporte Barinas C.A')
   LIMIT 1;

  IF v_coop IS NULL THEN
    RAISE EXCEPTION 'No existe la cooperativa "Transporte Barinas C.A": no se cargó ningún bus.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('3',   '60331AL', 'Juan José Toro Paredes',         '0424-7491325'),
      ('6',   '6065A7M', 'Joandry Lacruz',                 '0412-4271573'),
      ('8',   '6065A3M', 'Edgar Santiago',                 '0424-7007530'),
      ('14',  '6021A9U', 'Otoniel Ruiz',                   '0414-7490015'),
      ('19',  '6034A1L', 'José Rafael Sulbarán',           '0412-2745708'),
      ('26',  '6035A3L', 'Jesús Andrés Sánchez',           '0424-7231806'),
      ('29',  '6035A2L', 'Carlos Pérez / Arnoldo Parra',   '0424-7462491'),
      ('30',  '6033A6J', 'Wuilney Johan Ramírez Varela',   '0424-7701663'),
      ('35',  '6033A0L', 'José Victorino Arismendi',       '0414-7354931'),
      ('41',  '6005A2T', 'Juan Carlos Rivas',              '0424-7338724'),
      ('42',  '6030A1L', 'Rolando Rondón',                 '0424-7220879'),
      ('45',  '6000A4P', 'Luis Zambrano',                  '0414-7471595'),
      ('145', '6033A2J', 'Ángel Rondón',                   '0424-7231523'),
      ('48',  '6001A1P', 'Alquimedes Albarrán',            '0412-1068543'),
      ('53',  '6005A5T', 'Denis Albarrán',                 '0424-7774858'),
      ('57',  '6032A9L', 'Alí Velázquez',                  '0412-4885102'),
      ('157', '6022A0U', 'Ramón Contreras',                '0416-5724350'),
      ('55',  '6114A5R', 'Jonni Bastidas',                 '0414-3937723'),
      ('60',  '6345A4P', 'Douglas Santiago',               '0412-0763860'),
      ('51',  '6030A0L', 'Domingo González',               '0414-7575103')
    ) AS t(numero_unidad, placa, chofer_nombre, chofer_telefono)
  LOOP
    -- Idempotente: si la cooperativa ya tiene esa unidad o esa placa, no se vuelve a crear.
    IF NOT EXISTS (
      SELECT 1 FROM public.buses b
       WHERE b.cooperativa_id = v_coop
         AND (upper(regexp_replace(b.numero_unidad, '[^[:alnum:]]', '', 'g'))
                = upper(regexp_replace(r.numero_unidad, '[^[:alnum:]]', '', 'g'))
              OR b.placa = r.placa)
    ) THEN
      INSERT INTO public.buses (cooperativa_id, numero_unidad, placa, asientos, chofer_nombre, chofer_telefono, activo)
      VALUES (v_coop, r.numero_unidad, r.placa, 31, r.chofer_nombre, r.chofer_telefono, true);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Buses nuevos para Transporte Barinas C.A: %', v_n;
END $$;

-- Comprobación: las 20 unidades, activas y con 31 asientos.
SELECT b.numero_unidad, b.placa, b.asientos, b.chofer_nombre, b.chofer_telefono, b.activo
  FROM public.buses b
  JOIN public.cooperativas c ON c.id = b.cooperativa_id
 WHERE lower(btrim(c.nombre)) = lower('Transporte Barinas C.A')
 ORDER BY length(b.numero_unidad), b.numero_unidad;

COMMIT;
