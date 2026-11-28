import s from "./viajes.module.css";
import c from "./cargando.module.css";

/** Esqueleto mientras llegan las salidas (la búsqueda es dinámica). */
export default function CargandoViajes() {
  return (
    <>
      <section className={s.banda} aria-hidden>
        <div className={`s-marco ${s.bandaInterior}`}>
          <div className={c.tituloFalso} />
          <div className={c.buscadorFalso} />
        </div>
      </section>
      <div className={`s-marco ${s.cuerpo}`} role="status" aria-live="polite">
        <span className="sr-only">Buscando salidas…</span>
        <div className={c.tira} aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={c.dia} />
          ))}
        </div>
        <div className={c.lista} aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={c.tarjeta} />
          ))}
        </div>
      </div>
    </>
  );
}
