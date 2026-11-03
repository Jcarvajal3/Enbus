/**
 * useVolver — la ← que nunca queda muerta (AN-01).
 *
 * Abierta por enlace o por una push en frío, una pantalla puede no tener nada
 * debajo: `router.back()` no hace nada ("GO_BACK was not handled") y el usuario
 * queda atrapado. `volver` vuelve atrás si se puede y, si no, va al padre
 * lógico de la pantalla (`dismissTo` lo busca en la pila y, si no está, lo pone
 * en lugar de la actual).
 *
 *   const atras = useVolver('/(tabs)/boletos');
 *   <ScreenHeader variant="compact" onBack={atras} … />
 *
 * Padres (§2.1 regla 4): boleto, compra, viaje → `/(tabs)/boletos`; encomienda
 * enviada → `/(tabs)/encomiendas?vista=enviadas`; recibida →
 * `/(tabs)/encomiendas?vista=para-mi`; perfil, notificaciones, ayuda →
 * `/(tabs)`; `cuenta/*` → `/perfil`; auth → `/login`.
 *
 * Es el único sitio de la app que llama a `router.back()` (regla de lint).
 */
import { useCallback } from 'react';
import { useRouter, type Href, type Router } from 'expo-router';

export function volver(router: Router, padre: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  // Sin pila: `dismissTo` reemplaza la pantalla actual por el padre.
  router.dismissTo(padre);
}

export function useVolver(padre: Href): () => void {
  const router = useRouter();
  return useCallback(() => volver(router, padre), [router, padre]);
}
