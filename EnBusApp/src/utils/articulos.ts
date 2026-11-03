/**
 * Qué no se puede enviar por encomienda (#31, M-44).
 *
 * Lista referencial que se muestra en "Nueva encomienda" antes de generar el
 * código. Cada cooperativa puede tener reglas adicionales: la taquilla tiene la
 * última palabra al recibir el paquete. Pendiente de confirmar con negocio
 * (paso manual 9 de `Audits/fase3_spec.md`).
 */

export interface ArticuloProhibido {
  /** Nombre corto para la lista */
  nombre: string;
  /** Por qué no se acepta, en una frase */
  detalle: string;
}

export const ARTICULOS_PROHIBIDOS: readonly ArticuloProhibido[] = [
  {
    nombre: 'Dinero en efectivo y joyas',
    detalle: 'Billetes, monedas, oro y objetos de valor que no se pueden asegurar.',
  },
  {
    nombre: 'Armas y municiones',
    detalle: 'Incluye réplicas, partes de armas y armas blancas.',
  },
  {
    nombre: 'Drogas o medicinas controladas',
    detalle: 'Sustancias ilícitas y medicamentos que requieren récipe especial.',
  },
  {
    nombre: 'Líquidos inflamables o explosivos',
    detalle: 'Gasolina, gas, pinturas con solvente, fuegos artificiales y aerosoles.',
  },
  {
    nombre: 'Animales vivos',
    detalle: 'Ninguna mascota ni animal, aunque vaya en jaula.',
  },
  {
    nombre: 'Alimentos perecederos',
    detalle: 'Carne, pescado, lácteos y comida que se daña sin refrigeración.',
  },
];

export const NOTA_ARTICULOS_PROHIBIDOS =
  'Lista referencial: cada cooperativa puede tener reglas adicionales.';
