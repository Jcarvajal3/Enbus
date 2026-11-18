import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { useToast } from '@/src/components/Toast';

/** Mínimo entre revisiones al volver a primer plano: no gastar datos por cada vuelta. */
const INTERVALO_REVISION_MS = 30 * 60 * 1000;

/** El aviso se queda un buen rato: puede salir mientras el usuario está en otra cosa. */
const DURACION_AVISO_MS = 15_000;

/** Updates solo existe en builds de release: en Expo Go y desarrollo no hace nada. */
const OTA_ACTIVO = Updates.isEnabled && !__DEV__;

/**
 * Actualizaciones OTA (EAS Update). Con la config por defecto la actualización
 * se baja al abrir y se aplicaría en el SIGUIENTE arranque en frío; quien deja
 * la app días en segundo plano nunca la vería. Este hook:
 *  - revisa al volver a primer plano (máx. cada 30 min);
 *  - avisa UNA vez por actualización descargada, con "Actualizar".
 * Nunca recarga solo: el usuario puede estar pagando o eligiendo asientos.
 * Debe vivir dentro del `ToastProvider`.
 */
export function useActualizacionesOTA() {
  const toast = useToast();
  // Con Updates apagado (dev) `useUpdates` igual es seguro de llamar.
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();

  const ultimaRevisionRef = useRef(Date.now()); // el arranque ya revisó (ON_LOAD)
  const revisandoRef = useRef(false);
  const avisadaRef = useRef<string | null>(null);

  // Si el arranque fue de emergencia (bundle embebido tras un fallo), queda en el log.
  useEffect(() => {
    if (OTA_ACTIVO && Updates.isEmergencyLaunch) {
      console.warn('[OTA] Arranque de emergencia:', Updates.emergencyLaunchReason);
    }
  }, []);

  // Revisión al volver a primer plano.
  useEffect(() => {
    if (!OTA_ACTIVO) return;
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active' || revisandoRef.current) return;
      if (Date.now() - ultimaRevisionRef.current < INTERVALO_REVISION_MS) return;
      revisandoRef.current = true;
      ultimaRevisionRef.current = Date.now();
      void (async () => {
        try {
          const { isAvailable } = await Updates.checkForUpdateAsync();
          // `useUpdates` refleja la descarga y dispara el aviso de abajo.
          if (isAvailable) await Updates.fetchUpdateAsync();
        } catch (e) {
          // Sin conexión es lo normal: se reintenta en la próxima vuelta.
          console.log('[OTA] Revisión fallida:', e);
        } finally {
          revisandoRef.current = false;
        }
      })();
    });
    return () => sub.remove();
  }, []);

  // Aviso único por actualización descargada (también cubre la del arranque).
  const idPendiente = isUpdatePending ? (downloadedUpdate?.updateId ?? 'pendiente') : null;
  useEffect(() => {
    if (!OTA_ACTIVO || !idPendiente || avisadaRef.current === idPendiente) return;
    avisadaRef.current = idPendiente;
    toast.show('info', 'Hay una nueva versión de EnBus.', {
      duracionMs: DURACION_AVISO_MS,
      accion: {
        label: 'Actualizar',
        onPress: () => {
          Updates.reloadAsync().catch((e) => console.log('[OTA] No se pudo recargar:', e));
        },
      },
    });
  }, [idPendiente, toast]);
}
