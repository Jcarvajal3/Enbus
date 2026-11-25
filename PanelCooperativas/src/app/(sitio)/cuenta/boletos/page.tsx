import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "@phosphor-icons/react/dist/ssr";
import { EstadoChip, EstadoVacio, ErrorCarga, Pestanas } from "@/components/pasajero/cuenta/piezas";
import { ReservaContador } from "@/components/pasajero/cuenta/reserva-contador";
import { ahoraMs, aMs, ordenarAsientos, textoRuta, unirAsientos } from "@/components/pasajero/cuenta/formato";
import { SELECT_BOLETOS_LISTA, uno, type BoletoLista } from "@/components/pasajero/cuenta/tipos";
import estilos from "@/components/pasajero/cuenta/cuenta-ui.module.css";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatDiaHoraVE } from "@/lib/fechas";
import { boletoEsVigente, estadoBoleto, estadoUiBoleto, reservaPuedeVencer } from "@/lib/pasajero/estados";
import { RUTAS_PASAJERO, urlBoleto } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis boletos" };

type Vista = "proximos" | "historial";

const salidaDe = (b: BoletoLista) => uno(b.viajes)?.fecha_hora_salida ?? null;

/** Agrupa los asientos de una misma compra; sin compra, cada boleto va solo. */
function agrupar(boletos: BoletoLista[]): BoletoLista[][] {
  const grupos = new Map<string, BoletoLista[]>();
  for (const b of boletos) {
    const clave = b.compra_id ?? b.id;
    grupos.set(clave, [...(grupos.get(clave) ?? []), b]);
  }
  const asiento = (b: BoletoLista) => b.asiento ?? "";
  return [...grupos.values()].map((g) =>
    g.sort((a, b) => asiento(a).length - asiento(b).length || asiento(a).localeCompare(asiento(b), "es", { numeric: true }))
  );
}

export default async function MisBoletosPage({ searchParams }: { searchParams: Promise<{ vista?: string | string[] }> }) {
  const pasajero = await exigirPasajero(RUTAS_PASAJERO.misBoletos);
  const { vista: crudo } = await searchParams;
  const vista: Vista = (Array.isArray(crudo) ? crudo[0] : crudo) === "historial" ? "historial" : "proximos";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boletos")
    .select(SELECT_BOLETOS_LISTA)
    .eq("comprador_id", pasajero.id)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<BoletoLista[]>();

  const hrefVista = (v: Vista) => (v === "proximos" ? RUTAS_PASAJERO.misBoletos : `${RUTAS_PASAJERO.misBoletos}?vista=${v}`);

  if (error) {
    console.error("[mis-boletos] No se pudieron leer los boletos:", error.code, error.message);
    return (
      <div className={estilos.pagina}>
        <header className={estilos.cabecera}>
          <h1>Mis boletos</h1>
        </header>
        <ErrorCarga href={hrefVista(vista)} que="tus boletos" />
      </div>
    );
  }

  const todos = data ?? [];
  const proximos = todos.filter((b) => boletoEsVigente(b));
  const historial = todos.filter((b) => !boletoEsVigente(b));
  const lista = vista === "proximos" ? proximos : historial;
  const ahora = ahoraMs();

  // Próximos: la salida más cercana primero. Historial: lo más reciente primero.
  const ordenados = [...lista].sort((a, b) => {
    const sa = aMs(salidaDe(a));
    const sb = aMs(salidaDe(b));
    if (sa !== null && sb !== null && sa !== sb) return vista === "proximos" ? sa - sb : sb - sa;
    if (sa === null && sb !== null) return 1;
    if (sa !== null && sb === null) return -1;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
  const grupos = agrupar(ordenados);

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecera}>
        <div>
          <h1>Mis boletos</h1>
          <p>Tus pases de abordaje y reservas.</p>
        </div>
        <Link href="/" className="s-boton s-boton--sol s-boton--sm">
          Buscar pasajes
        </Link>
      </header>

      <Pestanas
        etiqueta="Mis boletos"
        activa={vista}
        items={[
          { clave: "proximos", texto: "Próximos", href: hrefVista("proximos"), cantidad: proximos.length },
          { clave: "historial", texto: "Historial", href: hrefVista("historial") },
        ]}
      />

      {grupos.length === 0 ? (
        vista === "proximos" ? (
          <EstadoVacio
            icono={<Ticket size={28} />}
            titulo="No tienes viajes próximos"
            acciones={
              <Link href="/" className="s-boton s-boton--sol">
                Buscar pasajes
              </Link>
            }
          >
            Cuando reserves o compres un pasaje, aparecerá aquí con su código QR.
          </EstadoVacio>
        ) : (
          <EstadoVacio icono={<Ticket size={28} />} titulo="Aún no tienes historial">
            Tus viajes realizados, cancelados o vencidos aparecerán aquí.
          </EstadoVacio>
        )
      ) : (
        <ul className={estilos.lista}>
          {grupos.map((grupo) => (
            <li key={grupo[0].compra_id ?? grupo[0].id}>
              <TarjetaCompra grupo={grupo} ahora={ahora} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaCompra({ grupo, ahora }: { grupo: BoletoLista[]; ahora: number }) {
  const primero = grupo[0];
  const viaje = uno(primero.viajes);
  const ruta = uno(viaje?.rutas);
  const cooperativa = uno(primero.cooperativas)?.nombre ?? "Cooperativa";
  const salida = viaje?.fecha_hora_salida ?? null;
  const asientos = ordenarAsientos(grupo.map((b) => b.asiento));

  // Cuenta regresiva: la reserva que antes vence (solo corre sin pago o con el pago rechazado).
  const vencimientos = grupo
    .filter((b) => reservaPuedeVencer(estadoUiBoleto(b)) && b.reserva_expira_at && Date.parse(b.reserva_expira_at) > ahora)
    .map((b) => b.reserva_expira_at as string)
    .sort();

  return (
    <article className={estilos.pase} aria-label={`${textoRuta(ruta)}${asientos.length ? `, ${grupo.length > 1 ? "asientos" : "asiento"} ${unirAsientos(asientos)}` : ""}`}>
      <div className={estilos.paseCab}>
        <p className={estilos.paseCoop}>
          <span>{cooperativa}</span>
          {grupo.length > 1 && <span>{grupo.length} asientos</span>}
        </p>
        <h2 className={estilos.paseRuta}>{textoRuta(ruta)}</h2>
        <p className={estilos.paseFecha}>{salida ? formatDiaHoraVE(salida) : "Salida por confirmar"}</p>
      </div>
      {vencimientos[0] && <ReservaContador expiraAt={vencimientos[0]} ahoraMs={ahora} variante="mini" />}
      <div className={estilos.perfora} aria-hidden />
      <ul className={estilos.filas}>
        {grupo.map((b) => {
          const estado = estadoBoleto(b);
          return (
            <li key={b.id}>
              <Link href={urlBoleto(b.id)} className={estilos.fila}>
                <span className={estilos.filaTexto}>
                  <span className={estilos.filaTitulo}>
                    {b.asiento ? `Asiento ${b.asiento}` : "Boleto"}
                    {b.pasajero_nombre ? ` · ${b.pasajero_nombre}` : ""}
                  </span>
                  <span className={`${estilos.filaSub} ${estilos.codigo}`}>{formatCodigoBoleto(b.codigo_boleto)}</span>
                </span>
                <span className={estilos.filaFin}>
                  <EstadoChip estado={estado} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
