import s from "@/components/pasajero/compra-boleto/compra.module.css";

/** Esqueleto mientras se leen la sesión, la salida y las formas de pago. */
export default function CargandoCompra() {
  return (
    <div className={`s-marco ${s.pagina}`}>
      <div role="status" aria-live="polite" className={s.contenido}>
        <span className="sr-only">Preparando tu compra…</span>
        <div className={`${s.esqueleto} ${s.esqueletoTitulo}`} aria-hidden />
        <div className={`${s.esqueleto} ${s.esqueletoResumen}`} aria-hidden />
        <div className={`${s.esqueleto} ${s.esqueletoMapa}`} aria-hidden />
      </div>
    </div>
  );
}
