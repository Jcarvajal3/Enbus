-- Migration: Fase 4 - Audit Fixes
-- Fecha: 2026-07-03
-- Descripción: Correcciones de robustez identificadas en auditoría de la Fase 4 (Comisiones y Liquidación).

-- ============================================================
-- FIX 1: Restricción UNIQUE en comisiones_ciclo
-- ============================================================
-- Problema: Race condition (TOCTOU) al generar ciclos concurrentemente.
-- Si dos procesos verificaban overlap en paralelo, ambos podían pasar
-- el check y luego insertar registros duplicados para el mismo período.
-- Solución: Restricción UNIQUE en la DB como última línea de defensa atómica.
-- El constraint cubre el inicio y fin como un rango compuesto por cooperativa:
-- No puede haber dos ciclos para la misma cooperativa con idéntico período.
-- Nota: El overlap check en código ya previene solapamientos parciales;
-- este UNIQUE previene duplicados exactos en caso de race condition.
ALTER TABLE public.comisiones_ciclo
  ADD CONSTRAINT uq_comisiones_ciclo_cooperativa_periodo
  UNIQUE (cooperativa_id, periodo_inicio, periodo_fin);

-- ============================================================
-- FIX 2: Índice compuesto para mejorar rendimiento de la consulta de overlap
-- ============================================================
-- La consulta de overlap usa: cooperativa_id + periodo_fin + periodo_inicio
-- El índice compuesto mejora significativamente la búsqueda de solapamientos
-- cuando hay muchos ciclos por cooperativa.
CREATE INDEX IF NOT EXISTS idx_comisiones_ciclo_overlap
  ON public.comisiones_ciclo (cooperativa_id, periodo_inicio, periodo_fin);
