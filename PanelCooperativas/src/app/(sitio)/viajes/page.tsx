import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarX, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { Buscador } from "@/components/pasajero/busqueda/buscador";
import { EditorBusqueda } from "@/components/pasajero/busqueda/editor-busqueda";
import { FiltrosViajes, type OpcionCooperativa } from "@/components/pasajero/busqueda/filtros-viajes";
import { TarjetaRuta } from "@/components/pasajero/busqueda/tarjeta-ruta";
import { TarjetaViaje } from "@/components/pasajero/busqueda/tarjeta-viaje";
import {
  aplicarFiltros,
  franjaDe,
  leerParametros,
  ORDENES,
  ordenarViajes,
  textoSalidas,
  urlBusqueda,
  type Franja,
} from "@/components/pasajero/busqueda/utilidades";
import { fechaTasaCorta, formatNumeroVE } from "@/lib/dinero.generated";
import { buscarViajes, ciudadesConSalidas, diasConSalidas, tasaVigente } from "@/lib/pasajero/viajes";
import { rutasPopulares } from "@/lib/sitio/consultas";
import { sitioUrl } from "@/lib/sitio/urls";
import { formatCiudad, formatDiaVE, hoyVE, sumarDiasVE } from "@/lib/ve.generated";
import s from "./viajes.module.css";

type Params = Promise<Record<string, string | string[] | undefined>>;

/** Primer día para buscar fechas cercanas (estados vacíos): una semana antes, sin bajar de hoy. */
function desdeCercanas(fecha: string): string {
  const desde = sumarDiasVE(fecha, -7);
  return desde < hoyVE() ? hoyVE() : desde;
}

function hayRuta(p: { origen: string; destino: string }) {
  return Boolean(p.origen && p.destino && p.origen !== p.destino);
}

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const p = leerParametros(await searchParams);
  if (!hayRuta(p)) {
    return {
      title: "Buscar pasajes de bus",
      description: "Busca salidas de bus por ciudad y fecha, compara cooperativas y elige tu asiento.",
    };
  }
  const origen = formatCiudad(p.origen);
  const destino = formatCiudad(p.destino);
  return {
    title: `Pasajes de ${origen} a ${destino}`,
    description: `Salidas de bus de ${origen} a ${destino}: horarios, precios en bolívares y asientos disponibles. Elige tu asiento y paga a la tasa BCV del día.`,
    ...(sitioUrl() ? { alternates: { canonical: urlBusqueda({ origen: p.origen, destino: p.destino }) } } : {}),
  };
}

