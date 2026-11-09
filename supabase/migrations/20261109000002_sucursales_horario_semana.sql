-- Sucursales · Horario de atención por día de la semana.
--   1. sucursales.horario_semana (jsonb, opcional): la estructura que edita el panel
--      (Configuración > Sucursales). Forma:
--        {"v": 1, "dias": {"lun": [{"abre": "07:00", "cierra": "18:00"}], ..., "dom": []}}
--      Día sin turnos = cerrado; hasta dos turnos por día (horario partido); horas "HH:MM" en
--      24 h; "cierra" puede ser "24:00" (medianoche) o menor que "abre" (cierra al día siguiente).
--      El CHECK solo valida la forma; el orden de los turnos lo valida el panel
--      (PanelCooperativas/src/lib/horario.ts).
--   2. sucursales.horario (text) se sigue llenando: el panel guarda ahí el texto que genera a
--      partir de horario_semana ("Lun a vie 7:00 a. m. – 6:00 p. m. · Dom cerrado"). La app lo
--      muestra tal cual, así que las versiones publicadas no cambian. Las sucursales antiguas
--      conservan su texto libre con horario_semana en NULL hasta que las editen.
--   3. fn_sucursales_en_ciudad NO cambia: la app solo necesita el texto (horario). Devolver
--      horario_semana obligaría a DROP FUNCTION (cambia el tipo de retorno) y no lo usa nadie.
--      Las sucursales se crean y editan por la tabla (RLS "Admin crea/actualiza sucursales"),
--      no por RPC: la columna nueva queda cubierta por los GRANT de la tabla.
-- Re-ejecutable.
BEGIN;

ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS horario_semana jsonb;
COMMENT ON COLUMN public.sucursales.horario_semana IS
  'Horario de atención por día para el editor del panel: {"v":1,"dias":{"lun":[{"abre":"07:00","cierra":"18:00"}],…,"dom":[]}}. '
  'Día sin turnos = cerrado; máximo dos turnos. NULL en sucursales con horario en texto libre. '
  'La app no lo lee: muestra sucursales.horario, que el panel genera a partir de esta columna.';
COMMENT ON COLUMN public.sucursales.horario IS
  'Horario de atención como lo muestra la app, p. ej. "Lun a vie 7:00 a. m. – 6:00 p. m. · Dom cerrado". '
  'Si hay horario_semana, el panel lo genera a partir de ella; si no, es texto libre antiguo.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sucursales_horario_semana') THEN
    ALTER TABLE public.sucursales ADD CONSTRAINT chk_sucursales_horario_semana CHECK (
      horario_semana IS NULL OR (
        jsonb_typeof(horario_semana) = 'object'
        AND horario_semana -> 'v' = '1'::jsonb
        AND jsonb_typeof(horario_semana -> 'dias') = 'object'
        AND (horario_semana -> 'dias') ?& ARRAY['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
        AND octet_length(horario_semana::text) <= 2048
        -- Cada día es una lista de 0 a 2 turnos (strict: no desenvuelve listas; silent: un error
        -- de estructura da NULL y lo rechazan las condiciones de arriba).
        AND NOT jsonb_path_exists(horario_semana,
              'strict $.dias.* ? (@.type() != "array" || @.size() > 2)', '{}', true)
        -- Cada turno es {"abre": "HH:MM", "cierra": "HH:MM" | "24:00"} (lax: si falta una clave
        -- queda una secuencia vacía, like_regex da falso y el turno se rechaza).
        AND NOT jsonb_path_exists(horario_semana,
              'lax $.dias.*[*] ? (@.type() != "object"
                                  || @.abre.type() != "string" || @.cierra.type() != "string"
                                  || !(@.abre like_regex "^([01][0-9]|2[0-3]):[0-5][0-9]$")
                                  || !(@.cierra like_regex "^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$"))')
      )
    );
  END IF;
END $$;

-- Para los textos generados (hasta ~420 caracteres con siete días distintos y dos turnos).
-- No había CHECK de largo en horario; se pone uno holgado contra textos desmedidos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sucursales_horario_largo') THEN
    ALTER TABLE public.sucursales ADD CONSTRAINT chk_sucursales_horario_largo
      CHECK (horario IS NULL OR char_length(horario) <= 500);
  END IF;
END $$;

COMMIT;
