/**
 * PasajerosForm – quién viaja en cada asiento apartado (#25, M-15).
 *
 * Una tarjeta por asiento ("Asiento 14") con nombre y apellido, cédula y
 * teléfono opcional. La primera se prellena con el perfil y lleva el chip
 * "Soy yo". La cédula se escribe con `CedulaField` (letra + número, #57). Valida con las mismas reglas que el servidor (`validation.ts`) y
 * entrega los datos ya normalizados ("V-12345678", "0414-1234567") a
 * `onSubmit`, que llama a `fn_asignar_pasajeros`.
 *
 *   const form = useRef<PasajerosFormHandle>(null);
 *   <PasajerosForm
 *     ref={form}
 *     asientos={['14', '15']}
 *     perfil={perfil}
 *     inicial={guardados}
 *     asientosConError={['15']}
 *     guardando={checkout.enCurso}
 *     onSubmit={guardarPasajeros}
 *   />
 *   <FloatingBar><Button onPress={() => form.current?.enviar()}>Continuar</Button></FloatingBar>
 *
 * El formulario no dibuja su botón: la acción del paso va en la `FloatingBar`
 * de la pantalla o en el pie de la hoja (§2.1 regla 6), y llama a `enviar()`.
 *
 * Los asientos que el servidor rechazó (`EB_DATOS_PASAJERO`, `detail.asientos`)
 * llegan en `asientosConError` y su tarjeta se marca hasta que se corrija.
 */

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { UserCircle, WarningCircle } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Card, Chip, Field, Text } from '@/src/components/ui';
import { CedulaField } from '@/src/components/CedulaField';
import {
  MENSAJE_CEDULA,
  MENSAJE_TELEFONO,
  cedulaParaGuardar,
  cedulaValida,
  nombreValido,
  normalizarCedula,
  sanitizeText,
  telefonoParaGuardar,
  telefonoValido,
} from '@/src/utils/validation';
import { ordenarAsientos } from '@/src/hooks/useCheckoutBoletos';
import type { PasajeroAsiento, PerfilUsuario } from '@/src/types';
import { Colors, Radius, Sizes, Spacing } from '@/src/theme';

interface DatosTarjeta {
  nombre: string;
  cedula: string;
  telefono: string;
}

type ErroresTarjeta = Partial<Record<keyof DatosTarjeta, string>>;

export interface PasajerosFormProps {
  /** Asientos apartados de la compra */
  asientos: string[];
  /** Perfil del comprador: prellena la tarjeta "Soy yo" */
  perfil: PerfilUsuario | null;
  /** El perfil aún se está cargando: las tarjetas esperan para prellenarse */
  perfilCargando?: boolean;
  /**
   * Datos que ya se conocen por asiento (lo último que se guardó o lo que
   * devuelve el servidor). Una tarjeta que no es "Soy yo" ignora los datos del
   * comprador: el servidor los copia en todos los asientos al apartarlos.
   */
  inicial?: PasajeroAsiento[];
  /** Asientos que el servidor marcó con datos inválidos o incompletos */
  asientosConError?: string[];
  /** Mensaje general del último error (el `hint` del servidor) */
  mensajeError?: string | null;
  /** Se está guardando (`fn_asignar_pasajeros` en curso) */
  guardando: boolean;
  onSubmit: (pasajeros: PasajeroAsiento[]) => void | Promise<void>;
  /** `enviar()` valida y llama a `onSubmit` (lo usa el botón de la pantalla) */
  ref?: Ref<PasajerosFormHandle>;
}

export interface PasajerosFormHandle {
  enviar(): void;
}

const AYUDA_CEDULA = 'Un menor sin cédula usa la de su representante.';

/** V y E, más P para quien viaja con pasaporte (antes se podía escribir a mano). */
const LETRAS_PASAJERO: ('V' | 'E' | 'P')[] = ['V', 'E', 'P'];

/** La forma que emite `CedulaField` ("V-12345678"), o '' si no es válida. */
const cedulaDelCampo = (v: string | null | undefined) => cedulaParaGuardar(v) ?? '';

const vacia = (): DatosTarjeta => ({ nombre: '', cedula: '', telefono: '' });