function ListaFechas({
  dias,
  base,
}: {
  dias: { fecha: string; salidas: number }[];
  base: Parameters<typeof urlBusqueda>[0];
}) {
  return (
    <ul className={s.fechas}>
      {dias.map((d) => (
        <li key={d.fecha}>
          <Link href={urlBusqueda({ ...base, fecha: d.fecha })} className={s.fecha}>
            <strong className="s-num">{formatDiaVE(d.fecha)}</strong>
            <span>{textoSalidas(d.salidas)}</span>
            <ArrowRight aria-hidden weight="bold" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Viajes({ searchParams }: { searchParams: Params }) {
  const p = leerParametros(await searchParams);
  const [ciudades, tasa] = await Promise.all([ciudadesConSalidas(), tasaVigente()]);

  // Sin una ruta válida: el buscador y las rutas más usadas.
  if (!hayRuta(p)) {
    const populares = await rutasPopulares(6);
    return (
      <>
        <section className={s.banda} aria-labelledby="viajes-titulo">
          <div className={`s-marco ${s.bandaInterior}`}>
            <div>
              <h1 id="viajes-titulo" className={s.titulo}>
                Busca tu pasaje
              </h1>
              <p className={s.sub}>Elige de dónde sales, a dónde vas y cuándo. Compara cooperativas y escoge tu asiento.</p>
            </div>
            <Buscador ciudades={ciudades} modo="hero" inicial={{ origen: p.origen, destino: p.destino, fecha: p.fecha }} />
          </div>
        </section>
        {populares.length > 0 && (
          <section className={`s-marco ${s.cuerpo}`} aria-labelledby="viajes-populares">
            <h2 id="viajes-populares" className={s.subtitulo}>
              Rutas populares
            </h2>
            <ul className={s.rutas}>
              {populares.map((r) => (
                <li key={`${r.ciudad_origen}-${r.ciudad_destino}`}>
                  <TarjetaRuta ruta={r} tasa={tasa} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  const origenTxt = formatCiudad(p.origen);
  const destinoTxt = formatCiudad(p.destino);
  const [delDia, dias] = await Promise.all([
    buscarViajes({ origen: p.origen, destino: p.destino, fecha: p.fecha }),
    diasConSalidas({ origen: p.origen, destino: p.destino, desde: desdeCercanas(p.fecha), dias: 40 }),
  ]);

  const visibles = ordenarViajes(aplicarFiltros(delDia, p), p.orden);

  // Opciones de filtro a partir del día completo (no del filtrado).
  const porCoop = new Map<string, OpcionCooperativa>();
  const porFranja: Record<Franja, number> = { madrugada: 0, manana: 0, tarde: 0, noche: 0 };
  for (const v of delDia) {
    const c = porCoop.get(v.cooperativa.id);
    if (c) c.salidas += 1;
    else porCoop.set(v.cooperativa.id, { id: v.cooperativa.id, nombre: v.cooperativa.nombre, salidas: 1 });
    porFranja[franjaDe(v.salida)] += 1;
  }
  const cooperativas = [...porCoop.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const proximasFechas = dias.filter((d) => d.fecha > p.fecha).slice(0, 6);
  const anteriores = dias.filter((d) => d.fecha < p.fecha && d.fecha >= hoyVE()).slice(0, 6);
  const hayFiltros = p.cooperativas.length > 0 || p.franjas.length > 0;
  const rutaSinSalidas = dias.length === 0;
  const otrosDestinos = (ciudades.destinosPorOrigen[p.origen] ?? []).filter((d) => d !== p.destino).slice(0, 8);

  return (
    <>
      <section className={s.banda} aria-labelledby="viajes-titulo">
        <div className="s-marco">
          <EditorBusqueda
            titulo={
              <>
                <h1 id="viajes-titulo" className={s.titulo}>
                  {origenTxt} <span aria-hidden>→</span>
                  <span className="sr-only"> a </span> {destinoTxt}
                </h1>
              </>
            }
          >
            <Buscador
              key={`${p.origen}|${p.destino}|${p.fecha}`}
              ciudades={ciudades}
              modo="compacto"
              inicial={{ origen: p.origen, destino: p.destino, fecha: p.fecha }}
            />
          </EditorBusqueda>
        </div>
      </section>

      <div className={`s-marco ${s.cuerpo}`}>
        {delDia.length > 0 ? (
          <>
            <div className={s.herramientas}>
              <FiltrosViajes busqueda={p} cooperativas={cooperativas} porFranja={porFranja} />
              <nav aria-label="Ordenar salidas" className={s.orden}>
                <span className="sr-only">Ordenar por:</span>
                {ORDENES.map((o) => (
                  <Link
                    key={o.id}
                    href={urlBusqueda({ ...p, orden: o.id })}
                    className={s.pildora}
                    aria-current={p.orden === o.id ? "true" : undefined}
                    replace
                    scroll={false}
                  >
                    {o.etiqueta}
                  </Link>
                ))}
              </nav>
            </div>

            <div className={s.principal}>
              <p className={s.conteo} role="status" aria-live="polite">
                <strong className="s-num">{textoSalidas(visibles.length)}</strong>
                {hayFiltros && <span className="s-num"> de {delDia.length}</span>}
                <span> · {formatDiaVE(p.fecha)}</span>
              </p>

              {visibles.length > 0 ? (
                <ol className={s.lista}>
                  {visibles.map((v) => (
                    <li key={v.id}>
                      <TarjetaViaje viaje={v} tasa={tasa} />
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={s.vacio}>
                  <span className="s-icono s-icono--sol" aria-hidden>
                    <MagnifyingGlass />
                  </span>
                  <h2>Ninguna salida coincide con tus filtros</h2>
                  <p>Hay {textoSalidas(delDia.length)} ese día. Quita algún filtro para verlas.</p>
                  <Link
                    href={urlBusqueda({ ...p, cooperativas: [], franjas: [] })}
                    className="s-boton s-boton--tinta"
                    replace
                    scroll={false}
                  >
                    Quitar filtros
                  </Link>
                </div>
              )}

              <p className={s.nota}>
                {tasa
                  ? `Precios en bolívares a la tasa BCV del ${fechaTasaCorta(tasa.fecha)} (Bs ${formatNumeroVE(tasa.tasa)} por dólar). `
                  : "Pagas en bolívares a la tasa oficial del BCV del día. "}
                Ves el monto exacto antes de confirmar. Horarios de Venezuela.
              </p>
            </div>
          </>
        ) : (
          <div className={s.vacio}>
            <span className="s-icono s-icono--sol" aria-hidden>
              <CalendarX />
            </span>
            <h2>
              {rutaSinSalidas
                ? `No hay salidas de ${origenTxt} a ${destinoTxt} por ahora`
                : `No hay salidas ese día de ${origenTxt} a ${destinoTxt}`}
            </h2>
            {proximasFechas.length > 0 ? (
              <>
                <p>Estas son las próximas fechas con salidas:</p>
                <ListaFechas dias={proximasFechas} base={p} />
              </>
            ) : anteriores.length > 0 ? (
              <>
                <p>Antes de esa fecha sí hay salidas:</p>
                <ListaFechas dias={anteriores} base={p} />
              </>
            ) : (
              <p>Las cooperativas publican sus salidas con anticipación. Vuelve pronto o prueba con otra ruta.</p>
            )}
            {otrosDestinos.length > 0 && (
              <>
                <p className={s.otrosTitulo}>Otros destinos desde {origenTxt}:</p>
                <ul className={s.chips}>
                  {otrosDestinos.map((d) => (
                    <li key={d}>
                      <Link
                        href={urlBusqueda({ origen: p.origen, destino: d, fecha: p.fecha })}
                        className={`s-chip s-chip--cielo ${s.chipEnlace}`}
                      >
                        {formatCiudad(d)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
