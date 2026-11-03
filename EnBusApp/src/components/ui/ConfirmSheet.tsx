/**
 * ConfirmSheet — la única confirmación de la app (D3, AN-02). Cero `Alert.alert`
 * (en web no se muestra y la acción no hacía nada).
 *
 * Hoja inferior con título (pregunta), una línea opcional y dos botones:
 * confirmar arriba (verbo + objeto, `danger` o `primary`) y salir debajo
 * (`ghost`). Salir por defecto sigue D12: "Volver" si la acción es
 * "Cancelar …", si no "Cancelar".
 *
 * Imperativo (lo normal):
 *   const confirmar = useConfirm();
 *   if (await confirmar({ titulo: '¿Cerrar sesión?', confirmar: 'Cerrar sesión' })) signOut();
 *
 * Controlado (cuando la acción tarda y la hoja muestra la carga):
 *   <ConfirmSheet visible={abierta} cargando={cancelando} titulo="¿Cancelar esta reserva?"
 *     mensaje="El asiento queda libre para otra persona." confirmar="Cancelar reserva"
 *     onConfirm={cancelar} onClose={() => setAbierta(false)} />
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';
import { Layout, Spacing } from '@/src/theme';

export interface ConfirmOptions {
  /** Pregunta: "¿Cancelar este envío?" */
  titulo: string;
  /** Una línea con la consecuencia */
  mensaje?: string;
  /** Verbo + objeto: "Cancelar envío" */
  confirmar: string;
  /** Por defecto D12: "Volver" si `confirmar` empieza por "Cancelar", si no "Cancelar" */
  salir?: string;
  /** Por defecto 'danger' */
  tono?: 'danger' | 'primary';
}

/** D12: tras una acción "Cancelar …" la salida es "Volver"; si no, "Cancelar". */
function salidaPorDefecto(confirmar: string): string {
  return /^cancelar\b/i.test(confirmar.trim()) ? 'Volver' : 'Cancelar';
}

export function ConfirmSheet({
  visible,
  cargando = false,
  onConfirm,
  onClose,
  titulo,
  mensaje,
  confirmar,
  salir,
  tono = 'danger',
}: ConfirmOptions & {
  visible: boolean;
  cargando?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  // Mientras la acción corre, ni el fondo ni el gesto cierran la hoja.
  const cerrar = useCallback(() => {
    if (!cargando) onClose();
  }, [cargando, onClose]);

  return (
    <BottomSheet
      visible={visible}
      onClose={cerrar}
      footer={
        <View style={s.botones}>
          <Button
            variant={tono === 'danger' ? 'danger' : 'primary'}
            fullWidth
            loading={cargando}
            onPress={onConfirm}
          >
            {confirmar}
          </Button>
          <Button variant="ghost" fullWidth disabled={cargando} onPress={cerrar}>
            {salir ?? salidaPorDefecto(confirmar)}
          </Button>
        </View>
      }
    >
      <View style={s.cuerpo} accessibilityRole="alert">
        <Text variant="heading" accessibilityRole="header">
          {titulo}
        </Text>
        {mensaje ? (
          <Text variant="body" color="muted" style={s.mensaje}>
            {mensaje}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

// ─── Proveedor y hook ────────────────────────────────────────────────────────

type Confirmar = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

interface Pendiente {
  opciones: ConfirmOptions;
  resolver: (ok: boolean) => void;
}

/** Montado una vez en `app/_layout.tsx`, dentro del área segura. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [visible, setVisible] = useState(false);
  const pendienteRef = useRef<Pendiente | null>(null);

  const terminar = useCallback((ok: boolean) => {
    const actual = pendienteRef.current;
    pendienteRef.current = null;
    setVisible(false);
    actual?.resolver(ok);
  }, []);

  const confirmar = useCallback<Confirmar>((opciones) => {
    // Una pregunta nueva sustituye a la anterior, que cuenta como "no".
    pendienteRef.current?.resolver(false);
    return new Promise<boolean>((resolver) => {
      const nueva = { opciones, resolver };
      pendienteRef.current = nueva;
      setPendiente(nueva);
      setVisible(true);
    });
  }, []);

  // Si el proveedor se desmonta con una pregunta abierta, se responde "no".
  useEffect(() => () => pendienteRef.current?.resolver(false), []);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pendiente ? (
        <ConfirmSheet
          {...pendiente.opciones}
          visible={visible}
          onConfirm={() => terminar(true)}
          onClose={() => terminar(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

/** Pregunta con la hoja de confirmación; resuelve `true` si se confirma. */
export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return confirmar;
}

const s = StyleSheet.create({
  cuerpo: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  mensaje: {
    marginTop: Spacing.sm,
  },
  botones: {
    gap: Spacing.sm,
  },
});