/** Referencia estable: un `[]` nuevo en cada render reiniciaría `marcados` sin fin. */
const SIN_ERRORES: string[] = [];

function datosDelPerfil(perfil: PerfilUsuario | null): DatosTarjeta {
  return {
    nombre: nombreValido(perfil?.nombre_completo) ? (perfil?.nombre_completo ?? '') : '',
    cedula: cedulaDelCampo(perfil?.cedula_rif),
    telefono: telefonoValido(perfil?.telefono ?? '') ? (perfil?.telefono ?? '') : '',
  };
}

const mismaCedula = (a: string | null | undefined, b: string | null | undefined) => {
  const na = normalizarCedula(a);
  return !!na && na === normalizarCedula(b);
};

const mismoNombre = (a: string | null | undefined, b: string | null | undefined) =>
  sanitizeText(a ?? '').toLowerCase() === sanitizeText(b ?? '').toLowerCase();

function validarTarjeta(d: DatosTarjeta): ErroresTarjeta {
  const e: ErroresTarjeta = {};
  if (!nombreValido(d.nombre)) e.nombre = 'Escribe el nombre y apellido de quien viaja.';
  if (!cedulaValida(d.cedula)) e.cedula = MENSAJE_CEDULA;
  if (d.telefono.trim() && !telefonoValido(d.telefono)) e.telefono = MENSAJE_TELEFONO;
  return e;
}

