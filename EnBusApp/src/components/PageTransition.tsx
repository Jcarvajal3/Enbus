import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * PageTransition — antes animaba la entrada de las pantallas empujadas.
 *
 * @deprecated D25 (AN-11): la pila ya anima con `slide_from_right`; dos
 * movimientos en ejes cruzados sobraban. Ahora solo envuelve su contenido (sin
 * animación); las pantallas lo quitan en la oleada 2 y la integración lo borra.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <View style={s.flex}>{children}</View>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
});
