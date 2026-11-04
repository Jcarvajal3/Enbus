/**
 * Atmosfera — el cielo de EnBus: gradientes detrás del contenido.
 *
 * Es la firma visual de la app: la portada de Inicio y de acceso (`amanecer`), un
 * velo tenue en las demás pantallas (`suave`, y `calida` en encomiendas), la cabecera
 * del pase (`sol`) y la superficie noche con el sol asomando (`noche`) para lo que
 * debe mandar en la pantalla, como un monto.
 *
 * El azul y el amarillo nunca se superponen con transparencia: mezclados dan oliva.
 * Van en una sola diagonal que pasa por un tono casi blanco, como el cielo real. Las
 * manchas solo aportan calor, y al final todo se funde con `canvas`, sin cortes.
 *
 * Con SVG, sin imágenes: nítido en cualquier pantalla y sin peso en el bundle.
 *
 *   <Atmosfera variante="amanecer" style={StyleSheet.absoluteFill} />
 */
import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Cielo } from '@/src/theme';

export type AtmosferaVariante = 'amanecer' | 'suave' | 'calida' | 'noche' | 'sol';

/** Tramo de gradiente: [posición, color, opacidad] */
type Tramo = readonly [number, string, number];

interface Mancha {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  tramos: readonly Tramo[];
}

interface Receta {
  /** Diagonal de la arista superior izquierda hacia la derecha */
  base: readonly Tramo[];
  /** Hasta dónde llega la diagonal en vertical: 0 = horizontal, 1 = esquina a esquina */
  inclinacion: number;
  manchas: readonly Mancha[];
  /** Dónde empieza a fundirse con `canvas` (fracción de la altura). `null`: sin fundido. */
  fundido: number | null;
}

const sol = (fuerza: number): readonly Tramo[] => [
  [0, Cielo.solClaro, fuerza],
  [0.5, Cielo.sol, fuerza * 0.35],
  [1, Cielo.sol, 0],
];

const rubor = (fuerza: number): readonly Tramo[] => [
  [0, Cielo.coralClaro, fuerza],
  [1, Cielo.coralClaro, 0],
];

const RECETAS: Record<AtmosferaVariante, Receta> = {
  // Cielo arriba a la izquierda, sol entrando por la derecha, rubor en el horizonte.
  amanecer: {
    base: [
      [0, Cielo.azul, 1],
      [0.42, Cielo.horizonte, 1],
      [0.72, Cielo.alba, 1],
      [1, Cielo.solClaro, 1],
    ],
    inclinacion: 0.55,
    manchas: [
      { cx: '100%', cy: '12%', rx: '60%', ry: '26%', tramos: sol(0.85) },
      { cx: '60%', cy: '58%', rx: '60%', ry: '16%', tramos: rubor(0.16) },
    ],
    fundido: 0.5,
  },
  suave: {
    base: [
      [0, Cielo.horizonte, 0.85],
      [0.6, Cielo.albaBlanca, 0.9],
      [1, Cielo.alba, 1],
    ],
    inclinacion: 0.35,
    manchas: [],
    fundido: 0.15,
  },
  calida: {
    base: [
      [0, Cielo.rubor, 1],
      [0.6, Cielo.albaBlanca, 0.9],
      [1, Cielo.alba, 1],
    ],
    inclinacion: 0.35,
    manchas: [],
    fundido: 0.15,
  },
  // Superficie oscura con el sol asomando por una esquina: amarillo → coral → noche.
  noche: {
    base: [
      [0, Cielo.noche, 1],
      [0.6, Cielo.nocheAlta, 1],
      [1, Cielo.nocheAzul, 1],
    ],
    inclinacion: 0.5,
    manchas: [
      {
        cx: '104%',
        cy: '-6%',
        rx: '58%',
        ry: '74%',
        tramos: [
          [0, Cielo.sol, 0.95],
          [0.34, Cielo.coral, 0.5],
          [0.7, Cielo.coral, 0.1],
          [1, Cielo.coral, 0],
        ],
      },
    ],
    fundido: null,
  },
  // Cabecera del pase: cielo pleno, para texto tinta.
  sol: {
    base: [
      [0, Cielo.horizonte, 1],
      [0.5, Cielo.albaBlanca, 1],
      [0.82, Cielo.alba, 1],
      [1, Cielo.solClaro, 1],
    ],
    inclinacion: 0.4,
    manchas: [{ cx: '100%', cy: '0%', rx: '46%', ry: '90%', tramos: sol(0.7) }],
    fundido: null,
  },
};

export function Atmosfera({
  variante = 'suave',
  style,
}: {
  variante?: AtmosferaVariante;
  style?: StyleProp<ViewStyle>;
}) {
  // Los `id` de SVG son globales en web: cada instancia lleva los suyos.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const receta = RECETAS[variante];

  return (
    <View style={[s.lienzo, style]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`${uid}base`} x1="0" y1="0" x2="1" y2={receta.inclinacion}>
            {receta.base.map(([posicion, color, fuerza]) => (
              <Stop key={posicion} offset={posicion} stopColor={color} stopOpacity={fuerza} />
            ))}
          </LinearGradient>
          {receta.manchas.map((m, i) => (
            <RadialGradient key={i} id={`${uid}m${i}`} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} fx={m.cx} fy={m.cy}>
              {m.tramos.map(([posicion, color, fuerza]) => (
                <Stop key={posicion} offset={posicion} stopColor={color} stopOpacity={fuerza} />
              ))}
            </RadialGradient>
          ))}
          {receta.fundido !== null ? (
            <LinearGradient id={`${uid}fin`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset={receta.fundido} stopColor={Cielo.fondo} stopOpacity={0} />
              <Stop offset={1} stopColor={Cielo.fondo} stopOpacity={1} />
            </LinearGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${uid}base)`} />
        {receta.manchas.map((_, i) => (
          <Rect key={i} x={0} y={0} width={100} height={100} fill={`url(#${uid}m${i})`} />
        ))}
        {receta.fundido !== null ? (
          <Rect x={0} y={0} width={100} height={100} fill={`url(#${uid}fin)`} />
        ) : null}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  lienzo: {
    overflow: 'hidden',
  },
});