export function PasajerosForm({
  asientos,
  perfil,
  perfilCargando = false,
  inicial,
  asientosConError = SIN_ERRORES,
  mensajeError,
  guardando,
  onSubmit,
  ref,
}: PasajerosFormProps) {
  const lista = useMemo(() => ordenarAsientos(asientos), [asientos]);
  const perfilTieneDatos = !!perfil && (nombreValido(perfil.nombre_completo) || cedulaValida(perfil.cedula_rif ?? ''));

  /** Asiento de la tarjeta "Soy yo" (`null` si el comprador no viaja o no hay perfil). */
  const [soyYo, setSoyYo] = useState<string | null>(null);
  const [datos, setDatos] = useState<Record<string, DatosTarjeta>>({});
  const [errores, setErrores] = useState<Record<string, ErroresTarjeta>>({});
  /** Asientos marcados por el servidor que el usuario aún no tocó */
  const [marcados, setMarcados] = useState<string[]>(asientosConError);

  useEffect(() => {
    setMarcados(asientosConError);
  }, [asientosConError]);

  // ── Prellenado: una vez por asiento (no pisa lo que la persona escribe) ──
  const prellenadosRef = useRef(new Set<string>());
  const soyYoDecididoRef = useRef(false);
  useEffect(() => {
    // Sin el perfil no se sabe qué datos son del comprador: se espera.
    if (perfilCargando) return;
    const porAsiento = new Map((inicial ?? []).map((p) => [p.asiento, p]));
    const delPerfil = datosDelPerfil(perfil);

    // "Soy yo": el asiento donde ya se guardaron los datos del comprador (al
    // volver desde el pago puede no ser el primero); si no hay ninguno, la
    // primera tarjeta, salvo que ya se guardó otra persona en ella.
    let elegido = soyYo;
    if (!soyYoDecididoRef.current && lista.length > 0) {
      soyYoDecididoRef.current = true;
      const delComprador = lista.find((asiento) => {
        const g = porAsiento.get(asiento);
        return (
          !!g &&
          mismaCedula(g.cedula, perfil?.cedula_rif) &&
          mismoNombre(g.nombre, perfil?.nombre_completo)
        );
      });
      const primero = lista[0];
      const guardado = porAsiento.get(primero);
      const otraPersona =
        !!guardado && cedulaValida(guardado.cedula) && !mismaCedula(guardado.cedula, perfil?.cedula_rif);
      elegido = !perfilTieneDatos ? null : (delComprador ?? (otraPersona ? null : primero));
      setSoyYo(elegido);
    }

    setDatos((prev) => {
      let cambio = false;
      const next = { ...prev };
      for (const asiento of lista) {
        if (prellenadosRef.current.has(asiento)) continue;
        prellenadosRef.current.add(asiento);
        const actual = prev[asiento];
        // Lo que la persona ya escribió nunca se pisa.
        if (actual && (actual.nombre || actual.cedula || actual.telefono)) continue;
        cambio = true;
        const guardado = porAsiento.get(asiento);
        if (asiento === elegido) {
          // "Soy yo" solo se elige si lo guardado es del comprador (o no hay nada).
          next[asiento] = delPerfil;
        } else if (guardado && cedulaValida(guardado.cedula) && !mismaCedula(guardado.cedula, perfil?.cedula_rif)) {
          next[asiento] = {
            nombre: guardado.nombre,
            cedula: cedulaDelCampo(guardado.cedula),
            telefono: guardado.telefono ?? '',
          };
        } else if (
          guardado &&
          cedulaValida(guardado.cedula) &&
          mismaCedula(guardado.cedula, perfil?.cedula_rif) &&
          !mismoNombre(guardado.nombre, perfil?.nombre_completo)
        ) {
          // Un menor con la cédula del representante: se respeta lo guardado.
          next[asiento] = {
            nombre: guardado.nombre,
            cedula: cedulaDelCampo(guardado.cedula),
            telefono: guardado.telefono ?? '',
          };
        } else {
          next[asiento] = vacia();
        }
      }
      return cambio ? next : prev;
    });
    // `soyYo` solo se lee la primera vez (ver soyYoDecididoRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, perfil, perfilCargando, inicial, perfilTieneDatos]);

  // ── Foco encadenado: nombre → cédula → teléfono → siguiente tarjeta ──────
  const refs = useRef(new Map<string, TextInput | null>());
  const enfocar = (clave: string) => refs.current.get(clave)?.focus();
  const registrar = (clave: string) => (el: TextInput | null) => {
    refs.current.set(clave, el);
  };

  const actualizar = (asiento: string, campo: keyof DatosTarjeta, valor: string) => {
    setDatos((prev) => ({ ...prev, [asiento]: { ...(prev[asiento] ?? vacia()), [campo]: valor } }));
    setErrores((prev) =>
      prev[asiento]?.[campo] ? { ...prev, [asiento]: { ...prev[asiento], [campo]: undefined } } : prev
    );
    setMarcados((prev) => (prev.includes(asiento) ? prev.filter((a) => a !== asiento) : prev));
  };

  /** Toca "Soy yo": esa tarjeta pasa a ser la del comprador; la anterior se vacía si seguía igual. */
  const elegirSoyYo = (asiento: string) => {
    if (guardando || !perfil) return;
    const delPerfil = datosDelPerfil(perfil);
    setDatos((prev) => {
      const next = { ...prev };
      if (soyYo && soyYo !== asiento) {
        const anterior = prev[soyYo];
        if (anterior && mismaCedula(anterior.cedula, perfil.cedula_rif)) next[soyYo] = vacia();
      }
      if (soyYo === asiento) {
        // Quitar "Soy yo": la tarjeta queda vacía para otra persona.
        next[asiento] = vacia();
      } else {
        next[asiento] = delPerfil;
      }
      return next;
    });
    setErrores((prev) => ({ ...prev, [asiento]: {} }));
    setSoyYo((actual) => (actual === asiento ? null : asiento));
  };

  /** Anti doble toque: `guardando` llega en el siguiente render; la ref no. */
  const enviandoRef = useRef(false);

  const handleSubmit = async () => {
    if (guardando || enviandoRef.current) return;
    const nuevos: Record<string, ErroresTarjeta> = {};
    let primeroConError: string | null = null;
    for (const asiento of lista) {
      const e = validarTarjeta(datos[asiento] ?? vacia());
      if (Object.keys(e).length > 0) {
        nuevos[asiento] = e;
        primeroConError = primeroConError ?? asiento;
      }
    }
    setErrores(nuevos);
    if (primeroConError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const e = nuevos[primeroConError];
      enfocar(`${primeroConError}:${e.nombre ? 'nombre' : e.cedula ? 'cedula' : 'telefono'}`);
      return;
    }

    const pasajeros: PasajeroAsiento[] = lista.map((asiento) => {
      const d = datos[asiento] ?? vacia();
      return {
        asiento,
        nombre: sanitizeText(d.nombre),
        cedula: cedulaParaGuardar(d.cedula) ?? d.cedula.trim(),
        telefono: d.telefono.trim() ? (telefonoParaGuardar(d.telefono) ?? d.telefono.trim()) : null,
      };
    });
    enviandoRef.current = true;
    try {
      await onSubmit(pasajeros);
    } finally {
      enviandoRef.current = false;
    }
  };

  const enviarRef = useRef(handleSubmit);
  enviarRef.current = handleSubmit;
  useImperativeHandle(ref, () => ({ enviar: () => void enviarRef.current() }), []);

  return (
    <View>
      {mensajeError ? (
        <View style={s.errorGeneral} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <WarningCircle size={Sizes.icon.lg} color={Colors.dangerText} weight="fill" />
          <Text variant="secondary" color="dangerText" style={s.flex}>
            {mensajeError}
          </Text>
        </View>
      ) : null}

      {lista.map((asiento, index) => {
        const d = datos[asiento] ?? vacia();
        const e = errores[asiento] ?? {};
        const marcado = marcados.includes(asiento);
        const siguiente = lista[index + 1];
        const esYo = soyYo === asiento;

        return (
          <Card
            key={asiento}
            tone="sunken"
            padding="md"
            style={[s.tarjeta, marcado ? s.tarjetaError : null]}
          >
            <View style={s.cabecera}>
              <View style={s.titulo}>
                <UserCircle size={Sizes.icon.lg} color={Colors.mutedForeground} weight="bold" />
                <Text variant="subheading">{`Asiento ${asiento}`}</Text>
              </View>
              {perfilTieneDatos ? (
                <Chip
                  label="Soy yo"
                  sobre="surface"
                  selected={esYo}
                  onPress={() => elegirSoyYo(asiento)}
                  accessibilityLabel={`Asiento ${asiento}, Soy yo`}
                />
              ) : null}
            </View>

            {marcado ? (
              <Text variant="caption" color="dangerText" style={s.marcado}>
                Revisa el nombre y la cédula de este pasajero.
              </Text>
            ) : null}

            <Field
              ref={registrar(`${asiento}:nombre`)}
              label="Nombre y apellido"
              value={d.nombre}
              onChangeText={(v) => actualizar(asiento, 'nombre', v)}
              error={e.nombre}
              tone="light"
              autoCapitalize="words"
              autoComplete={esYo ? 'name' : 'off'}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => enfocar(`${asiento}:cedula`)}
              editable={!guardando}
            />

            <CedulaField
              ref={registrar(`${asiento}:cedula`)}
              label="Cédula"
              value={d.cedula}
              onChangeText={(v) => actualizar(asiento, 'cedula', v)}
              error={e.cedula}
              helper={index === 0 ? AYUDA_CEDULA : undefined}
              tone="light"
              letras={LETRAS_PASAJERO}
              returnKeyType="next"
              onSubmitEditing={() => enfocar(`${asiento}:telefono`)}
              editable={!guardando}
            />

            <Field
              ref={registrar(`${asiento}:telefono`)}
              label="Teléfono (opcional)"
              placeholder="Ej. 0414-1234567"
              value={d.telefono}
              onChangeText={(v) => actualizar(asiento, 'telefono', v)}
              error={e.telefono}
              tone="light"
              keyboardType="phone-pad"
              autoComplete={esYo ? 'tel' : 'off'}
              returnKeyType={siguiente ? 'next' : 'done'}
              submitBehavior={siguiente ? 'submit' : undefined}
              onSubmitEditing={() => (siguiente ? enfocar(`${siguiente}:nombre`) : void handleSubmit())}
              editable={!guardando}
              containerStyle={s.ultimoCampo}
            />
          </Card>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  errorGeneral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.destructiveLight,
    marginBottom: Spacing.lg,
  },
  flex: {
    flex: 1,
  },
  tarjeta: {
    marginBottom: Spacing.lg,
    borderWidth: Sizes.borderSelected,
    borderColor: Colors.transparent,
  },
  tarjetaError: {
    borderColor: Colors.dangerText,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  titulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  marcado: {
    marginBottom: Spacing.md,
  },
  ultimoCampo: {
    marginBottom: 0,
  },
});
