import s from "./mapa-asientos.module.css";

/**
 * Mini mapa de asientos para las maquetas (decorativo). 4 asientos por fila con pasillo.
 * Los números de asiento van de 1 en adelante, fila por fila.
 */
export function MapaAsientos({
  filas = 4,
  ocupados = [],
  elegido,
  compacto = false,
}: {
  filas?: number;
  ocupados?: number[];
  elegido?: number;
  compacto?: boolean;
}) {
  const celdas = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < 5; c++) {
      if (c === 2) {
        celdas.push(<span key={`p${f}`} aria-hidden />);
        continue;
      }
      const n = f * 4 + (c < 2 ? c : c - 1) + 1;
      const clase = n === elegido ? s.elegido : ocupados.includes(n) ? s.ocupado : s.libre;
      celdas.push(
        <span key={n} className={`${s.asiento} ${clase}`}>
          {n === elegido ? n : ""}
        </span>
      );
    }
  }
  return (
    <div className={`${s.mapa} ${compacto ? s.compacto : ""}`} aria-hidden>
      {celdas}
    </div>
  );
}
