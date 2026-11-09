/**
 * LogoCooperativa — el logo que la cooperativa sube desde su panel
 * (`cooperativas.logo_url`, bucket público `logos-cooperativas`).
 *
 *   <LogoCooperativa nombre={coop.nombre} logoUrl={coop.logo_url} size="md" />
 *
 * Con `expo-image` y caché en memoria y disco: el panel guarda la URL con `?t=…`,
 * así un logo nuevo es otra URL y nunca se ve el viejo. Sin logo, o si la imagen
 * no carga, se dibujan las iniciales del nombre sobre un tono del tema que sale
 * del propio nombre (cada cooperativa conserva siempre el mismo).
 *
 * Tamaños: `sm` junto a un texto (24), `md` en una fila (44, como `IconTile`),
 * `lg` en una tarjeta (56) y `xl` en la portada de su detalle (92).
 *
 * Accesible como imagen ("Logo de …"). Si el nombre ya se lee al lado, `decorativo`
 * lo oculta al lector de pantalla para no repetirlo.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useReducedMotion } from 'react-native-reanimated';
import { Text } from '@/src/components/ui';
import { supabase } from '@/src/utils/supabase';
import { Colors, Motion, Radius, Sizes, type FontSizeToken } from '@/src/theme';

export type LogoCooperativaSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoCooperativaProps {
  nombre: string | null | undefined;
  /** `cooperativas.logo_url`: URL pública (o la ruta dentro del bucket) */
  logoUrl?: string | null;
  size?: LogoCooperativaSize;
  /** El nombre ya está al lado: el lector de pantalla no lo repite. */
  decorativo?: boolean;
  style?: ViewStyle;
}

const BUCKET_LOGOS = 'logos-cooperativas';

const MEDIDAS: Record<LogoCooperativaSize, { lado: number; radio: number; letra: FontSizeToken }> = {
  sm: { lado: Sizes.icon.lg, radio: Radius.xs, letra: 'micro' },
  md: { lado: Sizes.tile.md, radio: Radius.md, letra: 'sm' },
  lg: { lado: Sizes.tile.lg, radio: Radius.md, letra: 'lg' },
  xl: { lado: Sizes.avatar.lg, radio: Radius.xl, letra: '2xl' },
};

/** Tonos de las iniciales: cielo, sol y noche (el coral es de las encomiendas). */
const TONOS = [
  { fondo: Colors.accentLight, texto: Colors.accentStrong },
  { fondo: Colors.primarySoft, texto: Colors.primaryText },
  { fondo: Colors.night, texto: Colors.white },
] as const;

/** Palabras que no dan inicial: "Cooperativa de Transporte Expresos Los Llanos" → "EL". */
const SIN_INICIAL = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en',
  'cooperativa', 'coop', 'asociacion', 'asociación', 'asoc', 'union', 'unión',
  'transporte', 'transportes', 'linea', 'línea', 'lineas', 'líneas',
  'ca', 'c.a.', 'c.a', 'sa', 's.a.', 's.a', 'ac', 'a.c.', 'rl', 'r.l.', 'r.l',
]);

/** Dos letras del nombre: "Expresos Mérida" → "EM", "Aeroexpresos" → "AE". */
export function inicialesCooperativa(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '')
    .split(/[\s\-–—/,]+/)
    // Sin `\p{L}`: no todas las versiones de Hermes lo entienden.
    .map((p) => p.replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/, ''))
    .filter(Boolean);
  if (palabras.length === 0) return '';
  const utiles = palabras.filter((p) => !SIN_INICIAL.has(p.toLowerCase()));
  const base = utiles.length > 0 ? utiles : palabras;
  const letras =
    base.length === 1 ? Array.from(base[0]).slice(0, 2).join('') : base.slice(0, 2).map((p) => Array.from(p)[0]).join('');
  return letras.toUpperCase();
}

function tonoDe(nombre: string): (typeof TONOS)[number] {
  let suma = 0;
  for (let i = 0; i < nombre.length; i++) suma = (suma + nombre.charCodeAt(i) * (i + 1)) % 9973;
  return TONOS[suma % TONOS.length];
}

/** URL pública del logo; las filas viejas pueden guardar solo la ruta en el bucket. */
export function urlLogoCooperativa(logoUrl: string | null | undefined): string | null {
  const v = (logoUrl ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const ruta = v.replace(/^\/+/, '').replace(new RegExp(`^${BUCKET_LOGOS}/`), '');
  return supabase.storage.from(BUCKET_LOGOS).getPublicUrl(ruta).data.publicUrl || null;
}

export const LogoCooperativa = memo(function LogoCooperativa({
  nombre,
  logoUrl,
  size = 'md',
  decorativo = false,
  style,
}: LogoCooperativaProps) {
  const reduceMotion = useReducedMotion();
  const uri = urlLogoCooperativa(logoUrl);
  const [fallo, setFallo] = useState(false);

  // Otra URL (el panel subió un logo nuevo, o la fila se recicló en una lista).
  useEffect(() => {
    setFallo(false);
  }, [uri]);

  const nombreLimpio = (nombre ?? '').trim() || 'Cooperativa';
  const medida = MEDIDAS[size];
  const conImagen = !!uri && !fallo;
  const tono = tonoDe(nombreLimpio);

  const caja: ViewStyle = {
    width: medida.lado,
    height: medida.lado,
    borderRadius: medida.radio,
    backgroundColor: conImagen ? Colors.card : tono.fondo,
  };

  return (
    <View
      style={[s.caja, conImagen ? s.conImagen : null, caja, style]}
      accessible={!decorativo}
      accessibilityRole={decorativo ? undefined : 'image'}
      accessibilityLabel={decorativo ? undefined : `Logo de ${nombreLimpio}`}
      accessibilityElementsHidden={decorativo}
      importantForAccessibility={decorativo ? 'no-hide-descendants' : 'yes'}
    >
      {conImagen ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={reduceMotion ? 0 : Motion.duration.fast}
          onError={() => setFallo(true)}
          accessible={false}
        />
      ) : (
        <Text
          size={medida.letra}
          weight="semibold"
          color={tono.texto}
          compact
          numberOfLines={1}
          adjustsFontSizeToFit
          allowFontScaling={false}
        >
          {inicialesCooperativa(nombreLimpio)}
        </Text>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  caja: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  // Muchos logos traen fondo blanco: una línea fina los separa de la tarjeta blanca.
  conImagen: {
    borderWidth: Sizes.hairline,
    borderColor: Colors.border,
  },
});
