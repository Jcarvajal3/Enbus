-- Catálogo único de estados y ciudades (shared/ve.ts → ESTADOS_VE): claves corregidas.
--   El catálogo antiguo del panel (src/lib/data/venezuela.ts) guardaba tres ciudades con una
--   clave mal escrita, distinta de normalizar_localidad(nombre):
--     Táriba       'tario'      → 'tariba'
--     Yaritagua    'yritagua'   → 'yaritagua'
--     Guasdualito  'guadualito' → 'guasdualito'
--   Ahora toda clave es normalizar_localidad(nombre legible), igual en el panel, la app y la
--   landing. Esta migración pasa los datos guardados con la clave vieja a la nueva en rutas,
--   sucursales y encomiendas (las tres a la vez: las RPC comparan la ciudad de la encomienda
--   con la de su ruta y su sucursal).
--   No toca updated_at de las encomiendas: es una corrección de datos, no un cambio de estado.
-- Re-ejecutable (sin la clave vieja no cambia nada).
BEGIN;

CREATE TEMP TABLE _claves_ciudad (vieja text PRIMARY KEY, nueva text NOT NULL) ON COMMIT DROP;
INSERT INTO _claves_ciudad VALUES
  ('tario', 'tariba'),
  ('yritagua', 'yaritagua'),
  ('guadualito', 'guasdualito');

-- ─── rutas ───────────────────────────────────────────────────────────────────
UPDATE public.rutas r SET ciudad_origen = c.nueva
  FROM _claves_ciudad c WHERE public.normalizar_localidad(r.ciudad_origen) = c.vieja;
UPDATE public.rutas r SET ciudad_destino = c.nueva
  FROM _claves_ciudad c WHERE public.normalizar_localidad(r.ciudad_destino) = c.vieja;

-- ─── sucursales ──────────────────────────────────────────────────────────────
UPDATE public.sucursales s SET ciudad = c.nueva
  FROM _claves_ciudad c WHERE public.normalizar_localidad(s.ciudad) = c.vieja;

-- ─── encomiendas ─────────────────────────────────────────────────────────────
-- Los triggers de protección dejan pasar al rol de la migración; asignar_sucursal_destino
-- solo completa sucursal_destino_id cuando está vacía.
ALTER TABLE public.encomiendas DISABLE TRIGGER set_encomiendas_updated_at;
UPDATE public.encomiendas e SET ciudad_origen = c.nueva
  FROM _claves_ciudad c WHERE public.normalizar_localidad(e.ciudad_origen) = c.vieja;
UPDATE public.encomiendas e SET ciudad_destino = c.nueva
  FROM _claves_ciudad c WHERE public.normalizar_localidad(e.ciudad_destino) = c.vieja;
ALTER TABLE public.encomiendas ENABLE TRIGGER set_encomiendas_updated_at;

COMMIT;
