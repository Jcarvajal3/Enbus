-- Un asiento ocupado por viaje. Aborta (a propósito) si hay asientos vendidos dos veces.
-- Consulta previa (solo lectura):
--   SELECT viaje_id, asiento, array_agg(codigo_boleto || ':' || estado ORDER BY created_at)
--     FROM boletos WHERE estado IN ('RESERVADO','PAGADO','USADO') GROUP BY 1, 2 HAVING count(*) > 1;
BEGIN;

-- 1. Formato canónico "1".."N" (app). El panel guardaba fila+columna: "3B" = (3-1)*4 + 2 = 10.
UPDATE public.boletos
   SET asiento = (((substring(asiento FROM '^([0-9]+)')::int - 1) * 4)
                  + position(substring(asiento FROM '([A-D])$') IN 'ABCD'))::text
 WHERE asiento ~ '^[0-9]+[A-D]$';

-- 2. Liberar reservas duplicadas. Se conserva USADO > PAGADO > RESERVADO con pago > el más antiguo.
WITH ranking AS (
  SELECT b.id,
         row_number() OVER (PARTITION BY b.viaje_id, b.asiento
                            ORDER BY CASE b.estado WHEN 'USADO' THEN 0 WHEN 'PAGADO' THEN 1 ELSE 2 END,
                                     (b.pago_id IS NULL), b.created_at) AS rn
    FROM public.boletos b
   WHERE b.estado IN ('RESERVADO', 'PAGADO', 'USADO')
)
UPDATE public.boletos b
   SET estado = 'EXPIRADO',
       motivo_cancelacion = coalesce(b.motivo_cancelacion,
         'Asiento duplicado: reserva liberada al crear el índice único de asientos.')
  FROM ranking r
 WHERE r.id = b.id AND r.rn > 1 AND b.estado = 'RESERVADO';

-- 3. Si quedan asientos vendidos dos veces, detenerse.
DO $$
DECLARE v_lista text;
BEGIN
  SELECT string_agg(format('viaje %s asiento %s (%s boletos)', d.viaje_id, d.asiento, d.n), '; ')
    INTO v_lista
    FROM (SELECT viaje_id, asiento, count(*) AS n FROM public.boletos
           WHERE estado IN ('RESERVADO', 'PAGADO', 'USADO')
           GROUP BY viaje_id, asiento HAVING count(*) > 1) d;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Asientos vendidos dos veces: %. Cancela uno de cada par (con reembolso) y vuelve a ejecutar esta migración.', v_lista;
  END IF;
END $$;

-- 4. Índice único parcial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_boletos_asiento_ocupado
  ON public.boletos (viaje_id, asiento) WHERE estado IN ('RESERVADO', 'PAGADO', 'USADO');

-- 5. Solo números de asiento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_boletos_asiento_numerico') THEN
    ALTER TABLE public.boletos ADD CONSTRAINT chk_boletos_asiento_numerico
      CHECK (asiento ~ '^[1-9][0-9]*$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.boletos WHERE asiento !~ '^[1-9][0-9]*$') THEN
    ALTER TABLE public.boletos VALIDATE CONSTRAINT chk_boletos_asiento_numerico;
  ELSE
    RAISE NOTICE 'chk_boletos_asiento_numerico queda NOT VALID: hay asientos con formato antiguo.';
  END IF;
END $$;

-- 6. Recalcular asientos_disponibles (corrige derivas históricas del contador).
UPDATE public.viajes v
   SET asientos_disponibles = c.disponibles
  FROM (SELECT v2.id,
               GREATEST(v2.asientos_totales - (SELECT count(*) FROM public.boletos b
                                                WHERE b.viaje_id = v2.id
                                                  AND b.estado IN ('RESERVADO', 'PAGADO', 'USADO')), 0) AS disponibles
          FROM public.viajes v2) c
 WHERE c.id = v.id AND v.asientos_disponibles <> c.disponibles;

COMMIT;
